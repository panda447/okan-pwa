// 見た目の明るい/暗い。設定（settings.theme）は 'auto' | 'light' | 'dark'。自動は端末の設定に合わせる。
// index.html の先頭にも同じ判定があり、描く前に色を決めている（ここは設定を変えたとき・端末の設定が変わったとき用）。
import { state } from './store.js';

export const THEME_OPTIONS = [{ value: 'auto', label: '端末に合わせる' }, { value: 'light', label: '明るい' }, { value: 'dark', label: '暗い' }];
const BAR_COLOR = { light: '#edf1ea', dark: '#121729' };
const media = window.matchMedia('(prefers-color-scheme: dark)');

export const themePref = () => (['light', 'dark'].includes(state.db.settings?.theme) ? state.db.settings.theme : 'auto');

export function applyTheme(pref = themePref()) {
  const theme = pref === 'auto' ? (media.matches ? 'dark' : 'light') : pref;
  if (document.documentElement.dataset.theme !== theme) document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR_COLOR[theme]);
  return theme;
}

media.addEventListener('change', () => applyTheme());
