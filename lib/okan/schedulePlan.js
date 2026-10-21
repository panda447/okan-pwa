import { SCHEDULE_LEAD_MINUTES, parseClock } from './rules.js';
import { renderMessage } from './templates.js';
import { clampLevel } from './engine.js';
/** iOSは予約できるローカル通知が64件までなので、予定はここまでに絞る。 */
export const MAX_PLANNED_SCHEDULES = 32;
/** 60分前を過ぎてから登録された予定でも黙らないよう、最短でもこれだけ後に知らせる。 */
const MIN_DELAY_MINUTES = 1;
/**
 * アプリを閉じていても届かせたい通知を、いつ何を出すかまで決めて返す。
 * 端末への予約は hooks 側が行い、ここでは何も実行しない。
 */
export function planNotifications(input) {
    const { now, settings, schedules } = input;
    if (!settings.notificationEnabled)
        return [];
    const level = clampLevel(settings.interferenceLevel);
    const planned = [];
    const sleep = parseClock(settings.sleepTime);
    if (sleep !== null) {
        planned.push({
            key: 'sleep',
            body: renderMessage({ type: 'sleep', priority: 'MEDIUM', reason: '就寝時刻になった', minutesLate: 0 }, settings.tone, level),
            trigger: { kind: 'daily', hour: Math.floor(sleep / 60), minute: sleep % 60 },
        });
    }
    const earliest = now.getTime() + MIN_DELAY_MINUTES * 60_000;
    const upcoming = schedules
        .map((schedule) => {
        const startAt = new Date(schedule.start_at).getTime();
        const leadAt = startAt - SCHEDULE_LEAD_MINUTES * 60_000;
        return { schedule, startAt, notifyAt: Math.max(leadAt, earliest) };
    })
        // 知らせる時点で予定がまだ先にあるものだけ
        .filter((item) => item.notifyAt < item.startAt)
        .sort((a, b) => a.notifyAt - b.notifyAt)
        .slice(0, MAX_PLANNED_SCHEDULES);
    for (const { schedule, startAt, notifyAt } of upcoming) {
        const minutesUntil = Math.round((startAt - notifyAt) / 60_000);
        planned.push({
            key: `schedule:${schedule.id}`,
            body: renderMessage({
                type: 'schedule',
                priority: 'MEDIUM',
                reason: `${minutesUntil}分後に予定がある`,
                title: schedule.title,
                minutesUntil,
            }, settings.tone, level),
            trigger: { kind: 'date', date: new Date(notifyAt) },
        });
    }
    return planned;
}
/** 予約し直す必要があるかを、内容の同一性だけで判定する。 */
export function planSignature(planned) {
    return planned
        .map((item) => {
        const when = item.trigger.kind === 'date'
            ? item.trigger.date.toISOString()
            : `${item.trigger.hour}:${item.trigger.minute}`;
        return `${item.key}@${when}#${item.body}`;
    })
        .join('|');
}
