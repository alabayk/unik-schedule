const $ = (s) => document.querySelector(s);
const fmtDay = new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short'});
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
  $('#range').textContent=`${fmtRange.format(monday)} — ${fmtRange.format(addDays(monday,6))}`;
  const weekNo=academicWeek(monday);
  $('#week-type').textContent=`${weekNo} неделя`;
  $('#days').innerHTML='';
  dayNames.forEach((name,i)=>{const d=addDays(monday,i),b=document.createElement('button');b.className=i===selected?'active':'';b.innerHTML=`<span>${name}</span><strong>${d.getDate()}</strong>`;b.onclick=()=>{selected=i;renderDays();renderLessons()};$('#days').append(b)});
}

function renderLessons(){
  const root=$('#lessons'), date=iso(addDays(monday,selected));root.innerHTML='';
  const rows=lessons.filter(x=>x.date===date);
  $('#status').hidden=true;
  if(!rows.length){root.innerHTML=`<div class="empty"><b>Свободный день</b>${ruDate(addDays(monday,selected))}</div>`;return}
  rows.forEach(x=>{const node=$('#lesson-template').content.firstElementChild.cloneNode(true);node.classList.add(x.source);node.tabIndex=0;node.setAttribute('role','button');node.querySelector('.time strong').textContent=x.start;node.querySelector('.time span').textContent=x.end;node.querySelector('.uni').textContent=x.source==='fa'?'Финунивер':'МГТУ';node.querySelector('.kind').textContent=shortKind(x.type);node.querySelector('h2').textContent=x.title;node.querySelector('.place').textContent=[x.room,x.building].filter(Boolean).join(' · ');node.querySelector('.teacher').textContent=x.teacher||'Преподаватель не указан';node.onclick=()=>openSheet(x);node.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openSheet(x)}};root.append(node)});
}
function shortKind(v=''){if(/лаб/i.test(v))return'Лабораторная';if(/лек/i.test(v))return'Лекция';if(/сем|практ/i.test(v))return'Семинар';return v||'Занятие'}
function openSheet(x){const wrap=$('#sheet');$('#sheet-uni').textContent=x.source==='fa'?'Финунивер':'МГТУ';$('#sheet-kind').textContent=shortKind(x.type);$('#sheet-title').textContent=x.title;$('#sheet-time').textContent=`${x.start} — ${x.end} · ${ruDate(addDays(monday,selected))}`;$('#sheet-teacher').textContent=x.teacher||'Не указан';$('#sheet-place').textContent=[x.room,x.building].filter(Boolean).join(' · ')||'Не указано';wrap.hidden=false;requestAnimationFrame(()=>wrap.classList.add('open'));document.body.classList.add('locked')}
function closeSheet(){const wrap=$('#sheet');wrap.classList.remove('open');document.body.classList.remove('locked');setTimeout(()=>wrap.hidden=true,220)}
$('#sheet-close').onclick=closeSheet;$('.sheet-backdrop').onclick=closeSheet;document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#sheet').hidden)closeSheet()});

async function load(){
  renderDays();$('#status').hidden=false;$('#status').className='status';$('#status').textContent='Обновляем расписание…';
  try{const r=await fetch(`/api/schedule?start=${iso(monday)}&finish=${iso(addDays(monday,6))}`);if(!r.ok)throw Error();const data=await r.json();lessons=data.lessons;localStorage.setItem(`week:${iso(monday)}`,JSON.stringify(lessons));renderLessons();if(data.errors.length){$('#status').hidden=false;$('#status').className='status error';$('#status').textContent='Один из источников временно недоступен'}}
  catch{const cached=localStorage.getItem(`week:${iso(monday)}`);lessons=cached?JSON.parse(cached):[];renderLessons();if(!cached){$('#status').hidden=false;$('#status').className='status error';$('#status').textContent='Не удалось загрузить расписание'}}
}
$('#prev').onclick=()=>{monday=addDays(monday,-7);selected=0;load()};
$('#next').onclick=()=>{monday=addDays(monday,7);selected=0;load()};
$('#today').onclick=()=>{monday=startOfWeek(new Date());selected=(new Date().getDay()+6)%7;load()};
if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js');
load();
