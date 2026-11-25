'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const mi=require('../docs/market-intelligence.js');
function mkScore(points,available=15){return {bearish:points,available,total:15,possible_max:points+(15-available),complete:available===15};}
function mk({spPrior=10,spNow=4,ndPrior=7,ndNow=11,spPriorAv=15,spNowAv=15,ndPriorAv=15,ndNowAv=15,date='2026-11-20'}={}){
 return {session:date,history:[{date:'2026-11-19',sp:spPrior,sp_available:spPriorAv,nd:ndPrior,nd_available:ndPriorAv},{date,sp:spNow,sp_available:spNowAv,nd:ndNow,nd_available:ndNowAv}],markets:{sp500:{score:mkScore(spNow,spNowAv)},nasdaq100:{score:mkScore(ndNow,ndNowAv)}}};
}
test('compares the two completed EOD sessions and reports exact daily scores',()=>{
 const data=mk(),sp=mi.scoredHistory(data,'sp'),nd=mi.scoredHistory(data,'nd');
 assert.equal(mi.scoreRange(sp.previous),'5/15');assert.equal(mi.scoreRange(sp.today),'11/15');
 assert.deepEqual(sp.delta,{min:6,max:6});assert.equal(sp.direction,'improving');
 assert.equal(sp.transition,'risk_eased');assert.equal(sp.previousRegime,'RISK-OFF');assert.equal(sp.currentRegime,'RISK-ON');
 assert.equal(nd.direction,'deteriorating');assert.equal(nd.transition,'risk_increased');
 assert.equal(mi.divergence(sp,nd).kind,'diverging');
});
test('Both SPY and QQQ raw bearish 5 become health 10 Neutral',()=>{
 const qqq=mi.bounds(5,15,15),spy=mi.bounds(5,15,15);
 assert.equal(mi.regimeForRange(qqq,'nd'),'NEUTRAL');
 assert.equal(mi.regimeForRange(spy,'sp'),'NEUTRAL');
});
test('can identify regime split even without opposite day-over-day moves',()=>{
 const d=mk({spPrior:10,spNow:10,ndPrior:4,ndNow:4});
 assert.equal(mi.divergence(mi.scoredHistory(d,'sp'),mi.scoredHistory(d,'nd')).kind,'split');
});
test('declares no divergence when both regimes and directions agree',()=>{
 const d=mk({spPrior:8,spNow:7,ndPrior:8,ndNow:7});
 assert.equal(mi.divergence(mi.scoredHistory(d,'sp'),mi.scoredHistory(d,'nd')).kind,'aligned');
});
test('do not infer improvement from partial score ranges',()=>{
 const d=mk({spPrior:8,spPriorAv:14,spNow:8,spNowAv:14});
 const sp=mi.scoredHistory(d,'sp');
 assert.deepEqual(sp.delta,{min:-1,max:1});assert.equal(sp.direction,'uncertain');
 assert.equal(mi.scoreRange(sp.previous),'6–7/15');
 assert.equal(sp.transition,'unchanged');
});
test('regime can remain unambiguous despite a missing signal',()=>{
 const d=mk({spPrior:10,spPriorAv:14,spNow:7,spNowAv:14});
 const sp=mi.scoredHistory(d,'sp');
 assert.equal(sp.previousRegime,'RISK-OFF');assert.equal(sp.currentRegime,'NEUTRAL');
 assert.equal(sp.transition,'risk_eased');
 assert.equal(sp.direction,'improving');
});
test('risk transition uncertain when missing input could cross a boundary',()=>{
 const d=mk({ndPrior:9,ndPriorAv:14,ndNow:9,ndNowAv:14});
 const nd=mi.scoredHistory(d,'nd');
 assert.equal(nd.currentRegime,'INCOMPLETE');assert.equal(nd.transition,'uncertain');
});
test('rejects stale history whose most recent entry is not snapshot session',()=>{
 const d=mk();d.session='2026-11-21';assert.equal(mi.scoredHistory(d,'sp'),null);
});
test('rejects corrupted or differently scaled history, not invented comparisons',()=>{
 const d=mk();d.history[1].sp=7;assert.equal(mi.scoredHistory(d,'sp'),null);
});
test('rejects missing previous session or duplicate session dates',()=>{
 const d=mk();d.history=d.history.slice(1);assert.equal(mi.scoredHistory(d,'nd'),null);
 d.history=mk().history;d.history[0].date=d.history[1].date;assert.equal(mi.scoredHistory(d,'nd'),null);
});
test('preserves exact 15-point counts when all signals exist',()=>{
 const d=mk();d.signals={};
 const keys=['oil','usd','tnx','credit','copper','vix_curve','vix','sp_def','sp_xle','sp_smh','spy_trend','sp_rsi14','rsp_spy','iwm_spy','sp_breadth1d','vxn','nd_def','nd_xle','nd_smh','qqq_trend','nd_rsi14','qqqe_qqq','iwm_qqq','nd_breadth1d'];
 for(const k of keys)d.signals[k]={state:'bull',source:k.includes('breadth')?'EXPERIMENTAL constituent-derived series':'EOD'};
 let q=mi.quality(d,'sp');assert.equal(q.available,15);assert.equal(q.missing,0);assert.deepEqual(q.estimated,['sp_breadth1d']);assert.equal(q.mismatch,false);
 d.signals.sp_breadth1d.state='na';d.markets.sp500.score=mkScore(6,14);
 q=mi.quality(d,'sp');assert.equal(q.missing,1);assert.equal(q.estimated.length,0);assert.equal(q.mismatch,false);
 assert.equal(mi.quality(d,'nd').available,15);
});
test('flags mismatched score / raw-signal availability',()=>{
 const d=mk();d.signals={};const q=mi.quality(d,'sp');
 assert.equal(q.mismatch,true);
});
test('wash state is recognized as available rather than missing',()=>{
 const d=mk();d.signals={};const keys=['oil','usd','tnx','credit','copper','vix_curve','vix','sp_def','sp_xle','sp_smh','spy_trend','sp_rsi14','rsp_spy','iwm_spy','sp_breadth1d'];
 for(const k of keys)d.signals[k]={state:'bull',source:'EOD'};
 d.signals.oil.state='wash';const q=mi.quality(d,'sp');assert.equal(q.missing,0);assert.equal(q.mismatch,false);
});
test('format market session date',()=>{assert.equal(mi.formatDate('2026-11-20'),'Nov 20');assert.equal(mi.formatDate('junk'),'—');});
