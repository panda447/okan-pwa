// データの読み書き。DBの行は okan-app（Supabase）と同じ列名にしてあるので、移植したロジックがそのまま使える。
import { startOfToday } from '../lib/datetime.js';
import { isActive as isEntryActive } from '../lib/shukatsu/model.js';

export const state = {
  db: emptyDb(),
  loaded: false,
  loadError: null,
  /** 画面に出す天気。DBではなく取得結果（weather.js が入れる）。 */
  forecast: { status: 'idle', data: null, error: null },
};

const listeners = new Set();
let saveStatus = { text: '', error: false };

function emptyDb() {
  return {
    version: 1, settings: null, schedules: [], goals: [], goal_logs: [], weather_cache: [], interventions: [],
    // 就活（NEXTROUND由来の機能）。entries=選考、es_items=ESアーカイブ、fit=企業フィット、vault=暗号化したログイン情報
    entries: [], es_items: [], fit: { answers: [], companies: [] }, vault: null,
  };
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function notify() {
  listeners.forEach((fn) => fn());
}
export const getSaveStatus = () => saveStatus;

const uid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

const STORAGE_KEY = 'okan-pwa-db-v1';

/** ブラウザ内（localStorage）から読む。無ければ空のデータで始める。壊れていたら読み込み失敗にして上書きしない。 */
export async function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state.db = raw ? { ...emptyDb(), ...JSON.parse(raw) } : emptyDb();
    state.loaded = true;
    state.loadError = null;
    // ブラウザの「空き容量が足りないときの自動削除」対象から外す（許可されなくても動く）
    navigator.storage?.persist?.().catch(() => {});
  } catch (e) {
    // 壊れたデータを空で上書きしてしまわないよう、保存は止める
    state.loadError = e.message;
  }
  notify();
}

function persist() {
  if (state.loaded) write();
  notify();
}

function write() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.db));
    saveStatus = { text: '保存済み', error: false };
  } catch (e) {
    saveStatus = { text: '保存に失敗: ' + e.message, error: true };
  }
}

/** JSON読み込み後など、確実に書き込みたいとき用。 */
export async function flush() {
  write();
  notify();
}

// ---------- 設定 ----------
export function saveSettings(values) {
  state.db.settings = { ...(state.db.settings || {}), ...values, updated_at: nowIso() };
  persist();
}

// ---------- 予定 ----------
export const sortedSchedules = () => [...state.db.schedules].sort((a, b) => a.start_at.localeCompare(b.start_at));

export function todaysSchedules() {
  const start = startOfToday();
  const end = new Date(start.getTime() + 86400000);
  return sortedSchedules().filter((s) => {
    const t = new Date(s.start_at);
    return t >= start && t < end;
  });
}

export function addSchedule(values) {
  const row = { id: uid(), description: null, end_at: null, location: null, ...values, created_at: nowIso(), updated_at: nowIso() };
  state.db.schedules.push(row);
  persist();
  return row;
}
export function updateSchedule(id, patch) {
  const row = state.db.schedules.find((s) => s.id === id);
  if (!row) return;
  Object.assign(row, patch, { updated_at: nowIso() });
  persist();
}
export function deleteSchedule(id) {
  state.db.schedules = state.db.schedules.filter((s) => s.id !== id);
  persist();
}

// ---------- 目標 ----------
export function addGoal(values) {
  const row = { id: uid(), description: null, deadline: null, daily_target: null, weekly_target: null, ...values, created_at: nowIso(), updated_at: nowIso() };
  state.db.goals.unshift(row);
  persist();
  return row;
}
export function updateGoal(id, patch) {
  const row = state.db.goals.find((g) => g.id === id);
  if (!row) return;
  Object.assign(row, patch, { updated_at: nowIso() });
  persist();
}
export function deleteGoal(id) {
  state.db.goals = state.db.goals.filter((g) => g.id !== id);
  state.db.goal_logs = state.db.goal_logs.filter((l) => l.goal_id !== id); // 親と一緒に消える（DBのcascade相当）
  persist();
}
export function addGoalLog(goalId, value = 1) {
  const row = { id: uid(), goal_id: goalId, value, logged_at: nowIso() };
  state.db.goal_logs.push(row);
  persist();
  return row;
}
export function deleteGoalLog(id) {
  state.db.goal_logs = state.db.goal_logs.filter((l) => l.id !== id);
  persist();
}

