'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stateClass=s=>({bull:'bull',bear:'bear',wash:'warn',warn:'warn',na:'na',info:'info','BULLISH':'bull','BEARISH':'bear','RISK-ON':'bull','RISK-OFF':'bear','CAUTION':'warn','NEUTRAL':'warn','INCOMPLETE':'neutral'}[s]||'neutral');
const tone=s=>(s==='IMPROVING'||s==='BULLISH'?'goodtext':s==='DETERIORATING'||s==='BEARISH'?'badtext':'warntext');
const num=(x,dp=1)=>x==null?'—':Number(x).toFixed(dp);
const healthRange=s=>s?{min:s.available-s.bearish,max:s.total-s.bearish,total:s.total}:null;
const regimeHealth=s=>{
 const r=healthRange(s);if(!r)return 'INCOMPLETE';
 const regime=v=>v<=5?'RISK-OFF':v<=10?'NEUTRAL':'RISK-ON';
 const a=regime(r.min),b=regime(r.max);return a===b?a:'INCOMPLETE';
};
const scoreFormat=s=>{const r=healthRange(s);return !r?'—/16':r.min===r.max?`${r.min}/${r.total}`:`${r.min}–${r.max}/${r.total}`};
const invertedRange=r=>Array.isArray(r)&&r.length===2&&r.every(v=>v!=null)?[-r[1],-r[0]]:null;
const plus=n=>n==null?'—':`${n>0?'+':''}${n}`;
const rangeText=r=>!Array.isArray(r)||r[0]==null?'—':r[0]===r[1]?plus(r[0]):`${plus(r[0])}…${plus(r[1])}`;
let snapshot=null,horizon=30;
function summary(prefix,model){
 const s=model.score,m=model.momentum,c=model.confirmation;
 $(prefix+'-score').textContent=scoreFormat(s);
 $(prefix+'-coverage').textContent=`${s.available}/${s.total} signals available${s.complete?'':' · score range'}`;
 const base=$(prefix+'-baseline');
 if(base)base.textContent=model.legacy_14?`14-point health reference: ${scoreFormat(model.legacy_14)}`:'14-point health reference: —';
 const r=healthRange(s),regime=regimeHealth(s);
 const status=$(prefix+'-regime');status.textContent=regime;status.className='regime '+stateClass(regime);
 const card=$(prefix+'-card');if(card)card.dataset.regime=regime;
 const score=$(prefix+'-score');if(score)score.setAttribute('aria-label',`${prefix==='sp'?'S&P 500':'Nasdaq-100'} Market Health: ${scoreFormat(s)} (health points may include neutral states), ${regime}`);
 $(prefix+'-meter').style.width=((r.min/r.total)*100).toFixed(1)+'%';
 const tr=$(prefix+'-trend');tr.textContent=m.state;tr.className=tone(m.state);
 $(prefix+'-delta').textContent=`1D ${rangeText(invertedRange(m.d1_range))} · 5D ${rangeText(invertedRange(m.d5_range))}${m.partial?' · bounded':''}`;
 const explanation=m.state==='STABLE'?'STABLE = health changed by −1, 0 or +1 over 5 sessions; prices may still move.':m.state==='IMPROVING'?'IMPROVING = health rose by at least 2 points over 5 sessions.':m.state==='DETERIORATING'?'DETERIORATING = health fell by at least 2 points over 5 sessions.':'5D trend is uncertain until historical scored inputs are available.';
 const guide=$(prefix+'-trend-guide');if(guide)guide.textContent=explanation;
 $(prefix+'-confirm').textContent=c.available===c.total?`${c.confirmed}/${c.total} IMPROVING`:`${c.confirmed}/${c.available} improving · ${c.available}/${c.total} checked`;
 const sw=$(prefix+'-swing');sw.textContent=model.swing;sw.className=tone(model.swing);
 if(prefix==='nd'){
  const borderline=$('nd-borderline');
  if(borderline) borderline.hidden=true;
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
  const change=snapshot.signal_changes?.by_key?.[key];
  if(change==='new_bearish')row.classList.add('signal-new-bearish');
  else if(change==='eased')row.classList.add('signal-eased');
  const changeBadge=change==='new_bearish'?'<span class="signal-change-tag changed-negative">HEALTH −1</span>':
    change==='eased'?'<span class="signal-change-tag changed-positive">HEALTH +1</span>':
    change==='other'?'<span class="signal-change-tag changed-neutral">STATE CHANGED</span>':'';
  row.innerHTML=`<div><div class="signal-title">${esc(snapshot.names?.[key]||key)} ${changeBadge}</div><div class="signal-note">${esc(detail)}</div></div><div class="signal-right"><span class="regime ${stateClass(sig.state)}">${esc(sig.label||'N/A')}</span>${val?`<span class="signal-val">${esc(val)}${suffix}</span>`:''}</div>`;
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
 const W=Math.max(430,Math.min(960,Math.round(svg.getBoundingClientRect().width||620))),H=270,left=42,right=20,top=20,bottom=50;
 svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
 const el=(tag,attrs={},parent=svg)=>{
  const e=document.createElementNS('http://www.w3.org/2000/svg',tag);
  Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));
  parent.appendChild(e);return e;
 };
 const x=i=>left+(data.length<=1?0:i/(data.length-1))*(W-left-right);
 const maxPts=Number(snapshot?.markets?.sp500?.score?.total)||16;
 const y=v=>top+(maxPts-v)/maxPts*(H-top-bottom);
 const range=$('chart-range');
 if(range)range.textContent=data.length?
  `${data.length} trading sessions · ${sessionDate(data[0].date)} – ${sessionDate(data.at(-1).date)}, ${String(data.at(-1).date||'').slice(0,4)}`:
  'No trading-session history yet';
 svg.setAttribute('aria-label',`SPY and QQQ Market Health Scores, last ${data.length} completed sessions, out of ${maxPts}`);
 const yticks=[...new Set([0,5,10,maxPts].filter(v=>v<=maxPts))].sort((a,b)=>a-b);
 for(const v of yticks){
  el('line',{x1:left,x2:W-right,y1:y(v),y2:y(v),stroke:'#2b394b','stroke-width':1});
  const t=el('text',{x:13,y:y(v)+4,fill:'#8092ac','font-size':11}); t.textContent=String(v);
 }
 // Market Health thresholds are between integer scores: 0–5 Off, 6–10 Neutral, 11–16 On.
 for(const [cut,label] of [[5.5,'RISK-OFF / NEUTRAL'],[10.5,'NEUTRAL / RISK-ON']]){
  el('line',{x1:left,x2:W-right,y1:y(cut),y2:y(cut),stroke:'#eac66e','stroke-width':1.6,'stroke-dasharray':'7 5',opacity:.88});
  const marker=el('text',{x:W-right-4,y:y(cut)-5,'text-anchor':'end',fill:'#f1d68d','font-size':10,'font-weight':650});marker.textContent=label;
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
   const avail=Number(row[k+'_available']);
   const shown=(Number.isFinite(avail)?avail:maxPts)-v;
   path+=(drawing?' L':' M')+x(i).toFixed(1)+','+y(shown).toFixed(1); drawing=true;
  });
  if(path)el('path',{d:path.trim(),stroke:color,fill:'none','stroke-width':2.4,'stroke-linecap':'round','stroke-linejoin':'round'});
  data.forEach((row,i)=>{
   const v=Number(row[k]);
   if(row[k]==null||!Number.isFinite(v))return;
   const partial=Number(row[k+'_available'])<maxPts;
   const avail=Number(row[k+'_available']);
   const shown=(Number.isFinite(avail)?avail:maxPts)-v;
   const dot=el('circle',{cx:x(i),cy:y(shown),r:partial?3:2.2,fill:color,opacity:partial?0.45:0.95});
   const tip=el('title',{},dot);
   const lower=shown,upper=maxPts-v;
   const classify=h=>h<=5?'RISK-OFF':h<=10?'NEUTRAL':'RISK-ON';
   const regime=classify(lower)===classify(upper)?classify(lower):'INCOMPLETE';
   tip.textContent=`${market} · ${row.date} · ${lower===upper?lower:lower+'–'+upper}/${maxPts} Market Health · ${regime}${partial?' (partial coverage)':''}`;
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
  // This badge is the RSI SCORING state. The separate 30/70 chart bands
  // represent conventional overbought/oversold context, not the scoring rule.
  state.textContent=!validRsi?'Not available':rsi<45?'Scored bearish':rsi>55?'Scored bullish':'Scored neutral';
  state.className='rsi-state '+(!validRsi?'':rsi<45?'rsi-scored-bear':rsi>55?'rsi-scored-bull':'rsi-scored-neutral');
  state.title=validRsi?(rsi>=70?'Conventional RSI: overbought':rsi<=30?'Conventional RSI: oversold':'Conventional RSI: in the 30–70 band'):'RSI unavailable';
  const marker=$(sym+'-rsi14-marker');
  marker.style.left=validRsi?`${rsi}%`:'50%';
  marker.style.opacity=validRsi?'1':'0';
 }
}
// Daily MACD is the 16th scored signal; displayed values come from same EOD session.
function renderDailyMACD(data){
 const all=data.daily_macd||{};
 for(const sym of ['spy','qqq']){
  const entry=all[sym]||{};
  const ready=entry.status==='complete' && entry.as_of===data.session &&
    [entry.macd,entry.signal,entry.histogram].every(v=>v!=null && Number.isFinite(Number(v)));
  const val=(x)=>ready?Number(x).toFixed(3):'—';
  $(sym+'-macd-line').textContent=val(entry.macd);
  $(sym+'-macd-signal').textContent=val(entry.signal);
  const hist=$(sym+'-macd-histogram');hist.textContent=val(entry.histogram);
  const status=$(sym+'-macd-status');
  const state=$(sym+'-macd-state');
  const published=data.signals?.[sym==='spy'?'sp_macd':'nd_macd']?.state;
  if(state){const tone=ready&&published==='bull'?'bull':ready&&published==='bear'?'bear':null;state.textContent=tone?'SCORED '+(tone==='bull'?'BULLISH':'BEARISH'):'UNAVAILABLE';state.className='rsi-state '+(tone==='bull'?'macd-positive':tone==='bear'?'macd-negative':'macd-neutral');}
  if(!ready){status.textContent='MACD not available for this completed session';status.className='macd-status macd-neutral';hist.className='';continue;}
  const crossover=entry.crossover==='bullish'?' · Bullish crossover':entry.crossover==='bearish'?' · Bearish crossover':'';
  const relation=entry.relation==='above'?'MACD above signal':entry.relation==='below'?'MACD below signal':'MACD equals signal';
  status.textContent=relation+crossover+' · SCORED (16th signal)';
  status.className='macd-status '+(entry.relation==='above'?'macd-positive':entry.relation==='below'?'macd-negative':'macd-neutral');
  hist.className=entry.histogram>0?'macd-positive':entry.histogram<0?'macd-negative':'macd-neutral';
 }
}
// Match the Python engine's six shared keys and ten scored index keys.
// Informational breadth 5D/200D rows are deliberately excluded.
const SCORE_KEYS={
 shared:['oil','usd','tnx','credit','copper','vix_curve'],
 sp:['vix','sp_def','sp_xle','sp_smh','spy_trend','sp_rsi14','sp_macd','rsp_spy','iwm_spy','sp_breadth1d'],
 nd:['vxn','nd_def','nd_xle','nd_smh','qqq_trend','nd_rsi14','nd_macd','qqqe_qqq','iwm_qqq','nd_breadth1d']
};
function groupScore(data,keys){
 const sig=data.signals||{};
 let bearish=0,available=0;
 for(const key of keys){
  const state=sig[key]?.state;
  if(!['bear','bull','warn','wash'].includes(state))continue;
  available++;
  if(state==='bear'||state==='wash')bearish++;
 }
 return {bearish,available,total:keys.length,max:bearish+keys.length-available};
}
function groupScoreLabel(s){const min=s.available-s.bearish,max=s.total-s.bearish;return min===max?`${min}/${s.total}`:`${min}–${max}/${s.total}`;}
function renderScoreBreakdown(data){
 const asOf=(typeof data?.session==='string' && /^\d{4}-\d{2}-\d{2}$/.test(data.session))
   ? new Date(data.session+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}) : 'Session unavailable';
 for(const id of ['sp-breakdown-date','nd-breakdown-date','shared-breakdown-date']){
   const node=$(id);if(node)node.textContent='As of '+asOf+' · completed EOD';
 }
 const shared=groupScore(data,SCORE_KEYS.shared);
 $('shared-subscore').textContent=groupScoreLabel(shared)+' health pts';
 $('shared-breakdown-equation').textContent=`${shared.available}/6 shared macro signals available · Included in both market totals.`;
 for(const [prefix,market] of [['sp','sp500'],['nd','nasdaq100']]){
  const local=groupScore(data,SCORE_KEYS[prefix]);
  const score=data.markets?.[market]?.score;
  const total=score?scoreFormat(score):'—/16';
  $(prefix+'-index-subscore').textContent=groupScoreLabel(local)+' health pts';
  $(prefix+'-breakdown-equation').textContent=`${groupScoreLabel(local)} index-specific + ${groupScoreLabel(shared)} shared macro = ${total} Market Health points (neutral included)`;
  // This is only a display check: the backend remains the authority on scoring.
  // Where complete, flag an unexpected discrepancy rather than hiding it.
  if(score?.complete&&local.available===10&&shared.available===6&&local.bearish+shared.bearish!==score.bearish)
   $(prefix+'-breakdown-equation').textContent+=' · VERIFY SCORE DATA';
 }
}
function renderDecisionBrief(data){
 const sp=data.markets?.sp500,nd=data.markets?.nasdaq100;
 if(!sp||!nd)return;
 const regimes=[regimeHealth(sp.score),regimeHealth(nd.score)];
 let headline;
 if(regimes.every(x=>x==='RISK-ON'))headline='Both benchmarks are in Risk-On';
 else if(regimes.every(x=>x==='RISK-OFF'))headline='Both benchmarks are in Risk-Off';
 else if(regimes.every(x=>x==='NEUTRAL'))headline='Both benchmarks are Neutral';
 else if(regimes.includes('INCOMPLETE'))headline='Mixed coverage — review missing data';
 else headline=`Mixed regimes · SPY ${regimes[0]} · QQQ ${regimes[1]}`;
 const status=eodStatus(data.session);
 const outOfDate=status.kind==='pending'||status.kind==='stale'||status.kind==='unknown';
 const brief=document.querySelector('.decision-brief-intro');
 let asof=$('brief-asof');
 if(!asof && brief){
   asof=document.createElement('p');asof.id='brief-asof';asof.className='detail-caption';
   const eyebrow=brief.querySelector('.eyebrow');
   eyebrow?.insertAdjacentElement('afterend',asof);
 }
 if(asof)asof.textContent=`EOD reading: ${data.session||'unknown'}${outOfDate?' · Newer market session not yet published':''}`;
 const title=$('brief-title');title.textContent=outOfDate?'Prior session only · '+headline:headline;
 title.className=regimes.every(x=>x==='RISK-ON')?'brief-good':regimes.every(x=>x==='RISK-OFF')?'brief-bad':'brief-caution';
 const state=k=>data.signals?.[k]?.state||'na';
 const tile=(name,label,note,kind)=>{
  $('brief-'+name).textContent=label;
  $('brief-'+name+'-note').textContent=note;
  $('brief-'+name+'-tile').dataset.tone=kind;
 };
 const combined=(a,b)=>a==='bear'&&b==='bear'?'both':a==='bear'||b==='bear'?'one':a==='na'||b==='na'?'missing':'none';
 const vol=combined(state('vix'),state('vxn'));
 tile('volatility',vol==='both'?'BOTH BEARISH':vol==='one'?'ONE BEARISH':vol==='none'?'NO JOINT WARNING':'DATA INCOMPLETE',
 vol==='both'?'Both volatility gauges meet bearish thresholds':vol==='one'?'VIX/VXN signals disagree':vol==='none'?'Neither volatility gauge is bearish':'VIX or VXN reading unavailable',vol==='both'?'bear':vol==='one'?'warn':vol==='none'?'bull':'na');
 const breadth=combined(state('sp_breadth1d'),state('nd_breadth1d'));
 tile('breadth',breadth==='both'?'BOTH BEARISH':breadth==='one'?'ONE BEARISH':breadth==='none'?'NO JOINT WARNING':'DATA INCOMPLETE',
 breadth==='both'?'Both one-day breadth indicators bearish':breadth==='one'?'Breadth weakness differs by market':breadth==='none'?'Neither one-day breadth indicator bearish':'One or both breadth readings unavailable',breadth==='both'?'bear':breadth==='one'?'warn':breadth==='none'?'bull':'na');
 const credit=state('credit');
 tile('credit',credit==='bear'?'BEARISH':credit==='bull'?'BULLISH':credit==='warn'?'CAUTION':'DATA INCOMPLETE',
 credit==='bear'?'HYG underperforming IEF in the model':credit==='bull'?'Credit comparison not bearish':credit==='warn'?'Credit signal is mixed':'HYG/IEF reading unavailable',credit);
 const concerns=[];
 if(vol==='both')concerns.push('volatility signals bearish in both markets');
 if(breadth==='both')concerns.push('one-day breadth bearish in both markets');
 if(credit==='bear')concerns.push('credit weakness');
 if(combined(state('sp_def'),state('nd_def'))==='both')concerns.push('defensive-sector leadership');
 if(combined(state('spy_trend'),state('qqq_trend'))==='both')concerns.push('both ETFs below their 200-day averages');
 const clause=concerns.length?`Key conditions: ${concerns.slice(0,4).join('; ')}.`:'Review the individual indicator rows to understand the current risk drivers.';
 const trendNote=sp.momentum?.state==='STABLE'||nd.momentum?.state==='STABLE'? ' STABLE describes the score change, not flat market prices.':'';
 $('brief-detail').textContent=(outOfDate?`This is a ${data.session} reading, not the latest completed market session. `:'')+clause+' '+`SPY 5D trend: ${sp.momentum?.state||'unknown'}; QQQ: ${nd.momentum?.state||'unknown'}.`+trendNote;
}

