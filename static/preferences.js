/* Calendar history and preferences are local to this device. */
(() => {
  'use strict';
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  let teacher = localStorage.getItem('english-teacher') || 'Фирсова';
  let teachers = read('english-teachers', []);
  const records = read('calendar-tracking-v1', {});
  const fields = ['source', 'id', 'date', 'start', 'end', 'title', 'teacher', 'room', 'building', 'type'];
  const copy = x => Object.fromEntries(fields.map(key => [key, x[key] || '']));
  const signature = rows => JSON.stringify(rows.map(copy).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
  const persist = () => save('calendar-tracking-v1', records);
  const nativeFetch = window.fetch.bind(window);
  let mounted = false, exportScope = null, lastFocus = null;

  function diff(before, after) {
    const unused = [...after], lines = [];
    for (const old of before) {
      let index = unused.findIndex(x => x.source === old.source && x.id === old.id);
      if (index < 0) index = unused.findIndex(x => x.source === old.source && x.date === old.date && x.title === old.title && x.type === old.type);
      if (index < 0) { lines.push(`${old.date} ${old.start} · ${old.title}: отменена или перенесена`); continue; }
      const next = unused.splice(index, 1)[0], changes = [];
      for (const [key, name] of [['date','дата'],['start','начало'],['end','окончание'],['title','предмет'],['teacher','преподаватель'],['room','аудитория'],['building','корпус']]) {
        if ((old[key] || '') !== (next[key] || '')) changes.push(`${name}: ${old[key] || '—'} → ${next[key] || '—'}`);
      }
      if (changes.length) lines.push(`${old.date} · ${old.title}: ${changes.join('; ')}`);
    }
    unused.forEach(x => lines.push(`${x.date} ${x.start} · ${x.title}: новая пара`));
    return lines;
  }

  function observe(data, url, selectedTeacher) {
    if (!Array.isArray(data.lessons)) return;
    if (data.englishTeachers?.length) {
      teachers = [...new Set([...teachers, ...data.englishTeachers])].sort();
      save('english-teachers', teachers);
      if (mounted) renderTeachers();
    }
    const start = url.searchParams.get('start'), finish = url.searchParams.get('finish');
    if (!start || !finish) return;
    const failed = new Set((data.errors || []).map(x => x.source));
    for (const record of Object.values(records)) {
      if (record.teacher !== selectedTeacher || record.start < start || record.finish > finish) continue;
      let next = data.lessons.filter(x => x.date >= record.start && x.date <= record.finish && !failed.has(x.source));
      if (record.scope === 'single') {
        next = next.filter(x => record.baseline.some(old => x.source === old.source &&
          (x.id === old.id || (x.date === old.date && x.title === old.title && x.type === old.type))));
      }
      next = [...next.map(copy), ...record.current.filter(x => failed.has(x.source))];
      const previousGood = record.current.filter(x => !failed.has(x.source));
      const nextGood = next.filter(x => !failed.has(x.source));
      if (signature(previousGood) !== signature(nextGood)) {
        const changes = diff(previousGood, nextGood);
        record.current = next;
        if (changes.length) { record.changes = changes; record.dismissed = false; }
      }
    }
    persist();
    if (mounted) renderWarnings();
  }

  window.fetch = function(input, init) {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
    if (url.origin !== location.origin || url.pathname !== '/api/schedule') return nativeFetch(input, init);
    const selectedTeacher = url.searchParams.get('teacher') || teacher;
    url.searchParams.set('teacher', selectedTeacher);
    return nativeFetch(url, init).then(response => {
      if (response.ok) response.clone().json().then(data => observe(data, url, selectedTeacher)).catch(() => {});
      return response;
    });
  };

  function button(text, action, className = '') {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = text;
    b.className = className; b.onclick = action; return b;
  }
  function paragraph(text) { const p = document.createElement('p'); p.textContent = text; return p; }
  function openMenu(title, content) {
    lastFocus = document.activeElement;
    const wrap = document.getElementById('preferences-menu');
    wrap.replaceChildren();
    const backdrop = button('', closeMenu, 'preferences-backdrop');
    backdrop.setAttribute('aria-label', 'Закрыть меню');
    const panel = document.createElement('section'); panel.className = 'preferences-panel';
    panel.setAttribute('role','dialog'); panel.setAttribute('aria-modal','true'); panel.setAttribute('aria-labelledby','preferences-title');
    const close = button('×', closeMenu, 'preferences-close'); close.setAttribute('aria-label','Закрыть меню');
    const heading = document.createElement('h2'); heading.id = 'preferences-title'; heading.textContent = title;
    panel.append(close, heading, ...content); wrap.append(backdrop, panel); wrap.hidden = false; close.focus();
    document.body.classList.add('preferences-locked');
  }
  function closeMenu() {
    document.getElementById('preferences-menu').hidden = true;
    document.body.classList.remove('preferences-locked'); lastFocus?.focus({preventScroll:true});
  }
  function renderTeachers() {
    const select = document.getElementById('english-teacher-select'); if (!select) return;
    select.replaceChildren();
    const options = [...new Set(['Фирсова', teacher, ...teachers])];
    for (const name of options) {
      const option = document.createElement('option'); option.value = name;
      option.textContent = name === 'Фирсова' ? 'Фирсова (по умолчанию)' : name;
      option.selected = name === teacher; select.append(option);
    }
  }
  function settings() {
    const label = document.createElement('label'); label.textContent = 'Преподаватель английского';
    const select = document.createElement('select'); select.id = 'english-teacher-select'; label.append(select);
    select.onchange = () => {
      teacher = select.value; localStorage.setItem('english-teacher',teacher);
      // Week snapshots belong to the previous teacher; confirmed calendar history is retained.
      Object.keys(localStorage).filter(key => key.startsWith('week:')).forEach(key => localStorage.removeItem(key));
      closeMenu(); location.reload();
    };
    openMenu('Настройки', [label, paragraph('Выбор сохраняется на этом устройстве и применяется к расписанию и новым экспортам. Для загрузки другого преподавателя требуется интернет.'),
      paragraph('Преподаватели появляются в списке после загрузки недель, где есть английский.'),
      button('Подписаться на расписание', subscription, 'preferences-primary'),
      paragraph('Уведомления об изменениях показываются при открытии приложения после успешного обновления расписания.')]);
    renderTeachers();
  }
  function subscription() {
    const note = paragraph('Подписка обновляет переносы и отмены автоматически. Скорость обновления зависит от календаря; изменения могут приходить с задержкой.');
    const select = document.createElement('select'); select.setAttribute('aria-label','Напоминание о паре');
    for (const minutes of [0,10,15,30,60]) {
      const option = document.createElement('option'); option.value=minutes; option.textContent=minutes?`За ${minutes} минут`:'Не напоминать'; option.selected=minutes===30; select.append(option);
    }
    const input = document.createElement('input'); input.readOnly=true; input.setAttribute('aria-label','Ссылка подписки');
    const update = () => { const url = new URL('/calendar.ics',location.origin); url.searchParams.set('teacher',teacher); url.searchParams.set('alarm',select.value); input.value=url.href; };
    select.onchange=update; update();
    const actions = /iPhone|iPad|iPod/.test(navigator.userAgent) ? [button('Открыть подписку в календаре',()=>{location.href=input.value.replace(/^https?:/,'webcal:');},'preferences-primary')] : [];
    actions.push(button('Скопировать ссылку',async()=>{try{await navigator.clipboard.writeText(input.value);status.textContent='Ссылка скопирована';}catch{input.focus();input.select();status.textContent='Выделенная ссылка готова для копирования';}}));
    const status = paragraph(''); status.setAttribute('role','status');
    openMenu('Подписаться на расписание',[note, paragraph(`Английский: ${teacher}`),select,input,...actions,status,
      paragraph('На Android: Google Calendar в веб-версии на компьютере → Другие календари → По URL. Затем включите календарь на телефоне.'),
      paragraph('Ранее импортированные события остаются отдельными копиями. Чтобы избежать дублей, удалите их один раз. После изменения преподавателя добавьте новую ссылку вместо старой.')]);
  }
  function renderWarnings() {
    const root = document.getElementById('calendar-warnings'); root.replaceChildren();
    for (const [key, record] of Object.entries(records)) {
      if (!record.changes?.length || record.dismissed) continue;
      const box = document.createElement('section'); box.className='calendar-warning';
      const title = document.createElement('strong'); title.textContent=`Внимание: расписание на ${record.label} изменилось`;
      const dismiss = button('×',()=>{record.dismissed=true;persist();renderWarnings();},'warning-dismiss');
      dismiss.setAttribute('aria-label','Скрыть это изменение расписания');
      box.append(dismiss,title,paragraph(`Изменений: ${record.changes.length}`),button('Посмотреть изменения',()=>details(key)));
      root.append(box);
    }
  }
  function details(key) {
    const record=records[key];
    const list=document.createElement('ul'); record.changes.forEach(text=>{const item=document.createElement('li');item.textContent=text;list.append(item);});
    openMenu(`Изменения на ${record.label}`,[list,paragraph('Сайт не может изменить уже импортированные события в календаре телефона. Удалите старые события перед повторным добавлением, чтобы избежать дублей.'),
      button('Добавить актуальное расписание',()=>{closeMenu();exportScope={scope:record.scope,start:record.start,finish:record.finish};calOpen(record.current);}),
      button('Подписаться на автообновления',subscription,'preferences-primary')]);
  }
  function confirmPending() {
    const pending=read('calendar-pending-v1',null); if(!pending||!mounted||document.visibilityState==='hidden')return;
    openMenu('Удалось добавить в календарь?',[paragraph('Подтвердите сохранение событий в календаре. Открытие файла или меню само по себе ещё не означает, что они добавлены.'),
      button('Да, добавили',()=>{
        records[pending.key]={...pending,baseline:pending.items,current:pending.items,dismissed:true,changes:[]};
        localStorage.removeItem('calendar-pending-v1');persist();closeMenu();renderWarnings();
      },'preferences-primary'),button('Нет, не добавили',()=>{localStorage.removeItem('calendar-pending-v1');closeMenu();})]);
  }
  document.addEventListener('DOMContentLoaded',()=>{
    mounted=true;
    const main=document.querySelector('main'),warnings=document.createElement('div');warnings.id='calendar-warnings';
    document.getElementById('insights').before(warnings);
    const footer=document.createElement('footer');footer.className='preferences-footer';footer.append(button('Настройки',settings));main.append(footer);
    const menu=document.createElement('div');menu.id='preferences-menu';menu.hidden=true;document.body.append(menu);
    document.getElementById('week-calendar').onclick=()=>{exportScope={scope:'week',start:iso(monday),finish:iso(addDays(monday,6))};calOpen(lessons.filter(x=>x.date>=exportScope.start&&x.date<=exportScope.finish));};
    document.getElementById('lesson-calendar').onclick=()=>{exportScope={scope:'single',start:selectedLesson.date,finish:selectedLesson.date};calOpen([selectedLesson]);};
    const originalOpen=calOpen;
    calOpen=function(items){originalOpen(items);const confirmed=Object.values(records).some(r=>r.teacher===teacher&&signature(r.baseline)===signature(items));document.getElementById('calendar-state').textContent=confirmed?'Уже добавили':'';};
    document.getElementById('calendar-add').onclick=async()=>{
      if(!calendarItems.length)return;
      const scope=exportScope||{scope:'single',start:calendarItems[0].date,finish:calendarItems[0].date};
      const items=calendarItems.map(copy),label=scope.start===scope.finish?scope.start:`${scope.start} — ${scope.finish}`;
      const key=JSON.stringify([teacher,scope.scope,scope.start,scope.finish,scope.scope==='single'?items[0].id:'']);
      const pending={...scope,key,teacher,label,items};
      const alarm=Number(document.querySelector('input[name="alarm"]:checked').value),ics=buildIcs(calendarItems,alarm);
      const file=new File([ics],`vanchunik-${scope.start}.ics`,{type:'text/calendar'});
      try {
        save('calendar-pending-v1',pending);
        if(isAndroid&&navigator.share&&navigator.canShare?.({files:[file]})) {
          try{await navigator.share({files:[file],title:'Расписание'});}catch(error){if(error.name==='AbortError'){localStorage.removeItem('calendar-pending-v1');return;}postCalendar(ics);}
        }else postCalendar(ics);
        calClose();if(!document.getElementById('sheet').hidden)closeSheet();setTimeout(confirmPending,700);
      }catch(error){localStorage.removeItem('calendar-pending-v1');document.getElementById('calendar-state').textContent='Не удалось открыть календарь';}
    };
    renderWarnings();confirmPending();
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')confirmPending();});
    window.addEventListener('pageshow',confirmPending);
    document.addEventListener('keydown',e=>{
      if(menu.hidden)return;
      if(e.key==='Escape'){e.preventDefault();closeMenu();}
      if(e.key==='Tab'){
        const focusable=[...menu.querySelectorAll('button,input,select,a[href]')].filter(x=>!x.disabled),first=focusable[0],last=focusable.at(-1);
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
    });
    // Refresh tracked ranges on opening, even when their week is not selected.
    const cutoff=iso(addDays(new Date(),-7));
    const ranges=new Set(Object.values(records).filter(r=>r.finish>=cutoff).map(r=>JSON.stringify([r.teacher,r.start,r.finish])));
    for(const range of ranges){const [selectedTeacher,start,finish]=JSON.parse(range);const url=new URL('/api/schedule',location.origin);url.search=new URLSearchParams({start,finish,teacher:selectedTeacher});fetch(url).catch(()=>{});}
  });
})();
