const CACHE = 'medicine-app-v3';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      c.addAll([
        './',
        './index.html',
        './manifest.json',
        'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
      ])
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // 非 GET 请求直接放行（Supabase 的增删改是 POST/PATCH/DELETE）
  if (e.request.method !== 'GET') return;

  // Supabase API 请求不走缓存，始终走网络
  if (e.request.url.includes('supabase.co')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
