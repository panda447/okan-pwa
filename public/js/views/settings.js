import { formatTimeInput } from '../../lib/datetime.js';
import { parseClock } from '../../lib/okan/rules.js';
import { renderMessage } from '../../lib/okan/templates.js';
import { okanSettings } from '../okan.js';
import { permission, plannedStatus, requestPermission, supported } from '../notify.js';
import { clearWeatherCache, flush, getSaveStatus, replaceAll, saveSettings, state } from '../store.js';
import { $, esc, header, segmented, toast, confirmDialog } from '../ui.js';
import { DEADLINE_LEAD_OPTIONS, toShukatsuPrefs } from '../../lib/shukatsu/okanDeadline.js';
import { DEFAULT_LOCATION, isSameLocation, resolveLocation, searchPlaces } from '../../lib/weather.js';
import { refreshForecast } from '../weather.js';
import { decodeSyncCode, encodeSyncCode } from '../syncCode.js';

const LEAD_LABELS = { 0: 'オフ', 1: '前日', 3: '3日前', 7: '7日前' };
const DATA_KEYS = ['schedules', 'goals', 'goal_logs', 'interventions'];
/** 読み込むデータの形を確かめる。就活の項目は古い書き出しに無いので任意。 */
function checkImported(d) {
  if (!d || !DATA_KEYS.every((k) => Array.isArray(d[k]))) throw new Error('形式が違います（schedules / goals / goal_logs / interventions が必要）');
  for (const k of ['entries', 'es_items']) if (k in d && !Array.isArray(d[k])) throw new Error(`${k} の形式が違います`);
  return d;
}
async function confirmReplace(d) {
  return confirmDialog({
    title: 'データを置き換えますか？',
    message: `今のデータ（予定${state.db.schedules.length}件・目標${state.db.goals.length}件・選考${state.db.entries.length}件・ES${state.db.es_items.length}件）が、読み込むデータ（予定${d.schedules.length}件・目標${d.goals.length}件・選考${(d.entries || []).length}件・ES${(d.es_items || []).length}件）で置き換わります。`,
    okLabel: '置き換える',
  });
}

/** 設計書§11のおせっかい度。数字だけでは伝わらないので言葉を添える。 */
const LEVEL_DESCRIPTIONS = { 1: '必要最低限だけ伝えます。', 2: '少し親切に声をかけます。', 3: '標準的なおかんです。', 4: 'かなり世話を焼きます。', 5: 'かなりおせっかいです。' };
const PREVIEW_TRIGGER = { type: 'weather', priority: 'MEDIUM', reason: '', rainProbability: 80 };
const PERMISSION_LABELS = { granted: '許可済み', denied: '拒否されています（ブラウザの設定から変更）', default: '未設定', unsupported: 'このブラウザは非対応' };

function previewText(tone, level) {
  return renderMessage(PREVIEW_TRIGGER, tone, level);
}

/** 地名検索は大きな市だと「市」まで要る（「京都」は0件、「京都市」で見つかる）ので、例で伝える。 */
const NO_PLACE_MESSAGE = '見つかりませんでした。「京都市」「札幌市」のように市区町村名まで入れてみてください。';
const SEARCH_FAILED_MESSAGE = '地名を検索できませんでした。通信状況を確かめて、もう一度お試しください。';

/**
 * 天気の地点の、保存前の状態。設定画面は保存や天気の更新のたびに描き直されるので、検索結果を画面の外に持つ。
 * selected: undefined＝まだ選んでいない（保存済みのまま）／null＝初期値に戻す／地点＝その地点を選んだ。
 */
const placeDraft = { query: '', results: null, selected: undefined, message: '', searching: false };
const resetPlaceDraft = () => Object.assign(placeDraft, { query: '', results: null, selected: undefined, message: '' });
// 保存せずに設定から離れたら、選びかけの地点は捨てる（他の項目と同じ扱い）
window.addEventListener('hashchange', () => { if (!location.hash.startsWith('#/settings')) resetPlaceDraft(); });

/** 保存するときの地点。選んでいなければ保存済みの値。 */
const chosenPlace = () => (placeDraft.selected === undefined ? okanSettings().weatherLocation : placeDraft.selected);
const isPicked = (place, chosen) => chosen != null && place.name === chosen.name && isSameLocation(place, chosen);

