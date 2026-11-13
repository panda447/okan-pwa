// 就活の締切・選考予定を、おかんの「用件」（トリガー）にする。lib/okan/ は okan-app からの移植で
// 上書きされるので、PWAだけの用件はここに置き、js/okan.js で既存の判定と合わせる。
import { daysLeft, isActive, nextStartAt, waitingDays } from './model.js';

/** 期日を過ぎた締切を言い続ける日数。それより古いものは画面には残すが、おかんは黙る。 */
export const OVERDUE_NAG_DAYS = 14;
/** 結果待ちがこの日数を超えたら、一度気にかける。 */
export const WAITING_NAG_DAYS = 10;
/** 選考の開始からこの分数が過ぎたら「終わった」とみなして労う。 */
export const AFTER_EVENT_MINUTES = 60;
const PRE_SUBMIT_STAGES = ['気になる', '応募予定', '書類選考中'];

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
    // 期日を過ぎたのに、出したかどうか報告が無いもの（出したなら段階を進めれば止まる）
    if (isActive(e) && prefs.deadlineLeadDays > 0 && dl !== null && dl < 0 && -dl <= OVERDUE_NAG_DAYS && PRE_SUBMIT_STAGES.includes(e.stage)) {
      candidates.push({ type: 'deadline', kind: 'overdue', priority: 'MEDIUM', days: dl, over: -dl, company: e.company, stage: e.stage, reason: `${e.company}の締切を${-dl}日過ぎている` });
    }
    const nd = daysLeft(e.nextDate, now);
    const plan = e.nextPlan || e.stage;
    if (isActive(e) && prefs.eventNotice && nd === 0) {
      const start = nextStartAt(e);
      const ended = start && now.getTime() - start.getTime() >= AFTER_EVENT_MINUTES * 60_000;
      // 終わったあとまで「準備できてる？」と言わない。時刻が分かるものだけ、終わったら労う
      if (ended) candidates.push({ type: 'deadline', kind: 'after', priority: 'LOW', days: 0, company: e.company, plan, reason: `${e.company}の${plan}が終わった` });
      else candidates.push({ type: 'deadline', kind: 'event', priority: 'MEDIUM', days: 0, company: e.company, plan, time: e.nextTime || '', reason: `今日は${e.company}の${plan}` });
    }
    if (isActive(e) && prefs.eventNotice && nd === 1) {
      candidates.push({ type: 'deadline', kind: 'eve', priority: 'LOW', days: 1, company: e.company, plan, time: e.nextTime || '', reason: `明日は${e.company}の${plan}` });
    }
    const wd = waitingDays(e, now);
    if (prefs.eventNotice && wd !== null && wd >= WAITING_NAG_DAYS) {
      candidates.push({ type: 'deadline', kind: 'waiting', priority: 'LOW', days: 99, waited: wd, company: e.company, reason: `${e.company}の結果待ちが${wd}日` });
    }
  }
  const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const kindRank = { offer: 0, deadline: 1, event: 2, overdue: 3, eve: 4, after: 5, waiting: 6 };
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

