const WEATHER = {
    kansai: [
        (t) => `明日は雨の予報です。降水確率${t.rainProbability}%。`,
        () => '明日雨みたいやで。傘持っていったほうがええよ。',
        () => '明日雨やで。傘持っていきや。',
        () => '明日雨やで。傘忘れたら困るやろ？今のうちに準備しときや。',
        () => '明日雨やって。傘ちゃんとある？朝になったら忘れそうやから、今のうちに玄関に置いときや。',
    ],
    standard: [
        (t) => `明日は雨の予報です。降水確率${t.rainProbability}%。`,
        () => '明日は雨みたいだから、傘を持っていったほうがいいよ。',
        () => '明日は雨だよ。傘を持っていってね。',
        () => '明日は雨だよ。傘を忘れたら困るでしょう？今のうちに準備しておいて。',
        () => '明日は雨だって。傘はちゃんとある？朝は忘れそうだから、今のうちに玄関に置いておいて。',
    ],
};
const SLEEP = {
    kansai: [
        (t) => `就寝時刻を${t.minutesLate}分過ぎています。`,
        () => 'もう寝る時間やで。',
        () => 'もう寝なさい。明日起きられへんで。',
        () => 'もうこんな時間やで。明日しんどなるから、そろそろ寝なさい。',
        () => 'もうこんな時間やで。スマホ置いて、はよ寝なさい。明日起きられへんで。',
    ],
    standard: [
        (t) => `就寝時刻を${t.minutesLate}分過ぎています。`,
        () => 'もう寝る時間だよ。',
        () => 'もう寝なさい。明日起きられないよ。',
        () => 'もうこんな時間だよ。明日つらくなるから、そろそろ寝なさい。',
        () => 'もうこんな時間だよ。スマホを置いて、早く寝なさい。明日起きられないよ。',
    ],
};
const SCHEDULE = {
    kansai: [
        (t) => `${t.minutesUntil}分後に「${t.title}」があります。`,
        (t) => `もうすぐ${t.title}やで。`,
        (t) => `${t.minutesUntil}分後に${t.title}やろ。そろそろ準備しときや。`,
        (t) => `${t.minutesUntil}分後に${t.title}やで。忘れもんないか確認しときや。`,
        (t) => `${t.minutesUntil}分後に${t.title}やで。持ちもん揃えて、そろそろ出る準備しときや。`,
    ],
    standard: [
        (t) => `${t.minutesUntil}分後に「${t.title}」があります。`,
        (t) => `もうすぐ${t.title}だよ。`,
        (t) => `${t.minutesUntil}分後に${t.title}だよ。そろそろ準備してね。`,
        (t) => `${t.minutesUntil}分後に${t.title}だよ。忘れ物がないか確認しておいて。`,
        (t) => `${t.minutesUntil}分後に${t.title}だよ。持ち物を揃えて、そろそろ出る準備をして。`,
    ],
};
function remaining(trigger) {
    return Math.max(trigger.target - trigger.done, 0);
}
const GOAL = {
    kansai: [
        (t) => `${t.title}は${t.periodLabel}${t.done}/${t.target}回です。`,
        (t) => `${t.title}、まだ${remaining(t)}回残ってるで。`,
        (t) => `${t.title}、まだ終わってへんで。ちょっとやっときや。`,
        (t) => `${t.title}、${t.periodLabel}まだ${t.done}回だけやで。あと${remaining(t)}回やろ。`,
        (t) => `${t.title}、${t.periodLabel}まだ${t.done}回だけやん。あと${remaining(t)}回、今日のうちに1回でもやっとき。`,
    ],
    standard: [
        (t) => `${t.title}は${t.periodLabel}${t.done}/${t.target}回です。`,
        (t) => `${t.title}、あと${remaining(t)}回残っているよ。`,
        (t) => `${t.title}、まだ終わっていないよ。少しやっておいて。`,
        (t) => `${t.title}、${t.periodLabel}まだ${t.done}回だけだよ。あと${remaining(t)}回だね。`,
        (t) => `${t.title}、${t.periodLabel}まだ${t.done}回だけだよ。あと${remaining(t)}回、今日のうちに1回でもやっておこう。`,
    ],
};
const ACHIEVEMENT = {
    kansai: [
        (t) => `${t.title}の目標を達成しました。`,
        (t) => `${t.title}、ちゃんとできたな。`,
        (t) => `${t.title}、ちゃんとやったやん。えらいやん。`,
        (t) => `${t.title}、${t.periodLabel}の分やりきったやん。えらい。`,
        (t) => `${t.title}、${t.periodLabel}の分やりきったやん。ようがんばった、えらいで。`,
    ],
    standard: [
        (t) => `${t.title}の目標を達成しました。`,
        (t) => `${t.title}、ちゃんとできたね。`,
        (t) => `${t.title}、ちゃんとやったね。えらい。`,
        (t) => `${t.title}、${t.periodLabel}の分をやりきったね。えらい。`,
        (t) => `${t.title}、${t.periodLabel}の分をやりきったね。よくがんばりました。`,
    ],
};
export function renderMessage(trigger, tone, level) {
    const index = level - 1;
    switch (trigger.type) {
        case 'weather':
            return WEATHER[tone][index](trigger);
        case 'sleep':
            return SLEEP[tone][index](trigger);
        case 'schedule':
            return SCHEDULE[tone][index](trigger);
        case 'goal':
            return GOAL[tone][index](trigger);
        case 'achievement':
            return ACHIEVEMENT[tone][index](trigger);
    }
}
/** トリガーが1つも無いときの通常メッセージ。 */
export function renderIdleMessage(tone) {
    return tone === 'kansai' ? '今日も一日、気ぃつけてな。' : '今日も一日、気をつけてね。';
}
