// 選考の追加・編集フォーム。選考タブとカレンダー（予定タブ）の両方から開く。
import { formatDateInput, formatTimeInput, toHalfWidth } from '../../lib/datetime.js';
import {
  ENTRY_TYPES, INDUSTRIES, INTERN_SEASONS, SELECTION_TAGS, activeSequence, defaultFlowFor, flowSummary, isDateKey,
  moveStage, normalizeEntry, seedHistory, stageOptions, standardFlowSteps,
} from '../../lib/shukatsu/model.js';
import { addEntry, deleteEntry, replaceEntry, state } from '../store.js';
import { $, $$, closeSheet, confirmDialog, esc, openSheet, segmented } from '../ui.js';

const opts = (values, selected) => values.map((v) => `<option value="${esc(v)}" ${v === selected ? 'selected' : ''}>${esc(v)}</option>`).join('');
const checks = (name, values, selected) => `<div class="checks">${values.map((v) => `<label><input type="checkbox" name="${esc(name)}" value="${esc(v)}" ${selected.includes(v) ? 'checked' : ''}>${esc(v)}</label>`).join('')}</div>`;

function body(e) {
  const flow = flowSummary(e.flowSteps);
  const standard = standardFlowSteps(flow).join('\n');
  const custom = e.flowSteps.join('\n') === standard ? '' : e.flowSteps.filter((s) => s !== '結果待ち').join('\n');
  return `
    <label class="field">企業名<input name="company" value="${esc(e.company)}" autocomplete="off" placeholder="株式会社〇〇"></label>
    <p class="muted" style="margin:0 0 6px">種別</p>
    ${segmented('type', ENTRY_TYPES.map((t) => ({ value: t, label: t === 'OB/OG訪問' ? 'OB訪問' : t })), e.type)}
    <div class="two" style="margin-top:12px">
      <label class="field" data-show="intern">時期<select name="internSeason">${opts(INTERN_SEASONS, e.internSeason)}</select></label>
      <label class="field">業界<select name="industry">${opts(INDUSTRIES, e.industry)}</select></label>
    </div>
    <label class="field">職種・コース（任意）<input name="role" value="${esc(e.role)}" placeholder="SE職 / 5days など"></label>

    <fieldset class="box"><legend>選考フロー</legend>
      ${checks('flow', ['ES', 'Webテスト', 'GD'], [flow.es && 'ES', flow.webTest && 'Webテスト', flow.gd && 'GD'].filter(Boolean))}
      <p class="muted" style="margin:8px 0 6px">面接の回数</p>
      ${segmented('interviews', [0, 1, 2, 3].map((n) => ({ value: n, label: `${n}回` })), flow.interviews)}
      <label class="field" style="margin-top:10px">独自のステップ（任意・1行に1つ。書くと上の設定より優先）<textarea name="customSteps" rows="3" placeholder="気になる&#10;応募予定&#10;ES提出済&#10;人事面談&#10;最終面接">${esc(custom)}</textarea></label>
      ${checks('tags', SELECTION_TAGS, e.selectionTags)}
    </fieldset>

    <label class="field">いまの段階<select name="stage" id="stageSelect"></select></label>
    <div class="two">
      <label class="field">締切（任意）<input name="deadline" inputmode="numeric" value="${esc(e.deadline)}" placeholder="2026-11-05"></label>
      <label class="field">マイページURL（任意）<input name="portalUrl" type="url" value="${esc(e.portalUrl)}" placeholder="https://"></label>
    </div>
    <fieldset class="box"><legend>次の予定</legend>
      <div class="two">
        <label class="field">日付<input name="nextDate" inputmode="numeric" value="${esc(e.nextDate)}" placeholder="2026-11-10"></label>
        <label class="field">時刻（任意）<input name="nextTime" inputmode="numeric" value="${esc(e.nextTime)}" placeholder="13:00"></label>
      </div>
      <label class="field">内容<input name="nextPlan" value="${esc(e.nextPlan)}" placeholder="一次面接（Zoom）"></label>
      <p class="faint" style="margin:0">時刻まで入れると予定タブにも入り、おかんが60分前に声をかけます。</p>
    </fieldset>
    <fieldset class="box" data-show="intern"><legend>インターンの参加日</legend>
      ${segmented('internMode', [{ value: 'single', label: '1日' }, { value: 'range', label: '期間' }, { value: 'custom', label: '飛び飛び' }], e.internMode)}
      <div class="two" style="margin-top:10px">
        <label class="field" data-mode="single range">開始日<input name="internStart" inputmode="numeric" value="${esc(e.internStart)}" placeholder="2026-12-09"></label>
        <label class="field" data-mode="range">終了日<input name="internEnd" inputmode="numeric" value="${esc(e.internEnd)}" placeholder="2026-12-10"></label>
      </div>
      <label class="field" data-mode="custom">参加日（1行に1日）<textarea name="internDates" rows="3" placeholder="2026-12-09&#10;2026-12-16">${esc(e.internDates.join('\n'))}</textarea></label>
    </fieldset>
    <label class="field">メモ（任意）<textarea name="memo" rows="3">${esc(e.memo)}</textarea></label>`;
}

