// 企業フィット診断（簡易）。自分の傾向（質問への回答）と、企業の文章（理念・求める人物像など）の
// キーワード出現を7つの軸で比べる。統計的な妥当性はない目安なので、画面でもそう書く。

export const AXES = [
  { key: 'initiative', label: '主体性', words: ['自ら', '主体', '自律', '率先', '能動', '当事者', '責任', 'オーナーシップ', '自分で考'],
    strength: '自分で考えて動く姿勢', episode: '自分で課題を見つけて動いた経験' },
  { key: 'teamwork', label: '協働性', words: ['チーム', '協働', '協力', '周囲', '巻き込', '連携', '対話', '信頼', '仲間', '共創'],
    strength: '周りと力を合わせて成果を出す姿勢', episode: '立場の違う人と協力して成果を出した経験' },
  { key: 'challenge', label: '挑戦志向', words: ['挑戦', '変革', '新しい', '革新', 'イノベ', '前例', '開拓', '創造', 'チャレンジ'],
    strength: '前例のないことも試してみる姿勢', episode: '不確実な中で挑戦して学んだ経験' },
  { key: 'logic', label: '論理・慎重性', words: ['論理', '分析', 'データ', '仮説', '本質', '品質', '正確', '計画', '検証', '考え抜'],
    strength: '根拠を持って判断する姿勢', episode: '情報を整理して筋道立てて解決した経験' },
  { key: 'execution', label: '実行力', words: ['実行', 'スピード', '行動', 'やり切', '成果', '達成', '推進', '迅速', '最後まで', '結果'],
    strength: '最後までやり切る姿勢', episode: '目標から逆算して最後までやり切った経験' },
  { key: 'adaptability', label: '適応力', words: ['変化', '柔軟', '適応', '多様', '臨機応変', '環境', 'グローバル', '状況'],
    strength: '変化に合わせて動き方を変える姿勢', episode: '予定外の変化に対応して立て直した経験' },
  { key: 'growth', label: '成長・学習', words: ['成長', '学習', '学び', '向上', '専門', '好奇心', '自己研鑽', '吸収', '技術', 'スキル'],
    strength: '学び続けて自分を更新する姿勢', episode: '学んだことを行動に移して成長した経験' },
];

/** 自己診断の質問。1（左に近い）〜5（右に近い）で答え、右が軸の「高い」側。 */
export const QUESTIONS = [
  ['initiative', '担当外だけど気になる問題を見つけたら', '担当者に任せる', '自分から改善案を出す'],
  ['initiative', '進め方が決まっていない作業は', '指示が出るまで待つ', '仮の案を作って確認する'],
  ['teamwork', '仲間の作業が遅れていたら', '自分の担当を先に終える', '手伝えることを聞きに行く'],
  ['teamwork', '成果を出すのに大事なのは', '一人ひとりの力', 'メンバー同士の連携'],
  ['challenge', '新しいやり方を提案されたら', 'まず実績のある方法を選ぶ', 'まず小さく試してみる'],
  ['challenge', '仕事を選べるなら', '確実に成果が出る仕事', '難しいが伸びられる仕事'],
  ['logic', '大事な判断をするときは', '経験と直感を頼りにする', '根拠を集めて比べる'],
  ['logic', '提出物の確認は', '早く出すのを優先する', '細部まで見直してから出す'],
  ['execution', '思いついたアイデアは', 'じっくり練ってから共有する', '早めに形にして反応を見る'],
  ['execution', '行き詰まったときは', '原因が分かるまで考える', 'とりあえず次の一手を打つ'],
  ['adaptability', '急に予定が変わったら', '元の計画に戻したくなる', '新しい条件で組み直す'],
  ['adaptability', '役割が途中で変わったら', '慣れた役割を続けたい', '新しい役割を覚えにいく'],
  ['growth', '知らない分野に出会ったら', '必要になったら調べる', '興味が湧いて自分から学ぶ'],
  ['growth', '失敗したあとは', '気持ちを切り替えて忘れる', '原因を振り返って次に活かす'],
].map(([axis, text, left, right]) => ({ axis, text, left, right }));

