const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const source=fs.readFileSync('docs/app.js','utf8');
const fn=source.slice(source.indexOf('function savedHistoryRows'),source.indexOf('function plot(history)'));
const {savedHistoryRows,historyForChart}=new Function(fn+';return {savedHistoryRows,historyForChart}')();
const d=JSON.parse(fs.readFileSync('docs/data/latest.json','utf8'));
test('saved history is separate from research and preserves the archived denominator',()=>{
 const original=JSON.stringify(d),saved=historyForChart(d,'saved');
 assert.equal(saved.length,d.market_insights_history.entries.length);
 assert.equal(historyForChart(d,'research'),d.history);
 for(const row of saved){
  const archived=d.market_insights_history.entries.find(x=>x.session===row.date);
  for(const [k,s] of [['sp','spy'],['nd','qqq']]){
   assert.equal(row[k],archived[s].score);assert.equal(row[k+'_total'],archived[s].total);
   assert.equal(row[k+'_available'],archived[s].available);
  }
 }
 const prior=saved.find(r=>r.date==='2026-11-25');
 assert.equal(prior.sp_total-prior.sp,6);
 assert.equal(prior.nd_total-prior.nd,6);
 assert.equal(JSON.stringify(d),original);
});
test('no synthetic points for missing archives or invalid score rows',()=>{
 assert.deepEqual(savedHistoryRows({history:d.history}),[]);
 const row=savedHistoryRows({market_insights_history:{entries:[{session:'2026-11-27',spy:{score:17,available:16,total:16}}]}})[0];
 assert.equal(row.sp,undefined);
});
test('dashboard defaults to saved EOD and labels research explicitly',()=>{
 const html=fs.readFileSync('docs/index.html','utf8');
 assert(html.includes('<option value="saved" selected>Saved EOD</option>'));
 assert(html.includes('<option value="research">Reconstructed research</option>'));
 assert(source.includes("row.previous_session!==data[i-1].date"));
});
