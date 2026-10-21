// 動きの共通処理。画面は innerHTML で丸ごと描き直すので、
// 「タブを開いたときだけ入場アニメ」「値が変わった部品だけ前の値から動かす」をここで受け持つ。
export const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const ENTER_MS = 2400;
const timers = new WeakMap();

/** el の直下の子を順番に浮かび上がらせる。描き直しのたびには呼ばない（タブ切替・表示切替のときだけ）。 */
export function playEnter(el) {
  if (!el || reduced()) return;
  [...el.children].forEach((c, i) => c.style.setProperty('--i', Math.min(i, 12)));
  el.classList.remove('enter');
  void el.offsetWidth; // 付け直しでアニメを最初から
  el.classList.add('enter');
  clearTimeout(timers.get(el));
  timers.set(el, setTimeout(() => el.classList.remove('enter'), ENTER_MS));
}

const ease = (t) => 1 - Math.pow(1 - t, 3);

/** 数字を from から to まで数え上げる。suffix は「%」など。 */
export function tween(el, from, to, { duration = 900, delay = 0, suffix = '' } = {}) {
  if (reduced() || from === to) { el.textContent = `${to}${suffix}`; return; }
  const start = performance.now() + delay;
  el.textContent = `${from}${suffix}`;
  const step = (now) => {
    const t = Math.min(1, Math.max(0, (now - start) / duration));
    el.textContent = `${Math.round(from + (to - from) * ease(t))}${suffix}`;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** [data-count="数値"] を0から数え上げる（入場時・シートを開いたとき用）。 */
export function countUp(root) {
  root.querySelectorAll('[data-count]').forEach((el, i) => {
    tween(el, 0, Number(el.dataset.count), { delay: Number(el.dataset.delay ?? i * 60), suffix: el.dataset.suffix ?? '' });
  });
}

// [data-k] を付けた部品の「前回の値」。描き直し後に前回の値から今回の値へ動かす。
const prev = new Map();

/**
 * 描き直しの直後に呼ぶ。
 * - .bar i[data-k]：前回の幅から今回の幅へ伸び縮みする
 * - [data-num][data-k]：前回の数から今回の数へ数え直す
 */
export function morph(root, recordOnly = false) {
  root.querySelectorAll('.bar i[data-k]').forEach((el) => {
    const k = `bar:${el.dataset.k}`;
    const to = el.style.width;
    const from = prev.get(k);
    prev.set(k, to);
    if (recordOnly || from === undefined || from === to || reduced()) return;
    el.style.transition = 'none';
    el.style.width = from;
    void el.offsetWidth;
    el.style.transition = '';
    el.style.width = to;
    el.closest('.progress, .stat, .row, .card')?.classList.add('bump');
  });
  root.querySelectorAll('[data-num][data-k]').forEach((el) => {
    const k = `num:${el.dataset.k}`;
    const to = Number(el.dataset.num);
    const from = prev.get(k);
    prev.set(k, to);
    if (!recordOnly && from !== undefined && from !== to) tween(el, from, to, { duration: 600 });
  });
}

/** ボタンを押した位置から波紋を出す（全ボタン共通・委任）。 */
export function installRipple() {
  document.addEventListener('pointerdown', (ev) => {
    const b = ev.target.closest('.btn, .chip, .tabbar a, .dl-card, .lane-card, .scale button, .cal button.c');
    if (!b || reduced()) return;
    const r = b.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2;
    const s = document.createElement('span');
    s.className = 'ripple';
    s.style.cssText = `width:${size}px;height:${size}px;left:${ev.clientX - r.left - size / 2}px;top:${ev.clientY - r.top - size / 2}px`;
    b.appendChild(s);
    s.addEventListener('animationend', () => s.remove());
  });
}

/** 達成したときの紙吹雪。el の位置から飛ばす。 */
export function burst(el, n = 18) {
  if (!el || reduced()) return;
  const r = el.getBoundingClientRect();
  const layer = document.createElement('div');
  layer.className = 'burst';
  layer.style.left = `${r.left + r.width / 2}px`;
  layer.style.top = `${r.top + r.height / 2}px`;
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.4;
    const d = 40 + Math.random() * 50;
    p.style.setProperty('--x', `${Math.cos(a) * d}px`);
    p.style.setProperty('--y', `${Math.sin(a) * d - 20}px`);
    p.style.setProperty('--r', `${Math.random() * 360}deg`);
    p.style.setProperty('--c', `var(--burst-${i % 4})`);
    layer.appendChild(p);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 1000);
}

/** タブバーの下を滑るハイライトを、点いているタブの位置へ動かす。 */
export function moveTabIndicator(tabbar) {
  const links = [...tabbar.querySelectorAll('a')];
  const i = links.findIndex((a) => a.classList.contains('on'));
  tabbar.style.setProperty('--tab-i', Math.max(0, i));
}
