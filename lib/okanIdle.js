// 用件が何も無いときの、おかんのひとこと。PWAだけのもの（lib/okan/ は okan-app からの移植で上書きされるので、ここに置く）。
// 同じ画面を開き直すたびに文が変わると落ち着かないので、「日付×時間帯」で決め打ちにする（乱数は使わない）。

/** 時間帯。起床・就寝の設定は見ず、時計だけで分ける。 */
export function dayPart(now) {
  const h = now.getHours();
  if (h >= 4 && h < 11) return 'morning';
  if (h >= 11 && h < 17) return 'noon';
  if (h >= 17 && h < 22) return 'evening';
  return 'night';
}

const POOL = {
  kansai: {
    morning: ['おはようさん。朝ごはん、ちゃんと食べや。', 'おはよう。顔洗って、水一杯飲んどき。', 'おはようさん。今日も気ぃつけていっといで。', '起きたんやな。まず窓開けて、空気入れ替えとき。'],
    noon: ['お昼は食べた？抜いたらあかんで。', 'ちょっと休憩しいや。肩、こってへん？', '水分とってる？根つめすぎたらあかんで。', '今日も一日、気ぃつけてな。'],
    evening: ['おかえり。晩ごはんは食べたんか？', '今日もおつかれさん。お風呂、先に入っとき。', '洗濯もん、たまってへんか？', '今日あったこと、一行でええから書いとき。'],
    night: ['夜ふかしはほどほどにな。', 'もう遅いで。きりのええとこでやめとき。', '明日の持ちもん、今のうちに出しときや。', 'あったかくして寝るんやで。'],
  },
  standard: {
    morning: ['おはよう。朝ごはん、ちゃんと食べてね。', 'おはよう。顔を洗って、水を一杯飲んでおいて。', 'おはよう。今日も気をつけて行ってらっしゃい。', '起きたんだね。まず窓を開けて、空気を入れ替えよう。'],
    noon: ['お昼は食べた？抜いたらだめだよ。', '少し休憩しよう。肩はこっていない？', '水分はとってる？根をつめすぎないでね。', '今日も一日、気をつけてね。'],
    evening: ['おかえり。晩ごはんは食べた？', '今日もおつかれさま。お風呂は先に入っておいて。', '洗濯物はたまっていない？', '今日あったことを、一行でいいから書いておこう。'],
    night: ['夜ふかしはほどほどにね。', 'もう遅いよ。きりのいいところでやめておこう。', '明日の持ち物を、今のうちに出しておいてね。', 'あたたかくして寝てね。'],
  },
};

/** その日の天気や予定から言えること。当てはまるものがあれば、時間帯のひとことより優先する。 */
function situational({ now, today, schedulesLeft }, tone) {
  const k = tone === 'kansai';
  const part = dayPart(now);
  const lines = [];
  if (part === 'morning' || part === 'noon') {
    if (today?.rainProbability != null && today.rainProbability >= 60) lines.push(k ? `今日は雨が降りそうやで（${today.rainProbability}%）。傘持っていき。` : `今日は雨が降りそうだよ（${today.rainProbability}%）。傘を持っていってね。`);
    if (today?.temperature != null && today.temperature >= 30) lines.push(k ? `今日は${Math.round(today.temperature)}℃まで上がるで。水分ちゃんととりや。` : `今日は${Math.round(today.temperature)}℃まで上がるよ。水分をしっかりとってね。`);
    if (today?.temperature != null && today.temperature <= 10) lines.push(k ? `今日は最高でも${Math.round(today.temperature)}℃やで。あったかいかっこうしていき。` : `今日は最高でも${Math.round(today.temperature)}℃だよ。あたたかい格好で出かけてね。`);
  }
  if (part === 'morning' && schedulesLeft === 0) lines.push(k ? '今日は予定なしやな。たまにはゆっくりし。' : '今日は予定がないね。たまにはゆっくりしてね。');
  return lines;
}

/**
 * 用件が無いときのひとこと。
 * @param tone 'kansai' | 'standard'
 * @param level おせっかい度1〜5。1は必要最低限なので、世間話はしない。
 * @param ctx { now, today?: {temperature, rainProbability}, schedulesLeft?: 今日これからの予定の数 }
 */
export function renderIdle(tone, level, ctx) {
  const t = POOL[tone] ? tone : 'standard';
  if (level <= 1) return '今お伝えする用件はありません。';
  const now = ctx.now;
  const special = situational(ctx, t);
  const dayNo = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 86400000);
  if (special.length) return special[dayNo % special.length];
  const pool = POOL[t][dayPart(now)];
  return pool[(dayNo + now.getHours()) % pool.length];
}
