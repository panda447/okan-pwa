// 就活まわりの純粋関数（public/lib/shukatsu）のテスト。依存なしで動く。
// 使い方: node tools/test-shukatsu.mjs
import assert from 'node:assert/strict';
import * as M from '../public/lib/shukatsu/model.js';
import * as I from '../public/lib/shukatsu/importer.js';
import * as R from '../public/lib/shukatsu/esReview.js';
import * as F from '../public/lib/shukatsu/fit.js';
import * as D from '../public/lib/shukatsu/okanDeadline.js';
import { decryptJson, encryptJson } from '../public/lib/shukatsu/vault.js';

let passed = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); passed += 1; } catch (e) { failures.push(`${name}\n  ${e.message}`); }
}
const NOW = new Date(2026, 9, 21, 10, 0); // 2026-10-21 10:00（ローカル）
const entry = (over = {}) => M.normalizeEntry({ company: 'テスト株式会社', type: '本選考', ...over }, NOW);

await test('daysLeft はローカル日付で数える', () => {
  assert.equal(M.daysLeft('2026-10-21', NOW), 0);
  assert.equal(M.daysLeft('2026-10-22', new Date(2026, 9, 21, 23, 59)), 1);
  assert.equal(M.daysLeft('2026-10-20', NOW), -1);
  assert.equal(M.daysLeft('', NOW), null);
  assert.equal(M.daysLeft('2026-13-01', NOW), null);
});
await test('本選考の標準フローは ES→Web→面接3回→結果待ち', () => {
  assert.deepEqual(entry().flowSteps, ['気になる', '応募予定', '書類選考中', 'ES提出済', 'Webテスト', '一次面接', '二次面接', '最終面接', '結果待ち']);
});
await test('結果系のステージはフローに入れず、結果待ちは最後に1つ', () => {
  assert.deepEqual(M.normalizeFlowSteps(['応募予定', '内定', '結果待ち', '人事面談', '人事面談']), ['応募予定', '人事面談', '結果待ち']);
});
await test('次へ・不合格・結果', () => {
  const e = entry({ stage: 'ES提出済' });
  assert.equal(M.nextStage(e), 'Webテスト');
  assert.equal(M.failStage(e), 'ES不合格');
  assert.equal(M.failStage(entry({ stage: '二次面接' })), '面接不合格');
  assert.equal(M.nextStage(entry({ stage: '結果待ち' })), '内定');
  assert.equal(M.nextStage(entry({ stage: '結果待ち', type: 'インターン' })), 'インターン合格');
  assert.equal(M.failStage(entry({ stage: '結果待ち', type: 'インターン' })), 'インターン不合格');
});
await test('ES+Webテスト同時提出ならWebテストを飛ばす', () => {
  const e = entry({ stage: 'ES提出済', selectionTags: [M.COMBINED_TAG] });
  assert.equal(M.nextStage(e), '一次面接');
});
await test('独自ステップでも進めて戻せる', () => {
  let e = entry({ flowSteps: ['応募予定', '人事面談', '社長面接'], stage: '応募予定' });
  e = M.moveStage(e, M.nextStage(e), 'advance', NOW);
  assert.equal(e.stage, '人事面談');
  e = M.moveStage(e, M.failStage(e), 'fail', NOW);
  assert.equal(e.stage, '面接不合格');
  e = M.moveStage(e, M.previousStage(e), 'back', NOW);
  assert.equal(e.stage, '人事面談');
  assert.equal(e.history.length, 1);
});
await test('戻すと履歴の最後が消える', () => {
  let e = entry({ stage: '応募予定' });
  e = M.moveStage(e, '書類選考中', 'advance', NOW);
  e = M.moveStage(e, M.previousStage(e), 'back', NOW);
  assert.equal(e.stage, '応募予定');
  assert.equal(e.history.length, 0);
});
await test('締切の近さ：今日・明日=critical、7日以内=soon、終わった選考は対象外', () => {
  assert.equal(M.deadlineLevel(entry({ deadline: '2026-10-22' }), NOW), 'critical');
  assert.equal(M.deadlineLevel(entry({ deadline: '2026-10-28' }), NOW), 'soon');
  assert.equal(M.deadlineLevel(entry({ deadline: '2026-10-29' }), NOW), '');
  assert.equal(M.deadlineLevel(entry({ deadline: '2026-10-22', stage: '不採用' }), NOW), '');
  assert.equal(M.deadlineText('2026-10-19', NOW), '2日超過');
  assert.equal(M.deadlineText('2026-10-22', NOW), '明日まで');
});
await test('締切が近い順・超過は未報告として残す', () => {
  const list = [entry({ company: 'B', deadline: '2026-10-25' }), entry({ company: 'A', deadline: '2026-10-21' }), entry({ company: 'C', deadline: '2026-10-10', stage: '応募予定' })];
  assert.deepEqual(M.upcomingDeadlines(list, NOW).map((x) => x.entry.company), ['A', 'B']);
  assert.deepEqual(M.overdueDeadlines(list, NOW).map((x) => x.entry.company), ['C']);
  assert.deepEqual(M.sortEntries(list, 'deadline', NOW).map((e) => e.company), ['A', 'B', 'C']);
});
await test('途中から登録すると、そこまでの履歴を補う', () => {
  const e = entry({ stage: '一次面接' });
  const h = M.seedHistory(e, NOW);
  assert.equal(h[h.length - 1].to, '一次面接');
  assert.ok(h.some((x) => x.to === 'Webテスト'));
  const failed = entry({ stage: 'Webテスト不合格' });
  assert.deepEqual(M.seedHistory(failed, NOW).map((x) => x.to), ['応募予定', '書類選考中', 'ES提出済', 'Webテスト', 'Webテスト不合格']);
});
await test('分析：段階ごとの通過と内定率', () => {
  const mk = (stage) => { const e = entry({ stage }); return { ...e, history: M.seedHistory(e, NOW) }; };
  const list = [mk('内定'), mk('ES不合格'), mk('面接不合格'), mk('一次面接'), mk('気になる')];
  const a = M.analyze(list, '本選考');
  assert.equal(a.total, 5);
  assert.equal(a.started, 4);
  assert.equal(a.decided, 3);
  assert.equal(a.winRate, 33);
  const es = a.phases.find((p) => p.key === 'es');
  assert.deepEqual([es.total, es.passed], [4, 3]);
  const iv = a.phases.find((p) => p.key === 'interview');
  assert.deepEqual([iv.total, iv.passed], [2, 1]); // 一次面接中は結果待ちなので数えない
});
await test('パイプラインの列', () => {
  assert.equal(M.pipelineColumn(entry({ stage: '人事面談', flowSteps: ['人事面談'] })), 'interview');
  assert.equal(M.pipelineColumn(entry({ stage: '辞退' })), 'closed');
  assert.equal(M.pipelineColumn(entry({ stage: '内定' })), 'win');
});
await test('カレンダー：締切・選考予定・インターン期間・回答期限', () => {
  const e = entry({ type: 'インターン', deadline: '2026-10-25', nextDate: '2026-10-23', nextPlan: '面接', internMode: 'range', internStart: '2026-12-09', internEnd: '2026-12-11' });
  const ev = M.entryEvents(e);
  assert.deepEqual(ev.map((x) => `${x.kind}:${x.date}`), ['deadline:2026-10-25', 'next:2026-10-23', 'intern:2026-12-09', 'intern:2026-12-10', 'intern:2026-12-11']);
  const offer = M.entryEvents(entry({ stage: '内定', offerResponseDeadline: '2026-11-01' }));
  assert.ok(offer.some((x) => x.kind === 'offer'));
});
await test('内定のまとめ', () => {
  const o = M.offerSummary([entry({ stage: '内定', offerResponseDeadline: '2026-10-25' }), entry({ stage: '内定', offerDecision: '辞退' }), entry({ stage: '内定', offerDecision: '承諾' })], NOW);
  assert.deepEqual([o.holding, o.accepted, o.urgent], [2, 1, 1]);
});
await test('normalizeEntry は壊れた値を捨てる', () => {
  const e = M.normalizeEntry({ company: ' X ', type: '謎', stage: '謎', deadline: '11/5', portalUrl: 'javascript:alert(1)', history: [{ to: 1 }] }, NOW);
  assert.equal(e.company, 'X');
  assert.equal(e.type, 'インターン');
  assert.equal(e.stage, '応募予定');
  assert.equal(e.deadline, '');
  assert.equal(e.portalUrl, '');
  assert.deepEqual(e.history, []);
});

