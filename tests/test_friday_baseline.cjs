const assert = require('node:assert/strict');
const test = require('node:test');
const history = require('../docs/insights-history.js');
const seed = {
 session:'2026-11-20', previous_session:'2026-11-19',baseline:true,
 record_source:'screenshot_backfill',source_note:'Friday screenshot; prior close not available',
 spy:{score:11,total:15,available:15,regime:'RISK-OFF',previous_close:null,close:689.81,price_change_pct:null,
   price_risk_status:'uncertain',price_risk_label:'Baseline only',baseline_context:{rsi14:24.91,volatility_index:{name:'VIX',value:35.89}}},
 qqq:{score:11,total:15,available:15,regime:'RISK-OFF',previous_close:null,close:608.45,price_change_pct:null,
   price_risk_status:'uncertain',price_risk_label:'Baseline only',baseline_context:{rsi14:26.63,volatility_index:{name:'VXN',value:45.25}}},
 signal_changes:{status:'partial',groups:{}},
};
const monday = structuredClone(seed);
monday.session='2026-11-23'; monday.previous_session='2026-11-20'; monday.baseline=false;
monday.record_source='automatic_eod';monday.spy.close=722.29;monday.spy.previous_close=689.81;
monday.spy.price_change_pct=4.71;monday.spy.price_risk_status='divergence';
monday.qqq.close=651.03;monday.qqq.previous_close=608.45;
monday.qqq.price_change_pct=7;monday.qqq.price_risk_status='divergence';
test('valid archive accepts labeled baseline with unknown prior close',()=>{
 const entries=history.validArchive({market_insights_history:{version:1,entries:[seed,monday]}});
 assert.equal(entries.length,2);
});
test('Friday baseline is first chart point',()=>{
 const series=history.chartRows([seed,monday],{range:'all',market:'both'});
 assert.equal(series[0].date,'2026-11-20');
 assert.equal(series[0].spy.score,11);
});
test('Friday is excluded from alert-only filter',()=>{
 const filtered=history.filterRows([seed,monday],{range:'all',alertsOnly:true});
 assert.equal(filtered.length,2);
 assert(filtered.every(r=>r.session==='2026-11-23'));
});
test('CSV carries baseline origin without inventing percentage',()=>{
 const rows=history.filterRows([seed,monday],{range:'all',market:'spy'});
 const csv=history.toCSV(rows);
 assert.match(csv,/screenshot_backfill/);
 assert.match(csv,/689\.81/);
 assert.match(csv,/35\.89/);
 assert.match(csv,/RSI \(14\)/);
 const lines=csv.replace(/^\uFEFF/,'').trim().split('\r\n');
 assert.equal(lines.length,3);
 const friday=lines[2];
 assert(!friday.includes('NaN'));
});
