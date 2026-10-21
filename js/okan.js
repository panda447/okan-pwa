// 画面の状態から、ルールエンジンに渡す「いまの状況」を組み立てる。判定そのものは lib/okan/ の純粋関数。
import { summarizeGoalProgress } from '../lib/goalProgress.js';
import { clampLevel, decideOkanMessage } from '../lib/okan/engine.js';
import { renderShukatsuMessage, shukatsuTrigger, toShukatsuPrefs } from '../lib/shukatsu/okanDeadline.js';
import { renderIdleMessage } from '../lib/okan/templates.js';
import { toOkanSettingsInput } from '../lib/okan/types.js';
import { state, todaysSchedules } from './store.js';

export function okanSettings() {
  return toOkanSettingsInput(state.db.settings);
}

export function buildContext(now = new Date()) {
  const logs = state.db.goal_logs;
  return {
    now,
    settings: okanSettings(),
    todaysSchedules: todaysSchedules(),
    // 取得できていない天気は「条件を満たさない」扱い。憶測でおかんに喋らせない
    tomorrowRainProbability: state.forecast.data?.tomorrow?.rainProbability ?? null,
    goals: state.db.goals.map((goal) => ({ goal, progress: summarizeGoalProgress(goal, logs) })),
  };
}

const PRIORITY_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 };

/**
 * okan-app 由来の判定に、就活の締切・選考予定を足して1つ選ぶ。
 * 寝る時間は寝る話だけ（engine と同じ考え方）。同じ優先度なら、60分以内の予定 → 就活 → それ以外の順。
 */
export function currentDecision(now = new Date()) {
  const context = buildContext(now);
  const base = decideOkanMessage(context);
  if (base?.trigger.type === 'sleep') return { context, message: base };
  const trigger = shukatsuTrigger(state.db.entries, now, toShukatsuPrefs(state.db.settings));
  if (!trigger) return { context, message: base };
  const shukatsu = { trigger, text: renderShukatsuMessage(trigger, context.settings.tone, clampLevel(context.settings.interferenceLevel)) };
  if (!base) return { context, message: shukatsu };
  const diff = PRIORITY_ORDER[trigger.priority] - PRIORITY_ORDER[base.trigger.priority];
  const preferShukatsu = diff < 0 || (diff === 0 && base.trigger.type !== 'schedule');
  return { context, message: preferShukatsu ? shukatsu : base };
}

export function currentSayings(now = new Date()) {
  const { context, message } = currentDecision(now);
  return message ? message.text : renderIdleMessage(context.settings.tone);
}
