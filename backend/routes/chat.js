const express  = require('express');
const router   = express.Router();
const supabase = require('../supabase');
const { registrarLog } = require('../lib/auditLog');
const { enviarPush } = require('../lib/notificacoes');

// ─────────────────────────────────────────────────────────────
// Conversas — chat entre duas pessoas da mesma loja.
//
// Toda rota confere que quem pede faz parte da conversa. Sem isso bastaria
// trocar o id na chamada para ler a conversa alheia — e conversa privada é
// o dado mais sensível que este app guarda.
// ─────────────────────────────────────────────────────────────

const LIMITE_TEXTO = 2000;

// O id vai cru dentro de uma string de filtro (.or) mais abaixo. Conferir o
// formato antes fecha a porta para alguém montar um filtro próprio e ler
// conversa alheia. Mesma proteção já usada em tarefas.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getPerfil(id) {
  if (!UUID.test(String(id || ''))) return null;
  const { data } = await supabase
    .from('profiles').select('id, company, full_name, avatar_url, active').eq('id', id).maybeSingle();
  return data || null;
}

// O par sempre em ordem: é o que garante uma única conversa entre duas
// pessoas, independente de quem começou a falar.
const parOrdenado = (x, y) => (x < y ? [x, y] : [y, x]);

// Dados da conversa do ponto de vista de quem está pedindo: quem é o outro,
// e quantas mensagens não lidas são SUAS.
function comoVista(conversa, euId) {
  const souA = conversa.usuario_a === euId;
  return {
    id: conversa.id,
    outro_id: souA ? conversa.usuario_b : conversa.usuario_a,
    ultima_texto: conversa.ultima_texto,
    ultima_em: conversa.ultima_em,
    ultima_minha: conversa.ultima_de === euId,
    nao_lidas: souA ? conversa.nao_lidas_a : conversa.nao_lidas_b,
  };
}

async function minhaConversa(conversaId, euId) {
  const { data } = await supabase
    .from('conversas').select('*').eq('id', conversaId).maybeSingle();
  if (!data) return null;
  if (data.usuario_a !== euId && data.usuario_b !== euId) return null;
  return data;
}

