import { FilesetResolver, GestureRecognizer } from "/vendor/vision_bundle.mjs";

const screens = [...document.querySelectorAll(".screen")];
const visionCamera = document.getElementById("visionCamera");
const selfieCamera = document.getElementById("selfieCamera");
const captureCanvas = document.getElementById("captureCanvas");
const snapshot = document.getElementById("snapshot");
const countdown = document.getElementById("countdown");
const selfieStatus = document.getElementById("selfieStatus");
const qrImage = document.getElementById("qrImage");
const qrNote = document.getElementById("qrNote");
const aiAudio = document.getElementById("aiAudio");
const businessName = document.getElementById("businessName");
const businessDetails = document.getElementById("businessDetails");
const posStatus = document.getElementById("posStatus");
const gestureStatus = document.getElementById("gestureStatus");
const voiceStatus = document.getElementById("voiceStatus");
const gestureToast = document.getElementById("gestureToast");
const voiceCaption = document.getElementById("voiceCaption");
const menuList = document.getElementById("menuList");
const catalogEmpty = document.getElementById("catalogEmpty");
const catalogEmptyText = document.getElementById("catalogEmptyText");
const currencyChip = document.getElementById("currencyChip");
const boxBuilder = document.getElementById("boxBuilder");
const boxProgress = document.getElementById("boxProgress");
const boxSlots = document.getElementById("boxSlots");
const cartList = document.getElementById("cartList");
const cartEmpty = document.getElementById("cartEmpty");
const cartCount = document.getElementById("cartCount");
const cartTotal = document.getElementById("cartTotal");

const gestureDebug = document.getElementById("gestureDebug");
const gestureDebugCanvas = document.getElementById("gestureDebugCanvas");
const gestureDebugLabel = document.getElementById("gestureDebugLabel");
const gestureCtx = gestureDebugCanvas.getContext("2d");

const calibrationOverlay = document.getElementById("calibrationOverlay");
const calibrationClose = document.getElementById("calibrationClose");
const distanceSlider = document.getElementById("distanceSlider");
const verticalSlider = document.getElementById("verticalSlider");
const consistencySlider = document.getElementById("consistencySlider");
const cooldownSlider = document.getElementById("cooldownSlider");
const palmHoldSlider = document.getElementById("palmHoldSlider");
const distanceValue = document.getElementById("distanceValue");
const verticalValue = document.getElementById("verticalValue");
const consistencyValue = document.getElementById("consistencyValue");
const cooldownValue = document.getElementById("cooldownValue");
const palmHoldValue = document.getElementById("palmHoldValue");
const calibrationLiveStatus = document.getElementById("calibrationLiveStatus");
const calibrationPresets = [...document.querySelectorAll("[data-preset]")];
const resetCalibration = document.getElementById("resetCalibration");
const saveCalibration = document.getElementById("saveCalibration");

const appRoot = document.getElementById("app");
const displaySettings = document.getElementById("displaySettings");
const displaySettingsClose = document.getElementById("displaySettingsClose");
const displayOptions = [...document.querySelectorAll("[data-layout]")];
const fitOptions = [...document.querySelectorAll("[data-fit]")];
const monitorResolution = document.getElementById("monitorResolution");
const designResolution = document.getElementById("designResolution");
const displayScale = document.getElementById("displayScale");

const SELFIE_SCREEN = 4;
const PREVIEW_SCREEN = 5;
const QR_SCREEN = 6;
const MENU_SCREEN = 1;
const CART_SCREEN = 3;

const DEFAULT_GESTURE_SETTINGS = {
  swipeDistance: 0.115,
  maxHorizontalRatio: 0.55,
  consistency: 0.72,
  cooldownMs: 1500,
  palmHoldMs: 1100
};

function loadJson(key, fallback){
  try { return { ...fallback, ...(JSON.parse(localStorage.getItem(key) || "null") || {}) }; }
  catch { return { ...fallback }; }
}

let gestureSettings = loadJson("cukiGestureSettings", DEFAULT_GESTURE_SETTINGS);
const DISPLAY_LAYOUTS = {
  portrait: { width:1080, height:1920 },
  surfacePortrait: { width:1824, height:2736 },
  landscape: { width:1920, height:1080 },
  surfaceLandscape: { width:2736, height:1824 }
};
let displayPrefs = loadJson("cukiDisplayPrefs", { layout:"portrait", fit:"fit" });

let current = 0;
let catalog = { business_name:"CUKI Company", currency:"AWG", box_size:3, products:[] };
let selectedProductIndex = 0;
let lastCatalogFetch = 0;
let catalogTimer = null;
let normalCart = new Map();
let boxDraft = [];
let boxes = [];

let cameraStream = null;
let gestureRecognizer = null;
let lastGestureFrame = 0;
let handHistory = [];
let gestureCooldownUntil = 0;
let openPalmStarted = 0;
let noHandSince = performance.now();
let gestureFrameErrors = 0;
let lastDirectionalHint = 0;
let greetedThisCycle = false;

