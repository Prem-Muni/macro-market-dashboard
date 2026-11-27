/* Overview presentation only: uses the same loaded snapshot and formatters as app.js. */
(function(root){
 "use strict";
 const sp=[["vix","VIX"],["sp_def","Defensives"],["sp_xle","XLE/SPY"],["sp_smh","SMH/SPY"],["spy_trend","SPY Trend"],["sp_rsi14","SPY RSI (14)"],["sp_macd","SPY MACD"],["rsp_spy","RSP/SPY 10D"],["iwm_spy","IWM/SPY 10D"],["sp_breadth1d","Breadth 1D"],["sp_breadth5d","Breadth 5D"],["sp_breadth200","Breadth 200D"]];
 const nd=[["vxn","VXN"],["nd_def","Defensives"],["nd_xle","XLE/QQQ"],["nd_smh","SMH/QQQ"],["qqq_trend","QQQ Trend"],["nd_rsi14","QQQ RSI (14)"],["nd_macd","QQQ MACD"],["qqqe_qqq","QQQE/QQQ 10D"],["iwm_qqq","IWM/QQQ 10D"],["nd_breadth1d","Breadth 1D"],["nd_breadth5d","Breadth 5D"]];
 const shared=[["oil","Oil/SPY"],["usd","USD/SPY"],["tnx","TNX/SPY"],["credit","Credit HYG/IEF"],["copper","Copper"],["vix_curve","VIX Curve"]];
 const relative=new Set(["rsp_spy","iwm_spy","qqqe_qqq","iwm_qqq"]);
 const info=new Set(["sp_breadth5d","sp_breadth200","nd_breadth5d"]);
 const finite=n=>typeof n==="number"&&Number.isFinite(n);
 const states=new Set(["bull","bear","warn","info"]);
 const tone=s=>({ "RISK-ON":"bull","RISK-OFF":"bear","NEUTRAL":"warn","IMPROVING":"bull","STABLE":"warn","DETERIORATING":"bear","BULLISH":"bull","BEARISH":"bear","CAUTION":"warn","SELECTIVE":"warn","EARLY IMPROVEMENT":"warn","UNCERTAIN":"na" }[s]||"na");
 function signal(data,[key,title]){
  const s=data.signals?.[key],state=states.has(s?.state)?s.state:"na";
  let value="";
  if(state!=="na"&&finite(s?.value)){const suffix=relative.has(key)||key==="sp_breadth200"||key==="nd_breadth1d"?"%":key.includes("breadth")?" pp":"";value=(relative.has(key)&&s.value>0?"+":"")+s.value.toFixed(2)+suffix;if(key.endsWith("_macd"))value="Hist "+value;}
  else if(state!=="na"&&s?.note&&["spy_trend","qqq_trend"].includes(key))value=s.note;
  return {key,title,state,label:state==="na"?"Unavailable":s.label||state,value,info:info.has(key),detail:[s?.note,s?.source].filter(Boolean).join(" · ")};
 }
 function summary(data,key,f){
  const m=data.markets?.[key];if(!m)return [];
  const s=m.score||{},t=m.momentum||{},c=m.confirmation||{},r=f.regimeHealth(s);
  const coverage=finite(c.available)&&finite(c.total)&&c.available===c.total&&finite(c.confirmed);
  const confirmation=coverage?c.confirmed+"/"+c.total+" "+(c.confirmed>=3?"BROAD":c.confirmed<=1?"LIMITED":"MIXED"):finite(c.confirmed)&&finite(c.available)&&finite(c.total)?c.confirmed+"/"+c.available+" improving · "+c.available+"/"+c.total+" checked":"Unavailable";
  return [
   {key:key+"-health",title:"Market Health",state:tone(r),label:f.scoreFormat(s),value:r,detail:s.complete?"Complete scored session":"Partial coverage; displayed score is a range"},
   {key:key+"-momentum",title:"Health Trend",state:tone(t.state),label:t.state||"Unavailable",value:"1D "+f.rangeText(f.invertedRange(t.d1_range))+" · 5D "+f.rangeText(f.invertedRange(t.d5_range))+(t.partial?" · bounded":""),detail:"Health-point change, not price return"},
   {key:key+"-confirmation",title:"Confirmation 5D",state:coverage?(c.confirmed<=1?"bear":c.confirmed>=3?"bull":"warn"):"na",label:confirmation,value:"",detail:"Confirmation count; color indicates limited, mixed or full confirmation, not a scored input"},
   {key:key+"-swing",title:"Swing",state:tone(m.swing),label:m.swing||"Unavailable",value:"",detail:"Published swing classification"}
  ];
 }
 function build(data,f){return [
  {title:"S&P 500 Summary",cells:summary(data,"sp500",f)},
  {title:"S&P 500 Internals",cells:sp.map(x=>signal(data,x))},
  {title:"Shared Macro",cells:shared.map(x=>signal(data,x))},
  {title:"Nasdaq-100 Summary",cells:summary(data,"nasdaq100",f)},
  {title:"Nasdaq-100 Internals",cells:nd.map(x=>signal(data,x))}
 ];}
 function splitRows(group){return group.title.endsWith('Internals')?[group.cells.slice(0,7),group.cells.slice(7)].filter(r=>r.length):[group.cells];}
 let host=null,latest=null;
 const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;};
 function paint(){if(!host||!latest)return;const {data,f}=latest;host.replaceChildren();
  const top=node("div",null,"board-meta");
  top.append(node("span","As of "+(data.session||"—")+" · completed EOD"),node("span","Green Bullish","board-legend bull"),node("span","Red Bearish","board-legend bear"),node("span","Yellow Caution / Neutral","board-legend warn"),node("span","Blue Info only","board-legend info"),node("span","Gray Unavailable","board-legend na"));host.append(top);
  for(const group of build(data,f)){const row=node("section",null,"board-row"),title=node("h4",group.title,"board-group"),cells=node("div",null,"board-cells");row.append(title,cells);for(const line of splitRows(group)){const lane=node("div",null,"board-lane");lane.dataset.count=String(line.length);for(const c of line){const tile=node("div",null,"board-cell board-"+c.state);tile.title=c.detail||c.label;tile.dataset.signalKey=c.key;tile.dataset.state=c.state;tile.append(node("strong",c.title),node("b",c.label),...(c.value?[node("small",c.value)]:[]),...(c.info?[node("small","INFO ONLY","board-info-mark")]:[]));lane.append(tile);}cells.append(lane);}host.append(row);}
  host.append(node("p","Each tile shows the published signal state; blue tags identify unscored context. Breadth may be estimated. Gray means unavailable. Health includes neutral states; not every green tile is a separate scored point.","board-note"));
 }
 const api={build,splitRows,render(data,f){latest={data,f};paint();},mount(el){host=el;paint();}};
 if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.OverviewSignalBoard=api;
})(typeof window!=="undefined"?window:globalThis);
