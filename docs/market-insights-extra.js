"use strict";
// NYSE published 2026–2028 calendar; source: https://www.nyse.com/trade/hours-calendars
const miCalendar=[["2026-01-01","New Year's Day"],["2026-01-19","Martin Luther King Jr. Day"],["2026-02-16","Washington's Birthday"],["2026-04-03","Good Friday"],["2026-05-25","Memorial Day"],["2026-06-19","Juneteenth"],["2026-07-03","Independence Day (observed)"],["2026-09-07","Labor Day"],["2026-11-26","Thanksgiving"],["2026-11-27","Day after Thanksgiving",1],["2026-12-24","Christmas Eve",1],["2026-12-25","Christmas Day"],["2027-01-01","New Year's Day"],["2027-01-18","Martin Luther King Jr. Day"],["2027-02-15","Washington's Birthday"],["2027-03-26","Good Friday"],["2027-05-31","Memorial Day"],["2027-06-18","Juneteenth (observed)"],["2027-07-05","Independence Day (observed)"],["2027-09-06","Labor Day"],["2027-11-25","Thanksgiving"],["2027-11-26","Day after Thanksgiving",1],["2027-12-24","Christmas Day (observed)"],["2028-01-17","Martin Luther King Jr. Day"],["2028-02-21","Washington's Birthday"],["2028-04-14","Good Friday"],["2028-05-29","Memorial Day"],["2028-06-19","Juneteenth"],["2028-07-03","Independence Day eve",1],["2028-07-04","Independence Day"],["2028-09-04","Labor Day"],["2028-11-23","Thanksgiving"],["2028-11-24","Day after Thanksgiving",1],["2028-12-25","Christmas Day"]];
(function ui(M,calendar){
 const E=(tag,txt,cls)=>{const el=document.createElement(tag);if(txt!=null)el.textContent=txt;if(cls)el.className=cls;return el};
 const add=(parent,...els)=>{parent.append(...els);return parent};
 const panel=(title,sub)=>add(E("section",null,"mi-extra"),E("h3",title),E("p",sub,"mi-note"));
 const fmt=(s)=>M.dayDate(s).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"});
 const today=()=>{let p=new Intl.DateTimeFormat("en-US",{timeZone:"America/Chicago",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());return ["year","month","day"].map(k=>p.find(x=>x.type===k).value).join("-")};
 const money=v=>M.finite(v)?"$"+v.toFixed(2):"—";
 const pct=v=>M.finite(v)?(v>0?"+":"")+v.toFixed(2)+"%":"—";
 const stateColor=s=>({"RISK-OFF":"bear","RISK-ON":"bull","NEUTRAL":"warn"}[s]||"na");
 const name=s=>({"RISK-OFF":"Risk-Off","RISK-ON":"Risk-On","NEUTRAL":"Neutral"}[s]||"Unavailable");
 const controls=(values,fn)=>{let s=E("select");for(let [v,l] of values){let o=E("option",l);o.value=v;s.append(o)}s.addEventListener("change",fn);return s};
 const style=E("style",`
.mi-extra,.mi-calendar{border:1px solid #304a5b;border-radius:15px;background:rgba(24,43,57,.64);padding:16px;margin:16px 0;color:inherit;min-width:0}
.mi-extra h3,.mi-extra h4{margin:0 0 7px}.mi-note{font-size:.86rem;opacity:.78;margin:5px 0 13px;line-height:1.5}
.mi-calendar{padding:12px 15px;margin:10px 0 15px}.mi-calendar strong{color:#e5c78c}.mi-calendar a{color:#a5cee6;text-decoration:underline}.mi-cal-items{display:flex;gap:8px;overflow-x:auto;padding:6px 0;white-space:nowrap}.mi-chip{display:inline-block;border:1px solid #40576a;border-radius:8px;padding:6px 10px;font-size:.8rem}.mi-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.mi-grid.four{grid-template-columns:repeat(2,minmax(0,1fr))}.mi-tile{border:1px solid #344e60;border-radius:10px;padding:12px;line-height:1.55}.mi-tile b{display:block;font-size:1.05rem}.mi-bull{color:#78dfb4}.mi-bear{color:#ffa1a7}.mi-warn{color:#e6cb89}.mi-na{color:#a5b2c1}
.mi-toolbar{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:10px 0}.mi-toolbar label{display:flex;gap:8px;align-items:center}.mi-toolbar select{font:inherit;color:inherit;background:#172b3c;border:1px solid #51687b;border-radius:7px;padding:6px}.mi-scroll{overflow:auto;max-width:100%}.mi-table{width:100%;border-collapse:separate;border-spacing:3px;font-size:.83rem;white-space:nowrap}.mi-table th,.mi-table td{text-align:center;padding:7px 9px;border-radius:4px}.mi-table th:first-child,.mi-table td:first-child{text-align:left;position:sticky;left:0;background:#182a3a;z-index:1}.mi-table th{font-weight:700}.mi-cell-bull{background:#245e4c;color:#c9fae3}.mi-cell-bear{background:#793942;color:#ffe0e3}.mi-cell-warn{background:#665727;color:#fff0b5}.mi-cell-na{background:#25394a;color:#b7c6d3}.mi-extra svg{display:block;width:100%;height:auto;min-width:400px}.mi-chart-wrap{overflow:auto}.mi-extra p{overflow-wrap:anywhere}
.mi-calendar.mi-header-calendar{padding:7px 10px;margin:6px 0 8px;border-radius:9px;background:#142a39}
.mi-header-calendar .mi-calendar-line{display:flex;align-items:center;gap:5px 13px;flex-wrap:wrap;font-size:12px;line-height:1.4}
.mi-header-calendar .mi-calendar-line>b,.mi-header-calendar .mi-futures-links>b{font-size:13px;color:#e4eff7}
.mi-header-calendar .mi-calendar-line>span{color:#b6c9d6}
.mi-header-calendar .mi-calendar-line>a{margin-left:auto;font-size:11px}
.mi-header-calendar .mi-cal-items{padding:4px 0 2px;gap:5px}
.mi-header-calendar .mi-chip{font-size:11px;padding:3px 7px;border-radius:5px}
.mi-header-calendar .mi-futures-links{display:flex;align-items:center;flex-wrap:wrap;gap:5px 9px;margin-top:5px;font-size:12px}
.mi-header-calendar .mi-futures-links>a{border:1px solid #385367;border-radius:5px;padding:3px 7px;text-decoration:none;font-weight:700}
.mi-header-calendar .mi-futures-note{color:#9cb3c5;font-size:11px}
@media(max-width:620px){.mi-header-calendar .mi-calendar-line>a{margin-left:0}}
@media(max-width:620px){.mi-grid,.mi-grid.four{grid-template-columns:1fr}.mi-extra,.mi-calendar{padding:12px}}
`);document.head.append(style);
 function banner(d){
  // A single shared header component; never move it into tab content.
  const header=document.querySelector("header.topbar");if(!header)return;
  let box=document.getElementById("mi-market-calendar");
  if(!box){box=E("aside",null,"mi-calendar mi-calendar-compact mi-header-calendar");box.id="mi-market-calendar";box.setAttribute("aria-label","US equity market calendar and futures quote links");header.after(box);}
  else if(box.previousElementSibling!==header)header.after(box);
  box.replaceChildren();
  const t=today();box.dataset.day=t;
  const ev=M.event(t),n=M.next(t),status=!M.covered(t)?"Calendar needs verification":ev&&!ev[2]?ev[1]+" · Market closed today":ev?.[2]?ev[1]+" · Early close at noon CT":!M.trading(t)?"Weekend · Market closed today":"Regular session · 8:30 AM–3 PM CT";
  const nextText=n?"Next: "+fmt(n)+(M.event(n)?.[2]?" · Noon CT close":" · Regular hours"):"See NYSE for the next session.";
  const line=E("div",null,"mi-calendar-line");
  add(line,E("b","Market Calendar"),E("strong",status),E("span",nextText),E("span",d?.session?"Last EOD: "+fmt(d.session):"Last EOD pending"));
  const link=(label,url)=>{const a=E("a",label);a.href=url;a.target="_blank";a.rel="noopener noreferrer";return a;};
  line.append(link("NYSE calendar ↗","https://www.nyse.com/trade/hours-calendars"));box.append(line);
  const strip=E("div",null,"mi-cal-items");strip.tabIndex=0;strip.setAttribute("aria-label","Upcoming holidays and early closes; scroll horizontally");
  for(const e of calendar.filter(e=>e[0]>=t).slice(0,8))strip.append(E("span",fmt(e[0])+" · "+e[1]+" · "+(e[2]?"Noon CT close":"Closed"),"mi-chip "+(e[2]?"mi-warn":"mi-bear")));
  if(strip.childNodes.length)box.append(strip);
  // CME ES/NQ are not in TradingView's listed free website-widget markets.
  // Link directly to the actual contracts rather than show a CFD or invent quotes.
  const futures=E("div",null,"mi-futures-links");
  add(futures,E("b","Index Futures"),link("S&P 500 · ES ↗","https://www.tradingview.com/symbols/CME_MINI-ES1%21/"),link("Nasdaq-100 · NQ ↗","https://www.tradingview.com/symbols/CME_MINI-NQ1%21/"),E("span","External quotes · may be delayed · info only","mi-futures-note"));
  box.append(futures);
  box.title="Equity calendar only; futures hours may differ. Scheduled EOD refresh: 12:20 PM CT on early closes; 3:20 PM CT regular days. Provider availability may delay publication. Futures links do not affect Market Health.";
 }
 function tile(title,body,cls=""){return add(E("div",null,"mi-tile"),E("b",title,cls),E("div",body))}
 function dashboard(d,rs){
  let host=document.getElementById("daily-summary-overview");if(!host)return;
  document.getElementById("mi-regime-context")?.remove();
  let b=panel("Daily interpretation","Rule-based explanation of the latest published session; no buy/sell recommendation.");b.id="mi-structured-summary";let old=document.getElementById(b.id);if(old)old.remove();let g=E("div",null,"mi-grid four");
  let changes=d.signal_changes?.to_session===d.session?d.signal_changes.groups:null;
  let eased=[],worsened=[];for(let [group,x] of Object.entries(changes||{})){let prefix=({shared:"Shared",sp:"SPY",nd:"QQQ"})[group]||group;for(let q of x.eased||[])eased.push(prefix+": "+q.label);for(let q of x.new_bearish||[])worsened.push(prefix+": "+q.label);}
  let transition=[];let a=rs.at(-1);for(let k of ["spy","qqq"]){let m=a?.[k];if(a?.session===d.session&&M.complete(m)&&m.previous_regime&&m.previous_regime!==m.regime)transition.push(k.toUpperCase()+": "+name(m.previous_regime)+" → "+name(m.regime));}
  let concerns=["vix","vxn","credit","spy_trend","qqq_trend"].filter(k=>d.signals?.[k]?.state==="bear").map(k=>d.names?.[k]||k);
  g.append(tile("What improved",changes?(eased.join("; ")||"No newly eased bearish signals."):"Paired signal comparison unavailable.","mi-bull"),tile("Remaining concerns",[worsened.length?"New bearish: "+worsened.join("; "):"",concerns.length?"Still bearish: "+concerns.join(", "):""].filter(Boolean).join(". ")||"No bearish flags among the highlighted indicators; review full scoring breakdown.","mi-bear"),tile("Market interpretation",(transition.join("; ")||"No confirmed regime transition in the saved comparison.")+" Current scores: SPY "+(d.markets?.sp500?.score?.health??"—")+"/16, QQQ "+(d.markets?.nasdaq100?.score?.health??"—")+"/16.","mi-warn"),tile("What to watch next","Check whether volatility, credit, breadth and trend improve together on the next completed equity session."));
  b.append(g);
  document.getElementById("mi-source-verification")?.remove();
  let audit=panel("Data-source verification","Observation date and actual provider for the published session. Same-date does not independently certify a final settlement or price accuracy.");audit.id="mi-source-verification";
  let evidence=d.source_audit;
  if(!evidence||evidence.session!==d.session){audit.append(E("p","Detailed source audit starts with the next newly completed session. The current snapshot is unchanged.","mi-note"));}
  else{let obs=evidence.observations||{};let ordered=["SPY","QQQ","COPPER","OIL","VIX","VXN","VIX3M",...Object.keys(obs).filter(k=>!["SPY","QQQ","COPPER","OIL","VIX","VXN","VIX3M"].includes(k))];let details=ordered.map(k=>{let x=obs[k]||{};return [k,x.provider||"Unavailable",x.observation_session||"—",x.previous_observation_session||"—",x.latest_vendor_session||"—",x.status==="same_date_observation"?"Present":"Missing",M.finite(x.change_pct)?pct(x.change_pct):"—",["OIL","COPPER"].includes(k)?"Settlement not independently verified":"—"]});audit.append(table(["Input","Provider used","Observation","Prior observation","Latest vendor date","Availability","Futures Δ","Settlement"],details),E("p","Futures daily bars may be provisional when equities close, particularly on shortened sessions. Derived changes are recorded; raw price histories are not added. A newer vendor date is not used in the scored session.","mi-note"));}
  document.getElementById("mi-overview-details")?.remove();
  let extra=E("details",null,"mi-overview-details");extra.id="mi-overview-details";extra.append(E("summary","More daily context & source verification"),b,audit);host.after(extra);
 }
 function table(headers,body){let wrap=E("div",null,"mi-scroll"),t=E("table",null,"mi-table"),head=E("thead"),hr=E("tr");for(let h of headers){let th=E("th",h);th.scope="col";hr.append(th)}head.append(hr);t.append(head);let tb=E("tbody");for(let row of body){let tr=E("tr");row.forEach((v,i)=>{let c=i===0?E("th"):E("td");if(i===0)c.scope="row";if(typeof v==="object"){c.textContent=v.text;c.className=v.cls||"";if(v.title)c.title=v.title;}else c.textContent=v;tr.append(c)});tb.append(tr)}t.append(tb);wrap.append(t);return wrap;}
 function chart(rs,key){
  let wrap=E("div",null,"mi-chart-wrap"),svg=document.createElementNS("http://www.w3.org/2000/svg","svg");svg.setAttribute("viewBox","0 0 800 300");svg.setAttribute("role","img");svg.setAttribute("aria-label",key.toUpperCase()+" saved closing prices and Market Health on aligned session axes");
  function s(tag,attrs,txt){let el=document.createElementNS(svg.namespaceURI,tag);for(let [k,v] of Object.entries(attrs))el.setAttribute(k,v);if(txt!=null)el.textContent=txt;svg.append(el);return el}
  let prices=rs.map(r=>r[key]?.close).filter(M.finite);if(!prices.length){wrap.textContent="No saved closing prices.";return wrap}let lo=Math.min(...prices),hi=Math.max(...prices);let pad=(hi-lo)*.1||1;lo-=pad;hi+=pad;
  let x=i=>60+i*710/Math.max(1,rs.length-1), py=v=>124-(v-lo)/(hi-lo)*91,hy=v=>253-v/16*89;
  for(let [y,label] of [[33,money(hi)],[124,money(lo)],[164,"16"],[192,"11"],[225,"5"],[253,"0"]]){s("line",{x1:60,x2:770,y1:y,y2:y,stroke:"#40596b","stroke-width":1});s("text",{x:53,y:y+4,fill:"#a9c0d1","text-anchor":"end","font-size":11},label)}
  s("text",{x:60,y:18,fill:"#b9d4e7","font-size":12},"Closing price");s("text",{x:60,y:151,fill:"#b9d4e7","font-size":12},"Market Health · raw points (legacy markers hollow)");
  for(let [lower,upper,color] of [[0,5.5,"#bd555a"],[5.5,10.5,"#b4a04e"],[10.5,16,"#3a9d76"]])s("rect",{x:60,y:hy(upper),width:710,height:hy(lower)-hy(upper),fill:color,opacity:.10});
  for(let i=0;i<rs.length;i++){let m=rs[i][key],prev=rs[i-1]?.[key],xx=x(i);if(M.finite(m?.close)){if(i&&M.adjacent(rs[i-1],rs[i])&&M.finite(prev?.close))s("line",{x1:x(i-1),x2:xx,y1:py(prev.close),y2:py(m.close),stroke:"#9fc9f2","stroke-width":2});s("circle",{cx:xx,cy:py(m.close),r:3,fill:"#9fc9f2"});}
   if(m&&m.available===m.total&&M.finite(m.score)&&[15,16].includes(m.total)){let yy=hy(M.health(m));if(i&&M.adjacent(rs[i-1],rs[i])&&prev?.available===prev?.total&&M.finite(prev?.score)&&[15,16].includes(prev.total))s("line",{x1:x(i-1),x2:xx,y1:hy(M.health(prev)),y2:yy,stroke:"#35dba9","stroke-width":2});let dot=s("circle",{cx:xx,cy:yy,r:4,stroke:"#35dba9",fill:m.total===16?"#35dba9":"#172b3c"});let title=document.createElementNS(svg.namespaceURI,"title");title.textContent=rs[i].session+" · "+M.health(m)+"/"+m.total;dot.append(title);}
   if(i===0||i===rs.length-1||i%Math.max(1,Math.ceil(rs.length/7))===0)s("text",{x:xx,y:278,fill:"#a9c0d1","text-anchor":i===0?"start":i===rs.length-1?"end":"middle","font-size":10},rs[i].session.slice(5));
  }wrap.append(svg);return wrap;
 }
 function history(d,rs){
  let host=document.getElementById("j-market-panel");if(!host)return;
  document.getElementById("mi-history-analytics")?.remove();let p=panel("Signal heatmap & price comparison","Recorded sessions only. A dash means no saved indicator state; never reconstructed from a score.");p.id="mi-history-analytics";let toolbar=E("div",null,"mi-toolbar"),out=E("div"),key="spy",range=10;
  let select=controls([["5","5 sessions"],["10","10 sessions"],["20","20 sessions"],["30","30 sessions"]],()=>{range=Number(select.value);render()});select.value="10";let label=add(E("label"),E("span","Lookback"),select);toolbar.append(label);p.append(toolbar,out);
  function render(){out.replaceChildren();let recent=rs.slice(-range);let ids=[...(d.order?.shared||[]),...(d.order?.[key==="spy"?"sp500":"nasdaq100"]||[])];let scored=ids.slice(0,16);let data=scored.map(id=>[d.names?.[id]||id,...recent.map(r=>{let sig=r[key]?.metrics?.signals?.[id];if(r[key]?.total===15&&id.endsWith("_macd"))sig=null;let state=sig?.state;let cls=["bull","bear","warn"].includes(state)?state:"na";return {text:cls==="bull"?"▲":cls==="bear"?"▼":cls==="warn"?"•":"—",cls:"mi-cell-"+cls,title:r.session+" · "+(r[key]?.metrics?.recovery?"Recovered commit "+r[key].metrics.recovery.commit.slice(0,7)+" · "+r[key].metrics.recovery.verification+" · ":"")+(sig?.label||"Not recorded")+(M.finite(sig?.value)?" · "+sig.value:"")}})]);out.append(E("h4",key.toUpperCase()+" · 16 scored indicators"),E("p","▲ Bullish   ▼ Bearish   • Caution   — Unavailable · "+recent.filter(r=>r[key]?.metrics?.signals).length+"/"+recent.length+" sessions with detailed indicators","mi-note"),table(["Indicator",...recent.map(r=>r.session.slice(5)+(r[key]?.total===15?" (15pt)":"")+(r[key]?.metrics?.recovery?" †":""))],data),E("h4","Closing price vs. Market Health"),chart(recent,key),E("p","Aligned saved sessions; price and score have separate scales. Legacy scores retain their original denominator. † Recovered matching GitHub commit, not proof of the original publication. November 20 has matching technical closes, not a paired EOD price verification. Hover cells for provenance. Gaps remain where consecutive sessions are not saved.","mi-note"));}
  function selected(){key=document.getElementById("summary-tab-qqq")?.getAttribute("aria-selected")==="true"?"qqq":"spy";render()}
  let trend=document.getElementById("j-score-chart")?.closest("section");(trend||host.lastElementChild)?.after(p);if(!p.isConnected)host.append(p);
  for(let id of ["summary-tab-spy","summary-tab-qqq"]){let tab=document.getElementById(id);if(tab){if(tab.miExtraHistoryListener)tab.removeEventListener("click",tab.miExtraHistoryListener);tab.miExtraHistoryListener=()=>{key=id.endsWith("qqq")?"qqq":"spy";render()};tab.addEventListener("click",tab.miExtraHistoryListener);}}selected();
 }
 function research(d,rs){
  let host=document.querySelector("main.guide-main");if(!host||!location.pathname.endsWith("threshold-logic.html"))return;
  document.getElementById("mi-forward-performance")?.remove();let p=panel("Forward model performance · saved EOD only","Real saved 16-point signals, not reconstructed 20-week backtest. Entry at signal-session close is a research benchmark, not an executable strategy or recommendation.");p.id="mi-forward-performance";let out=E("div"),bar=E("div",null,"mi-toolbar");let market=controls([["spy","SPY"],["qqq","QQQ"]],render),horizon=controls([["1","1 session"],["5","5 sessions"],["10","10 sessions"],["20","20 sessions"]],render);horizon.value="5";bar.append(add(E("label"),E("span","Market"),market),add(E("label"),E("span","Forward horizon"),horizon));p.append(bar,out);
  function render(){let k=market.value,h=Number(horizon.value),s=M.performance(rs,k,h),stat=M.stats(s);out.replaceChildren();let groups=[["Unconditional matched sample",s],...["RISK-ON","NEUTRAL","RISK-OFF"].map(r=>[name(r),s.filter(x=>x.regime===r)])];let transitions=[...new Set(s.map(x=>x.transition).filter(Boolean))];for(let t of transitions)groups.push([t,s.filter(x=>x.transition===t)]);let lastEnd=-1;let independent=s.filter(x=>{if(x.index<lastEnd)return false;lastEnd=x.end;return true;});let body=groups.map(([label,a])=>{let q=M.stats(a),ni=independent.filter(x=>a.includes(x));let nstat=M.stats(ni);return [label,String(q?.n||0),q?pct(q.positive):"—",q?pct(q.mean):"—",q&&stat?pct(q.mean-stat.mean):"—",q?pct(q.median):"—",q?pct(q.worst):"—",q?pct(q.adverse):"—",String(ni.length),nstat?pct(nstat.mean):"—"]});out.append(E("p",s.length+" matured observations · "+(s.length<30?"Limited sample; no threshold conclusions.":"Overlapping outcomes are not independent; interpret cautiously."),"mi-note"),table(["Signal regime / transition","N","Positive","Mean","Mean vs baseline (pp)","Median","Worst return","Worst close-based adverse move","Non-overlap N","Non-overlap mean"],body),E("p","Only complete 16-point signal days with all intervening consecutive equity sessions and valid closing prices qualify. Missing or immature horizons are excluded. Close-based adverse movement is not intraday drawdown. Returns exclude costs, dividends and execution slippage; the unconditional baseline uses the same eligible sample. Non-overlapping windows selected chronologically across all regimes (adjacent close-to-close windows may share an endpoint). No regime threshold tuning before year-end review; small samples are descriptive only.","mi-note"));}
  let hero=host.querySelector(".audit-research-hero");if(hero)hero.after(p);else host.prepend(p);render();
 }
 banner(null);
 async function load(){try{let res=await fetch("data/latest.json",{cache:"no-cache"});if(!res.ok)throw Error("HTTP "+res.status);let d=await res.json(),rs=M.rows(d);banner(d);dashboard(d,rs);history(d,rs);research(d,rs)}catch(err){console.warn("Market insights unavailable:",err);}}
 load();document.getElementById("refresh")?.addEventListener("click",load);setInterval(()=>{const box=document.getElementById("mi-market-calendar");if(box&&box.dataset.day!==today()){load();}},60000);
})((function model(calendar){
 const finite=x=>typeof x==="number"&&Number.isFinite(x);
 const dayDate=s=>new Date(s+"T12:00:00Z");
 const shift=(s,n)=>{let d=dayDate(s);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
 const covered=s=>s>="2026-01-01"&&s<="2028-12-31";
 const closed=s=>calendar.some(e=>e[0]===s&&!e[2]);
 const trading=s=>covered(s)&&![0,6].includes(dayDate(s).getUTCDay())&&!closed(s);
 const next=s=>{for(let i=1;i<=10;i++){let d=shift(s,i);if(trading(d))return d;}return null};
 const event=s=>calendar.find(e=>e[0]===s);
 const rows=d=>[...new Map((d?.market_insights_history?.entries||[]).filter(e=>/^\d{4}-\d{2}-\d{2}$/.test(e?.session)).map(e=>[e.session,e])).values()].sort((a,b)=>a.session.localeCompare(b.session));
 const complete=m=>m&&m.total===16&&m.available===16&&finite(m.score)&&m.score>=0&&m.score<=16&&["RISK-ON","NEUTRAL","RISK-OFF"].includes(m.regime);
 const health=m=>m.total-m.score;
 const adjacent=(a,b)=>!!a&&!!b&&b.previous_session===a.session&&next(a.session)===b.session;
 function duration(rs,key){let i=rs.length-1,m=rs[i]?.[key];if(!complete(m))return null;let count=1;while(i>0&&adjacent(rs[i-1],rs[i])&&complete(rs[i-1][key])&&rs[i-1][key].regime===m.regime){count++;i--;}let known=i>0&&adjacent(rs[i-1],rs[i])&&complete(rs[i-1][key])&&rs[i-1][key].regime!==m.regime;return {count,known,start:rs[i].session,score:health(m),regime:m.regime,prior:known?rs[i-1][key].regime:null};}
 function performance(rs,key,h){
  let samples=[];for(let i=0;i+h<rs.length;i++){let window=rs.slice(i,i+h+1),a=window[0][key];if(!complete(a)||window.some((r,j)=>!finite(r[key]?.close)||r[key].close<=0||(j>0&&!adjacent(window[j-1],r))))continue;let close=a.close,ret=(window[h][key].close/close-1)*100,adverse=Math.min(0,...window.slice(1).map(r=>(r[key].close/close-1)*100));let prior=rs[i-1];let transition=adjacent(prior,rs[i])&&complete(prior[key])&&prior[key].regime!==a.regime?prior[key].regime+" → "+a.regime:null;samples.push({regime:a.regime,ret,adverse,transition,index:i,end:i+h});}
  return samples;
 }
 function stats(s){if(!s.length)return null;let v=s.map(x=>x.ret).sort((a,b)=>a-b),n=v.length;return {n,positive:100*v.filter(x=>x>0).length/n,mean:v.reduce((a,b)=>a+b,0)/n,median:(v[Math.floor((n-1)/2)]+v[Math.floor(n/2)])/2,worst:v[0],adverse:Math.min(...s.map(x=>x.adverse))};}
 return {finite,dayDate,shift,covered,trading,next,event,rows,complete,health,adjacent,duration,performance,stats};
})(miCalendar),miCalendar);