let busy = false;
let capturedDataUrl = null;
let currentPhotoId = null;
let idleTimer = null;

let aiPeer = null;
let aiData = null;
let aiMic = null;
let aiConnecting = false;
let aiConnected = false;
let assistantCaptionBuffer = "";

const clamp = (v,min,max)=>Math.max(min,Math.min(max,v));
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const normalize = s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();

function setStatus(el,text,state=""){
  el.className=`status-pill ${state}`.trim();
  el.querySelector("span").textContent=text;
}
function toast(text){
  gestureToast.textContent=text;
  gestureToast.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>gestureToast.classList.remove("show"),1100);
}
function showVoiceCaption(text,hold=2600){
  if(!text)return;
  voiceCaption.textContent=text;
  voiceCaption.classList.add("show");
  clearTimeout(showVoiceCaption.timer);
  showVoiceCaption.timer=setTimeout(()=>voiceCaption.classList.remove("show"),hold);
}
function resetIdle(){
  clearTimeout(idleTimer);
  idleTimer=setTimeout(()=>{
    current=0;
    greetedThisCycle=false;
    updateScreens();
  },120000);
}
function money(minor){
  const currency=catalog.currency||"AWG";
  return `${currency} ${(Number(minor||0)/100).toFixed(2)}`;
}
function escapeHtml(v){
  return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
}

function updateScreens(){
  screens.forEach((s,i)=>{
    s.classList.remove("active","before");
    if(i===current)s.classList.add("active");
    else if(i<current)s.classList.add("before");
  });
  if(current===MENU_SCREEN) renderMenu();
  if(current===CART_SCREEN) renderCart();
  if(current===SELFIE_SCREEN && !capturedDataUrl){
    countdown.textContent="";
    selfieStatus.textContent="Hold an open palm to take your photo";
  }
  resetIdle();
}
function goTo(index){
  current=clamp(index,0,screens.length-1);
  updateScreens();
}
function nextScreen(){ goTo(current+1); toast("↑ Next"); }
function previousScreen(){ goTo(current-1); toast("↓ Back"); }

async function fetchJson(path){
  const r=await fetch(path,{cache:"no-store"});
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}
async function refreshCatalog(force=false){
  if(!force && Date.now()-lastCatalogFetch<5000)return catalog;
  try{
    setStatus(posStatus,"POS syncing","warn");
    const data=await fetchJson("/api/pos/catalog");
    catalog={...catalog,...data,products:Array.isArray(data.products)?data.products:[]};
    lastCatalogFetch=Date.now();
    selectedProductIndex=clamp(selectedProductIndex,0,Math.max(0,catalog.products.length-1));
    businessName.textContent=catalog.business_name||"CUKI Company";
    currencyChip.textContent=catalog.currency||"AWG";
    setStatus(posStatus,"POS live","ok");
    reconcileCartWithCatalog();
    renderMenu();
    renderCart();
    return catalog;
  }catch(error){
    console.error("Catalog refresh failed",error);
    setStatus(posStatus,"POS unavailable","bad");
    if(!catalog.products.length){
      catalogEmpty.classList.remove("hidden");
      catalogEmptyText.textContent="Could not reach the live POS menu. Retrying…";
    }
    throw error;
  }
}
async function refreshBusiness(){
  try{
    const b=await fetchJson("/api/pos/business");
    const lines=[b.address,b.phone,b.email].filter(Boolean);
    businessDetails.innerHTML=lines.map(x=>`<div>${escapeHtml(x)}</div>`).join("");
  }catch{}
}

