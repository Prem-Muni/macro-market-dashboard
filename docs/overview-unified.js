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
  const sectionTitle = make('p', 'unified-kicker', 'Daily Market Snapshot');
  sectionTitle.setAttribute('role', 'heading');
  sectionTitle.setAttribute('aria-level', '2');
  const titleRow = make('div', 'unified-title-with-art');
  const art = make('span', 'market-condition-art');
  art.id = 'market-condition-art';
  art.setAttribute('role','img');
  art.setAttribute('aria-label','Market condition pending');
  art.dataset.state = 'pending';
  titleRow.append(sectionTitle,art);
  heading.appendChild(titleRow);
  // The live #brief-title stays in the original hidden .decision-brief,
  // so app.js can update it without repeating the regime headline here.
  // SPY/QQQ scorecards and the dedicated Daily Market Summary carry the meaning.
  const guide = make('a', 'unified-guide', 'How the 16-point Market Health Score works');
  guide.href = 'scoring-guide.html';
  heading.appendChild(guide);
  head.appendChild(heading);
  const sessionBadge = make('time', 'unified-session-date', 'Date pending');
  sessionBadge.id = 'unified-session-date';
  sessionBadge.setAttribute('aria-label', 'Latest completed market session date');
  head.appendChild(sessionBadge);
  const sessionBox = intro.querySelector('.session-box');
  if (sessionBox) {
    // Data/status nodes stay in the DOM for existing scoring and freshness logic.
    sessionBox.classList.add('unified-source-session');
    head.appendChild(sessionBox);
  }
  panel.appendChild(head);

  const scoreRow = make('div', 'unified-score-row compact-snapshot-row');
  scoreRow.appendChild(grid);
  panel.appendChild(scoreRow);
  overview.insertBefore(panel, intro); // Attach before looking up IDs inside the moved cards.

  // The ETF close belongs in its own Market Health card, not in a
  // duplicate top-of-page price ribbon. Dynamic values are bound below.
  for (const [sym, prefix] of [['spy','sp'],['qqq','nd']]) {
    const card = $(prefix + '-card');
    const head = card?.querySelector('.market-head');
    if (!head) continue;
    card.classList.add('compact-market-card');
    const oldPill = head.querySelector('.tiny-pill');
    if (oldPill) oldPill.remove();
    const quote = make('div','overview-etf-quote');
    quote.id='overview-etf-quote-'+sym;
    quote.setAttribute('aria-label', sym.toUpperCase()+' completed-session close');
    const label = make('span','overview-quote-label','Market Closed · Price pending');
    label.id='overview-quote-date-'+sym;
    const close = make('strong','overview-quote-value','—');
    close.id='overview-close-'+sym;
    const delta = make('span','overview-quote-delta','Change unavailable');
    delta.id='overview-quote-delta-'+sym;
    delta.dataset.direction='missing';
    quote.append(label,close,delta);
    head.appendChild(quote);
  }

  // The 16-point model is unchanged. Each visual label reads the existing
  // scored #sp-regime / #nd-regime text, never the reverse.
  // Self-styled SVGs: older cached CSS must not turn line icons into
  // solid black filled shapes. This style survives independent CSS caching.
  const arrow = d => '<svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" style="display:block;fill:none;stroke:currentColor;stroke-width:3;stroke-linecap:round;stroke-linejoin:round"><path d="'+d+'"/></svg>';
  const regimeArrow = {
    bull: arrow('m4 22 8-8 6 6 10-12M20 8h8v8'),
    bear: arrow('m4 9 8 8 6-6 10 12M20 23h8v-8'),
    balanced: arrow('M7 16h18'),
    mixed: arrow('m5 11 8 8 6-6 8 8M20 21h7v-7'),
    pending: '<svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" style="display:block;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round"><circle cx="16" cy="16" r="12"/><path d="M16 11v7M16 23v.5"/></svg>'
  };
  const marketMoods = {};
  for (const [prefix, sym] of [['sp', 'SPY'], ['nd', 'QQQ']]) {
    const original = $(prefix + '-regime');
    if (!original) continue;
    // Preserve the original node and its id: app.js continues to update it.
    original.classList.add('regime-source-only');
    original.setAttribute('aria-hidden','true');
    // app.js rewrites className on each EOD refresh. The inline important
    // display rule stays attached to the original element across updates.
    original.style.setProperty('display', 'none', 'important');
    const mood = make('div','market-mood');
    mood.id = prefix + '-market-mood';
    mood.dataset.state = 'pending';
    mood.setAttribute('role','status');
    mood.setAttribute('aria-label',sym+' market condition pending');
    mood.innerHTML = '<span class="market-mood-symbol" aria-hidden="true"></span><span class="market-mood-copy"><strong>Pending</strong><small>Awaiting data</small></span>';
    // The illustrated badge takes the old badge's exact slot in .score-zone.
    // Keep the original scored node as a hidden child so app.js can still
    // update it by ID, even if app.js replaces the original CSS class.
    original.replaceWith(mood);
    mood.appendChild(original);
    marketMoods[prefix] = mood;
  }
  function updateMarketMoods() {
    for (const [prefix,sym] of [['sp','SPY'],['nd','QQQ']]) {
      const mood = marketMoods[prefix];
      if (!mood) continue;
      const current = regime(prefix+'-regime');
      const state = current==='Risk-On'?'bull':current==='Risk-Off'?'bear':current==='Neutral'?'balanced':'pending';
      const word = state==='bull'?'Bull':state==='bear'?'Bear':state==='balanced'?'Balanced':'Pending';
      const technical = current||'Awaiting data';
      if (mood.dataset.state===state && mood.querySelector('small')?.textContent===technical) continue;
      mood.dataset.state=state;
      mood.querySelector('.market-mood-symbol').innerHTML=regimeArrow[state];
      mood.querySelector('strong').textContent=word;
      mood.querySelector('small').textContent=technical;
      mood.setAttribute('aria-label',sym+': '+word+' ('+technical+')');
    }
  }

  // One visitor-friendly recap explains the relationship between price,
  // Market Health, and the key indicators without duplicating full alerts.
  const recap = make('section','unified-recap');
  recap.id='unified-daily-recap';
  recap.setAttribute('aria-labelledby','unified-recap-title');
  const recapHeading = make('div','unified-recap-heading');
  const recapCopy = make('div','unified-recap-copy');
  const recapTitle = make('h3','unified-recap-title','Daily Market Summary');
  recapTitle.id='unified-recap-title';
  recapCopy.appendChild(recapTitle);
  recapHeading.appendChild(recapCopy);
  const recapDate = make('span','unified-recap-date','Awaiting EOD data');
  recapDate.id='unified-recap-date';
  recapHeading.appendChild(recapDate);
  const recapBody = make('p','unified-recap-text','A plain-English summary will appear when the completed closing prices and market health scores are available.');
  recapBody.id='unified-recap-text';
  recapBody.setAttribute('aria-live','polite');
  const transitionBox = make('div','unified-regime-transition');
  transitionBox.id='unified-regime-transition';
  transitionBox.hidden=true;
  transitionBox.appendChild(make('strong','','Market Regime Transition'));
  const transitionText = make('p','unified-transition-text');
  transitionBox.appendChild(transitionText);
  const internalBox = make('div','unified-internal-changes');
  internalBox.id='unified-internal-changes';
  const internalHead=make('div','unified-internals-head');
  internalHead.appendChild(make('strong','','Changes in Market Internals'));
  const signalDetails=make('button','unified-internals-detail','View all signal changes →');
  signalDetails.type='button';
  signalDetails.addEventListener('click',()=>{
    const target=document.querySelector('[data-open-view="signals"]');
    if(target)target.click();
    const changes=$('session-changes');
    if(changes)changes.scrollIntoView({block:'start',behavior:'smooth'});
  });
  internalHead.appendChild(signalDetails);
  const internalUp=make('p','unified-internals-up','Waiting for a verified prior-session comparison.');
  internalUp.id='unified-internals-up';
  const internalDown=make('p','unified-internals-down');
  internalDown.id='unified-internals-down';
  internalBox.append(internalHead,internalUp,internalDown);
  const recapFootnote = make('p','unified-recap-note','Rule-based daily snapshot, not a forecast or trading recommendation.');
  const recapDetails=make('details','compact-recap-details');
  recapDetails.append(make('summary','','Regime transition & internal changes'),transitionBox,internalBox,recapFootnote);
  recap.append(recapHeading,recapBody,recapDetails);
  scoreRow.appendChild(recap);
  // Calendar follows the top snapshot on Overview, but remains in its original
  // location when viewing another dashboard subtab.
  function placeCalendar(){
    const cal=$('mi-market-calendar'),nav=document.querySelector('nav.site-tabs');
    if(!cal||!nav)return;
    if(overview.hidden){if(cal.previousElementSibling!==nav)nav.after(cal);}
    else if(cal.previousElementSibling!==scoreRow)scoreRow.after(cal);
  }
  placeCalendar();
  new MutationObserver(placeCalendar).observe(overview,{attributes:true,attributeFilter:['hidden']});

  const divider = make('div','unified-divider');
  const driversHeader = make('div','unified-driver-heading');
  driversHeader.appendChild(make('h3','','Market Signal Heatmap'));
  driversHeader.appendChild(make('span','','Latest completed EOD'));
  divider.appendChild(driversHeader);
  const stats = brief.querySelector('.decision-brief-stats');
  // Keep source nodes available to existing summary calculations, but hide the old cards.
  if (stats) { stats.hidden=true; stats.style.setProperty('display','none','important'); divider.appendChild(stats); }
  const board = make('div','overview-signal-board');
  board.id='overview-signal-board';
  divider.appendChild(board);
  panel.appendChild(divider);
  window.OverviewSignalBoard?.mount(board);

  panel.classList.add('reference-overview-layout');
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

  // Preserve calculation target nodes inside the retired presentation;
  // only the concise daily transition recap remains on Overview.
  const sourcePriceRisk = $('price-risk-panel');
  const intelligence = $('market-intelligence');
  if (sourcePriceRisk && intelligence) intelligence.insertBefore(sourcePriceRisk, intelligence.querySelector('.intel-grid'));

  // The same saved completed-EOD snapshot drives these three displays:
  // top-right prices, Technical pulse quotes, and the shared daily recap.
  // Never use an independently updating TradingView quote here.
  const asDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value||'');
  const isNum = value => typeof value === 'number' && Number.isFinite(value);
  const currency = value => '$'+value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const signedDollars = value => (value<0?'−':value>0?'+':'')+'$'+Math.abs(value).toFixed(2);
  const dateLabel = value => new Date(value+'T12:00:00Z').toLocaleDateString('en-US',{
    month:'short',day:'numeric',year:'numeric',timeZone:'UTC'
  });
  const describeMove = (ticker,pct) => {
    if (!isNum(pct)) return ticker+' price change is not available';
    const magnitude=Math.abs(pct).toFixed(2)+'%';
    return ticker+' '+(pct>0?'rose ':pct<0?'fell ':'was flat at ')+magnitude;
  };
  let lastPrices=null;
  let lastInternals=null;
  let lastTransition=null;
  let currentRequest=0;
  let lastSignature='';

  // Reuse the validated saved ETF close in the original chart heading.
  for (const sym of ['spy','qqq']) {
    const card = $(sym+'-ma-close')?.closest('.market-price-panel');
    const heading = card?.querySelector('.market-chart-heading');
    if (!heading || $('technical-close-'+sym)) continue;
    const quote=make('span','technical-close','— · EOD price pending');
    quote.id='technical-close-'+sym;
    quote.setAttribute('aria-label',sym.toUpperCase()+' latest completed closing price');
    heading.querySelector('div')?.appendChild(quote);
  }

  function resetMarket(sym){
    $('overview-close-'+sym).textContent='—';
    $('overview-quote-delta-'+sym).textContent='Price change pending';
    $('overview-quote-delta-'+sym).dataset.direction='missing';
    $('overview-quote-date-'+sym).textContent='Market Closed · Price pending';
    const technical=$('technical-close-'+sym);
    if(technical)technical.textContent='— · Closing price pending';
  }
  function regime(key){
    const text=$(key)?.textContent?.trim()||'';
    return /risk.off/i.test(text)?'Risk-Off':/risk.on/i.test(text)?'Risk-On':/neutral/i.test(text)?'Neutral':null;
  }
  function updateArt(){
    updateMarketMoods();
    const sp=regime('sp-regime'),qq=regime('nd-regime');
    let state='pending',description='Market health reading pending';
    if(sp&&qq){
      if(sp!==qq){state='mixed';description='Mixed market conditions: SPY '+sp+', QQQ '+qq;}
      else if(sp==='Risk-On'){state='bull';description='Both SPY and QQQ in Risk-On';}
      else if(sp==='Risk-Off'){state='bear';description='Both SPY and QQQ in Risk-Off';}
      else {state='neutral';description='Both SPY and QQQ in Neutral';}
    }
    if(art.dataset.state===state&&art.getAttribute('aria-label')===description)return;
    art.dataset.state=state;
    art.setAttribute('aria-label',description);
    art.title=description;
    art.innerHTML=regimeArrow[state==='neutral'?'balanced':state];
  }
  function validScore(sym){
    const value=$(sym==='spy'?'sp-score':'nd-score')?.textContent?.trim()||'';
    return /^\d+(?:[–-]\d+)?\/16$/.test(value)?value:null;
  }
  function driversSummary(){
    const vol=$('brief-volatility')?.textContent?.trim()||'';
    const breadth=$('brief-breadth')?.textContent?.trim()||'';
    const credit=$('brief-credit')?.textContent?.trim()||'';
    const facts=[];
    if (/both bearish/i.test(vol))facts.push('volatility gauges remain bearish');
    else if (/both bullish/i.test(vol))facts.push('volatility gauges are supportive');
    if (/bearish/i.test(credit))facts.push('credit conditions are bearish');
    else if (/bullish/i.test(credit))facts.push('credit conditions are supportive');
    if (/no joint warning/i.test(breadth))facts.push('one-day breadth has no joint warning');
    else if (/both bearish/i.test(breadth))facts.push('one-day breadth is bearish in both markets');
    return facts.length ? facts.join('; ') : null;
  }
  function writeInternals(){
    const session=$('session')?.textContent?.trim()||'';
    const changes=lastInternals;
    internalDown.hidden=true;
    if(!asDate(session)||lastPrices?.session!==session||!changes?.available){
      internalUp.textContent='Prior-session internal changes are not yet verified for this EOD reading.';
      internalUp.dataset.tone='unknown';
      return;
    }
    internalUp.dataset.tone='positive';
    if(changes.improvedCount){
      internalUp.textContent='Improved ('+changes.improvedCount+'): '+changes.improved;
    }else if(!changes.worsenedCount){
      internalUp.textContent='No scored internal signal gained or lost a health point.';
      internalUp.dataset.tone='neutral';
    }else{
      internalUp.textContent='No scored internals improved.';
      internalUp.dataset.tone='neutral';
    }
    if(changes.worsenedCount){
      internalDown.hidden=false;
      internalDown.textContent='Weakened ('+changes.worsenedCount+'): '+changes.worsened;
    }
    if(changes.partial){
      internalDown.hidden=false;
      internalDown.textContent+=(internalDown.textContent?' · ':'')+'Partial historical signal comparison.';
    }
  }
  function writeRecap(){
    updateArt();
    const session=$('session')?.textContent?.trim()||'';
    writeInternals();
    transitionBox.hidden=!(asDate(session)&&lastPrices?.session===session&&lastTransition);
    transitionText.textContent=transitionBox.hidden?'':lastTransition;
    if(!asDate(session) || lastPrices?.session!==session){
      recapDate.textContent=asDate(session)?dateLabel(session):'Awaiting EOD session';
      recapBody.textContent='The completed-session prices and scores have not yet been verified for the same date. Please check again after the EOD refresh.';
      return;
    }
    recapDate.textContent=dateLabel(session);
    const a=lastPrices.spy?.pct, b=lastPrices.qqq?.pct;
    let priceSentence;
    if(isNum(a)&&isNum(b)){
      priceSentence=describeMove('SPY',a)+' and '+(isNum(b)?describeMove('QQQ',b):'QQQ comparison is pending')+'.';
    }else if(isNum(a)||isNum(b)){
      priceSentence=(isNum(a)?describeMove('SPY',a):describeMove('QQQ',b))+'. The other ETF’s prior-close comparison is unavailable.';
    }else{
      priceSentence='Daily price changes are not yet verified for both ETFs.';
    }
    const spReg=regime('sp-regime'), qReg=regime('nd-regime');
    const spScore=validScore('spy'), qScore=validScore('qqq');
    let interpretation='The Market Health assessment is pending sufficient scored inputs.';
    if(spReg && qReg){
      interpretation=spReg===qReg
        ? 'The Market Health model reads '+spReg+' for both (SPY '+(spScore||'pending')+', QQQ '+(qScore||'pending')+').'
        : 'Market conditions differ: SPY is '+spReg+' ('+(spScore||'pending')+'); QQQ is '+qReg+' ('+(qScore||'pending')+').';
    }
    const drivers=driversSummary();
    recapBody.textContent=[priceSentence,interpretation,drivers?drivers[0].toUpperCase()+drivers.slice(1)+'.':null].filter(Boolean).join(' ');
  }
  const eodSnapshot=data=>{
    const session=data?.session;
    if (!asDate(session)) return null;
    const move=data.price_moves?.status==='complete'&&data.price_moves.session===session?data.price_moves:null;
    const history=Array.isArray(data.market_insights_history?.entries)?data.market_insights_history.entries:[];
    const row=history.find(r=>r?.session===session);
    const prior=history.find(r=>r?.session===move?.previous_session);
    const outcome={session};
    for(const sym of ['spy','qqq']){
      const raw=move?.[sym];
      const close=isNum(raw?.close)&&raw.close>0?raw.close:isNum(row?.[sym]?.close)&&row[sym].close>0?row[sym].close:null;
      const old=isNum(raw?.previous_close)&&raw.previous_close>0?raw.previous_close:isNum(prior?.[sym]?.close)&&prior[sym].close>0?prior[sym].close:null;
      const pct=old && close ? (close-old)/old*100 : null;
      const suppliedPct=isNum(raw?.change_pct)?raw.change_pct:null;
      // If a supplied daily % conflicts with the two dated closing prices,
      // don't display it as verified; use the two closes to calculate instead.
      const normalizedPct=isNum(pct)?pct:suppliedPct;
      outcome[sym]={close,pct:normalizedPct,points:old&&close?close-old:null};
    }
    return outcome;
  };
  async function syncOverviewPrices(){
    const request=++currentRequest;
    const session=$('session')?.textContent?.trim()||'';
    if(!asDate(session)){
      lastPrices=null;
      lastInternals=null;
      lastTransition=null;
      for(const sym of ['spy','qqq'])resetMarket(sym);
      writeRecap();
      return;
    }
    try{
      const res=await fetch('data/latest.json?overview='+Date.now(),{cache:'no-store'});
      if(!res.ok)throw new Error('HTTP '+res.status);
      const data=await res.json();
      if(request!==currentRequest)return;
      const prices=eodSnapshot(data);
      if(!prices||prices.session!==session)throw new Error('Scored and close sessions do not match');
      lastPrices=prices;
      // The same session-aligned, archived scored changes also power the
      // Daily Summary Archive. No price-only heuristics are used here.
      const summary=window.DailySummaries?.latestSummary?.(data);
      lastInternals=summary?.session===session?summary.internals:null;
      lastTransition=summary?.session===session?summary.transitionText:null;
      if(!lastInternals){
        lastInternals=window.DailySummaries?.internalsFromChanges?.(
          data.signal_changes,session,data.price_moves?.previous_session)||null;
      }
      for(const sym of ['spy','qqq']){
        const {close,pct,points}=prices[sym];
        const technicalAsOf=$(sym+'-ma-asof')?.textContent?.match(/\d{4}-\d{2}-\d{2}/)?.[0];
        const technicalValue=Number(($(sym+'-ma-close')?.textContent||'').replace(/[$,]/g,''));
        const mismatch=technicalAsOf===session&&isNum(technicalValue)&&technicalValue>0&&isNum(close)&&Math.abs(close-technicalValue)>.03;
        if(!isNum(close)||mismatch){resetMarket(sym);prices[sym]={close:null,pct:null,points:null};continue;}
        $('overview-close-'+sym).textContent=currency(close);
        $('overview-quote-date-'+sym).textContent='Market Closed';
        $('overview-quote-delta-'+sym).textContent=isNum(pct)
          ? (pct>0?'▲ +':pct<0?'▼ −':'')+Math.abs(pct).toFixed(2)+'%'+(isNum(points)?' · '+signedDollars(points):'')
          : 'Daily change pending';
        $('overview-quote-delta-'+sym).dataset.direction=isNum(pct)?(pct>0?'up':pct<0?'down':'flat'):'missing';
        const technical=$('technical-close-'+sym);
        if(technical)technical.textContent=currency(close)+' · '+dateLabel(session)+' close';
      }
      writeRecap();
    }catch(err){
      if(request!==currentRequest)return;
      lastPrices=null;
      lastInternals=null;
      lastTransition=null;
      for(const sym of ['spy','qqq'])resetMarket(sym);
      writeRecap();
    }
  }
  function watchSession(){
    const now=$('session')?.textContent?.trim()||'';
    if (asDate(now)) {
      sessionBadge.textContent=dateLabel(now);
      sessionBadge.dateTime=now;
    } else {
      sessionBadge.textContent='Date pending';
      sessionBadge.removeAttribute('datetime');
    }
    if(now===lastSignature)return;
    lastSignature=now;
    syncOverviewPrices();
  }
  if($('session'))new MutationObserver(watchSession).observe($('session'),{childList:true,characterData:true,subtree:true});
  // Existing app.js updates those labels asynchronously after rendering.
  for(const id of ['sp-regime','nd-regime','sp-score','nd-score','brief-volatility','brief-breadth','brief-credit']){
    const target=$(id);
    if(target)new MutationObserver(writeRecap).observe(target,{childList:true,characterData:true,subtree:true});
  }
  window.addEventListener('focus',syncOverviewPrices);
  window.setInterval(syncOverviewPrices,10*60*1000);
  watchSession();
  updateArt();
  document.body.classList.add('unified-ready');
  document.body.classList.add('compact-overview-ready');
})();
