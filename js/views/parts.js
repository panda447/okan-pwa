// ホームと目標タブで共用する部品。
import { formatProgress } from '../../lib/goalProgress.js';
import { esc } from '../ui.js';

/** スタンプで見せるのは目標回数がこの数まで。それより多い目標は棒で見せる。 */
export const STAMP_MAX = 10;

// 押した直後のスタンプだけ「ぽん」と押す動きにするため、前回の数を覚えておく
const lastDone = new Map();

/**
 * 目標の進み具合。回数の目標が小さければスタンプカード、大きければ棒、目標回数が無ければ回数だけ。
 * @param p summarizeGoalProgress() の1要素
 * @param key 目標ごと・期間ごとに一意な文字列（動きの比較用）
 */
export function progressView(p, key) {
  const label = `<div class="top"><span>${esc(formatProgress(p))}</span>${p.ratio !== null && p.ratio >= 1 ? '<span style="color:var(--ok);font-weight:700">できた</span>' : ''}</div>`;
  if (p.target === null) return `<div class="progress">${label}</div>`;
  if (p.target > STAMP_MAX) {
    return `<div class="progress">${label}<div class="bar ${p.ratio >= 1 ? 'done' : ''}"><i data-k="${esc(key)}" style="width:${Math.round(p.ratio * 100)}%"></i></div></div>`;
  }
  const filled = Math.min(p.done, p.target);
  const before = lastDone.get(key);
  lastDone.set(key, filled);
  const stamps = Array.from({ length: p.target }, (_, i) => {
    const isNew = before !== undefined && filled > before && i === filled - 1;
    return `<i class="${i < filled ? 'on' : ''}${isNew ? ' new' : ''}">済</i>`;
  }).join('');
  return `<div class="progress">${label}<div class="stamps" role="img" aria-label="${esc(`${p.target}回のうち${filled}回`)}">${stamps}</div></div>`;
}

/** おかんの顔（置き手紙の署名に添える）。まばたきと小さなゆれはCSS。 */
export const OKAN_FACE = `<svg class="okan-face" viewBox="0 0 40 40" aria-hidden="true">
  <circle cx="20" cy="8.5" r="6" fill="#33301f"/>
  <circle cx="20" cy="23" r="14" fill="#fbe3c4" stroke="#33301f" stroke-width="1.6"/>
  <path d="M6.6 19.5C8 11.5 14 9.5 20 9.5s12 2 13.4 10c-3.6-3.4-8-4.6-13.4-4.6S10.200 16.100 6.600 19.500Z" fill="#33301f"/>
  <ellipse class="eye" cx="14.5" cy="23.500" rx="1.5" ry="2" fill="#33301f"/>
  <ellipse class="eye" cx="25.500" cy="23.500" rx="1.5" ry="2" fill="#33301f"/>
  <path d="M15 29.500c1.600 1.800 3.200 2.500 5 2.500s3.400-.7 5-2.500" fill="none" stroke="#33301f" stroke-width="1.6" stroke-linecap="round"/>
  <circle cx="10.500" cy="28" r="2.200" fill="#f2a79a" opacity=".7"/><circle cx="29.500" cy="28" r="2.200" fill="#f2a79a" opacity=".7"/>
</svg>`;