function renderMenu(){
  const products=catalog.products||[];
  if(!products.length){
    menuList.innerHTML="";
    catalogEmpty.classList.remove("hidden");
    return;
  }
  catalogEmpty.classList.add("hidden");
  menuList.innerHTML=products.map((p,i)=>{
    const selected=i===selectedProductIndex;
    const category=p.category||"CUKI";
    return `<article class="product-card ${selected?"selected":""} ${p.available?"":"soldout"}" data-index="${i}">
      <div><h3>${escapeHtml(p.name)}</h3><div class="meta"><span class="tag">${escapeHtml(category)}</span>${p.boxed?`<span class="tag">BOX OF ${catalog.box_size||3}</span>`:""}${p.available?"":`<span class="tag sold">SOLD OUT</span>`}</div></div>
      <div class="product-price">${money(p.price_minor)}</div><div class="select-mark"></div></article>`;
  }).join("");
  menuList.querySelectorAll(".product-card").forEach(el=>el.addEventListener("click",()=>{
    selectedProductIndex=Number(el.dataset.index);
    renderMenu();
  }));
  requestAnimationFrame(()=>menuList.querySelector(".product-card.selected")?.scrollIntoView({behavior:"smooth",block:"center"}));
  renderBoxBuilder();
}
function selectedProduct(){ return catalog.products[selectedProductIndex]||null; }
function selectNextProduct(){
  if(!catalog.products.length)return;
  selectedProductIndex=(selectedProductIndex+1)%catalog.products.length;
  renderMenu();
  toast(`↑ ${selectedProduct().name}`);
}
function selectPreviousProduct(){
  if(!catalog.products.length)return;
  selectedProductIndex=(selectedProductIndex-1+catalog.products.length)%catalog.products.length;
  renderMenu();
  toast(`↓ ${selectedProduct().name}`);
}
function findProduct(name){
  const q=normalize(name);
  if(!q)return null;
  const available=catalog.products||[];
  return available.find(p=>normalize(p.name)===q)
    || available.find(p=>normalize(p.name).includes(q)||q.includes(normalize(p.name)))
    || null;
}
function addProduct(product,quantity=1){
  if(!product)return {ok:false,message:"I couldn't find that Cuki."};
  if(!product.available)return {ok:false,message:`${product.name} is sold out right now.`};
  quantity=clamp(Number(quantity)||1,1,12);
  if(product.boxed){
    for(let n=0;n<quantity;n++){
      boxDraft.push(product.id);
      if(boxDraft.length===(catalog.box_size||3)){
        boxes.push([...boxDraft]);
        boxDraft=[];
      }
    }
  }else{
    normalCart.set(product.id,(normalCart.get(product.id)||0)+quantity);
  }
  persistCart();
  renderBoxBuilder();
  renderCart();
  const status=product.boxed && boxDraft.length ? `${boxDraft.length}/${catalog.box_size||3} in your current box` : "added";
  toast(`${product.name} • ${status}`);
  return {ok:true,message:`${product.name} ${status}.`,cart:cartSummary()};
}
function addSelectedProduct(){ return addProduct(selectedProduct(),1); }
function persistCart(){ localStorage.setItem("cukiMenuCart",JSON.stringify({normal:[...normalCart],boxDraft,boxes})); }
function restoreCart(){
  try{
    const x=JSON.parse(localStorage.getItem("cukiMenuCart")||"null");
    if(x){
      normalCart=new Map(x.normal||[]);
      boxDraft=x.boxDraft||[];
      boxes=x.boxes||[];
    }
  }catch{}
}
function clearCart(){
  normalCart.clear();
  boxDraft=[];
  boxes=[];
  persistCart();
  renderCart();
  renderBoxBuilder();
  return {ok:true,message:"Cart cleared."};
}
function reconcileCartWithCatalog(){
  const ids=new Set(catalog.products.map(p=>p.id));
  for(const id of [...normalCart.keys()])if(!ids.has(Number(id)))normalCart.delete(id);
  boxDraft=boxDraft.filter(id=>ids.has(id));
  boxes=boxes.map(b=>b.filter(id=>ids.has(id))).filter(b=>b.length===(catalog.box_size||3));
  persistCart();
}
function productById(id){ return catalog.products.find(p=>p.id===Number(id)); }
function renderBoxBuilder(){
  if(!catalog.products.some(p=>p.boxed)){
    boxBuilder.classList.add("hidden");
    return;
  }
  boxBuilder.classList.remove("hidden");
  const size=catalog.box_size||3;
  boxProgress.textContent=`${boxDraft.length} / ${size}`;
  boxSlots.innerHTML=Array.from({length:size},(_,i)=>{
    const p=productById(boxDraft[i]);
    return `<div class="box-slot ${p?"filled":""}">${p?escapeHtml(p.name.replace(/ CUKI$/i,"")):"Choose Cuki"}</div>`;
  }).join("");
}
function cartSummary(){
  let total=0,count=0;
  const items=[];
  for(const [id,qty] of normalCart){
    const p=productById(id);
    if(!p)continue;
    const line=p.price_minor*qty;
    total+=line;
    count+=qty;
    items.push({name:p.name,quantity:qty,line_total_minor:line});
  }
  boxes.forEach((box,i)=>{
    const ps=box.map(productById).filter(Boolean);
    const line=ps.reduce((s,p)=>s+p.price_minor,0);
    total+=line;
    count+=1;
    items.push({name:`Cuki Box ${i+1}`,quantity:1,line_total_minor:line,contents:ps.map(p=>p.name)});
  });
  return {
    currency:catalog.currency,
    total_minor:total,
    count,
    items,
    box_draft:boxDraft.map(id=>productById(id)?.name).filter(Boolean)
  };
}
function renderCart(){
  const s=cartSummary();
  cartCount.textContent=String(s.count);
  cartTotal.textContent=money(s.total_minor);
  if(!s.items.length && !s.box_draft.length){
    cartList.innerHTML="";
    cartEmpty.classList.remove("hidden");
    return;
  }
  cartEmpty.classList.add("hidden");
  const rows=s.items.map(item=>`<div class="cart-item"><div><h3>${escapeHtml(item.name)}</h3><span>${item.contents?escapeHtml(item.contents.join(" · ")):`Qty ${item.quantity}`}</span></div><b>${money(item.line_total_minor)}</b></div>`);
  if(s.box_draft.length){
    rows.push(`<div class="cart-item"><div><h3>Building Cuki Box</h3><span>${escapeHtml(s.box_draft.join(" · "))}</span></div><b>${s.box_draft.length}/${catalog.box_size||3}</b></div>`);
  }
  cartList.innerHTML=rows.join("");
}

