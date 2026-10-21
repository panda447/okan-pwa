import {
  formatDateInput, formatTimeInput, formatTimeRange, groupByLocalDate, localDateKey,
  parseLocalDateTime, toDateInput, toTimeInput,
} from '../../lib/datetime.js';
import { addSchedule, deleteSchedule, sortedSchedules, state, updateSchedule } from '../store.js';
import { $, $$, closeSheet, confirmDialog, esc, header, listOrEmpty, openSheet } from '../ui.js';
import { eventsByDate } from '../../lib/shukatsu/model.js';
import { openEntryForm } from './entryForm.js';

const JOB_KIND = { deadline: '締切', offer: '回答期限', next: '選考', intern: 'インターン' };
/** 就活の出来事。時刻つきの選考予定は予定にも入っているので、二重に出さない。 */
function jobEvents() {
  const map = eventsByDate(state.db.entries);
  for (const [k, list] of map) map.set(k, list.filter((ev) => !(ev.kind === 'next' && ev.entry.nextTime)));
  return map;
}

let calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let calSel = toDateInput(new Date());

function scheduleBody(initial, presetDate) {
  const start = initial ? new Date(initial.start_at) : new Date();
  return `
    <label class="field">タイトル<input name="title" value="${esc(initial?.title ?? '')}" placeholder="授業、バイト など" autocomplete="off"></label>
    <label class="field">日付<input name="date" inputmode="numeric" value="${esc(initial ? toDateInput(start) : (presetDate ?? toDateInput(start)))}" placeholder="2026-10-21"></label>
    <div class="two">
      <label class="field">開始時刻<input name="start" inputmode="numeric" value="${esc(initial ? toTimeInput(start) : '')}" placeholder="10:00"></label>
      <label class="field">終了時刻（任意）<input name="end" inputmode="numeric" value="${esc(initial?.end_at ? toTimeInput(new Date(initial.end_at)) : '')}" placeholder="12:00"></label>
    </div>
    <label class="field">場所（任意）<input name="location" value="${esc(initial?.location ?? '')}"></label>
    <label class="field">メモ（任意）<textarea name="description" rows="2">${esc(initial?.description ?? '')}</textarea></label>`;
}

/** 入力チェックは okan-app（ScheduleForm）と同じ文言・同じ条件。 */
function parseScheduleForm(v) {
  if (!v.title.trim()) return { error: 'タイトルを入力してください。' };
  const start = parseLocalDateTime(v.date, v.start);
  if (!start) return { error: '日付は YYYY-MM-DD、開始時刻は HH:MM の形式で入力してください。' };
  let end = null;
  if (v.end.trim()) {
    end = parseLocalDateTime(v.date, v.end);
    if (!end) return { error: '終了時刻は HH:MM の形式で入力してください。' };
    if (end <= start) return { error: '終了時刻は開始時刻より後にしてください。' };
  }
  return {
    values: {
      title: v.title.trim(),
      description: v.description.trim() || null,
      location: v.location.trim() || null,
      start_at: start.toISOString(),
      end_at: end ? end.toISOString() : null,
    },
  };
}

function bindMasks(form) {
  const mask = (name, fn) => $(`[name=${name}]`, form).addEventListener('input', (e) => { e.target.value = fn(e.target.value); });
  mask('date', formatDateInput);
  mask('start', formatTimeInput);
  mask('end', formatTimeInput);
}

export function openScheduleForm(id, presetDate) {
  const initial = id ? state.db.schedules.find((s) => s.id === id) : null;
  openSheet({
    title: initial ? '予定を編集' : '予定を追加',
    submitLabel: initial ? '保存する' : '追加する',
    bodyHtml: scheduleBody(initial, presetDate),
    onOpen: bindMasks,
    onSubmit(v) {
      const r = parseScheduleForm(v);
      if (r.error) return r.error;
      if (initial) updateSchedule(initial.id, r.values);
      else addSchedule(r.values);
    },
    onDelete: initial ? async () => {
      if (await confirmDialog({ title: '予定を削除しますか？', target: initial.title })) {
        deleteSchedule(initial.id);
        closeSheet();
      }
    } : null,
  });
}