/** 回答（質問と同じ並びの1〜5）から、軸ごとの0〜100点を出す。未回答の軸は null。 */
export function profileScores(answers = []) {
  const out = {};
  for (const axis of AXES) {
    const vals = QUESTIONS.map((q, i) => (q.axis === axis.key ? Number(answers[i]) : NaN)).filter((v) => v >= 1 && v <= 5);
    out[axis.key] = vals.length ? Math.round(((vals.reduce((a, b) => a + b, 0) / vals.length - 1) / 4) * 100) : null;
  }
  return out;
}
export const isProfileComplete = (answers = []) => QUESTIONS.every((_, i) => Number(answers[i]) >= 1 && Number(answers[i]) <= 5);

/** 企業の文章から、各軸をどれくらい強く求めているか（0〜100、最多の軸が100）と出現語。 */
export function analyzeCompanyText(text) {
  const src = String(text || '');
  const counts = {};
  const hits = {};
  for (const axis of AXES) {
    hits[axis.key] = axis.words.filter((w) => src.includes(w));
    counts[axis.key] = axis.words.reduce((n, w) => n + src.split(w).length - 1, 0);
  }
  const max = Math.max(0, ...Object.values(counts));
  const emphasis = Object.fromEntries(AXES.map((a) => [a.key, max ? Math.round((counts[a.key] / max) * 100) : 0]));
  const totalHits = Object.values(counts).reduce((a, b) => a + b, 0);
  return { emphasis, hits, counts, totalHits, chars: [...src].length };
}

/** 一致度。企業が強く求める軸ほど重く見て、自分の点との差を測る。 */
export function fitReport(profile, company) {
  const weights = AXES.map((a) => 0.3 + company.emphasis[a.key] / 100);
  const diffs = AXES.map((a) => Math.abs((profile[a.key] ?? 50) - company.emphasis[a.key]));
  const shortfalls = AXES.map((a) => Math.max(0, company.emphasis[a.key] - (profile[a.key] ?? 50)));
  // 求められている以上に持っている分は減点しない（足りない分を重く見る）
  const penalty = AXES.reduce((sum, _, i) => sum + weights[i] * (shortfalls[i] * 0.8 + diffs[i] * 0.2), 0) / weights.reduce((a, b) => a + b, 0);
  const score = Math.max(0, Math.min(100, Math.round(100 - penalty)));
  const ranked = AXES.map((a) => ({ ...a, self: profile[a.key] ?? 50, company: company.emphasis[a.key] }));
  const strengths = ranked.filter((a) => a.company >= 50 && a.self >= 60).sort((a, b) => b.company - a.company).slice(0, 3);
  const gaps = ranked.filter((a) => a.company >= 50 && a.company - a.self >= 20).sort((a, b) => (b.company - b.self) - (a.company - a.self)).slice(0, 3);
  const confidence = company.totalHits >= 12 && company.chars >= 400 ? '高' : company.totalHits >= 5 && company.chars >= 150 ? '中' : '低';
  return {
    score,
    confidence,
    axes: ranked,
    strengths: strengths.map((a) => `${a.label}：企業が重視していて、あなたも強い（${a.strength}）`),
    gaps: gaps.map((a) => `${a.label}：企業の重視度${a.company}に対してあなたは${a.self}。入社後に求められる場面を想定しておく`),
    interviewTips: [...strengths, ...gaps].slice(0, 3).map((a) => `「${a.episode}」を1つ用意する（軸：${a.label}）`),
  };
}

/** レーダーチャートの頂点（中心0,0・半径r）。描画はview側。 */
export function radarPoints(values, r) {
  return values.map((v, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / values.length;
    const len = (Math.max(0, Math.min(100, v)) / 100) * r;
    return [Math.round(Math.cos(angle) * len * 10) / 10, Math.round(Math.sin(angle) * len * 10) / 10];
  });
}