function applyDisplayLayout(){
  const cfg=DISPLAY_LAYOUTS[displayPrefs.layout]||DISPLAY_LAYOUTS.portrait;
  const vw=window.innerWidth,vh=window.innerHeight;
  appRoot.style.width=`${cfg.width}px`;
  appRoot.style.height=`${cfg.height}px`;
  const fit=Math.min(vw/cfg.width,vh/cfg.height);
  const fill=Math.max(vw/cfg.width,vh/cfg.height);
  const scale=displayPrefs.fit==="fill"?fill:fit;
  appRoot.style.transform=`translate(-50%,-50%) scale(${scale})`;
  monitorResolution.textContent=`${vw} × ${vh}`;
  designResolution.textContent=`${cfg.width} × ${cfg.height}`;
  displayScale.textContent=`${(scale*100).toFixed(1)}%`;
  displayOptions.forEach(b=>b.classList.toggle("active",b.dataset.layout===displayPrefs.layout));
  fitOptions.forEach(b=>b.classList.toggle("active",b.dataset.fit===displayPrefs.fit));
}
function setDisplayVisible(show){
  displaySettings.classList.toggle("show",show);
  displaySettings.setAttribute("aria-hidden",String(!show));
  if(show)applyDisplayLayout();
}
displayOptions.forEach(b=>b.addEventListener("click",()=>{
  displayPrefs.layout=b.dataset.layout;
  localStorage.setItem("cukiDisplayPrefs",JSON.stringify(displayPrefs));
  applyDisplayLayout();
}));
fitOptions.forEach(b=>b.addEventListener("click",()=>{
  displayPrefs.fit=b.dataset.fit;
  localStorage.setItem("cukiDisplayPrefs",JSON.stringify(displayPrefs));
  applyDisplayLayout();
}));
displaySettingsClose.addEventListener("click",()=>setDisplayVisible(false));
displaySettings.addEventListener("click",e=>{if(e.target===displaySettings)setDisplayVisible(false)});
window.addEventListener("resize",applyDisplayLayout);

function updateCalibrationLabels(){
  distanceSlider.value=String(gestureSettings.swipeDistance*100);
  verticalSlider.value=String(gestureSettings.maxHorizontalRatio*100);
  consistencySlider.value=String(gestureSettings.consistency*100);
  cooldownSlider.value=String(gestureSettings.cooldownMs);
  palmHoldSlider.value=String(gestureSettings.palmHoldMs);
  distanceValue.textContent=`${(gestureSettings.swipeDistance*100).toFixed(1)}%`;
  verticalValue.textContent=`${Math.round(gestureSettings.maxHorizontalRatio*100)}%`;
  consistencyValue.textContent=`${Math.round(gestureSettings.consistency*100)}%`;
  cooldownValue.textContent=`${(gestureSettings.cooldownMs/1000).toFixed(1)} s`;
  palmHoldValue.textContent=`${(gestureSettings.palmHoldMs/1000).toFixed(1)} s`;
}
function saveGesture(){ localStorage.setItem("cukiGestureSettings",JSON.stringify(gestureSettings)); }
function setCalibrationVisible(show){
  calibrationOverlay.classList.toggle("show",show);
  calibrationOverlay.setAttribute("aria-hidden",String(!show));
  if(show){
    updateCalibrationLabels();
    calibrationLiveStatus.textContent="Show your hand to the camera.";
  }
}
function setPreset(name){
  const p={
    easy:{swipeDistance:.08,maxHorizontalRatio:.7,consistency:.62,cooldownMs:1200,palmHoldMs:800},
    balanced:{swipeDistance:.10,maxHorizontalRatio:.60,consistency:.68,cooldownMs:1400,palmHoldMs:1000},
    precise:{...DEFAULT_GESTURE_SETTINGS}
  }[name];
  gestureSettings={...gestureSettings,...p};
  saveGesture();
  updateCalibrationLabels();
  calibrationPresets.forEach(b=>b.classList.toggle("active",b.dataset.preset===name));
}
for(const [el,key,scale] of [
  [distanceSlider,"swipeDistance",100],
  [verticalSlider,"maxHorizontalRatio",100],
  [consistencySlider,"consistency",100],
  [cooldownSlider,"cooldownMs",1],
  [palmHoldSlider,"palmHoldMs",1]
]){
  el.addEventListener("input",()=>{
    gestureSettings[key]=Number(el.value)/scale;
    calibrationPresets.forEach(b=>b.classList.remove("active"));
    updateCalibrationLabels();
  });
}
calibrationPresets.forEach(b=>b.addEventListener("click",()=>setPreset(b.dataset.preset)));
calibrationClose.addEventListener("click",()=>{saveGesture();setCalibrationVisible(false)});
saveCalibration.addEventListener("click",()=>{saveGesture();setCalibrationVisible(false);toast("Gesture settings saved")});
resetCalibration.addEventListener("click",()=>{gestureSettings={...DEFAULT_GESTURE_SETTINGS};setPreset("precise")});
calibrationOverlay.addEventListener("click",e=>{if(e.target===calibrationOverlay){saveGesture();setCalibrationVisible(false)}});