// ---------- 介入履歴 ----------
export function recordIntervention({ trigger, message, sentAt }) {
  const row = {
    id: uid(),
    trigger_type: trigger.type,
    priority: trigger.priority,
    message,
    reason: trigger.reason ?? null,
    sent_at: sentAt.toISOString(),
    created_at: nowIso(),
  };
  state.db.interventions.push(row);
  persist();
  return row;
}

// ---------- 天気キャッシュ ----------
export function upsertWeatherCache(days) {
  for (const day of days) {
    const row = { date: day.date, condition: day.condition, temperature: day.temperature, rain_probability: day.rainProbability, fetched_at: nowIso() };
    const i = state.db.weather_cache.findIndex((c) => c.date === day.date);
    if (i >= 0) state.db.weather_cache[i] = row;
    else state.db.weather_cache.push(row);
  }
  // 古い日付は溜めない（直近14日分だけ残す）
  state.db.weather_cache.sort((a, b) => a.date.localeCompare(b.date));
  state.db.weather_cache = state.db.weather_cache.slice(-14);
  persist();
}

// ---------- 就活：選考 ----------
/**
 * 次の選考予定に時刻があれば、予定タブにも同じ予定を置く（おかんが60分前に声をかけられるように）。
 * entry_id で紐づけ、選考側を直すたびに作り直す。手で予定を消しても、選考を保存し直せば戻る。
 */
function syncEntrySchedule(entry) {
  const i = state.db.schedules.findIndex((s) => s.entry_id === entry.id);
  const start = entry.nextDate && entry.nextTime ? new Date(`${entry.nextDate}T${entry.nextTime}:00`) : null;
  if (!start || Number.isNaN(start.getTime()) || !isEntryActive(entry)) {
    if (i >= 0) state.db.schedules.splice(i, 1);
    return;
  }
  const values = { title: `${entry.company} ${entry.nextPlan || entry.stage}`, start_at: start.toISOString(), description: '就活の選考予定（選考管理から自動で作成）' };
  if (i >= 0) Object.assign(state.db.schedules[i], values, { updated_at: nowIso() });
  else state.db.schedules.push({ id: uid(), end_at: null, location: null, ...values, entry_id: entry.id, created_at: nowIso(), updated_at: nowIso() });
}

export function addEntry(values) {
  const row = { ...values, id: uid(), created_at: nowIso(), updated_at: nowIso() };
  state.db.entries.unshift(row);
  syncEntrySchedule(row);
  persist();
  return row;
}
export function addEntries(list) {
  for (const values of list) {
    const row = { ...values, id: uid(), created_at: nowIso(), updated_at: nowIso() };
    state.db.entries.unshift(row);
    syncEntrySchedule(row);
  }
  persist();
}
export function updateEntry(id, patch) {
  const i = state.db.entries.findIndex((e) => e.id === id);
  if (i < 0) return;
  state.db.entries[i] = { ...state.db.entries[i], ...patch, updated_at: nowIso() };
  syncEntrySchedule(state.db.entries[i]);
  persist();
}
/** ステージ変更など、エントリ全体を差し替えるとき用（moveStage の結果を入れる）。 */
export function replaceEntry(entry) {
  const i = state.db.entries.findIndex((e) => e.id === entry.id);
  if (i < 0) return;
  state.db.entries[i] = entry;
  syncEntrySchedule(entry);
  persist();
}
export function deleteEntry(id) {
  state.db.entries = state.db.entries.filter((e) => e.id !== id);
  state.db.schedules = state.db.schedules.filter((s) => s.entry_id !== id);
  state.db.es_items = state.db.es_items.map((x) => (x.entry_id === id ? { ...x, entry_id: null } : x));
  persist();
}

// ---------- 就活：ESアーカイブ ----------
export function saveEsItem(values, id = null) {
  if (id) {
    const row = state.db.es_items.find((x) => x.id === id);
    if (row) Object.assign(row, values, { updated_at: nowIso() });
  } else {
    state.db.es_items.unshift({ ...values, id: uid(), created_at: nowIso(), updated_at: nowIso() });
  }
  persist();
}
export function deleteEsItem(id) {
  state.db.es_items = state.db.es_items.filter((x) => x.id !== id);
  persist();
}

// ---------- 就活：企業フィット・保管庫 ----------
export function saveFit(patch) {
  state.db.fit = { ...state.db.fit, ...patch };
  persist();
}
export function setVault(box) {
  state.db.vault = box;
  persist();
}

/** 全データを置き換える（JSON読み込み用）。 */
export function replaceAll(db) {
  state.db = { ...emptyDb(), ...db };
  state.loaded = true;
  persist();
}
