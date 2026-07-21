import api from '../api';

function urlBase64ToUint8Array(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(b64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

// Chamado manualmente (com gesto do usuário): pede permissão se necessário
export async function registerPush(userId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
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

async function _subscribe(reg, userId) {
  const { data } = await api.get('/push/vapid-public-key');
  if (!data?.publicKey) throw new Error('VAPID public key não disponível');
  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    // Já subscrito: só garante que está salvo no banco
    await api.post('/push/subscribe', { user_id: userId, subscription: existing });
    return;
  }
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(data.publicKey),
  });
  await api.post('/push/subscribe', { user_id: userId, subscription: sub });
}