async function startCamera(){
  if(cameraStream)return;
  try{
    cameraStream=await navigator.mediaDevices.getUserMedia({
      video:{width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30,max:30},facingMode:"user"},
      audio:false
    });
    visionCamera.srcObject=cameraStream;
    selfieCamera.srcObject=cameraStream;
    await Promise.allSettled([visionCamera.play(),selfieCamera.play()]);
    setStatus(gestureStatus,"Hand AI loading","warn");
  }catch(error){
    console.error(error);
    setStatus(gestureStatus,"Camera blocked","bad");
    selfieStatus.textContent=`Camera error: ${error.name}`;
  }
}
async function initGestureAI(){
  try{
    const vision=await FilesetResolver.forVisionTasks("/vendor/wasm");
    const opts={
      baseOptions:{modelAssetPath:"/models/gesture_recognizer.task",delegate:"GPU"},
      runningMode:"VIDEO",numHands:1,
      minHandDetectionConfidence:.55,minHandPresenceConfidence:.55,minTrackingConfidence:.55,
      cannedGesturesClassifierOptions:{scoreThreshold:.55,maxResults:1}
    };
    try{
      gestureRecognizer=await GestureRecognizer.createFromOptions(vision,opts);
    }catch{
      opts.baseOptions.delegate="CPU";
      gestureRecognizer=await GestureRecognizer.createFromOptions(vision,opts);
    }
    setStatus(gestureStatus,"Hand AI ready","ok");
    requestAnimationFrame(gestureLoop);
  }catch(error){
    console.error(error);
    setStatus(gestureStatus,"Hand AI failed","bad");
  }
}
function palmCenter(lm){
  const ids=[0,5,9,13,17];
  let x=0,y=0;
  for(const id of ids){x+=lm[id].x;y+=lm[id].y}
  return{x:x/ids.length,y:y/ids.length};
}
function analyzeVerticalSwipe(history,now){
  const recent=history.filter(p=>now-p.t<=700);
  if(recent.length<6)return null;
  const first=recent[0],last=recent.at(-1),elapsed=Math.max(1,last.t-first.t);
  const dx=last.x-first.x,dy=last.y-first.y,ax=Math.abs(dx),ay=Math.abs(dy);
  if(elapsed<260||elapsed>700)return null;
  if(ay<gestureSettings.swipeDistance)return null;
  if(ax>ay*gestureSettings.maxHorizontalRatio)return null;
  if(ay/elapsed<.00019)return null;
  const sign=dy<0?-1:1;
  let good=0,bad=0,steps=0;
  for(let i=1;i<recent.length;i++){
    const sy=recent[i].y-recent[i-1].y;
    if(Math.abs(sy)<.003)continue;
    steps++;
    if(Math.sign(sy)===sign)good++;else bad++;
  }
  if(steps<4||good/steps<gestureSettings.consistency||bad>2)return null;
  const xs=recent.map(p=>p.x);
  if(Math.max(...xs)-Math.min(...xs)>.14)return null;
  return{direction:dy<0?"up":"down"};
}
function drawGestureDebug(lm,category="No hand",score=0,center=null){
  const w=gestureDebugCanvas.width,h=gestureDebugCanvas.height;
  gestureCtx.clearRect(0,0,w,h);
  if(visionCamera.videoWidth){
    gestureCtx.save();
    gestureCtx.translate(w,0);
    gestureCtx.scale(-1,1);
    gestureCtx.drawImage(visionCamera,0,0,w,h);
    gestureCtx.restore();
  }else{
    gestureCtx.fillStyle="#111";
    gestureCtx.fillRect(0,0,w,h);
  }
  gestureCtx.fillStyle="rgba(0,0,0,.30)";
  gestureCtx.fillRect(0,0,w,h);
  if(lm?.length){
    gestureCtx.fillStyle="#fff";
    for(const p of lm){
      gestureCtx.beginPath();
      gestureCtx.arc((1-p.x)*w,p.y*h,3,0,Math.PI*2);
      gestureCtx.fill();
    }
    if(center){
      gestureCtx.strokeStyle="#ef6f91";
      gestureCtx.lineWidth=3;
      gestureCtx.beginPath();
      gestureCtx.arc((1-center.x)*w,center.y*h,13,0,Math.PI*2);
      gestureCtx.stroke();
    }
  }
  gestureDebugLabel.textContent=lm?.length?`HAND • ${category}${score?` ${Math.round(score*100)}%`:""}`:"NO HAND";
}
function contextualSwipe(direction){
  if(current===MENU_SCREEN){
    direction==="up"?selectNextProduct():selectPreviousProduct();
    return;
  }
  direction==="up"?nextScreen():previousScreen();
}
async function contextualPalm(){
  if(current===0){
    goTo(MENU_SCREEN);
    toast("Welcome to CUKI");
    return;
  }
  if(current===MENU_SCREEN){
    addSelectedProduct();
    return;
  }
  if(current===SELFIE_SCREEN&&!busy&&!capturedDataUrl){
    await takePhoto();
  }
}
function processGestureResult(result,now){
  if(displaySettings.classList.contains("show")||calibrationOverlay.classList.contains("show")){
    handHistory=[];
    openPalmStarted=0;
    return;
  }
  const hasHand=result?.landmarks?.length>0;
  if(!hasHand){
    handHistory=[];
    openPalmStarted=0;
    drawGestureDebug(null);
    if(now-noHandSince>350)setStatus(gestureStatus,"Show hand","warn");
    return;
  }
  noHandSince=now;
  const lm=result.landmarks[0];
  const center=palmCenter(lm);
  const category=result.gestures?.[0]?.[0]?.categoryName||"Hand";
  const score=result.gestures?.[0]?.[0]?.score||0;
  drawGestureDebug(lm,category,score,center);
  setStatus(gestureStatus,category==="None"?"Hand detected":category.replaceAll("_"," "),"ok");

  if(!greetedThisCycle&&aiConnected){
    greetedThisCycle=true;
    sendTextToAI("A client approached. Give one short welcome sentence only.");
  }

  handHistory.push({x:center.x,y:center.y,t:now});
  handHistory=handHistory.filter(p=>now-p.t<=900);

  if(now>=gestureCooldownUntil){
    const swipe=analyzeVerticalSwipe(handHistory,now);
    if(swipe){
      gestureCooldownUntil=now+gestureSettings.cooldownMs;
      handHistory=[];
      contextualSwipe(swipe.direction);
      return;
    }
    if(handHistory.length>=4){
      const first=handHistory[0],dy=center.y-first.y,dx=center.x-first.x;
      if(Math.abs(dy)>=.045&&Math.abs(dy)>Math.abs(dx)*1.35&&now-lastDirectionalHint>220){
        lastDirectionalHint=now;
        const d=dy<0?"UP":"DOWN";
        gestureDebugLabel.textContent=`TRACKING ${d}`;
        if(calibrationOverlay.classList.contains("show"))calibrationLiveStatus.textContent=`Tracking clean ${d} swipe`;
      }
    }
  }

  if(now>=gestureCooldownUntil&&category==="Open_Palm"&&score>=.60){
    if(!openPalmStarted)openPalmStarted=now;
    if(now-openPalmStarted>=gestureSettings.palmHoldMs){
      gestureCooldownUntil=now+Math.max(1800,gestureSettings.cooldownMs);
      openPalmStarted=0;
      contextualPalm();
    }
  }else openPalmStarted=0;
}
function gestureLoop(now){
  requestAnimationFrame(gestureLoop);
  if(!gestureRecognizer||!visionCamera.videoWidth||now-lastGestureFrame<65)return;
  lastGestureFrame=now;
  try{
    processGestureResult(gestureRecognizer.recognizeForVideo(visionCamera,now),now);
    gestureFrameErrors=0;
  }catch(error){
    if(++gestureFrameErrors>=3){
      setStatus(gestureStatus,"Hand frame error","bad");
      console.error(error);
    }
  }
}

