// ホーム。上から「今日（日めくり＋天気）→ おかんの置き手紙 → 今日の流れ → しめきり → 目標」。
// 開いて3秒で「今日なにがあって、何を急ぐか」が分かることを優先し、細かい操作は各タブに任せる。
import { formatTime, toDateInput } from '../../lib/datetime.js';
import { summarizeGoalProgress } from '../../lib/goalProgress.js';
import { currentSayings, currentTopic } from '../okan.js';
import { addGoalLog, sortedSchedules, state, todaysSchedules } from '../store.js';
import { currentLocation, refreshForecast } from '../weather.js';
import { $$, esc } from '../ui.js';
import { daysLeft, isActive, nextStartAt, overdueDeadlines, upcomingDeadlines } from '../../lib/shukatsu/model.js';
import { openEntryForm } from './entryForm.js';
import { openScheduleForm } from './schedules.js';
import { OKAN_FACE, progressView } from './parts.js';
import { burst } from '../motion.js';

// ---------- 今日（日めくり＋天気） ----------
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function himekuri(now) {
  const cls = now.getDay() === 0 ? 'sun' : now.getDay() === 6 ? 'sat' : '';
  const full = now.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  return `<div class="himekuri ${cls}" role="img" aria-label="${esc(full)}"><div class="m">${now.getFullYear()}年 ${now.getMonth() + 1}月</div><div class="d">${now.getDate()}</div><div class="w">${WEEKDAYS[now.getDay()]}曜日</div></div>`;
}

/** 天気の絵。細かい種類は文字で出すので、絵は 晴れ／曇り／雨／雪 の4つにまとめる。 */
function weatherIcon(condition) {
  const c = String(condition ?? '');
  const cloud = '<path d="M9 23h13a5 5 0 0 0 .6-10 7 7 0 0 0-13.300 1.800A4.200 4.200 0 0 0 9 23Z" fill="none" stroke="currentColor" stroke-width="1.800" stroke-linejoin="round"/>';
  if (/雪/.test(c)) return `<svg viewBox="0 0 32 32" aria-hidden="true">${cloud}<g class="drop" fill="currentColor"><circle cx="11" cy="27.500" r="1.300"/><circle cx="16" cy="28.500" r="1.300"/><circle cx="21" cy="27.500" r="1.300"/></g></svg>`;
  if (/雨|雷/.test(c)) return `<svg viewBox="0 0 32 32" aria-hidden="true">${cloud}<g class="drop" stroke="currentColor" stroke-width="1.800" stroke-linecap="round"><path d="M11 26l-1 3M16 26l-1 3M21 26l-1 3"/></g></svg>`;
  if (/曇|霧/.test(c)) return `<svg viewBox="0 0 32 32" aria-hidden="true">${cloud}</svg>`;
  return `<svg viewBox="0 0 32 32" aria-hidden="true"><g class="sun" stroke="currentColor" stroke-width="1.800" stroke-linecap="round"><circle cx="16" cy="16" r="5.500" fill="currentColor"/><path d="M16 4.500v3M16 24.500v3M4.500 16h3M24.500 16h3M7.900 7.900l2.100 2.100M22 22l2.100 2.100M24.100 7.900 22 10M10 22l-2.100 2.100"/></g></svg>`;
}

function skyDay(label, day) {
  if (!day) return `<div class="sky-day"><span></span><div class="lbl">${label}</div><div class="val">—</div></div>`;
  const rain = day.rainProbability;
  return `<div class="sky-day">${weatherIcon(day.condition)}
    <div class="lbl">${label}・${esc(day.condition ?? '—')}</div>
    <div class="val"><b>${day.temperature === null ? '—' : Math.round(day.temperature)}</b>℃<span class="rain ${rain !== null && rain >= 50 ? 'wet' : ''}">雨${rain === null ? '—' : `${rain}%`}</span></div></div>`;
}

function sky() {
  const { status, data } = state.forecast;
  const place = esc(data?.locationName ?? currentLocation().name);
  if (status === 'error') {
    return `<div class="sky"><div class="place">${place}</div><p class="muted" style="margin:0">天気を取れませんでした。通信できるときにもう一度。</p><div><button class="btn small" data-act="reload-weather">取り直す</button></div></div>`;
  }
  if (!data) return `<div class="sky"><div class="place">${place}</div><p class="muted" style="margin:0">天気を見てきています…</p></div>`;
  return `<div class="sky"><div class="place">${place}の天気${data.isStale ? '（前に取れた値）' : ''}</div>
    <div class="sky-days">${skyDay('今日', data.today)}${skyDay('明日', data.tomorrow)}</div></div>`;
}

