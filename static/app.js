const $=s=>document.querySelector(s),fmtRange=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long'}),dayNames=['пн','вт','ср','чт','пт','сб','вс'];let monday=startOfWeek(new Date()),selected=sameWeek(new Date(),monday)?(new Date().getDay()+6)%7:0,lessons=[];
const knownEmails={'Терская Г.А.':'gaterskaya@fa.ru','Косолапова М.В.':'mvkosolapova@fa.ru','Акименко С.В.':'svakimenko@fa.ru','Фирсова И.В.':'ivfirsova@fa.ru','Фирсова Ирина Владленовна':'ivfirsova@fa.ru','Коробов Ю.И.':'yikorobov@fa.ru','Алтухова Н.Ф.':'nfaltuhova@fa.ru','Денежкина И.Е.':'idenezhkina@fa.ru','Гордеев Эдуард Николаевич':'werhorn@yandex.ru','Титов Анатолий Сергеевич':'toliakpurple@gmail.com','Минитаева Алина Мажитовна':'minitaeva@bmstu.ru','Смирнова Елена Валентиновна':'evsmirnova@bmstu.ru'};function emailFor(x){if(x.teacherEmail)return x.teacherEmail;const found=[];for(const name in knownEmails)if((x.teacher||'').includes(name)&&!found.includes(knownEmails[name]))found.push(knownEmails[name]);return found.join(' · ')||'Почта не указана'}
function startOfWeek(d){const x=new Date(d);x.setHours(12,0,0,0);x.setDate(x.getDate()-((x.getDay()+6)%7));return x}function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}function iso(d){return d.toISOString().slice(0,10)}function sameWeek(a,b){return iso(startOfWeek(a))===iso(startOfWeek(b))}function ruDate(d){return d.toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'})}function academicWeek(d){const y=d.getMonth()>=8?d.getFullYear():d.getFullYear()-1;return Math.floor((startOfWeek(d)-startOfWeek(new Date(y,8,1)))/604800000)+1}function lessonDate(x){return new Date(x.date+'T'+x.start+':00')}
function renderDays(){$('#range').textContent=fmtRange.format(monday)+' — '+fmtRange.format(addDays(monday,6));$('#week-type').textContent=academicWeek(monday)+' неделя';$('#days').innerHTML='';dayNames.forEach((n,i)=>{const d=addDays(monday,i),b=document.createElement('button');b.className=i===selected?'active':'';b.innerHTML='<span>'+n+'</span><strong>'+d.getDate()+'</strong>';b.onclick=()=>{selected=i;renderDays();renderLessons()};$('#days').append(b)})}
let showPast=false;function renderLessons(){const root=$('#lessons'),date=iso(addDays(monday,selected)),rows=lessons.filter(x=>x.date===date),today=date===iso(new Date()),now=new Date(),past=today?rows.filter(x=>new Date(x.date+'T'+x.end+':00')<now):[],visible=today&&!showPast?rows.filter(x=>new Date(x.date+'T'+x.end+':00')>=now):rows;root.innerHTML='';$('#status').hidden=true;if(past.length){const toggle=document.createElement('button');toggle.className='past-toggle';toggle.textContent=(showPast?'Скрыть прошедшие':'Показать прошедшие · '+past.length);toggle.onclick=()=>{showPast=!showPast;renderLessons()};root.append(toggle)}if(!visible.length&&!past.length){root.innerHTML='<div class="empty"><b>Свободный день</b>'+ruDate(addDays(monday,selected))+'</div>';return}visible.forEach(x=>{const n=$('#lesson-template').content.firstElementChild.cloneNode(true);n.classList.add(x.source);n.tabIndex=0;n.setAttribute('role','button');n.querySelector('.time strong').textContent=x.start;n.querySelector('.time span').textContent=x.end;n.querySelector('.uni').textContent=x.source==='fa'?'Финунивер':'МГТУ';n.querySelector('.kind').textContent=shortKind(x.type);n.querySelector('h2').textContent=x.title;n.querySelector('.place').textContent=[x.room,x.building].filter(Boolean).join(' · ');n.querySelector('.teacher').textContent=x.teacher||'Преподаватель не указан';n.onclick=()=>openSheet(x);n.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openSheet(x)}};root.append(n)})}
function shortKind(v=''){if(/лаб/i.test(v))return'Лабораторная';if(/лек/i.test(v))return'Лекция';if(/сем|практ/i.test(v))return'Семинар';return v||'Занятие'}function showUpdated(v,cached=false){let el=$('#updated');if(!el){el=document.createElement('p');el.id='updated';el.className='updated';$('#lessons').after(el)}if(!v){el.hidden=true;return}const d=new Date(v);el.hidden=false;el.textContent=(cached?'Сохранено ':'Обновлено ')+d.toLocaleDateString('ru-RU',{day:'numeric',month:'short'})+' в '+d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}
function plural(n,a,b,c){return n%10===1&&n%100!==11?a:n%10>=2&&n%10<=4&&(n%100<10||n%100>=20)?b:c}function insight(label,title,text,action){const b=document.createElement('button');b.className='insight';b.innerHTML='<span>'+label+'</span><strong>'+title+'</strong><small>'+text+'</small>';b.onclick=action;return b}
function renderInsights(){const root=$('#insights');root.innerHTML='';if(!sameWeek(new Date(),monday))return;const now=new Date(),next=lessons.filter(x=>lessonDate(x)>=now).sort((a,b)=>lessonDate(a)-lessonDate(b))[0];if(next){const mins=Math.round((lessonDate(next)-now)/60000),when=mins<1?'сейчас':mins<60?'через '+mins+' мин':lessonDate(next).toLocaleDateString('ru-RU',{weekday:'short'})+' в '+next.start;root.append(insight('Ближайшая пара',when,next.title,[next.room,next.building].filter(Boolean).join(' · '),()=>{selected=(lessonDate(next).getDay()+6)%7;renderDays();renderLessons();openSheet(next)}))}if(now.getHours()>=18){const tomorrow=addDays(now,1),rows=lessons.filter(x=>x.date===iso(tomorrow)),title=rows.length?rows.length+' '+plural(rows.length,'пара','пары','пар')+' · '+rows[0].start+'–'+rows.at(-1).end:'Пар нет';root.append(insight('Завтра · '+tomorrow.toLocaleDateString('ru-RU',{weekday:'long'}),title,rows.length?rows.map(x=>x.title).join(' · '):'Можно выдохнуть',()=>{monday=startOfWeek(tomorrow);selected=(tomorrow.getDay()+6)%7;renderDays();renderLessons()}))}}
function openSheet(x){const w=$('#sheet'),d=new Date(x.date+'T12:00:00');$('#sheet-uni').textContent=x.source==='fa'?'Финунивер':'МГТУ';$('#sheet-kind').textContent=shortKind(x.type);$('#sheet-title').textContent=x.title;$('#sheet-time').textContent=x.start+' — '+x.end+' · '+ruDate(d);$('#sheet-teacher').textContent=x.teacher||'Не указан';$('#sheet-email').textContent=emailFor(x);$('#sheet-place').textContent=[x.room,x.building].filter(Boolean).join(' · ')||'Не указано';w.hidden=false;requestAnimationFrame(()=>w.classList.add('open'));document.body.classList.add('locked')}function closeSheet(){const w=$('#sheet');w.classList.remove('open');document.body.classList.remove('locked');setTimeout(()=>w.hidden=true,220)}$('#sheet-close').onclick=closeSheet;$('.sheet-backdrop').onclick=closeSheet;document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#sheet').hidden)closeSheet()});
async function load(){renderDays();$('#status').hidden=false;$('#status').className='status';$('#status').textContent='Обновляем расписание…';const key='week:'+iso(monday),raw=localStorage.getItem(key),parsed=raw?JSON.parse(raw):null,saved=Array.isArray(parsed)?{lessons:parsed,updatedAt:null}:parsed;try{const r=await fetch('/api/schedule?start='+iso(monday)+'&finish='+iso(addDays(monday,7)),{cache:'no-store'});if(!r.ok)throw Error();const data=await r.json();if(data.errors.length&&saved?.lessons?.length){lessons=saved.lessons;renderLessons();renderInsights();showUpdated(saved.updatedAt,true);showError('Сервер временно недоступен · показано сохранённое расписание');return}lessons=data.lessons;localStorage.setItem(key,JSON.stringify({lessons,updatedAt:data.updatedAt}));renderLessons();renderInsights();showUpdated(data.updatedAt);if(data.errors.length)showError('Часть расписания временно недоступна')}catch{lessons=saved?.lessons||[];renderLessons();renderInsights();showUpdated(saved?.updatedAt,true);showError(saved?.lessons?.length?'Сервер временно недоступен · показано сохранённое расписание':'Сервер временно недоступен')}}function showError(t){$('#status').hidden=false;$('#status').className='status error';$('#status').textContent=t}
function moveDay(step){showPast=false;selected+=step;if(selected>6){monday=addDays(monday,7);selected=0;load();return}if(selected<0){monday=addDays(monday,-7);selected=6;load();return}renderDays();renderLessons()}let swipeX=0,swipeY=0,swipeActive=false;const swipeArea=document.querySelector('main');swipeArea.addEventListener('touchstart',e=>{if(e.target.closest('button,select,input,.sheet'))return;swipeX=e.touches[0].clientX;swipeY=e.touches[0].clientY;swipeActive=true;$('#lessons').style.transition='none'},{passive:true});swipeArea.addEventListener('touchmove',e=>{if(!swipeActive)return;const dx=e.touches[0].clientX-swipeX,dy=e.touches[0].clientY-swipeY;if(Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)*1.2){e.preventDefault();const x=Math.max(-110,Math.min(110,dx*.72));$('#lessons').style.transform='translateX('+x+'px)';$('#lessons').style.opacity=1-Math.abs(x)/350}},{passive:false});swipeArea.addEventListener('touchend',e=>{if(!swipeActive)return;swipeActive=false;const root=$('#lessons'),dx=e.changedTouches[0].clientX-swipeX,dy=e.changedTouches[0].clientY-swipeY;root.style.transition='transform .18s ease,opacity .18s ease';if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.25){root.style.transform='translateX('+(dx<0?-180:180)+'px)';root.style.opacity='.15';setTimeout(()=>{moveDay(dx<0?1:-1);root.style.transition='none';root.style.transform='translateX('+(dx<0?80:-80)+'px)';requestAnimationFrame(()=>{root.style.transition='transform .22s ease,opacity .22s ease';root.style.transform='translateX(0)';root.style.opacity='1'})},160)}else{root.style.transform='translateX(0)';root.style.opacity='1'}});
let pullStart=0,pulling=false;const pull=$('#pull-refresh');addEventListener('touchstart',e=>{if(scrollY===0){pullStart=e.touches[0].clientY;pulling=true}},{passive:true});addEventListener('touchmove',e=>{if(!pulling)return;const d=Math.max(0,Math.min(90,e.touches[0].clientY-pullStart));pull.style.transform='translate(-50%,'+(d-52)+'px)';pull.classList.toggle('ready',d>70)},{passive:true});addEventListener('touchend',()=>{if(!pulling)return;const ready=pull.classList.contains('ready');pulling=false;pull.classList.remove('ready');pull.style.transform='translate(-50%,-52px)';if(ready)load()});$('#prev').onclick=()=>{monday=addDays(monday,-7);selected=0;showPast=false;load()};$('#next').onclick=()=>{monday=addDays(monday,7);selected=0;showPast=false;load()};$('#today').onclick=()=>{monday=startOfWeek(new Date());selected=(new Date().getDay()+6)%7;showPast=false;load()};if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js');load();















































