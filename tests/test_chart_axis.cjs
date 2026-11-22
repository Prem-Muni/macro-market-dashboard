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
const history=dates.map((date,i)=>({date,sp:Math.min(14,i%12),nd:Math.min(14,(i+2)%12),sp_available:14,nd_available:14}));
context.testHistory=history;
vm.runInContext('snapshot={markets:{sp500:{score:{total:14}}}};plot(testHistory)',context);
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
assert.strictEqual(tickText.includes('14'),true);
assert.strictEqual(vlines()[0].attrs.x1,45);
assert.strictEqual(vlines().at(-1).attrs.x1,934);
vm.runInContext('horizon=90;plot(testHistory)',context);
tickText=textNodes().map(x=>x.textContent);
assert.strictEqual(nodes['chart-range'].textContent.includes('90 trading sessions'),true);
assert.strictEqual(vlines().length,7);
assert.strictEqual(tickText.includes(fmt(dates.at(-90))),true);
assert.strictEqual(tickText.includes(fmt(dates.at(-1))),true);
console.log('PASS: 30/90 session ranges, actual date ticks, correct endpoint alignment, 14-point Y axis');
// Old published snapshots should not resurrect put/call display rows.
context.legacySnapshot={
  signals:{vix:{state:'bear',label:'BEARISH',value:25},spx_pc:{state:'na',label:'N/A'},sp_pcsp:{state:'na',label:'N/A'}},
  names:{vix:'VIX',spx_pc:'Legacy put/call',sp_pcsp:'Legacy put/call'},
};
vm.runInContext('snapshot=legacySnapshot;signals("sp-signals",["vix","spx_pc","sp_pcsp"])',context);
assert.strictEqual(nodes['sp-signals'].children.length,1);
console.log('PASS: legacy put/call rows suppressed from cached snapshots');
