const assert=require('node:assert/strict');
const test=require('node:test');
const journal=require('../docs/insights-history.js');
function data(date,pct,status='divergence'){
 const make=symbol=>({score:symbol==='spy'?10:11,total:15,available:15,regime:'RISK-OFF',
    previous_close:100,close:100+pct,price_change_pct:pct,previous_score:11,score_delta_1d:symbol==='spy'?-1:0,
    price_risk_status:status,price_risk_label:'Strong rally · Risk-Off persists',estimated_count:1,trend_5d:'STABLE'});
 return {session:date,previous_session:'2026-11-20',spy:make('spy'),qqq:make('qqq'),signal_changes:{status:'complete',groups:{shared:{new_bearish:[],eased:[]},sp:{new_bearish:[],eased:[]},nd:{new_bearish:[],eased:[]}}}};
}
const dates=['2026-11-23','2026-11-24','2026-11-25'];
const entries=dates.map((d,i)=>data(d,i+2,i===1?'none':'divergence'));
test('archive valid when version one and chronological',()=>{
 assert.equal(journal.validArchive({market_insights_history:{version:1,entries}}).length,3);
 assert.equal(journal.validArchive({market_insights_history:{version:2,entries}}).length,0);
});
test('latest sessions first and both markets',()=>{
 const rows=journal.filterRows(entries,{range:'30',market:'both'});
 assert.equal(rows.length,6);
 assert.equal(rows[0].session,'2026-11-25');
 assert.equal(rows[0].symbol,'spy');
 assert.equal(rows[1].symbol,'qqq');
});
test('filter one market and alerts only',()=>{
 const rows=journal.filterRows(entries,{range:'all',market:'qqq',alertsOnly:true});
 assert.equal(rows.length,2);
 assert(rows.every(r=>r.symbol==='qqq'));
});
test('graph uses saved entries not reconstructed chart history',()=>{
 const series=journal.chartRows(entries,{range:'all',market:'both'});
 assert.equal(series.length,3);
 assert.equal(series[0].date,'2026-11-23');
 assert.equal(series[2].spy.score,10);
});
test('export CSV includes score, alert and actual session date',()=>{
 const csv=journal.toCSV(journal.filterRows(entries,{market:'spy'}));
 assert.match(csv,/2026-11-23/);
 assert.match(csv,/Strong rally/);
 assert.match(csv,/Bearish points/);
 assert.equal(csv.split('\r\n').filter(Boolean).length,4);
});
test('spreadsheet injection is escaped for untrusted strings',()=>{
 const sample=data('2026-11-26',3);
 sample.spy.price_risk_label='=HYPERLINK("oops")';
 const csv=journal.toCSV(journal.filterRows([sample],{market:'spy'}));
 assert.match(csv,/"'=HYPERLINK/);
});
test('missing archive returns empty and no fabricated history',()=>{
 assert.equal(journal.validArchive({history:[{date:'2026-11-20',sp:11}]}).length,0);
});
