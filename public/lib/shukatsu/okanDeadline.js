// 就活の締切・選考予定を、おかんの「用件」（トリガー）にする。lib/okan/ は okan-app からの移植で
// 上書きされるので、PWAだけの用件はここに置き、js/okan.js で既存の判定と合わせる。
import { daysLeft, isActive } from './model.js';

/** 締切の声かけを始める日数の選択肢。0 はオフ。 */
export const DEADLINE_LEAD_OPTIONS = [0, 1, 3, 7];
export const DEFAULT_SHUKATSU_PREFS = { deadlineLeadDays: 3, eventNotice: true };

export function toShukatsuPrefs(settings) {
  const lead = Number(settings?.shukatsu_deadline_days);
  return {
    deadlineLeadDays: DEADLINE_LEAD_OPTIONS.includes(lead) ? lead : DEFAULT_SHUKATSU_PREFS.deadlineLeadDays,
    eventNotice: settings?.shukatsu_event_notice ?? DEFAULT_SHUKATSU_PREFS.eventNotice,
  };
}

/**
 * いちばん差し迫った就活の用件を1つ返す。無ければ null。
 * 優先度：締切が今日・明日／内定の回答期限が3日以内＝HIGH、それ以外＝MEDIUM。
 */
export function shukatsuTrigger(entries, now, prefs = DEFAULT_SHUKATSU_PREFS) {
  const candidates = [];
  for (const e of entries) {
    if (!isActive(e) && e.stage !== '内定') continue;
    const dl = daysLeft(e.deadline, now);
    if (isActive(e) && prefs.deadlineLeadDays > 0 && dl !== null && dl >= 0 && dl <= prefs.deadlineLeadDays) {
      candidates.push({ type: 'deadline', kind: 'deadline', priority: dl <= 1 ? 'HIGH' : 'MEDIUM', days: dl, company: e.company, stage: e.stage, reason: `${e.company}の締切まで${dl}日` });
    }
    const od = daysLeft(e.offerResponseDeadline, now);
    if (e.stage === '内定' && e.offerDecision === '検討中' && od !== null && od >= 0 && od <= 7) {
      candidates.push({ type: 'deadline', kind: 'offer', priority: od <= 3 ? 'HIGH' : 'MEDIUM', days: od, company: e.company, reason: `${e.company}の内定回答期限まで${od}日` });
    }
    if (isActive(e) && prefs.eventNotice && daysLeft(e.nextDate, now) === 0) {
      candidates.push({ type: 'deadline', kind: 'event', priority: 'MEDIUM', days: 0, company: e.company, plan: e.nextPlan || e.stage, time: e.nextTime || '', reason: `今日は${e.company}の${e.nextPlan || e.stage}` });
    }
  }
  const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const kindRank = { offer: 0, deadline: 1, event: 2 };
  return candidates.sort((a, b) => rank[a.priority] - rank[b.priority] || a.days - b.days || kindRank[a.kind] - kindRank[b.kind])[0] ?? null;
}

const when = (days) => (days === 0 ? '今日' : days === 1 ? '明日' : `${days}日後`);
const whenK = (days) => (days === 0 ? '今日' : days === 1 ? '明日' : `あと${days}日`);

const DEADLINE = {
  kansai: [
    (t) => `${t.company}（${t.stage}）の締切は${when(t.days)}です。`,
    (t) => `${t.company}の締切、${whenK(t.days)}やで。`,
    (t) => `${t.company}の締切${whenK(t.days)}やで。出すもん出した？`,
    (t) => `${t.company}の締切${whenK(t.days)}やろ。後回しにしたらあかんで、今日ちょっとでも進めとき。`,
    (t) => `${t.company}の締切${whenK(t.days)}やで！ギリギリで焦るのはあんたやで。今のうちに仕上げて出してしまい。`,
  ],
  standard: [
    (t) => `${t.company}（${t.stage}）の締切は${when(t.days)}です。`,
    (t) => `${t.company}の締切、${whenK(t.days)}だよ。`,
    (t) => `${t.company}の締切${whenK(t.days)}だよ。出すものは出した？`,
    (t) => `${t.company}の締切${whenK(t.days)}だよ。後回しにしないで、今日少しでも進めておこう。`,
    (t) => `${t.company}の締切${whenK(t.days)}だよ！ギリギリで焦るのは自分だからね。今のうちに仕上げて出しちゃおう。`,
  ],
};
const OFFER = {
  kansai: [
    (t) => `${t.company}の内定の回答期限は${when(t.days)}です。`,
    (t) => `${t.company}の返事、${whenK(t.days)}やで。`,
    (t) => `${t.company}の内定の返事、${whenK(t.days)}やで。気持ちは決まった？`,
    (t) => `${t.company}の返事${whenK(t.days)}やろ。迷ってるなら、何で迷ってるか書き出してみ。`,
    (t) => `${t.company}の内定の返事、${whenK(t.days)}やで。一人で抱えんと、誰かに相談してでも期限までに決めや。`,
  ],
  standard: [
    (t) => `${t.company}の内定の回答期限は${when(t.days)}です。`,
    (t) => `${t.company}への返事、${whenK(t.days)}だよ。`,
    (t) => `${t.company}の内定の返事、${whenK(t.days)}だよ。気持ちは決まった？`,
    (t) => `${t.company}への返事${whenK(t.days)}だよ。迷っているなら、何で迷っているか書き出してみよう。`,
    (t) => `${t.company}の内定の返事、${whenK(t.days)}だよ。一人で抱えずに、相談してでも期限までに決めようね。`,
  ],
};
const EVENT = {
  kansai: [
    (t) => `今日は${t.company}の${t.plan}${t.time ? `（${t.time}）` : ''}があります。`,
    (t) => `今日は${t.company}の${t.plan}やで。`,
    (t) => `今日${t.company}の${t.plan}やろ。準備はできてる？`,
    (t) => `今日は${t.company}の${t.plan}やで${t.time ? `、${t.time}からな` : ''}。企業のこと、もう一回見直しとき。`,
    (t) => `今日は${t.company}の${t.plan}やで${t.time ? `、${t.time}から` : ''}。身だしなみと持ちもん確認して、落ち着いていっといで。`,
  ],
  standard: [
    (t) => `今日は${t.company}の${t.plan}${t.time ? `（${t.time}）` : ''}があります。`,
    (t) => `今日は${t.company}の${t.plan}だよ。`,
    (t) => `今日は${t.company}の${t.plan}だよね。準備はできてる？`,
    (t) => `今日は${t.company}の${t.plan}だよ${t.time ? `、${t.time}から` : ''}。企業のことをもう一度見直しておこう。`,
    (t) => `今日は${t.company}の${t.plan}だよ${t.time ? `、${t.time}から` : ''}。身だしなみと持ち物を確認して、落ち着いて行ってらっしゃい。`,
  ],
};

export function renderShukatsuMessage(trigger, tone, level) {
  const table = trigger.kind === 'offer' ? OFFER : trigger.kind === 'event' ? EVENT : DEADLINE;
  const lines = table[tone] ?? table.standard;
  return lines[Math.min(5, Math.max(1, level)) - 1](trigger);
}