// ---------- 取り込み ----------
await test('メモ1行から企業名・種別・段階・締切を読む', () => {
  const c = I.parseMemoLine('〇〇システムズ 本選考 ES 11/5締切', NOW);
  assert.equal(c.company, '〇〇システムズ');
  assert.equal(c.type, '本選考');
  assert.equal(c.stage, '書類選考中');
  assert.equal(c.deadline, '2026-11-05');
  assert.equal(c.industry, 'IT・通信');
  const d = I.parseMemoLine('△△銀行 サマーインターン GD通過', NOW);
  assert.equal(d.company, '△△銀行');
  assert.equal(d.internSeason, 'サマー');
  assert.equal(d.stage, 'GD');
  assert.ok(d.flowSteps.includes('GD'));
  assert.equal(I.parseMemoLine('□□商事 一次面接 落ち', NOW).stage, '面接不合格');
});
await test('年なしの日付が1か月以上前なら来年', () => {
  assert.equal(I.guessDate('2/1', NOW), '2027-02-01');
  assert.equal(I.guessDate('10/1', NOW), '2026-10-01');
  assert.equal(I.guessDate('2/30', NOW), '');
});
await test('CSV：引用符・改行入りセル・BOM', () => {
  const rows = I.parseCsv('﻿会社名,メモ\n"A社","1行目\n2行目"\n"B,社","""引用"""\n');
  assert.deepEqual(rows, [['会社名', 'メモ'], ['A社', '1行目\n2行目'], ['B,社', '"引用"']]);
});
await test('NotionのCSVを候補にする（列の自動判定と余った列はメモへ）', () => {
  const csv = '名前,ステータス,締切,業界,志望度\nKSK,一次面接,2026年11月5日,IT,高\n,,,,\nJFE,ES提出済,"November 20, 2026",,中\n';
  const r = I.csvToCandidates(csv, NOW);
  assert.equal(r.candidates.length, 2);
  assert.equal(r.candidates[0].company, 'KSK');
  assert.equal(r.candidates[0].stage, '一次面接');
  assert.equal(r.candidates[0].deadline, '2026-11-05');
  assert.equal(r.candidates[0].industry, 'IT・通信');
  assert.match(r.candidates[0].memo, /志望度: 高/);
  assert.equal(r.candidates[1].deadline, '2026-11-20');
});

