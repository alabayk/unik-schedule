const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const fixture = {id:'fa-1',source:'fa',date:'2026-10-20',start:'10:10',end:'11:40',title:'Английский',teacher:'Фирсова',room:'308',building:'Москва',type:'Семинар'};
const baseline = {...fixture};
const storage = new Map([['calendar-tracking-v1',JSON.stringify({week:{teacher:'Фирсова',scope:'week',start:'2026-10-19',finish:'2026-10-25',baseline:[baseline],current:[baseline],changes:[],dismissed:true}})]]);
let response, requested;
const makeContext = () => ({URL,URLSearchParams,console,setTimeout,location:{href:'https://example.test/',origin:'https://example.test'},
  document:{addEventListener(){}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
  window:{fetch:async url=>{requested=url;return {ok:true,clone:()=>({json:async()=>response})};}}});
let context=makeContext();
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../static/preferences.js'),'utf8'),context);
const state=()=>JSON.parse(storage.get('calendar-tracking-v1')).week;
async function request(data, suffix='') {response=data;await context.window.fetch('https://example.test/api/schedule?start=2026-10-19&finish=2026-10-26'+suffix);await new Promise(resolve=>setImmediate(resolve));}
(async()=>{
  await request({lessons:[],errors:[{source:'fa'}]});
  assert.equal(state().dismissed,true,'source failure must not warn about cancellations');
  assert.equal(state().current.length,1);
  await request({lessons:[{...fixture,start:'11:50'}],errors:[],englishTeachers:['Фирсова','Иванова']});
  assert.equal(state().dismissed,false);
  assert.equal(state().changes.length,1);
  const saved=JSON.parse(storage.get('calendar-tracking-v1'));saved.week.dismissed=true;storage.set('calendar-tracking-v1',JSON.stringify(saved));
  // Reload simulates closing and reopening the PWA after dismissing the notice.
  context=makeContext();
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../static/preferences.js'),'utf8'),context);
  await request({lessons:[{...fixture,start:'11:50'}],errors:[]});
  assert.equal(state().changes.length,1);
  assert.equal(state().dismissed,true,'the same response must not re-show a dismissed notice');
  await request({lessons:[{...fixture,start:'11:50',room:'402'}],errors:[]});
  assert.equal(state().dismissed,false,'a later change must create a new notice');
  assert.equal(requested.searchParams.get('teacher'),'Фирсова');
  await request({lessons:[],errors:[]},'&teacher=Иванова');
  assert.equal(requested.searchParams.get('teacher'),'Иванова','explicit historical teacher must be preserved');
  assert.equal(state().current.length,1,'changing the selected teacher must not cancel older exports');
  console.log('Calendar tracking checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
