"use strict";
const { app, BrowserWindow, session } = require('electron');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const QRCode = require('qrcode');

const HOST = '127.0.0.1';
const REMOTE_CONFIG = process.env.CUKI_DISPLAY_CONFIG_URL ||
  'https://raw.githubusercontent.com/clcedrikvrolijk-lgtm/cuki-ai-menu-update/main/display-content.json';
const qrFile = path.join(__dirname, 'media', 'payaw-original-qr.png');
const POS_DEFAULT = 'https://cuki-pos.onrender.com';
let recentPosCatalog = null;
let recentPosDisplay = null;
const photos = new Map();
const displayMediaCache = new Map();
let playerState = { current_item_key: null, current_type: null, current_screen: "menu" };
let heartbeatTimer = null;
const deviceFile = () => path.join(app.getPath('userData'), 'display-device.json');
function posBaseUrl() {
  const local = safeReadJSON(path.join(__dirname,'pos-settings.json'));
  const base = process.env.CUKI_POS_URL || local?.base_url || POS_DEFAULT;
  const parsed = new URL(base);
  if(parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['127.0.0.1','localhost'].includes(parsed.hostname)))
    throw new Error('CUKI POS URL must use HTTPS');
  return parsed.origin;
}
async function posFetch(relativePath, timeoutMs=8000, options={}) {
  const controller = new AbortController();
  const deadline = setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const r = await fetch(posBaseUrl()+relativePath,{...options,signal:controller.signal,cache:'no-store',
      headers:{'Accept':'application/json, image/*','User-Agent':'CUKI-Display/1.3.6',...(options.headers||{})}});
    if(!r.ok) throw new Error('CUKI POS HTTP '+r.status+' for '+relativePath);
    return r;
  }finally{clearTimeout(deadline)}
}
async function posCatalog() {
  try{
    const response=await posFetch('/api/menu/catalog',8000);
    const data=await response.json();
    if(!Array.isArray(data.products))throw new Error('POS response has no product list');
    const products=data.products.filter(p=>Number.isInteger(p.id)&&typeof p.name==='string'&&typeof p.price_minor==='number');
    recentPosCatalog={business_name:data.business_name||'CUKI Company',currency:data.currency||'AWG',week_start:data.week_start||null,week_end:data.week_end||null,menu_status:data.menu_status||'unknown',products};
    return {...recentPosCatalog,_source:'live'};
  }catch(error){
    if(recentPosCatalog) return {...recentPosCatalog,_source:'saved',_warning:error.message};
    throw error;
  }
}
async function posDisplay() {
  try {
    const response = await posFetch('/api/menu/display', 8000);
    const data = await response.json();
    if (!Array.isArray(data.items)) throw new Error('POS display response has no playlist');
    recentPosDisplay = data;
    return { ...data, device_paired: !!safeReadJSON(deviceFile())?.device_token, _source: 'live' };
  } catch (error) {
    if (recentPosDisplay) return { ...recentPosDisplay, device_paired: !!safeReadJSON(deviceFile())?.device_token, _source: 'saved', _warning: error.message };
    throw error;
  }
}
async function pairDisplay(code) {
  const response = await posFetch('/api/menu/display/pair', 10000, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, device_name: 'CUKI Surface Pro' })
  });
  const data = await response.json();
  if (!data.device_token) throw new Error('POS did not return a display token');
  fs.mkdirSync(path.dirname(deviceFile()), { recursive: true });
  fs.writeFileSync(deviceFile() + '.tmp', JSON.stringify(data), 'utf8');
  fs.renameSync(deviceFile() + '.tmp', deviceFile());
  await sendDisplayHeartbeat();
  return { paired: true, device_name: data.device_name };
}
async function sendDisplayHeartbeat() {
  const device = safeReadJSON(deviceFile());
  if (!device?.device_token) return;
  try {
    await posFetch('/api/menu/display/heartbeat', 6000, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + device.device_token },
      body: JSON.stringify({ ...playerState, app_version: '1.3.6' })
    });
  } catch (error) {
    console.warn('CUKI display heartbeat failed:', error.message);
  }
}
async function displayMedia(res, id) {
  const key = String(id), saved = displayMediaCache.get(key);
  if (saved && Date.now() - saved.at < 60000) {
    res.writeHead(200, { 'Content-Type': saved.contentType, 'Content-Length': saved.data.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(saved.data); return;
  }
  try {
    const response = await posFetch('/api/menu/display/media/' + id, 20000);
    const ct = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!['image/png','image/jpeg','image/webp','video/mp4','video/webm'].includes(ct)) throw new Error('Unsupported display media type');
    const data = Buffer.from(await response.arrayBuffer());
    if (!data.length || data.length > 50 * 1024 * 1024) throw new Error('Display media is empty or too large');
    displayMediaCache.set(key, { data, contentType: ct, at: Date.now() });
    res.writeHead(200, { 'Content-Type': ct, 'Content-Length': data.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  } catch (error) {
    if (saved) {
      res.writeHead(200, { 'Content-Type': saved.contentType, 'Content-Length': saved.data.length, 'Cache-Control': 'no-store' });
      res.end(saved.data); return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    res.end('CUKI display media unavailable');
  }
}
function readJsonBody(req, maxBytes = 12000) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (Buffer.byteLength(body) > maxBytes) { reject(new Error('Request body too large')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

async function posReadyOrders() {
  const response = await posFetch('/api/kitchen/ready-display', 6000);
  const data = await response.json();
  if (!Array.isArray(data.orders)) throw new Error('POS ready-order response has no orders list');
  const orders = data.orders.filter(o => Number.isInteger(o.id) && typeof o.prepared_at === 'string');
  return { orders, _source: 'live' };
}

async function posPhoto(res,id){
  const key=String(id), saved=photos.get(key);
  if(saved && Date.now()-saved.at<45000){
    res.writeHead(200,{'Content-Type':saved.contentType,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(saved.data);return;
  }
  try{
    const response=await posFetch('/api/menu/products/'+id+'/image',8000);
    const ct=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
    if(!['image/png','image/jpeg','image/webp'].includes(ct))throw new Error('Unexpected image type');
    const length=Number(response.headers.get('content-length')||0);
    if(length>8*1024*1024)throw new Error('Image too large');
    const b=Buffer.from(await response.arrayBuffer());
    if(b.length>8*1024*1024)throw new Error('Image too large');
    photos.set(key,{data:b,contentType:ct,at:Date.now()});
    res.writeHead(200,{'Content-Type':ct,'Content-Length':b.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(b);
  }catch(error){
    if(saved){res.writeHead(200,{'Content-Type':saved.contentType,'Cache-Control':'no-store'});res.end(saved.data);return;}
    res.writeHead(404,{'Content-Type':'text/plain','Cache-Control':'no-store'});res.end('POS product photo unavailable');
  }
}

const streams = new Set();
let server, voiceProcess, window;
let isShuttingDown = false;

const mime = f => ({'.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg',
  '.jpeg':'image/jpeg','.webp':'image/webp','.wasm':'application/wasm',
  '.task':'application/octet-stream'})[path.extname(f).toLowerCase()] || 'application/octet-stream';
function serveFile(res, file) {
  fs.stat(file,(err,s)=>{
    if (err || !s.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {'Content-Type':mime(file),'Content-Length':s.size,
      'Cache-Control':file.endsWith('.wasm')||file.endsWith('.task')?'public, max-age=86400':'no-cache',
      'X-Content-Type-Options':'nosniff'});
    fs.createReadStream(file).pipe(res);
  });
}
function staticFile(p) {
  const direct = {'/':'index.html','/index.html':'index.html','/style.css':'style.css',
    '/renderer.mjs':'renderer.mjs','/display-content.json':'display-content.json'};
  if (direct[p]) return path.join(__dirname,direct[p]);
  if (/^\/media\/[\w.-]+\.(png|jpg|jpeg|webp)$/i.test(p)) return path.join(__dirname,p.slice(1));
  if (p === '/models/gesture_recognizer.task') return path.join(__dirname,'models','gesture_recognizer.task');
  if (p === '/vendor/vision_bundle.mjs') return path.join(__dirname,'node_modules','@mediapipe','tasks-vision','vision_bundle.mjs');
  if (p.startsWith('/vendor/wasm/')) {
    const b=path.basename(p);
    if (!/^[\w.-]+$/.test(b)) return null;
    return path.join(__dirname,'node_modules','@mediapipe','tasks-vision','wasm',b);
  }
  return null;
}
const cacheFile=()=>path.join(app.getPath('userData'),'display-cache.json');
function safeReadJSON(file) { try { return JSON.parse(fs.readFileSync(file,'utf8')); } catch { return null; } }
function isValidContent(obj) {
  return obj && typeof obj==='object' && obj.menu && typeof obj.menu==='object' &&
    obj.club && typeof obj.club==='object' && typeof obj.club.join_url==='string';
}
async function remoteContent() {
  const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),6500);
  try {
    const r=await fetch(REMOTE_CONFIG,{cache:'no-store',signal:controller.signal,headers:{'User-Agent':'CUKI-AI-Menu/1.2'}});
    if (!r.ok) throw new Error('Content source HTTP '+r.status);
    const content=await r.json();
    if (!isValidContent(content)) throw new Error('Invalid remote menu content');
    const file=cacheFile(); fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(file+'.tmp',JSON.stringify(content),'utf8');
    fs.renameSync(file+'.tmp',file);
    return {...content,_source:'remote'};
  } finally { clearTimeout(timeout); }
}
async function displayContent() {
  try { return await remoteContent(); }
  catch (e) {
    const cached=safeReadJSON(cacheFile()); if(isValidContent(cached))return {...cached,_source:'cache'};
    const fallback=safeReadJSON(path.join(__dirname,'display-content.json'));
    if(isValidContent(fallback))return {...fallback,_source:'bundled'};
    throw e;
  }
}
function pushVoice(event) {
  const message='data: '+JSON.stringify(event)+'\n\n';
  for(const response of [...streams]) { try { response.write(message); } catch { streams.delete(response); } }
}
const parseCommand = raw => {
  switch(raw.trim().toLowerCase()) {
    case 'hey cuki show payment': return 'payaw';
    case 'hey cuki show the club': return 'club';
    case 'hey cuki show the menu': return 'menu';
    default: return null;
  }
};
function launchSpeechListener() {
  if(process.platform!=='win32') { pushVoice({type:'status',state:'unsupported'}); return; }
  const script=path.join(__dirname,'speech-listener.ps1');
  if(!fs.existsSync(script)) return;
  try {
    voiceProcess=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive',
      '-ExecutionPolicy','Bypass','-File',script],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    let buffer='';
    voiceProcess.stdout.setEncoding('utf8');
    voiceProcess.stdout.on('data',chunk=>{
      buffer+=chunk;
      for(let i=buffer.indexOf('\n');i>=0;i=buffer.indexOf('\n')){
        const line=buffer.slice(0,i).trim(); buffer=buffer.slice(i+1);
        if(line==='READY'){pushVoice({type:'status',state:'ready'});continue;}
        if(line.startsWith('CMD:')){
          const command=parseCommand(line.slice(4));
          if(command) pushVoice({type:'command',command});
        } else if(line.startsWith('ERROR:')) {console.warn('Windows voice:',line.slice(6));pushVoice({type:'status',state:'unavailable'});}
      }
    });
    voiceProcess.stderr.on('data',buf=>console.warn('Windows voice stderr:',String(buf).trim().slice(0,280)));
    voiceProcess.on('error',e=>{console.warn('Speech listener error:',e.message);pushVoice({type:'status',state:'unavailable'});});
    voiceProcess.on('exit',()=>{voiceProcess=null;if(!isShuttingDown)pushVoice({type:'status',state:'unavailable'});});
  } catch(e){console.warn('Cannot start voice listener:',e.message);}
}
function handleServer() {
  server=http.createServer(async(req,res)=>{
    let pathname;
    try {pathname=new URL(req.url,'http://localhost').pathname;}
    catch{res.writeHead(400);res.end('Invalid request');return;}
    if (req.method === 'POST') {
      if (pathname === '/api/pos/pair') {
        try {
          const body = await readJsonBody(req);
          const result = await pairDisplay(String(body.code || '').trim());
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify(result));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ error: e.message }));
        }
        return;
      }
      if (pathname === '/api/pos/state') {
        try {
          const body = await readJsonBody(req);
          playerState = {
            current_item_key: typeof body.current_item_key === 'string' ? body.current_item_key.slice(0, 64) : null,
            current_type: typeof body.current_type === 'string' ? body.current_type.slice(0, 20) : null,
            current_screen: typeof body.current_screen === 'string' ? body.current_screen.slice(0, 30) : null
          };
          sendDisplayHeartbeat();
          res.writeHead(204); res.end();
        } catch (e) { res.writeHead(400); res.end('Invalid player state'); }
        return;
      }
      res.writeHead(405); res.end('Method not allowed'); return;
    }
    if(req.method!=='GET'){res.writeHead(405);res.end('Method not allowed');return;}
    if(pathname==='/api/pos/display'){
      try { const data=await posDisplay(); res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(data)); }
      catch(e) { res.writeHead(502,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify({error:e.message,items:[],device_paired:!!safeReadJSON(deviceFile())?.device_token})); }
      return;
    }
    if(pathname==='/api/pos/ready-orders'){
      try {const data=await posReadyOrders();res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
      catch(e){res.writeHead(502,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:e.message,orders:[]}));}
      return;
    }
    if(pathname==='/api/pos/weekly'){
      try {const data=await posCatalog();res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
      catch(e){res.writeHead(502,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:e.message}));}
      return;
    }
    const posPhotoMatch=pathname.match(/^\/api\/pos\/photo\/(\d{1,10})$/);
    if(posPhotoMatch){await posPhoto(res,Number(posPhotoMatch[1]));return;}
    const displayMediaMatch=pathname.match(/^\/api\/pos\/media\/(\d{1,10})$/);
    if(displayMediaMatch){await displayMedia(res,Number(displayMediaMatch[1]));return;}
    if(pathname==='/api/content'){
      try{const data=await displayContent();res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
      catch(e){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}
      return;
    }
    if(pathname==='/api/voice/events'){
      res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','Connection':'keep-alive'});
      streams.add(res);res.write('data: '+JSON.stringify({type:'status',state:voiceProcess?'starting':process.platform==='win32'?'unavailable':'unsupported'})+'\n\n');
      req.on('close',()=>streams.delete(res));return;
    }
    if(pathname==='/api/qr'){
      try{
        const u=new URL(req.url,'http://localhost');const text=u.searchParams.get('url')||'';
        const parsed=new URL(text);
        if(parsed.protocol!=='https:') throw new Error('QR destination must use HTTPS');
        const b=await QRCode.toBuffer(text,{type:'png',width:720,margin:3,errorCorrectionLevel:'Q',color:{dark:'#41252d',light:'#ffffff'}});
        res.writeHead(200,{'Content-Type':'image/png','Content-Length':b.length,'Cache-Control':'no-store'});res.end(b);
      }catch(e){res.writeHead(400);res.end('QR unavailable: '+e.message);}
      return;
    }
    if(pathname==='/api/payaw/qr'){serveFile(res,qrFile);return;}
    const file=staticFile(pathname);if(!file){res.writeHead(404);res.end('Not found');return;}
    serveFile(res,file);
  });
  server.on('error',e=>{console.error('CUKI local server failed:',e);app.quit();});
  server.listen(0,HOST,()=>{createWindow(server.address().port);launchSpeechListener();});
}
function createWindow(port) {
  const origin=`http://${HOST}:${port}`;
  const allowed=(webContents,p)=>webContents?.getURL?.().startsWith(origin) && (p==='media'||p==='videoCapture');
  session.defaultSession.setPermissionCheckHandler((webContents,p)=>allowed(webContents,p));
  session.defaultSession.setPermissionRequestHandler((webContents,p,cb)=>cb(allowed(webContents,p)));
  window=new BrowserWindow({width:900,height:1400,title:'CUKI AI Menu',backgroundColor:'#f8dce3',
    fullscreen:true,autoHideMenuBar:true,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
  window.loadURL(origin+'/');
  window.webContents.on('before-input-event',(event,input)=>{
    if(input.type==='keyDown' && input.key==='F11'){window.setFullScreen(!window.isFullScreen());event.preventDefault();}
  });
}
app.whenReady().then(handleServer);
app.on('before-quit',()=>{isShuttingDown=true;clearInterval(heartbeatTimer);voiceProcess?.kill();server?.close();for(const r of streams){try{r.end();}catch{}}});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