// ---------- ES添削 ----------
await test('ES添削：具体的な文は抽象的な文より高い', () => {
  const good = '私の強みは、課題の原因を分析して周囲を巻き込む力です。飲食店のアルバイトで、ピーク時の提供時間が長いという課題がありました。原因を調べると、作業の分担が曖昧なことが分かりました。そこで私から店長に役割表の導入を提案し、メンバー12人の意見を聞いて分担を決めました。その結果、提供時間を平均5分から3分に短縮できました。この経験で学んだ、原因を考えてから動く姿勢を、入社後は貴社の業務改善に活かしたいです。';
  const bad = '私はコミュニケーション能力があると思います。色々なことを頑張りました。すごく大変だったけど、ちゃんとやりました。御社でも頑張りたいと思います。';
  const g = R.reviewEs({ essay: good, limit: 220 });
  const b = R.reviewEs({ essay: bad, limit: 400 });
  assert.ok(g.total >= 70, `good=${g.total}`);
  assert.ok(b.total <= 30, `bad=${b.total}`);
  assert.ok(b.deductions.some((d) => d.label === '数字が1つもない'));
  assert.ok(b.deductions.some((d) => d.label === '話し言葉'));
  assert.ok(b.deductions.some((d) => d.label.includes('御社')));
  assert.ok(b.deductions.some((d) => d.label === '文字数が上限の8割未満'));
});
await test('ES添削：上限超過・文字数はサロゲートペアも1字', () => {
  assert.equal(R.countChars('𠮷野家'), 3);
  const r = R.reviewEs({ essay: 'あ'.repeat(410) + '。', limit: 400 });
  assert.ok(r.deductions.some((d) => d.label === '文字数オーバー'));
  assert.equal(R.reviewEs({ essay: '' }).total, 0);
});
await test('Claudeへの依頼文に本文・上限・創作禁止が入る', () => {
  const p = R.buildReviewPrompt({ company: 'A社', question: 'ガクチカ', limit: '400', essay: '本文です' });
  assert.match(p, /本文です/);
  assert.match(p, /400字以内/);
  assert.match(p, /作らない/);
});