function calendarBody() {
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  const days = new Set(state.db.schedules.map((s) => localDateKey(s.start_at)));
  const jobs = jobEvents();
  const jobDot = (key) => {
    const list = jobs.get(key) || [];
    if (!list.length) return '';
    return `<i class="dot job ${list.some((ev) => ev.kind === 'deadline' || ev.kind === 'offer') ? '' : 'next'}"></i>`;
  };
  const first = new Date(y, m, 1);
  const start = new Date(y, m, 1 - first.getDay());
  let cells = ['日', '月', '火', '水', '木', '金', '土'].map((d) => `<div class="h">${d}</div>`).join('');
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = toDateInput(d);
    cells += `<button type="button" class="c ${d.getMonth() !== m ? 'off' : ''} ${key === toDateInput(new Date()) ? 'today' : ''} ${key === calSel ? 'sel' : ''}" data-day="${key}">${d.getDate()}${days.has(key) ? '<i class="dot"></i>' : ''}${jobDot(key)}</button>`;
  }
  const list = sortedSchedules().filter((s) => localDateKey(s.start_at) === calSel);
  return `
    <div class="head-row"><button type="button" class="btn icon-btn" data-nav="-1" aria-label="前の月">‹</button><strong>${y}年${m + 1}月</strong><button type="button" class="btn icon-btn" data-nav="1" aria-label="次の月">›</button></div>
    <div class="cal">${cells}</div>
    <div class="eyebrow">${esc(calSel)}</div>
    <div class="list" style="margin-top:6px">${list.length
      ? list.map((s) => `<div class="row click" data-edit="${esc(s.id)}"><span class="time">${esc(formatTimeRange(s.start_at, s.end_at))}</span><div class="main"><b>${esc(s.title)}</b></div></div>`).join('')
      : '<div class="empty">この日の予定はありません。</div>'}</div>
    ${(jobs.get(calSel) || []).length ? `<div class="eyebrow">就活</div><div class="list" style="margin-top:6px">${jobs.get(calSel).map((ev) => `<div class="row click" data-entry="${esc(ev.entry.id)}"><span class="time">${esc(JOB_KIND[ev.kind])}</span><div class="main"><b>${esc(ev.entry.company)}</b><span class="faint">${esc(ev.label)}</span></div></div>`).join('')}</div>` : ''}
    <div class="goal-actions"><button type="button" class="btn" id="calAdd">この日に予定を追加</button><button type="button" class="btn" id="calAddJob">この日が締切の選考を追加</button></div>
    <p class="faint">●予定　<span style="color:var(--danger)">●</span>就活の締切・回答期限　<span style="color:var(--warn)">●</span>選考・インターン</p>`;
}

function openCalendar() {
  const draw = () => {
    openSheet({
      title: '予定カレンダー',
      bodyHtml: calendarBody(),
      submitLabel: '閉じる',
      onSubmit() {},
      onOpen(form) {
        $$('[data-nav]', form).forEach((b) => b.addEventListener('click', () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + Number(b.dataset.nav), 1); draw(); }));
        $$('[data-day]', form).forEach((b) => b.addEventListener('click', () => { calSel = b.dataset.day; draw(); }));
        $$('[data-edit]', form).forEach((r) => r.addEventListener('click', () => openScheduleForm(r.dataset.edit)));
        $('#calAdd', form).addEventListener('click', () => openScheduleForm(null, calSel));
        $('#calAddJob', form).addEventListener('click', () => openEntryForm(null, { deadline: calSel }));
        $$('[data-entry]', form).forEach((r) => r.addEventListener('click', () => openEntryForm(r.dataset.entry)));
      },
    });
  };
  draw();
}

export function renderSchedules(root) {
  const sections = groupByLocalDate(sortedSchedules(), (s) => s.start_at);
  const todayKey = toDateInput(new Date());
  const html = sections.map((sec) => `
    <div class="date-head ${sec.key === todayKey ? 'today' : ''}">${esc(sec.title)}${sec.key === todayKey ? '（今日）' : ''}</div>
    <div class="list">${sec.data.map((s) => `<div class="row click" data-edit="${esc(s.id)}"><span class="time">${esc(formatTimeRange(s.start_at, s.end_at))}</span><div class="main"><b>${esc(s.title)}</b>${s.location ? `<span class="faint">${esc(s.location)}</span>` : ''}</div><span class="chev">›</span></div>`).join('')}</div>`).join('');
  root.innerHTML = `
    ${header({ eyebrow: 'PLAN', title: '予定', sub: `${state.db.schedules.length}件`, actions: '<button class="btn" id="openCal">カレンダー</button><button class="btn primary icon-btn" id="addSchedule" aria-label="予定を追加">＋</button>' })}
    ${html || listOrEmpty('', ['まだ予定がありません。', '右上の＋から追加してください。'])}`;
  $('#addSchedule', root).addEventListener('click', () => openScheduleForm(null));
  $('#openCal', root).addEventListener('click', openCalendar);
  $$('[data-edit]', root).forEach((r) => r.addEventListener('click', () => openScheduleForm(r.dataset.edit)));
}
