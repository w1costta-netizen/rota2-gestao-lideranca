const express  = require('express');
const router   = express.Router();
const webpush  = require('web-push');
const supabase = require('../supabase');

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

// GET /api/notificacoes/chave-publica
router.get('/chave-publica', (req, res) => {
  if (!configurado) return res.status(503).json({ error: 'Notificações não configuradas no servidor' });
  res.json({ chavePublica: CHAVE_PUBLICA });
});

// POST /api/notificacoes/inscrever  { user_id, inscricao }
// Guarda a inscrição do aparelho. O endereço é único por aparelho, então
// reenviar a mesma inscrição apenas atualiza a linha em vez de duplicar.
router.post('/inscrever', async (req, res) => {
  const { user_id, inscricao } = req.body || {};
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

  res.json({ ok: true, servico: servicoDoEndereco(inscricao.endpoint) });
});

// POST /api/notificacoes/teste  { user_id }
// Dispara um push fixo para todos os aparelhos do usuário e devolve o
// resultado de cada um, separadamente. Sem esse detalhe é impossível saber
// se o problema é "não chegou no iPhone" ou "não chegou em lugar nenhum".
router.post('/teste', async (req, res) => {
  const { user_id } = req.body || {};
  if (!user_id)     return res.status(400).json({ error: 'user_id obrigatório' });
  if (!configurado) return res.status(503).json({ error: 'Notificações não configuradas no servidor' });

  const { data: inscricoes, error } = await supabase
    .from('push_subscriptions').select('endpoint, subscription').eq('user_id', user_id);

  if (error) return res.status(500).json({ error: error.message });
  if (!inscricoes?.length) {
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
  });

  const aparelhos = [];
  for (const item of inscricoes) {
    const servico = servicoDoEndereco(item.endpoint);
    try {
      const r = await webpush.sendNotification(item.subscription, conteudo);
      aparelhos.push({ servico, aceito: true, codigo: r?.statusCode ?? 201 });
    } catch (e) {
      aparelhos.push({ servico, aceito: false, codigo: e?.statusCode || null, motivo: e?.body || e?.message || 'erro' });
    }
  }

  res.json({ ok: true, aparelhos, aceitos: aparelhos.filter(a => a.aceito).length });
});

module.exports = router;
