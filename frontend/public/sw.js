const CACHE = 'rota2-v4';
const ASSETS = ['/','index.html','/manifest.json','/icon-192.png','/icon-512.png'];

// Instala e pré-cacheia assets estáticos
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// Remove caches antigos e assume controle imediato
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => clients.claim())
  );
});

// Cache-first para assets estáticos; network-first para /api
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // API: sempre vai à rede, sem cache
  if (url.pathname.startsWith('/api')) return;

  // Assets estáticos: cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok && e.request.method === 'GET') {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }
        return res;
      });
    })
  );
});

// Exibe notificação push
self.addEventListener('push', event => {
  if (!event.data) return;
  const { title, body, url, page } = event.data.json();
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: url || '/', page: page || 'dashboard' },
      vibrate: [200, 100, 200],
    })
  );
});

// Clique na notificação → abre/foca o app E navega para dashboard
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetPage = event.notification.data?.page || 'dashboard';
  const targetUrl  = event.notification.data?.url  || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // Se o app já está aberto, foca e envia mensagem para navegar
      const existing = list.find(c => c.url.startsWith(self.location.origin));
      if (existing) {
        existing.focus();
        existing.postMessage({ type: 'NAVIGATE', page: targetPage });
        return;
      }
      // Se não está aberto, abre e a URL já carrega o app (vai para dashboard por padrão)
      return clients.openWindow(targetUrl);
    })
  );
});