async function takePhoto(){
  if(busy||current!==SELFIE_SCREEN||!cameraStream||!selfieCamera.videoWidth)return;
  busy=true;
  capturedDataUrl=null;
  selfieStatus.textContent="Smile ♡";
  for(const n of["3","2","1"]){
    countdown.textContent=n;
    await sleep(700);
  }
  countdown.textContent="♡";
  await sleep(250);
  countdown.textContent="";
  const w=selfieCamera.videoWidth,h=selfieCamera.videoHeight;
  captureCanvas.width=w;
  captureCanvas.height=h;
  const ctx=captureCanvas.getContext("2d");
  ctx.save();
  ctx.translate(w,0);
  ctx.scale(-1,1);
  ctx.drawImage(selfieCamera,0,0,w,h);
  ctx.restore();
  capturedDataUrl=captureCanvas.toDataURL("image/png");
  snapshot.src=capturedDataUrl;
  busy=false;
  goTo(PREVIEW_SCREEN);
}
function retakePhoto(){
  if(currentPhotoId){
    window.cuki.deletePhoto(currentPhotoId).catch(()=>{});
    currentPhotoId=null;
  }
  capturedDataUrl=null;
  snapshot.removeAttribute("src");
  goTo(SELFIE_SCREEN);
}
async function keepPhoto(){
  if(!capturedDataUrl||busy)return{ok:false,message:"There is no selfie yet."};
  busy=true;
  const result=await window.cuki.savePhoto(capturedDataUrl);
  busy=false;
  if(!result.ok){
    showVoiceCaption(`QR error: ${result.error}`,3500);
    return{ok:false,message:result.error};
  }
  currentPhotoId=result.id;
  qrImage.src=result.qrDataUrl;
  qrNote.textContent=`Available for ${result.expiresMinutes} minutes. Keep phone and mirror on the same Wi-Fi for this prototype.`;
  goTo(QR_SCREEN);
  return{ok:true,message:"The QR code is on screen."};
}

