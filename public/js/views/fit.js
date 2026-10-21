// 企業フィット診断（就活タブの「フィット」）。自己診断14問 → 企業の文章を貼る → 一致度とレーダー。
import { AXES, QUESTIONS, analyzeCompanyText, fitReport, isProfileComplete, profileScores, radarPoints } from '../../lib/shukatsu/fit.js';
import { saveFit, state } from '../store.js';
import { $, $$, esc, openSheet, confirmDialog } from '../ui.js';
import { countUp } from '../motion.js';

let quizIndex = 0;
let resultId = null;

function radar(self, company) {
  const r = 80;
  const ring = (k) => radarPoints(AXES.map(() => k), r).map((p) => p.join(',')).join(' ');
  const poly = (vals) => radarPoints(vals, r).map((p) => p.join(',')).join(' ');
  const labels = radarPoints(AXES.map(() => 100), r + 24).map(([x, y], i) => `<text x="${x}" y="${y + 4}" text-anchor="middle">${esc(AXES[i].label)}</text>`).join('');
  return `<svg class="radar" viewBox="-130 -110 260 220" role="img" aria-label="自分と企業の比較">
    ${[25, 50, 75, 100].map((k) => `<polygon points="${ring(k)}" class="grid"/>`).join('')}
    <polygon points="${poly(AXES.map((a) => company[a.key]))}" class="co"/>
    <polygon points="${poly(AXES.map((a) => self[a.key] ?? 50))}" class="me"/>
    ${labels}</svg>
    <p class="faint legend"><i class="me"></i>あなた　<i class="co"></i>企業が重視（文章中の出現から推定）</p>`;
}