/** フォームの値からフローのステップを組む。 */
function stepsFromForm(form) {
  const fd = new FormData(form);
  const custom = String(fd.get('customSteps') || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (custom.length) return custom;
  const flow = fd.getAll('flow');
  return standardFlowSteps({ es: flow.includes('ES'), webTest: flow.includes('Webテスト'), gd: flow.includes('GD'), interviews: Number(fd.get('interviews')) });
}

function refresh(form, stage) {
  const fd = new FormData(form);
  const type = fd.get('type');
  const draft = { type, flowSteps: stepsFromForm(form), selectionTags: fd.getAll('tags') };
  const select = $('#stageSelect', form);
  const current = stage ?? select.value;
  const options = stageOptions(normalizeEntry(draft));
  if (current && !options.includes(current)) options.unshift(current);
  select.innerHTML = opts(options, current || activeSequence(draft)[1]);
  $$('[data-show="intern"]', form).forEach((el) => { el.hidden = type !== 'インターン'; });
  const mode = fd.get('internMode');
  $$('[data-mode]', form).forEach((el) => { el.hidden = !el.dataset.mode.split(' ').includes(mode); });
}

function validate(v, form) {
  if (!String(v.company || '').trim()) return '企業名を入力してください。';
  for (const [name, label] of [['deadline', '締切'], ['nextDate', '次の予定の日付'], ['internStart', '開始日'], ['internEnd', '終了日']]) {
    if (v[name] && !isDateKey(v[name])) return `${label}は YYYY-MM-DD の形式で入力してください。`;
  }
  if (v.nextTime && !/^\d{2}:\d{2}$/.test(v.nextTime)) return '時刻は HH:MM の形式で入力してください。';
  if (v.nextTime && !v.nextDate) return '時刻を入れるときは、日付も入れてください。';
  if (v.portalUrl && !/^https?:\/\//i.test(v.portalUrl)) return 'マイページURLは https:// から入力してください。';
  const bad = v.internDates.find((d) => !isDateKey(d));
  if (bad) return `参加日「${bad}」は YYYY-MM-DD の形式で入力してください。`;
  if (v.internMode === 'range' && v.internStart && v.internEnd && v.internEnd < v.internStart) return '終了日は開始日より後にしてください。';
  if (stepsFromForm(form).length > 30) return '選考ステップは30個までにしてください。';
  return null;
}

export function openEntryForm(id = null, preset = {}) {
  const initial = id ? state.db.entries.find((e) => e.id === id) : null;
  const e = normalizeEntry(initial ?? { type: 'インターン', flowSteps: defaultFlowFor('インターン'), ...preset });
  openSheet({
    title: initial ? `${initial.company} を編集` : '選考を追加',
    submitLabel: initial ? '保存する' : '追加する',
    bodyHtml: body(e),
    onOpen(form) {
      refresh(form, e.stage);
      form.addEventListener('change', (ev) => {
        if (ev.target.name === 'type' && !initial) {
          // 新規のときだけ、種別に合った標準の流れへ切り替える
          const f = flowSummary(defaultFlowFor(ev.target.value));
          $$('[name=flow]', form).forEach((c) => { c.checked = (c.value === 'ES' && f.es) || (c.value === 'Webテスト' && f.webTest) || (c.value === 'GD' && f.gd); });
          $$('[name=interviews]', form).forEach((r) => { r.checked = Number(r.value) === f.interviews; });
        }
        if (ev.target.name !== 'stage') refresh(form);
      });
      const mask = (name, fn) => $(`[name=${name}]`, form).addEventListener('input', (ev) => { ev.target.value = fn(ev.target.value); });
      ['deadline', 'nextDate', 'internStart', 'internEnd'].forEach((n) => mask(n, formatDateInput));
      mask('nextTime', formatTimeInput);
    },
    onSubmit(raw) {
      const form = document.getElementById('sheetForm');
      const fd = new FormData(form);
      const v = {
        ...raw,
        company: String(raw.company).trim(),
        deadline: toHalfWidth(raw.deadline).trim(),
        nextDate: toHalfWidth(raw.nextDate).trim(),
        nextTime: toHalfWidth(raw.nextTime).trim(),
        internStart: toHalfWidth(raw.internStart || '').trim(),
        internEnd: toHalfWidth(raw.internEnd || '').trim(),
        internDates: toHalfWidth(raw.internDates || '').split(/[\s,、]+/).map((s) => s.trim()).filter(Boolean),
        portalUrl: String(raw.portalUrl || '').trim(),
        selectionTags: fd.getAll('tags'),
      };
      const error = validate(v, form);
      if (error) return error;
      const next = normalizeEntry({ ...(initial ?? {}), ...v, flowSteps: stepsFromForm(form), stage: initial?.stage ?? v.stage });
      if (initial) {
        replaceEntry(next.stage === v.stage ? next : moveStage(next, v.stage, 'edit'));
      } else {
        addEntry({ ...next, history: seedHistory(next) });
      }
    },
    onDelete: initial ? async () => {
      if (await confirmDialog({ title: '選考を削除しますか？', target: initial.company, message: '選考履歴・自動で作った予定も消えます。この操作は元に戻せません。' })) {
        deleteEntry(initial.id);
        closeSheet();
      }
    } : null,
  });
}