// EOD freshness is measured against expected U.S. stock-market sessions,
// not the age of the hosted live charts. NYSE regular holidays are excluded.
const utcDay=(year,month,day)=>new Date(Date.UTC(year,month-1,day));
const dayString=d=>d.toISOString().slice(0,10);
const weekday=d=>d.getUTCDay();
const offsetDay=(d,days)=>new Date(d.getTime()+days*86400000);
function observedFixedHoliday(y,m,d){
 const date=utcDay(y,m,d),w=weekday(date);
 return dayString(offsetDay(date,w===6?-1:w===0?1:0));
}
function nthWeekday(y,m,w,n){
 const first=utcDay(y,m,1);return dayString(utcDay(y,m,1+(w-weekday(first)+7)%7+7*(n-1)));
}
function lastWeekday(y,m,w){
 const last=utcDay(y,m+1,0);return dayString(offsetDay(last,-((weekday(last)-w+7)%7)));
}
function easterSunday(y){
 // Gregorian computus, used only for the NYSE Good Friday closure.
 const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,
 f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,
 i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k+7)%7,
 m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),
 day=(h+l-7*m+114)%31+1;
 return utcDay(y,month,day);
}
function nyseHolidays(year){
 const holidays=new Set();
 for(const y of [year-1,year,year+1]){
  for(const [m,d] of [[6,19],[7,4],[12,25]])holidays.add(observedFixedHoliday(y,m,d));
  // NYSE does not observe a Saturday January 1 on the preceding Friday.
  const ny=utcDay(y,1,1);holidays.add(dayString(offsetDay(ny,weekday(ny)===0?1:0)));
  holidays.add(nthWeekday(y,1,1,3)); // MLK
  holidays.add(nthWeekday(y,2,1,3)); // Presidents
  holidays.add(dayString(offsetDay(easterSunday(y),-2))); // Good Friday
  holidays.add(lastWeekday(y,5,1)); // Memorial
  holidays.add(nthWeekday(y,9,1,1)); // Labor
  holidays.add(nthWeekday(y,11,4,4)); // Thanksgiving
 }
 return holidays;
}
function nyseSession(date,holidays){
 return ![0,6].includes(weekday(date)) && !holidays.has(dayString(date));
}
function eodStatus(session, now=new Date()){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(session||''))return {kind:'unknown',text:'Session date unavailable',lag:null};
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
 const today=utcDay(Number(parts.year),Number(parts.month),Number(parts.day));
 const hour=Number(parts.hour);
 const holidays=nyseHolidays(today.getUTCFullYear());
 // After 4:00 PM New York time the latest completed equity session is
 // expected; do not hide a failed EOD update behind the old 8 PM cutoff.
 const earlyClose=new Set(['2026-11-27','2026-12-24','2027-11-26','2028-07-03','2028-11-24']);
 const closingHour=earlyClose.has(dayString(today))?13:16;
 let expected=nyseSession(today,holidays)&&hour>=closingHour?today:offsetDay(today,-1);
 while(!nyseSession(expected,holidays))expected=offsetDay(expected,-1);
 const observed=utcDay(...session.split('-').map(Number));
 if(!Number.isFinite(observed.getTime()))return {kind:'unknown',text:'Invalid session date',lag:null};
 let lag=0,walk=offsetDay(observed,1);
 while(walk<=expected && lag<100){if(nyseSession(walk,holidays))lag++;walk=offsetDay(walk,1);}
 if(observed>expected)return {kind:'unknown',text:'Published date is later than expected completed session',lag:null};
 if(lag===0)return {kind:'current',text:'Current completed EOD session',lag:0};
 if(lag===1)return {kind:'pending',text:'One market session behind',lag};
 return {kind:'stale',text:`${lag} market sessions behind`,lag};
}
function renderFreshness(data){
 const status=eodStatus(data.session),pill=$('freshness-pill'),alert=$('freshness-alert');
 pill.className='freshness-pill status-'+status.kind;
 pill.textContent=status.text;
 $('feed-state').textContent=data.session?'NYSE EOD session · prices / scores':'No market snapshot yet';
 $('status-dot').className='status-dot '+(status.kind==='current'?'good':'warn');
 if(status.kind==='pending'||status.kind==='stale'){
  alert.hidden=false;
  alert.textContent=`DATA FRESHNESS: The latest scored session is ${data.session} (${status.text.toLowerCase()}). Verify the GitHub Actions refresh before relying on the scores. TradingView and Fear & Greed update independently.`;
 }else if(status.kind==='unknown'){
  alert.hidden=false;alert.textContent='DATA FRESHNESS: Missing or invalid completed market session. Verify the EOD workflow.';
 }else{alert.hidden=true;alert.textContent='';}
}
function renderSignalChanges(data){
 const changes=data.signal_changes,holder=$('changes-grid');
 if(!changes?.groups || !changes.from_session){
  $('changes-date').textContent='New EOD run required';
  holder.innerHTML='<div class="changes-placeholder">Signal-by-signal comparison is not in this snapshot yet. Run the upgraded EOD workflow once to populate it.</div>';
  return;
 }
 $('changes-date').textContent=`${changes.from_session} → ${changes.to_session}`;
 $('changes-caption').textContent='Scored signal-state changes compared with the immediately preceding completed EOD session.';
 const named=[['shared','Shared macro'],['sp','SPY-specific'],['nd','QQQ-specific']];
 holder.replaceChildren();
 for(const [key,title] of named){
  const group=changes.groups[key]||{};
  const bad=group.new_bearish||[],good=group.eased||[],others=group.other||[];
  const rows=[...bad,...good,...others];
  const card=document.createElement('article');card.className='change-card';
  const headline=document.createElement('div');headline.className='change-card-heading';
  headline.innerHTML=`<strong>${esc(title)}</strong><span>${bad.length?`<b class="change-bear-count">${bad.length} health −1</b>`:''}${good.length?`<b class="change-eased-count">${good.length} health +1</b>`:''}</span>`;
  card.appendChild(headline);
  if(rows.length){
   const list=document.createElement('ul');list.className='change-list';
   rows.slice(0,3).forEach(item=>{
    const li=document.createElement('li');li.className='change-list-item';
    li.innerHTML=`<span class="change-dot ${item.kind==='new_bearish'?'dot-bear':item.kind==='eased'?'dot-good':'dot-neutral'}"></span><span>${esc(item.label)} <small>${esc(item.before)} → ${esc(item.after)}</small></span>`;
    list.appendChild(li);
   });
   card.appendChild(list);
   if(rows.length>3){
    const details=document.createElement('details');details.className='changes-more';
    const summary=document.createElement('summary');summary.textContent=`Show ${rows.length-3} more changes`;
    const more=document.createElement('ul');more.className='change-list';
    rows.slice(3).forEach(item=>{const li=document.createElement('li');li.textContent=`${item.label}: ${item.before} → ${item.after}`;more.appendChild(li);});
    details.append(summary,more);card.appendChild(details);
   }
  }else{const no=document.createElement('p');no.className='change-empty';no.textContent='No scored signal-state changes.';card.appendChild(no);}
  if(group.skipped){const note=document.createElement('small');note.className='change-missing';note.textContent=`${group.skipped} signals excluded due to unavailable data`;card.appendChild(note);}
  holder.appendChild(card);
 }
}