function resultHtml(item, profile) {
  const report = fitReport(profile, analyzeCompanyText(item.text));
  const list = (title, rows, empty) => `<div class="eyebrow" style="margin-top:12px">${esc(title)}</div>${rows.length ? `<ul>${rows.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : `<p class="muted">${esc(empty)}</p>`}`;
  return `
    <div class="score-row"><div class="score"><span data-count="${report.score}">${report.score}</span><small>/100</small></div><div><b>${esc(item.name)}</b><div class="muted">推定の確からしさ：${esc(report.confidence)}${report.confidence === '低' ? '（文章が短いかキーワードが少ない。理念・求める人物像・社員インタビューなどを足すと上がる）' : ''}</div></div></div>
    ${radar(profile, analyzeCompanyText(item.text).emphasis)}
    ${list('STRENGTHS 合っているところ', report.strengths, '企業が強く求める軸で、目立って強いところは見つかりませんでした。')}
    ${list('GAPS ずれているところ', report.gaps, '大きなずれは見つかりませんでした。')}
    ${list('INTERVIEW 面接で用意するエピソード', report.interviewTips, '—')}
    <p class="faint">キーワードの出現数から出した目安です。企業研究の入口として使い、面接では一次情報で確かめたことを話してください。</p>`;
}

export function renderFit(root) {
  const fit = state.db.fit;
  const answers = fit.answers || [];
  const done = isProfileComplete(answers);
  const profile = profileScores(answers);
  const companies = fit.companies || [];
  const ranking = done
    ? companies.map((c) => ({ ...c, score: fitReport(profile, analyzeCompanyText(c.text)).score })).sort((a, b) => b.score - a.score)
    : companies.map((c) => ({ ...c, score: null }));
  const names = [...new Set(state.db.entries.map((e) => e.company).filter(Boolean))];
  root.innerHTML = `
    <section class="card">
      <div class="eyebrow">STEP 1</div><h2>自分の傾向</h2>
      ${done
        ? `<p class="muted">7つの軸の自己診断は回答済みです。</p><div class="axis-list">${AXES.map((a) => `<div><span>${esc(a.label)}</span><div class="bar"><i style="width:${profile[a.key]}%"></i></div><b>${profile[a.key]}</b></div>`).join('')}</div>
           <button class="btn small" id="quiz">答え直す</button>`
        : `<p class="muted">14問に答えると、主体性・協働性・挑戦志向・論理/慎重性・実行力・適応力・成長/学習の7軸で傾向を出します（${answers.filter(Boolean).length}/14問回答済み）。</p><button class="btn primary" id="quiz">診断をはじめる</button>`}
    </section>
    <section class="card">
      <div class="eyebrow">STEP 2</div><h2>企業の文章と比べる</h2>
      <p class="muted">企業理念・求める人物像・社員インタビューなどを貼り付けます。文章は端末内だけに保存し、どこにも送りません。</p>
      <label class="field">企業名<input id="fitName" list="fitNames" autocomplete="off"><datalist id="fitNames">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist></label>
      <label class="field">企業の文章<textarea id="fitText" rows="5" placeholder="私たちは、挑戦を恐れず…"></textarea></label>
      <p class="faint" id="fitCount">0字</p>
      <p class="err" id="fitErr" hidden></p>
      <button class="btn primary" id="fitRun" ${done ? '' : 'disabled'}>比べる</button>${done ? '' : ' <span class="faint">先にSTEP 1に答えてください。</span>'}
    </section>
    <div class="section"><div><span class="eyebrow">RANKING</span><h2>一致度ランキング</h2></div><span class="muted">${companies.length}社</span></div>
    <div class="list">${ranking.length ? ranking.map((c) => `
      <div class="row click" data-result="${esc(c.id)}"><span class="time">${c.score === null ? '—' : `${c.score}点`}</span><div class="main"><b>${esc(c.name)}</b><span class="faint">${esc(new Date(c.at).toLocaleDateString('ja-JP'))}・${[...c.text].length}字</span></div><button class="btn small ghost" data-del="${esc(c.id)}" aria-label="${esc(c.name)}を削除">×</button></div>`).join('') : '<div class="empty">まだ比べた企業はありません。</div>'}</div>`;

  $('#quiz', root).addEventListener('click', () => { quizIndex = done ? 0 : Math.max(0, answers.findIndex((a) => !a)); openQuiz(); });
  $('#fitText', root).addEventListener('input', (ev) => { $('#fitCount', root).textContent = `${[...ev.target.value].length}字`; });
  $('#fitRun', root).addEventListener('click', () => {
    const name = $('#fitName', root).value.trim();
    const text = $('#fitText', root).value.trim();
    const err = $('#fitErr', root);
    if (!name || [...text].length < 50) { err.textContent = '企業名と、50字以上の文章を入れてください。'; err.hidden = false; return; }
    const item = { id: crypto.randomUUID(), name, text: text.slice(0, 20000), at: new Date().toISOString() };
    saveFit({ companies: [item, ...companies.filter((c) => c.name !== name)].slice(0, 100) });
    resultId = item.id;
    openResult();
  });
  $$('[data-result]', root).forEach((r) => r.addEventListener('click', (ev) => { if (ev.target.closest('[data-del]')) return; resultId = r.dataset.result; openResult(); }));
  $$('[data-del]', root).forEach((b) => b.addEventListener('click', async () => {
    const item = companies.find((c) => c.id === b.dataset.del);
    if (item && await confirmDialog({ title: '診断結果を削除しますか？', target: item.name })) saveFit({ companies: companies.filter((c) => c.id !== item.id) });
  }));
}

function openResult() {
  const item = state.db.fit.companies.find((c) => c.id === resultId);
  if (!item) return;
  if (!isProfileComplete(state.db.fit.answers)) return;
  openSheet({ title: '企業フィット診断', bodyHtml: resultHtml(item, profileScores(state.db.fit.answers)), submitLabel: '閉じる', onSubmit() {}, onOpen: countUp });
}

function openQuiz() {
  const answers = [...(state.db.fit.answers || [])];
  const q = QUESTIONS[quizIndex];
  const axis = AXES.find((a) => a.key === q.axis);
  openSheet({
    title: `自己診断 ${quizIndex + 1} / ${QUESTIONS.length}`,
    bodyHtml: `
      <div class="bar" style="margin-bottom:14px"><i style="width:${Math.round((quizIndex / QUESTIONS.length) * 100)}%"></i></div>
      <div class="eyebrow">${esc(axis.label)}</div>
      <p class="okan-say" style="font-size:18px">${esc(q.text)}</p>
      <div class="scale">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="${Number(answers[quizIndex]) === n ? 'on' : ''}" data-ans="${n}">${n}</button>`).join('')}</div>
      <div class="scale-labels"><span>${esc(q.left)}</span><span>${esc(q.right)}</span></div>
      ${quizIndex > 0 ? '<button type="button" class="btn small ghost" id="prevQ" style="margin-top:12px">‹ 前の質問</button>' : ''}`,
    submitLabel: '中断する',
    onSubmit() {},
    onOpen(form) {
      $$('[data-ans]', form).forEach((b) => b.addEventListener('click', () => {
        answers[quizIndex] = Number(b.dataset.ans);
        saveFit({ answers });
        if (quizIndex < QUESTIONS.length - 1) { quizIndex += 1; openQuiz(); } else { $('#sheet').close(); }
      }));
      $('#prevQ', form)?.addEventListener('click', () => { quizIndex -= 1; openQuiz(); });
    },
  });
}
