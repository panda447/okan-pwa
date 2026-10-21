import { evaluateRules } from './rules.js';
import { renderMessage } from './templates.js';
const PRIORITY_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 };
export function clampLevel(level) {
    if (!Number.isFinite(level))
        return 3;
    return Math.min(Math.max(Math.round(level), 1), 5);
}
/**
 * 今いちばん言うべきことを1つだけ選ぶ。
 *
 * おせっかい度は言い方の濃さだけを決める（設計書§11はLv1でも雨の話はする）。
 * 出すか黙るかの判断＝通知ON/直近の重複/頻度はPhase 10の通知側で行う。
 */
export function decideOkanMessage(context) {
    const level = clampLevel(context.settings.interferenceLevel);
    const triggers = evaluateRules(context);
    // 寝る時間に他の用件を持ち出さない（設計書§15の「時間帯」）
    const sleepTrigger = triggers.find((trigger) => trigger.type === 'sleep');
    const candidates = sleepTrigger ? [sleepTrigger] : triggers;
    const chosen = [...candidates].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])[0];
    if (!chosen)
        return null;
    return { trigger: chosen, text: renderMessage(chosen, context.settings.tone, level) };
}
