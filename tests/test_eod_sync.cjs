'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const nodes={};
function node(id){return nodes[id]??={textContent:'',className:'',style:{},classList:{toggle(){},add(){},remove(){}},addEventListener(){},setAttribute(){}};}
const document={getElementById:node,addEventListener(){},createElementNS(){return node('svg')},createElement(){return node('div')},hidden:false};
const context=vm.createContext({document,window:{addEventListener(){}},fetch:async()=>{throw Error('offline test only')},console,Date,Number,String,Object,Array,Set,Intl});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../docs/app.js'),'utf8'),context);
test('previous EOD session is stale after regular close',()=>{
 const got=vm.runInContext("eodStatus('2026-11-23', new Date('2026-11-25T01:15:00Z'))",context);
 assert.equal(got.kind,'pending');assert.equal(got.lag,1);
});
test('latest completed session is current after close',()=>{
 const got=vm.runInContext("eodStatus('2026-11-24', new Date('2026-11-25T01:15:00Z'))",context);
 assert.equal(got.kind,'current');
});
test('stock market holiday does not make old session stale',()=>{
 const got=vm.runInContext("eodStatus('2026-11-25', new Date('2026-11-26T23:00:00Z'))",context);
 assert.equal(got.kind,'current');
});
