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
 const card=item.children[1].children[0];assert.equal(card.tag,'article');
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
