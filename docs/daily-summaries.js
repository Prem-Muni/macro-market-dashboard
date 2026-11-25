/* Daily summaries derived from the existing persistent market_insights_history.
 * No external data feeds, no score changes and no fabricated prior-session returns.
 * Historic dates/observations are read from latest.json's committed EOD journal.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DailySummaries = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const date = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T12:00:00Z'));
  const formatted = s => date(s) ? new Date(s+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}) : '—';
  const signed = n => finite(n) ? `${n > 0 ? '+' : ''}${n.toFixed(2)}%` : '—';
  const money = n => finite(n) && n>0 ? '$'+n.toFixed(2) : '—';
  const regime = (lo,hi) => {
    const zone = n => n<=5?'RISK-OFF':n<=10?'NEUTRAL':'RISK-ON';
    return finite(lo) && finite(hi) && zone(lo)===zone(hi) ? zone(lo) : 'INCOMPLETE';
  };
  const scoreText = x => x && finite(x.low) && finite(x.high) ? `${x.low}${x.low!==x.high?'–'+x.high:''}/${x.total}` : '—';
  const priceRisk = (pct,risk,baseline) => {
    if(baseline) return {kind:'baseline',label:'Baseline only · no prior ETF close'};
    if(!finite(pct)||risk==='INCOMPLETE')return {kind:'uncertain',label:'Price/risk comparison incomplete'};
    if(pct>=2&&risk==='RISK-OFF')return {kind:'divergence',label:'Strong rally · Risk-Off persists'};
    if(pct<=-2&&risk==='RISK-ON')return {kind:'divergence',label:'Sharp selloff · Risk-On persists'};
    if(Math.abs(pct)>=2&&risk==='NEUTRAL')return {kind:'watch',label:'Large move · Neutral regime'};
    return {kind:'none',label:'No price/risk divergence flagged'};
  };
  function fromArchivedMarket(item,baseline){
    if(!item || !Number.isInteger(item.total)||!Number.isInteger(item.available)||!Number.isInteger(item.score)||
       ![15,16].includes(item.total)||item.score<0||item.score>item.available||item.available>item.total)return null;
    const low=item.available-item.score,high=item.total-item.score;
    const risk=regime(low,high);
    const pct=finite(item.price_change_pct)?item.price_change_pct:null;
    const alert=(!baseline && item.available<item.total) ? {kind:'uncertain',label:'Scoring incomplete · alert not confirmed'} : priceRisk(pct,risk,baseline);
    return {low,high,total:item.total,available:item.available,risk,
      pct,close:finite(item.close)?item.close:null,
      trend:typeof item.trend_5d==='string'?item.trend_5d:'N/A',
      delta:finite(item.score_delta_1d)?-item.score_delta_1d:null,
      alert};
  }
  function fromSnapshotMarket(item,move){
    const sc=item?.score;
    if(!sc||!Number.isInteger(sc.total)||!Number.isInteger(sc.available)||!Number.isInteger(sc.bearish)||
        sc.total!==16||sc.available<sc.bearish||sc.available>sc.total)return null;
    const low=sc.available-sc.bearish,high=sc.total-sc.bearish,risk=regime(low,high);
    const pct=finite(move?.change_pct)?move.change_pct:null;
    return {low,high,total:sc.total,available:sc.available,risk,
      pct,close:finite(move?.close)?move.close:null,
      trend:typeof item?.momentum?.state==='string'?item.momentum.state:'N/A',
      delta:null,alert:sc.available<sc.total ? {kind:'uncertain',label:'Scoring incomplete · alert not confirmed'} : priceRisk(pct,risk,false)};
  }
  function makeSummary(day,previous,spy,qqq,origin){
    if(!date(day)||!spy||!qqq)return null;
    const both=spy.risk===qqq.risk && spy.risk!=='INCOMPLETE';
    const names={'RISK-OFF':'Risk-Off','NEUTRAL':'Neutral','RISK-ON':'Risk-On'};
    const headline=both?`Both benchmarks are ${names[spy.risk]}`:
      spy.risk==='INCOMPLETE'||qqq.risk==='INCOMPLETE'?'Market scores are partially incomplete':'SPY and QQQ have different risk regimes';
    const x=`SPY ${scoreText(spy)} (${names[spy.risk]||'incomplete'})`,y=`QQQ ${scoreText(qqq)} (${names[qqq.risk]||'incomplete'})`;
    const moves=finite(spy.pct)&&finite(qqq.pct)?` SPY ${signed(spy.pct)} and QQQ ${signed(qqq.pct)} versus the prior completed session.`:'';
    const gaps=[spy,qqq].filter(o=>o.available<o.total).length;
    const coverage=gaps?` ${gaps===2?'Both benchmarks have':'One benchmark has'} missing scored inputs; scores are shown as ranges where necessary.`:'';
    const summary=`${x}; ${y}.${moves}${coverage}`;
    const alertCount=[spy,qqq].filter(x=>x.alert.kind==='divergence').length;
    const alertHeadline=alertCount===2?'Price/risk divergence in both ETFs':alertCount===1?'Price/risk divergence in one ETF':
      [spy,qqq].some(x=>x.alert.kind==='uncertain')?'Price/risk check incomplete':'No price/risk divergence flagged';
    return {session:day,previousSession:date(previous)&&previous<day?previous:null,
      origin,headline,summary,spy,qqq,alertCount,alertHeadline,partial:gaps>0};
  }
  function savedSummaries(data){
    const archive=data?.market_insights_history;
    if(archive?.version!==1||!Array.isArray(archive.entries))return [];
    const out=[],seen=new Set();
    for(const row of archive.entries){
      if(!row || !date(row.session)||seen.has(row.session))continue;
      const baseline=row.baseline===true;
      const spy=fromArchivedMarket(row.spy,baseline),qqq=fromArchivedMarket(row.qqq,baseline);
      const summary=makeSummary(row.session,row.previous_session,spy,qqq,baseline?'screenshot_baseline':'saved_eod');
      if(!summary)continue;
      seen.add(summary.session);out.push(summary);
    }
    return out.sort((a,b)=>a.session.localeCompare(b.session));
  }
  function latestSummary(data){
    if(!date(data?.session))return null;
    const archived=savedSummaries(data).find(x=>x.session===data.session);
    const move=data.price_moves?.status==='complete' && data.price_moves.session===data.session?data.price_moves:null;
    const spy=fromSnapshotMarket(data.markets?.sp500,move?.spy),qqq=fromSnapshotMarket(data.markets?.nasdaq100,move?.qqq);
    const latest=makeSummary(data.session,move?.previous_session,spy,qqq,'current_eod');
    if(!latest)return archived||null;
    // A saved same-session price comparison may be richer than a partial current
    // snapshot. Never mix mismatched scoring models or dates.
    if(archived && archived.spy.total===latest.spy.total && archived.qqq.total===latest.qqq.total){
      for(const key of ['spy','qqq']){
        const candidate=archived[key],current=latest[key];
        if(finite(candidate.pct)&&!finite(current.pct)){
          current.pct=candidate.pct;current.close=candidate.close;
          current.alert=current.available<current.total ? {kind:'uncertain',label:'Scoring incomplete · alert not confirmed'} : priceRisk(current.pct,current.risk,false);
        }
        if(finite(candidate.delta))current.delta=candidate.delta;
      }
      return makeSummary(latest.session,archived.previousSession||latest.previousSession,latest.spy,latest.qqq,'current_eod');
    }
    return latest;
  }
  function previousSummaries(data){
    const latest=date(data?.session)?data.session:null;
    return savedSummaries(data).filter(x=>!latest||x.session<latest).reverse();
  }
  function csv(rows){
    const cols=['Date','Comparison from','Source','Headline','Summary','SPY Health','SPY Regime','SPY Price Change %','SPY Alert','QQQ Health','QQQ Regime','QQQ Price Change %','QQQ Alert','Signal Coverage Incomplete'];
    const values=[cols,...rows.map(x=>[x.session,x.previousSession,x.origin,x.headline,x.summary,scoreText(x.spy),x.spy.risk,x.spy.pct,x.spy.alert.label,scoreText(x.qqq),x.qqq.risk,x.qqq.pct,x.qqq.alert.label,x.partial])];
    const field=v=>{let s=v==null?'':String(v);if(/^[\s]*[=+@\-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
    return '\uFEFF'+values.map(row=>row.map(field).join(',')).join('\r\n')+'\r\n';
  }
  const api={savedSummaries,latestSummary,previousSummaries,scoreText,signed,money,formatted,csv};
  if(typeof document==='undefined')return api;
  const $=id=>document.getElementById(id);
  const put=(parent,tag,cls,value)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(value!==undefined)e.textContent=value;parent.appendChild(e);return e;};
  // Presentation language only. These labels never change the saved score,
  // percentage move, alert rule, or historical journal.
  function marketDescription(symbol,entry){
    const r=entry.risk==='RISK-OFF'?'Risk-Off':entry.risk==='RISK-ON'?'Risk-On':entry.risk==='NEUTRAL'?'Neutral':'unconfirmed';
    const percent=finite(entry.pct)?Math.abs(entry.pct).toFixed(2)+'%':null;
    if(entry.alert.kind==='baseline')return `Screenshot baseline: Market Health ${scoreText(entry)} (${r}). No earlier ETF close was supplied, so the daily return and divergence cannot be evaluated.`;
    if(entry.alert.kind==='uncertain')return `Market Health ${scoreText(entry)} (${r}) has missing inputs or an unverified price comparison. No divergence conclusion is asserted.`;
    if(!percent)return `Market Health ${scoreText(entry)} (${r}). Prior-day closing price unavailable; a daily price/risk comparison cannot be confirmed.`;
    const action=entry.pct>0?`rose ${percent}`:entry.pct<0?`fell ${percent}`:'closed unchanged';
    if(entry.alert.kind==='divergence')return `${symbol} ${action} while Market Health remained ${scoreText(entry)} (${r}). The price move and risk regime disagree; a single session does not confirm a regime change.`;
    if(entry.alert.kind==='watch')return `${symbol} ${action} while Market Health is ${scoreText(entry)} (Neutral). A sizable move warrants review, but is not a confirmed regime transition.`;
    return `${symbol} ${action}; Market Health is ${scoreText(entry)} (${r}). No qualifying price/risk divergence was detected this session.`;
  }
  function marketTitle(entry){
    if(entry.alert.kind==='divergence'||entry.alert.kind==='watch')return entry.alert.label;
    if(entry.alert.kind==='baseline')return 'Screenshot baseline · no prior close';
    if(entry.alert.kind==='uncertain')return 'Incomplete data · comparison unconfirmed';
    if(!finite(entry.pct))return 'Daily price change unavailable';
    const move=entry.pct>=2?'Strong rally':entry.pct<=-2?'Sharp decline':entry.pct>0?'Positive session':entry.pct<0?'Down day':'Flat session';
    const regimeName=entry.risk==='RISK-OFF'?'Risk-Off':entry.risk==='RISK-ON'?'Risk-On':entry.risk==='NEUTRAL'?'Neutral':'Unconfirmed';
    return `${move} · ${regimeName} persists`;
  }
  function etfTile(parent,symbol,longName,entry){
    const box=put(parent,'article','daily-summary-etf');
    box.dataset.tone=entry.alert.kind==='divergence'?'divergence':entry.alert.kind==='watch'?'watch':entry.alert.kind==='uncertain'?'incomplete':'standard';
    box.dataset.price=finite(entry.pct)?entry.pct>0?'up':entry.pct<0?'down':'flat':'missing';
    box.dataset.regime=entry.risk;
    const head=put(box,'div','daily-summary-etf-head');
    const labels=put(head,'div','daily-summary-symbol-wrap');
    put(labels,'span','daily-summary-symbol',symbol);
    put(labels,'span','daily-summary-market-label',longName);
    const move=put(head,'strong','daily-summary-move',signed(entry.pct));
    move.setAttribute('aria-label',finite(entry.pct)?`${symbol} price change ${signed(entry.pct)}`:`${symbol} daily price change not available`);
    put(box,'h4','daily-summary-etf-title',marketTitle(entry));
    put(box,'p','daily-summary-etf-evidence',marketDescription(symbol,entry));
    const metrics=put(box,'div','daily-summary-etf-metrics');
    put(metrics,'span','daily-summary-metric',`HEALTH ${scoreText(entry)}`);
    const risk=put(metrics,'span','daily-summary-metric daily-summary-regime',entry.risk==='RISK-OFF'?'RISK-OFF':entry.risk==='RISK-ON'?'RISK-ON':entry.risk==='NEUTRAL'?'NEUTRAL':'UNCONFIRMED');
    risk.dataset.tone=entry.risk;
    if(entry.available<entry.total)put(box,'p','daily-summary-partial',`${entry.available}/${entry.total} signals available · range shown, not an assumed value`);
    return box;
  }
  function renderCard(parent,record,current){
    const card=put(parent,'article',current?'daily-summary-card current':'daily-summary-card');
    card.dataset.tone=record.alertCount?'divergence':record.partial?'incomplete':'standard';
    const top=put(card,'div','daily-summary-top');
    put(top,'span','eyebrow',`${current?'DAILY PRICE ↔ RISK · COMPLETED EOD':'ARCHIVED PRICE ↔ RISK · COMPLETED EOD'} · ${formatted(record.session)}`);
    put(top,'span','daily-summary-source',record.origin==='screenshot_baseline'?'SCREENSHOT BASELINE':record.previousSession?`${formatted(record.previousSession)} → ${formatted(record.session)}`:'Completed EOD session');
    put(card,'h3','daily-summary-headline',record.alertCount?record.alertHeadline:record.headline);
    put(card,'p','daily-summary-description',record.summary);
    const tiles=put(card,'div','daily-summary-etfs');
    etfTile(tiles,'SPY','S&P 500',record.spy);
    etfTile(tiles,'QQQ','NASDAQ-100',record.qqq);
    const footer=put(card,'div','daily-summary-footer');
    const alertText=record.alertCount?record.alertHeadline:record.partial?'Some indicator comparisons are incomplete':'No qualifying price/risk divergence this session';
    put(footer,'span',record.alertCount?'daily-summary-alert':'daily-summary-muted',alertText);
    if(record.partial)put(footer,'span','daily-summary-muted','Missing data is not treated as bullish or bearish');
    if(record.origin==='screenshot_baseline')put(footer,'span','daily-summary-muted','Prior ETF close unavailable · historical baseline');
    return card;
  }
  async function loadData(){
    const res=await fetch('data/latest.json?summary_refresh='+Date.now(),{cache:'no-store'});
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  async function renderOverview(){
    const target=$('daily-summary-live')||$('daily-summary-overview');if(!target)return;
    try{
      const data=await loadData();const r=latestSummary(data);
      target.replaceChildren();
      if(!r){put(target,'p','daily-summary-muted','No verified completed EOD summary is available yet.');return;}
      renderCard(target,r,true);
    }catch(err){target.replaceChildren();put(target,'p','daily-summary-muted','Daily summary unavailable: '+err.message);}
  }
  let archive=[];
  async function renderHistory(){
    const panel=$('summary-view');if(!panel)return;
    try{
      const data=await loadData();
      const old=$('summary-archive');old.replaceChildren();
      archive=previousSummaries(data);
      if(!archive.length){put(old,'p','daily-summary-muted','Earlier dated EOD summaries will appear here automatically after each new completed session.');}
      else for(const day of archive)renderCard(old,day,false);
      $('summary-count').textContent=archive.length+` previous session${archive.length===1?'':'s'} saved`;
      $('summary-export').disabled=!archive.length;
    }catch(err){const old=$('summary-archive');if(old)old.textContent='Daily summaries unavailable: '+err.message;}
  }
  function initHistory(){
    const host=$('summary-view');if(!host)return;
    const summariesBtn=$('summary-tab-current'),historyBtn=$('summary-tab-etfs'),historyHost=$('j-history-views');
    function show(which){
      const showingSummary=which==='summaries';host.hidden=!showingSummary;historyHost.hidden=showingSummary;
      summariesBtn.setAttribute('aria-selected',String(showingSummary));
      historyBtn.setAttribute('aria-selected',String(!showingSummary));
      summariesBtn.classList.toggle('active',showingSummary);historyBtn.classList.toggle('active',!showingSummary);
      if(showingSummary)renderHistory();
    }
    summariesBtn.addEventListener('click',()=>{show('summaries');history.replaceState(null,'','#summaries');});
    historyBtn.addEventListener('click',()=>{show('etfs');history.replaceState(null,'','#etfs');});
    const fromHash=()=>show(location.hash==='#etfs'?'etfs':'summaries');
    window.addEventListener('hashchange',fromHash);fromHash();
    $('summary-export').addEventListener('click',()=>{
      if(!archive.length)return;
      const blob=new Blob([csv(archive)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;a.download='market-daily-summaries-through-'+archive[0].session+'.csv';
      document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
  }
  // Only the main dashboard may receive the latest-summary card. Do not inject
  // it into History, Guide, or Research, which caused duplicate summaries.
  if(!$('daily-summary-overview')){
    const overview=$('clarity-overview');
    if(overview){
      const wrap=document.createElement('section');wrap.id='daily-summary-overview';wrap.className='daily-summary-overview';
      wrap.setAttribute('aria-label','Latest completed daily price and risk summary');
      const slot=document.createElement('div');slot.id='daily-summary-live';wrap.appendChild(slot);
      const link=document.createElement('a');link.href='insights-history.html#summaries';link.className='daily-summary-overview-link';link.textContent='View previous daily summaries →';wrap.appendChild(link);
      const brief=overview.querySelector('.decision-brief');
      if(brief)brief.insertAdjacentElement('afterend',wrap);else overview.prepend(wrap);
    }
  }
  if($('daily-summary-overview')){
    renderOverview();const refresh=$('refresh');if(refresh)refresh.addEventListener('click',renderOverview);
    setInterval(renderOverview,10*60*1000);
  }
  if($('summary-view')){
    initHistory();const refresh=$('refresh');if(refresh)refresh.addEventListener('click',renderHistory);
  }
  return api;
});
