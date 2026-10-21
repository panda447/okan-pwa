// 通知。アプリ（タブ/PWA）を開いている間だけ動く。閉じている間は届かない（Webの制約。README参照）。
// - 予定の60分前と就寝時刻 … lib/okan/schedulePlan の予約表を、時刻が来たら出す
// - 天気・目標・達成        … lib/okan/suppression の6条件を通ったものだけ出す
// どちらも「ユーザーに届いた」ときだけ介入履歴に書く（届いていないものを履歴に残さない）。
import { planNotifications } from '../lib/okan/schedulePlan.js';
import { decideNotification } from '../lib/okan/suppression.js';
import { toDateInput } from '../lib/datetime.js';
import { sortedSchedules, recordIntervention, state } from './store.js';
import { currentDecision, okanSettings } from './okan.js';
import { toast } from './ui.js';

export const supported = 'Notification' in window;
export const permission = () => (supported ? Notification.permission : 'unsupported');

export async function requestPermission() {
  if (!supported) return 'unsupported';
  return Notification.requestPermission();
}

/** 予約時刻から何分までなら出すか。それより遅れたら、内容（○分後）が嘘になるので出さない。 */
const FIRE_WINDOW_MS = 5 * 60_000;
const FIRED_KEY = 'okan-fired-v1';

function loadFired() {
  try { return new Set(JSON.parse(localStorage.getItem(FIRED_KEY) || '[]')); } catch { return new Set(); }
}
function rememberFired(set) {
  try { localStorage.setItem(FIRED_KEY, JSON.stringify([...set].slice(-300))); } catch { /* 保存できなくても動く */ }
}

// ---------- 予約表 ----------
let plan = [];
let planInput = '';

/** 設定か予定が変わったときだけ作り直す。now を固定するので「1分後に救済」は1回しか起きない。 */
export function currentPlan(now = new Date()) {
  const settings = okanSettings();
  const input = JSON.stringify([settings, state.db.schedules.map((s) => [s.id, s.title, s.start_at])]);
  if (input !== planInput) {
    planInput = input;
    plan = planNotifications({ now, settings, schedules: sortedSchedules() });
  }
  return plan;
}

export function plannedStatus(now = new Date()) {
  const items = currentPlan(now);
  const dates = items.filter((i) => i.trigger.kind === 'date').map((i) => i.trigger.date).filter((d) => d.getTime() >= now.getTime()).sort((a, b) => a - b);
  return { count: items.length, nextDate: dates[0] ?? null };
}

// ---------- 配信 ----------
async function showSystemNotification(title, body) {
  const options = { body, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'okan' };
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg) return void (await reg.showNotification(title, options));
  } catch { /* 下のフォールバックへ */ }
  new Notification(title, options);
}

/** 画面が見えていればバナー、許可があればOSの通知。どちらも出せなければ false（履歴に残さない）。 */
async function deliver(title, body) {
  let delivered = false;
  if (document.visibilityState === 'visible') {
    toast(title, body);
    delivered = true;
  }
  if (supported && Notification.permission === 'granted') {
    try { await showSystemNotification(title, body); delivered = true; } catch { /* 画面側で届いていればよい */ }
  }
  return delivered;
}

// ---------- 判定ループ ----------
function plannedFireTime(item, now) {
  if (item.trigger.kind === 'date') return item.trigger.date;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), item.trigger.hour, item.trigger.minute, 0, 0);
}

async function runPlanned(now) {
  const fired = loadFired();
  for (const item of currentPlan(now)) {
    const when = plannedFireTime(item, now);
    const late = now.getTime() - when.getTime();
    if (late < 0 || late > FIRE_WINDOW_MS) continue;

    const schedule = item.key.startsWith('schedule:') ? state.db.schedules.find((s) => s.id === item.key.slice(9)) : null;
    // 予定は「その予定の開始時刻」で、就寝は「その日」で一度きりにする
    const firedKey = schedule ? `${item.key}|${schedule.start_at}` : `${item.key}|${toDateInput(now)}`;
    if (fired.has(firedKey)) continue;

    if (await deliver('おかんから', item.body)) {
      fired.add(firedKey);
      rememberFired(fired);
      const isSchedule = Boolean(schedule);
      recordIntervention({
        trigger: { type: isSchedule ? 'schedule' : 'sleep', priority: 'MEDIUM', reason: isSchedule ? '予定の60分前' : '就寝時刻になった' },
        message: item.body,
        sentAt: new Date(),
      });
    }
  }
}

let handledKey = null;
const SCHEDULED_ELSEWHERE = ['schedule', 'sleep'];

async function runReactive(now) {
  const { context, message } = currentDecision(now);
  if (!message || SCHEDULED_ELSEWHERE.includes(message.trigger.type)) return;

  const key = `${message.trigger.type}:${message.text}`;
  if (handledKey === key) return;
  handledKey = key;

  const sent = state.db.interventions
    .filter((i) => i.sent_at)
    .map((i) => ({ triggerType: i.trigger_type, priority: i.priority, sentAt: new Date(i.sent_at) }));
  const decision = decideNotification({ trigger: message.trigger, settings: context.settings, now, sent });
  if (!decision.send) return;

  if (await deliver('おかんから', message.text)) {
    recordIntervention({ trigger: message.trigger, message: message.text, sentAt: new Date() });
  } else {
    handledKey = null; // 届けられなかった用件は、次の判定でもう一度拾う
  }
}

let running = false;
export async function tick() {
  if (running || !state.loaded) return;
  if (!okanSettings().notificationEnabled) return;
  running = true;
  try {
    const now = new Date();
    await runPlanned(now);
    await runReactive(now);
  } finally {
    running = false;
  }
}

export function startNotifier() {
  setInterval(tick, 20_000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); });
  tick();
}