// Price and risk must share both dates, provider EOD close and complete score history.
// Never infer a return from charts, 5-day score changes or a stale snapshot.
function renderPriceRisk(data,spHistory,ndHistory){
 const api=window.PriceRisk,mi=window.MarketIntel;
 if(!api||!mi)return;
 // An older price/risk divergence is not a new alert for the current EOD day.
 // Older observations remain accessible in the dated Market History archive.
 const freshness=eodStatus(data.session);
 if(freshness.kind==='pending'||freshness.kind==='stale'||freshness.kind==='unknown'){
   $('price-risk-headline').textContent='Awaiting the latest completed EOD session';
   $('price-risk-summary').textContent=`Latest available comparison is through ${data.session||'an unknown date'}; previous-session alerts are archived under Market History.`;
   $('price-risk-dates').textContent=`As of ${data.session||'—'} · OUTDATED`;
   $('price-risk-panel')?.setAttribute('data-tone','neutral');
   for(const m of ['sp','nd']){
     const card=$('price-risk-'+m);card.dataset.tone='neutral';
     $('price-risk-'+m+'-change').textContent='—';
     $('price-risk-'+m+'-title').textContent='New EOD price move pending';
     $('price-risk-'+m+'-detail').textContent='No current-session divergence can be confirmed until new scored prices are published.';
     $('price-risk-'+m+'-evidence').textContent='Open Market History for older observations';
   }
   return;
 }
 const sp=api.evaluate(data,'sp',spHistory),nd=api.evaluate(data,'nd',ndHistory);
 const overall=api.summary(sp,nd),headline=$('price-risk-headline');
 headline.textContent=overall.headline;
 $('price-risk-summary').textContent=overall.detail;
 $('price-risk-panel')?.setAttribute('data-tone',overall.tone);
 const matched=sp.from&&sp.to&&sp.from===nd.from&&sp.to===nd.to;
 $('price-risk-dates').textContent=matched?`${sp.from} → ${sp.to}`:'Matching EOD sessions required';
 for(const [market,r] of [['sp',sp],['nd',nd]]){
  const card=$('price-risk-'+market);
  card.dataset.tone=r.kind==='divergence'?'warn':r.kind==='watch'?'watch':r.kind==='aligned'?'aligned':r.kind==='uncertain'?'uncertain':'neutral';
  $('price-risk-'+market+'-change').textContent=api.pctText(r.price);
  $('price-risk-'+market+'-title').textContent=r.headline;
  $('price-risk-'+market+'-detail').textContent=r.detail;
  $('price-risk-'+market+'-evidence').textContent=r.from&&r.to&&r.previousClose&&r.close?
   `${mi.formatDate(r.from)} ${api.closeText(r.previousClose)} → ${mi.formatDate(r.to)} ${api.closeText(r.close)} · ${r.scoreLine||'Score coverage incomplete'}`:
   'Matched previous/current EOD prices not available';
 }
}