// ---------- おかんの置き手紙 ----------
const TOPIC_LABEL = { sleep: 'おやすみ', schedule: 'もうすぐ予定', weather: '天気', goal: '目標', achievement: 'できた' };
const KIND_LABEL = { deadline: 'しめきり', offer: '内定の返事', event: '今日の選考', overdue: 'しめきり超過', eve: '明日の選考', after: 'おつかれさま', waiting: '結果待ち' };

/** ひとことを1文字ずつ出すための span 分け（動きはCSS、タブを開いたときだけ）。 */
const typed = (text) => [...String(text)].map((ch, i) => `<span style="--c:${Math.min(i, 70)}" aria-hidden="true">${esc(ch)}</span>`).join('');

function note(now) {
  const text = currentSayings(now);
  const topic = currentTopic(now);
  const label = topic ? (topic.type === 'deadline' ? KIND_LABEL[topic.kind] : TOPIC_LABEL[topic.type]) : '';
  return `<section class="note" aria-label="おかんからのひとこと">
    ${label ? `<span class="topic ${topic.priority === 'HIGH' ? 'hot' : ''}">${esc(label)}</span>` : ''}
    <p class="okan-say"><span class="sr">${esc(text)}</span>${typed(text)}</p>
    <div class="sign"><span>おかんより</span>${OKAN_FACE}</div>
  </section>`;
}

// ---------- 今日の流れ ----------
/** 今日の予定と、時刻の決まっていない今日の選考を1本の流れにする。 */
function todayFlow(now) {
  const entryOf = (id) => state.db.entries.find((e) => e.id === id);
  const timed = todaysSchedules().map((s) => ({
    at: new Date(s.start_at), end: s.end_at ? new Date(s.end_at) : null, title: s.title, sub: s.location || '',
    job: Boolean(s.entry_id), scheduleId: s.entry_id ? null : s.id, entryId: s.entry_id && entryOf(s.entry_id) ? s.entry_id : null,
  }));
  // 時刻つきの選考は予定にも入っているはずだが、読み込んだデータなどで予定側が無いこともあるので、ここで拾う
  const synced = new Set(timed.map((t) => t.entryId).filter(Boolean));
  const jobs = state.db.entries
    .filter((e) => isActive(e) && daysLeft(e.nextDate, now) === 0 && !synced.has(e.id))
    .map((e) => ({ at: nextStartAt(e), end: null, title: `${e.company} ${e.nextPlan || e.stage}`, sub: e.nextTime ? '' : '時刻は未登録', job: true, entryId: e.id }));
  const items = [...jobs.filter((j) => !j.at), ...[...timed, ...jobs.filter((j) => j.at)].sort((a, b) => a.at - b.at)];
  if (!items.length) return '<div class="list"><div class="empty">今日の予定はありません。<button class="btn small" data-act="add-schedule" style="margin-left:8px">予定を足す</button></div></div>';
  // 「いま」は、まだ終わっていない最初の予定に付ける
  const over = (it) => it.at && (it.end ?? new Date(it.at.getTime() + 60 * 60_000)) < now;
  const nowIndex = items.findIndex((it) => it.at && !over(it));
  return `<div class="flow">${items.map((it, i) => `
    <div class="flow-item ${it.job ? 'job' : ''} ${over(it) ? 'past' : ''} ${i === nowIndex ? 'now' : ''}" ${it.entryId ? `data-entry="${esc(it.entryId)}"` : it.scheduleId ? `data-schedule="${esc(it.scheduleId)}"` : ''} ${it.entryId || it.scheduleId ? 'role="button" tabindex="0" style="cursor:pointer"' : ''}>
      <div class="t">${it.at ? esc(formatTime(it.at.toISOString())) : '今日'}${it.end ? `<small>〜${esc(formatTime(it.end.toISOString()))}</small>` : ''}</div>
      <i class="dot"></i>
      <div class="main"><b>${it.job ? '<span class="tag">就活</span>' : ''}${esc(it.title)}</b>${it.sub ? `<span>${esc(it.sub)}</span>` : ''}</div>
    </div>`).join('')}</div>`;
}

