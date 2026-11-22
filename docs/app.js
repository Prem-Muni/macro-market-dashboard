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


function renderBacktest(data){
 const periods=data.backtest||{};
 const pretty=(v,suffix='')=>v==null?'—':`${Number(v).toFixed(1)}${suffix}`;
 for(const [key,p] of [['year',periods.year],['twenty_months',periods.twenty_months]]){
  for(const [market,label] of [['sp','SPY'],['nd','QQQ']]){
   const target=$(key+'-'+market+'-backtest');
   if(!target)continue;
   if(!p||!p.markets||!p.markets[market]){
    target.textContent='Awaiting historical backtest data from an EOD refresh';continue;
   }
   const a=p.markets[market];
   const f=(g)=>a.complete_days>0?(a[g]?.days??'—'):'—';
   const fmt=g=>{const r=a[g]||{};return r.forward5_observations?`${pretty(r.forward5_mean_pct,'%')} avg · ${pretty(r.forward5_positive_pct,'%')} positive (n=${r.forward5_observations})`:'No verified forward observations';};
   target.replaceChildren();
   const summary=document.createElement('div');summary.className='backtest-coverage';
   summary.textContent=`${label} · ${a.complete_days}/${p.sessions} complete sessions · ${a.incomplete_days} excluded`;
   target.appendChild(summary);
   const stats=document.createElement('div');stats.className='backtest-stats';
   for(const [title,value] of [['0–4 points',f('zero_to_four')],['Exactly 5',f('exactly_five')],['0–5 points',f('zero_to_five')]]){
    const e=document.createElement('div');e.className='backtest-stat';
    const b=document.createElement('strong');b.textContent=String(value);
    const small=document.createElement('span');small.textContent=title;
    e.append(b,small);stats.appendChild(e);
   }
   target.appendChild(stats);
   const perf=document.createElement('p');perf.className='backtest-perf';
   perf.textContent=`Next 5 sessions after 0–4: ${fmt('zero_to_four')} · after exactly 5: ${fmt('exactly_five')}`;
   target.appendChild(perf);
   // Conditional test of the QQQ 0–5 hypothesis, with SPY as a comparison.
   const groups=a.score_five_trend;
   if(groups){
    const section=document.createElement('div');section.className='score5-conditional';
    const heading=document.createElement('h4');heading.textContent='When the score is exactly 5 — five-session trend';section.appendChild(heading);
    const lead=document.createElement('p');lead.className='score5-note';lead.textContent='IMPROVING = bearish points fell ≥2 in five sessions · STABLE = change −1 to +1 · DETERIORATING = rose ≥2. The day five sessions earlier must also have a complete score.';section.appendChild(lead);
    const grid=document.createElement('div');grid.className='score5-grid';
    for(const [name,label] of [['improving','IMPROVING'],['stable','STABLE'],['deteriorating','DETERIORATING']]){
     const g=groups[name]||{};
     const card=document.createElement('div');card.className='score5-item '+name;
     const h=document.createElement('div');h.className='score5-label';h.textContent=label;card.appendChild(h);
     const count=document.createElement('strong');count.textContent=`${g.days??'—'} sessions`;card.appendChild(count);
     const desc=document.createElement('p');
     if(g.forward5_observations){
      desc.textContent=`Next 5D: ${pretty(g.forward5_mean_pct,'%')} avg · ${pretty(g.forward5_positive_pct,'%')} positive (n=${g.forward5_observations})`;
      const risk=document.createElement('p');risk.className='score5-risk';risk.textContent=`Worst subsequent daily close: ${pretty(g.forward5_worst_close_mean_pct,'%')} avg · ${pretty(g.forward5_below_minus2_pct,'%')} fell ≥2% below signal close`;card.appendChild(desc,risk);
     }else{desc.textContent='No completed five-session forward window';card.appendChild(desc);}
     grid.appendChild(card);
    }
    section.appendChild(grid);
    const selective=a.zero_to_four_plus_five_improving;
    if(selective){
     const combined=document.createElement('p');combined.className='score5-combined';
     combined.textContent=`Selective Risk-On (0–4 OR 5 + IMPROVING): ${selective.days} sessions · ${selective.forward5_observations?`${pretty(selective.forward5_mean_pct,'%')} next-5D avg · ${pretty(selective.forward5_positive_pct,'%')} positive (n=${selective.forward5_observations})`:'no completed forward windows'}. Compare with the 0–4 reference cohort above. This is a diagnostic subset, not the live QQQ 0–5 policy.`;
     section.appendChild(combined);
    }
    if(groups.unavailable?.days){const note=document.createElement('p');note.className='score5-note';note.textContent=`${groups.unavailable.days} additional score-5 sessions lack a complete five-session trend comparison and are not included above.`;section.appendChild(note);}
    target.appendChild(section);
   }
  }
 }
 const details=$('backtest-date-range');
 if(details&&periods.twenty_months){const p=periods.twenty_months;details.textContent=`Historical window: ${p.start} to ${p.end} · ${p.sessions} observed sessions`;}
}

