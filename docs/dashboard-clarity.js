/* Dashboard Clarity — display-only navigation and progressive disclosure.
 * Existing app.js and published model remain authoritative. This module
 * moves existing DOM nodes (retaining their IDs) rather than copying data. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const main = document.querySelector('main');
  if (!main || $('clarity-nav')) return;

  const nav = document.createElement('nav');
  nav.className = 'clarity-nav';
  nav.id = 'clarity-nav';
  nav.setAttribute('aria-label', 'Dashboard sections');
  nav.innerHTML = `
    <div class="clarity-nav-label">Your daily workspace</div>
    <div class="clarity-nav-buttons" role="tablist" aria-label="Dashboard views">
      <button type="button" role="tab" id="clarity-tab-overview" aria-controls="clarity-overview" aria-selected="true" data-clarity-tab="overview"><span aria-hidden="true">◈</span> Overview</button>
      <button type="button" role="tab" id="clarity-tab-technicals" aria-controls="clarity-technicals" aria-selected="false" tabindex="-1" data-clarity-tab="technicals"><span aria-hidden="true">⌁</span> Technicals</button>
      <button type="button" role="tab" id="clarity-tab-signals" aria-controls="clarity-signals" aria-selected="false" tabindex="-1" data-clarity-tab="signals"><span aria-hidden="true">▤</span> Market Internals Data</button>
    </div>`;
  main.parentNode.insertBefore(nav, main);

  function panel(name, title, subtitle) {
    const el = document.createElement('section');
    el.id = 'clarity-' + name;
    el.className = 'clarity-view clarity-' + name;
    el.dataset.clarityView = name;
    el.setAttribute('role', 'tabpanel');
    el.setAttribute('aria-labelledby', 'clarity-tab-' + name);
    main.appendChild(el);
    return el;
  }
  const overview = panel('overview');
  const technicals = panel('technicals', 'Technical Analysis', 'Daily SPY and QQQ indicators · MACD is scored; moving averages remain informational.');
  const signals = panel('signals', 'Market Internals Data', 'Detailed market indicators and source diagnostics.');

  const move = (selector, target) => {
    const el = document.querySelector(selector);
    if (el) target.appendChild(el);
    return el;
  };
  const introductory = move('.section-intro', overview);
  if (introductory) {
    const paragraph = introductory.querySelector('p');
    if (paragraph) paragraph.textContent = 'Market Health Score: higher is healthier · 0–5 Risk-Off, 6–10 Neutral, 11–16 Risk-On.';
  }
  move('.market-grid', overview);
  const brief = move('.decision-brief', overview);
  if (brief) {
    const intro = brief.querySelector('.decision-brief-intro');
    const eyebrow = intro?.querySelector('.eyebrow');
    if (eyebrow) eyebrow.textContent = 'DAILY TAKEAWAY';
    const originalDetail = $('brief-detail');
    if (intro && originalDetail) {
      const concise = document.createElement('p');
      concise.className = 'clarity-brief-line';
      concise.id = 'clarity-brief-line';
      concise.textContent = '5-day score direction pending';
      intro.insertBefore(concise, originalDetail);
      const why = document.createElement('details');
      why.className = 'clarity-brief-more';
      why.innerHTML = '<summary>Why this reading?</summary>';
      intro.insertBefore(why, originalDetail);
      why.appendChild(originalDetail);
      const update = () => {
        const a = $('sp-trend')?.textContent?.trim() || '—';
        const b = $('nd-trend')?.textContent?.trim() || '—';
        concise.textContent = `5-day health trend: SPY ${a.toLowerCase()} · QQQ ${b.toLowerCase()}`;
      };
      for (const key of ['sp-trend','nd-trend']) {
        const source = $(key);
        if (source) new MutationObserver(update).observe(source, {childList:true,characterData:true,subtree:true});
      }
      update();
    }
  }

  // A complete EOD summary should appear EVERY session, not only on
  // divergence-alert days. Keep it between the takeaway and any special alert.
  move('#daily-summary-overview', overview);

  // Keep the original alert nodes available to app.js, but remove the
  // duplicate Daily Risk Transitions presentation from Market Internals Data.
  const retired = document.createElement('div');
  retired.id = 'retired-risk-presentation';
  retired.hidden = true;
  retired.setAttribute('aria-hidden','true');
  main.appendChild(retired);
  const alert = $('price-risk-panel');
  if (alert) {
    alert.classList.add('clarity-price-risk');
    retired.appendChild(alert);
  }
  const alertEmpty = document.createElement('div');
  alertEmpty.className = 'clarity-alert-empty';
  alertEmpty.id = 'clarity-alert-empty';
  alertEmpty.textContent = 'Price/risk alert check pending';
  retired.appendChild(alertEmpty);

  const actions = document.createElement('div');
  actions.className = 'clarity-next-actions';
  actions.innerHTML = `<button type="button" data-open-view="technicals">View RSI, MACD &amp; charts <span aria-hidden="true">→</span></button><button type="button" data-open-view="signals">Explore all 16 signals <span aria-hidden="true">→</span></button><a href="insights-history.html">Market History <span aria-hidden="true">↗</span></a>`;
  overview.appendChild(actions);

  move('.market-prices', technicals);
  move('.context-chart-grid', technicals);
  move('.research-link-inline', technicals);

  move('#market-intelligence', retired);
  move('#market-indicators', signals);
  move('#shared-breakdown', signals);
  const changeSection = move('#session-changes', signals);
  if (changeSection) {
    const fold = document.createElement('details');
    fold.className = 'clarity-fold';
    fold.open = true;
    fold.innerHTML = '<summary><span>Recent signal changes</span><small>What flipped since the prior EOD close</small></summary>';
    signals.insertBefore(fold, changeSection);
    fold.appendChild(changeSection);
  }
  move('.disclaimer', signals);

  // Short scorecards, without removing any market fields or JS target IDs.
  for (const prefix of ['sp', 'nd']) {
    const card = $(prefix + '-card');
    if (!card) continue;
    const more = document.createElement('details');
    more.className = 'clarity-score-more';
    more.innerHTML = '<summary>More score context <span aria-hidden="true">⌄</span></summary>';
    const extras = document.createElement('div');
    extras.className = 'clarity-extra-stats';
    const statItems = card.querySelectorAll('.stats > div');
    [...statItems].slice(1).forEach(el => extras.appendChild(el));
    const baseline = $(prefix + '-baseline');
    if (baseline) more.appendChild(baseline);
    const guide = $(prefix + '-trend-guide');
    if (guide) more.appendChild(guide);
    more.appendChild(extras);
    card.appendChild(more);
    const scoreLink = card.querySelector('.score-breakdown-jump');
    if (scoreLink) scoreLink.innerHTML = 'View scoring breakdown <span aria-hidden="true">↗</span>';
  }

  // All five moving averages remain visible in their original grid.
  const note = document.querySelector('.market-prices > .provider-note');
  if (note) {
    const fold = document.createElement('details');
    fold.className = 'clarity-fold clarity-methodology';
    fold.innerHTML = '<summary>Data sources &amp; indicator methodology</summary>';
    note.parentNode.insertBefore(fold, note);
    fold.appendChild(note);
  }

  // Keep important data errors visible; detailed model caveats accessible on demand.
  const warning = $('warning');
  if (warning) {
    const fold = document.createElement('details');
    fold.className = 'clarity-model-note';
    fold.innerHTML = '<summary>Model notes &amp; scoring caveats</summary>';
    warning.parentNode.insertBefore(fold, warning);
    fold.appendChild(warning);
    const warnWatch = new MutationObserver(() => {
      if (/unable to read|no market update|partial feeds|missing inputs/i.test(warning.textContent || '')) fold.open = true;
    });
    warnWatch.observe(warning, {childList: true, characterData: true, subtree: true});
  }

  function updateAlerts() {
    if (!alert) return;
    const states = ['sp', 'nd'].map(s => $('price-risk-' + s)?.dataset.tone || 'neutral');
    const active = states.some(s => s === 'warn' || s === 'watch');
    const unknown = states.every(s => s === 'neutral' || s === 'uncertain');
    alert.hidden = !active;
    alertEmpty.hidden = active;
    alertEmpty.textContent = unknown ? 'Price/risk comparison pending or incomplete · see archived price/risk comparisons in Market History' : 'No notable price/risk mismatch in the latest EOD session';
  }
  for (const sym of ['sp','nd']) {
    const card = $('price-risk-' + sym);
    if (card) new MutationObserver(updateAlerts).observe(card, {attributes:true,attributeFilter:['data-tone']});
  }
  updateAlerts();

  let current = 'overview';
  function activate(view, options = {}) {
    if (!['overview','technicals','signals'].includes(view)) return;
    current = view;
    for (const button of nav.querySelectorAll('[data-clarity-tab]')) {
      const selected = button.dataset.clarityTab === view;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    for (const p of [overview,technicals,signals]) p.hidden = p.dataset.clarityView !== view;
    if (!options.noScroll) nav.scrollIntoView({behavior:options.instant?'instant':'smooth',block:'start'});
    if (view === 'technicals') window.dispatchEvent(new Event('resize'));
  }
  for (const button of nav.querySelectorAll('[data-clarity-tab]')) {
    button.addEventListener('click', () => activate(button.dataset.clarityTab));
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const views = ['overview','technicals','signals'];
      const i = views.indexOf(button.dataset.clarityTab);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (i + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
      const newBtn = nav.querySelector(`[data-clarity-tab="${views[next]}"]`);
      newBtn.focus(); activate(views[next]);
    });
  }
  document.querySelectorAll('[data-open-view]').forEach(button => button.addEventListener('click', () => activate(button.dataset.openView)));
  // Existing links target original IDs; reveal their section before jumping.
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', event => {
      const hash = link.getAttribute('href');
      if (!hash || hash === '#') return;
      const target = document.getElementById(hash.slice(1));
      const host = target?.closest('[data-clarity-view]');
      if (!host) return;
      event.preventDefault();
      activate(host.dataset.clarityView, {noScroll:true});
      history.replaceState(null,'',hash);
      requestAnimationFrame(() => target.scrollIntoView({behavior:'smooth',block:'start'}));
    });
  });
  const initial = window.location.hash ? document.getElementById(decodeURIComponent(window.location.hash.slice(1))) : null;
  activate(initial?.closest('[data-clarity-view]')?.dataset.clarityView || 'overview', {noScroll:true});
  if (initial) requestAnimationFrame(() => initial.scrollIntoView({block:'start'}));
  document.body.classList.add('clarity-ready');
})();
