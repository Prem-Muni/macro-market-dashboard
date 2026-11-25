const {test}=require('node:test');
const assert=require('node:assert/strict');
const S=require('../docs/daily-summaries.js');
const baseMarket=(score,total,available,price,delta,trend='STABLE')=>({score,total,available,close:price?1:null,price_change_pct:price,score_delta_1d:delta,trend_5d:trend});
const archived=[
 {session:'2026-11-20',previous_session:'2026-11-19',baseline:true,spy:baseMarket(11,15,15,null,-1),qqq:baseMarket(11,15,15,null,1)},
 {session:'2026-11-23',previous_session:'2026-11-20',spy:baseMarket(11,16,16,4.71,-1),qqq:baseMarket(12,16,16,7,0)}
];
const current={session:'2026-11-24',price_moves:{status:'complete',session:'2026-11-24',previous_session:'2026-11-23',spy:{close:719,change_pct:1.1},qqq:{close:655,change_pct:.5}},markets:{sp500:{score:{total:16,available:15,bearish:11},momentum:{state:'UNCERTAIN'}},nasdaq100:{score:{total:16,available:15,bearish:11},momentum:{state:'STABLE'}}},market_insights_history:{version:1,entries:archived}};
test('latest 24th is separate from archived 23rd and displays incomplete score honestly',()=>{
 const latest=S.latestSummary(current); assert.equal(latest.session,'2026-11-24');
 assert.equal(S.scoreText(latest.spy),'4–5/16');assert.equal(latest.spy.risk,'RISK-OFF');
 assert.equal(latest.partial,true);
 const previous=S.previousSummaries(current);assert.deepEqual(previous.map(x=>x.session),['2026-11-23','2026-11-20']);
});
test('November 23 price/risk alert remains archived',()=>{
 const mon=S.previousSummaries(current)[0];
 assert.equal(mon.alertCount,2);assert.match(mon.alertHeadline,/both ETFs/);
 assert.equal(S.signed(mon.spy.pct),'+4.71%');assert.equal(S.signed(mon.qqq.pct),'+7.00%');
 assert.equal(S.scoreText(mon.spy),'5/16');assert.equal(S.scoreText(mon.qqq),'4/16');
});
test('baseline is not presented with invented prior-day return',()=>{
 const fri=S.previousSummaries(current)[1];assert.equal(fri.origin,'screenshot_baseline');
 assert.equal(fri.spy.pct,null);assert.equal(fri.spy.alert.kind,'baseline');assert.equal(fri.alertCount,0);
});
test('next completed session archives day before when existing EOD journal saves it',()=>{
 const next=JSON.parse(JSON.stringify(current));
 next.market_insights_history.entries.push({session:'2026-11-24',previous_session:'2026-11-23',spy:baseMarket(11,16,15,1.1,null),qqq:baseMarket(11,16,15,.5,null)});
 next.session='2026-11-25';next.price_moves={status:'awaiting_close'};
 const previous=S.previousSummaries(next);assert.deepEqual(previous.map(x=>x.session),['2026-11-24','2026-11-23','2026-11-20']);
 assert.equal(S.latestSummary(next).session,'2026-11-25');
});
test('no invented prior entries if source journal has gaps',()=>{
 const noArchive={...current,market_insights_history:{version:1,entries:[]}};
 assert.deepEqual(S.previousSummaries(noArchive),[]);
});
test('same-session archive can preserve valid price change when latest price source is temporarily missing',()=>{
 const copy=JSON.parse(JSON.stringify(current));copy.market_insights_history.entries.push({session:'2026-11-24',previous_session:'2026-11-23',spy:baseMarket(11,16,15,1.1,null),qqq:baseMarket(11,16,15,.5,null)});
 copy.price_moves={status:'awaiting_close'};
 const now=S.latestSummary(copy);assert.equal(now.spy.pct,1.1);assert.equal(now.qqq.pct,.5);assert.equal(now.alertCount,0);
});
test('archive exporter includes dates and escapes formula strings',()=>{
 const csv=S.csv(S.previousSummaries(current));assert.match(csv,/2026-11-23/);assert.match(csv,/4\.71/);
});
