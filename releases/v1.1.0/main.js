const {app,BrowserWindow,session}=require("electron");
const fs=require("fs");
const path=require("path");
const http=require("http");
const QRCode=require("qrcode");

const HOST="127.0.0.1";
const PORT=3847;
const DEFAULT_REMOTE="https://raw.githubusercontent.com/clcedrikvrolijk-lgtm/cuki-ai-menu-update/main/display-content.json";
const REMOTE_URL=process.env.CUKI_DISPLAY_CONFIG_URL||DEFAULT_REMOTE;

function mime(file){return ({".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".mjs":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp",".wasm":"application/wasm",".task":"application/octet-stream"})[path.extname(file).toLowerCase()]||"application/octet-stream"}
function sendFile(res,file){fs.stat(file,(err,s)=>{if(err||!s.isFile()){res.writeHead(404);res.end("Not found");return}res.writeHead(200,{"Content-Type":mime(file),"Content-Length":s.size,"Cache-Control":file.endsWith(".task")||file.endsWith(".wasm")?"public, max-age=86400":"no-cache"});fs.createReadStream(file).pipe(res)})}
function staticPath(p){
  const direct={"/":"index.html","/index.html":"index.html","/style.css":"style.css","/renderer.mjs":"renderer.mjs","/display-content.json":"display-content.json"};
  if(direct[p])return path.join(__dirname,direct[p]);
  if(/^\/media\/[A-Za-z0-9._-]+\.(png|jpg|jpeg|webp)$/.test(p))return path.join(__dirname,p.slice(1));
  if(p==="/models/gesture_recognizer.task")return path.join(__dirname,"models","gesture_recognizer.task");
  if(p==="/vendor/vision_bundle.mjs")return path.join(__dirname,"node_modules","@mediapipe","tasks-vision","vision_bundle.mjs");
  if(p.startsWith("/vendor/wasm/")){const b=path.basename(p);if(!/^[A-Za-z0-9._-]+$/.test(b))return null;return path.join(__dirname,"node_modules","@mediapipe","tasks-vision","wasm",b)}
  return null;
}
async function getRemote(){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),7000);
  try{
    const r=await fetch(REMOTE_URL,{cache:"no-store",signal:c.signal,headers:{"User-Agent":"CUKI-Weekly-Display/1.1"}});
    if(!r.ok)throw new Error("Remote display content HTTP "+r.status);
    return await r.json();
  }finally{clearTimeout(t)}
}
function getLocal(){return JSON.parse(fs.readFileSync(path.join(__dirname,"display-content.json"),"utf8"))}

let server;
function startServer(){
  server=http.createServer(async(req,res)=>{
    const u=new URL(req.url,`http://${req.headers.host||HOST}`);
    if(u.pathname==="/api/content"){
      try{const data=await getRemote();res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(JSON.stringify({...data,_source:"remote"}))}
      catch(e){try{const data=getLocal();res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(JSON.stringify({...data,_source:"local",_warning:e.message}))}catch(e2){res.writeHead(500,{"Content-Type":"application/json"});res.end(JSON.stringify({error:e2.message}))}}
      return;
    }
    if(u.pathname==="/api/qr"){
      try{
        const target=u.searchParams.get("url")||"";const parsed=new URL(target);
        if(!["https:","http:"].includes(parsed.protocol))throw new Error("Invalid QR destination");
        const png=await QRCode.toBuffer(target,{type:"png",width:640,margin:2,errorCorrectionLevel:"M",color:{dark:"#41252d",light:"#ffffff"}});
        res.writeHead(200,{"Content-Type":"image/png","Cache-Control":"no-store","Content-Length":png.length});res.end(png);
      }catch(e){res.writeHead(400,{"Content-Type":"text/plain"});res.end(e.message)}return;
    }
    const file=staticPath(u.pathname);if(!file){res.writeHead(404);res.end("Not found");return}sendFile(res,file);
  });
  server.listen(PORT,HOST);
}
function createWindow(){
  const ses=session.defaultSession;
  ses.setPermissionRequestHandler((w,p,cb)=>cb(w.getURL().startsWith(`http://${HOST}:${PORT}`)&&(p==="media"||p==="videoCapture")));
  const win=new BrowserWindow({width:900,height:1400,title:"CUKI Weekly Display",backgroundColor:"#f8dce3",autoHideMenuBar:true,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.loadURL(`http://${HOST}:${PORT}/`);
}
app.whenReady().then(()=>{startServer();createWindow()});
app.on("window-all-closed",()=>{server?.close();if(process.platform!=="darwin")app.quit()});