// ---------- フィット ----------
await test('フィット：自己診断の点数化と、合う企業ほど高い', () => {
  assert.equal(F.QUESTIONS.length, 14);
  const challenger = F.QUESTIONS.map((q) => (['challenge', 'initiative', 'execution'].includes(q.axis) ? 5 : 2));
  const p = F.profileScores(challenger);
  assert.equal(p.challenge, 100);
  assert.equal(p.logic, 25);
  assert.ok(F.isProfileComplete(challenger));
  const bold = F.analyzeCompanyText('挑戦を続ける会社です。新しい事業に挑戦し、変革を起こす。自ら考え、率先して行動し、最後までやり切る人を求めます。挑戦を楽しもう。');
  const careful = F.analyzeCompanyText('品質と正確さを大切にします。データを分析し、論理的に考え抜く。計画を立て、検証を重ねる。品質へのこだわりが信頼を生みます。');
  assert.ok(F.fitReport(p, bold).score > F.fitReport(p, careful).score);
  assert.ok(F.fitReport(p, careful).gaps.length >= 1);
});

// ---------- おかんの声かけ ----------
await test('おかん：締切の声かけは設定の日数から、今日・明日はHIGH', () => {
  const list = [entry({ company: 'A社', deadline: '2026-10-24' })];
  assert.equal(D.shukatsuTrigger(list, NOW, { deadlineLeadDays: 1, eventNotice: true }), null);
  const t = D.shukatsuTrigger(list, NOW, { deadlineLeadDays: 3, eventNotice: true });
  assert.equal(t.priority, 'MEDIUM');
  const tomorrow = D.shukatsuTrigger([entry({ company: 'B社', deadline: '2026-10-22' })], NOW, D.DEFAULT_SHUKATSU_PREFS);
  assert.equal(tomorrow.priority, 'HIGH');
  assert.equal(D.renderShukatsuMessage(tomorrow, 'kansai', 3), 'B社の締切明日やで。出すもん出した？');
  assert.equal(D.shukatsuTrigger([entry({ deadline: '2026-10-22', stage: 'ES不合格' })], NOW, D.DEFAULT_SHUKATSU_PREFS), null);
});
await test('おかん：選考当日と内定の回答期限', () => {
  const ev = D.shukatsuTrigger([entry({ company: 'C社', nextDate: '2026-10-21', nextPlan: '一次面接', nextTime: '13:00', stage: '一次面接' })], NOW, D.DEFAULT_SHUKATSU_PREFS);
  assert.equal(ev.kind, 'event');
  assert.equal(D.renderShukatsuMessage(ev, 'standard', 1), '今日はC社の一次面接（13:00）があります。');
  assert.equal(D.shukatsuTrigger([entry({ nextDate: '2026-10-21' })], NOW, { deadlineLeadDays: 3, eventNotice: false }), null);
  const of = D.shukatsuTrigger([entry({ company: 'D社', stage: '内定', offerResponseDeadline: '2026-10-23' })], NOW, D.DEFAULT_SHUKATSU_PREFS);
  assert.equal(of.kind, 'offer');
  assert.equal(of.priority, 'HIGH');
  for (const tone of ['kansai', 'standard']) for (let lv = 1; lv <= 5; lv++) assert.ok(D.renderShukatsuMessage(of, tone, lv).includes('D社'));
});
await test('設定の読み替え（不正値は既定）', () => {
  assert.deepEqual(D.toShukatsuPrefs(null), D.DEFAULT_SHUKATSU_PREFS);
  assert.deepEqual(D.toShukatsuPrefs({ shukatsu_deadline_days: 5, shukatsu_event_notice: false }), { deadlineLeadDays: 3, eventNotice: false });
});

// ---------- 暗号化 ----------
await test('保管庫：暗号化して戻せる・パスワード違いは弾く', async () => {
  const box = await encryptJson({ a: { loginId: 'id', password: 'pw' } }, 'correct horse');
  assert.ok(!JSON.stringify(box).includes('pw"'));
  assert.deepEqual(await decryptJson(box, 'correct horse'), { a: { loginId: 'id', password: 'pw' } });
  await assert.rejects(() => decryptJson(box, 'wrong'), /違います/);
});

console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.join('\n')); process.exit(1); }
