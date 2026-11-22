const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../static/app.js'),'utf8');
class Area {
  constructor(){this.handlers={};this.style={};this.captures=[];this.classes=new Set();this.classList={add:x=>this.classes.add(x),remove:x=>this.classes.delete(x)};}
  addEventListener(type,fn,capture){(this.handlers[type]??=[]).push({fn,capture:!!capture});}
  setPointerCapture(id){this.captures.push(id);}
  emit(type,values={}){
    const e={pointerType:'mouse',pointerId:1,button:0,buttons:type==='pointerup'?0:1,clientX:100,clientY:100,prevented:false,stopped:false,
      target:{closest:()=>null},preventDefault(){this.prevented=true;},stopPropagation(){},stopImmediatePropagation(){this.stopped=true;},...values};
    const handlers=this.handlers[type]||[];
    for(const h of [...handlers.filter(x=>x.capture),...handlers.filter(x=>!x.capture)]){h.fn(e);if(e.stopped)break;}
    return e;
  }
}
function setup(existingTouch=false){
  const area=new Area(),window=new Area(),timers=[],changes=[],animations=[];
  window.PointerEvent=function(){};
  const context={window,weekRail:area,setTimeout:fn=>timers.push(fn),animateIn:(...args)=>animations.push(args)};
  if(existingTouch)vm.runInNewContext(source.slice(source.indexOf('if(window.PointerEvent){'),source.indexOf('// Mouse-only enhancement')),context);
  vm.runInNewContext(source.slice(source.indexOf('function mouseSlides('),source.indexOf('mouseSlides(weekRail,weekRail')),context);
  context.mouseSlides(area,area,step=>changes.push(step),'button');
  return {area,window,changes,animations,flush(){while(timers.length)timers.shift()();}};
}
{
  const x=setup(true);x.area.emit('pointerdown');x.area.emit('pointerup');
  assert.equal(x.area.captures.length,0,'a stationary mouse click must stay targeted at the day button');
  assert.equal(x.area.emit('click').prevented,false);
  x.area.emit('pointerdown',{pointerType:'touch'});
  assert.equal(x.area.captures.length,1,'existing mobile pointer capture must remain intact');
}
{
  const x=setup();x.area.emit('pointerdown');x.area.emit('pointermove',{clientX:96});x.area.emit('pointerup',{clientX:96});
  assert.equal(x.area.captures.length,0);assert.equal(x.area.emit('click').prevented,false);
  x.area.emit('pointerdown');x.area.emit('pointermove',{clientX:30});assert.equal(x.area.captures.length,1);
  x.area.emit('pointerup',{clientX:30});assert.equal(x.area.emit('click').prevented,true,'drag must not open a lesson');
  x.flush();assert.deepEqual(x.changes,[1]);assert.equal(x.animations[0][1],85);
  x.area.emit('pointerdown');x.area.emit('pointerup');assert.equal(x.area.emit('click').prevented,false,'the next real click must work');
  x.area.emit('pointerdown');x.area.emit('pointermove',{clientX:180});x.area.emit('pointerup',{clientX:180});x.flush();
  assert.deepEqual(x.changes,[1,-1]);assert.equal(x.animations[1][1],-85);
}
{
  const x=setup();x.area.emit('pointerdown',{button:2});x.area.emit('pointermove',{clientX:5});x.area.emit('pointerup',{clientX:5});x.flush();assert.equal(x.changes.length,0);
  x.area.emit('pointerdown',{target:{closest:()=>({})}});x.area.emit('pointermove',{clientX:5});x.area.emit('pointerup',{clientX:5});x.flush();assert.equal(x.changes.length,0,'controls outside the rail must not start a slide');
  x.area.emit('pointerdown');x.area.emit('pointermove',{clientY:170});x.area.emit('pointerup',{clientY:170});x.flush();assert.equal(x.changes.length,0);
  x.area.emit('pointerdown');x.area.emit('pointermove',{clientX:60});x.area.emit('pointercancel');assert.equal(x.area.style.transform,'translateX(0)');assert.equal(x.area.classes.size,0);
  x.area.emit('pointerdown',{pointerType:'touch'});x.area.emit('pointermove',{pointerType:'touch',clientX:20});x.area.emit('pointerup',{pointerType:'touch',clientX:20});x.flush();assert.equal(x.changes.length,0,'mouse enhancement must ignore touch');
}
{
  const context={document:{createElement:()=>({})}};
  vm.runInNewContext(source.slice(source.indexOf('function plural('),source.indexOf('function scrollToLesson(')),context);
  const callback=()=>{};
  assert.equal(context.insight('next','time','title','location',callback).onclick,callback);
  assert.equal(context.insight('tomorrow','time','title',callback).onclick,callback);
}
console.log('Mouse clicks, drag directions, cancellation and touch-isolation checks passed');
