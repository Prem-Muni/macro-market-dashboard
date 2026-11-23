'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const mi=require('../docs/market-intelligence.js');
const pr=require('../docs/price-risk.js');

const mkScore=(bearish,available=15)=>({bearish,available,total:15,possible_max:bearish+15-available,complete:available===15});
function mk({spBefore=11,spNow=10,qqqBefore=11,qqqNow=11,
             spBeforeAvail=15,spNowAvail=15,qqqBeforeAvail=15,qqqNowAvail=15,
             spyPrior=689.81,spyNow=722.51,qqqPrior=608.45,qqqClose=651.03}={}){
 const prev='2026-11-20',now='2026-11-23';
 const makePrice=(p,c)=>({previous_close:p,close:c,change_pct:+((c/p-1)*100).toFixed(5)});
 return {session:now,
  history:[{date:prev,sp:spBefore,sp_available:spBeforeAvail,nd:qqqBefore,nd_available:qqqBeforeAvail},
           {date:now,sp:spNow,sp_available:spNowAvail,nd:qqqNow,nd_available:qqqNowAvail}],
  markets:{sp500:{score:mkScore(spNow,spNowAvail)},nasdaq100:{score:mkScore(qqqNow,qqqNowAvail)}},
  moving_averages:{spy:{close:spyNow,as_of:now},qqq:{close:qqqClose,as_of:now}},
  price_moves:{status:'complete',session:now,previous_session:prev,spy:makePrice(spyPrior,spyNow),qqq:makePrice(qqqPrior,qqqClose)}
 };
}
function evaluate(d,key){return pr.evaluate(d,key,mi.scoredHistory(d,key));}
test('Friday-to-Monday rebound flags both markets as risky even though SPY score improved',()=>{
 const d=mk();const a=evaluate(d,'sp'),b=evaluate(d,'nd');
 assert.equal(a.kind,'divergence');assert.equal(b.kind,'divergence');
 assert.equal(pr.pctText(a.price),'+4.74%');assert.equal(pr.pctText(b.price),'+7.00%');
 assert.match(a.detail,/fewer bearish signals/);assert.match(b.detail,/no change in bearish-point count/);
 assert.equal(pr.summary(a,b).headline,'Price/risk divergence in both ETFs');
});
test('strong rally in Risk-On is aligned, not a risk divergence',()=>{
 const d=mk({spBefore:5,spNow:3});assert.equal(evaluate(d,'sp').kind,'aligned');
});
test('strong rally in Caution is a watch, not an urgent divergence',()=>{
 const d=mk({spBefore:9,spNow:6});assert.equal(evaluate(d,'sp').kind,'watch');
});
test('sharp selloff while Risk-On is also a divergence',()=>{
 const d=mk({spBefore:3,spNow:3,spyPrior:100,spyNow:97});const r=evaluate(d,'sp');
 assert.equal(r.kind,'divergence');assert.match(r.headline,/selloff/);
});
test('sharp selloff in Risk-Off is aligned',()=>{
 const d=mk({spBefore:10,spNow:11,spyPrior:100,spyNow:97});assert.equal(evaluate(d,'sp').kind,'aligned');
});
test('one-day price movement below 2% does not alert',()=>{
 const d=mk({spyPrior:100,spyNow:101.99});assert.equal(evaluate(d,'sp').kind,'neutral');
});
test('exact ±2% is flagged by the rule',()=>{
 const d1=mk({spyPrior:100,spyNow:102});assert.equal(evaluate(d1,'sp').kind,'divergence');
 const d2=mk({spBefore:2,spNow:3,spyPrior:100,spyNow:98});assert.equal(evaluate(d2,'sp').kind,'divergence');
});
test('stale price session never displays an invented result',()=>{
 const d=mk();d.price_moves.session='2026-11-20';assert.equal(evaluate(d,'sp').kind,'unavailable');
});
test('stale previous date never compares to a different risk day',()=>{
 const d=mk();d.price_moves.previous_session='2026-11-19';assert.equal(evaluate(d,'sp').kind,'unavailable');
});
test('price move must reconcile with published prior and latest close',()=>{
 const d=mk();d.price_moves.spy.change_pct=7.5;assert.equal(evaluate(d,'sp').kind,'unavailable');
 const d2=mk();d2.moving_averages.spy.close=721.30;assert.equal(evaluate(d2,'sp').kind,'unavailable');
});
test('missing EOD close removes the alert, not the rest of dashboard',()=>{
 const d=mk();delete d.price_moves.spy;assert.equal(evaluate(d,'sp').kind,'unavailable');
});
test('unavailable old snapshots have an explicit no-price state',()=>{
 const d=mk();delete d.price_moves;assert.equal(evaluate(d,'sp').kind,'unavailable');
});
test('incomplete current score never fabricates risk regime divergence',()=>{
 const d=mk({spNow:8,spNowAvail:14});assert.equal(evaluate(d,'sp').kind,'uncertain');
});
test('partial previous score is disclosed without assuming improvement',()=>{
 const d=mk({spBefore:10,spBeforeAvail:14});const out=evaluate(d,'sp');
 assert.equal(out.kind,'divergence');assert.match(out.detail,/cannot be determined with certainty/);
});
test('session still open suppresses alert',()=>{
 const d=mk();d.price_moves.status='awaiting_close';assert.equal(evaluate(d,'sp').kind,'unavailable');
});
test('other market available still displays its independent result',()=>{
 const d=mk();d.price_moves.qqq=null;
 assert.equal(evaluate(d,'sp').kind,'divergence');assert.equal(evaluate(d,'nd').kind,'unavailable');
 assert.match(pr.summary(evaluate(d,'sp'),evaluate(d,'nd')).headline,/divergence detected/);
});