/** 明日あること（予定と選考）を1行ずつ。無ければ出さない。 */
function tomorrowList(now) {
  const key = toDateInput(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const schedules = sortedSchedules().filter((s) => toDateInput(new Date(s.start_at)) === key);
  const jobs = state.db.entries.filter((e) => isActive(e) && e.nextDate === key && !e.nextTime);
  const rows = [
    ...jobs.map((e) => `<div class="row"><span class="time">時刻未定</span><div class="main"><b>${esc(e.company)} ${esc(e.nextPlan || e.stage)}</b></div></div>`),
    ...schedules.map((s) => `<div class="row"><span class="time">${esc(formatTime(s.start_at))}</span><div class="main"><b>${esc(s.title)}</b></div></div>`),
  ].join('');
  return rows ? `<div class="section"><h2>明日</h2></div><div class="list">${rows}</div>` : '';
}

// ---------- しめきり ----------
function dueRow({ id, cls, top, big, company, sub }) {
  return `<button type="button" class="due ${cls}" data-entry="${esc(id)}"><span class="left">${esc(top)}<b>${esc(big)}</b></span><span class="main"><b>${esc(company)}</b><span>${esc(sub)}</span></span><span class="chev" aria-hidden="true">›</span></button>`;
}
const leftLabel = (left) => (left === 0 ? { top: 'しめきり', big: '今日' } : left === 1 ? { top: 'しめきり', big: '明日' } : { top: 'あと', big: `${left}日` });

function dueList(now) {
  const entries = state.db.entries;
  if (!entries.length) return '';
  const offers = entries
    .map((e) => ({ e, left: daysLeft(e.offerResponseDeadline, now) }))
    .filter(({ e, left }) => e.stage === '内定' && e.offerDecision === '検討中' && left !== null && left >= 0 && left <= 7);
  const rows = [
    ...overdueDeadlines(entries, now).map(({ entry, left }) => dueRow({ id: entry.id, cls: 'over', top: '超過', big: `${-left}日`, company: entry.company, sub: `${entry.stage}・出したら「次へ」で消えます` })),
    ...upcomingDeadlines(entries, now).map(({ entry, left }) => dueRow({ id: entry.id, cls: left <= 1 ? 'critical' : '', ...leftLabel(left), company: entry.company, sub: `${entry.stage}の締切` })),
    ...offers.map(({ e, left }) => dueRow({ id: e.id, cls: left <= 3 ? 'critical' : '', ...leftLabel(left), company: e.company, sub: '内定の回答期限' })),
  ].join('');
  const active = entries.filter(isActive).length;
  return `<div class="section"><h2>しめきり</h2><a href="#/shukatsu" class="muted">選考 ${active}件 ›</a></div>
    <div class="list">${rows || '<div class="empty">7日以内の締切はありません。</div>'}</div>`;
}

// ---------- 目標 ----------
function goalRow(goal) {
  const main = summarizeGoalProgress(goal, state.db.goal_logs)[0];
  const done = main.ratio !== null && main.ratio >= 1;
  return `<div class="goal-row ${done ? 'done' : ''}"><div class="main"><b>${esc(goal.title)}</b>${progressView(main, `home-${goal.id}`)}</div>
    <button class="btn ${done ? '' : 'primary'} small" data-done="${esc(goal.id)}" aria-label="${esc(goal.title)}をやった">やった</button></div>`;
}

export function renderHome(root) {
  const now = new Date();
  root.innerHTML = `
    <h1 class="sr">ホーム</h1>
    <div class="today-head">${himekuri(now)}${sky()}</div>
    ${note(now)}
    <div class="section"><h2>今日の流れ</h2><a href="#/schedules" class="muted">予定 ›</a></div>
    ${todayFlow(now)}
    ${tomorrowList(now)}
    ${dueList(now)}
    <div class="section"><h2>目標</h2><a href="#/goals" class="muted">すべて ›</a></div>
    <div class="list">${state.db.goals.length ? state.db.goals.map(goalRow).join('') : '<div class="empty">目標はまだありません。<a href="#/goals">目標タブ</a>から足せます。</div>'}</div>`;

  root.querySelector('[data-act="reload-weather"]')?.addEventListener('click', refreshForecast);
  root.querySelector('[data-act="add-schedule"]')?.addEventListener('click', () => openScheduleForm(null));
  const open = (el) => (el.dataset.entry ? openEntryForm(el.dataset.entry) : openScheduleForm(el.dataset.schedule));
  $$('[data-entry], [data-schedule]', root).forEach((el) => {
    el.addEventListener('click', () => open(el));
    if (el.tagName !== 'BUTTON') el.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(el); } });
  });
  $$('[data-done]', root).forEach((b) => b.addEventListener('click', () => { burst(b); addGoalLog(b.dataset.done, 1); }));
}
