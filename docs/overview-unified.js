/* Unified Market Snapshot · presentation only.
 * Moves existing score DOM nodes; all indicator calculations and EOD history remain untouched.
 * The saved Daily Summary remains authoritative for completed-day price change and alerts. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const overview = $('clarity-overview');
  if (!overview || $('unified-snapshot')) return;
  const grid = overview.querySelector('.market-grid');
  const brief = overview.querySelector('.decision-brief');
  const intro = overview.querySelector('.section-intro');
  if (!grid || !brief || !intro) return;

  const make = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  const panel = make('section', 'unified-snapshot');
  panel.id = 'unified-snapshot';
  panel.setAttribute('aria-label', 'Latest completed market snapshot');
  const head = make('div', 'unified-top');
  const heading = make('div', 'unified-top-copy');
  heading.appendChild(make('p', 'unified-kicker', 'MARKET SNAPSHOT · COMPLETED EOD'));
  const briefTitle = $('brief-title');
  if (briefTitle) {
    heading.appendChild(briefTitle); // Move the live-updating heading; do not copy it.
    briefTitle.classList.add('unified-headline');
  } else {
    heading.appendChild(make('h2', 'unified-headline', 'Latest market conditions'));
  }
  heading.appendChild(make('p', 'unified-intro', 'One view of market health, price direction and key signals.'));
  const guide = make('a', 'unified-guide', 'How the 16-point Market Health Score works');
  guide.href = 'scoring-guide.html';
  heading.appendChild(guide);
  head.appendChild(heading);
  const sessionBox = intro.querySelector('.session-box');
  if (sessionBox) head.appendChild(sessionBox); // Keep #session and freshness IDs in place.
  panel.appendChild(head);

  const scoreRow = make('div', 'unified-score-row');
  scoreRow.appendChild(grid);
  panel.appendChild(scoreRow);
  overview.insertBefore(panel, intro); // Attach before looking up IDs inside the moved cards.

  // A compact SPY/QQQ price ribbon sits ABOVE the Market Snapshot.
  // These are ETF closes (not raw SPX/NDX index levels) and are strictly EOD.
  const ribbon = make('section', 'benchmark-ribbon');
  ribbon.id = 'benchmark-price-ribbon';
  ribbon.setAttribute('aria-label', 'SPY and QQQ latest completed closing prices');
  const ribbonHeader = make('div','benchmark-ribbon-heading');
  const ribbonHeadingLeft = make('div','benchmark-ribbon-heading-left');
  ribbonHeadingLeft.appendChild(make('span','benchmark-ribbon-kicker','BENCHMARK ETF PRICES'));
  ribbonHeadingLeft.appendChild(make('span','benchmark-ribbon-source','Latest completed close · not live quotes'));
  ribbonHeader.appendChild(ribbonHeadingLeft);
  const ribbonDate = make('span','benchmark-ribbon-date','Awaiting EOD session');
  ribbonDate.id='benchmark-ribbon-date';
  ribbonHeader.appendChild(ribbonDate);
  ribbon.appendChild(ribbonHeader);
  const ribbonGrid = make('div','benchmark-ribbon-grid');
  for(const [sym,name] of [['spy','SPY · S&P 500 ETF'],['qqq','QQQ · Nasdaq-100 ETF']]){
    const item=make('div','benchmark-ribbon-market');
    item.id='benchmark-ribbon-'+sym;
    const identity=make('div','benchmark-ribbon-identity');
    identity.appendChild(make('span','benchmark-ribbon-ticker',sym.toUpperCase()));
    identity.appendChild(make('span','benchmark-ribbon-name',name.split(' · ')[1]));
    const quote=make('div','benchmark-ribbon-quote');
    const close=make('strong','benchmark-ribbon-close','—');
    close.id='benchmark-ribbon-'+sym+'-close';
    const delta=make('div','benchmark-ribbon-delta');
    delta.dataset.direction='missing';
    const pct=make('strong','benchmark-ribbon-percent','—');
    pct.id='benchmark-ribbon-'+sym+'-percent';
    const pts=make('span','benchmark-ribbon-points','—');
    pts.id='benchmark-ribbon-'+sym+'-points';
    delta.append(pct,pts);
    quote.append(close,delta);
    item.append(identity,quote);
    ribbonGrid.appendChild(item);
  }
  ribbon.appendChild(ribbonGrid);
  overview.insertBefore(ribbon,panel);
  // Do not repeat the daily ETF price move inside either health-score card:
  // the strip above is the single source of price presentation.

  const divider = make('div','unified-divider');
  const driversHeader = make('div','unified-driver-heading');
  driversHeader.appendChild(make('h3','','Key market signals'));
  driversHeader.appendChild(make('span','','Volatility · breadth · credit'));
  divider.appendChild(driversHeader);
  const stats = brief.querySelector('.decision-brief-stats');
  if (stats) divider.appendChild(stats); // Live-updating score confirmation tiles.
  panel.appendChild(divider);

  const why = make('details','unified-why');
  why.appendChild(make('summary','','What is driving these conditions?'));
  const whyDetail = $('brief-detail');
  if (whyDetail) why.appendChild(whyDetail);
  panel.appendChild(why);

  const footer = make('div','unified-footer');
  const actions = overview.querySelector('.clarity-next-actions');
  if (actions) {
    const signalsButton = actions.querySelector('[data-open-view="signals"]');
    if (signalsButton) signalsButton.innerHTML = 'Explore all 16 signals <span aria-hidden="true">→</span>';
    const historyLink = actions.querySelector('a[href="insights-history.html"]');
    if (historyLink) { historyLink.href = 'insights-history.html#summaries'; historyLink.innerHTML = 'Daily Summary Archive <span aria-hidden="true">↗</span>'; }
    footer.appendChild(actions);
  }
  panel.appendChild(footer);

  // Retain the full original price/risk view under detailed Signals & Context;
  // the Overview gets only the appropriate concise status in each scorecard.
  const sourcePriceRisk = $('price-risk-panel');
  const intelligence = $('market-intelligence');
  if (sourcePriceRisk && intelligence) intelligence.insertBefore(sourcePriceRisk, intelligence.querySelector('.intel-grid'));

  // Pull the same committed, completed-EOD JSON used by the dashboard.
  // Require exact date alignment; never substitute a current TradingView quote.
  const asDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value||'');
  const isNum = value => typeof value === 'number' && Number.isFinite(value);
  const currency = value => '$'+value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const signedDollars = value => (value<0?'−':value>0?'+':'')+'$'+Math.abs(value).toFixed(2);
  const dateLabel = value => new Date(value+'T12:00:00Z').toLocaleDateString('en-US',{
    month:'short',day:'numeric',year:'numeric',timeZone:'UTC'
  });
  let currentRequest=0;
  let lastSignature='';
  function resetMarket(sym){
    $('benchmark-ribbon-'+sym+'-close').textContent='—';
    $('benchmark-ribbon-'+sym+'-percent').textContent='—';
    $('benchmark-ribbon-'+sym+'-points').textContent='—';
    $('benchmark-ribbon-'+sym).querySelector('.benchmark-ribbon-delta').dataset.direction='missing';
  }
  async function syncBenchmarkStrip(){
    const request=++currentRequest;
    const session=$('session')?.textContent?.trim()||'';
    if(!asDate(session)){
      ribbonDate.textContent='Awaiting completed EOD session';
      for(const sym of ['spy','qqq'])resetMarket(sym);
      return;
    }
    ribbonDate.textContent=dateLabel(session)+' close';
    try{
      const res=await fetch('data/latest.json?benchmark='+Date.now(),{cache:'no-store'});
      if(!res.ok)throw new Error('HTTP '+res.status);
      const data=await res.json();
      if(request!==currentRequest)return;
      if(data?.session!==session){
        ribbonDate.textContent='Closing prices pending for '+dateLabel(session);
        for(const sym of ['spy','qqq'])resetMarket(sym);
        return;
      }
      const changes=data.price_moves?.status==='complete' && data.price_moves.session===session
        ? data.price_moves : null;
      const prevSession=changes?.previous_session;
      const prevRow=Array.isArray(data.market_insights_history?.entries)
        ? data.market_insights_history.entries.find(r=>r?.session===prevSession):null;
      for(const sym of ['spy','qqq']){
        const move=changes?.[sym];
        // Price fallback from the saved history is allowed only for this same EOD date.
        const currentRow=Array.isArray(data.market_insights_history?.entries)
          ? data.market_insights_history.entries.find(r=>r?.session===session):null;
        const currentClose=isNum(move?.close) && move.close>0 ? move.close :
          isNum(currentRow?.[sym]?.close) && currentRow[sym].close>0 ? currentRow[sym].close:null;
        const sourceAsOf=$(''+sym+'-ma-asof')?.textContent?.match(/\d{4}-\d{2}-\d{2}/)?.[0];
        const technicalClose=$(''+sym+'-ma-close')?.textContent||'';
        const maClose=Number(technicalClose.replace(/[$,]/g,''));
        // Where the technicals value is loaded and dated, confirm the data agrees.
        const maMismatch=sourceAsOf===session && isNum(maClose) && maClose>0 && isNum(currentClose)
          && Math.abs(maClose-currentClose)>0.03;
        const closeEl=$('benchmark-ribbon-'+sym+'-close');
        const pctEl=$('benchmark-ribbon-'+sym+'-percent');
        const pointsEl=$('benchmark-ribbon-'+sym+'-points');
        const deltaEl=$('benchmark-ribbon-'+sym).querySelector('.benchmark-ribbon-delta');
        if(!isNum(currentClose)||maMismatch){resetMarket(sym);continue;}
        closeEl.textContent=currency(currentClose);
        const prior=isNum(move?.previous_close)&&move.previous_close>0 ? move.previous_close :
          isNum(prevRow?.[sym]?.close)&&prevRow[sym].close>0 ? prevRow[sym].close : null;
        const points=isNum(prior)?Math.round((currentClose-prior)*100)/100:null;
        const pct=isNum(move?.change_pct)?move.change_pct:
          isNum(prior)?((currentClose-prior)/prior)*100:null;
        if(isNum(pct)){
          pctEl.textContent=(pct>0?'▲ +':pct<0?'▼ −':'')+Math.abs(pct).toFixed(2)+'%';
        } else pctEl.textContent='Change pending';
        pointsEl.textContent=isNum(points)?signedDollars(points):'Point change unavailable';
        const direction=isNum(points)?Math.sign(points):isNum(pct)?Math.sign(pct):null;
        deltaEl.dataset.direction=direction===1?'up':direction===-1?'down':direction===0?'flat':'missing';
      }
    }catch(_err){
      if(request!==currentRequest)return;
      ribbonDate.textContent='Completed closing prices unavailable';
      for(const sym of ['spy','qqq'])resetMarket(sym);
    }
  }
  function watchSession(){
    const now=$('session')?.textContent?.trim()||'';
    if(now===lastSignature)return;
    lastSignature=now;
    syncBenchmarkStrip();
  }
  if($('session'))new MutationObserver(watchSession).observe($('session'),{childList:true,characterData:true,subtree:true});
  // A background browser tab can remain open after the next EOD refresh.
  window.addEventListener('focus',syncBenchmarkStrip);
  window.setInterval(syncBenchmarkStrip,10*60*1000);
  watchSession();
  // All scoring/data IDs remain exactly the same and are still updated by app.js.
  document.body.classList.add('unified-ready');
})();
