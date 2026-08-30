import api from '../api';

function urlBase64ToUint8Array(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(b64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

// Chamado manualmente (com gesto do usuário): pede permissão se necessário
export async function registerPush(userId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return;
    await _subscribe(reg, userId);
  } catch (e) {
    console.warn('Push:', e.message);
  }
}

// Chamado automaticamente no login: só registra se a permissão JÁ foi concedida
export async function autoRegisterPush(userId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await _subscribe(reg, userId);
  } catch (e) {
    // silencioso
  }
}

// Compara a chave com que a inscrição foi criada com a chave atual do
// servidor. Se não baterem (chave VAPID trocada), o envio falha com 403 —
// e o pior: a permissão continua "ativa" no celular, então o usuário jura
// que está tudo certo e simplesmente nada chega. Foi o que aconteceu no iOS.
function chaveDaInscricaoConfere(subscription, publicKeyServidor) {
  try {
    const atual = subscription?.options?.applicationServerKey;
    if (!atual) return true; // navegador não expõe: não dá pra comparar

    // Só dá para comparar se vier como bloco de bytes. O Safari pode
    // devolver em outro formato, e aí `new Uint8Array(...)` gera um valor
    // vazio: a comparação falharia por engano e o app cancelaria a
    // inscrição boa do iPhone a cada abertura, criando um registro novo e
    // deixando o anterior morto no banco. Na dúvida, não mexe.
    // Identifica pelo formato, e não por `instanceof`: este último falha
    // quando o objeto vem de outro contexto (service worker), e o engano
    // custaria caro — cancelaria a inscrição boa.
    const marca = Object.prototype.toString.call(atual);
    const ehArrayBuffer = marca === '[object ArrayBuffer]';
    const ehView = typeof atual === 'object' && atual !== null
      && typeof atual.byteLength === 'number' && !ehArrayBuffer
      && Object.prototype.toString.call(atual.buffer) === '[object ArrayBuffer]';
    if (!ehArrayBuffer && !ehView) return true;

    const doServidor = urlBase64ToUint8Array(publicKeyServidor);
    const daInscricao = new Uint8Array(ehArrayBuffer ? atual : atual.buffer);
    if (!daInscricao.length) return true; // sem bytes para comparar
    if (daInscricao.length !== doServidor.length) return false;
    return daInscricao.every((b, i) => b === doServidor[i]);
  } catch {
    return true; // na dúvida, não desfaz a inscrição existente
  }
}

async function _subscribe(reg, userId) {
  const { data } = await api.get('/push/vapid-public-key');
  if (!data?.publicKey) throw new Error('VAPID public key não disponível');

  let existing = await reg.pushManager.getSubscription();

  // Inscrição feita com chave antiga precisa ser refeita, senão fica
  // permanentemente muda.
  if (existing && !chaveDaInscricaoConfere(existing, data.publicKey)) {
    try { await existing.unsubscribe(); } catch { /* segue e recria */ }
    existing = null;
  }

  if (existing) {
    // Já subscrito e com a chave certa: só garante que está salvo no banco
    await api.post('/push/subscribe', { user_id: userId, subscription: existing });
    return;
  }

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(data.publicKey),
  });
  await api.post('/push/subscribe', { user_id: userId, subscription: sub });
}
