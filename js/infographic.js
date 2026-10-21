// 就活の「分析」シートのインフォグラフィック。数字は model.js の analyze() が正で、ここは見せ方だけ。
// 動きはCSSのキーフレーム（差し込んだ瞬間に再生）＋ countUp() の数え上げ。
import { PIPELINE_COLUMNS, analyze, pipelineColumn } from '../lib/shukatsu/model.js';
import { countUp } from './motion.js';
import { esc } from './ui.js';

const num = (n, suffix = '') => `<span data-count="${n}" data-suffix="${suffix}">${n}${suffix}</span>`;
const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

/** 合格（内定）率のドーナツと、母数のタイル。 */
function hero(a, winLabel) {
  const rate = a.winRate ?? 0;
  const losses = a.decided - a.wins;
  return `
    <section class="ig-hero">
      <div class="ig-ring" role="img" aria-label="${winLabel}率 ${a.winRate === null ? 'まだ結果なし' : `${rate}%`}">
        <svg viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="50" class="track"/>
          <circle cx="60" cy="60" r="50" class="lose" pathLength="100" style="stroke-dashoffset:${a.decided ? 0 : 100}"/>
          <circle cx="60" cy="60" r="50" class="win" pathLength="100" style="stroke-dashoffset:${100 - rate}"/>
        </svg>
        <div class="ig-ring-center">${a.winRate === null ? '<b>—</b>' : `<b>${num(rate)}<small>%</small></b>`}<span>${winLabel}率</span></div>
      </div>
      <div class="ig-kpis">
        <div><span>登録</span><b>${num(a.total)}</b><em>件</em></div>
        <div><span>選考開始</span><b>${num(a.started)}</b><em>件</em></div>
        <div><span>結果が出た</span><b>${num(a.decided)}</b><em>件</em></div>
        <p class="ig-legend"><i class="win"></i>${winLabel} ${a.wins}　<i class="lose"></i>不合格 ${losses}</p>
      </div>
    </section>`;
}

const SEG_CLASS = { before: 'before', es: 'es', webTest: 'web', gd: 'gd', interview: 'iv', waiting: 'wait', win: 'win', closed: 'closed' };

/** いま各選考がどの段階にいるか（100%積み上げ）。 */
function nowBar(scoped) {
  if (!scoped.length) return '';
  const cols = PIPELINE_COLUMNS.map((c) => ({ ...c, n: scoped.filter((e) => pipelineColumn(e) === c.key).length })).filter((c) => c.n);
  return `
    <div class="ig-title"><span class="eyebrow">NOW</span><h3 class="h3">選考の現在地</h3></div>
    <div class="ig-stack" role="img" aria-label="${cols.map((c) => `${c.label}${c.n}件`).join('、')}">
      ${cols.map((c, i) => `<i class="seg-${SEG_CLASS[c.key]}" style="width:${pct(c.n, scoped.length)}%;--d:${i}" title="${esc(c.label)} ${c.n}件"></i>`).join('')}
    </div>
    <div class="ig-keys">${cols.map((c, i) => `<span style="--d:${i}"><i class="seg-${SEG_CLASS[c.key]}"></i>${esc(c.label)} <b>${c.n}</b></span>`).join('')}</div>`;
}

/** じょうご。段の幅＝選考開始に対する割合、段の間に「前の段からの通過率」。 */
function funnel(a) {
  if (!a.started) return `<div class="ig-title"><span class="eyebrow">FUNNEL</span><h3 class="h3">選考の進み方</h3></div><p class="muted">選考を始めると（ESを出すなど段階を進めると）出ます。</p>`;
  // 誰も受けていない段（GDの無い選考ばかり等）は0件の段に見えて「全員落ちた」と読めるので出さない。
  // funnel[1..PHASES.length] が phases[0..] に対応する
  const rows = a.funnel.filter((f, i) => i === 0 || i === a.funnel.length - 1 || a.phases[i - 1].total > 0 || f.count > 0);
  const width = (f) => Math.max(f.rate, 6); // 0件の段も形が見えるように最小幅
  return `
    <div class="ig-title"><span class="eyebrow">FUNNEL</span><h3 class="h3">選考の進み方（選考開始＝100%）</h3></div>
    <div class="ig-funnel">
      ${rows.map((f, i) => {
        const next = rows[i + 1];
        const cut = next ? Math.max(0, (1 - width(next) / width(f)) / 2) * 100 : 8;
        const step = i > 0 && rows[i - 1].count ? pct(f.count, rows[i - 1].count) : null;
        return `
          ${i > 0 ? `<div class="ig-step" style="--d:${i}">↓ 前の段から ${step === null ? '—' : `<b>${step}%</b>`}</div>` : ''}
          <div class="ig-layer" style="--d:${i}">
            <span class="lbl">${esc(f.label)}</span>
            <div class="shape-wrap"><div class="shape ${i === rows.length - 1 ? 'last' : ''}" style="width:${width(f)}%;--cut:${cut.toFixed(1)}%"></div></div>
            <span class="val">${num(f.count)}<small>件・${f.rate}%</small></span>
          </div>`;
      }).join('')}
    </div>`;
}

