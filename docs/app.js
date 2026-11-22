'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stateClass=s=>({bull:'bull',bear:'bear',wash:'warn',warn:'warn',na:'na','BULLISH':'bull','BEARISH':'bear','RISK-ON':'bull','RISK-OFF':'bear','CAUTION':'warn','INCOMPLETE':'neutral'}[s]||'neutral');
const tone=s=>(s==='IMPROVING'||s==='BULLISH'?'goodtext':s==='DETERIORATING'||s==='BEARISH'?'badtext':'warntext');
const num=(x,dp=1)=>x==null?'—':Number(x).toFixed(dp);
const scoreFormat=s=>s.complete?`${s.bearish}/15`:`${s.bearish}–${s.possible_max}/15`;
const plus=n=>n==null?'—':`${n>0?'+':''}${n}`;
let snapshot=null,horizon=30;
function summary(prefix,model){
 const s=model.score,m=model.momentum,c=model.confirmation;
 $(prefix+'-score').textContent=scoreFormat(s);
 $(prefix+'-coverage').textContent=`${s.available}/15 signals available${s.complete?'':' · score range'}`;
 const status=$(prefix+'-regime');status.textContent=s.regime;status.className='regime '+stateClass(s.regime);
 $(prefix+'-meter').style.width=((s.bearish/15)*100).toFixed(1)+'%';
 const tr=$(prefix+'-trend');tr.textContent=m.state;tr.className=tone(m.state);
 $(prefix+'-delta').textContent=`1D ${plus(m.d1)} · 5D ${plus(m.d5)}${m.partial?' · partial':''}`;
 $(prefix+'-confirm').textContent=`${c.confirmed}/${c.available} available`;
 const sw=$(prefix+'-swing');sw.textContent=model.swing;sw.className=tone(model.swing);
}
function signals(container,keys){
 const root=$(container);root.innerHTML='';
 for(const key of keys){
  const sig=snapshot.signals?.[key]||{state:'na',label:'N/A',note:'No market data'};
  const row=document.createElement('div'); row.className='signal';
  const val=sig.value==null?'':Number(sig.value).toFixed(2)+(key.includes('breadth')?'':'');
  const isEstimated = /EXPERIMENTAL/i.test(sig.source || '');
  const detail = (sig.note || sig.source || '') + (isEstimated ? ' · ESTIMATED (constituent-derived)' : '');
  row.innerHTML=`<div><div class="signal-title">${esc(snapshot.names?.[key]||key)}</div><div class="signal-note">${esc(detail)}</div></div><div class="signal-right"><span class="regime ${stateClass(sig.state)}">${esc(sig.label||'N/A')}</span>${val?`<span class="signal-val">${esc(val)}${(key==='sp_breadth200'||key==='nd_breadth1d')?'%':key.includes('breadth')?' pp':''}</span>`:''}</div>`;
  root.appendChild(row);
 }
}
function plot(history){
 const svg=$('history-svg');svg.replaceChildren();
 const data=(history||[]).slice(-horizon);
 const W=960,H=230,left=42,right=17,top=18,bottom=39;
 const el=(tag,attrs={})=>{let e=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));svg.appendChild(e);return e;};
 const x=i=>left+(data.length<=1?0:i/(data.length-1))*(W-left-right);
 const y=v=>top+(15-v)/15*(H-top-bottom);
 for(let v=0;v<=15;v+=5){el('line',{x1:left,x2:W-right,y1:y(v),y2:y(v),stroke:'#2b394b','stroke-width':'1'});let t=el('text',{x:10,y:y(v)+4,fill:'#8092ac','font-size':'11'});t.textContent=String(v);}
 if(data.length<2){let t=el('text',{x:W/2,y:105,'text-anchor':'middle',fill:'#8092ac','font-size':'15'});t.textContent='History will appear after the first data update';return;}
 for(const [k,color] of [['sp','#34e2a4'],['nd','#7fbcfc']]){
  // Break line on missing scores and overlay low-opacity dots for partial coverage.
  let path='';data.forEach((row,i)=>{const v=row[k];if(v==null)return;path+=(path?' L':'M')+x(i).toFixed(1)+','+y(v).toFixed(1)});
  if(path)el('path',{d:path,stroke:color,fill:'none','stroke-width':2.4,'stroke-linecap':'round','stroke-linejoin':'round'});
  data.forEach((row,i)=>{if(row[k]!=null && row[k+'_available']<15)el('circle',{cx:x(i),cy:y(row[k]),r:2.5,fill:color,opacity:.35});});
 }
 [0,Math.floor((data.length-1)/2),data.length-1].forEach(i=>{const t=el('text',{x:x(i),y:H-9,'text-anchor':'middle',fill:'#8092ac','font-size':'11'});t.textContent=data[i]?.date?.slice(5)||'';});
}
function render(data){
 snapshot=data;
 $('session').textContent=data.session||'—';
 $('feed-state').textContent=data.session?'End-of-day snapshot':'Not yet initialized';
 $('latest-run').textContent=data.generated_at?`Updated ${new Date(data.generated_at).toLocaleString()}`:'Awaiting first update';
 $('status-dot').className='status-dot '+(data.generated_at?'good':'warn');
 if(!data.markets?.sp500 || !data.markets?.nasdaq100){$('warning').textContent='The website is installed, but no market update has run. Open GitHub → Actions → Refresh EOD dashboard → Run workflow.';return;}
 summary('sp',data.markets.sp500); summary('nd',data.markets.nasdaq100);
 signals('sp-signals',data.order.sp500);signals('nd-signals',data.order.nasdaq100);signals('shared-signals',data.order.shared);
 $('coverage-note').textContent=data.explanation?.partial||'';
 const all=data.markets.sp500.score.complete && data.markets.nasdaq100.score.complete;
 $('warning').textContent=all?'Complete daily-bar inputs reported. Validate vendor timing and prices against Thinkorswim.':'PARTIAL FEEDS: This is not your full Thinkorswim score. Available data may support only a bounded risk classification; missing inputs are not bullish.';
 $('diagnostics').textContent=JSON.stringify({sources:data.sources,warnings:data.warnings},null,2);
 plot(data.history);
}
async function load(){
 try{const res=await fetch('data/latest.json?refresh='+Date.now(),{cache:'no-store'});if(!res.ok)throw Error('HTTP '+res.status);const data=await res.json();render(data)}
 catch(err){$('warning').textContent='Unable to read the latest published JSON: '+err.message; $('status-dot').className='status-dot warn';}
}
$('refresh').addEventListener('click',load);
for(const n of [30,90])$('hist'+n).addEventListener('click',()=>{horizon=n; $('hist30').classList.toggle('active',n===30);$('hist90').classList.toggle('active',n===90);if(snapshot)plot(snapshot.history)});
load();
