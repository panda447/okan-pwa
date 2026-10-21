/* おかんアプリのService Worker。
 * 役割は2つだけ：①画面を端末に控える（オフラインでも開ける） ②通知を表示する。
 */
const CACHE = 'okan-pwa-v2';
const SHELL = [
  './', 'index.html', 'style.css', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png',
  'js/main.js', 'js/store.js', 'js/ui.js', 'js/weather.js', 'js/okan.js', 'js/notify.js',
  'js/syncCode.js',
  'js/views/home.js', 'js/views/schedules.js', 'js/views/goals.js', 'js/views/log.js', 'js/views/settings.js',
  'js/views/shukatsu.js', 'js/views/entryForm.js', 'js/views/fit.js', 'js/views/es.js',
  'lib/datetime.js', 'lib/goalProgress.js',
  'lib/shukatsu/model.js', 'lib/shukatsu/importer.js', 'lib/shukatsu/esReview.js', 'lib/shukatsu/fit.js', 'lib/shukatsu/okanDeadline.js', 'lib/shukatsu/vault.js',
  'lib/okan/types.js', 'lib/okan/rules.js', 'lib/okan/templates.js', 'lib/okan/engine.js', 'lib/okan/suppression.js', 'lib/okan/schedulePlan.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  // 画面ファイルはネットワーク優先（更新がすぐ反映される）、繋がらなければ控えを使う
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request).then((hit) => hit || caches.match('index.html')))
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => 'focus' in c);
      return open ? open.focus() : self.clients.openWindow('./');
    })
  );
});
