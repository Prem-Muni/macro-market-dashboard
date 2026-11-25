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
  for (const [prefix, symbol] of [['sp','SPY'],['nd','QQQ']]) {
    const card = $(prefix + '-card');
    if (!card) continue;
    const marketHead = card.querySelector('.market-head');
    if (!marketHead) continue;
    const movement = make('div','unified-price');
    movement.dataset.price = 'missing';
    const label = make('span','unified-price-label','DAILY MOVE');
    const change = make('strong','unified-price-change','—');
    change.id = `unified-${symbol.toLowerCase()}-move`;
    movement.append(label,change);
    marketHead.appendChild(movement);
    const note = make('p','unified-market-note','Awaiting the completed daily price comparison');
    note.id = `unified-${symbol.toLowerCase()}-note`;
    card.appendChild(note);
  }

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

  function syncDaily() {
    const src = $('daily-summary-live');
    const latest = src?.querySelector('.daily-summary-card.current');
    const tiles = latest?.querySelectorAll('.daily-summary-etf');
    const sourceDateText = latest?.querySelector('.daily-summary-top .eyebrow')?.textContent || '';
    const sourceDateMatch = sourceDateText.match(/\b[A-Za-z]{3}\s+\d{1,2},\s+\d{4}\b/);
    const sourceSession = sourceDateMatch ? new Date(sourceDateMatch[0] + ' 12:00:00 GMT').toISOString().slice(0,10) : null;
    const scoredSession = $('session')?.textContent?.trim();
    const matched = !!sourceSession && (!/^\d{4}-\d{2}-\d{2}$/.test(scoredSession || '') || scoredSession === sourceSession);
    for (const [i, symbol] of ['spy','qqq'].entries()) {
      const price = $('unified-' + symbol + '-move');
      const note = $('unified-' + symbol + '-note');
      const tile = matched ? tiles?.[i] : null;
      if (!price || !note) continue;
      const change = tile?.querySelector('.daily-summary-move')?.textContent?.trim() || '—';
      const kind = tile?.dataset.tone || 'incomplete';
      const direction = tile?.dataset.price || 'missing';
      const title = tile?.querySelector('.daily-summary-etf-title')?.textContent?.trim() || '';
      price.textContent = change;
      price.parentElement.dataset.price = direction;
      note.dataset.tone = kind;
      // Do not duplicate the score and regime already visible above.
      if (!tile) note.textContent = latest && !matched ? 'Waiting for a matching completed EOD summary' : 'Daily price change is not yet available';
      else if (kind === 'divergence') note.textContent = title + ' · Price and risk disagree';
      else if (kind === 'watch') note.textContent = title + ' · Large move, mixed market conditions';
      else if (kind === 'incomplete') note.textContent = 'Price/risk comparison incomplete';
      else if (change === '—') note.textContent = 'Prior close unavailable · change not evaluated';
      else note.textContent = 'No significant price/risk mismatch';
    }
    // Only an alert earns an amber highlight. Ordinary down days should not.
    panel.dataset.alert = matched && latest?.dataset.tone === 'divergence' ? 'divergence' : 'normal';
  }
  const summary = $('daily-summary-live');
  if (summary) new MutationObserver(syncDaily).observe(summary, {childList:true});
  if ($('session')) new MutationObserver(syncDaily).observe($('session'), {childList:true,characterData:true,subtree:true});
  syncDaily();

  // All scoring/data IDs remain exactly the same and are still updated by app.js.
  document.body.classList.add('unified-ready');
})();
