const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const H=require('../docs/insights-history.js');
const common=['oil','usd','tnx','credit','copper','vix_curve'];
const sp=['vix','sp_def','sp_xle','sp_smh','spy_trend','sp_rsi14','rsp_spy','iwm_spy','sp_breadth1d','sp_macd'];
const nd=['vxn','nd_def','nd_xle','nd_smh','qqq_trend','nd_rsi14','qqqe_qqq','iwm_qqq','nd_breadth1d','nd_macd'];
function market(keys,total){
  const scored=[...common,...keys.slice(0,total-6)];
  const signals=Object.fromEntries(scored.map((k,i)=>[k,{state:i<7?'bear':i<9?'warn':'bull',label:i<7?'BEARISH':i<9?'CAUTION':'BULLISH'}]));
  signals.sp_breadth200={state:'bull'};signals.nd_breadth5d={state:'bull'};
  return {total,available:total,score:7,regime:'NEUTRAL',price_risk_status:'none',close:700,metrics:{signals}};
}
const entries=[
  {session:'2026-11-23',previous_session:'2026-11-20',spy:market(sp,15),qqq:market(nd,15)},
  {session:'2026-11-24',previous_session:'2026-11-23',spy:market(sp,16),qqq:market(nd,16)}
];
test('one timeline from saved records, 15- and 16-point scores remain intact',()=>{
  const rows=H.chartRows(entries,{market:'spy',range:'all'});
  assert.deepEqual(rows.map(r=>[r.date,r.spy.score,r.spy.total,r.spy.close]),[['2026-11-23',8,15,700],['2026-11-24',9,16,700]]);
  const model=H.heatmapModel(rows,'spy');
  assert.deepEqual(model.columns.map(c=>[c.bull,c.warn,c.bear,c.missing,c.matches]),[[6,2,7,0,true],[7,2,7,0,true]]);
  const macd=model.groups[0].rows.find(r=>r.id==='sp_macd');
  assert.equal(macd.cells[0].state,'legacy');
  assert.equal(macd.cells[1].state,'bull');
  assert.equal(model.groups.flatMap(g=>g.rows).length,16);
  assert(!model.groups.flatMap(g=>g.rows).some(r=>r.id==='sp_breadth200'));
});
test('QQQ only; missing signals are unavailable, not bearish or legacy',()=>{
  const rows=H.chartRows(entries,{market:'qqq',range:'all'});
  delete rows[1].qqq.metrics.signals.vxn;
  const model=H.heatmapModel(rows,'qqq',1);
  assert.equal(model.columns.length,1);assert.equal(model.columns[0].matches,false);
  assert.equal(model.columns[0].missing,1);
  assert.equal(model.groups[0].rows.find(r=>r.id==='vxn').cells[0].label,'Unavailable');
  assert(!model.groups.flatMap(g=>g.rows).some(r=>r.id==='vix'||r.id==='nd_breadth5d'));
});
test('history HTML provides a single chart and heatmap; old secondary renderer removed',()=>{
  const html=fs.readFileSync('docs/insights-history.html','utf8');
  const extra=fs.readFileSync('docs/market-insights-extra.js','utf8');
  assert.equal((html.match(/id="j-score-chart"/g)||[]).length,1);
  assert.equal((html.match(/id="j-heatmap"/g)||[]).length,1);
  assert(!extra.includes('mi-history-analytics'));
  assert(html.includes('Not scored · legacy model'));
});
