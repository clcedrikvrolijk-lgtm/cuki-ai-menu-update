const { app, BrowserWindow, ipcMain, session } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");
const crypto = require("crypto");
const QRCode = require("qrcode");

const APP_PORT = 3847;
const PHOTO_PORT = 3848;
const APP_HOST = "127.0.0.1";
const PHOTO_TTL_MS = 15 * 60 * 1000;
const POS_BASE_URL = (process.env.CUKI_POS_URL || "https://cuki-pos.onrender.com").replace(/\/$/, "");
const externalCukiInfoPath = path.join(__dirname, "..", "user-data", "cuki-info.txt");

let mainWindow = null;
let appServer = null;
let photoServer = null;
const photoRegistry = new Map();

function mimeType(file) {
  return ({
    ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"text/javascript; charset=utf-8",
    ".mjs":"text/javascript; charset=utf-8", ".json":"application/json; charset=utf-8", ".wasm":"application/wasm",
    ".task":"application/octet-stream", ".png":"image/png", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".svg":"image/svg+xml"
  })[path.extname(file).toLowerCase()] || "application/octet-stream";
}
function sendFile(res,file){
  fs.stat(file,(err,stat)=>{
    if(err||!stat.isFile()){res.writeHead(404,{"Content-Type":"text/plain"});res.end("Not found");return}
    res.writeHead(200,{"Content-Type":mimeType(file),"Content-Length":stat.size,"Cache-Control":file.endsWith(".task")||file.endsWith(".wasm")?"public, max-age=86400":"no-cache"});
    fs.createReadStream(file).pipe(res);
  });
}
function safeStaticPath(urlPath){
  const allowed={"/":"index.html","/index.html":"index.html","/style.css":"style.css","/renderer.mjs":"renderer.mjs"};
  if(allowed[urlPath])return path.join(__dirname,allowed[urlPath]);
  if(/^\/media\/[A-Za-z0-9._-]+\.(png|jpg|jpeg|mp4)$/.test(urlPath))return path.join(__dirname,urlPath.slice(1));
  if(urlPath==="/models/gesture_recognizer.task")return path.join(__dirname,"models","gesture_recognizer.task");
  if(urlPath==="/vendor/vision_bundle.mjs")return path.join(__dirname,"node_modules","@mediapipe","tasks-vision","vision_bundle.mjs");
  if(urlPath.startsWith("/vendor/wasm/")){const base=path.basename(urlPath);if(!/^[A-Za-z0-9._-]+$/.test(base))return null;return path.join(__dirname,"node_modules","@mediapipe","tasks-vision","wasm",base)}
  return null;
}
function loadCukiInfo(){
  try{const f=fs.existsSync(externalCukiInfoPath)?externalCukiInfoPath:path.join(__dirname,"cuki-info.txt");return fs.readFileSync(f,"utf8").trim()}
  catch{return "No additional CUKI business information has been configured."}
}
async function fetchPosJson(apiPath,timeoutMs=8000){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{const r=await fetch(`${POS_BASE_URL}${apiPath}`,{headers:{Accept:"application/json","User-Agent":"CUKI-AI-Menu/1.0"},signal:controller.signal,cache:"no-store"});const t=await r.text();if(!r.ok)throw new Error(`POS ${r.status}: ${t.slice(0,180)}`);return JSON.parse(t)}finally{clearTimeout(timer)}
}

const AI_PERSONALITY=`You are CUKI, the concise voice host of CUKI AI Menu.
Be warm, polished and helpful. Default to one short sentence and avoid filler.
Use the live menu tools before stating products, prices or availability. Never invent menu facts.
CUKI product prices are already final display prices; never add another tax amount on top.
Some CUKI products are box-only. The interface builds boxes using the live POS box size.
Use tools immediately for navigation, cart actions and selfies instead of narrating what you will do.
Clients use deliberate vertical hand swipes and voice. On the menu, UP/DOWN changes the highlighted product and an open-palm hold adds it.
You may build a cart, but do not claim payment or checkout is complete; cashier handoff is still required in this version.
Keep selfie prompts brief.
Additional CUKI info:\n${loadCukiInfo()}`;

