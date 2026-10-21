import { startOfToday, startOfWeek } from './datetime.js';
export function formatProgress(progress) {
    const done = `${progress.periodLabel} ${progress.done}`;
    return progress.target === null ? `${done}回` : `${done} / ${progress.target}回`;
}
function sumSince(logs, since) {
    return logs.reduce((total, log) => {
        if (new Date(log.logged_at) < since)
            return total;
        return total + (log.value ?? 1);
    }, 0);
}
/**
 * 週次目標があれば週、無ければ日次目標で集計する。両方あれば両方返す。
 * どちらも無い目標は今週の実績だけを目標値なしで返す。
 */
export function summarizeGoalProgress(goal, logs) {
    const goalLogs = logs.filter((log) => log.goal_id === goal.id);
    const summaries = [];
    if (goal.weekly_target) {
        const done = sumSince(goalLogs, startOfWeek());
        summaries.push({
            periodLabel: '今週',
            done,
            target: goal.weekly_target,
            ratio: Math.min(done / goal.weekly_target, 1),
        });
    }
    if (goal.daily_target) {
        const done = sumSince(goalLogs, startOfToday());
        summaries.push({
            periodLabel: '今日',
            done,
            target: goal.daily_target,
            ratio: Math.min(done / goal.daily_target, 1),
        });
    }
    if (summaries.length === 0) {
        summaries.push({
            periodLabel: '今週',
            done: sumSince(goalLogs, startOfWeek()),
            target: null,
            ratio: null,
        });
    }
    return summaries;
}
