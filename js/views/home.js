import { formatDateOnly, formatTimeRange } from '../../lib/datetime.js';
import { formatProgress, summarizeGoalProgress } from '../../lib/goalProgress.js';
import { currentSayings } from '../okan.js';
import { state, todaysSchedules } from '../store.js';
import { refreshForecast } from '../weather.js';
import { esc, header } from '../ui.js';
import { daysLeft, deadlineText, isActive, upcomingDeadlines } from '../../lib/shukatsu/model.js';

/** 就活：今日の選考予定と、締切が近いもの。 */
function shukatsuCard() {
  const entries = state.db.entries;
  if (!entries.length) return '';
  const today = entries.filter((e) => isActive(e) && daysLeft(e.nextDate) === 0);
  const near = upcomingDeadlines(entries).slice(0, 3);
  const offers = entries.filter((e) => e.stage === '内定' && e.offerDecision === '検討中' && daysLeft(e.offerResponseDeadline) !== null && daysLeft(e.offerResponseDeadline) >= 0 && daysLeft(e.offerResponseDeadline) <= 7);
  const rows = [
    ...today.map((e) => `<div class="row"><span class="time">${esc(e.nextTime || '今日')}</span><div class="main"><b>${esc(e.company)}</b><span class="faint">${esc(e.nextPlan || e.stage)}</span></div></div>`),
    ...offers.map((e) => `<div class="row"><span class="time dl critical">回答</span><div class="main"><b>${esc(e.company)}</b><span class="faint">内定の回答期限・${esc(deadlineText(e.offerResponseDeadline))}</span></div></div>`),
    ...near.map(({ entry, left }) => `<div class="row"><span class="time dl ${left <= 1 ? 'critical' : 'soon'}">${esc(deadlineText(entry.deadline))}</span><div class="main"><b>${esc(entry.company)}</b><span class="faint">締切・${esc(entry.stage)}</span></div></div>`),
  ].join('');
  return `<div class="section"><div><span class="eyebrow">JOB HUNTING</span><h2>就活</h2></div><a href="#/shukatsu" class="muted">選考管理 ›</a></div>
    <div class="list">${rows || `<div class="empty">今日の選考と、7日以内の締切はありません（進行中${entries.filter(isActive).length}件）。</div>`}</div>`;
}

function weatherCard() {
  const { status, data, error } = state.forecast;
  const body = (() => {
    if (status === 'idle' || (status === 'loading' && !data)) return '<p class="muted">天気を取得しています…</p>';
    if (status === 'error') return `<p class="err">天気を取得できませんでした。</p><p class="faint">${esc(error)}</p><button class="btn small" data-act="reload-weather">もう一度</button>`;
    const cell = (label, day) => day
      ? `<div><div class="faint">${label}</div><div class="t">${day.temperature === null ? '—' : Math.round(day.temperature)}<span class="muted" style="font-size:13px">℃</span></div><div>${esc(day.condition ?? '—')}</div><div class="rain faint">降水確率 ${day.rainProbability === null ? '—' : day.rainProbability + '%'}</div></div>`
      : `<div><div class="faint">${label}</div><p class="muted">データなし</p></div>`;
    return `<div class="weather">${cell('今日（最高）', data.today)}${cell('明日（最高）', data.tomorrow)}</div>
      ${data.isStale ? '<p class="warn" style="margin:8px 0 0">最新を取得できず、前回の値を表示しています。</p>' : ''}`;
  })();
  return `<section class="card"><div class="eyebrow">WEATHER</div><h2>天気</h2>${body}</section>`;
}

function goalMini(goal) {
  const progress = summarizeGoalProgress(goal, state.db.goal_logs);
  const main = progress[0];
  const bar = main.ratio === null ? '' : `<div class="bar ${main.ratio >= 1 ? 'done' : ''}"><i style="width:${Math.round(main.ratio * 100)}%"></i></div>`;
  return `<div class="row"><div class="main"><b>${esc(goal.title)}</b>
    <div class="progress" style="margin-top:6px"><div class="top"><span>${esc(formatProgress(main))}</span>${goal.deadline ? `<span>期限 ${esc(formatDateOnly(goal.deadline))}</span>` : ''}</div>${bar}</div></div></div>`;
}

export function renderHome(root) {
  const schedules = todaysSchedules();
  const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  root.innerHTML = `
    ${header({ eyebrow: 'OKAN SPACE', title: 'ホーム', sub: today })}
    <section class="card hero"><div class="eyebrow">おかんからの一言</div><p class="okan-say">${esc(currentSayings())}</p></section>
    ${shukatsuCard()}
    ${weatherCard()}
    <div class="section"><div><span class="eyebrow">TODAY</span><h2>今日の予定</h2></div><span class="muted">${schedules.length}件</span></div>
    <div class="list">${schedules.length
      ? schedules.map((s) => `<div class="row"><span class="time">${esc(formatTimeRange(s.start_at, s.end_at))}</span><div class="main"><b>${esc(s.title)}</b>${s.location ? `<span class="faint">${esc(s.location)}</span>` : ''}</div></div>`).join('')
      : '<div class="empty">今日の予定はありません。</div>'}</div>
    <div class="section"><div><span class="eyebrow">GOALS</span><h2>目標</h2></div><a href="#/goals" class="muted">すべて見る ›</a></div>
    <div class="list">${state.db.goals.length ? state.db.goals.map(goalMini).join('') : '<div class="empty">目標はまだ登録されていません。</div>'}</div>`;
  root.querySelector('[data-act="reload-weather"]')?.addEventListener('click', refreshForecast);
}
