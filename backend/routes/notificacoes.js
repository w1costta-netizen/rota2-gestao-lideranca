const express  = require('express');
const router   = express.Router();
const webpush  = require('web-push');
const supabase = require('../supabase');
const { registrarLog } = require('../lib/auditLog');

// ─────────────────────────────────────────────────────────────
// ETAPA 1 — o mínimo absoluto do push.
//
// Só três coisas: entregar a chave pública, guardar a inscrição do
// aparelho e disparar um push fixo de teste. Nenhuma integração com
// módulo, nenhuma preferência, nenhum atalho.
// ─────────────────────────────────────────────────────────────

// Endereço de contato exigido pelo padrão Web Push. Vai assinado dentro de
// cada envio e a Apple valida com rigor.
//
// NÃO TROCAR. Fica fixo aqui de propósito, sem variável de ambiente, para
// que ninguém consiga mudá-lo sem perceber — uma troca desse valor não gera
// erro visível, só faz a entrega parar de funcionar em alguns aparelhos.
const CONTATO_VAPID = 'mailto:contato@rotalider.com.br';

const CHAVE_PUBLICA = process.env.VAPID_PUBLIC_KEY;
const CHAVE_PRIVADA = process.env.VAPID_PRIVATE_KEY;
const configurado   = Boolean(CHAVE_PUBLICA && CHAVE_PRIVADA);

if (configurado) {
  webpush.setVapidDetails(CONTATO_VAPID, CHAVE_PUBLICA, CHAVE_PRIVADA);
} else {
  console.error('[notificacoes] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY ausentes — nenhum push será entregue');
}

// Serve só para o diagnóstico ficar legível: saber que o push foi para um
// iPhone e não para o Chrome muda completamente o que investigar.
function servicoDoEndereco(endereco = '') {
  if (endereco.includes('web.push.apple.com'))   return 'iPhone/iPad (Safari)';
  if (endereco.includes('fcm.googleapis.com'))   return 'Chrome/Android';
  if (endereco.includes('mozilla.com'))          return 'Firefox';
  if (endereco.includes('notify.windows.com'))   return 'Edge/Windows';
  return 'outro navegador';
}

// ─────────────────────────────────────────────────────────────
// ETAPA 2 — envio robusto.
//
// Duas coisas que só aparecem com o tempo: inscrição morta e falha de
// entrega. Inscrição morta acumula a cada reinstalação e troca de aparelho,
// e faz o envio parecer bem-sucedido para um aparelho que não existe mais.
// Falha de entrega, sem registro, não deixa rastro nenhum.
// ─────────────────────────────────────────────────────────────
async function enviarParaUsuario(user_id, conteudo, contexto = {}) {
  const { data: inscricoes } = await supabase
    .from('push_subscriptions').select('endpoint, subscription').eq('user_id', user_id);

  if (!inscricoes?.length) return { aparelhos: [], aceitos: 0, removidos: 0 };

  const aparelhos = [];
  const mortas = [];

  for (const item of inscricoes) {
    const servico = servicoDoEndereco(item.endpoint);
    try {
      const r = await webpush.sendNotification(item.subscription, conteudo);
      aparelhos.push({ servico, aceito: true, codigo: r?.statusCode ?? 201 });
    } catch (e) {
      const codigo = e?.statusCode || null;
      // 404 e 410 significam que aquele aparelho não existe mais para o
      // serviço de push. Insistir nunca vai funcionar, então some.
      const morta = codigo === 404 || codigo === 410;
      if (morta) mortas.push(item.endpoint);
      aparelhos.push({ servico, aceito: false, codigo, removida: morta });

      // Falha real (não é aparelho que sumiu) precisa deixar rastro: é a
      // diferença entre "ninguém recebeu porque ninguém tinha o app" e
      // "ninguém recebeu porque o envio está quebrado".
      if (!morta) {
        registrarLog('enviar_push', 'push_subscriptions', 'erro', {
          ...contexto,
          user_id,
          erro: `${servico} recusou o envio${codigo ? ` (código ${codigo})` : ''}: ${e?.body || e?.message || 'sem detalhe'}`,
        });
      }
    }
  }

  if (mortas.length) {
    await supabase.from('push_subscriptions').delete().in('endpoint', mortas);
    registrarLog('limpar_inscricao_push', 'push_subscriptions', 'sucesso', {
      ...contexto,
      user_id,
      depois: { removidas: mortas.length, motivo: 'aparelho não existe mais' },
    });
  }

  return { aparelhos, aceitos: aparelhos.filter(a => a.aceito).length, removidos: mortas.length };
}

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
// Dispara um push fixo para todos os aparelhos do usuário e devolve o
// resultado de cada um, separadamente. Sem esse detalhe é impossível saber
// se o problema é "não chegou no iPhone" ou "não chegou em lugar nenhum".
router.post('/teste', async (req, res) => {
  const { user_id } = req.body || {};
  if (!user_id)     return res.status(400).json({ error: 'user_id obrigatório' });
  if (!configurado) return res.status(503).json({ error: 'Notificações não configuradas no servidor' });

  const { count } = await supabase
    .from('push_subscriptions').select('endpoint', { count: 'exact', head: true }).eq('user_id', user_id);
  if (!count) {
    return res.status(404).json({ error: 'Nenhum aparelho registrado. Ative as notificações primeiro.' });
  }

  const TITULO   = 'Teste Rota Líder';
  const MENSAGEM = 'Se você está vendo isso, as notificações funcionam.';

  // Vai nos dois formatos de nome de propósito. O aparelho pode estar com um
  // service worker antigo, que lê `title`/`body`; sem isso ele exibiria a
  // notificação escrita "undefined" — foi o que aconteceu no primeiro teste.
  // O service worker atual lê `titulo`/`mensagem` e ignora o resto.
  const conteudo = JSON.stringify({
    titulo: TITULO, mensagem: MENSAGEM,
    title: TITULO,  body: MENSAGEM,
    // Volta no aviso que o aparelho manda ao receber. O conteúdo do push é
    // criptografado ponta a ponta, então só o aparelho do próprio usuário
    // consegue ler isto.
    usuario: user_id,
  });

  const { data: perfil } = await supabase
    .from('profiles').select('company').eq('id', user_id).maybeSingle();

  const r = await enviarParaUsuario(user_id, conteudo, {
    company: perfil?.company || null,
    rota: req.originalUrl,
  });

  res.json({ ok: true, ...r });
});

module.exports = router;