// Robustness check for QQQ score=5; never changes scoring or live regimes.
function renderQqqRisk(data){
 const periods=data.backtest||{};
 const rows=[
  ['zero_to_four','0–4 (baseline)'],
  ['exactly_five','Exactly 5 (all)'],
  ['five_improving','5 + improving'],
  ['five_stable','5 + stable'],
  ['five_deteriorating','5 + deteriorating'],
  ['selective','0–4 or 5 + improving']
 ];
 const pct=value=>value==null||!Number.isFinite(Number(value))?'—':`${Number(value).toFixed(1)}%`;
 const cells=[
  ['days','Days',x=>x==null?'—':String(x)],
  ['forward5_observations','Returns (n)',x=>x==null?'—':String(x)],
  ['forward5_median_pct','Median 5D',pct],
  ['forward5_mean_pct','Mean 5D',pct],
  ['forward5_stddev_pct','Std dev',pct],
  ['forward5_p10_pct','10th pct.',pct],
  ['forward5_worst_pct','Worst 5D',pct],
  ['forward5_worst_close_pct','Worst close',pct],
  ['forward5_positive_pct','Positive',pct],
 ];
 const makeTable=(groups,compact=false)=>{
  const wrap=document.createElement('div');wrap.className='risk-table-wrap';
  const table=document.createElement('table');table.className='risk-table';
  const h=document.createElement('thead');const header=document.createElement('tr');
  const title=document.createElement('th');title.textContent='QQQ score';header.appendChild(title);
  const columns=compact?cells.filter(([k])=>['days','forward5_observations','forward5_median_pct','forward5_stddev_pct','forward5_positive_pct'].includes(k)):cells;
  for(const [,label] of columns){const th=document.createElement('th');th.textContent=label;header.appendChild(th);}
  h.appendChild(header);table.appendChild(h);
  const body=document.createElement('tbody');
  for(const [key,label] of rows){
   const result=groups?.[key]||{};
   const tr=document.createElement('tr');const td=document.createElement('td');td.textContent=label;tr.appendChild(td);
   for(const [field,,formatter] of columns){const v=document.createElement('td');v.textContent=formatter(result[field]);tr.appendChild(v);}
   body.appendChild(tr);
  }
  table.appendChild(body);wrap.appendChild(table);return wrap;
 };
 for(const [key,id] of [['year','qqq-risk-year'],['twenty_months','qqq-risk-20m']]){
  const container=$(id);if(!container)continue;container.replaceChildren();
  const risk=periods[key]?.qqq_risk;
  if(!risk){container.textContent='Awaiting recalculated QQQ historical study from next EOD update';continue;}
  container.appendChild(makeTable(risk.groups));
  const note=document.createElement('p');note.className='risk-validation-note';
  const chosen=risk.groups?.five_improving||{};
  note.textContent=`5 + improving: ${chosen.nonoverlap_observations??'—'} non-overlapping return intervals, ${pct(chosen.nonoverlap_median_pct)} median and ${pct(chosen.nonoverlap_positive_pct)} positive (chronological sensitivity sample). Compare with 0–4 and exactly 5, above. Small subgroups can be driven by a few outliers.`;
  container.appendChild(note);
 }
 const halves=$('qqq-risk-halves');if(!halves)return;halves.replaceChildren();
 const split=periods.twenty_months?.qqq_risk?.halves;
 if(!Array.isArray(split)){halves.textContent='Awaiting chronological split from next EOD update';return;}
 const grid=document.createElement('div');grid.className='risk-stability-grid';
 for(const half of split){
  const card=document.createElement('div');card.className='risk-stability-card';
  const heading=document.createElement('strong');heading.textContent=`${half.label} · ${half.start} – ${half.end}`;
  const note=document.createElement('p');note.className='risk-validation-note';note.textContent=`${half.sessions} market sessions. Five-session outcome windows may cross the split boundary; only score dates determine group membership.`;
  card.append(heading,note,makeTable(half.groups,true));grid.appendChild(card);
 }
 halves.appendChild(grid);
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
function render(data){
 snapshot=data;
 $('session').textContent=data.session||'—';
 $('feed-state').textContent=data.session?'End-of-day snapshot':'Not yet initialized';
 $('latest-run').textContent=data.generated_at?`Updated ${new Date(data.generated_at).toLocaleString()}`:'Awaiting first update';
 $('status-dot').className='status-dot '+(data.generated_at?'good':'warn');
 if(!data.markets?.sp500 || !data.markets?.nasdaq100){$('warning').textContent='The website is installed, but no market update has run. Open GitHub → Actions → Refresh EOD dashboard → Run workflow.';return;}
 summary('sp',data.markets.sp500); summary('nd',data.markets.nasdaq100);
 signals('sp-signals',data.order.sp500);signals('nd-signals',data.order.nasdaq100);signals('shared-signals',data.order.shared);
 renderMovingAverages(data);
 $('coverage-note').textContent=data.explanation?.partial||'';
 const all=data.markets.sp500.score.complete && data.markets.nasdaq100.score.complete;
 $('warning').textContent=all?'EXPERIMENTAL 15-point model: SPY Risk-On 0–4; QQQ Risk-On 0–5 (score 5 borderline cautious). RSI scored; five SMA rows informational. Thinkorswim remains 14-point.':'EXPERIMENTAL 15-point model: PARTIAL FEEDS. SPY Risk-On 0–4; QQQ Risk-On 0–5 (5 borderline cautious). Missing inputs are not bullish; Thinkorswim remains 14-point.';
 $('diagnostics').textContent=JSON.stringify({sources:data.sources,warnings:data.warnings},null,2);
 plot(data.history);
 renderBacktest(data);
 renderQqqRisk(data);
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
