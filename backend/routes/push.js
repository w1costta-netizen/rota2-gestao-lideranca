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

// DELETE /api/push/meus-dispositivos?requester_id=
// Remove todas as inscrições do usuário. Serve para limpar registros
// duplicados ou de domínio antigo — depois o app registra o aparelho
// atual de novo, do zero.
router.delete('/meus-dispositivos', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(400).json({ error: 'requester_id obrigatório' });

  const company = await companyDoUsuario(requester_id);
  const { data: antes } = await supabase
    .from('push_subscriptions').select('endpoint').eq('user_id', requester_id);

  const { error } = await supabase.from('push_subscriptions').delete().eq('user_id', requester_id);
  if (error) {
    registrarLog('limpar_dispositivos_push', 'push_subscriptions', 'erro', { company, user_id: requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: error.message });
  }
  registrarLog('limpar_dispositivos_push', 'push_subscriptions', 'sucesso', { company, user_id: requester_id, antes: { removidos: antes?.length || 0 } });
  res.json({ ok: true, removidos: antes?.length || 0 });
});

// GET /api/push/meus-dispositivos?requester_id=
// Lista os aparelhos registrados. Sem isso não há como saber se o celular
// conseguiu se cadastrar — a permissão fica "ativa" no aparelho mesmo
// quando o cadastro não chegou ao servidor, e nada denuncia o problema.
// O endereço completo é secreto (quem o tem consegue enviar push), então
// só sai o serviço de destino e a data.
router.get('/meus-dispositivos', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(400).json({ error: 'requester_id obrigatório' });

  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, created_at')
    .eq('user_id', requester_id)
    .order('created_at', { ascending: false });

  if (error) {
    registrarLog('listar_dispositivos_push', 'push_subscriptions', 'erro', { user_id: requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: error.message });
  }

  const aparelhos = (data || []).map(s => {
    const url = s.endpoint || '';
    let tipo = 'Outro navegador';
    if (url.includes('web.push.apple.com')) tipo = 'iPhone/iPad (Safari)';
    else if (url.includes('fcm.googleapis.com') || url.includes('android.googleapis.com')) tipo = 'Chrome/Android';
    else if (url.includes('mozilla.com')) tipo = 'Firefox';
    else if (url.includes('notify.windows.com')) tipo = 'Edge/Windows';
    return { tipo, criado_em: s.created_at };
  });

  res.json({ aparelhos });
});

// POST /api/push/recebido — o service worker do aparelho avisa que um push
// chegou e se conseguiu exibi-lo.
//
// Existe porque sem isso o diagnóstico é cego: a Apple responde "aceito",
// mas não há como saber se o push chegou ao aparelho, se o conteúdo foi
// lido e se a notificação chegou a ser exibida. Cada uma dessas três etapas
// falha de um jeito diferente e todas parecem iguais de fora.
//
// Sem autenticação porque quem chama é o service worker, que não tem sessão.
// Só grava se o identificador for de um perfil real, então no máximo alguém
// consegue poluir o próprio log.
router.post('/recebido', async (req, res) => {
  const { rastreio, fase, detalhe, versao } = req.body || {};
  if (!rastreio) return res.status(400).json({ error: 'rastreio obrigatório' });

  const { data: perfil } = await supabase
    .from('profiles').select('company').eq('id', rastreio).maybeSingle();
  if (!perfil) return res.status(403).json({ error: 'Acesso negado' });

  registrarLog('push_no_aparelho', 'push_subscriptions', fase === 'erro_ao_exibir' ? 'erro' : 'sucesso', {
    company: perfil.company,
    user_id: rastreio,
    depois: { fase, versao: versao || null, ...(detalhe || {}) },
    ...(fase === 'erro_ao_exibir' ? { erro: `Aparelho recebeu o push mas não conseguiu exibir: ${detalhe?.erro || 'sem detalhe'}` } : {}),
  });

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
    title: '🔔 Teste Rota Líder',
    body: 'As notificações estão funcionando corretamente!',
    page: 'dashboard',
    // Vai de volta no aviso que o aparelho manda, para sabermos qual
    // aparelho recebeu. O conteúdo do push é criptografado ponta a ponta,
    // então só o próprio aparelho do usuário consegue ler.
    rastreio: user_id,
  });

  // O endereço de identificação vai assinado em cada envio e a Apple o
  // valida — trocá-lo já derrubou a entrega no iOS sem gerar erro nenhum.
  // Sai aqui para dar para conferir qual está valendo de fato, já que uma
  // variável de ambiente pode estar sobrescrevendo o valor do código.
  const identificacao = process.env.VAPID_EMAIL || 'mailto:admin@rota2.app';

  logAction({ company, user_id, acao: 'testar_notificacao', tabela: 'push_subscriptions', depois: { enviados: sent, dispositivos: subs.length, identificacao } });
  res.json({ ok: true, sent, subscriptions: subs.length, identificacao });
});

module.exports = router;