// GET /api/chat/contatos?requester_id= — com quem posso falar
router.get('/contatos', async (req, res) => {
  const me = await getPerfil(req.query.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  if (!me.company) return res.json([]);

  const { data, error } = await supabase
    .from('profiles').select('id, full_name, avatar_url, role, sector')
    .eq('company', me.company).eq('active', true)
    .neq('id', me.id)
    .order('full_name');
  if (error) return res.status(500).json({ error: 'Erro ao carregar os contatos.' });
  res.json(data || []);
});

// GET /api/chat/conversas?requester_id= — a lista, com a última mensagem
router.get('/conversas', async (req, res) => {
  const me = await getPerfil(req.query.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const { data, error } = await supabase
    .from('conversas').select('*')
    .or(`usuario_a.eq.${me.id},usuario_b.eq.${me.id}`)
    .order('ultima_em', { ascending: false, nullsFirst: false });
  if (error) return res.status(500).json({ error: 'Erro ao carregar as conversas.' });

  const vistas = (data || []).map(c => comoVista(c, me.id));
  if (!vistas.length) return res.json([]);

  // Uma consulta só para todos os nomes, em vez de uma por conversa.
  const { data: pessoas } = await supabase
    .from('profiles').select('id, full_name, avatar_url, role')
    .in('id', vistas.map(v => v.outro_id));
  const porId = Object.fromEntries((pessoas || []).map(p => [p.id, p]));

  res.json(vistas.map(v => ({ ...v, outro: porId[v.outro_id] || null })));
});

// POST /api/chat/conversas  { requester_id, com_id } — abre (ou reencontra)
router.post('/conversas', async (req, res) => {
  const { requester_id, com_id } = req.body || {};
  const me = await getPerfil(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  if (!com_id || com_id === requester_id) return res.status(400).json({ error: 'Escolha outra pessoa.' });

  const outro = await getPerfil(com_id);
  if (!outro || !outro.active) return res.status(404).json({ error: 'Pessoa não encontrada' });
  if (outro.company !== me.company) {
    return res.status(403).json({ error: 'Só é possível conversar com alguém da mesma loja.' });
  }

  const [a, b] = parOrdenado(me.id, outro.id);
  const { data: existente } = await supabase
    .from('conversas').select('*').eq('usuario_a', a).eq('usuario_b', b).maybeSingle();
  if (existente) return res.json({ ...comoVista(existente, me.id), outro });

  const { data: nova, error } = await supabase
    .from('conversas').insert({ company: me.company, usuario_a: a, usuario_b: b }).select().single();
  if (error) return res.status(500).json({ error: 'Erro ao abrir a conversa.' });
  res.json({ ...comoVista(nova, me.id), outro });
});

// GET /api/chat/conversas/:id/mensagens?requester_id=&depois=
//
// `depois` é o que torna a atualização barata: a cada poucos segundos a tela
// pede só o que chegou depois da última mensagem que ela já mostra.
router.get('/conversas/:id/mensagens', async (req, res) => {
  const { requester_id, depois } = req.query;
  const me = await getPerfil(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const conversa = await minhaConversa(req.params.id, me.id);
  if (!conversa) return res.status(404).json({ error: 'Conversa não encontrada' });

  let consulta = supabase
    .from('mensagens').select('id, de_id, texto, created_at').eq('conversa_id', conversa.id);
  if (depois) consulta = consulta.gt('created_at', depois);

  const { data, error } = await consulta.order('created_at', { ascending: true }).limit(300);
  if (error) return res.status(500).json({ error: 'Erro ao carregar as mensagens.' });
  res.json(data || []);
});

// POST /api/chat/mensagens  { requester_id, conversa_id, texto }
router.post('/mensagens', async (req, res) => {
  const { requester_id, conversa_id, texto } = req.body || {};
  const me = await getPerfil(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  if (!texto?.trim()) return res.status(400).json({ error: 'Escreva a mensagem.' });

  const conversa = await minhaConversa(conversa_id, me.id);
  if (!conversa) return res.status(404).json({ error: 'Conversa não encontrada' });

  const limpo = texto.trim().slice(0, LIMITE_TEXTO);
  const { data: msg, error } = await supabase.from('mensagens')
    .insert({ conversa_id: conversa.id, de_id: me.id, texto: limpo })
    .select('id, de_id, texto, created_at').single();

  if (error) {
    registrarLog('enviar_mensagem', 'mensagens', 'erro', { company: conversa.company, user_id: me.id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: 'Erro ao enviar.' });
  }

  // Atualiza o resumo da conversa e soma uma não lida para o OUTRO lado.
  const souA = conversa.usuario_a === me.id;
  const outroId = souA ? conversa.usuario_b : conversa.usuario_a;
  await supabase.from('conversas').update({
    ultima_texto: limpo.slice(0, 140),
    ultima_de: me.id,
    ultima_em: msg.created_at,
    ...(souA
      ? { nao_lidas_b: (conversa.nao_lidas_b || 0) + 1 }
      : { nao_lidas_a: (conversa.nao_lidas_a || 0) + 1 }),
  }).eq('id', conversa.id);

  // O conteúdo NÃO entra no log: conversa privada não é para ser lida por
  // quem audita. Fica só o registro de que houve troca de mensagem.
  registrarLog('enviar_mensagem', 'mensagens', 'sucesso', {
    company: conversa.company, user_id: me.id, depois: { conversa_id: conversa.id },
  });

  // O push é o que faz o chat funcionar de verdade: sem ele a pessoa só
  // descobre a mensagem se abrir o app por conta própria.
  enviarPush(outroId, `💬 ${me.full_name || 'Mensagem'}`, limpo.slice(0, 120), 'chat',
    { company: conversa.company, rota: req.originalUrl });

  res.json(msg);
});

// POST /api/chat/conversas/:id/lida  { requester_id } — zera as minhas
router.post('/conversas/:id/lida', async (req, res) => {
  const me = await getPerfil(req.body?.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const conversa = await minhaConversa(req.params.id, me.id);
  if (!conversa) return res.status(404).json({ error: 'Conversa não encontrada' });

  const campo = conversa.usuario_a === me.id ? 'nao_lidas_a' : 'nao_lidas_b';
  await supabase.from('conversas').update({ [campo]: 0 }).eq('id', conversa.id);
  res.json({ ok: true });
});

// GET /api/chat/nao-lidas?requester_id= — total, para o aviso no menu
router.get('/nao-lidas', async (req, res) => {
  const me = await getPerfil(req.query.requester_id);
  if (!me) return res.json({ total: 0 });

  const { data } = await supabase
    .from('conversas').select('usuario_a, usuario_b, nao_lidas_a, nao_lidas_b')
    .or(`usuario_a.eq.${me.id},usuario_b.eq.${me.id}`);

  const total = (data || []).reduce(
    (s, c) => s + (c.usuario_a === me.id ? c.nao_lidas_a : c.nao_lidas_b), 0
  );
  res.json({ total });
});

module.exports = router;
