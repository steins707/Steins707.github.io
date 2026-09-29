const CACHE = 'medicine-app-v2';   // 版本号从 v1 改成 v2，强制更新

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
  self.skipWaiting();   // 新 SW 立即接管，不等旧页面关闭
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();  // 立即控制所有页面
});

self.addEventListener('fetch', e => {
  // 只处理 GET 请求，Supabase 的 POST/PATCH/DELETE 直接放行
  if (e.request.method !== 'GET') return;

  // Supabase API 请求不走缓存，始终走网络
  if (e.request.url.includes('supabase.co')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
