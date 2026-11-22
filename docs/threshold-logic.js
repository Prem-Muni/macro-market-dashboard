"use strict";
// Read only the public dashboard snapshot. Every table cell uses textContent;
// no source data is interpreted as HTML.
const asof=document.getElementById('threshold-asof');
const host=document.getElementById('threshold-live-data');
const safe=(v,digits=1)=>v==null||!Number.isFinite(Number(v))?'—':`${Number(v)>=0?'+':''}${Number(v).toFixed(digits)}%`;
const pos=(v)=>v==null||!Number.isFinite(Number(v))?'—':`${Number(v).toFixed(1)}%`;
function makeTable(title,groups,keys){
  const box=document.createElement('section');box.className='threshold-evidence';
  const heading=document.createElement('h3');heading.textContent=title;box.appendChild(heading);
  const scroll=document.createElement('div');scroll.className='threshold-table-scroll';
  const table=document.createElement('table');table.className='threshold-compare';
  const head=document.createElement('thead');const hr=document.createElement('tr');
  ['Score group','Days','Median next 5D','Mean next 5D','Positive','Worst 5D','Std dev.'].forEach(x=>{const th=document.createElement('th');th.textContent=x;hr.appendChild(th)});
  head.appendChild(hr);table.appendChild(head);
  const body=document.createElement('tbody');
  for(const [key,label] of keys){
    const g=groups?.[key]||{};const row=document.createElement('tr');
    [label,g.days??'—',safe(g.forward5_median_pct),safe(g.forward5_mean_pct),pos(g.forward5_positive_pct),safe(g.forward5_worst_pct),g.forward5_stddev_pct==null?'—':Number(g.forward5_stddev_pct).toFixed(1)+'%'].forEach(cell=>{const td=document.createElement('td');td.textContent=String(cell);row.appendChild(td)});
    body.appendChild(row);
  }
  table.appendChild(body);scroll.appendChild(table);box.appendChild(scroll);return box;
}
function render(data){
  const backtest=data?.backtest||{};const yy=backtest.year;const mm=backtest.twenty_months;
  if(!yy||!mm){asof.textContent='The latest snapshot has no backtest yet. The dated decision tables above remain available.';return;}
  asof.textContent=`Most recent priced session: ${data.session||mm.end} · ${mm.sessions??'—'} observed sessions in the rolling 20-month window · Complete 15/15 scores required.`;
  const cohorts=[['zero_to_four','0–4 baseline'],['exactly_five','Exactly 5'],['zero_to_five','0–5 combined']];
  for(const [period,label] of [['year','Past 365 days'],['twenty_months','Past 20 months']]){
    const piece=backtest[period];
    const heading=document.createElement('h3');heading.textContent=label;heading.style.margin='20px 0 8px';host.appendChild(heading);
    for(const [market,marketLabel] of [['sp','SPY'],['nd','QQQ']]){
      const record=piece?.markets?.[market];
      if(record)host.appendChild(makeTable(`${marketLabel} · ${record.complete_days??'—'} complete sessions`,record,cohorts));
    }
    const q=piece?.qqq_risk?.groups;
    if(q){host.appendChild(makeTable('QQQ score 5 · risk and trend groups',q,[['five_improving','5 + improving'],['five_stable','5 + stable'],['five_deteriorating','5 + deteriorating'],['selective','0–4 or 5 + improving']]));}
  }
  const split=mm?.qqq_risk?.halves;
  if(Array.isArray(split)){
    const title=document.createElement('h3');title.textContent='QQQ · chronological 10-month sensitivity splits';title.style.margin='20px 0 8px';host.appendChild(title);
    for(const block of split){host.appendChild(makeTable(`${block.label}: ${block.start} – ${block.end} · ${block.sessions} sessions`,block.groups,[['zero_to_four','0–4'],['exactly_five','Exactly 5'],['five_improving','5 + improving'],['five_stable','5 + stable'],['five_deteriorating','5 + deteriorating']]));}
  }
  const n=mm?.qqq_risk?.groups?.five_improving;
  if(n){const p=document.createElement('p');p.textContent=`QQQ score 5 + improving, non-overlapping sensitivity sample (20 months): ${n.nonoverlap_observations??'—'} observations, ${safe(n.nonoverlap_median_pct)} median return, ${pos(n.nonoverlap_positive_pct)} positive. These are diagnostic samples, not simulated trading results.`;host.appendChild(p);}
}
fetch('data/latest.json?fresh='+Date.now(),{cache:'no-store'})
.then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()})
.then(render)
.catch(()=>{asof.textContent='Live research could not be loaded. The dated evidence above remains available; check the Dashboard for the latest data.'});
