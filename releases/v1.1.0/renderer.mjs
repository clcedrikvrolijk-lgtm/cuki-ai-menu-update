import { FilesetResolver, GestureRecognizer } from "/vendor/vision_bundle.mjs";

const screens=[...document.querySelectorAll(".screen")];
const visionCamera=document.getElementById("visionCamera");
const contentStatus=document.getElementById("contentStatus");
const contentStatusText=document.getElementById("contentStatusText");
const menuEyebrow=document.getElementById("menuEyebrow");
const menuDate=document.getElementById("menuDate");
const menuTitle=document.getElementById("menuTitle");
const menuSubtitle=document.getElementById("menuSubtitle");
const menuSections=document.getElementById("menuSections");
const clubTitle=document.getElementById("clubTitle");
const clubSubtitle=document.getElementById("clubSubtitle");
const clubQr=document.getElementById("clubQr");
const clubCta=document.getElementById("clubCta");
const clubFooter=document.getElementById("clubFooter");
const gestureToast=document.getElementById("gestureToast");
const gestureDebug=document.getElementById("gestureDebug");
const debugCanvas=document.getElementById("debugCanvas");
const debugText=document.getElementById("debugText");
const debugCtx=debugCanvas.getContext("2d");

const DEFAULT_CONTENT={
  version:1,
  menu:{eyebrow:"THIS WEEK AT CUKI",date_label:"SATURDAY",title:"Your Saturday favorites.",subtitle:"",sections:[]},
  club:{title:"THE ICONIC CUKI CLUB",subtitle:"Good taste deserves perks.",join_url:"https://cuki-website.onrender.com/#club",cta:"SCAN TO JOIN",footer:"1 box. 1 stamp. More to look forward to."},
  behavior:{refresh_minutes:5,idle_return_seconds:45,voice_enabled:false}
};
const DISPLAY={width:1080,height:1920};
let current=0;
let content=DEFAULT_CONTENT;
let gestureRecognizer=null;
let stream=null;
let handHistory=[];
let cooldownUntil=0;
let lastFrame=0;
let idleTimer=null;
let greeted=false;

const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

function fitDisplay(){
  const scale=Math.min(innerWidth/DISPLAY.width,innerHeight/DISPLAY.height);
  document.getElementById("app").style.transform=`translate(-50%,-50%) scale(${scale})`;
}
addEventListener("resize",fitDisplay);fitDisplay();

function setStatus(text,state=""){
  contentStatus.className=`status-dot ${state}`.trim();
  contentStatusText.textContent=text;
}
function toast(text){
  gestureToast.textContent=text;gestureToast.classList.add("show");
  clearTimeout(toast.timer);toast.timer=setTimeout(()=>gestureToast.classList.remove("show"),1000);
}
function resetIdle(){
  clearTimeout(idleTimer);
  const sec=Math.max(10,Number(content.behavior?.idle_return_seconds||45));
  idleTimer=setTimeout(()=>showScreen(0,false),sec*1000);
}
function showScreen(index,announce=true){
  current=clamp(index,0,1);
  screens.forEach((s,i)=>{s.classList.remove("active","before");if(i===current)s.classList.add("active");else if(i<current)s.classList.add("before")});
  if(announce) toast(current===0?"THIS WEEK AT CUKI":"THE ICONIC CUKI CLUB");
  resetIdle();
}
function maybeWelcome(){
  if(greeted||!content.behavior?.voice_enabled||!("speechSynthesis" in window))return;
  greeted=true;
  const u=new SpeechSynthesisUtterance("Welcome to CUKI.");
  u.rate=.96;u.pitch=1.02;u.volume=.75;
  speechSynthesis.speak(u);
}
function render(){
  const m=content.menu||DEFAULT_CONTENT.menu;
  menuEyebrow.textContent=m.eyebrow||"THIS WEEK AT CUKI";
  menuDate.textContent=m.date_label||"";
  menuTitle.textContent=m.title||"Your Saturday favorites.";
  menuSubtitle.textContent=m.subtitle||"";
  const sections=Array.isArray(m.sections)?m.sections:[];
  menuSections.innerHTML=sections.map(s=>`<section class="menu-section-card"><h2>${esc(s.title||"")}</h2><div class="menu-items">${(Array.isArray(s.items)?s.items:[]).map(item=>`<div class="menu-item">${esc(typeof item==="string"?item:item?.name||"")}</div>`).join("")}</div></section>`).join("");
  const c=content.club||DEFAULT_CONTENT.club;
  clubTitle.innerHTML=esc(c.title||"THE ICONIC CUKI CLUB").replace(/\s+CUKI CLUB$/i,"<br>CUKI CLUB");
  clubSubtitle.textContent=c.subtitle||"Good taste deserves perks.";
  clubCta.textContent=c.cta||"SCAN TO JOIN";
  clubFooter.textContent=c.footer||"1 box. 1 stamp. More to look forward to.";
  const url=c.join_url||DEFAULT_CONTENT.club.join_url;
  clubQr.src="/api/qr?url="+encodeURIComponent(url);
  resetIdle();
}
async function loadContent(){
  try{
    setStatus("Checking weekly display…","");
    const r=await fetch("/api/content",{cache:"no-store"});
    const data=await r.json();
    if(!r.ok)throw new Error(data.error||"Content unavailable");
    content={...DEFAULT_CONTENT,...data,menu:{...DEFAULT_CONTENT.menu,...(data.menu||{})},club:{...DEFAULT_CONTENT.club,...(data.club||{})},behavior:{...DEFAULT_CONTENT.behavior,...(data.behavior||{})}};
    localStorage.setItem("cukiDisplayCache",JSON.stringify(content));
    render();setStatus(data._source==="remote"?"Display content live":"Local display content","live");
  }catch(e){
    console.error(e);
    try{
      const cached=JSON.parse(localStorage.getItem("cukiDisplayCache")||"null");
      if(cached){content=cached;render();setStatus("Showing saved menu","offline");return}
    }catch{}
    render();setStatus("Using built-in menu","offline");
  }
}
function scheduleRefresh(){
  const min=Math.max(1,Number(content.behavior?.refresh_minutes||5));
  clearTimeout(scheduleRefresh.timer);
  scheduleRefresh.timer=setTimeout(async()=>{await loadContent();scheduleRefresh()},min*60000);
}

