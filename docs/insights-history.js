/* Saved EOD market-insight journal. Uses only market_insights_history in latest.json.
 * No external API calls, no inferred past alerts, no impact on the scoring engine.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.InsightsHistory=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const isNum=v=>typeof v==='number'&&Number.isFinite(v);
  const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'));
  const dateLabel=s=>validDate(s)?new Date(s+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}):'—';
  const money=v=>isNum(v)?'$'+v.toFixed(2):'—';
  const signed=(v,suffix='')=>isNum(v)?`${v>0?'+':''}${v.toFixed(suffix==='%'?2:0)}${suffix}`:'—';
  const text=(value)=>value==null?'—':String(value);
  const REGIMES=['RISK-ON','NEUTRAL','CAUTION','RISK-OFF','INCOMPLETE'];
  const KINDS=['divergence','watch','aligned','none','uncertain'];
  const ALL_MARKETS=['spy','qqq'];

  function validArchive(data){
    const archive=data?.market_insights_history;
    if(!archive||archive.version!==1||!Array.isArray(archive.entries))return [];
    const entries=archive.entries;
    if(!entries.every(row=>row&&validDate(row.session)&&validDate(row.previous_session)&&row.previous_session<row.session&&
       ALL_MARKETS.every(k=>row[k]&&REGIMES.includes(row[k].regime)&&KINDS.includes(row[k].price_risk_status))))return [];
    if(entries.some((entry,i)=>i>0&&entry.session<=entries[i-1].session))return [];
    return entries;
  }
  // Persistent JSON uses raw bearish counts to retain historical comparability.
  // Convert only at display/export boundaries; never mutate the saved archive.
  const healthRegime=v=>v<=5?'RISK-OFF':v<=10?'NEUTRAL':'RISK-ON';
  function healthView(d,baseline=false){
    if(!d||!isNum(d.score)||!isNum(d.total)||!isNum(d.available))return d;
    const available=d.available,total=d.total,raw=d.score;
    const min=available-raw,max=total-raw;
    const regime=healthRegime(min)===healthRegime(max)?healthRegime(min):'INCOMPLETE';
    const previous=isNum(d.previous_score)?total-d.previous_score:null;
    const previousRegime=previous==null?'INCOMPLETE':healthRegime(previous);
    const change=isNum(d.score_delta_1d)?-d.score_delta_1d:null;
    const priorRange=d.five_day_delta_range;
    const fiveDayRange=Array.isArray(priorRange)&&priorRange.length===2&&priorRange.every(isNum)?[-priorRange[1],-priorRange[0]]:null;
    const price=d.price_change_pct;
    let status=d.price_risk_status,label=d.price_risk_label;
    if(!baseline && isNum(price) && regime!=='INCOMPLETE' && d.price_risk_status!=='uncertain' && d.price_risk_status!=='unavailable'){
      if(price>=2 && regime==='RISK-OFF'){status='divergence';label='Strong rally · Risk-Off persists';}
      else if(price<=-2 && regime==='RISK-ON'){status='divergence';label='Sharp selloff · Risk-On persists';}
      else if(Math.abs(price)>=2 && regime==='NEUTRAL'){status='watch';label='Large price move · Neutral regime';}
      else {status='none';label='No price/risk divergence under current health thresholds';}
    }
    return {...d,score:min,score_max:max,previous_score:previous,score_delta_1d:change,
      regime,previous_regime:previousRegime,risk_transition:previous==null?'uncertain':previousRegime===regime?'unchanged':'changed',
      five_day_delta_range:fiveDayRange,price_risk_status:status,price_risk_label:label,
      archived_bearish:raw};
  }
  function filterRows(entries,options={}){
    const range=options.range||'30',market=options.market||'both',alertsOnly=!!options.alertsOnly;
    const sessions=range==='all'?entries:entries.slice(-(range==='90'?90:30));
    const selected=market==='both'?ALL_MARKETS:ALL_MARKETS.includes(market)?[market]:ALL_MARKETS;
    const rows=[];
    for(const day of sessions.slice().reverse()){
      const spy=healthView(day.spy,day.baseline===true);
      const qqq=healthView(day.qqq,day.baseline===true);
      let marketDivergence='aligned';
      if(spy.regime==='INCOMPLETE'||qqq.regime==='INCOMPLETE')marketDivergence='uncertain';
      else if(isNum(spy.score_delta_1d)&&isNum(qqq.score_delta_1d)&&
        (spy.score_delta_1d<0&&qqq.score_delta_1d>0 || spy.score_delta_1d>0&&qqq.score_delta_1d<0))
        marketDivergence='opposite_score_moves';
      else if(spy.regime!==qqq.regime)marketDivergence='regime_split';
      else if(!isNum(spy.score_delta_1d)||!isNum(qqq.score_delta_1d))marketDivergence='uncertain';
      for(const sym of selected){
        const view=sym==='spy'?spy:qqq;
        if(alertsOnly&&view.price_risk_status!=='divergence')continue;
        rows.push({session:day.session,previous_session:day.previous_session,symbol:sym,detail:view,changes:day.signal_changes,
          marketDivergence,recordSource:day.record_source||"automatic_eod",sourceNote:day.source_note||"",baseline:day.baseline===true});
      }
    }
    return rows;
  }
  function csvField(v){
    let s=v==null?'':String(v);
    // Prevent spreadsheet formula injection from market/provider supplied text.
    if(!isNum(v)&&/^[\s]*[=+@\-]/.test(s))s="'"+s;
    return '"'+s.replace(/"/g,'""')+'"';
  }
  function toCSV(rows){
    const head=['Session','Recorded model','Record origin','Source note','Previous session','ETF','Previous close','Close','Price change %','Market Health (min)','Points available','Total points','Previous Market Health','Health score max','Archived bearish points','1D score delta','Risk regime','Previous risk regime','Risk transition','5D score trend','5D score delta low','5D score delta high','Confirmations improving','Confirmations checked','Confirmation categories','Swing environment','Price/risk alert','Price/risk detail','Estimated signal count','Estimated signal names','Shared health losses','Shared health gains','Index health losses','Index health gains','SPY vs QQQ status (health policy)','RSI (14)','Volatility index','Volatility value','MACD 12-26','MACD signal 9','MACD histogram','MACD relation','MACD crossover'];
    const list=[head];
    for(const row of rows){
      const d=row.detail,c=row.changes?.groups||{},g=c[row.symbol==='spy'?'sp':'nd']||{},shared=c.shared||{};
      const labels=v=>Array.isArray(v)?v.map(x=>x.label||'').join('; '):'';
      list.push([row.session,`${d.total}-point`,row.recordSource,row.sourceNote,row.previous_session,row.symbol.toUpperCase(),d.previous_close,d.close,d.price_change_pct,d.score,d.available,d.total,d.previous_score,d.score_max,d.archived_bearish,d.score_delta_1d,d.regime,d.previous_regime,d.risk_transition,d.trend_5d,d.five_day_delta_range?.[0],d.five_day_delta_range?.[1],d.confirmation?.confirmed,d.confirmation?.available,d.confirmation?.total,d.swing,d.price_risk_status,d.price_risk_label,d.estimated_count,(d.estimated_signals||[]).join('; '),labels(shared.new_bearish),labels(shared.eased),labels(g.new_bearish),labels(g.eased),row.marketDivergence,d.baseline_context?.rsi14,d.baseline_context?.volatility_index?.name,d.baseline_context?.volatility_index?.value,d.macd_info?.macd,d.macd_info?.signal,d.macd_info?.histogram,d.macd_info?.relation,d.macd_info?.crossover]);
    }
    return '\uFEFF'+list.map(items=>items.map(csvField).join(',')).join('\r\n')+'\r\n';
  }

  function chartRows(entries,opts){
    const filtered=filterRows(entries,opts),days=new Map();
    for(const row of filtered){
      if(!days.has(row.session))days.set(row.session,{date:row.session});
      days.get(row.session)[row.symbol]=row.detail;
    }
    return [...days.values()].reverse();
  }

  // The remaining code runs only in the browser.
  if(typeof document==='undefined')return {validArchive,filterRows,toCSV,chartRows,signed,dateLabel};
  const $=id=>document.getElementById(id);
  let entries=[],lastSession=null;
  const options={range:'30',market:'spy',alertsOnly:false};
  const make=(tag,cls,parent)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(parent)parent.appendChild(e);return e;};
  const small=(tag,value,cls,parent)=>{const e=make(tag,cls,parent);e.textContent=text(value);return e;};
  const pill=(v,cls,parent)=>small('span',v,'journal-pill '+cls,parent);

  function listChanges(parent,title,items,className){
    const c=make('div','',parent);
    small('h4',title+' ('+(items?.length||0)+')','',c);
    if(!items?.length){small('p','No changed signals','',c);return;}
    const ul=make('ul','',c);
    for(const item of items){
      small('li',`${item.label||'Unknown'}: ${item.before||'—'} → ${item.after||'—'}`,className,ul);
    }
  }
  function detailRow(row){
    const tr=make('tr','journal-expanded-row');tr.hidden=true;
    const td=make('td','',tr);td.colSpan=8;
    const cards=make('div','journal-detail-grid',td);
    const d=row.detail;
    const card1=make('div','journal-detail',cards);
    small('h4',row.baseline?'Screenshot baseline · Nov 20, 2026':'Recorded market context','',card1);
    if(row.baseline)small('p',row.sourceNote,'journal-baseline-note',card1);
    if(d.baseline_context){
      const x=d.baseline_context;
      small('p',`Captured ${x.volatility_index?.name||'Volatility'}: ${text(x.volatility_index?.value)} · RSI(14): ${text(x.rsi14)} · Index-specific healthy: ${isNum(x.index_specific_bearish)?9-x.index_specific_bearish:'—'}/9 · Shared macro healthy: ${isNum(x.shared_macro_bearish)?6-x.shared_macro_bearish:'—'}/6.`,'',card1);
      const b=x.breadth_1d;
      if(b)small('p',`Breadth 1D: ${text(b.state)} (${text(b.value)} ${text(b.units)}).`,'',card1);
    }
    small('p',`${row.symbol.toUpperCase()} ${money(d.previous_close)} → ${money(d.close)} (${signed(d.price_change_pct,'%')})`,'',card1);
    small('p',`Market Health: ${text(d.previous_score)} → ${text(d.score)}${d.score_max!==d.score?'–'+d.score_max:''}/${text(d.total)}. 5D trend: ${text(d.trend_5d)}.`,'',card1);
    small('p',`Risk: ${text(d.previous_regime)} → ${text(d.regime)}. Swing: ${text(d.swing)}.`,'',card1);
    if(d.macd_info){const m=d.macd_info;small('p',`Daily MACD (12,26,9) · NOT SCORED: line ${text(m.macd)} · signal ${text(m.signal)} · histogram ${text(m.histogram)} · ${text(m.relation)}${m.crossover&&m.crossover!=='none'?' · '+text(m.crossover)+' crossover':''}.`,'',card1);}
    const conf=d.confirmation||{};
    small('p',`Market confirmation: ${text(conf.confirmed)}/${text(conf.total)} improving · ${text(conf.available)}/${text(conf.total)} checked.`,'',card1);
    const card2=make('div','journal-detail',cards);
    small('h4','Data quality & alert','',card2);
    small('p',`${text(d.available)} / ${text(d.total)} scored inputs available; ${text(d.estimated_count)} marked estimated.`,'',card2);
    if(d.estimated_signals?.length)small('p',`Estimated inputs: ${d.estimated_signals.join(', ')}`,'',card2);
    small('p',`${text(d.price_risk_label)} · ${text(row.marketDivergence).replaceAll('_',' ')}`,'',card2);
    const cs=row.changes;
    const groups=cs?.status==='complete'?cs.groups||{}:{};
    const combined=groups.shared||{},index=groups[row.symbol==='spy'?'sp':'nd']||{};
    const card3=make('div','journal-detail',cards);
    if(cs?.status==='complete'||cs?.status==='partial'){
      if(cs.status==='partial')small('p','Partial transcription: '+text(cs.note||'Some changes were not visible.'),'journal-muted',card3);
      listChanges(card3,'Shared macro · health lost',combined.new_bearish,'negative');
      listChanges(card3,'Shared macro · health gained',combined.eased,'positive');
    }else{
      small('h4','Shared macro changes','',card3);
      small('p','Unavailable for these matched sessions','',card3);
    }
    const card4=make('div','journal-detail',cards);
    if(cs?.status==='complete'||cs?.status==='partial'){
      listChanges(card4,`${row.symbol.toUpperCase()} · health lost`,index.new_bearish,'negative');
      listChanges(card4,`${row.symbol.toUpperCase()} · health gained`,index.eased,'positive');
      const others=[...(combined.other||[]),...(index.other||[])];
      if(others.length)listChanges(card4,'Other state changes',others,'');
    }else{
      small('h4','Index-specific changes','',card4);
      small('p','Unavailable for these matched sessions','',card4);
    }
    return tr;
  }
  function renderTable(rows){
    const target=$('j-rows');target.replaceChildren();
    $('j-matches').textContent=`${rows.length} ${options.market.toUpperCase()} sessions shown`;
    $('j-export').disabled=!rows.length;
    if(!rows.length){
      const tr=make('tr','',target);const td=make('td','journal-empty',tr);td.colSpan=8;
      td.textContent=entries.length?'No saved observations match these filters. Try “All” or turn off alert-only filtering.':'The archive begins after the first successful completed-EOD refresh with this upgrade.';
      return;
    }
    for(const row of rows){
      const d=row.detail,tr=make('tr','',target);
      const date=make('td','journal-date',tr);small('strong',dateLabel(row.session),'',date);
      if(row.baseline)small('span','BASELINE · screenshot','journal-baseline-flag',date);
      small('span',`Prior scored: ${dateLabel(row.previous_session)}`,'journal-muted',date);
      const price=make('td','',tr);small('strong',money(d.close),'',price);small('span',`Prior ${money(d.previous_close)}`,'journal-muted',price);
      const change=make('td','',tr);small('span',signed(d.price_change_pct,'%'),'journal-percent '+(d.price_change_pct>0?'journal-up':d.price_change_pct<0?'journal-down':'journal-neutral'),change);
      const score=make('td','',tr);small('strong',`${text(d.score)}${d.score_max!==d.score?'–'+d.score_max:''}/${text(d.total)}`,'',score);small('span',`${text(d.available)}/${text(d.total)} available · ${text(d.estimated_count)} est. · ${text(d.total)}-point model`,'journal-muted',score);
      const delta=make('td','',tr);small('strong',signed(d.score_delta_1d),'journal-percent '+(d.score_delta_1d>0?'journal-up':d.score_delta_1d<0?'journal-down':'journal-neutral'),delta);
      if(d.score_delta_1d==null)small('span','Not confirmed','journal-muted',delta);
      const regime=make('td','',tr);pill(d.regime,d.regime.toLowerCase(),regime);
      const alert=make('td','journal-alert',tr);pill(row.baseline?'BASELINE':d.price_risk_status==='none'?'No alert':d.price_risk_status==='divergence'?'DIVERGENCE':d.price_risk_status.toUpperCase(),row.baseline?'baseline':d.price_risk_status,alert);
      small('span',d.price_risk_label,'',alert);
      const signals=make('td','journal-sig',tr);
      const btn=make('button','',signals);btn.type='button';btn.textContent='View details';btn.setAttribute('aria-expanded','false');
      const details=detailRow(row);target.appendChild(details);
      btn.addEventListener('click',()=>{details.hidden=!details.hidden;btn.setAttribute('aria-expanded',String(!details.hidden));btn.textContent=details.hidden?'View details':'Hide details';});
    }
  }
  function chart(entriesForChart){
    const svg=$('j-score-chart');svg.replaceChildren();
    const W=900,H=230,L=44,R=22,T=16,B=46;
    const el=(tag,attrs={},parent=svg)=>{
      const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
      for(const [k,v]of Object.entries(attrs))node.setAttribute(k,v);
      parent.appendChild(node);return node;
    };
    const x=i=>L+(entriesForChart.length<2?0:i/(entriesForChart.length-1))*(W-L-R);
    const y=v=>T+(16-v)/16*(H-T-B);
    for(const n of [0,5.5,10.5,16]){
      el('line',{x1:L,x2:W-R,y1:y(n),y2:y(n),stroke:n===5.5?'#8f4856':n===10.5?'#887348':'#30435a','stroke-width':1,'stroke-dasharray':n===5.5||n===10.5?'6 5':'1 0'});
      const t=el('text',{x:8,y:y(n)+4,fill:'#93abc5','font-size':12});t.textContent=String(n);
    }
    if(!entriesForChart.length){
      const t=el('text',{x:W/2,y:113,'text-anchor':'middle',fill:'#9aadc4','font-size':17});t.textContent='Saved daily scores will appear after the next eligible EOD refresh';return;
    }
    const marks=[0,Math.floor((entriesForChart.length-1)/2),entriesForChart.length-1].filter((v,i,a)=>a.indexOf(v)===i);
    for(const i of marks){
      const t=el('text',{x:x(i),y:H-14,'text-anchor':i===0?'start':i===entriesForChart.length-1?'end':'middle',fill:'#92a9c1','font-size':12});
      t.textContent=dateLabel(entriesForChart[i].date).replace(/, \d{4}$/,'');
    }
    for(const [market,color]of [[options.market,options.market==='spy'?'#34e2a4':'#85bfff']]){
      let path='',started=false,priorTotal=null;
      entriesForChart.forEach((rec,i)=>{
        const d=rec[market],v=d?.score;
        if(!isNum(v)){started=false;return;}
        if(priorTotal!==null && priorTotal!==d.total)started=false;
        priorTotal=d.total;
        path+=(started?' L':' M')+x(i).toFixed(2)+','+y(v).toFixed(2);started=true;
      });
      if(path)el('path',{d:path,fill:'none',stroke:color,'stroke-width':3,'stroke-linejoin':'round','stroke-linecap':'round'});
      entriesForChart.forEach((rec,i)=>{
        const d=rec[market];if(!isNum(d?.score))return;
        const c=el('circle',{cx:x(i),cy:y(d.score),r:entriesForChart.length===1?5:3.5,
          fill:d.available===d.total?color:'#101b2b',stroke:color,'stroke-width':1.5});
        const t=el('title',{},c);t.textContent=`${rec.date} · ${market.toUpperCase()} ${d.score}${d.score_max!==d.score?'–'+d.score_max:''}/${d.total} Market Health · ${d.regime}`;
      });
    }
  }
  function rerender(){
    const market=options.market,display=market.toUpperCase();
    $('j-market-panel').setAttribute('aria-labelledby','j-tab-'+market);
    $('j-score-title').textContent=`${display} Market Health history`;
    $('j-log-title').textContent=`${display} historical market log`;
    $('j-chart-legend-label').textContent=display;
    $('j-chart-legend').querySelector('i').className='j-key-dot '+market;
    $('j-score-chart').setAttribute('aria-label',`${display} saved Market Health scores over completed daily sessions`);
    $('j-count').textContent=entries.length.toLocaleString();
    $('j-alerts').textContent=entries.filter(day=>healthView(day[market],day.baseline===true).price_risk_status==='divergence').length.toLocaleString();
    $('j-alerts-note').textContent=`${display} sessions with a price/risk mismatch`;
    const rows=filterRows(entries,options);
    renderTable(rows);
    chart(chartRows(entries,options));
    $('j-message').textContent=entries.length?
      `Showing saved ${options.market.toUpperCase()} EOD observations. November 20 is a labeled screenshot baseline. Export visible CSV for an independent backup.`:
      'No journal entries yet. New completed EOD sessions will appear automatically. Prior bearish scores are inverted only for display; 15-point and 16-point snapshots retain their own denominators; original archived counts remain preserved.';
  }
  function setStatus(msg,ok){$('history-updated').textContent=msg;$('history-dot').className='status-dot '+(ok?'good':'warn');}
  async function load(){
    try{
      const response=await fetch('data/latest.json?history_refresh='+Date.now(),{cache:'no-store'});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const latest=await response.json();
      entries=validArchive(latest);lastSession=latest.session;
      $('j-count').textContent=entries.length.toLocaleString();
      $('j-date-range').textContent=entries.length?`${dateLabel(entries[0].session)} – ${dateLabel(entries.at(-1).session)}`:'Tracking begins at installation';
      $('j-last').textContent=entries.length?dateLabel(entries.at(-1).session):'—';
      $('j-last-note').textContent=entries.length?`${entries.at(-1).previous_session} → ${entries.at(-1).session}`:'Waiting for the first eligible completed-EOD run';
      const when=latest.generated_at?new Date(latest.generated_at).toLocaleString():'not timestamped';
      setStatus(`Updated ${when} · Latest scored: ${lastSession||'—'}`,true);
      rerender();
    }catch(err){
      setStatus('History unavailable',false);
      $('j-message').textContent='Unable to load the published snapshot: '+err.message;
    }
  }
  $('refresh').addEventListener('click',load);
  $('j-range').addEventListener('click',event=>{
    const button=event.target.closest('button[data-range]');if(!button)return;
    options.range=button.dataset.range;
    for(const b of $('j-range').querySelectorAll('button'))b.classList.toggle('selected',b===button);
    rerender();
  });
  function selectMarket(market,moveFocus=false){
    if(!ALL_MARKETS.includes(market))return;
    options.market=market;
    for(const button of document.querySelectorAll('.journal-market-tabs button[role="tab"]')){
      const active=button.dataset.market===market;
      button.classList.toggle('active',active);
      button.setAttribute('aria-selected',String(active));
      button.tabIndex=active?0:-1;
      if(active&&moveFocus)button.focus();
    }
    rerender();
  }
  const marketTabs=document.querySelector('.journal-market-tabs');
  marketTabs.addEventListener('click',event=>{
    const button=event.target.closest('button[data-market]');
    if(button&&marketTabs.contains(button))selectMarket(button.dataset.market);
  });
  marketTabs.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();
    const current=event.target.closest('button[data-market]');if(!current)return;
    const market=event.key==='Home'?'spy':event.key==='End'?'qqq':options.market==='spy'?'qqq':'spy';
    selectMarket(market,true);
  });
  $('j-alert-only').addEventListener('change',event=>{options.alertsOnly=event.target.checked;rerender();});
  $('j-export').addEventListener('click',()=>{
    const rows=filterRows(entries,options);if(!rows.length)return;
    const csv=toCSV(rows),blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    try{
      const link=document.createElement('a');link.href=url;
      link.download=`${options.market}-history-${entries.at(-1).session}-${options.range}${options.alertsOnly?'-alerts':''}.csv`;
      document.body.appendChild(link);link.click();link.remove();
    }finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
  });
  load();
  return {validArchive,filterRows,toCSV,chartRows,signed,dateLabel};
});
