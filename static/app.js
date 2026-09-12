const $ = (s) => document.querySelector(s);
const fmtRange = new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long'});
const dayNames = ['пн','вт','ср','чт','пт','сб','вс'];
let monday = startOfWeek(new Date());
let selected = sameWeek(new Date(),monday) ? (new Date().getDay()+6)%7 : 0;
let lessons = [];


function startOfWeek(d){const x=new Date(d);x.setHours(12,0,0,0);x.setDate(x.getDate()-((x.getDay()+6)%7));return x}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function iso(d){return d.toISOString().slice(0,10)}
function sameWeek(a,b){return iso(startOfWeek(a))===iso(startOfWeek(b))}
function ruDate(d){return d.toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'})}
function academicWeek(d){const year=d.getMonth()>=8?d.getFullYear():d.getFullYear()-1;const first=startOfWeek(new Date(year,8,1));return Math.floor((startOfWeek(d)-first)/604800000)+1}


function renderDays(){
  $('#range').textContent=fmtRange.format(monday)+' — '+fmtRange.format(addDays(monday,6));
  const weekNo=academicWeek(monday);$('#week-type').textContent=weekNo+' неделя';$('#days').innerHTML='';
  dayNames.forEach((name,i)=>{const d=addDays(monday,i),b=document.createElement('button');b.className=i===selected?'active':'';b.innerHTML='<span>'+name+'</span><strong>'+d.getDate()+'</strong>';b.onclick=()=>{selected=i;renderDays();renderLessons()};$('#days').append(b)});
}
function renderLessons(){
  const root=$('#lessons'),date=iso(addDays(monday,selected));root.innerHTML='';const rows=lessons.filter(x=>x.date===date);$('#status').hidden=true;
  if(!rows.length){root.innerHTML='<div class="empty"><b>Свободный день</b>'+ruDate(addDays(monday,selected))+'</div>';return}
  rows.forEach(x=>{const node=$('#lesson-template').content.firstElementChild.cloneNode(true);node.classList.add(x.source);node.tabIndex=0;node.setAttribute('role','button');node.querySelector('.time strong').textContent=x.start;node.querySelector('.time span').textContent=x.end;node.querySelector('.uni').textContent=x.source==='fa'?'Финунивер':'МГТУ';node.querySelector('.kind').textContent=shortKind(x.type);node.querySelector('h2').textContent=x.title;node.querySelector('.place').textContent=[x.room,x.building].filter(Boolean).join(' · ');node.querySelector('.teacher').textContent=x.teacher||'Преподаватель не указан';node.onclick=()=>openSheet(x);node.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openSheet(x)}};root.append(node)});
}
function shortKind(v=''){if(/лаб/i.test(v))return'Лабораторная';if(/лек/i.test(v))return'Лекция';if(/сем|практ/i.test(v))return'Семинар';return v||'Занятие'}
function showUpdated(value,cached=false){let el=$('#updated');if(!el){el=document.createElement('p');el.id='updated';el.className='updated';el.style.cssText='text-align:center;color:#8a8f97;font-size:12px;margin:-4px 0 10px';$('#status').after(el)}if(!value){el.hidden=true;return}const d=new Date(value);el.hidden=false;el.textContent=(cached?'Сохранено ':'Обновлено ')+d.toLocaleDateString('ru-RU',{day:'numeric',month:'short'})+' в '+d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}
function openSheet(x){const wrap=$('#sheet');$('#sheet-uni').textContent=x.source==='fa'?'Финунивер':'МГТУ';$('#sheet-kind').textContent=shortKind(x.type);$('#sheet-title').textContent=x.title;$('#sheet-time').textContent=x.start+' — '+x.end+' · '+ruDate(addDays(monday,selected));$('#sheet-teacher').textContent=x.teacher||'Не указан';$('#sheet-place').textContent=[x.room,x.building].filter(Boolean).join(' · ')||'Не указано';wrap.hidden=false;requestAnimationFrame(()=>wrap.classList.add('open'));document.body.classList.add('locked')}
function closeSheet(){const wrap=$('#sheet');wrap.classList.remove('open');document.body.classList.remove('locked');setTimeout(()=>wrap.hidden=true,220)}
$('#sheet-close').onclick=closeSheet;$('.sheet-backdrop').onclick=closeSheet;document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#sheet').hidden)closeSheet()});


async function load(){
  renderDays();$('#status').hidden=false;$('#status').className='status';$('#status').textContent='Обновляем расписание…';
  const key='week:'+iso(monday),raw=localStorage.getItem(key),parsed=raw?JSON.parse(raw):null;const saved=Array.isArray(parsed)?{lessons:parsed,updatedAt:null}:parsed;
  try{
    const r=await fetch('/api/schedule?start='+iso(monday)+'&finish='+iso(addDays(monday,6)),{cache:'no-store'});if(!r.ok)throw Error();const data=await r.json();
    if(data.errors.length&&saved?.lessons?.length){lessons=saved.lessons;renderLessons();showUpdated(saved.updatedAt,true);$('#status').hidden=false;$('#status').className='status error';$('#status').textContent='Сервер временно недоступен · показано сохранённое расписание';return}
    lessons=data.lessons;localStorage.setItem(key,JSON.stringify({lessons,updatedAt:data.updatedAt}));renderLessons();showUpdated(data.updatedAt);
    if(data.errors.length){$('#status').hidden=false;$('#status').className='status error';$('#status').textContent='Часть расписания временно недоступна'}
  }catch{
    lessons=saved?.lessons||[];renderLessons();showUpdated(saved?.updatedAt,true);$('#status').hidden=false;$('#status').className='status error';$('#status').textContent=saved?.lessons?.length?'Сервер временно недоступен · показано сохранённое расписание':'Сервер временно недоступен';
  }
}
$('#prev').onclick=()=>{monday=addDays(monday,-7);selected=0;load()};
$('#next').onclick=()=>{monday=addDays(monday,7);selected=0;load()};
$('#today').onclick=()=>{monday=startOfWeek(new Date());selected=(new Date().getDay()+6)%7;load()};
if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js');
load();

