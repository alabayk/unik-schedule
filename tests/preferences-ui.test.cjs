const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const ids=new Map(),events={},timers=[],storage=new Map();let focused=null,posted=false,calendarItems=[];
class Element {
  constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.hidden=false;this.classList={add(){},remove(){}};}
  set id(value){this._id=value;ids.set(value,this);}get id(){return this._id;}
  append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;}
  setAttribute(){}before(){}focus(){focused=this;}select(){}
  querySelectorAll(){return this.children.flatMap(x=>[x,...(x.children||[])]).filter(x=>['button','input','select'].includes(x.tagName));}
}
const main=new Element('main');for(const id of ['insights','calendar-state','week-calendar','lesson-calendar','calendar-add','sheet']){const el=new Element('div');el.id=id;}
ids.get('sheet').hidden=true;
const fixture={id:'fa-42',source:'fa',date:'2026-10-20',start:'10:10',end:'11:40',title:'Английский',teacher:'Фирсова',room:'308',building:'Москва',type:'Семинар'};
const doc={createElement:tag=>new Element(tag),getElementById:id=>ids.get(id)||null,body:new Element('body'),visibilityState:'visible',
  activeElement:null,addEventListener:(name,fn)=>events[name]=fn,querySelector:q=>q==='main'?main:{value:'30'}};
const context={console,URL,URLSearchParams,File,document:doc,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  location:{href:'https://example.test/',origin:'https://example.test',reload(){}},navigator:{userAgent:'Android',canShare:()=>true,share:async()=>{}},isAndroid:true,
  setTimeout:fn=>timers.push(fn),window:{fetch:async()=>({ok:false}),addEventListener(){}},
  lessons:[fixture],selectedLesson:fixture,monday:new Date('2026-10-19T12:00:00'),iso:d=>d.toISOString().slice(0,10),addDays:(d,n)=>new Date(+d+n*86400000),
  calOpen(items){calendarItems=items;context.calendarItems=items;},calClose(){},closeSheet(){},buildIcs:()=> 'BEGIN:VCALENDAR\r\nEND:VCALENDAR',postCalendar(){posted=true;}};
context.fetch=(...args)=>context.window.fetch(...args);context.calendarItems=calendarItems;
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../static/preferences.js'),'utf8'),context);
events.DOMContentLoaded();
assert.ok(main.children.some(x=>x.className==='preferences-footer'),'settings button is appended below content');
ids.get('lesson-calendar').onclick();
(async()=>{
  await ids.get('calendar-add').onclick();
  assert.ok(storage.has('calendar-pending-v1'));
  assert.equal(Object.keys(JSON.parse(storage.get('calendar-tracking-v1')||'{}')).length,0,'handoff must not confirm an import');
  while(timers.length)timers.shift()();
  const panel=ids.get('preferences-menu').children[1];
  const yes=panel.children.find(x=>x.textContent==='Да, добавили');assert.ok(yes);yes.onclick();
  const tracked=Object.values(JSON.parse(storage.get('calendar-tracking-v1')));
  assert.equal(tracked.length,1);assert.equal(tracked[0].baseline[0].id,'fa-42');
  assert.equal(storage.has('calendar-pending-v1'),false);
  ids.get('lesson-calendar').onclick();assert.equal(ids.get('calendar-state').textContent,'Уже добавили');
  main.children.at(-1).children[0].onclick();
  const select=ids.get('english-teacher-select');assert.ok(select);assert.equal(select.children[0].value,'Фирсова');
  console.log('Settings, confirmation and import UI checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
