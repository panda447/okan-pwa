// 画面の状態から、ルールエンジンに渡す「いまの状況」を組み立てる。判定そのものは lib/okan/ の純粋関数。
import { summarizeGoalProgress } from '../lib/goalProgress.js';
import { decideOkanMessage } from '../lib/okan/engine.js';
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

export function currentDecision(now = new Date()) {
  const context = buildContext(now);
  return { context, message: decideOkanMessage(context) };
}

export function currentSayings(now = new Date()) {
  const { context, message } = currentDecision(now);
  return message ? message.text : renderIdleMessage(context.settings.tone);
}
