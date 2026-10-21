import { formatTimeInput } from '../../lib/datetime.js';
import { parseClock } from '../../lib/okan/rules.js';
import { renderMessage } from '../../lib/okan/templates.js';
import { okanSettings } from '../okan.js';
import { permission, plannedStatus, requestPermission, supported } from '../notify.js';
import { flush, getSaveStatus, replaceAll, saveSettings, state } from '../store.js';
import { $, esc, header, segmented, toast, confirmDialog } from '../ui.js';

/** 設計書§11のおせっかい度。数字だけでは伝わらないので言葉を添える。 */
const LEVEL_DESCRIPTIONS = { 1: '必要最低限だけ伝えます。', 2: '少し親切に声をかけます。', 3: '標準的なおかんです。', 4: 'かなり世話を焼きます。', 5: 'かなりおせっかいです。' };
const PREVIEW_TRIGGER = { type: 'weather', priority: 'MEDIUM', reason: '', rainProbability: 80 };
const PERMISSION_LABELS = { granted: '許可済み', denied: '拒否されています（ブラウザの設定から変更）', default: '未設定', unsupported: 'このブラウザは非対応' };

function previewText(tone, level) {
  return renderMessage(PREVIEW_TRIGGER, tone, level);
}

export function renderSettings(root) {
  const s = okanSettings();
  const status = plannedStatus();
  const next = status.nextDate ? status.nextDate.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'なし';
  const save = getSaveStatus();
  root.innerHTML = `
    ${header({ eyebrow: 'MORE', title: '設定', sub: 'おかんの話し方と通知' })}
    <form class="card" id="okanForm" novalidate>
      <div class="eyebrow">OKAN</div><h2>おかんの設定</h2>
      <p class="muted" style="margin-bottom:6px">おせっかい度</p>
      ${segmented('level', [1, 2, 3, 4, 5].map((n) => ({ value: n, label: n })), s.interferenceLevel)}
      <p class="faint" id="levelHint">${esc(LEVEL_DESCRIPTIONS[s.interferenceLevel])}</p>
      <p class="muted" style="margin-bottom:6px">口調</p>
      ${segmented('tone', [{ value: 'standard', label: '標準' }, { value: 'kansai', label: '関西' }], s.tone)}
      <div class="preview"><div class="eyebrow">こんな言い方になります</div><div id="previewText">${esc(previewText(s.tone, s.interferenceLevel))}</div></div>
      <div class="two">
        <label class="field">就寝時刻<input name="sleep" inputmode="numeric" value="${esc(s.sleepTime)}" placeholder="23:00"></label>
        <label class="field">起床時刻<input name="wake" inputmode="numeric" value="${esc(s.wakeTime)}" placeholder="07:00"></label>
      </div>
      <p class="faint">この時間帯は、寝る話以外を通知しません。</p>
      <p class="muted" style="margin-bottom:6px">通知</p>
      ${segmented('notify', [{ value: 'on', label: 'オン' }, { value: 'off', label: 'オフ' }], s.notificationEnabled ? 'on' : 'off')}
      <p class="warn" id="notifyWarn" ${s.notificationEnabled ? 'hidden' : ''}>オフの間は、おかんが声をかける条件を満たしても通知が届きません。</p>
      <p class="err" id="settingsError" role="alert" hidden></p>
      <div class="form-actions"><span id="savedNote" class="muted"></span><span class="grow"></span><button type="submit" class="btn primary">保存する</button></div>
    </form>

    <section class="card">
      <div class="eyebrow">NOTIFY</div><h2>通知の状態</h2>
      <p>ブラウザの通知：<b>${esc(PERMISSION_LABELS[permission()] ?? permission())}</b></p>
      ${supported && permission() === 'default' ? '<button class="btn small" id="askPerm">通知を許可する</button>' : ''}
      <p>予約中：<b>${status.count}件</b>（次の予定通知：${esc(next)}）</p>
      <p class="warn" style="margin-bottom:0">通知は、このアプリを開いている間だけ届きます。閉じている間は届きません（Web版の制約）。</p>
    </section>

    <section class="card">
      <div class="eyebrow">DATA</div><h2>データ</h2>
      <p class="muted">予定 ${state.db.schedules.length}件 / 目標 ${state.db.goals.length}件 / 履歴 ${state.db.interventions.length}件。このPCの <code>data/data.json</code> に保存されます（${esc(save.text || '—')}）。</p>
      <div class="goal-actions"><button class="btn" id="exportBtn">JSONを書き出す</button><button class="btn" id="importBtn">JSONを読み込む（置き換え）</button><input type="file" id="importFile" accept="application/json,.json" hidden></div>
    </section>`;

  const form = $('#okanForm', root);
  const read = () => ({
    level: Number(new FormData(form).get('level')),
    tone: new FormData(form).get('tone'),
  });
  // 設定の効き方をその場で見せる
  form.addEventListener('change', () => {
    const { level, tone } = read();
    $('#levelHint', root).textContent = LEVEL_DESCRIPTIONS[level];
    $('#previewText', root).textContent = previewText(tone, level);
    $('#notifyWarn', root).hidden = new FormData(form).get('notify') === 'on';
    $('#savedNote', root).textContent = '';
  });
  ['sleep', 'wake'].forEach((n) => $(`[name=${n}]`, form).addEventListener('input', (e) => { e.target.value = formatTimeInput(e.target.value); }));

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const err = $('#settingsError', root);
    if (parseClock(String(fd.get('sleep'))) === null || parseClock(String(fd.get('wake'))) === null) {
      err.textContent = '時刻は HH:MM の形式で入力してください。';
      err.hidden = false;
      return;
    }
    err.hidden = true;
    saveSettings({
      tone: fd.get('tone'),
      interference_level: Number(fd.get('level')),
      sleep_time: String(fd.get('sleep')),
      wake_time: String(fd.get('wake')),
      notification_enabled: fd.get('notify') === 'on',
    });
    // 通知を使う設定にしたら、許可を求める（ユーザー操作の直後だけ表示される）
    if (fd.get('notify') === 'on' && permission() === 'default') requestPermission().then(() => renderSettings(root));
    toast('設定', '保存しました。');
  });

  $('#askPerm', root)?.addEventListener('click', async () => { await requestPermission(); renderSettings(root); });

  $('#exportBtn', root).addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(state.db, null, 2)], { type: 'application/json' }));
    a.download = `okan-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#importBtn', root).addEventListener('click', () => $('#importFile', root).click());
  $('#importFile', root).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      const keys = ['schedules', 'goals', 'goal_logs', 'interventions'];
      if (!d || !keys.every((k) => Array.isArray(d[k]))) throw new Error('形式が違います（schedules / goals / goal_logs / interventions が必要）');
      const ok = await confirmDialog({
        title: 'データを置き換えますか？',
        message: `今のデータ（予定${state.db.schedules.length}件・目標${state.db.goals.length}件）が、読み込むデータ（予定${d.schedules.length}件・目標${d.goals.length}件）で置き換わります。`,
        okLabel: '置き換える',
      });
      if (!ok) return;
      replaceAll({ weather_cache: [], settings: null, ...d });
      await flush();
    } catch (err) {
      toast('読み込めませんでした', err.message);
    }
  });
}
