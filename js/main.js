import { loadStore, state, subscribe } from './store.js';
import { refreshForecast } from './weather.js';
import { startNotifier } from './notify.js';
import { esc } from './ui.js';
import { renderHome } from './views/home.js';
import { renderSchedules } from './views/schedules.js';
import { renderGoals } from './views/goals.js';
import { renderLog } from './views/log.js';
import { renderSettings } from './views/settings.js';

const app = document.getElementById('app');
const VIEWS = { home: renderHome, schedules: renderSchedules, goals: renderGoals, log: renderLog, settings: renderSettings };

const currentTab = () => {
  const name = location.hash.replace(/^#\//, '');
  return VIEWS[name] ? name : 'home';
};

function render() {
  if (state.loadError) {
    app.innerHTML = `<section class="card"><div class="eyebrow">ERROR</div><h2>データを読み込めませんでした</h2>
      <p class="err">${esc(state.loadError)}</p><p class="muted">サーバ（<code>start.bat</code>）が動いているか確認して、再読み込みしてください。保存は止めてあります（空のデータで上書きしないため）。</p></section>`;
    return;
  }
  if (!state.loaded) {
    app.innerHTML = '<p class="muted">読み込み中…</p>';
    return;
  }
  const tab = currentTab();
  document.querySelectorAll('#tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  // 入力の途中（設定フォームなど）を、裏の更新で消さない
  if (tab === 'settings' && app.contains(document.activeElement) && document.activeElement.matches('input, select, textarea')) return;
  const y = window.scrollY;
  VIEWS[tab](app);
  window.scrollTo(0, y);
}

subscribe(render);
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
