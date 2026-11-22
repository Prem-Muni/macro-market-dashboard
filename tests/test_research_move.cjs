const fs=require('fs'),assert=require('assert'),path=require('path');
const root=path.join(__dirname,'..','docs');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const logic=fs.readFileSync(path.join(root,'threshold-logic.html'),'utf8');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const research=fs.readFileSync(path.join(root,'threshold-logic.js'),'utf8');
const ids=['year-sp-backtest','year-nd-backtest','twenty_months-sp-backtest','twenty_months-nd-backtest','qqq-risk-year','qqq-risk-20m','qqq-risk-halves'];
for(const id of ids){assert(!index.includes(`id="${id}"`),`Dashboard still has ${id}`);assert(logic.includes(`id="${id}"`),`Scoring Logic missing ${id}`)}
assert(!/renderBacktest\(data\);/.test(app));
assert(!/renderQqqRisk\(data\);/.test(app));
assert(/renderBacktest\(data\);/.test(research));
assert(/renderQqqRisk\(data\);/.test(research));
assert(logic.includes('id="rolling-research"'));
assert(index.includes('id="history-svg"'));
assert(index.includes('id="fear-history-svg"'));
assert(index.includes('id="nd-borderline"'));
assert(/November 20, 2026|2026-11-20/.test(logic));
console.log('Moved both live research panels to Scoring Logic; dashboard scoring/chart widgets preserved.');