async function ensureCatalog(){
  try{await refreshCatalog()}catch{}
  return catalog;
}
async function executeMirrorTool(item){
  let args={};
  try{args=JSON.parse(item.arguments||"{}")||{}}catch{}
  switch(item.name){
    case "get_menu":
      await ensureCatalog();
      return{
        ok:true,
        business_name:catalog.business_name,
        currency:catalog.currency,
        box_size:catalog.box_size,
        products:catalog.products.map(p=>({
          name:p.name,price:money(p.price_minor),available:p.available,boxed:p.boxed,category:p.category
        }))
      };
    case "get_product": {
      await ensureCatalog();
      const p=findProduct(args.name);
      return p?{ok:true,name:p.name,price:money(p.price_minor),available:p.available,boxed:p.boxed,category:p.category}:{ok:false,message:"Product not found."};
    }
    case "show_menu":
      await ensureCatalog();
      goTo(MENU_SCREEN);
      return{ok:true,screen:"menu"};
    case "select_next_product":
      selectNextProduct();
      return{ok:true,selected:selectedProduct()?.name};
    case "select_previous_product":
      selectPreviousProduct();
      return{ok:true,selected:selectedProduct()?.name};
    case "add_to_cart": {
      await ensureCatalog();
      const p=findProduct(args.name);
      return addProduct(p,args.quantity||1);
    }
    case "show_cart":
      goTo(CART_SCREEN);
      return{ok:true,...cartSummary()};
    case "clear_cart":
      return clearCart();
    case "next_screen":
      nextScreen();
      return{ok:true,screen:current};
    case "previous_screen":
      previousScreen();
      return{ok:true,screen:current};
    case "open_selfie":
      goTo(SELFIE_SCREEN);
      capturedDataUrl=null;
      return{ok:true,screen:"selfie"};
    case "take_selfie":
      goTo(SELFIE_SCREEN);
      capturedDataUrl=null;
      await sleep(250);
      await takePhoto();
      return{ok:Boolean(capturedDataUrl)};
    case "retake_selfie":
      retakePhoto();
      return{ok:true};
    case "keep_selfie":
      return await keepPhoto();
    case "go_home":
      goTo(0);
      return{ok:true};
    default:
      return{ok:false,error:`Unknown tool ${item.name}`};
  }
}
function sendAIEvent(event){
  if(aiData?.readyState==="open"){
    aiData.send(JSON.stringify(event));
    return true;
  }
  return false;
}
function sendTextToAI(text){
  if(!aiConnected)return false;
  sendAIEvent({type:"conversation.item.create",item:{type:"message",role:"user",content:[{type:"input_text",text}]}});
  sendAIEvent({type:"response.create"});
  return true;
}
function handleAIEvent(event){
  switch(event.type){
    case "session.created":
    case "session.updated":
      setStatus(voiceStatus,"Voice ready","ok");
      break;
    case "input_audio_buffer.speech_started":
      setStatus(voiceStatus,"Listening","ok");
      resetIdle();
      break;
    case "input_audio_buffer.speech_stopped":
      setStatus(voiceStatus,"Thinking","warn");
      break;
    case "response.output_audio_transcript.delta":
      assistantCaptionBuffer+=event.delta||"";
      showVoiceCaption(assistantCaptionBuffer,4200);
      break;
    case "response.output_audio_transcript.done":
      assistantCaptionBuffer=event.transcript||assistantCaptionBuffer;
      showVoiceCaption(assistantCaptionBuffer,4200);
      assistantCaptionBuffer="";
      setStatus(voiceStatus,"Voice ready","ok");
      break;
    case "response.done": {
      setStatus(voiceStatus,"Voice ready","ok");
      const calls=(event.response?.output||[]).filter(x=>x.type==="function_call");
      for(const item of calls){
        executeMirrorTool(item)
          .then(output=>{
            sendAIEvent({type:"conversation.item.create",item:{type:"function_call_output",call_id:item.call_id,output:JSON.stringify(output)}});
            sendAIEvent({type:"response.create"});
          })
          .catch(error=>{
            sendAIEvent({type:"conversation.item.create",item:{type:"function_call_output",call_id:item.call_id,output:JSON.stringify({ok:false,error:error.message})}});
            sendAIEvent({type:"response.create"});
          });
      }
      break;
    }
    case "error":
      console.error("Realtime error",event);
      setStatus(voiceStatus,"Voice error","bad");
      break;
  }
}
function disconnectAI(){
  try{aiData?.close()}catch{}
  try{aiPeer?.close()}catch{}
  try{aiMic?.getTracks().forEach(t=>t.stop())}catch{}
  aiData=null;
  aiPeer=null;
  aiMic=null;
  aiConnected=false;
}
async function connectAI(force=false){
  if(aiConnecting||(aiConnected&&!force))return;
  aiConnecting=true;
  if(force)disconnectAI();
  try{
    const status=await window.cuki.runtimeStatus();
    if(!status.aiConfigured){
      setStatus(voiceStatus,"Needs API key","warn");
      return;
    }
    setStatus(voiceStatus,"Connecting","warn");
    const pc=new RTCPeerConnection();
    aiPeer=pc;
    pc.ontrack=e=>{
      aiAudio.srcObject=e.streams[0]||new MediaStream([e.track]);
      aiAudio.play().catch(()=>{});
    };
    aiMic=await navigator.mediaDevices.getUserMedia({
      audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},
      video:false
    });
    for(const track of aiMic.getAudioTracks())pc.addTrack(track,aiMic);
    const dc=pc.createDataChannel("oai-events");
    aiData=dc;
    dc.addEventListener("open",()=>{
      aiConnected=true;
      setStatus(voiceStatus,"Voice ready","ok");
    });
    dc.addEventListener("message",e=>{
      try{handleAIEvent(JSON.parse(e.data))}catch(err){console.warn(err)}
    });
    dc.addEventListener("close",()=>{
      aiConnected=false;
      setStatus(voiceStatus,"Voice disconnected","warn");
    });
    const offer=await pc.createOffer();
    await pc.setLocalDescription(offer);
    const response=await fetch("/api/realtime-session",{
      method:"POST",
      headers:{"Content-Type":"application/sdp"},
      body:offer.sdp
    });
    if(!response.ok)throw new Error(await response.text()||`AI connection failed (${response.status})`);
    await pc.setRemoteDescription({type:"answer",sdp:await response.text()});
  }catch(error){
    console.error("Voice AI connection failed",error);
    disconnectAI();
    setStatus(voiceStatus,"Voice unavailable","bad");
    showVoiceCaption("Voice AI is unavailable. The live menu and gestures still work.",3200);
  }finally{
    aiConnecting=false;
  }
}

