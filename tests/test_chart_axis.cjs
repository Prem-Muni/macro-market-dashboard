/* Local regression: exact session-date labels at the data points; 30 & 90 sessions. */
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
class Element{
 constructor(tag='div'){this.tag=tag;this.attrs={};this.children=[];this.textContent='';this.style={};this.className='';this.classList={toggle(){}};}
 setAttribute(k,v){this.attrs[k]=v;}
 appendChild(e){this.children.push(e);return e;}
 replaceChildren(){this.children=[];}
 addEventListener(){}
}
const nodes={};
const document={getElementById(id){return nodes[id]??=new Element(id);},createElementNS(ns,tag){return new Element(tag);},createElement(tag){return new Element(tag);}};
const context=vm.createContext({document,fetch:async()=>{throw Error('Test-only: no network')},console,Date,Number,String,Object,Array,Set});
const code=fs.readFileSync(path.join(__dirname,'../docs/app.js'),'utf8');
vm.runInContext(code,context);
const dates=[];
for(let d=new Date('2026-07-01T00:00:00Z');d<=new Date('2026-11-20T00:00:00Z');d.setUTCDate(d.getUTCDate()+1)){
 if(d.getUTCDay()!==0 && d.getUTCDay()!==6)dates.push(d.toISOString().slice(0,10));
}
const history=dates.map((date,i)=>({date,sp:Math.min(15,i%12),nd:Math.min(15,(i+2)%12),sp_available:15,nd_available:15}));
context.testHistory=history;
vm.runInContext('snapshot={markets:{sp500:{score:{total:15}}}};plot(testHistory)',context);
const textNodes=()=>nodes['history-svg'].children.filter(n=>n.tag==='text');
const vlines=()=>nodes['history-svg'].children.filter(n=>n.tag==='line'&&n.attrs['stroke-dasharray']==='3 7');
let tickText=textNodes().map(x=>x.textContent);
assert.strictEqual(nodes['chart-range'].textContent.includes('30 trading sessions'),true);
assert.strictEqual(nodes['chart-range'].textContent.includes('Nov 20, 2026'),true);
const last30=dates.slice(-30);
const fmt=date=>{const p=date.split('-');return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(p[1])-1]} ${Number(p[2])}`};
assert.strictEqual(tickText.includes(fmt(last30[0])),true);
assert.strictEqual(tickText.includes(fmt(last30.at(-1))),true);
assert.strictEqual(vlines().length,7);
assert.strictEqual(tickText.includes('15'),true);
assert.strictEqual(vlines()[0].attrs.x1,45);
assert.strictEqual(vlines().at(-1).attrs.x1,934);
vm.runInContext('horizon=90;plot(testHistory)',context);
tickText=textNodes().map(x=>x.textContent);
assert.strictEqual(nodes['chart-range'].textContent.includes('90 trading sessions'),true);
assert.strictEqual(vlines().length,7);
assert.strictEqual(tickText.includes(fmt(dates.at(-90))),true);
assert.strictEqual(tickText.includes(fmt(dates.at(-1))),true);
console.log('PASS: 30/90 session ranges, actual date ticks, correct endpoint alignment, 15-point Y axis');
// Old published snapshots should not resurrect put/call display rows.
context.legacySnapshot={
  signals:{vix:{state:'bear',label:'BEARISH',value:25},spx_pc:{state:'na',label:'N/A'},sp_pcsp:{state:'na',label:'N/A'}},
  names:{vix:'VIX',spx_pc:'Legacy put/call',sp_pcsp:'Legacy put/call'},
};
vm.runInContext('snapshot=legacySnapshot;signals("sp-signals",["vix","spx_pc","sp_pcsp"])',context);
assert.strictEqual(nodes['sp-signals'].children.length,1);
console.log('PASS: legacy put/call rows suppressed from cached snapshots');
// Display-only ETF moving averages: no score fields or market states are touched.
context.maFixture={moving_averages:{
 spy:{as_of:'2026-11-20',close:689.81,averages:{'5':{value:700,distance_pct:-1.46},'20':{value:680,distance_pct:1.44},'50':{value:675,distance_pct:2.19},'100':{value:705,distance_pct:-2.15},'200':{value:710,distance_pct:-2.84}},rsi:{period:14,value:27.42,state:'OVERSOLD'}},
 qqq:{as_of:'2026-11-20',close:608.45,averages:{'5':{value:609,distance_pct:-0.09},'20':{value:600,distance_pct:1.41},'50':{value:590,distance_pct:3.13},'100':{value:595,distance_pct:2.26},'200':{value:null,distance_pct:null}},rsi:{period:14,value:73.68,state:'OVERBOUGHT'}}
}};
vm.runInContext('renderMovingAverages(maFixture)',context);
assert.strictEqual(nodes['spy-ma5'].textContent,'$700.00');
assert.strictEqual(nodes['spy-ma5-gap'].textContent,'BEARISH · 1.46% below');
assert.strictEqual(nodes['spy-ma20-gap'].textContent,'BULLISH · 1.44% above');
assert.strictEqual(nodes['qqq-ma200'].textContent,'—');
assert.strictEqual(nodes['qqq-ma200-gap'].textContent,'Not available');
assert.strictEqual(nodes['spy-ma-asof'].textContent,'As of 2026-11-20 close');
assert.strictEqual(nodes['spy-ma100'].textContent,'$705.00');
assert.strictEqual(nodes['qqq-ma100'].textContent,'$595.00');
assert.strictEqual(nodes['spy-rsi14'].textContent,'27.42');
assert.strictEqual(nodes['spy-rsi14-state'].textContent,'Oversold');
assert.strictEqual(nodes['spy-rsi14-marker'].style.left,'27.42%');
assert.strictEqual(nodes['qqq-rsi14'].textContent,'73.68');
assert.strictEqual(nodes['qqq-rsi14-state'].textContent,'Overbought');
// Regression for the user's rule: exactly equal SMA is explicitly BULLISH.
context.maFixture.moving_averages.spy.averages['20']={value:689.81,distance_pct:0,state:'BULLISH'};
context.maFixture.moving_averages.qqq.averages['20']={value:608.45,distance_pct:0,state:'BULLISH'};
vm.runInContext('renderMovingAverages(maFixture)',context);
assert.strictEqual(nodes['spy-ma20-gap'].textContent,'BULLISH · At average');
assert.strictEqual(nodes['qqq-ma20-gap'].textContent,'BULLISH · At average');
// Even if the displayed percent rounds to 0.00%, engine's raw state wins.
context.maFixture.moving_averages.spy.averages['20']={value:689.811,distance_pct:0,state:'BEARISH'};
vm.runInContext('renderMovingAverages(maFixture)',context);
assert.strictEqual(nodes['spy-ma20-gap'].textContent,'BEARISH · 0.00% below');

const html=fs.readFileSync(path.join(__dirname,'../docs/index.html'),'utf8');
assert(html.indexOf('SPY &amp; QQQ · Price History')<html.indexOf('REGIME HISTORY'));
assert(html.indexOf('REGIME HISTORY')<html.indexOf('Fear &amp; Greed Index'));
for(const ticker of ['spy','qqq'])for(const n of [5,20,50,100,200])assert(html.includes(`id="${ticker}-ma${n}"`));
console.log('PASS: SPY/QQQ SMA values, EOD dates, N/A handling, and swapped chart order');

assert(html.includes('Original 14-point model:')) ;
assert(html.includes('ORIGINAL TREND + RSI SCORED'));
assert(html.includes('SMA comparisons are informational only'));
assert(!html.includes('5-SMA composite contributes'));
assert(!html.includes('5-SMA ALIGNMENT + RSI SCORED'));
assert(html.includes('15-point bearish scores'));
console.log('PASS: 15-point model labels and legacy reference visible');

assert(!html.includes("Observed bearish points out of 14"));
assert(html.includes("Observed bearish points out of 15"));
assert(html.includes("not included in the 15-point score"));
console.log("PASS: no stale 14-point captions");
// 20-month and 365-calendar-day chart ranges and historical research cards.
Element.prototype.append=function(...nodes){for(const n of nodes)this.appendChild(n)};
const datesLong=[];
for(let d=new Date('2024-10-01T00:00:00Z');d<=new Date('2026-11-20T00:00:00Z');d.setUTCDate(d.getUTCDate()+1))
 if(d.getUTCDay()!==0&&d.getUTCDay()!==6)datesLong.push(d.toISOString().slice(0,10));
const backHistory=datesLong.map((date,i)=>({date,sp:i%15,nd:i%14,sp_available:15,nd_available:15}));
context.longHistory=backHistory;
vm.runInContext("snapshot={markets:{sp500:{score:{total:15}}}};horizon='all';plot(longHistory)",context);
assert(nodes['chart-range'].textContent.includes(`${backHistory.length} trading sessions`));
assert(textNodes().map(x=>x.textContent).includes(fmt(datesLong.at(-1))));
vm.runInContext("horizon='year';plot(longHistory)",context);
const yearCount=Number(nodes['chart-range'].textContent.match(/^(\d+)/)[1]);
assert(yearCount>=250&&yearCount<=270);
assert.strictEqual(vlines().length,7);
for(const id of ['histYear','hist20m']) assert(html.includes(`id="${id}"`));
const sample=(days,comp)=>({complete_days:comp,incomplete_days:days-comp,
 zero_to_four:{days:15,forward5_observations:12,forward5_mean_pct:1.27,forward5_positive_pct:58.3},
 exactly_five:{days:8,forward5_observations:7,forward5_mean_pct:-0.3,forward5_positive_pct:42.9},
 zero_to_five:{days:23,forward5_observations:19,forward5_mean_pct:0.7,forward5_positive_pct:52.6}});
const p={start:'2025-03-20',end:'2026-11-20',sessions:420,
 markets:{sp:sample(420,400),nd:sample(420,399)}};
const bp={backtest:{year:{...p,start:'2025-11-20',sessions:252},twenty_months:p}};
context.testBacktest=bp;
vm.runInContext('renderBacktest(testBacktest)',context);
assert(nodes['year-sp-backtest'].children.length===3);
assert(nodes['twenty_months-nd-backtest'].children.length===3);
assert(nodes['backtest-date-range'].textContent.includes('2025-03-20'));
assert(nodes['year-sp-backtest'].children[1].children[2].children[0].textContent==='23');
console.log('PASS: 365d/20-month chart history, actual session ticks and backtest cards');
