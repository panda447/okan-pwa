import { loadStore, state, subscribe } from './store.js';
import { refreshForecast } from './weather.js';
import { startNotifier } from './notify.js';
import { esc } from './ui.js';
import { countUp, installRipple, morph, moveTabIndicator, playEnter } from './motion.js';
import { renderHome } from './views/home.js';
import { renderSchedules } from './views/schedules.js';
import { renderGoals } from './views/goals.js';
import { renderLog } from './views/log.js';
import { renderSettings } from './views/settings.js';
import { renderShukatsu } from './views/shukatsu.js';
import { renderEs } from './views/es.js';

const app = document.getElementById('app');
const VIEWS = { home: renderHome, schedules: renderSchedules, shukatsu: renderShukatsu, es: renderEs, goals: renderGoals, log: renderLog, settings: renderSettings };
// 記録はタブに出さず、設定から開く。タブの点灯は設定に寄せる
const TAB_OF = { log: 'settings' };

let shownTab = null; // 入場アニメはタブが変わったときだけ（60秒ごとの描き直しでは動かさない）
const tabbar = document.getElementById('tabbar');

const currentTab = () => {
  const name = location.hash.replace(/^#\//, '');
  return VIEWS[name] ? name : 'home';
};

function render() {
  if (state.loadError) {
    app.innerHTML = `<section class="card"><div class="eyebrow">ERROR</div><h2>データを読み込めませんでした</h2>
      <p class="err">${esc(state.loadError)}</p><p class="muted">ブラウザの保存領域を読めませんでした。保存は止めてあります（壊れたデータを空で上書きしないため）。</p></section>`;
    return;
  }
  if (!state.loaded) {
    app.innerHTML = '<p class="muted">読み込み中…</p>';
    return;
  }
  const tab = currentTab();
  document.querySelectorAll('#tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.tab === (TAB_OF[tab] ?? tab)));
  moveTabIndicator(tabbar);
  // 入力の途中（設定フォーム・ES本文・検索など）を、裏の更新で消さない
  if (app.contains(document.activeElement) && document.activeElement.matches('input, select, textarea')) return;
  const y = window.scrollY;
  VIEWS[tab](app);
  window.scrollTo(0, y);
  const entering = tab !== shownTab;
  if (entering) { shownTab = tab; playEnter(app); countUp(app); }
  morph(app, entering);
}

subscribe(render);
installRipple();
window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });

// 就寝・予定は時刻で変わるので、開いたままでも「おかんの一言」を進める
setInterval(() => { if (currentTab() === 'home') render(); }, 60_000);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* 非対応でも本体は動く */ });
}

await loadStore();
refreshForecast();
setInterval(refreshForecast, 30 * 60_000);
startNotifier();
