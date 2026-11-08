import { FilesetResolver, GestureRecognizer } from '/vendor/vision_bundle.mjs';

const el=id=>document.getElementById(id);
const screens=[...document.querySelectorAll('.screen')];
const visionCamera=el('visionCamera');
const feedback=el('voiceFeedback');
const readyCallout=el('readyCallout');
const readyHeading=el('readyHeading');
const readyOrderNumbers=el('readyOrderNumbers');
const debugCanvas=el('debugCanvas');
const debugCtx=debugCanvas.getContext('2d');
const displayWidth=1080,displayHeight=1920;
const base={
  version:2,
  menu:{eyebrow:'THIS WEEK AT CUKI',date_label:'SATURDAY',title:'Your Saturday favorites.',subtitle:'',image_url:'',sections:[]},
  club:{title:'THE ICONIC CUKI CLUB',subtitle:'Good taste deserves perks.',join_url:'https://cuki-website.onrender.com/#club',cta:'SCAN TO JOIN',footer:'1 box. 1 stamp. More to look forward to.'},
  behavior:{refresh_minutes:5,idle_return_seconds:45,payaw_timeout_seconds:55,voice_enabled:false,voice_requests_enabled:true,respond_to_voice_requests:true,voice_only_when_asked:true}
};
let content=base;
let posProducts=[];
let posReady=false;
let posPollTimer=null;
let readyPollTimer=null;
let readyCalloutTimer=null;
let readyActiveIds=[];
let lastReadyPollStarted=Number(localStorage.getItem('cukiReadyLastPollAt'))||Date.now();
let readySeenIds=new Set();
try{readySeenIds=new Set(JSON.parse(localStorage.getItem('cukiReadySeenIds')||'[]').map(String));}catch{}
let slideTimer=null;
let activeSlideIndex=0;
let lastProductSignature='';
const SLIDE_INTERVAL=7000;
const PROMOTION_INTERVAL=60000;
let automaticSlide=false;

let current=0;
let gestureRecognizer=null;
let handHistory=[];
let cooldownUntil=0;
let lastFrame=0;
let idleTimer=null;
let refreshTimer=null;
let toastTimer=null;
let feedbackTimer=null;