// The companion module reads already-published EOD score/history records only.
// No synthetic previous score, intraday inference, or new scoring rule.
function renderMarketIntelligence(data){
 const mi=window.MarketIntel;
 if(!mi)return;
 const a=mi.scoredHistory(data,'sp'),b=mi.scoredHistory(data,'nd');
 renderPriceRisk(data,a,b);
 const changeLabel=r=>{
  if(!r)return 'Previous EOD → latest EOD: history unavailable';
  const delta=r.delta.min===r.delta.max?`${r.delta.min>0?'+':''}${r.delta.min}`:
    `${r.delta.min>0?'+':''}${r.delta.min}…${r.delta.max>0?'+':''}${r.delta.max}`;
  const word={improving:'IMPROVING',deteriorating:'DETERIORATING',unchanged:'UNCHANGED',uncertain:'DIRECTION UNCERTAIN'}[r.direction];
  return `${mi.formatDate(r.from)} ${mi.scoreRange(r.previous)} → ${mi.formatDate(r.to)} ${mi.scoreRange(r.today)} · ${delta} · ${word}`;
 };
 for(const [key,r] of [['sp',a],['nd',b]]){
  const scoreEl=$(key+'-daily-compare');scoreEl.textContent=changeLabel(r);
  scoreEl.dataset.tone=r?.direction==='improving'?'bull':r?.direction==='deteriorating'?'bear':r?.direction==='uncertain'?'warn':'neutral';
 }
 $('intel-date').textContent=a&&b&&a.from===b.from&&a.to===b.to?`${a.from} → ${a.to}`:'Matching session data required';
 const explainTransition=(r)=>{
  if(!r)return 'History unavailable';
  if(r.transition==='uncertain')return `${r.previousRegime} → ${r.currentRegime} · uncertain`;
  if(r.transition==='unchanged')return `${r.currentRegime} · unchanged`;
  return `${r.previousRegime} → ${r.currentRegime}`;
 };
 $('intel-sp-transition').textContent=explainTransition(a);
 $('intel-nd-transition').textContent=explainTransition(b);
 const transitions=[a?.transition,b?.transition];
 const anyChanged=transitions.some(t=>t==='risk_increased'||t==='risk_eased');
 const anyUncertain=transitions.includes('uncertain')||!a||!b;
 const anyWorse=transitions.includes('risk_increased');
 const anyBetter=transitions.includes('risk_eased');
 const header=anyChanged?'Risk regime transition detected':anyUncertain?'Regime transition uncertain':'No regime transition';
 $('intel-transition-title').textContent=header;
 $('intel-transition').dataset.tone=anyWorse?'bear':anyBetter?'bull':anyUncertain?'warn':'neutral';
 $('intel-transition-note').textContent=anyUncertain?
  'At least one transition cannot be classified confidently; missing signals are never presumed healthy.':
  anyChanged?'A confirmed change in the unified Risk-Off / Neutral / Risk-On classification.':'Both benchmarks retained their prior risk regime.';
 const diff=mi.divergence(a,b);
 $('intel-divergence-title').textContent=diff.headline;
 $('intel-divergence-note').textContent=diff.detail;
 $('intel-divergence').dataset.tone=diff.kind==='diverging'||diff.kind==='split'?'warn':'neutral';
 for(const key of ['sp','nd']){
  const q=mi.quality(data,key),score=$(`intel-${key}-quality`),bar=$(`intel-${key}-quality-bar`),note=$(`intel-${key}-quality-note`);
  score.textContent=q?`${q.available}/${q.total}`:'—/16';
  bar.style.width=q?`${(q.available/q.total*100).toFixed(1)}%`:'0%';
  bar.dataset.tone=q?.missing?'warn':'bull';
  if(!q){note.textContent='Coverage unavailable';continue;}
  const sourceText=q.estimated.length?`${q.estimated.length} marked estimated`: 'No sources explicitly marked estimated';
  note.textContent=`${q.missing} missing · ${sourceText}${q.unspecified.length?` · ${q.unspecified.length} without source tag`:''}${q.mismatch?' · CHECK COVERAGE MISMATCH':''}`;
  if(q.mismatch)note.classList.add('quality-mismatch');else note.classList.remove('quality-mismatch');
 }
}

