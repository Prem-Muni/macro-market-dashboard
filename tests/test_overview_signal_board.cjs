const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const api=require("../docs/overview-signal-board.js");
const source=fs.readFileSync(require.resolve("../docs/app.js"),"utf8");
// Execute the actual display helpers, not a duplicate scoring algorithm.
const helpers=vm.runInNewContext(source.slice(0,source.indexOf("let snapshot="))+"\n({scoreFormat,regimeHealth,invertedRange,rangeText})");
const d=JSON.parse(fs.readFileSync(require.resolve("../docs/data/latest.json"),"utf8"));
test("all saved signal labels and states are copied, no invented values or put/call",()=>{
 const rows=api.build(d,helpers);
 const tiles=rows.filter(r=>!r.title.endsWith("Summary")).flatMap(r=>r.cells);
 assert.equal(tiles.length,29);
 assert.deepEqual(new Set(tiles.map(c=>c.key)),new Set([...d.order.shared,...d.order.sp500,...d.order.nasdaq100]));
 for(const c of tiles){const saved=d.signals[c.key];const state=saved?.state==="wash"?"bear":["bull","bear","warn","info"].includes(saved?.state)?saved.state:"na";assert.equal(c.state,state);assert.equal(c.label,state==="na"?"Unavailable":saved.label||state);}
 if(Number.isFinite(d.signals.sp_breadth200?.value))assert.equal(tiles.find(c=>c.key==="sp_breadth200").value,d.signals.sp_breadth200.value.toFixed(2)+"%");
 assert.equal(tiles.filter(c=>c.info).length,3);
});
test("score and signed momentum use the same app formatters; no data mutation",()=>{
 const before=JSON.stringify(d),rows=api.build(d,helpers);
 for(const [i,k] of [[0,"sp500"],[3,"nasdaq100"]]){
  const m=d.markets[k],c=rows[i].cells;
  assert.equal(c[0].label,helpers.scoreFormat(m.score));
  assert.equal(c[0].value,helpers.regimeHealth(m.score));
  assert.equal(c[1].label,m.momentum.state);
  assert.ok(c[1].value.includes("1D "+helpers.rangeText(helpers.invertedRange(m.momentum.d1_range))));
  assert.ok(c[1].value.includes("5D "+helpers.rangeText(helpers.invertedRange(m.momentum.d5_range))));
 }
 assert.equal(JSON.stringify(d),before);
});
test("missing readings stay unavailable; partial score retains range",()=>{
 const x=JSON.parse(JSON.stringify(d));delete x.signals.vxn;x.markets.nasdaq100.score={bearish:10,available:15,total:16,complete:false};
 const rows=api.build(x,helpers);
 assert.equal(rows[4].cells.find(c=>c.key==="vxn").state,"na");
 assert.equal(rows[3].cells[0].label,"5–6/16");
 assert.equal(rows[3].cells[0].value,"INCOMPLETE");
});

test("reference layout balances lanes without dropping or duplicating indicators",()=>{const groups=api.build(d,helpers);assert.deepEqual(groups.map(g=>api.splitRows(g).map(r=>r.length)),[[4],[7,5],[6],[4],[7,4]]);for(const g of groups)assert.deepEqual(api.splitRows(g).flat(),g.cells);});

test("confirmation and swing colors follow Thinkorswim labels",()=>{const x=JSON.parse(JSON.stringify(d));x.markets.sp500.confirmation={confirmed:3,available:4,total:4};x.markets.sp500.swing="SELECTIVE";x.markets.nasdaq100.swing="EARLY IMPROVEMENT";const rows=api.build(x,helpers);assert.equal(rows[0].cells[2].state,"bull");assert.equal(rows[0].cells[2].label,"3/4 BROAD");assert.equal(rows[0].cells[3].state,"warn");assert.equal(rows[3].cells[3].state,"warn");});