function palmCenter(lm){const ids=[0,5,9,13,17];let x=0,y=0;for(const id of ids){x+=lm[id].x;y+=lm[id].y}return{x:x/ids.length,y:y/ids.length}}
function analyzeSwipe(now){
  const recent=handHistory.filter(p=>now-p.t<=700);
  if(recent.length<6)return null;
  const first=recent[0],last=recent.at(-1),elapsed=Math.max(1,last.t-first.t),dx=last.x-first.x,dy=last.y-first.y;
  const ax=Math.abs(dx),ay=Math.abs(dy);
  if(elapsed<260||elapsed>700||ay<.115||ax>ay*.55||ay/elapsed<.00019)return null;
  const sign=dy<0?-1:1;let good=0,bad=0,steps=0;
  for(let i=1;i<recent.length;i++){const sy=recent[i].y-recent[i-1].y;if(Math.abs(sy)<.003)continue;steps++;if(Math.sign(sy)===sign)good++;else bad++}
  if(steps<4||good/steps<.72||bad>2)return null;
  const xs=recent.map(p=>p.x);if(Math.max(...xs)-Math.min(...xs)>.14)return null;
  return dy<0?"up":"down";
}
function drawDebug(lm){
  const w=debugCanvas.width,h=debugCanvas.height;debugCtx.clearRect(0,0,w,h);
  if(visionCamera.videoWidth){debugCtx.save();debugCtx.translate(w,0);debugCtx.scale(-1,1);debugCtx.drawImage(visionCamera,0,0,w,h);debugCtx.restore()}
  if(lm?.length){debugCtx.fillStyle="#fff";for(const p of lm){debugCtx.beginPath();debugCtx.arc((1-p.x)*w,p.y*h,3,0,Math.PI*2);debugCtx.fill()}}
}
function processGesture(result,now){
  const lm=result?.landmarks?.[0];
  if(!lm){handHistory=[];debugText.textContent="NO HAND";drawDebug(null);return}
  const c=palmCenter(lm);drawDebug(lm);debugText.textContent="HAND TRACKING";
  handHistory.push({x:c.x,y:c.y,t:now});handHistory=handHistory.filter(p=>now-p.t<=900);
  if(now<cooldownUntil)return;
  const swipe=analyzeSwipe(now);
  if(!swipe)return;
  handHistory=[];cooldownUntil=now+1500;maybeWelcome();
  if(swipe==="down")showScreen(1);else showScreen(0);
}
function loop(now){
  requestAnimationFrame(loop);
  if(!gestureRecognizer||!visionCamera.videoWidth||now-lastFrame<65)return;
  lastFrame=now;
  try{processGesture(gestureRecognizer.recognizeForVideo(visionCamera,now),now)}catch(e){console.error(e)}
}
async function startGestures(){
  try{
    stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},facingMode:"user"},audio:false});
    visionCamera.srcObject=stream;await visionCamera.play();
    const vision=await FilesetResolver.forVisionTasks("/vendor/wasm");
    const opts={baseOptions:{modelAssetPath:"/models/gesture_recognizer.task",delegate:"GPU"},runningMode:"VIDEO",numHands:1};
    try{gestureRecognizer=await GestureRecognizer.createFromOptions(vision,opts)}
    catch{opts.baseOptions.delegate="CPU";gestureRecognizer=await GestureRecognizer.createFromOptions(vision,opts)}
    debugText.textContent="HAND AI READY";requestAnimationFrame(loop);
  }catch(e){console.error("Gesture startup failed",e);debugText.textContent="HAND AI UNAVAILABLE"}
}

addEventListener("keydown",e=>{
  if(e.key==="ArrowDown"){maybeWelcome();showScreen(1)}
  else if(e.key==="ArrowUp"){maybeWelcome();showScreen(0)}
  else if(e.key.toLowerCase()==="g"){gestureDebug.classList.toggle("hidden")}
});
document.addEventListener("click",resetIdle);

await loadContent();scheduleRefresh();showScreen(0,false);startGestures();
