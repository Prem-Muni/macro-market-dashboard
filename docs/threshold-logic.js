"use strict";
const $=id=>document.getElementById(id);
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


async function loadResearch(){
 const status=$('research-snapshot-status');
 try {
  const response=await fetch('data/latest.json?research='+Date.now(),{cache:'no-store'});
  if(!response.ok)throw new Error('HTTP '+response.status);
  const data=await response.json();
  renderBacktest(data);
  renderQqqRisk(data);
  const asof=data.session||data.backtest?.twenty_months?.end||'latest published snapshot';
  status.textContent=`Research loaded from EOD snapshot ${asof}. Live scores and thresholds are unchanged by this page.`;
 } catch(err){
  status.textContent=`Unable to load the latest rolling research (${err.message}). The dated decision tables above remain available.`;
 }
}
loadResearch();
