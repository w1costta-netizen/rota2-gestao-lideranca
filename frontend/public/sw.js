const CACHE = 'rota2-v12';
const STATIC_ASSETS = ['/manifest.json','/icon-192.png','/icon-512.png'];

// Instala e pré-cacheia apenas assets imutáveis (sem index.html)
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
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

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // API: sempre vai à rede, sem cache
  if (url.pathname.startsWith('/api')) return;

  // index.html e navegação SPA: network-first (evita servir HTML desatualizado com hashes antigos)
  if (e.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Assets com hash no nome (JS/CSS): cache-first — são imutáveis por conteúdo
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          return res;
        });
      })
    );
    return;
  }

  // Demais recursos: network-first com fallback para cache
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok && e.request.method === 'GET') {
        caches.open(CACHE).then(c => c.put(e.request, res.clone()));
      }
      return res;
    }).catch(() => caches.match(e.request))
  );
});

// Exibe notificação push.
//
// Sempre exibe alguma coisa, mesmo que a leitura do conteúdo falhe. Antes,
// qualquer erro aqui fazia a notificação simplesmente não aparecer, sem
// nenhum sinal. No iOS isso é pior do que parece: o sistema exige que todo
// push recebido vire uma notificação visível e pode cancelar a inscrição de
// quem não cumpre — o aparelho continua mostrando a permissão como ativa e
// nunca mais chega nada.
self.addEventListener('push', event => {
  let dados = {};
  try {
    dados = event.data ? event.data.json() : {};
  } catch {
    try { dados = { body: event.data.text() }; } catch { dados = {}; }
  }

  const titulo = dados.title || 'Rota Líder';
  const opcoes = {
    body: dados.body || 'Você tem uma nova notificação.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: dados.url || '/', page: dados.page || 'dashboard' },
  };
  // `vibrate` não é suportado no iOS. Só é enviada onde o navegador declara
  // suportar — e a própria checagem vai dentro de try, porque `Notification`
  // pode nem existir no service worker do Safari: seria o mesmo tipo de erro
  // silencioso que este bloco existe para evitar.
  try {
    if (typeof Notification !== 'undefined' && 'vibrate' in Notification.prototype) {
      opcoes.vibrate = [200, 100, 200];
    }
  } catch { /* segue sem vibrar */ }

  event.waitUntil(
    self.registration.showNotification(titulo, opcoes).catch(() =>
      // Última tentativa sem nenhuma opção extra: melhor uma notificação
      // sem enfeite do que nenhuma.
      self.registration.showNotification(titulo, { body: opcoes.body })
    )
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
