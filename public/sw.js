// PWA 서비스워커 — 앱 셸을 캐시해 설치형 웹앱으로 동작하게 한다.
// 정적(서버리스) 배포에서만 등록된다 (common.js 참조).
const VERSION = 'meatbox-tms-v2';
const ASSETS = [
  './', 'index.html', 'customer.html', 'driver.html', 'admin.html', 'controller.html',
  'common.css', 'common.js', 'bus.js', 'sim-web.js', 'static-flag.js',
  'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css',
  'vendor/mqtt/mqtt.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // 지도 타일·폰트는 네트워크 직행
  e.respondWith(
    caches.match(e.request).then((hit) => hit ||
      fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
    )
  );
});
