const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');
const { sendPushToUsers } = require('../lib/push');
const { logAction, logError, registrarLog } = require('../lib/auditLog');

async function companyDoUsuario(user_id) {
  const { data } = await supabase.from('profiles').select('company').eq('id', user_id).maybeSingle();
  return data?.company || null;
}

// GET /api/push/vapid-public-key
router.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// POST /api/push/subscribe
router.post('/subscribe', async (req, res) => {
  const { user_id, subscription } = req.body;
  if (!user_id || !subscription?.endpoint) return res.status(400).json({ error: 'Inválido' });
  const { error } = await supabase.from('push_subscriptions').upsert(
    { user_id, endpoint: subscription.endpoint, subscription },
    { onConflict: 'endpoint' }
  );
  // Só a falha é registrada: o cadastro do dispositivo roda sozinho a cada
  // login (autoRegisterPush), então logar sucesso geraria uma linha por acesso.
  if (error) {
    registrarLog('registrar_dispositivo_push', 'push_subscriptions', 'erro', { user_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: error.message });
  }
  res.json({ ok: true });
});

// DELETE /api/push/subscribe
router.delete('/subscribe', async (req, res) => {
  const { endpoint } = req.body;
  if (endpoint) {
    const { data: sub } = await supabase.from('push_subscriptions').select('user_id').eq('endpoint', endpoint).maybeSingle();
    const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
    if (error) {
      registrarLog('remover_dispositivo_push', 'push_subscriptions', 'erro', { user_id: sub?.user_id, rota: req.originalUrl, erro: error.message });
      return res.status(500).json({ error: error.message });
    }
    registrarLog('remover_dispositivo_push', 'push_subscriptions', 'sucesso', { user_id: sub?.user_id });
  }
  res.json({ ok: true });
});

// POST /api/push/test — envia push de teste para o próprio usuário
router.post('/test', async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id obrigatório' });

  const company = await companyDoUsuario(user_id);

  // Verifica se tem VAPID configurado
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    logError({ company, user_id, acao: 'testar_notificacao', tabela: 'push_subscriptions', rota: req.originalUrl, erro_mensagem: 'VAPID keys não configuradas no servidor' });
    return res.status(500).json({ error: 'VAPID keys não configuradas no servidor' });
  }

  // Verifica se tem subscription
  const { data: subs } = await supabase.from('push_subscriptions').select('endpoint').eq('user_id', user_id);
  if (!subs?.length) {
    logError({ company, user_id, acao: 'testar_notificacao', tabela: 'push_subscriptions', rota: req.originalUrl, erro_mensagem: 'Nenhuma subscription encontrada para este usuário' });
    return res.status(404).json({ error: 'Nenhuma subscription encontrada para este usuário. Ative as notificações no Perfil primeiro.' });
  }

  const sent = await sendPushToUsers([user_id], {
    title: '🔔 Teste Rota 2.0',
    body: 'As notificações estão funcionando corretamente!',
    page: 'dashboard',
  });

  logAction({ company, user_id, acao: 'testar_notificacao', tabela: 'push_subscriptions', depois: { enviados: sent, dispositivos: subs.length } });
  res.json({ ok: true, sent, subscriptions: subs.length });
});

module.exports = router;