/** 地点の欄だけを描き直す（フォームの他の入力を消さないため）。 */
function paintPlace(root) {
  const current = $('#placeCurrent', root);
  if (!current) return; // 検索中に別の画面へ移った
  const saved = okanSettings().weatherLocation;
  const chosen = chosenPlace();
  current.textContent = resolveLocation(chosen).name;
  $('#placePending', root).hidden = isSameLocation(chosen, saved);
  $('#placeReset', root).hidden = chosen === null;
  const btn = $('#placeSearch', root);
  btn.disabled = placeDraft.searching;
  btn.textContent = placeDraft.searching ? '探しています…' : '探す';
  const msg = $('#placeMsg', root);
  msg.textContent = placeDraft.message;
  msg.hidden = !placeDraft.message;
  $('#placeList', root).innerHTML = (placeDraft.results ?? [])
    .map((p, i) => `<button type="button" class="chip${isPicked(p, chosen) ? ' on' : ''}" aria-pressed="${isPicked(p, chosen)}" data-place="${i}">${esc(p.name)}</button>`)
    .join('');
}

async function runPlaceSearch(root) {
  if (placeDraft.searching) return;
  if (!placeDraft.query.trim()) {
    placeDraft.message = '地名を入力してください。';
    paintPlace(root);
    return;
  }
  placeDraft.searching = true;
  placeDraft.message = '';
  paintPlace(root);
  try {
    const found = await searchPlaces(placeDraft.query);
    placeDraft.results = found;
    placeDraft.message = found.length ? '' : NO_PLACE_MESSAGE;
  } catch {
    placeDraft.results = null;
    placeDraft.message = SEARCH_FAILED_MESSAGE;
  } finally {
    placeDraft.searching = false;
  }
  paintPlace(root);
}

