import { formatDateInput, formatDateOnly, parseDateOnly } from '../../lib/datetime.js';
import { formatProgress, summarizeGoalProgress } from '../../lib/goalProgress.js';
import { addGoal, addGoalLog, deleteGoal, deleteGoalLog, state, updateGoal } from '../store.js';
import { $, $$, closeSheet, confirmDialog, esc, header, listOrEmpty, openSheet } from '../ui.js';
import { startOfWeek } from '../../lib/datetime.js';
import { burst } from '../motion.js';

/** 空欄は null、正の整数以外は 'invalid'。 */
function parseTarget(text) {
  if (!text.trim()) return null;
  const n = Number(text.trim());
  return Number.isInteger(n) && n >= 1 ? n : 'invalid';
}

export function openGoalForm(id) {
  const g = id ? state.db.goals.find((x) => x.id === id) : null;
  openSheet({
    title: g ? '目標を編集' : '目標を追加',
    submitLabel: g ? '保存する' : '追加する',
    bodyHtml: `
      <label class="field">タイトル<input name="title" value="${esc(g?.title ?? '')}" placeholder="週3回筋トレ、ITパスポート など" autocomplete="off"></label>
      <label class="field">期限（任意）<input name="deadline" inputmode="numeric" value="${esc(g?.deadline ?? '')}" placeholder="2026-12-31"></label>
      <div class="two">
        <label class="field">1日の回数（任意）<input name="daily" inputmode="numeric" value="${esc(g?.daily_target ?? '')}" placeholder="1"></label>
        <label class="field">1週間の回数（任意）<input name="weekly" inputmode="numeric" value="${esc(g?.weekly_target ?? '')}" placeholder="3"></label>
      </div>
      <p class="faint">回数を入れると進捗バーが出ます。空欄なら記録回数だけ数えます。</p>
      <label class="field">メモ（任意）<textarea name="description" rows="2" placeholder="なぜやるか、どうやるか など">${esc(g?.description ?? '')}</textarea></label>`,
    onOpen(form) {
      $('[name=deadline]', form).addEventListener('input', (e) => { e.target.value = formatDateInput(e.target.value); });
    },
    onSubmit(v) {
      if (!v.title.trim()) return 'タイトルを入力してください。';
      if (v.deadline.trim() && !parseDateOnly(v.deadline)) return '期限は YYYY-MM-DD の形式で入力してください。';
      const daily = parseTarget(v.daily);
      const weekly = parseTarget(v.weekly);
      if (daily === 'invalid' || weekly === 'invalid') return '目標回数は1以上の整数で入力してください。';
      const values = { title: v.title.trim(), description: v.description.trim() || null, deadline: v.deadline.trim() || null, daily_target: daily, weekly_target: weekly };
      if (g) updateGoal(g.id, values);
      else addGoal(values);
    },
    onDelete: g ? async () => {
      if (await confirmDialog({ title: '目標を削除しますか？', target: g.title, message: '記録も一緒に消えます。この操作は元に戻せません。' })) {
        deleteGoal(g.id);
        closeSheet();
      }
    } : null,
  });
}

function goalCard(goal) {
  const progress = summarizeGoalProgress(goal, state.db.goal_logs);
  const bars = progress.map((p, i) => `
    <div class="progress"><div class="top"><span>${esc(formatProgress(p))}</span>${p.ratio !== null ? `<span><span data-num="${Math.round(p.ratio * 100)}" data-k="goal-${esc(goal.id)}-${i}">${Math.round(p.ratio * 100)}</span>%</span>` : ''}</div>
    ${p.ratio === null ? '' : `<div class="bar ${p.ratio >= 1 ? 'done' : ''}"><i data-k="goal-${esc(goal.id)}-${i}" style="width:${Math.round(p.ratio * 100)}%"></i></div>`}</div>`).join('');
  // 取り消しは「今週いちばん新しい記録」を1件消す
  const latest = state.db.goal_logs
    .filter((l) => l.goal_id === goal.id && new Date(l.logged_at) >= startOfWeek())
    .sort((a, b) => b.logged_at.localeCompare(a.logged_at))[0];
  return `<section class="card" data-goal="${esc(goal.id)}">
    <div class="head-row" style="display:flex;justify-content:space-between;gap:8px"><h2>${esc(goal.title)}</h2><button class="btn small" data-edit="${esc(goal.id)}">編集</button></div>
    ${goal.deadline ? `<div class="faint">期限 ${esc(formatDateOnly(goal.deadline))}</div>` : ''}
    ${goal.description ? `<div class="muted">${esc(goal.description)}</div>` : ''}
    ${bars}
    <div class="goal-actions"><button class="btn primary" data-done="${esc(goal.id)}" aria-label="${esc(goal.title)}をやった">やった</button>
    ${latest ? `<button class="btn" data-undo="${esc(latest.id)}">取り消し</button>` : ''}</div></section>`;
}

export function renderGoals(root) {
  root.innerHTML = `
    ${header({ eyebrow: 'GOAL', title: '目標', sub: `${state.db.goals.length}件`, actions: '<button class="btn primary icon-btn" id="addGoal" aria-label="目標を追加">＋</button>' })}
    ${state.db.goals.length ? state.db.goals.map(goalCard).join('') : listOrEmpty('', ['まだ目標がありません。', '右上の＋から追加してください。'])}`;
  $('#addGoal', root).addEventListener('click', () => openGoalForm(null));
  $$('[data-edit]', root).forEach((b) => b.addEventListener('click', () => openGoalForm(b.dataset.edit)));
  $$('[data-done]', root).forEach((b) => b.addEventListener('click', () => { burst(b); addGoalLog(b.dataset.done, 1); }));
  $$('[data-undo]', root).forEach((b) => b.addEventListener('click', () => deleteGoalLog(b.dataset.undo)));
}
