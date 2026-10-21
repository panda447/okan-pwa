import { toHalfWidth } from '../datetime.js';
/** 設計書§14の判定値。基準を1か所に集めて、ルール本体に数字を散らさない。 */
export const RAIN_PROBABILITY_THRESHOLD = 60;
export const SCHEDULE_LEAD_MINUTES = 60;
export const GOAL_BEHIND_RATIO = 0.5;
/** これ以上の就寝遅れは「大幅な就寝遅延」としてHIGH扱い（設計書§17）。 */
export const SLEEP_LATE_MINUTES_FOR_HIGH = 60;
const MINUTES_PER_DAY = 24 * 60;
/** "23:00" も "23:00:00" も分に直す。時刻として読めなければ null。 */
export function parseClock(value) {
    const match = /^(\d{1,2}):(\d{2})/.exec(toHalfWidth(value).trim());
    if (!match)
        return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59)
        return null;
    return hours * 60 + minutes;
}
function minutesOfDay(date) {
    return date.getHours() * 60 + date.getMinutes();
}
/** 就寝〜起床の間か。就寝が起床より後ろの値なら日をまたぐ窓として扱う。 */
export function isWithinNightWindow(now, sleep, wake) {
    if (sleep === wake)
        return false;
    return sleep < wake ? now >= sleep && now < wake : now >= sleep || now < wake;
}
function weatherRule(context) {
    const probability = context.tomorrowRainProbability;
    if (probability === null || probability < RAIN_PROBABILITY_THRESHOLD)
        return null;
    return {
        type: 'weather',
        priority: 'MEDIUM',
        reason: `明日の降水確率が${probability}%`,
        rainProbability: probability,
    };
}
function sleepRule(context) {
    const sleep = parseClock(context.settings.sleepTime);
    const wake = parseClock(context.settings.wakeTime);
    if (sleep === null || wake === null)
        return null;
    const now = minutesOfDay(context.now);
    if (!isWithinNightWindow(now, sleep, wake))
        return null;
    const minutesLate = now >= sleep ? now - sleep : now + MINUTES_PER_DAY - sleep;
    return {
        type: 'sleep',
        priority: minutesLate >= SLEEP_LATE_MINUTES_FOR_HIGH ? 'HIGH' : 'MEDIUM',
        reason: `就寝時刻を${minutesLate}分過ぎている`,
        minutesLate,
    };
}
function scheduleRule(context) {
    const upcoming = context.todaysSchedules
        .map((schedule) => ({
        schedule,
        minutesUntil: Math.round((new Date(schedule.start_at).getTime() - context.now.getTime()) / 60_000),
    }))
        .filter((item) => item.minutesUntil >= 0 && item.minutesUntil <= SCHEDULE_LEAD_MINUTES)
        .sort((a, b) => a.minutesUntil - b.minutesUntil)[0];
    if (!upcoming)
        return null;
    // schedules に重要度の列が無いので、設計書§17の「重要な予定」は判定できずMEDIUM固定
    return {
        type: 'schedule',
        priority: 'MEDIUM',
        reason: `${upcoming.minutesUntil}分後に予定がある`,
        title: upcoming.schedule.title,
        minutesUntil: upcoming.minutesUntil,
    };
}
/** 目標値があって進捗が数えられるものだけを対象にする。 */
function measurableProgress(item) {
    return item.progress
        .filter((progress) => progress.target !== null && progress.ratio !== null)
        .map((progress) => ({
        goal: item.goal,
        periodLabel: progress.periodLabel,
        done: progress.done,
        target: progress.target,
        ratio: progress.ratio,
    }));
}
function goalRule(context) {
    const behind = context.goals
        .flatMap(measurableProgress)
        .filter((item) => item.ratio < GOAL_BEHIND_RATIO)
        .sort((a, b) => a.ratio - b.ratio)[0];
    if (!behind)
        return null;
    return {
        type: 'goal',
        priority: 'MEDIUM',
        reason: `${behind.goal.title}が${behind.periodLabel}${behind.done}/${behind.target}回`,
        title: behind.goal.title,
        periodLabel: behind.periodLabel,
        done: behind.done,
        target: behind.target,
    };
}
function achievementRule(context) {
    const achieved = context.goals.flatMap(measurableProgress).find((item) => item.ratio >= 1);
    if (!achieved)
        return null;
    return {
        type: 'achievement',
        priority: 'LOW',
        reason: `${achieved.goal.title}を達成した`,
        title: achieved.goal.title,
        periodLabel: achieved.periodLabel,
    };
}
/** 優先度が並んだときはこの順が順位になるので、差し迫っているものから並べている。 */
const RULES = [sleepRule, scheduleRule, weatherRule, goalRule, achievementRule];
export function evaluateRules(context) {
    return RULES.map((rule) => rule(context)).filter((trigger) => trigger !== null);
}