export function renderSettings(root) {
  const s = okanSettings();
  const job = toShukatsuPrefs(state.db.settings);
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
      <p class="muted" style="margin:14px 0 2px">天気の地点</p>
      <p class="place-current"><b id="placeCurrent"></b></p>
      <p class="faint" id="placePending" hidden>保存すると、この地点の天気に切り替わります。</p>
      <div class="place-search">
        <label class="field">地名で探す<input name="placeQuery" id="placeQuery" enterkeyhint="search" autocomplete="off" placeholder="例：新宿、京都市" value="${esc(placeDraft.query)}"></label>
        <button type="button" class="btn" id="placeSearch">探す</button>
      </div>
      <p class="warn" id="placeMsg" role="status" hidden></p>
      <div class="place-list" id="placeList" aria-label="天気の地点の候補"></div>
      <button type="button" class="btn small ghost" id="placeReset" hidden>初期値（${esc(DEFAULT_LOCATION.name)}）に戻す</button>
      <p class="muted" style="margin-bottom:6px">通知</p>
      ${segmented('notify', [{ value: 'on', label: 'オン' }, { value: 'off', label: 'オフ' }], s.notificationEnabled ? 'on' : 'off')}
      <p class="warn" id="notifyWarn" ${s.notificationEnabled ? 'hidden' : ''}>オフの間は、おかんが声をかける条件を満たしても通知が届きません。</p>
      <p class="muted" style="margin:14px 0 6px">就活の締切を言い始める時期</p>
      ${segmented('lead', DEADLINE_LEAD_OPTIONS.map((n) => ({ value: n, label: LEAD_LABELS[n] })), job.deadlineLeadDays)}
      <p class="muted" style="margin:12px 0 6px">選考・説明会の当日に声をかける</p>
      ${segmented('event', [{ value: 'on', label: 'オン' }, { value: 'off', label: 'オフ' }], job.eventNotice ? 'on' : 'off')}
      <p class="faint">締切が今日・明日のとき、内定の回答期限が3日以内のときは、おせっかい度1でも声をかけます。</p>
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
      <p class="muted">予定 ${state.db.schedules.length}件 / 目標 ${state.db.goals.length}件 / 選考 ${state.db.entries.length}件 / ES ${state.db.es_items.length}件 / 履歴 ${state.db.interventions.length}件。このブラウザの中だけに保存されます（${esc(save.text || '—')}）。ブラウザのデータを消すと失われるので、ときどき「JSONを書き出す」でバックアップを取ってください。</p>
      <div class="goal-actions"><button class="btn" id="exportBtn">JSONを書き出す</button><button class="btn" id="importBtn">JSONを読み込む（置き換え）</button><input type="file" id="importFile" accept="application/json,.json" hidden></div>
      <p class="muted" style="margin-top:14px">スマホとPCでデータを移すときは「同期コード」が手軽です（コピーして、もう一方の端末で貼り付ける）。マイページのログイン情報は暗号化されたまま入ります。</p>
      <div class="goal-actions"><button class="btn" id="makeCode">同期コードをコピー</button><button class="btn" id="readCode">同期コードを貼り付けて読み込む</button></div>
    </section>

    <section class="card">
      <div class="eyebrow">LOG</div><h2>おかんの記録</h2>
      <p class="muted">おかんが声をかけた履歴（${state.db.interventions.length}件）。</p>
      <a class="btn" href="#/log">記録を見る ›</a>
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

  // 天気の地点：検索は保存（フォーム送信）とは別。Enterでも探せるが、送信はさせない
  const placeQuery = $('#placeQuery', form);
  placeQuery.addEventListener('input', () => {
    placeDraft.query = placeQuery.value;
    placeDraft.message = '';
    $('#placeMsg', root).hidden = true;
  });
  placeQuery.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return; // 変換確定のEnterは通す
    e.preventDefault();
    runPlaceSearch(root);
  });
  $('#placeSearch', form).addEventListener('click', () => runPlaceSearch(root));
  $('#placeList', form).addEventListener('click', (e) => {
    const btn = e.target.closest('[data-place]');
    if (!btn) return;
    placeDraft.selected = placeDraft.results[Number(btn.dataset.place)];
    $('#savedNote', root).textContent = '';
    paintPlace(root);
  });
  $('#placeReset', form).addEventListener('click', () => {
    placeDraft.selected = null;
    $('#savedNote', root).textContent = '';
    paintPlace(root);
  });
  paintPlace(root);

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
    const place = chosenPlace();
    const placeChanged = !isSameLocation(okanSettings().weatherLocation, place);
    // 保存で設定画面が描き直されるので、選びかけの状態は先に片付ける
    resetPlaceDraft();
    saveSettings({
      tone: fd.get('tone'),
      interference_level: Number(fd.get('level')),
      sleep_time: String(fd.get('sleep')),
      wake_time: String(fd.get('wake')),
      notification_enabled: fd.get('notify') === 'on',
      shukatsu_deadline_days: Number(fd.get('lead')),
      shukatsu_event_notice: fd.get('event') === 'on',
      // 初期値（近江八幡市）に戻すときは3つとも null
      weather_location_name: place?.name ?? null,
      weather_latitude: place?.latitude ?? null,
      weather_longitude: place?.longitude ?? null,
    });
    paintPlace(root); // 入力欄にフォーカスがあると描き直しが止まるので、地点の欄だけは確実に直す
    if (placeChanged) {
      // 前の地点の天気を「前回の値」として出さないよう消してから、新しい地点で取り直す
      clearWeatherCache();
      refreshForecast();
    }
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
      const d = checkImported(JSON.parse(await file.text()));
      if (!(await confirmReplace(d))) return;
      replaceAll({ weather_cache: [], settings: null, ...d });
      await flush();
    } catch (err) {
      toast('読み込めませんでした', err.message);
    }
  });

  $('#makeCode', root).addEventListener('click', async () => {
    try {
      const code = await encodeSyncCode(state.db);
      await navigator.clipboard.writeText(code);
      toast('同期コード', `コピーしました（${code.length.toLocaleString()}文字）。もう一方の端末で「貼り付けて読み込む」を押してください。`);
    } catch (err) {
      toast('コピーできませんでした', err.message);
    }
  });
  $('#readCode', root).addEventListener('click', async () => {
    let text = '';
    try { text = await navigator.clipboard.readText(); } catch { text = window.prompt('同期コードを貼り付けてください') || ''; }
    if (!text.trim()) return;
    try {
      const d = checkImported(await decodeSyncCode(text));
      if (!(await confirmReplace(d))) return;
      replaceAll({ weather_cache: [], settings: null, ...d });
      await flush();
      toast('同期コード', '読み込みました。');
    } catch (err) {
      toast('読み込めませんでした', err.message);
    }
  });
}
