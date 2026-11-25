'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const path=require('node:path');
const mi=require(path.join(__dirname,'..','docs','market-intelligence.js'));
const journal=require(path.join(__dirname,'..','docs','insights-history.js'));
const priceRisk=require(path.join(__dirname,'..','docs','price-risk.js'));
const score=(bearish,available=15)=>({bearish,available,total:15,possible_max:bearish+15-available});
function model(today,prev){
 return {session:'2026-11-24',history:[{date:'2026-11-23',sp:prev,nd:prev,sp_available:15,nd_available:15},{date:'2026-11-24',sp:today,nd:today,sp_available:15,nd_available:15}],markets:{sp500:{score:score(today)},nasdaq100:{score:score(today)}}};
}
test('health range converts raw score with missing data',()=>{
 assert.deepEqual(mi.bounds(10,15,15),{min:5,max:5,available:15,total:15});
 assert.deepEqual(mi.bounds(9,14,15),{min:5,max:6,available:14,total:15});
 assert.equal(mi.regimeForRange(mi.bounds(9,14,15),'sp'),'INCOMPLETE');
});
test('both markets share new unified bands',()=>{
 for(const [b,r] of [[0,'RISK-ON'],[4,'RISK-ON'],[5,'NEUTRAL'],[9,'NEUTRAL'],[10,'RISK-OFF'],[15,'RISK-OFF']]){
  for(const sym of ['sp','nd'])assert.equal(mi.regimeForRange(mi.bounds(b,15,15),sym),r);
 }
});
test('health rises for improving raw bearish count',()=>{
 const d=model(9,10); const r=mi.scoredHistory(d,'sp');
 assert.equal(r.today.min,6);assert.equal(r.previous.min,5);
 assert.deepEqual(r.delta,{min:1,max:1});assert.equal(r.direction,'improving');
 assert.equal(r.currentRegime,'NEUTRAL');assert.equal(r.previousRegime,'RISK-OFF');
 assert.equal(r.transition,'risk_eased');
});
test('health falling is deterioration',()=>{
 const r=mi.scoredHistory(model(10,9),'nd');
 assert.equal(r.delta.min,-1);assert.equal(r.direction,'deteriorating');
});
function entry(session,prev,score,pscore,baseline=false){
 const market={score,available:15,total:15,previous_score:pscore,score_delta_1d:pscore==null?null:score-pscore,
 regime:score>=9?'RISK-OFF':'CAUTION',previous_regime:'CAUTION',trend_5d:'STABLE',price_risk_status:baseline?'none':'divergence',price_risk_label:'Old classification',
 previous_close:baseline?null:100,close:baseline?95:104,price_change_pct:baseline?null:4,estimated_count:0};
 return {session,previous_session:prev,spy:{...market},qqq:{...market},baseline,record_source:baseline?'screenshot':'automatic_eod'};
}
test('archive preserves raw objects while display/CSV invert',()=>{
 const old=entry('2026-11-20','2026-11-19',11,12,true);
 const next=entry('2026-11-23','2026-11-20',10,11);
 const archive={market_insights_history:{version:1,entries:[old,next]}};
 const valid=journal.validArchive(archive);assert.equal(valid.length,2);
 const rows=journal.filterRows(valid,{range:'all',market:'spy'});
 assert.equal(rows[0].detail.score,5);assert.equal(rows[0].detail.previous_score,4);
 assert.equal(rows[0].detail.score_delta_1d,1);
 assert.equal(rows[0].detail.regime,'RISK-OFF');
 assert.equal(rows[1].detail.score,4);
 assert.equal(old.spy.score,11);assert.equal(next.spy.score,10);
 const csv=journal.toCSV(rows);
 assert.match(csv,/Market Health \(min\)/);assert.match(csv,/Archived bearish points/);
 assert.match(csv,/"5"/);
});
test('price risk uses health units and Neutral instead of Caution',()=>{
 const d=model(10,11);
 for(const x of ['sp500','nasdaq100']){d.markets[x].score.total=16;d.markets[x].score.available=16;}
 for(const row of d.history){row.sp_available=16;row.nd_available=16;}
 d.history[0].sp=11;d.history[0].nd=11;d.history[1].sp=10;d.history[1].nd=10;
 d.price_moves={status:'complete',session:d.session,previous_session:'2026-11-23',spy:{previous_close:100,close:103,change_pct:3}};
 d.moving_averages={spy:{as_of:d.session,close:103}};
 const r=priceRisk.evaluate(d,'sp',mi.scoredHistory(d,'sp'));
 assert.equal(r.kind,'watch');assert.match(r.scoreLine,/6\/16 Market Health/);
 assert.match(r.headline,/Neutral/);
});