const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
function fitDisplay(){
  const scale=Math.min(innerWidth/displayWidth,innerHeight/displayHeight);
  el('app').style.transform=`translate(-50%,-50%) scale(${scale})`;
}
addEventListener('resize',fitDisplay);fitDisplay();
function setStatus(message,state=''){
  el('contentStatus').className=`status-dot ${state}`.trim();
  el('contentStatusText').textContent=message;
}
function showFeedback(text){
  feedback.textContent=text;
  feedback.classList.add('visible');
  clearTimeout(feedbackTimer);
  feedbackTimer=setTimeout(()=>feedback.classList.remove('visible'),1900);
}
function showToast(text){
  el('gestureToast').textContent=text;
  el('gestureToast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>el('gestureToast').classList.remove('show'),1000);
}
function idleSeconds(){
  return current===2
    ? clamp(Number(content.behavior?.payaw_timeout_seconds)||55,15,300)
    : clamp(Number(content.behavior?.idle_return_seconds)||45,15,600);
}
function resetIdle(){
  clearTimeout(idleTimer);
  if(automaticSlide || current!==0){
    idleTimer=setTimeout(()=>{
      if(automaticSlide && current===1 && content.payaw?.enabled!==false){
        showScreen(2,false,true);
      }else{
        showScreen(0,false);
      }
    },automaticSlide?PROMOTION_INTERVAL:idleSeconds()*1000);
  }
}
function refreshSlideTimer(){
  clearTimeout(slideTimer);
  slideTimer=null;
  if(current!==0 || !posReady || !posProducts.length)return;
  slideTimer=setTimeout(()=>{
    if(activeSlideIndex===posProducts.length-1){
      activeSlideIndex=0;
      renderSlide();
      showScreen(1,false,true);
    }else{
      activeSlideIndex++;
      renderSlide();
      refreshSlideTimer();
    }
  },SLIDE_INTERVAL);
}
function renderSlide(){
  const p=posProducts[activeSlideIndex];if(!p)return;
  el('slideNumber').textContent=(activeSlideIndex+1)+' / '+posProducts.length;
  el('slideName').textContent=p.name;
  const category=String(p.category||'CUKI FAVORITE').trim();
  el('slideCategory').textContent=category.toUpperCase();
  el('slideBadge').textContent=category.toUpperCase();
  el('slidePrice').textContent=(p.currency||'AWG')+' '+(p.price_minor/100).toFixed(2);
  el('slideAvailability').textContent=p.available?'AVAILABLE':'SOLD OUT';
  el('slideAvailability').classList.toggle('sold-out',!p.available);
  el('slideProgress').innerHTML=posProducts.map((_,i)=>'<span class="'+(i===activeSlideIndex?'active':'')+'"></span>').join('');
  const img=el('slidePhoto'),fallback=el('photoFallback');
  img.onload=()=>{img.classList.remove('hidden');fallback.classList.add('hidden')};
  img.onerror=()=>{img.classList.add('hidden');fallback.classList.remove('hidden')};
  img.alt='CUKI POS photo: '+p.name;
  // POS images can change independently; bypass browser and server photo caches periodically.
  const url='/api/pos/photo/'+p.id+'?v='+Math.floor(Date.now()/60000);
  if(img.getAttribute('src')!==url){img.classList.add('hidden');fallback.classList.remove('hidden');img.src=url}
}
async function pollPos(){
  try{
    const r=await fetch('/api/pos/weekly',{cache:'no-store'});
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||'CUKI POS unreachable');
    if(d.menu_status==='not_published'){
      posProducts=[];posReady=false;
      refreshSlideTimer();
      el('liveSlideshow').classList.add('hidden');
      el('menuPosterImage').classList.add('hidden');
      el('menuPoster').classList.remove('hidden');
      el('menuTitle').textContent='This week’s menu is coming soon.';
      el('menuSubtitle').textContent='Check back for the next CUKI drop ♡';
      el('menuSections').innerHTML='';
      setStatus('Awaiting published POS menu','offline');return;
    }
    if(!d.products.length){
      posReady=false;posProducts=[];refreshSlideTimer();
      el('liveSlideshow').classList.add('hidden');
      setStatus('No CUKIs published','offline');return;
    }
    const next=d.products.map(p=>({...p,currency:d.currency||'AWG'}));
    const signature=JSON.stringify(next);
    if(!posReady || signature!==lastProductSignature){
      const selectedId=posProducts[activeSlideIndex]?.id;
      posProducts=next;
      activeSlideIndex=Math.max(0,posProducts.findIndex(p=>p.id===selectedId));
      lastProductSignature=signature;
    }
    posReady=true;
    if(!slideTimer)refreshSlideTimer();
    renderSlide();
    el('liveSlideshow').classList.remove('hidden');
    el('menuPoster').classList.add('hidden');
    el('menuPosterImage').classList.add('hidden');
    setStatus(d._source==='live'?'LIVE · CUKI POS':'Saved POS menu',d._source==='live'?'live':'offline');
  }catch(e){
    console.warn('Live CUKI POS refresh failed:',e.message);
    if(posProducts.length){posReady=true;setStatus('Last POS menu · offline','offline');return;}
    // Built-in brand poster is the safe fallback when the POS has not connected yet.
    setStatus('POS not connected · showing poster','offline');
  }
}
function startPosPolling(){
  clearInterval(posPollTimer);
  pollPos();
  posPollTimer=setInterval(pollPos,20000);
}
function showReadyCallout(orders){
  const incoming=orders.map(order=>Number(order.id)).filter(id=>Number.isInteger(id)&&id>0);
  readyActiveIds=[...new Set([...readyActiveIds,...incoming])].slice(-8);
  if(!readyActiveIds.length)return;
  readyHeading.textContent=readyActiveIds.length===1?'YOUR ORDER IS READY!':'YOUR ORDERS ARE READY!';
  readyOrderNumbers.textContent=readyActiveIds.map(id=>'#'+String(id).padStart(3,'0')).join('  ·  ');
  readyCallout.classList.remove('hidden');
  requestAnimationFrame(()=>readyCallout.classList.add('visible'));
  clearTimeout(readyCalloutTimer);
  readyCalloutTimer=setTimeout(()=>{
    readyCallout.classList.remove('visible');
    setTimeout(()=>readyCallout.classList.add('hidden'),350);
    readyActiveIds=[];
  },12000);
}
async function pollReadyOrders(){
  const pollStartedAt=Date.now();
  try{
    const response=await fetch('/api/pos/ready-orders',{cache:'no-store'});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'Ready-order feed unavailable');
    const orders=Array.isArray(data.orders)?data.orders:[];
    const fresh=orders.filter(order=>{
      const id=String(order.id??'');
      const readyAt=Date.parse(order.prepared_at||'');
      return /^\\d+$/.test(id)&&Number.isFinite(readyAt)&&readyAt>lastReadyPollStarted-30000&&!readySeenIds.has(id);
    });
    for(const order of orders){
      if(order.id!==undefined&&order.id!==null)readySeenIds.add(String(order.id));
    }
    readySeenIds=new Set([...readySeenIds].slice(-150));
    lastReadyPollStarted=pollStartedAt;
    localStorage.setItem('cukiReadySeenIds',JSON.stringify([...readySeenIds]));
    localStorage.setItem('cukiReadyLastPollAt',String(lastReadyPollStarted));
    if(fresh.length)showReadyCallout(fresh);
  }catch(error){
    console.warn('CUKI kitchen ready-order check failed:',error.message);
  }
}
function startReadyPolling(){
  clearInterval(readyPollTimer);
  pollReadyOrders();
  readyPollTimer=setInterval(pollReadyOrders,5000);
}
function showScreen(next,toast=true,promotionSlide=false){
  current=clamp(next,0,2);
  automaticSlide=promotionSlide;
  screens.forEach((screen,index)=>{
    screen.classList.remove('active','before');
    if(index===current)screen.classList.add('active');
    if(index<current)screen.classList.add('before');
  });
  if(toast)showToast(['THIS WEEK AT CUKI','THE ICONIC CUKI CLUB','PAY.AW · SCAN TO PAY'][current]);
  resetIdle();
  refreshSlideTimer();
}
function speakOnlyForVoiceRequest(text){
  // The app never speaks on launch, gestures, idle, refresh or keyboard shortcuts.
  // Speak one short response only when a recognized voice request arrives.
  if(content.behavior?.voice_requests_enabled===false || content.behavior?.respond_to_voice_requests===false || content.behavior?.voice_only_when_asked===false)return;
  if(!('speechSynthesis' in window))return;
  try{
    speechSynthesis.cancel();
    const utterance=new SpeechSynthesisUtterance(text);
    utterance.volume=.7;utterance.rate=1.04;utterance.pitch=1;
    speechSynthesis.speak(utterance);
  }catch(error){console.warn('Voice response unavailable',error)}
}
function navigateByVoice(command){
  if(content.behavior?.voice_requests_enabled===false)return;
  if(command==='payaw'){
    if(content.payaw?.enabled!==false){showScreen(2,false);showFeedback('PAY.AW READY');speakOnlyForVoiceRequest('Here is the Pay.aw QR code.');}
  }else if(command==='club'){
    showScreen(1,false);showFeedback('CUKI CLUB');speakOnlyForVoiceRequest('Scan to join CUKI Club.');
  }else if(command==='menu'){
    showScreen(0,false);showFeedback('WEEKLY MENU');speakOnlyForVoiceRequest('Here is this week’s menu.');
  }
}
function connectVoice(){
  const events=new EventSource('/api/voice/events');
  events.onmessage=message=>{
    try{
      const data=JSON.parse(message.data);
      if(data.type==='command' && typeof data.command==='string')navigateByVoice(data.command);
      if(data.type==='status' && data.state==='unavailable')console.warn('Windows speech recognizer unavailable. Use keyboard fallback.');
    }catch(e){console.warn('Voice event parse error',e)}
  };
  events.onerror=()=>console.warn('Windows voice stream disconnected');
}
function render(){
  const m=content.menu||base.menu,c=content.club||base.club;
  el('menuEyebrow').textContent=m.eyebrow||'THIS WEEK AT CUKI';
  el('menuDate').textContent=m.date_label||'';
  el('menuTitle').textContent=m.title||'Your Saturday favorites.';
  el('menuSubtitle').textContent=m.subtitle||'';
  const sections=Array.isArray(m.sections)?m.sections:[];
  el('menuSections').innerHTML=sections.map(section=>
    `<section class="menu-section-card"><h2>${escapeHTML(section.title||'')}</h2><div class="menu-items">${
      (Array.isArray(section.items)?section.items:[]).map(item=>`<div class="menu-item">${escapeHTML(typeof item==='string'?item:item?.name||'')}</div>`).join('')
    }</div></section>`
  ).join('');
  const posterImg=el('menuPosterImage'),poster=el('menuPoster');
  // Live POS slideshow wins over remote fallback poster content when connected.
  if(posReady){posterImg.classList.add('hidden');poster.classList.add('hidden');el('liveSlideshow').classList.remove('hidden');}

  const imageUrl=typeof m.image_url==='string'?m.image_url.trim():'';
  if(imageUrl && (imageUrl.startsWith('https://')||imageUrl.startsWith('/media/'))){
    const onError=()=>{posterImg.classList.add('hidden');poster.classList.remove('hidden');console.warn('Weekly menu image unavailable, showing menu fallback')};
    posterImg.onload=()=>{posterImg.classList.remove('hidden');poster.classList.add('hidden')};
    posterImg.onerror=onError;
    posterImg.src=imageUrl;
  }else{
    posterImg.removeAttribute('src');posterImg.classList.add('hidden');poster.classList.remove('hidden');
  }
  if(posReady){posterImg.classList.add('hidden');poster.classList.add('hidden');el('liveSlideshow').classList.remove('hidden');}
  el('clubTitle').innerHTML=escapeHTML(c.title||'THE ICONIC CUKI CLUB').replace(/\s+CUKI CLUB$/i,'<br>CUKI CLUB');
  el('clubSubtitle').textContent=c.subtitle||'Good taste deserves perks.';
  el('clubCta').textContent=c.cta||'SCAN TO JOIN';
  el('clubFooter').textContent=c.footer||'1 box. 1 stamp. More to look forward to.';
  const url=(typeof c.join_url==='string'&&c.join_url.startsWith('https://'))?c.join_url:base.club.join_url;
  el('clubQr').src='/api/qr?url='+encodeURIComponent(url);
  resetIdle();
}
async function refreshContent(){
  try{
    const response=await fetch('/api/content',{cache:'no-store'});
    if(!response.ok)throw new Error('Content request '+response.status);
    const data=await response.json();
    content={...base,...data,
      menu:{...base.menu,...(data.menu||{})},
      club:{...base.club,...(data.club||{})},
      behavior:{...base.behavior,...(data.behavior||{})},
      payaw:{enabled:true,...(data.payaw||{})}
    };
    try{localStorage.setItem('cukiDisplayCache',JSON.stringify(content))}catch{}
    render();
    setStatus(data._source==='remote'?'Display updated':data._source==='cache'?'Last saved menu':'Local menu',data._source==='remote'?'live':'offline');
  }catch(e){
    console.warn('Display content update failed',e);
    try{
      const saved=JSON.parse(localStorage.getItem('cukiDisplayCache')||'null');
      if(saved&&saved.menu&&saved.club){content=saved;render();setStatus('Last saved menu','offline');return;}
    }catch{}
    render();setStatus('Built-in display','offline');
  }
}
function scheduleRefresh(){
  clearTimeout(refreshTimer);
  const minutes=clamp(Number(content.behavior?.refresh_minutes)||5,1,1440);
  refreshTimer=setTimeout(async()=>{await refreshContent();scheduleRefresh()},minutes*60000);
}

