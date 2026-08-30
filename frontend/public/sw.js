const CACHE = 'rota2-v22';
const STATIC_ASSETS = ['/manifest.json','/icon-192.png','/icon-512.png'];

// Onde fica o que o service worker precisa para se reinscrever sozinho.
// NÃO É CACHE DE ARQUIVO e não pode ser apagado junto com as versões
// antigas — sem ele, uma troca de inscrição feita pelo navegador deixaria
// a pessoa sem notificação até o próximo login.
const DEPOSITO_PUSH = 'rota-push';
const CONFIG_PUSH   = '/__push-config';

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
      Promise.all(keys.filter(k => k !== CACHE && k !== DEPOSITO_PUSH).map(k => caches.delete(k)))
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
          // Arquivo de uma versão antiga, já apagado na publicação: a regra
          // "/* → index.html" da hospedagem devolve HTML com status 200. Se
          // isso for guardado, o erro fica preso no aparelho para sempre.
          // Devolvemos 404 de verdade para o app tratar como falha e recarregar.
          const tipo = res.headers.get('content-type') || '';
          if (!res.ok || tipo.includes('text/html')) {
            return new Response('', { status: 404, statusText: 'Arquivo de versão antiga' });
          }
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
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

// ─────────────────────────────────────────────────────────────
// NOTIFICAÇÕES — ETAPA 1
//
// REGRA INEGOCIÁVEL: todo push recebido tem que virar uma notificação
// visível. O iOS exige isso e pune quem não cumpre — ele cancela a
// inscrição do aparelho, e a partir daí a permissão continua aparecendo
// como ativa enquanto nada mais chega. Por isso não existe nenhum caminho
// aqui que termine sem exibir: nem sem conteúdo, nem com conteúdo
// ilegível, nem se o navegador recusar as opções.
// ─────────────────────────────────────────────────────────────
// Diz à tela qual versão está ativa NESTE aparelho.
//
// É o que separa dois problemas idênticos por fora: o push não chegar, e o
// aparelho estar rodando um service worker antigo que não sabe exibi-lo. O
// iOS segura o service worker antigo por bastante tempo em app instalado.
// Versão velha simplesmente não responde a esta mensagem — o silêncio já é
// o diagnóstico.
self.addEventListener('message', event => {
  if (event.data && event.data.tipo === 'VERSAO' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ versao: CACHE });
  }
});

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let dados = {};
    try {
      dados = event.data ? event.data.json() : {};
    } catch {
      // Conteúdo que não é JSON ainda serve como texto da notificação.
      try { dados = { mensagem: event.data.text() }; } catch { dados = {}; }
    }

    const titulo   = dados.titulo   || 'Rota Líder';
    const mensagem = dados.mensagem || 'Você tem uma novidade no Rota Líder.';

    // Só o essencial. Opção que o iOS não conhece pode fazer a chamada
    // inteira falhar — e falhar aqui significa não exibir nada.
    try {
      await self.registration.showNotification(titulo, {
        body: mensagem,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data: { pagina: dados.pagina || null },
      });
    } catch {
      await self.registration.showNotification(titulo, { body: mensagem });
    }

    // Avisa o servidor que o push chegou até aqui. Vai DEPOIS de exibir, e
    // com o erro engolido, porque relatar nunca pode atrapalhar a
    // notificação. É o que separa "o push não chegou ao aparelho" de
    // "chegou, mas o sistema não mostrou" — duas coisas idênticas vistas do
    // servidor, e a duvida que travou este diagnóstico.
    if (dados.usuario) {
      try {
        await fetch('/api/notificacoes/recebido', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usuario: dados.usuario, versao: CACHE }),
        });
      } catch { /* sem rede: a notificação já foi exibida, que é o que importa */ }
    }
  })());
});

// ─────────────────────────────────────────────────────────────
// ETAPA 2 — o navegador trocou a inscrição por conta própria.
//
// Acontece em reinstalação, restauração de backup e limpeza do sistema.
// Sem tratar, a inscrição antiga fica no banco recebendo envios que não
// chegam a lugar nenhum, e a pessoa para de receber sem nenhum aviso.
// ─────────────────────────────────────────────────────────────
function chaveParaBytes(base64) {
  const preenchimento = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalizada = (base64 + preenchimento).replace(/-/g, '+').replace(/_/g, '/');
  const bruto = atob(normalizada);
  return Uint8Array.from([...bruto].map(c => c.charCodeAt(0)));
}

self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil((async () => {
    try {
      const deposito = await caches.open(DEPOSITO_PUSH);
      const guardado = await deposito.match(CONFIG_PUSH);
      if (!guardado) return; // nunca chegou a se inscrever por aqui

      const { usuario, chave } = await guardado.json();
      if (!usuario || !chave) return;

      const nova = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: chaveParaBytes(chave),
      });

      await fetch('/api/notificacoes/inscrever', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: usuario,
          inscricao: nova.toJSON(),
          // Informa qual era a anterior para o servidor apagá-la; é a única
          // hora em que dá para saber que as duas são do mesmo aparelho.
          endereco_antigo: (event.oldSubscription && event.oldSubscription.endpoint) || null,
        }),
      });
    } catch { /* na próxima abertura do app o registro se acerta */ }
  })());
});

// Toque na notificação: traz o app para frente, ou abre se estiver fechado.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const janelas = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const aberta = janelas.find(c => c.url.startsWith(self.location.origin));
    if (aberta) return aberta.focus();
    return clients.openWindow('/');
  })());
});