/** 段階ごとの通過率を半円メーターで。 */
function gauges(a) {
  const arc = 'M 10 60 A 50 50 0 0 1 110 60';
  return `
    <div class="ig-title"><span class="eyebrow">PHASE</span><h3 class="h3">段階ごとの通過率</h3></div>
    <div class="ig-gauges">
      ${a.phases.map((p, i) => `
        <div class="ig-gauge ${p.rate === null ? 'none' : ''}" style="--d:${i}">
          <svg viewBox="0 0 120 68" aria-hidden="true">
            <path d="${arc}" class="track" pathLength="100"/>
            ${p.rate === null ? '' : `<path d="${arc}" class="fill ${p.rate >= 50 ? 'good' : p.rate < 30 ? 'low' : ''}" pathLength="100" style="stroke-dashoffset:${100 - p.rate}"/>`}
          </svg>
          <b>${p.rate === null ? '—' : num(p.rate, '%')}</b>
          <span>${esc(p.label)}</span>
          <em>${p.total ? `${p.total}件中${p.passed}件通過` : 'まだ結果なし'}</em>
        </div>`).join('')}
    </div>
    ${bottleneck(a)}`;
}

/** 結果が2件以上ある段のうち、いちばん通過率が低いところを1つだけ言い切る。 */
function bottleneck(a) {
  const judged = a.phases.filter((p) => p.total >= 2);
  if (!judged.length) return '<p class="faint">結果が2件以上そろった段階から、つまずきやすい所を出します。</p>';
  const worst = [...judged].sort((x, y) => x.rate - y.rate || y.total - x.total)[0];
  return `<div class="ig-callout"><span class="eyebrow">BOTTLENECK</span><p>いちばん落ちているのは <b>${esc(worst.label)}</b>（通過率${worst.rate}%・${worst.total}件中${worst.passed}件）。対策はここから。</p></div>`;
}

/** 業界別。棒に加えて、結果1件＝1つの点で並べる（塗り＝合格）。 */
function industries(a, winLabel) {
  const head = `<div class="ig-title"><span class="eyebrow">INDUSTRY</span><h3 class="h3">業界別の${winLabel}率</h3></div>`;
  if (!a.industries.length) return `${head}<p class="muted">業界と最終結果が入ると出ます。</p>`;
  const MAX_DOTS = 24;
  return `${head}<div class="ig-ind">${a.industries.map((r, i) => `
    <div class="row-ind" style="--d:${i}">
      <div class="top"><span>${esc(r.label)}</span><b>${num(r.rate, '%')}</b></div>
      <div class="bar"><i style="width:${r.rate}%"></i></div>
      <div class="dots" aria-label="${r.total}件中${r.passed}件">${Array.from({ length: Math.min(r.total, MAX_DOTS) }, (_, k) => `<i class="${k < r.passed ? 'on' : ''}" style="--k:${k}"></i>`).join('')}${r.total > MAX_DOTS ? `<small>＋${r.total - MAX_DOTS}</small>` : ''}<small>${r.total}件中${r.passed}件</small></div>
    </div>`).join('')}</div>`;
}

export function analyticsHtml(entries, type) {
  const a = analyze(entries, type);
  const winLabel = type === 'インターン' ? '合格' : '内定';
  const scoped = entries.filter((e) => e.type === type);
  if (!a.total) return `<div class="ig"><p class="muted" style="margin-top:14px">${esc(type)}の選考はまだ登録されていません。</p></div>`;
  return `<div class="ig">
    ${hero(a, winLabel)}
    ${nowBar(scoped)}
    ${funnel(a)}
    ${gauges(a)}
    ${industries(a, winLabel)}
  </div>`;
}

/** 差し込んだ直後に呼ぶ。図形の動きはCSS、数字はここで数え上げる。 */
export function animateInfographic(box) {
  countUp(box);
}
