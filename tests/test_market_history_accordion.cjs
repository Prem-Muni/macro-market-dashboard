const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('docs/daily-summaries.js','utf8');
const snapshot=JSON.parse(fs.readFileSync('docs/data/latest.json','utf8'));
class Node {
 constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.textContent='';this.open=false;}
 appendChild(x){this.children.push(x);return x;}
 replaceChildren(){this.children=[];}
 setAttribute(){}
}
const window={},document={getElementById:()=>null,createElement:t=>new Node(t)};
vm.runInNewContext(source,{window,document});
const api=window.DailySummaries;
test('archive date accordion retains every saved session and complete summary card',()=>{
 const before=JSON.stringify(snapshot),records=api.previousSummaries(snapshot),root=new Node('div');
 api.renderArchiveRows(root,records);
 assert.equal(root.children.length,records.length);
 assert.ok(records.every((r,i)=>i===0||records[i-1].session>=r.session));
 records.forEach((r,i)=>{const item=root.children[i],parts=r.session.split('-');
 assert.equal(item.tag,'details');assert.equal(item.dataset.session,r.session);assert.equal(item.open,false);
 assert.equal(item.children[0].tag,'summary');
 assert.equal(item.children[0].children[0].textContent,parts[1]+'/'+parts[2]+'/'+parts[0]);
 assert.equal(item.children[0].children[1].textContent,' - Market Summary');
 const compact=item.children[1].children[0];assert.equal(compact.className,'archive-compact-row');assert.equal(compact.children.length,3);
 for(const [idx,m] of [[0,r.spy],[1,r.qqq]]){const tile=compact.children[idx];assert.equal(tile.children[0].children[3].textContent,api.money(m.close));assert.equal(tile.children[1].children[0].textContent,api.scoreText(m));if(!Number.isFinite(m.pct))assert.equal(tile.children[0].children[4].textContent,'Daily change unavailable');}
 const full=item.children[1].children[1];assert.equal(full.tag,'details');assert.equal(full.open,false);
 const card=full.children[1];assert.equal(card.tag,'article');
 assert.ok(card.children.some(c=>c.className==='daily-summary-description'&&c.textContent===r.summary));
 assert.equal(card.children.find(c=>c.className==='daily-summary-etfs').children.length,2);
 });
 assert.equal(JSON.stringify(snapshot),before);
});
test('refresh preserves selected open dates without opening others or duplicating rows',()=>{
 const records=api.previousSummaries(snapshot),root=new Node('div'),expanded=new Set([records[0].session]);
 api.renderArchiveRows(root,records,expanded);api.renderArchiveRows(root,records,expanded);
 assert.equal(root.children.length,records.length);
 assert.equal(root.children.filter(x=>x.open).length,1);assert.equal(root.children[0].open,true);
});

test('MACD classification uses the published scored state, including equality and unavailable readings',()=>{const app=fs.readFileSync('docs/app.js','utf8');const code=app.slice(app.indexOf('function renderDailyMACD'),app.indexOf('// Match the Python engine'));const nodes={};const render=new Function('$',code+';return renderDailyMACD')(id=>nodes[id]??=(new Node('span')));const data=JSON.parse(JSON.stringify(snapshot));render(data);for(const [sym,key] of [['spy','sp_macd'],['qqq','nd_macd']]){const state=data.signals[key]?.state;const ready=data.daily_macd[sym]?.status==='complete'&&data.daily_macd[sym]?.as_of===data.session;assert.equal(nodes[sym+'-macd-state'].textContent,ready&&state==='bull'?'SCORED BULLISH':ready&&state==='bear'?'SCORED BEARISH':'UNAVAILABLE');}data.daily_macd.spy={status:'complete',as_of:data.session,macd:0,signal:0,histogram:0,relation:'equal'};data.signals.sp_macd={state:'bull'};data.daily_macd.qqq={status:'unavailable'};render(data);assert.equal(nodes['spy-macd-state'].textContent,'SCORED BULLISH');assert.equal(nodes['qqq-macd-state'].textContent,'UNAVAILABLE');});
