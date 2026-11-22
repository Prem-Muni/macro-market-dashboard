/* Independent Fear & Greed history, displayed only for context. No score impact. */
'use strict';
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const historyUrl = 'https://feargreedchart.com/api/?action=history';
  const svg = document.getElementById('fear-history-svg');
  if (!svg) return;
  const $ = id => document.getElementById(id);
  let history = [], range = 'YTD';
  const DAY = 86400000;
  const safeDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) ? Date.parse(s + 'T12:00:00Z') : NaN;
  const fmtDate = s => {
    const t = safeDate(s);
    return Number.isFinite(t) ? new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'}).format(t) : s;
  };
  const zone = score => score <= 20 ? 'Extreme Fear' : score <= 40 ? 'Fear' : score <= 60 ? 'Neutral' : score <= 80 ? 'Greed' : 'Extreme Greed';
  const colorFor = score => score <= 20 ? '#ee5d73' : score <= 40 ? '#ef986b' : score <= 60 ? '#d6be83' : score <= 80 ? '#6bd9a1' : '#20ad81';
  const el = (tag, attrs = {}, parent = svg) => {
    const node = document.createElementNS(NS,tag);
    for (const [k,v] of Object.entries(attrs)) node.setAttribute(k,String(v));
    parent.appendChild(node);
    return node;
  };
  function render() {
    svg.replaceChildren();
    if (!history.length) return;
    const last = history[history.length - 1];
    const lastTime = safeDate(last.date);
    const start = range === '90D' ? lastTime-90*DAY : range === '1Y' ? lastTime-365*DAY : Date.UTC(Number(last.date.slice(0,4)),0,1);
    const data=history.filter(d => safeDate(d.date)>=start);
    if (data.length < 2) { $('fear-message').textContent = 'Not enough recent index history to plot.'; return; }
    $('fear-message').textContent = '';
    const W=960,H=245,left=48,right=24,top=16,bottom=42;
    svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
    svg.setAttribute('aria-label',`Fear & Greed Index from ${data[0].date} to ${last.date}; latest value ${last.score}/100 (${zone(last.score)})`);
    const t0=safeDate(data[0].date),t1=safeDate(data[data.length-1].date);
    const x=d=>left+(safeDate(d.date)-t0)/(t1-t0)*(W-left-right);
    const y=v=>top+(100-v)/100*(H-top-bottom);
    const bands=[{lo:0,hi:20,c:'#ee5d73'},{lo:20,hi:40,c:'#ef986b'},{lo:40,hi:60,c:'#c6c1a9'},{lo:60,hi:80,c:'#6bd9a1'},{lo:80,hi:100,c:'#20ad81'}];
    for (const b of bands) el('rect',{x:left,y:y(b.hi),width:W-left-right,height:y(b.lo)-y(b.hi),fill:b.c,opacity:'.048'});
    for (const v of [0,20,40,60,80,100]) {
      el('line',{x1:left,x2:W-right,y1:y(v),y2:y(v),stroke:'#304053','stroke-width':'1'});
      const label=el('text',{x:9,y:y(v)+4,fill:'#93a8bf','font-size':11}); label.textContent=String(v);
    }
    // Axis labels correspond to real observations at their actual calendar positions.
    const n=6,ticks=[];
    for (let i=0;i<n;i++) ticks.push(Math.round(i*(data.length-1)/(n-1)));
    for (const i of new Set(ticks)) {
      const d=data[i], xx=x(d);
      el('line',{x1:xx,x2:xx,y1:top,y2:H-bottom,stroke:'#314258','stroke-dasharray':'3 7',opacity:'.55'});
      const tick=el('text',{x:xx,y:H-15,fill:'#a3bad2','font-size':11,'text-anchor':i===0?'start':i===data.length-1?'end':'middle'});
      tick.textContent=fmtDate(d.date);
    }
    const points=data.map(d=>`${x(d).toFixed(2)},${y(d.score).toFixed(2)}`);
    el('polyline',{points:points.join(' '),fill:'none',stroke:'#e8b75d','stroke-width':2.65,'stroke-linecap':'round','stroke-linejoin':'round'});
    const lastP=data[data.length-1];
    el('circle',{cx:x(lastP),cy:y(lastP.score),r:4.5,fill:colorFor(lastP.score),stroke:'#f5f7fc','stroke-width':1.5});
    const tip=el('title');tip.textContent=`Last observation: ${lastP.date} — ${lastP.score}/100 (${zone(lastP.score)})`;
    $('fear-range-label').textContent=`${data.length} observations · ${fmtDate(data[0].date)} – ${fmtDate(lastP.date)}, ${lastP.date.slice(0,4)}`;
  }
  function selectRange(next) {
    range=next;
    for (const [id,val] of [['fear90','90D'],['fearYTD','YTD'],['fear1Y','1Y']]) {
      $(id).classList.toggle('active',val===range);
      $(id).setAttribute('aria-pressed',String(val===range));
    }
    render();
  }
  $('fear90').addEventListener('click',()=>selectRange('90D'));
  $('fearYTD').addEventListener('click',()=>selectRange('YTD'));
  $('fear1Y').addEventListener('click',()=>selectRange('1Y'));
  async function load() {
    try {
      const response = await fetch(historyUrl,{cache:'no-store'});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const raw = await response.json();
      if (!Array.isArray(raw)) throw new Error('Unrecognized provider response');
      const clean = raw.map(d => ({date:String(d.date || ''),score:Number(d.score)}))
        .filter(d => Number.isFinite(safeDate(d.date)) && Number.isFinite(d.score) && d.score>=0 && d.score<=100)
        .sort((a,b) => a.date.localeCompare(b.date));
      // Explicitly drop duplicate dates, keeping the most recent reading on that day.
      history = [...new Map(clean.map(d=>[d.date,d])).values()];
      if (history.length < 2) throw new Error('Not enough valid observations');
      const last=history[history.length-1];
      $('fear-latest-score').textContent=String(Math.round(last.score));
      $('fear-latest-score').style.color=colorFor(last.score);
      $('fear-latest-label').textContent=zone(last.score);
      $('fear-latest-date').textContent=`As of ${fmtDate(last.date)}, ${last.date.slice(0,4)}`;
      render();
    } catch (err) {
      $('fear-message').textContent='Sentiment history is temporarily unavailable. Open FearGreedChart.com for the current reading.';
      $('fear-range-label').textContent='Provider data unavailable';
      console.warn('Fear & Greed chart unavailable:',err);
    }
  }
  load();
})();