document.addEventListener("keydown",e=>{
  resetIdle();
  if(e.key==="ArrowUp")contextualSwipe("up");
  if(e.key==="ArrowDown")contextualSwipe("down");
  if(e.key==="Enter"&&current===MENU_SCREEN)addSelectedProduct();
  if((e.key==="r"||e.key==="R")&&current===SELFIE_SCREEN)takePhoto();
  if(e.key==="Backspace"&&current===PREVIEW_SCREEN){
    e.preventDefault();
    retakePhoto();
  }
  if(e.key==="k"||e.key==="K")keepPhoto();
  if(e.key==="g"||e.key==="G")gestureDebug.classList.toggle("hidden");
  if(e.key==="c"||e.key==="C")setCalibrationVisible(!calibrationOverlay.classList.contains("show"));
  if(e.key==="d"||e.key==="D")setDisplayVisible(!displaySettings.classList.contains("show"));
  if(e.key==="a"||e.key==="A")connectAI(true);
  if(e.key==="Escape"){
    setCalibrationVisible(false);
    setDisplayVisible(false);
  }
});
window.addEventListener("beforeunload",()=>{
  disconnectAI();
  cameraStream?.getTracks().forEach(t=>t.stop());
  clearInterval(catalogTimer);
});

async function boot(){
  restoreCart();
  applyDisplayLayout();
  updateCalibrationLabels();
  updateScreens();
  renderCart();
  renderBoxBuilder();

  refreshBusiness();
  refreshCatalog(true).catch(()=>{});
  catalogTimer=setInterval(()=>refreshCatalog(true).catch(()=>{}),15000);

  try{await startCamera()}catch(error){console.error(error)}
  try{await initGestureAI()}catch(error){console.error(error)}
  connectAI();
}
boot();
