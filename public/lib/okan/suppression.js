import { clampLevel } from './engine.js';
import { isWithinNightWindow, parseClock } from './rules.js';
/**
 * 同じ用件を送り直すまでの間隔。設計書§16の「23:00に言ったことを23:10に言わない」を満たす範囲で、
 * 本人の希望（通知は多め）に寄せた値。
 */
export const COOLDOWN_MINUTES = {
    HIGH: 15,
    // 45分まで縮めると設計書§16の「23:00に言って23:50はまだ黙る」を割るので60分が下限
    MEDIUM: 60,
    LOW: 120,
};
/** 1日に送る上限。添字0がおせっかい度Lv1。おせっかいなほど口数が増える。 */
export const DAILY_LIMIT_BY_LEVEL = [4, 8, 14, 20, 30];
const PRIORITY_RANK = { LOW: 0, MEDIUM: 1, HIGH: 2 };
/** おせっかい度が低いほど、優先度の高い用件しか通知しない（設計書§15）。 */
function notifiablePriorities(level) {
    if (level <= 1)
        return ['HIGH'];
    if (level === 2)
        return ['HIGH', 'MEDIUM'];
    return ['HIGH', 'MEDIUM', 'LOW'];
}
function minutesBetween(later, earlier) {
    return (later.getTime() - earlier.getTime()) / 60_000;
}
/**
 * トリガーが立っていても、実際に通知するかを決める（設計書§15・§16）。
 * 通知の送出やDB書き込みはせず、判断だけを返す純粋関数。
 */
export function decideNotification(input) {
    const { trigger, settings, now, sent } = input;
    if (!settings.notificationEnabled) {
        return { send: false, reason: '通知がオフ' };
    }
    const level = clampLevel(settings.interferenceLevel);
    if (!notifiablePriorities(level).includes(trigger.priority)) {
        return { send: false, reason: `おせっかい度${level}では${trigger.priority}を通知しない` };
    }
    const sleep = parseClock(settings.sleepTime);
    const wake = parseClock(settings.wakeTime);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const isNight = sleep !== null && wake !== null && isWithinNightWindow(nowMinutes, sleep, wake);
    if (isNight && trigger.type !== 'sleep') {
        return { send: false, reason: '就寝中は寝る話以外を通知しない' };
    }
    const last24h = sent.filter((item) => minutesBetween(now, item.sentAt) <= 24 * 60);
    const dailyLimit = DAILY_LIMIT_BY_LEVEL[level - 1];
    if (last24h.length >= dailyLimit) {
        return { send: false, reason: `24時間の通知上限${dailyLimit}件に達している` };
    }
    const lastSame = last24h
        .filter((item) => item.triggerType === trigger.type)
        .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())[0];
    if (lastSame) {
        const elapsed = minutesBetween(now, lastSame.sentAt);
        const cooldown = COOLDOWN_MINUTES[trigger.priority];
        // 状況が悪化して優先度が上がったときだけ、間隔を待たずに言い直す（設計書§16）
        const escalated = PRIORITY_RANK[trigger.priority] > PRIORITY_RANK[lastSame.priority];
        if (elapsed < cooldown && !escalated) {
            return {
                send: false,
                reason: `同じ用件を${Math.round(elapsed)}分前に通知済み（間隔${cooldown}分）`,
            };
        }
    }
    return { send: true, reason: trigger.reason };
}
