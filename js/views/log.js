import { formatTime, groupByLocalDate } from '../../lib/datetime.js';
import { state } from '../store.js';
import { badge, esc, header, listOrEmpty } from '../ui.js';

const LABELS = { sleep: '就寝', weather: '天気', schedule: '予定', goal: '目標', achievement: '達成' };
const MAX = 100; // 古い分まで遡らず、直近から一定件数だけ出す

export function renderLog(root) {
  const items = [...state.db.interventions]
    .sort((a, b) => (b.sent_at ?? b.created_at).localeCompare(a.sent_at ?? a.created_at))
    .slice(0, MAX);
  const sections = groupByLocalDate(items, (i) => i.sent_at ?? i.created_at);
  const html = sections.map((sec) => `
    <div class="date-head">${esc(sec.title)}</div>
    <div class="list">${sec.data.map((i) => `<div class="row"><div class="main">
      <div style="display:flex;gap:8px;align-items:center"><span class="time" style="width:auto">${esc(formatTime(i.sent_at ?? i.created_at))}</span>${badge(i.trigger_type, LABELS[i.trigger_type] ?? i.trigger_type)}</div>
      <b style="font-weight:600;margin-top:4px">${esc(i.message)}</b>${i.reason ? `<span class="faint">${esc(i.reason)}</span>` : ''}</div></div>`).join('')}</div>`).join('');
  root.innerHTML = `
    ${header({ eyebrow: 'LOG', title: '記録', sub: 'おかんが声をかけた履歴' })}
    ${html || listOrEmpty('', ['まだおかんは何も言っていません。', '予定や目標を登録すると声をかけてくれます。'])}`;
}