const OVERDUE = {
  kansai: [
    (t) => `${t.company}の締切を${t.over}日過ぎています。`,
    (t) => `${t.company}の締切、過ぎてるで。`,
    (t) => `${t.company}の締切、${t.over}日過ぎてるで。もう出したん？`,
    (t) => `${t.company}の締切、${t.over}日過ぎてるで。出したんやったら「次へ」押しとき。まだやったら今日決めや。`,
    (t) => `${t.company}の締切、${t.over}日も過ぎてるやん。出したん？出してへんの？どっちか分からんのがいちばん困るんやで。`,
  ],
  standard: [
    (t) => `${t.company}の締切を${t.over}日過ぎています。`,
    (t) => `${t.company}の締切、過ぎているよ。`,
    (t) => `${t.company}の締切を${t.over}日過ぎているよ。もう出した？`,
    (t) => `${t.company}の締切を${t.over}日過ぎているよ。出したなら「次へ」を押しておいて。まだなら今日決めよう。`,
    (t) => `${t.company}の締切を${t.over}日も過ぎているよ。出したの？出していないの？どちらか分からないのがいちばん困るよ。`,
  ],
};
const at = (t) => (t.time ? `${t.time}から` : '');
const EVE = {
  kansai: [
    (t) => `明日は${t.company}の${t.plan}${t.time ? `（${t.time}）` : ''}があります。`,
    (t) => `明日は${t.company}の${t.plan}やで。`,
    (t) => `明日${at(t)}${t.company}の${t.plan}やろ。準備は今日のうちにな。`,
    (t) => `明日${at(t)}${t.company}の${t.plan}やで。話すこと、一回声に出して練習しとき。`,
    (t) => `明日${at(t)}${t.company}の${t.plan}やで。服と持ちもん今のうちに出して、今日ははよ寝るんやで。`,
  ],
  standard: [
    (t) => `明日は${t.company}の${t.plan}${t.time ? `（${t.time}）` : ''}があります。`,
    (t) => `明日は${t.company}の${t.plan}だよ。`,
    (t) => `明日${at(t)}${t.company}の${t.plan}だよね。準備は今日のうちにね。`,
    (t) => `明日${at(t)}${t.company}の${t.plan}だよ。話すことを一度声に出して練習しておこう。`,
    (t) => `明日${at(t)}${t.company}の${t.plan}だよ。服と持ち物を今のうちに出して、今日は早く寝ようね。`,
  ],
};
const AFTER = {
  kansai: [
    (t) => `${t.company}の${t.plan}の時刻を過ぎました。`,
    (t) => `${t.company}の${t.plan}、おつかれさん。`,
    (t) => `${t.company}の${t.plan}、おつかれさん。どうやった？`,
    (t) => `${t.company}の${t.plan}、おつかれさん。聞かれたこと、忘れんうちに書いとき。`,
    (t) => `${t.company}の${t.plan}、おつかれさん。聞かれたことと答えたこと、覚えてるうちに書いとき。それ済んだら甘いもんでも食べ。`,
  ],
  standard: [
    (t) => `${t.company}の${t.plan}の時刻を過ぎました。`,
    (t) => `${t.company}の${t.plan}、おつかれさま。`,
    (t) => `${t.company}の${t.plan}、おつかれさま。どうだった？`,
    (t) => `${t.company}の${t.plan}、おつかれさま。聞かれたことを忘れないうちに書いておこう。`,
    (t) => `${t.company}の${t.plan}、おつかれさま。聞かれたことと答えたことを、覚えているうちに書いておこう。終わったら甘いものでも食べてね。`,
  ],
};
const WAITING = {
  kansai: [
    (t) => `${t.company}は結果待ちになって${t.waited}日です。`,
    (t) => `${t.company}の結果、まだ来てへんな。`,
    (t) => `${t.company}の結果、${t.waited}日たつけどまだ？メール見落としてへん？`,
    (t) => `${t.company}の結果、もう${t.waited}日やで。迷惑メールとマイページ、いっぺん見とき。`,
    (t) => `${t.company}の結果、${t.waited}日も来てへんやん。迷惑メールとマイページ見て、それでも無かったら問い合わせてええんやで。`,
  ],
  standard: [
    (t) => `${t.company}は結果待ちになって${t.waited}日です。`,
    (t) => `${t.company}の結果、まだ来ていないね。`,
    (t) => `${t.company}の結果、${t.waited}日たつけどまだ？メールを見落としていない？`,
    (t) => `${t.company}の結果、もう${t.waited}日だよ。迷惑メールとマイページを一度見ておこう。`,
    (t) => `${t.company}の結果が${t.waited}日も来ていないね。迷惑メールとマイページを見て、それでも無ければ問い合わせていいんだよ。`,
  ],
};
const TABLES = { offer: OFFER, event: EVENT, deadline: DEADLINE, overdue: OVERDUE, eve: EVE, after: AFTER, waiting: WAITING };

export function renderShukatsuMessage(trigger, tone, level) {
  const table = TABLES[trigger.kind] ?? DEADLINE;
  const lines = table[tone] ?? table.standard;
  return lines[Math.min(5, Math.max(1, level)) - 1](trigger);
}