const AI_TOOLS=[
  {type:"function",name:"get_menu",description:"Read the current live CUKI product catalog, prices and availability.",parameters:{type:"object",properties:{},required:[]}},
  {type:"function",name:"get_product",description:"Look up one current CUKI product by name.",parameters:{type:"object",properties:{name:{type:"string"}},required:["name"]}},
  {type:"function",name:"show_menu",description:"Open the live product menu.",parameters:{type:"object",properties:{},required:[]}},
  {type:"function",name:"select_next_product",description:"Highlight the next product.",parameters:{type:"object",properties:{},required:[]}},
  {type:"function",name:"select_previous_product",description:"Highlight the previous product.",parameters:{type:"object",properties:{},required:[]}},
  {type:"function",name:"add_to_cart",description:"Add a current product to the cart. Box-only CUKI products fill the current CUKI box.",parameters:{type:"object",properties:{name:{type:"string"},quantity:{type:"integer",minimum:1,maximum:12}},required:["name"]}},
  {type:"function",name:"show_cart",description:"Open the current cart and return its contents and total.",parameters:{type:"object",properties:{},required:[]}},
  {type:"function",name:"clear_cart",description:"Clear the current cart.",parameters:{type:"object",properties:{},required:[]}},
  {type:"function",name:"next_screen",description:"Move to the next screen.",parameters:{type:"object",properties:{},required:[]}},
  {type:"function",name:"previous_screen",description:"Move to the previous screen.",parameters:{type:"object",properties:{},required:[]}},
  {type:"function",name:"open_selfie",description:"Open selfie mode.",parameters:{type:"object",properties:{},required:[]}},
  {type:"function",name:"take_selfie",description:"Take a selfie after a countdown.",parameters:{type:"object",properties:{},required:[]}},
  {type:"function",name:"retake_selfie",description:"Retake the current selfie.",parameters:{type:"object",properties:{},required:[]}},
  {type:"function",name:"keep_selfie",description:"Keep the selfie and show its QR pickup code.",parameters:{type:"object",properties:{},required:[]}},
  {type:"function",name:"go_home",description:"Return to the welcome screen.",parameters:{type:"object",properties:{},required:[]}}
];