// Deliberate vertical hand swipe recognition (not ordinary motion).
function center(lm){let x=0,y=0;for(const id of [0,5,9,13,17]){x+=lm[id].x;y+=lm[id].y}return{x:x/5,y:y/5};}
function recognizeSwipe(now){
  const samples=handHistory.filter(s=>now-s.t<=700);
  if(samples.length<6)return null;
  const first=samples[0],last=samples.at(-1),elapsed=Math.max(1,last.t-first.t);
  const dx=last.x-first.x,dy=last.y-first.y,adx=Math.abs(dx),ady=Math.abs(dy);
  if(elapsed<260||elapsed>700||ady<.115||adx>ady*.55||ady/elapsed<.00019)return null;
  let aligned=0,opposite=0,steps=0;
  for(let i=1;i<samples.length;i++){
    const delta=samples[i].y-samples[i-1].y;
    if(Math.abs(delta)<.003)continue;
    steps++;if(Math.sign(delta)===Math.sign(dy))aligned++;else opposite++;
  }
  if(steps<4||aligned/steps<.72||opposite>2)return null;
  const xs=samples.map(p=>p.x);
  if(Math.max(...xs)-Math.min(...xs)>.14)return null;
  return dy>0?'down':'up';
}
function drawDebug(lm){
  if(el('gestureDebug').classList.contains('hidden'))return;
  const w=debugCanvas.width,h=debugCanvas.height;
  debugCtx.clearRect(0,0,w,h);
  if(visionCamera.videoWidth){debugCtx.save();debugCtx.translate(w,0);debugCtx.scale(-1,1);debugCtx.drawImage(visionCamera,0,0,w,h);debugCtx.restore();}
  if(lm){debugCtx.fillStyle='#fff';for(const point of lm){debugCtx.beginPath();debugCtx.arc((1-point.x)*w,point.y*h,3,0,2*Math.PI);debugCtx.fill();}}
}
function processGestures(result,now){
  const lm=result?.landmarks?.[0];
  if(!lm){handHistory=[];el('debugText').textContent='NO HAND';drawDebug(null);return;}
  el('debugText').textContent='HAND TRACKING';drawDebug(lm);
  const c=center(lm);handHistory.push({x:c.x,y:c.y,t:now});
  handHistory=handHistory.filter(p=>now-p.t<=900);
  if(now<cooldownUntil)return;
  const direction=recognizeSwipe(now);if(!direction)return;
  handHistory=[];cooldownUntil=now+1500;
  if(direction==='up')showScreen(0);
  else if(current===0)showScreen(1);
  // A downward swipe on the Club screen does not open Pay.aw.
}
function loop(now){
  requestAnimationFrame(loop);
  if(!gestureRecognizer||!visionCamera.videoWidth||now-lastFrame<70)return;
  lastFrame=now;
  try{processGestures(gestureRecognizer.recognizeForVideo(visionCamera,now),now);}catch(e){console.warn('Hand recognition error',e);}
}
async function startHandTracking(){
  try{
    const stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},facingMode:'user'},audio:false});
    visionCamera.srcObject=stream;await visionCamera.play();
    const fileset=await FilesetResolver.forVisionTasks('/vendor/wasm');
    const opts={baseOptions:{modelAssetPath:'/models/gesture_recognizer.task',delegate:'GPU'},runningMode:'VIDEO',numHands:1};
    try{gestureRecognizer=await GestureRecognizer.createFromOptions(fileset,opts)}
    catch{opts.baseOptions.delegate='CPU';gestureRecognizer=await GestureRecognizer.createFromOptions(fileset,opts)}
    el('debugText').textContent='HAND TRACKING READY';requestAnimationFrame(loop);
  }catch(e){console.warn('Camera/gesture detection unavailable',e);el('debugText').textContent='GESTURES UNAVAILABLE';}
}
addEventListener('keydown',e=>{
  if(e.key==='ArrowUp'||e.key.toLowerCase()==='m'){showScreen(0);return;}
  if(e.key==='ArrowDown'||e.key.toLowerCase()==='c'){showScreen(1);return;}
  if(e.key.toLowerCase()==='p'){showScreen(2);return;}
  if(e.key.toLowerCase()==='g'){el('gestureDebug').classList.toggle('hidden');return;}
  if(e.key==='Escape'&&current===2){showScreen(0);return;}
});
document.addEventListener('click',()=>{if(!automaticSlide)resetIdle();});
connectVoice();
await refreshContent();scheduleRefresh();showScreen(0,false);startPosPolling();startReadyPolling();startHandTracking();
