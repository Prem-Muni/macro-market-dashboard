'use strict';
// Isolated DOM-free sanity checks of the new rendering code.
const fs=require('fs');
const vm=require('vm');
const assert=require('assert');
const source=fs.readFileSync(__dirname+'/../docs/app.js','utf8');
const begin=source.indexOf('function renderQqqRisk(data){');
const end=source.indexOf('// EOD SMA and RSI context;',begin);
assert(begin>=0&&end>begin,'Renderer found');
class Element {
 constructor(tag){this.tagName=tag;this.children=[];this.textContent='';this.className='';}
 append(...children){this.children.push(...children);}
 appendChild(child){this.children.push(child);return child;}
 replaceChildren(...children){this.children=children;this.textContent='';}
}
const ids={};
for(const id of ['qqq-risk-year','qqq-risk-20m','qqq-risk-halves'])ids[id]=new Element('div');
const context={document:{createElement:tag=>new Element(tag)},$:(id)=>ids[id]||null};
vm.createContext(context);
vm.runInContext(source.substring(begin,end),context);
const group={days:3,forward5_observations:2,forward5_mean_pct:1.2,forward5_median_pct:1.1,forward5_stddev_pct:2.3,forward5_p10_pct:-1.8,forward5_worst_pct:-2.4,forward5_worst_close_pct:-3.1,forward5_positive_pct:50,nonoverlap_observations:1,nonoverlap_median_pct:-2.4,nonoverlap_positive_pct:0};
const groups=Object.fromEntries(['zero_to_four','exactly_five','five_improving','five_stable','five_deteriorating','selective'].map(k=>[k,group]));
const half={label:'Earlier 10 months',start:'2025-03-20',end:'2026-01-19',sessions:200,groups};
context.renderQqqRisk({backtest:{year:{qqq_risk:{groups}},twenty_months:{qqq_risk:{groups,halves:[half,{...half,label:'Later 10 months',start:'2026-01-20',end:'2026-11-20'}]}}}});
const findTexts=(node)=>[node.textContent,...node.children.flatMap(findTexts)].filter(Boolean);
const text=findTexts(ids['qqq-risk-year']).join(' ');
for(const expected of ['0–4 (baseline)','5 + improving','Median 5D','Worst 5D','1.1%','-3.1%','non-overlapping'])assert(text.includes(expected),expected);
const other=findTexts(ids['qqq-risk-halves']).join(' ');
assert(other.includes('Earlier 10 months')&&other.includes('Later 10 months'));
context.renderQqqRisk({});
assert(findTexts(ids['qqq-risk-year']).join(' ').includes('Awaiting'));
console.log('PASS: QQQ risk validation tables, chronological split, percentages, and no-data state');
