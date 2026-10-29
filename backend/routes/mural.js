const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');
const { enviarPush, usuariosDaLoja } = require('../lib/notificacoes');
const { logAction, logError, registrarLog } = require('../lib/auditLog');
const { vistosDe, marcarVisto, comentariosPorItem, avisarDesde, antesDoCorte } = require('../lib/leituras');

async function getProfile(id) {
  const { data } = await supabase.from('profiles').select('access_level, company, full_name, created_at').eq('id', id).single();
  return data;
}
const isManager = p => p && ['admin','supervisor','master'].includes(p.access_level);

// ─────────────────────────────────────────────────────────────
// Tipos de informação do mural.
//
// Estes 4 ficam no código: toda empresa nasce com eles. O resto é da própria
// empresa (tabela mural_categorias), na linguagem dela. Só o administrador
// — o líder que comprou o acesso — ou o master cria, renomeia e remove;
// os demais só escolhem entre os que existem.
// ─────────────────────────────────────────────────────────────
const TIPOS_BASE = ['meta', 'regra', 'lembrete', 'geral'];
const podeGerirTipos = p => p && ['admin', 'master'].includes(p.access_level);

// Mesmo critério do Diário: "Segurança" e "seguranca" viram uma coisa só.
function paraChave(nome) {
  return String(nome || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

async function tipoValido(company, chave) {
  if (TIPOS_BASE.includes(chave)) return true;
  const { data } = await supabase.from('mural_categorias')
    .select('id').eq('company', company).eq('chave', chave).maybeSingle();
  return !!data;
}

// GET /api/mural/categorias?requester_id=&company= — os que esta empresa criou
router.get('/categorias', async (req, res) => {
  const me = await getProfile(req.query.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  const company = me.access_level === 'master' ? req.query.company : me.company;
  if (!company) return res.json([]);
  const { data, error } = await supabase.from('mural_categorias')
    .select('id, chave, nome, cor').eq('company', company).order('nome');
  if (error) return res.status(500).json({ error: 'Erro ao carregar os tipos.' });
  res.json(data || []);
});

// POST /api/mural/categorias { requester_id, nome, cor, company? }
router.post('/categorias', async (req, res) => {
  const { requester_id, nome, cor, company: bodyCompany } = req.body || {};
  const me = await getProfile(requester_id);
  if (!podeGerirTipos(me)) return res.status(403).json({ error: 'Só o administrador da empresa cria tipos.' });
  const company = me.access_level === 'master' ? bodyCompany : me.company;
  if (!company) return res.status(400).json({ error: 'Escolha a empresa.' });
  if (!nome?.trim()) return res.status(400).json({ error: 'Dê um nome ao tipo.' });

  const chave = paraChave(nome);
  if (!chave) return res.status(400).json({ error: 'Use letras ou números no nome.' });
  if (TIPOS_BASE.includes(chave)) return res.status(409).json({ error: 'Esse tipo já existe.' });

  const { data, error } = await supabase.from('mural_categorias')
    .insert({ company, chave, nome: nome.trim().slice(0, 40), cor: cor || '#5F5E5A', created_by: requester_id })
    .select('id, chave, nome, cor').single();
  if (error) {
    const jaExiste = String(error.message || '').includes('duplicate') || error.code === '23505';
    if (jaExiste) return res.status(409).json({ error: 'Esse tipo já existe nesta empresa.' });
    logError({ company, user_id: requester_id, acao: 'criar_tipo_mural', tabela: 'mural_categorias', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: 'Erro ao criar o tipo.' });
  }
  logAction({ company, user_id: requester_id, acao: 'criar_tipo_mural', tabela: 'mural_categorias', depois: { nome: data.nome } });
  res.json(data);
});

// PUT /api/mural/categorias/:id { requester_id, nome?, cor? } — a chave não muda
router.put('/categorias/:id', async (req, res) => {
  const { requester_id, nome, cor } = req.body || {};
  const me = await getProfile(requester_id);
  if (!podeGerirTipos(me)) return res.status(403).json({ error: 'Só o administrador da empresa altera tipos.' });
  const { data: tipo } = await supabase.from('mural_categorias')
    .select('company, nome').eq('id', req.params.id).maybeSingle();
  if (!tipo) return res.status(404).json({ error: 'Tipo não encontrado' });
  if (me.access_level !== 'master' && tipo.company !== me.company) return res.status(403).json({ error: 'Acesso negado' });

  const updates = {};
  if (nome !== undefined) {
    if (!nome.trim()) return res.status(400).json({ error: 'Dê um nome ao tipo.' });
    updates.nome = nome.trim().slice(0, 40);
  }
  if (cor) updates.cor = cor;
  const { data, error } = await supabase.from('mural_categorias').update(updates)
    .eq('id', req.params.id).select('id, chave, nome, cor').single();
  if (error) return res.status(500).json({ error: 'Erro ao salvar o tipo.' });
  logAction({ company: tipo.company, user_id: requester_id, acao: 'editar_tipo_mural', tabela: 'mural_categorias', antes: { nome: tipo.nome }, depois: updates });
  res.json(data);
});

// DELETE /api/mural/categorias/:id?requester_id=
router.delete('/categorias/:id', async (req, res) => {
  const me = await getProfile(req.query.requester_id);
  if (!podeGerirTipos(me)) return res.status(403).json({ error: 'Só o administrador da empresa remove tipos.' });
  const { data: tipo } = await supabase.from('mural_categorias')
    .select('company, chave, nome').eq('id', req.params.id).maybeSingle();
  if (!tipo) return res.status(404).json({ error: 'Tipo não encontrado' });
  if (me.access_level !== 'master' && tipo.company !== me.company) return res.status(403).json({ error: 'Acesso negado' });

  // Card que perde o tipo ficaria sem rótulo no mural.
  const { count } = await supabase.from('mural').select('id', { count: 'exact', head: true })
    .eq('company', tipo.company).eq('category', tipo.chave);
  if (count) {
    return res.status(409).json({ error: `${count} card(s) usam "${tipo.nome}". Mude o tipo deles antes de remover.` });
  }
  const { error } = await supabase.from('mural_categorias').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: 'Erro ao remover o tipo.' });
  logAction({ company: tipo.company, user_id: req.query.requester_id, acao: 'excluir_tipo_mural', tabela: 'mural_categorias', antes: { nome: tipo.nome } });
  res.json({ ok: true });
});

// GET /api/mural?requester_id=&company=
router.get('/', async (req, res) => {
  const { requester_id, company: queryCompany } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  const targetCompany = me.access_level === 'master' ? queryCompany : me.company;
  if (me.access_level === 'master' && !targetCompany) return res.json([]);

  const { data, error } = await supabase
    .from('mural')
    .select('*, creator:created_by(full_name)')
    .eq('company', targetCompany)
    .order('sort_order')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  // Marca quais já foram visualizados por quem pediu a lista
  let lidos = [];
  if (data?.length) {
    const { data: l } = await supabase
      .from('mural_lidos')
      .select('mural_id')
      .eq('user_id', requester_id)
      .in('mural_id', data.map(m => m.id));
    lidos = (l || []).map(x => x.mural_id);
  }

  const ids = (data || []).map(m => m.id);
  const desde = avisarDesde(me.created_at);
  const vistos = await vistosDe(requester_id, 'mural', ids);
  const coment = await comentariosPorItem('mural_comentarios', 'mural_id', ids, vistos, requester_id, desde);
  res.json((data || []).map(m => ({
    ...m,
    // Recado anterior ao corte não volta a pedir leitura (ver ESTREIA).
    lido: lidos.includes(m.id) || antesDoCorte(m.created_at, desde),
    comentarios: coment[m.id]?.total || 0,
    comentarios_novos: coment[m.id]?.novos || 0,
  })));
});

// POST /api/mural
router.post('/', async (req, res) => {
  const { requester_id, title, content, category, company: bodyCompany } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  if (!title || !content) return res.status(400).json({ error: 'title e content obrigatórios' });
  const targetCompany = me.access_level === 'master' ? bodyCompany : me.company;
  if (category && !(await tipoValido(targetCompany, category)))
    return res.status(400).json({ error: 'Esse tipo não existe mais. Escolha outro.' });

  const { data, error } = await supabase.from('mural').insert({
    company: targetCompany,
    title: title.trim(),
    content: content.trim(),
    category: category || 'geral',
    created_by: requester_id,
  }).select('*, creator:created_by(full_name)').single();

  if (error) {
    logError({ company: targetCompany, user_id: requester_id, acao: 'criar_mural', tabela: 'mural', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({ company: targetCompany, user_id: requester_id, acao: 'criar_mural', tabela: 'mural', depois: { id: data.id, title: data.title } });

  // Avisa a loja do card novo. Sem isso, quem não abre a tela do mural por
  // conta própria nunca fica sabendo que algo foi publicado.
  usuariosDaLoja(targetCompany, requester_id).then(pessoas => {
    enviarPush(
      pessoas,
      `📌 Novo no mural: ${data.title}`,
      data.content.slice(0, 100),
      'mural',
      { company: targetCompany, rota: req.originalUrl },
    );
  }).catch(() => {});

  res.json(data);
});

// PUT /api/mural/:id
router.put('/:id', async (req, res) => {
  const { requester_id, title, content, category, sort_order } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const { data: existente } = await supabase.from('mural').select('created_by, company, category').eq('id', req.params.id).single();
  const isOwner = existente?.created_by === requester_id;
  if (!isOwner && !isManager(me))
    return res.status(403).json({ error: 'Acesso negado — só quem criou ou um gestor pode editar' });
  if (category !== undefined && category !== existente?.category && !(await tipoValido(existente?.company, category)))
    return res.status(400).json({ error: 'Esse tipo não existe mais. Escolha outro.' });

  const updates = { updated_at: new Date().toISOString() };
  if (title !== undefined)      updates.title      = title.trim();
  if (content !== undefined)    updates.content    = content.trim();
  if (category !== undefined)   updates.category   = category;
  if (sort_order !== undefined) updates.sort_order = sort_order;

  const { data, error } = await supabase.from('mural').update(updates).eq('id', req.params.id)
    .select('*, creator:created_by(full_name)').single();
  if (error) {
    logError({ company: me.company, user_id: requester_id, acao: 'editar_mural', tabela: 'mural', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({ company: me.company, user_id: requester_id, acao: 'editar_mural', tabela: 'mural', depois: updates });
  res.json(data);
});

// DELETE /api/mural/:id
router.delete('/:id', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  const { data: item } = await supabase.from('mural').select('title, created_by').eq('id', req.params.id).single();
  const isOwner = item?.created_by === requester_id;
  if (!isOwner && !isManager(me))
    return res.status(403).json({ error: 'Acesso negado — só quem criou ou um gestor pode excluir' });
  const { error } = await supabase.from('mural').delete().eq('id', req.params.id);
  if (error) {
    logError({ company: me.company, user_id: requester_id, acao: 'excluir_mural', tabela: 'mural', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({ company: me.company, user_id: requester_id, acao: 'excluir_mural', tabela: 'mural', antes: { title: item?.title } });
  res.json({ ok: true });
});

// POST /api/mural/:id/visto — abriu os comentários deste recado
router.post('/:id/visto', async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(401).json({ error: 'user_id obrigatório' });
  await marcarVisto(user_id, 'mural', req.params.id);
  res.json({ ok: true });
});

// POST /api/mural/:id/lido — marca como visualizado
router.post('/:id/lido', async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id obrigatório' });
  const { error } = await supabase.from('mural_lidos')
    .upsert({ mural_id: req.params.id, user_id }, { onConflict: 'mural_id,user_id' });
  if (error) {
    registrarLog('marcar_mural_lido', 'mural_lidos', 'erro', { user_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: error.message });
  }
  registrarLog('marcar_mural_lido', 'mural_lidos', 'sucesso', { user_id, depois: { mural_id: req.params.id } });
  res.json({ ok: true });
});

// ── Comentários do mural ─────────────────────────────────────────────
// Qualquer pessoa da empresa pode comentar; editar e apagar, só o autor
// (ou um gestor, para poder moderar conteúdo impróprio).

// GET /api/mural/:id/comentarios?requester_id=
router.get('/:id/comentarios', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const { data, error } = await supabase
    .from('mural_comentarios')
    .select('*, author:user_id(full_name, avatar_url)')
    .eq('mural_id', req.params.id)
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// POST /api/mural/:id/comentarios
router.post('/:id/comentarios', async (req, res) => {
  const { requester_id, text } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  if (!text?.trim()) return res.status(400).json({ error: 'text obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  // Só comenta em card da própria empresa
  const { data: card } = await supabase.from('mural').select('company, title, created_by').eq('id', req.params.id).single();
  if (!card) return res.status(404).json({ error: 'Card não encontrado' });
  if (me.access_level !== 'master' && card.company !== me.company) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  const { data, error } = await supabase.from('mural_comentarios')
    .insert({ mural_id: req.params.id, user_id: requester_id, text: text.trim() })
    .select('*, author:user_id(full_name, avatar_url)').single();
  if (error) {
    registrarLog('comentar_mural', 'mural_comentarios', 'erro', { company: card.company, user_id: requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: error.message });
  }
  registrarLog('comentar_mural', 'mural_comentarios', 'sucesso', { company: card.company, user_id: requester_id, depois: { card: card.title } });

  // Avisa só quem publicou o card, não a loja inteira — comentário
  // interessa a quem escreveu.
  if (card.created_by && card.created_by !== requester_id) {
    enviarPush(
      card.created_by,
      `💬 ${me.full_name || 'Alguém'} comentou no mural`,
      `${card.title}: ${text.trim().slice(0, 60)}`,
      'mural',
      { company: card.company, rota: req.originalUrl },
    );
  }

  res.json(data);
});

// PUT /api/mural/comentarios/:cid — só o autor edita
router.put('/comentarios/:cid', async (req, res) => {
  const { requester_id, text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'text obrigatório' });
  const { data: c } = await supabase.from('mural_comentarios').select('user_id').eq('id', req.params.cid).single();
  if (!c) return res.status(404).json({ error: 'Comentário não encontrado' });
  if (c.user_id !== requester_id) return res.status(403).json({ error: 'Só o autor pode editar' });

  const { data, error } = await supabase.from('mural_comentarios')
    .update({ text: text.trim(), updated_at: new Date().toISOString() })
    .eq('id', req.params.cid)
    .select('*, author:user_id(full_name, avatar_url)').single();
  if (error) {
    registrarLog('editar_comentario_mural', 'mural_comentarios', 'erro', { user_id: requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: error.message });
  }
  registrarLog('editar_comentario_mural', 'mural_comentarios', 'sucesso', { user_id: requester_id, depois: { id: req.params.cid } });
  res.json(data);
});

// DELETE /api/mural/comentarios/:cid — o autor ou um gestor (moderação)
router.delete('/comentarios/:cid', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  const { data: c } = await supabase.from('mural_comentarios').select('user_id').eq('id', req.params.cid).single();
  if (!c) return res.status(404).json({ error: 'Comentário não encontrado' });
  if (c.user_id !== requester_id && !isManager(me)) {
    return res.status(403).json({ error: 'Só o autor ou um gestor pode apagar' });
  }

  const { error } = await supabase.from('mural_comentarios').delete().eq('id', req.params.cid);
  if (error) {
    registrarLog('excluir_comentario_mural', 'mural_comentarios', 'erro', { company: me?.company, user_id: requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: error.message });
  }
  registrarLog('excluir_comentario_mural', 'mural_comentarios', 'sucesso', { company: me?.company, user_id: requester_id, antes: { id: req.params.cid } });
  res.json({ ok: true });
});

// GET /api/mural/:id/leituras — quem visualizou e quem não (admin/supervisor/master)
router.get('/:id/leituras', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me || !isManager(me)) return res.status(403).json({ error: 'Acesso negado' });

  const { data: item } = await supabase.from('mural').select('company').eq('id', req.params.id).single();
  if (!item) return res.status(404).json({ error: 'Card não encontrado' });

  const targetCompany = me.access_level === 'master' ? item.company : me.company;

  const { data: todos } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, role')
    .eq('company', targetCompany)
    .eq('active', true)
    .order('full_name');

  const { data: lidos } = await supabase
    .from('mural_lidos')
    .select('user_id, read_at')
    .eq('mural_id', req.params.id);

  const lidosMap = {};
  (lidos || []).forEach(l => { lidosMap[l.user_id] = l.read_at; });

  const leram    = (todos || []).filter(u => lidosMap[u.id]).map(u => ({ ...u, read_at: lidosMap[u.id] }));
  const nao_leram = (todos || []).filter(u => !lidosMap[u.id]);

  res.json({ leram, nao_leram });
});

module.exports = router;