function render(data){
 snapshot=data;
 $('session').textContent=data.session||'—';
 renderFreshness(data);
 $('latest-run').textContent=data.generated_at?`Updated ${new Date(data.generated_at).toLocaleString()}`:'Awaiting first update';
 // Freshness badge and dot reflect the latest expected NYSE EOD session.
 if(!data.markets?.sp500 || !data.markets?.nasdaq100){$('warning').textContent='The website is installed, but no market update has run. Open GitHub → Actions → Refresh EOD dashboard → Run workflow.';return;}
 summary('sp',data.markets.sp500); summary('nd',data.markets.nasdaq100);
 window.OverviewSignalBoard?.render(data,{scoreFormat,regimeHealth,invertedRange,rangeText});
 renderDecisionBrief(data);
 renderSignalChanges(data);
 renderScoreBreakdown(data);
 renderMarketIntelligence(data);
 signals('sp-signals',data.order.sp500);signals('nd-signals',data.order.nasdaq100);signals('shared-signals',data.order.shared);
 renderMovingAverages(data);
 renderDailyMACD(data);
 $('coverage-note').textContent=data.explanation?.partial||'';
 const all=data.markets.sp500.score.complete && data.markets.nasdaq100.score.complete;
 $('warning').textContent=all?'16-point Market Health: 0–5 Risk-Off · 6–10 Neutral · 11–16 Risk-On. Higher is healthier; daily MACD is scored. Five SMAs and Fear & Greed remain informational.':'PARTIAL DATA: health score shown as a possible range. 0–5 Risk-Off · 6–10 Neutral · 11–16 Risk-On. Missing signals are not assumed healthy.';
 $('diagnostics').textContent=JSON.stringify({sources:data.sources,warnings:data.warnings},null,2);
 plot(data.history);
}
async function load(){
 try{const res=await fetch('data/latest.json?refresh='+Date.now(),{cache:'no-store'});if(!res.ok)throw Error('HTTP '+res.status);const data=await res.json();if(snapshot?.session && data.session && data.session<snapshot.session)throw Error('Published session regressed; keeping the newer local snapshot');render(data)}
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

// Re-evaluate freshness when returning to a tab after a market close.
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
// The page can stay open through the market close; re-check published JSON
// automatically without reloading external TradingView or sentiment widgets.
if(typeof setInterval==='function')setInterval(()=>{if(!document.hidden)load();},10*60*1000);
window.addEventListener('resize',()=>{if(snapshot)plot(snapshot.history);});
