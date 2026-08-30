const express  = require('express');
const router   = express.Router();
const supabase = require('../supabase');
const { registrarLog } = require('../lib/auditLog');
const { enviarPush, servicoDoEndereco, configurado, CHAVE_PUBLICA } = require('../lib/notificacoes');

// Rotas de notificação: entregar a chave pública, guardar a inscrição do
// aparelho, receber a confirmação de que o push chegou, e disparar o teste.
// O envio em si mora em lib/notificacoes.js, que é o ponto único do app.

// GET /api/notificacoes/chave-publica
router.get('/chave-publica', (req, res) => {
  if (!configurado) return res.status(503).json({ error: 'Notificações não configuradas no servidor' });
  res.json({ chavePublica: CHAVE_PUBLICA });
});

// POST /api/notificacoes/inscrever  { user_id, inscricao, endereco_antigo }
// Guarda a inscrição do aparelho. O endereço é único por aparelho, então
// reenviar a mesma inscrição apenas atualiza a linha em vez de duplicar.
router.post('/inscrever', async (req, res) => {
  const { user_id, inscricao, endereco_antigo } = req.body || {};
  if (!user_id)             return res.status(400).json({ error: 'user_id obrigatório' });
  if (!inscricao?.endpoint) return res.status(400).json({ error: 'inscrição inválida' });

  // Sem estas duas chaves o navegador não consegue decifrar o conteúdo, e o
  // envio falharia com uma mensagem confusa lá na frente. Melhor recusar aqui.
  if (!inscricao?.keys?.p256dh || !inscricao?.keys?.auth) {
    return res.status(400).json({ error: 'inscrição sem as chaves de criptografia' });
  }

  const { error } = await supabase.from('push_subscriptions').upsert(
    { user_id, endpoint: inscricao.endpoint, subscription: inscricao },
    { onConflict: 'endpoint' }
  );
  if (error) return res.status(500).json({ error: error.message });

  // O navegador troca a inscrição sozinho de vez em quando, e quando isso
  // acontece ele informa qual era a anterior. Sem apagá-la, ela ficaria para
  // sempre no banco recebendo envios que não chegam a aparelho nenhum.
  if (endereco_antigo && endereco_antigo !== inscricao.endpoint) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', endereco_antigo);
  }

  res.json({ ok: true, servico: servicoDoEndereco(inscricao.endpoint) });
});

// DELETE /api/notificacoes/inscricao  { endpoint }
//
// Chamado ao sair da conta. Em loja o computador é compartilhado: sem isto,
// quem saiu continuaria recebendo push naquela máquina — inclusive a prévia
// de mensagem privada, na tela de quem ficou.
//
// Não exige identificação: quem conhece o endereço da inscrição é o próprio
// aparelho, e o pior que alguém faria com ele é parar de receber notificação.
router.delete('/inscricao', async (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ error: 'endpoint obrigatório' });

  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// GET /api/notificacoes/meus-aparelhos?requester_id=
// Mostra onde a pessoa está registrada para receber. Serve para explicar o
// caso clássico de a notificação chegar no computador e não no celular:
// sem isso, ela não tem como saber que o celular nunca chegou a se
// cadastrar, e conclui que o app não funciona.
router.get('/meus-aparelhos', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(400).json({ error: 'requester_id obrigatório' });

  const { data, error } = await supabase
    .from('push_subscriptions').select('endpoint, created_at')
    .eq('user_id', requester_id).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });

  // O endereço completo fica de fora de propósito: quem o tem consegue
  // enviar notificação para aquele aparelho.
  res.json({
    aparelhos: (data || []).map(a => ({
      tipo: servicoDoEndereco(a.endpoint),
      registrado_em: a.created_at,
    })),
  });
});

// POST /api/notificacoes/recebido  { usuario, versao }
// O aparelho avisa que um push chegou nele. É o que separa duas coisas
// idênticas vistas do servidor: o push não chegar ao aparelho, e chegar mas
// o sistema do aparelho não exibir. Quem chama é o service worker, que não
// tem sessão — por isso sem autenticação; só grava se for um perfil real.
router.post('/recebido', async (req, res) => {
  const { usuario, versao } = req.body || {};
  if (!usuario) return res.status(400).json({ error: 'usuario obrigatório' });

  const { data: perfil } = await supabase
    .from('profiles').select('company').eq('id', usuario).maybeSingle();
  if (!perfil) return res.status(403).json({ error: 'Acesso negado' });

  registrarLog('push_chegou_no_aparelho', 'push_subscriptions', 'sucesso', {
    company: perfil.company,
    user_id: usuario,
    depois: { versao: versao || null },
  });

  res.json({ ok: true });
});

// POST /api/notificacoes/teste  { user_id }
// Dispara um push fixo e devolve o resultado de CADA aparelho. Sem esse
// detalhe é impossível saber se o problema é "não chegou no iPhone" ou
// "não chegou em lugar nenhum" — foi o que faltou no diagnóstico anterior.
router.post('/teste', async (req, res) => {
  const { user_id } = req.body || {};
  if (!user_id)     return res.status(400).json({ error: 'user_id obrigatório' });
  if (!configurado) return res.status(503).json({ error: 'Notificações não configuradas no servidor' });

  const { count } = await supabase
    .from('push_subscriptions').select('endpoint', { count: 'exact', head: true }).eq('user_id', user_id);
  if (!count) {
    return res.status(404).json({ error: 'Nenhum aparelho registrado. Ative as notificações primeiro.' });
  }

  const { data: perfil } = await supabase
    .from('profiles').select('company').eq('id', user_id).maybeSingle();

  const r = await enviarPush(
    user_id,
    'Teste Rota Líder',
    'Se você está vendo isso, as notificações funcionam.',
    'geral',
    // Só o teste pede confirmação de recebimento: nos envios do dia a dia
    // isso encheria os Logs de uma linha por notificação entregue.
    { company: perfil?.company || null, rota: req.originalUrl, confirmarRecebimento: true },
  );

  res.json({ ok: true, aparelhos: r.aparelhos, aceitos: r.enviados, removidos: r.removidos });
});

module.exports = router;
