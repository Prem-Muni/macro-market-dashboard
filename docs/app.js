'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stateClass=s=>({bull:'bull',bear:'bear',wash:'warn',warn:'warn',na:'na',info:'info','BULLISH':'bull','BEARISH':'bear','RISK-ON':'bull','RISK-OFF':'bear','CAUTION':'warn','INCOMPLETE':'neutral'}[s]||'neutral');
const tone=s=>(s==='IMPROVING'||s==='BULLISH'?'goodtext':s==='DETERIORATING'||s==='BEARISH'?'badtext':'warntext');
const num=(x,dp=1)=>x==null?'—':Number(x).toFixed(dp);
const scoreFormat=s=>s.complete?`${s.bearish}/${s.total}`:`${s.bearish}–${s.possible_max}/${s.total}`;
const plus=n=>n==null?'—':`${n>0?'+':''}${n}`;
const rangeText=r=>!Array.isArray(r)||r[0]==null?'—':r[0]===r[1]?plus(r[0]):`${plus(r[0])}…${plus(r[1])}`;
let snapshot=null,horizon=30;
function summary(prefix,model){
 const s=model.score,m=model.momentum,c=model.confirmation;
 $(prefix+'-score').textContent=scoreFormat(s);
 $(prefix+'-coverage').textContent=`${s.available}/${s.total} signals available${s.complete?'':' · score range'}`;
 const base=$(prefix+'-baseline');
 if(base)base.textContent=model.legacy_14?`Original 14-point model: ${scoreFormat(model.legacy_14)} (reference only)`:'Original 14-point model: —';
 const status=$(prefix+'-regime');status.textContent=s.regime;status.className='regime '+stateClass(s.regime);
 const card=$(prefix+'-card');if(card)card.dataset.regime=s.regime||'INCOMPLETE';
 const score=$(prefix+'-score');if(score)score.setAttribute('aria-label',`${prefix==='sp'?'S&P 500':'Nasdaq-100'}: ${scoreFormat(s)} bearish conditions, ${s.regime}`);
 $(prefix+'-meter').style.width=((s.bearish/s.total)*100).toFixed(1)+'%';
 const tr=$(prefix+'-trend');tr.textContent=m.state;tr.className=tone(m.state);
 $(prefix+'-delta').textContent=`1D ${rangeText(m.d1_range)} · 5D ${rangeText(m.d5_range)}${m.partial?' · bounded':''}`;
 $(prefix+'-confirm').textContent=c.available===c.total?`${c.confirmed}/${c.total} IMPROVING`:`${c.confirmed}/${c.available} improving · ${c.available}/${c.total} checked`;
 const sw=$(prefix+'-swing');sw.textContent=model.swing;sw.className=tone(model.swing);
 if(prefix==='nd'){
  const borderline=$('nd-borderline');
  if(borderline) borderline.hidden=!(s.complete && s.bearish===5 && s.regime==='RISK-ON');
 }
}
function signals(container,keys){
 const root=$(container);root.innerHTML='';
 for(const key of keys){
  // Never display legacy put/call rows, even when an older cached snapshot contains them.
  if (['sp_pcsp','nd_pcnd','spx_pc','ndx_pc','sp_pc','nd_pc'].includes(key)) continue;
  const sig=snapshot.signals?.[key]||{state:'na',label:'N/A',note:'No market data'};
  const row=document.createElement('div'); row.className='signal';
  const isRelative=['rsp_spy','iwm_spy','qqqe_qqq','iwm_qqq'].includes(key);
  const val=sig.value==null?'':(isRelative&&sig.value>0?'+':'')+Number(sig.value).toFixed(2);
  const isEstimated = /EXPERIMENTAL/i.test(sig.source || '');
  const detail = (sig.note || sig.source || '') + (isEstimated ? ' · ESTIMATED (constituent-derived)' : '');
  const suffix = isRelative?'%':(key==='sp_breadth200'||key==='nd_breadth1d')?'%':key.includes('breadth')?' pp':'';
  row.innerHTML=`<div><div class="signal-title">${esc(snapshot.names?.[key]||key)}</div><div class="signal-note">${esc(detail)}</div></div><div class="signal-right"><span class="regime ${stateClass(sig.state)}">${esc(sig.label||'N/A')}</span>${val?`<span class="signal-val">${esc(val)}${suffix}</span>`:''}</div>`;
  root.appendChild(row);
 }
}
// The 30/90 selectors refer to TRADING SESSIONS, not calendar days.
// Dates are taken from each underlying session record and placed at that
// record's exact X position. Weekend/holiday gaps are intentionally compressed.
const sessionDate=s=>{
 if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return s||'—';
 const [yyyy,mm,dd]=s.split('-').map(Number);
 return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][mm-1]||mm} ${dd}`;
};
function plot(history){
 const svg=$('history-svg');svg.replaceChildren();
 const all=history||[];
 const data=horizon===30||horizon===90?all.slice(-horizon):
  horizon==='year'&&all.length?all.filter(r=>Date.parse(r.date+'T00:00:00Z')>=Date.parse(all.at(-1).date+'T00:00:00Z')-365*86400000):
  all;
 const W=960,H=245,left=45,right=26,top=20,bottom=46;
 svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
 const el=(tag,attrs={},parent=svg)=>{
  const e=document.createElementNS('http://www.w3.org/2000/svg',tag);
  Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));
  parent.appendChild(e);return e;
 };
 const x=i=>left+(data.length<=1?0:i/(data.length-1))*(W-left-right);
 const maxPts=Number(snapshot?.markets?.sp500?.score?.total)||14;
 const y=v=>top+(maxPts-v)/maxPts*(H-top-bottom);
 const range=$('chart-range');
 if(range)range.textContent=data.length?
  `${data.length} trading sessions · ${sessionDate(data[0].date)} – ${sessionDate(data.at(-1).date)}, ${String(data.at(-1).date||'').slice(0,4)}`:
  'No trading-session history yet';
 svg.setAttribute('aria-label',`S&P 500 and Nasdaq-100 bearish scores, last ${data.length} trading sessions, out of ${maxPts}`);
 const yticks=[...new Set([0,5,10,maxPts].filter(v=>v<=maxPts))].sort((a,b)=>a-b);
 for(const v of yticks){
  el('line',{x1:left,x2:W-right,y1:y(v),y2:y(v),stroke:'#2b394b','stroke-width':1});
  const t=el('text',{x:13,y:y(v)+4,fill:'#8092ac','font-size':11}); t.textContent=String(v);
 }
 if(data.length<2){
  const t=el('text',{x:W/2,y:105,'text-anchor':'middle',fill:'#8092ac','font-size':15});
  t.textContent='History will appear after additional data updates';return;
 }
 // Seven evenly spaced labels for 30/90 sessions; each is the ACTUAL date
 // from the record at that chart X position—not a fabricated calendar tick.
 const spacing=Math.max(1,Math.ceil((data.length-1)/6));
 const ticks=[];
 for(let i=0;i<data.length;i+=spacing)ticks.push(i);
 if(ticks[ticks.length-1]!==data.length-1){
  if(ticks.length>1 && data.length-1-ticks[ticks.length-1]<3)ticks.pop();
  ticks.push(data.length-1);
 }
 for(const i of ticks){
  el('line',{x1:x(i),x2:x(i),y1:top,y2:H-bottom,stroke:'#334257','stroke-width':0.85,'stroke-dasharray':'3 7',opacity:0.58});
  const t=el('text',{x:x(i),y:H-15,
   'text-anchor':i===0?'start':i===data.length-1?'end':'middle',
   fill:'#9bb0cb','font-size':11});
  t.textContent=sessionDate(data[i].date);
 }
 for(const [k,color,market] of [['sp','#34e2a4','S&P 500'],['nd','#7fbcfc','Nasdaq-100']]){
  let path='',drawing=false;
  data.forEach((row,i)=>{
   const v=Number(row[k]);
   if(row[k]==null||!Number.isFinite(v)){drawing=false;return;}
   path+=(drawing?' L':' M')+x(i).toFixed(1)+','+y(v).toFixed(1); drawing=true;
  });
  if(path)el('path',{d:path.trim(),stroke:color,fill:'none','stroke-width':2.4,'stroke-linecap':'round','stroke-linejoin':'round'});
  data.forEach((row,i)=>{
   const v=Number(row[k]);
   if(row[k]==null||!Number.isFinite(v))return;
   const partial=Number(row[k+'_available'])<maxPts;
   const dot=el('circle',{cx:x(i),cy:y(v),r:partial?3:2.2,fill:color,opacity:partial?0.45:0.95});
   const tip=el('title',{},dot);
   tip.textContent=`${market} · ${row.date} · ${v}/${maxPts} bearish points${partial?' (partial coverage)':''}`;
  });
 }
}


// EOD SMA and RSI context; all five SMA comparisons are informational.
// The original 50D/200D trend signal and RSI14 are scored once each.
function renderMovingAverages(data){
 const all=data.moving_averages||{};
 for(const sym of ['spy','qqq']){
  const info=all[sym]||{};
  const close=Number(info.close);
  const hasClose=info.close!=null && Number.isFinite(close) && close>0;
  $(sym+'-ma-close').textContent=hasClose?`$${close.toFixed(2)}`:'—';
  $(sym+'-ma-asof').textContent=info.as_of?`As of ${info.as_of} close`:'Awaiting EOD update';
  for(const period of [5,20,50,100,200]){
   const item=info.averages?.[String(period)]||{};
   const v=Number(item.value), pct=Number(item.distance_pct);
   const valid=item.value!=null && Number.isFinite(v) && v>0;
   $(sym+'-ma'+period).textContent=valid?`$${v.toFixed(2)}`:'—';
   const gap=$(sym+'-ma'+period+'-gap');
   if(!valid || !hasClose){gap.textContent='Not available';gap.className='ma-gap';continue;}
   const delta=(item.distance_pct==null || !Number.isFinite(pct)) ? ((close/v-1)*100) : pct;
   // Compare true unrounded prices when supplied by the EOD engine. If the
   // legacy payload has no state, equality is BULLISH (>=), never neutral.
   const bullish=item.state==='BULLISH'?true:item.state==='BEARISH'?false:close>=v;
   const atAverage=close===v;
   const distance=atAverage?'At average':`${Math.abs(delta).toFixed(2)}% ${bullish?'above':'below'}`;
   gap.textContent=`${bullish?'BULLISH':'BEARISH'} · ${distance}`;
   gap.className='ma-gap '+(bullish?'ma-above':'ma-below');
  }
  const raw=info.rsi?.value;
  const rsi=raw==null?NaN:Number(raw);
  const validRsi=Number.isFinite(rsi) && rsi>=0 && rsi<=100;
  $(sym+'-rsi14').textContent=validRsi?rsi.toFixed(2):'—';
  const state=$(sym+'-rsi14-state');
  // Recompute classification from the number so old cached labels cannot drift.
  state.textContent=!validRsi?'Not available':rsi>=70?'Overbought':rsi<=30?'Oversold':'Neutral';
  state.className='rsi-state '+(!validRsi?'':rsi>=70?'rsi-overbought':rsi<=30?'rsi-oversold':'rsi-neutral');
  const marker=$(sym+'-rsi14-marker');
  marker.style.left=validRsi?`${rsi}%`:'50%';
  marker.style.opacity=validRsi?'1':'0';
 }
}
function renderDecisionBrief(data){
 const sp=data.markets?.sp500,nd=data.markets?.nasdaq100;
 if(!sp||!nd)return;
 const regimes=[sp.score?.regime||'INCOMPLETE',nd.score?.regime||'INCOMPLETE'];
 let headline;
 if(regimes.every(x=>x==='RISK-ON'))headline='Both benchmarks are in Risk-On';
 else if(regimes.every(x=>x==='RISK-OFF'))headline='Both benchmarks are in Risk-Off';
 else if(regimes.every(x=>x==='CAUTION'))headline='Both benchmarks are in Caution';
 else if(regimes.includes('INCOMPLETE'))headline='Mixed coverage — review missing data';
 else headline=`Mixed regimes · SPY ${regimes[0]} · QQQ ${regimes[1]}`;
 const el=$('brief-title');el.textContent=headline;
 el.className=regimes.every(x=>x==='RISK-ON')?'brief-good':regimes.every(x=>x==='RISK-OFF')?'brief-bad':'brief-caution';
 $('brief-detail').textContent='Regime is a model classification, not a forecast. Cross-check momentum and confirmation before interpreting it.';
 for(const [id,market] of [['brief-sp-momentum',sp],['brief-qqq-momentum',nd]]){
  const node=$(id),label=market.momentum?.state||'UNKNOWN';
  node.textContent=label;node.className=tone(label);
 }
 const sc=sp.confirmation||{},nc=nd.confirmation||{};
 const fmt=c=>c.confirmed!=null&&c.total!=null&&Number.isFinite(Number(c.confirmed))&&Number.isFinite(Number(c.total))?`${c.confirmed}/${c.total}`:'—';
 $('brief-confirm').textContent=`SPY ${fmt(sc)} · QQQ ${fmt(nc)}`;
}
function render(data){
 snapshot=data;
 $('session').textContent=data.session||'—';
 $('feed-state').textContent=data.session?'End-of-day snapshot':'Not yet initialized';
 $('latest-run').textContent=data.generated_at?`Updated ${new Date(data.generated_at).toLocaleString()}`:'Awaiting first update';
 $('status-dot').className='status-dot '+(data.generated_at?'good':'warn');
 if(!data.markets?.sp500 || !data.markets?.nasdaq100){$('warning').textContent='The website is installed, but no market update has run. Open GitHub → Actions → Refresh EOD dashboard → Run workflow.';return;}
 summary('sp',data.markets.sp500); summary('nd',data.markets.nasdaq100);
 renderDecisionBrief(data);
 signals('sp-signals',data.order.sp500);signals('nd-signals',data.order.nasdaq100);signals('shared-signals',data.order.shared);
 renderMovingAverages(data);
 $('coverage-note').textContent=data.explanation?.partial||'';
 const all=data.markets.sp500.score.complete && data.markets.nasdaq100.score.complete;
 $('warning').textContent=all?'EXPERIMENTAL 15-point model: SPY Risk-On 0–4; QQQ Risk-On 0–5 (score 5 borderline cautious). RSI scored; five SMA rows informational. Thinkorswim remains 14-point.':'EXPERIMENTAL 15-point model: PARTIAL FEEDS. SPY Risk-On 0–4; QQQ Risk-On 0–5 (5 borderline cautious). Missing inputs are not bullish; Thinkorswim remains 14-point.';
 $('diagnostics').textContent=JSON.stringify({sources:data.sources,warnings:data.warnings},null,2);
 plot(data.history);
}
async function load(){
 try{const res=await fetch('data/latest.json?refresh='+Date.now(),{cache:'no-store'});if(!res.ok)throw Error('HTTP '+res.status);const data=await res.json();render(data)}
 catch(err){$('warning').textContent='Unable to read the latest published JSON: '+err.message; $('status-dot').className='status-dot warn';}
}
$('refresh').addEventListener('click',load);
for(const mode of [30,90,'year','all']){
 const id=mode==='year'?'histYear':mode==='all'?'hist20m':'hist'+mode;
 $(id).addEventListener('click',()=>{
  horizon=mode;
  for(const [n,other] of [[30,'hist30'],[90,'hist90'],['year','histYear'],['all','hist20m']])
   $(other).classList.toggle('active',mode===n);
  if(snapshot)plot(snapshot.history);
 });
}
load();
