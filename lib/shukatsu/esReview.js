// ES添削。0円で動かすため、AIではなく決まったルールで機械的に採点する（外部への送信なし）。
// 観点は 主体性・思考力・実行力・他者理解力・再現性 の5つ×20点。文章の書き直しはしないので、
// 書き直しが欲しいときは buildReviewPrompt() の文面を Claude などに貼って使う。

const NUMBER = /[0-9０-９]+(?:[.,][0-9０-９]+)?\s*(?:%|％|人|名|件|時間|分|秒|日|週間|週|か月|ヶ月|カ月|年|円|万|倍|割|回|個|店|位|点|社|枚|本|台|kg|km)/g;

export const CRITERIA = [
  {
    key: 'initiative', label: '主体性',
    signals: /自ら|自分から|率先|主体的|提案|発案|立ち上げ|呼びかけ|働きかけ|主導|決断|決め(?:た|て)|取り組(?:んだ|み)|挑戦|行動し/g,
    tip: '「誰かに言われて」ではなく、自分で決めて動いた場面を1つ入れる（例：「私から〜を提案し」）。',
  },
  {
    key: 'thinking', label: '思考力',
    signals: /課題|原因|理由|なぜ|分析|仮説|比較|検証|要因|優先|と考え|そこで|だからこそ|その結果|ため、/g,
    tip: '行動の前に「なぜそうしたか」を1文入れる。原因→打ち手→結果の順に因果でつなぐ。',
  },
  {
    key: 'execution', label: '実行力',
    signals: /実行|実践|継続|改善|達成|短縮|向上|増加|削減|完成|やり切|毎日|毎週|続け/g,
    tip: '成果を数字で書く（期間・人数・回数・%）。「改善した」より「15分→8分に短縮した」。',
  },
  {
    key: 'others', label: '他者理解力',
    signals: /チーム|メンバー|仲間|相手|お客様|顧客|周囲|先輩|後輩|上司|意見|話を聞|ヒアリング|巻き込|協力|役割|立場|分担/g,
    tip: '周りの人の状況や意見をどう汲んだかを書く（誰が何に困っていて、どう巻き込んだか）。',
  },
  {
    key: 'reproducibility', label: '再現性',
    signals: /学ん|学び|気づ|活か|生か|貴社|入社後|今後|将来|仕事で|業務で|強み|再現|どんな場面でも/g,
    tip: '最後に「この経験で得た○○を、入社後は△△で活かす」と仕事に接続して締める。',
  },
];

const SPOKEN = /すごく|めっちゃ|とか|なので、|いろんな|やっぱり|ちゃんと|ていうか|みたいな/g;
const VAGUE = /様々な|さまざまな|色々|いろいろ|多くの|コミュニケーション能力|頑張りました|努力しました/g;
const WORDY = /することができ|において|という(?:こと|もの)|させていただ/g;

export const countChars = (s) => [...String(s || '').replace(/\r/g, '')].length;

export function splitSentences(text) {
  return String(text || '').split(/(?<=[。！？!?])|\n+/).map((s) => s.trim()).filter(Boolean);
}
const uniqueHits = (text, re) => [...new Set(String(text).match(re) || [])];