function getLanIPv4(){
  const candidates=[];for(const [name,entries] of Object.entries(os.networkInterfaces()))for(const e of entries||[])if(e.family==="IPv4"&&!e.internal&&!e.address.startsWith("169.254."))candidates.push({name,address:e.address});
  candidates.sort((a,b)=>(/wi-?fi|wireless/i.test(b.name)?1:0)-(/wi-?fi|wireless/i.test(a.name)?1:0));return candidates[0]?.address||"127.0.0.1";
}
function photoDir(){const d=path.join(app.getPath("temp"),"CukiAIMenuPhotos");fs.mkdirSync(d,{recursive:true});return d}
function deletePhoto(id){const e=photoRegistry.get(id);if(!e)return;try{fs.unlinkSync(e.file)}catch{}photoRegistry.delete(id)}
function cleanupExpiredPhotos(){const now=Date.now();for(const [id,e] of photoRegistry)if(e.expires<=now)deletePhoto(id)}
function startPhotoServer(){
  photoServer=http.createServer((req,res)=>{
    const url=new URL(req.url,`http://${req.headers.host||"localhost"}`);const m=url.pathname.match(/^\/(photo|image)\/([A-Za-z0-9_-]+)$/);if(!m){res.writeHead(404);res.end("Not found");return}
    const [,kind,id]=m,e=photoRegistry.get(id);if(!e||e.expires<=Date.now()||!fs.existsSync(e.file)){if(e)deletePhoto(id);res.writeHead(410,{"Content-Type":"text/html; charset=utf-8"});res.end("<h2>This CUKI selfie link has expired.</h2>");return}
    if(kind==="image"){res.writeHead(200,{"Content-Type":"image/png","Content-Disposition":`inline; filename="CUKI-selfie-${id}.png"`,"Cache-Control":"no-store"});fs.createReadStream(e.file).pipe(res);return}
    const mins=Math.max(1,Math.ceil((e.expires-Date.now())/60000));res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>CUKI Selfie</title><style>body{background:#40222a;color:white;font-family:Arial;text-align:center}main{max-width:650px;margin:auto;padding:24px}img{width:100%;border-radius:24px}a{display:inline-block;margin:24px;padding:15px 24px;border-radius:999px;background:white;color:#40222a;text-decoration:none;font-weight:700}</style><main><h1>CUKI</h1><img src="/image/${id}"><br><a href="/image/${id}" download="CUKI-selfie.png">Download my selfie</a><p>Expires in about ${mins} minute${mins===1?"":"s"}.</p></main>`);
  });photoServer.listen(PHOTO_PORT,"0.0.0.0");
}
function readRequestBody(req,limit=2_000_000){return new Promise((resolve,reject)=>{let data="";req.setEncoding("utf8");req.on("data",c=>{data+=c;if(data.length>limit){reject(new Error("Request too large"));req.destroy()}});req.on("end",()=>resolve(data));req.on("error",reject)})}
async function handleRealtimeSession(req,res){
  const apiKey=process.env.OPENAI_API_KEY;if(!apiKey){res.writeHead(503,{"Content-Type":"application/json"});res.end(JSON.stringify({error:"OPENAI_API_KEY is not configured."}));return}
  try{const sdp=await readRequestBody(req);if(!sdp.trim())throw new Error("Empty SDP offer");const form=new FormData();form.set("sdp",sdp);form.set("session",JSON.stringify({type:"realtime",model:"gpt-realtime-2.1",instructions:AI_PERSONALITY,audio:{output:{voice:"coral"}},tools:AI_TOOLS,tool_choice:"auto"}));const r=await fetch("https://api.openai.com/v1/realtime/calls",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"OpenAI-Safety-Identifier":"cuki-ai-menu-kiosk"},body:form});const body=await r.text();if(!r.ok){console.error("Realtime API error",r.status,body);res.writeHead(r.status,{"Content-Type":"text/plain; charset=utf-8"});res.end(body);return}res.writeHead(201,{"Content-Type":"application/sdp"});res.end(body)}catch(error){console.error("Realtime session error",error);res.writeHead(500,{"Content-Type":"application/json"});res.end(JSON.stringify({error:error.message}))}
}
function startAppServer(){
  appServer=http.createServer(async(req,res)=>{
    const url=new URL(req.url,`http://${req.headers.host||APP_HOST}`);
    if(req.method==="POST"&&url.pathname==="/api/realtime-session"){await handleRealtimeSession(req,res);return}
    if(req.method==="GET"&&url.pathname==="/api/pos/catalog"){try{const data=await fetchPosJson("/api/menu/catalog");res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(JSON.stringify(data))}catch(error){console.error("POS catalog error",error);res.writeHead(502,{"Content-Type":"application/json"});res.end(JSON.stringify({error:error.message}))}return}
    if(req.method==="GET"&&url.pathname==="/api/pos/business"){try{const data=await fetchPosJson("/api/menu/business");res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(JSON.stringify(data))}catch(error){console.error("POS business error",error);res.writeHead(502,{"Content-Type":"application/json"});res.end(JSON.stringify({error:error.message}))}return}
    if(req.method!=="GET"){res.writeHead(405);res.end("Method not allowed");return}
    if(url.pathname==="/api/status"){res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({aiConfigured:Boolean(process.env.OPENAI_API_KEY),lanIp:getLanIPv4(),photoPort:PHOTO_PORT,posBaseUrl:POS_BASE_URL}));return}
    const file=safeStaticPath(url.pathname);if(!file){res.writeHead(404);res.end("Not found");return}sendFile(res,file);
  });appServer.listen(APP_PORT,APP_HOST);
}
function createWindow(){
  const ses=session.defaultSession;ses.setPermissionCheckHandler((_w,p,o)=>Boolean(o?.startsWith(`http://${APP_HOST}:${APP_PORT}`)&&(p==="media"||p==="audioCapture"||p==="videoCapture")));ses.setPermissionRequestHandler((w,p,cb)=>cb(w.getURL().startsWith(`http://${APP_HOST}:${APP_PORT}`)&&(p==="media"||p==="audioCapture"||p==="videoCapture")));
  mainWindow=new BrowserWindow({width:900,height:1400,backgroundColor:"#f6e7e8",title:"CUKI AI Menu",autoHideMenuBar:true,show:false,webPreferences:{preload:path.join(__dirname,"preload.js"),contextIsolation:true,nodeIntegration:false,sandbox:true}});mainWindow.loadURL(`http://${APP_HOST}:${APP_PORT}/`);mainWindow.once("ready-to-show",()=>mainWindow.show());
}
ipcMain.handle("save-photo",async(_event,dataUrl)=>{try{const m=/^data:image\/png;base64,(.+)$/.exec(dataUrl||"");if(!m)throw new Error("Invalid PNG image");const id=crypto.randomBytes(12).toString("base64url"),file=path.join(photoDir(),`${id}.png`);fs.writeFileSync(file,Buffer.from(m[1],"base64"));const lanIp=getLanIPv4(),url=`http://${lanIp}:${PHOTO_PORT}/photo/${id}`,expires=Date.now()+PHOTO_TTL_MS;photoRegistry.set(id,{file,expires});const qrDataUrl=await QRCode.toDataURL(url,{errorCorrectionLevel:"M",width:440,margin:2,color:{dark:"#40222a",light:"#ffffff"}});return{ok:true,id,url,qrDataUrl,expiresMinutes:15,sameWifiRequired:lanIp!=="127.0.0.1"}}catch(error){return{ok:false,error:error.message}}});
ipcMain.handle("delete-photo",async(_e,id)=>{deletePhoto(id);return{ok:true}});
ipcMain.handle("runtime-status",async()=>({aiConfigured:Boolean(process.env.OPENAI_API_KEY),lanIp:getLanIPv4(),photoPort:PHOTO_PORT,posBaseUrl:POS_BASE_URL}));
app.whenReady().then(()=>{startAppServer();startPhotoServer();setInterval(cleanupExpiredPhotos,60000).unref();createWindow()});
app.on("window-all-closed",()=>{appServer?.close();photoServer?.close();for(const id of [...photoRegistry.keys()])deletePhoto(id);if(process.platform!=="darwin")app.quit()});
