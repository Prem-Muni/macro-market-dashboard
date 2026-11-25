'use strict';
const assert=require('node:assert/strict');
const Summaries=require('../docs/daily-summaries.js');
const now='2026-11-24',yesterday='2026-11-23';
const changes={from_session:yesterday,to_session:now,groups:{
  shared:{eased:[{label:'Credit HYG/IEF'}],new_bearish:[{label:'Copper'}],other:[{label:'USD divergence'}]},
  sp:{eased:[{label:'IWM/SPY 10D'},{label:'Breadth 1D'},{label:'MACD'}],new_bearish:[]},
  nd:{eased:[],new_bearish:[{label:'QQQE/QQQ 10D'}]}
}};
const r=Summaries.internalsFromChanges(changes,now,yesterday);
assert.equal(r.available,true);
assert.equal(r.improvedCount,4);
assert.equal(r.worsenedCount,2);
assert.equal(r.otherCount,1);
assert.match(r.improved,/Shared macro: Credit HYG\/IEF/);
assert.match(r.improved,/SPY: IWM\/SPY 10D, Breadth 1D \+1 more/);
assert.match(r.worsened,/QQQ: QQQE\/QQQ 10D/);
assert.equal(Summaries.internalsFromChanges(changes,'2026-11-25',yesterday).available,false);
assert.equal(Summaries.internalsFromChanges(changes,now,'2026-11-22').available,false);
assert.equal(Summaries.internalsFromChanges({status:'unavailable',groups:{}},now,yesterday).available,false);
assert.equal(Summaries.internalsFromChanges({status:'complete',groups:changes.groups},now,yesterday).available,true);
assert.equal(Summaries.internalsFromChanges({status:'partial',groups:changes.groups},now,yesterday).partial,true);
const onlyOthers={from_session:yesterday,to_session:now,groups:{shared:{other:[{label:'Breadth state changed'}]},sp:{},nd:{}}};
const other=Summaries.internalsFromChanges(onlyOthers,now,yesterday);
assert.equal(other.available,true);assert.equal(other.improvedCount,0);assert.equal(other.worsenedCount,0);assert.equal(other.otherCount,1);
const archiveRecord={session:now,previous_session:yesterday,signal_changes:{status:'complete',groups:changes.groups},
  spy:{total:16,available:16,score:11,close:718.78,price_change_pct:-.49},
  qqq:{total:16,available:16,score:11,close:638.10,price_change_pct:-1.99}};
const snapshot={session:now,markets:{sp500:{score:{total:16,available:16,bearish:11}},nasdaq100:{score:{total:16,available:16,bearish:11}}},
  price_moves:{status:'complete',session:now,previous_session:yesterday,spy:{close:718.78,change_pct:-.49},qqq:{close:638.10,change_pct:-1.99}},
  signal_changes:changes,market_insights_history:{version:1,entries:[archiveRecord]}};
const latest=Summaries.latestSummary(snapshot);
assert.equal(latest.session,now);
assert.equal(latest.internals.improvedCount,4);
assert.equal(Summaries.savedSummaries(snapshot)[0].internals.worsenedCount,2);
const exported=Summaries.csv(Summaries.savedSummaries(snapshot));
assert.match(exported,/Improved internals/);
assert.match(exported,/SPY: IWM\/SPY 10D/);
const noCurrent={...snapshot,signal_changes:{from_session:'2026-11-22',to_session:yesterday,groups:changes.groups}};
assert.equal(Summaries.latestSummary(noCurrent).internals.improvedCount,4,'must fall back to aligned saved history');
const noGood={...snapshot,signal_changes:{from_session:'2026-11-22',to_session:yesterday,groups:changes.groups},market_insights_history:{version:1,entries:[]}};
assert.equal(Summaries.latestSummary(noGood).internals.available,false,'must not present stale change data');
console.log('Internal-change recap: 17 assertions passed.');