/** 採点。返り値はすべて表示用の材料で、点数の根拠（見つかった語）も一緒に返す。 */
export function reviewEs({ essay, limit = 0, question = '' }) {
  const text = String(essay || '').trim();
  const chars = countChars(text);
  const sentences = splitSentences(text);
  const numbers = uniqueHits(text, NUMBER);
  const criteria = CRITERIA.map((c) => {
    const hits = uniqueHits(text, c.signals);
    let score = 5 + hits.length * 3;
    if (c.key === 'execution') score += Math.min(numbers.length, 3) * 3;
    score = Math.min(20, score);
    return { key: c.key, label: c.label, score, max: 20, hits: c.key === 'execution' ? [...hits, ...numbers] : hits, tip: c.tip };
  });

  const deductions = [];
  const deduct = (points, label, detail) => deductions.push({ points, label, detail });
  const lim = Number(limit) || 0;
  if (lim > 0 && chars > lim) deduct(10, '文字数オーバー', `${chars}字／上限${lim}字。${chars - lim}字削る。`);
  else if (lim > 0 && chars < lim * 0.8) deduct(5, '文字数が上限の8割未満', `${chars}字／上限${lim}字。目安は${Math.ceil(lim * 0.9)}字前後。`);
  const first = sentences[0] || '';
  if (countChars(first) > 70) deduct(3, '1文目が長い', '結論（「私の強みは〜です」など）を最初の1文で短く言い切る。');
  const long = sentences.filter((s) => countChars(s) > 80);
  if (long.length) deduct(Math.min(6, long.length * 2), '長すぎる文', `80字を超える文が${long.length}つ。2文に分ける：「${long[0].slice(0, 24)}…」`);
  const endings = sentences.map((s) => s.replace(/[。！？!?]$/, '').slice(-2));
  if (endings.some((e, i) => i >= 2 && e && e === endings[i - 1] && e === endings[i - 2])) deduct(2, '文末が3回続けて同じ', `「〜${endings.find((e, i) => i >= 2 && e === endings[i - 1] && e === endings[i - 2])}。」が連続している。`);
  const omou = (text.match(/と思い?ま?す|と思う|と感じ/g) || []).length;
  if (omou >= 2) deduct(2, '言い切れていない', `「思います・感じます」が${omou}回。事実と意志は言い切る。`);
  const spoken = uniqueHits(text, SPOKEN);
  if (spoken.length) deduct(Math.min(4, spoken.length * 2), '話し言葉', `「${spoken.join('」「')}」を書き言葉に。`);
  const vague = uniqueHits(text, VAGUE);
  if (vague.length && numbers.length === 0) deduct(2, '抽象的な言葉', `「${vague.join('」「')}」は中身が伝わらない。具体的な場面や数字に置き換える。`);
  if (/御社/.test(text)) deduct(2, '「御社」は話し言葉', '書類では「貴社」と書く。');
  const wordy = uniqueHits(text, WORDY);
  if (wordy.length >= 2) deduct(1, '回りくどい言い方', `「${wordy.join('」「')}」を短く（例：「することができる」→「できる」）。`);
  if (chars > 0 && numbers.length === 0) deduct(4, '数字が1つもない', '規模・期間・成果のどれか1つは数字で書く。');

  const raw = criteria.reduce((sum, c) => sum + c.score, 0);
  const minus = deductions.reduce((sum, d) => sum + d.points, 0);
  const total = chars === 0 ? 0 : Math.max(0, Math.min(100, raw - minus));
  const improvements = [
    ...criteria.filter((c) => c.score < 14).sort((a, b) => a.score - b.score).map((c) => `${c.label}（${c.score}/20）：${c.tip}`),
    ...[...deductions].sort((a, b) => b.points - a.points).map((d) => `${d.label}（-${d.points}）：${d.detail}`),
  ];
  return {
    total,
    criteria,
    deductions,
    improvements,
    stats: {
      chars,
      limit: lim,
      sentences: sentences.length,
      avgSentence: sentences.length ? Math.round(chars / sentences.length) : 0,
      longestSentence: sentences.reduce((m, s) => Math.max(m, countChars(s)), 0),
      numbers: numbers.length,
      questionChars: countChars(question),
    },
  };
}

/** Claude（無料のclaude.aiでよい）に貼る添削依頼文。事実の創作を禁じ、足りない情報は質問させる。 */
export function buildReviewPrompt({ company, question, limit, essay }) {
  const lim = Number(limit) || 0;
  return [
    'あなたは新卒採用の書類選考担当です。次のESを添削してください。',
    '',
    `企業名：${company || '（未記入）'}`,
    `設問：${question || '（未記入）'}`,
    `文字数上限：${lim ? `${lim}字` : '指定なし'}`,
    '',
    '【ES本文】',
    String(essay || '').trim(),
    '',
    '【やってほしいこと】',
    '1. 主体性・思考力・実行力・他者理解力・再現性 の5観点を各20点（計100点）で採点し、各観点に根拠を1〜2行で書く',
    '2. 減点した箇所を、本文の該当部分を引用して箇条書きにする',
    '3. 90点以上にするための改善点を、優先順位の高い順に3つまで',
    `4. 改善後の文章例を1つ（${lim ? `${lim}字以内、目安は${Math.ceil(lim * 0.9)}字前後` : '元と同じくらいの長さ'}）。最後に文字数を書く`,
    '',
    '【守ること】',
    '- 本文に無い経験・数字・固有名詞を作らない。足りない情報は【要確認：○○】と書いて、私への質問として最後にまとめる',
    '- 企業について書くときは、確認できた事実だけにする（推測なら「推測」と書く）',
    '- 書き言葉にする（「御社」ではなく「貴社」）',
  ].join('\n');
}
