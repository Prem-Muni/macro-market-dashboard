const assert=require('node:assert/strict');
const test=require('node:test');
const history=require('../docs/insights-history.js');
const sample=(session,prev,spy,qqq)=>({
  session,previous_session:prev,
  spy:{score:spy,total:15,available:15,regime:'RISK-OFF',price_risk_status:session==='2026-11-23'?'divergence':'uncertain',price_risk_label:'SPY label',close:690,price_change_pct:0,estimated_count:1},
  qqq:{score:qqq,total:15,available:15,regime:'RISK-OFF',price_risk_status:'divergence',price_risk_label:'QQQ label',close:608,price_change_pct:0,estimated_count:1}
});
const entries=[sample('2026-11-20','2026-11-19',11,11),sample('2026-11-23','2026-11-20',10,11)];
entries[1].spy.price_change_pct=4.71;entries[1].qqq.price_change_pct=7.00;
test('SPY History excludes all QQQ records and remains latest-first',()=>{
 const rows=history.filterRows(entries,{range:'all',market:'spy'});
 assert.equal(rows.length,2); assert(rows.every(x=>x.symbol==='spy'));
 assert.equal(rows[0].session,'2026-11-23');
 assert.equal(rows[0].detail.score,5); // archived 10 bearish of 15 => 5 health
});
test('QQQ History excludes all SPY records',()=>{
 const rows=history.filterRows(entries,{range:'all',market:'qqq'});
 assert.equal(rows.length,2); assert(rows.every(x=>x.symbol==='qqq'));
 assert.equal(rows[0].detail.score,4); // archived 11 bearish of 15 => 4 health
});
test('SPY and QQQ alert filters are independent',()=>{
 assert.equal(history.filterRows(entries,{range:'all',market:'spy',alertsOnly:true}).length,1);
 assert.equal(history.filterRows(entries,{range:'all',market:'qqq',alertsOnly:true}).length,1);
});
test('Each chart contains only chosen market observations',()=>{
 const spy=history.chartRows(entries,{range:'all',market:'spy'}),qqq=history.chartRows(entries,{range:'all',market:'qqq'});
 assert(spy.every(x=>'spy' in x && !('qqq' in x)));
 assert(qqq.every(x=>'qqq' in x && !('spy' in x)));
});
test('SPY and QQQ CSV exports contain only chosen rows',()=>{
 const spy=history.toCSV(history.filterRows(entries,{market:'spy'}));
 const qqq=history.toCSV(history.filterRows(entries,{market:'qqq'}));
 const count=s=>s.trim().split('\r\n').length;
 assert.equal(count(spy),3); assert.equal(count(qqq),3);
 assert.match(spy,/,"SPY",/); assert.doesNotMatch(spy,/,"QQQ",/);
 assert.match(qqq,/,"QQQ",/); assert.doesNotMatch(qqq,/,"SPY",/);
});
