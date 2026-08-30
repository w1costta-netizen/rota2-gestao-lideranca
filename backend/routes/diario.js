const express  = require('express');
const router   = express.Router();
const supabase = require('../supabase');
const { registrarLog } = require('../lib/auditLog');

// ─────────────────────────────────────────────────────────────
// Diário de Bordo — o que aconteceu na loja, dia a dia.
//
// É da LOJA: todo mundo lê e escreve. Diferente de Listas e Anotações, que
// são pessoais. O que separa cada loja é o `company`, igual ao resto do app.
//
// Editar e apagar: só o autor, ou um gestor (para moderar). Mesma regra já
// usada nos comentários do mural e dos comunicados.
// ─────────────────────────────────────────────────────────────

// As categorias existem para a análise depois funcionar. Texto solto não
// responde "quantos dias tiveram ocorrência de segurança?"; categoria sim.
const CATEGORIAS = ['resultado', 'operacao', 'clima', 'seguranca', 'equipe', 'cliente', 'outro'];
const categoriaValida = c => (CATEGORIAS.includes(c) ? c : 'outro');

const ehGestor = p => p && ['admin', 'supervisor', 'master'].includes(p.access_level);

async function getPerfil(id) {
  const { data } = await supabase
    .from('profiles').select('id, company, full_name, access_level').eq('id', id).maybeSingle();
  return data || null;
}

// GET /api/diario?requester_id=&data=&de=&ate=&categoria=&company=
//
// Dois modos: um dia (`data`) ou um período (`de` + `ate`). O período é o
// que serve para análise — sem ele, comparar meses viraria abrir dia a dia.
router.get('/', async (req, res) => {
  const { requester_id, data, de, ate, categoria, company: queryCompany } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });

  const me = await getPerfil(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const alvo = me.access_level === 'master' ? (queryCompany || me.company) : me.company;
  if (!alvo) return res.json([]);

  let consulta = supabase
    .from('diario_bordo')
    .select('*, autor:user_id(full_name, avatar_url)')
    .eq('company', alvo);

  if (data)            consulta = consulta.eq('data', data);
  else {
    if (de)  consulta = consulta.gte('data', de);
    if (ate) consulta = consulta.lte('data', ate);
  }
  if (categoria) consulta = consulta.eq('categoria', categoria);

  const { data: linhas, error } = await consulta
    .order('data', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    registrarLog('listar_diario', 'diario_bordo', 'erro', { company: alvo, user_id: requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: 'Erro ao carregar o diário.' });
  }
  res.json(linhas || []);
});

// POST /api/diario  { requester_id, data, hora, categoria, texto }
router.post('/', async (req, res) => {
  const { requester_id, data, hora, categoria, texto } = req.body || {};
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  if (!texto?.trim()) return res.status(400).json({ error: 'Escreva o relato.' });

  const me = await getPerfil(requester_id);
  if (!me?.company) return res.status(403).json({ error: 'Usuário sem loja definida' });

  const { data: novo, error } = await supabase.from('diario_bordo').insert({
    company:   me.company,
    user_id:   requester_id,
    data:      data || new Date().toISOString().split('T')[0],
    hora:      hora || null,
    categoria: categoriaValida(categoria),
    texto:     texto.trim(),
  }).select('*, autor:user_id(full_name, avatar_url)').single();

  if (error) {
    registrarLog('criar_relato_diario', 'diario_bordo', 'erro', { company: me.company, user_id: requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: 'Erro ao salvar o relato.' });
  }
  registrarLog('criar_relato_diario', 'diario_bordo', 'sucesso', {
    company: me.company, user_id: requester_id,
    depois: { id: novo.id, data: novo.data, categoria: novo.categoria },
  });
  res.json(novo);
});

// PUT /api/diario/:id — só o autor ou um gestor
router.put('/:id', async (req, res) => {
  const { requester_id, data, hora, categoria, texto } = req.body || {};
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });

  const me = await getPerfil(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const { data: atual } = await supabase
    .from('diario_bordo').select('user_id, company').eq('id', req.params.id).maybeSingle();
  if (!atual) return res.status(404).json({ error: 'Relato não encontrado' });
  if (me.access_level !== 'master' && atual.company !== me.company) {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  if (atual.user_id !== requester_id && !ehGestor(me)) {
    return res.status(403).json({ error: 'Só quem escreveu ou um gestor pode editar' });
  }

  const mudancas = { updated_at: new Date().toISOString() };
  if (data      !== undefined) mudancas.data      = data;
  if (hora      !== undefined) mudancas.hora      = hora || null;
  if (categoria !== undefined) mudancas.categoria = categoriaValida(categoria);
  if (texto     !== undefined) mudancas.texto     = texto.trim();

  const { data: novo, error } = await supabase
    .from('diario_bordo').update(mudancas).eq('id', req.params.id)
    .select('*, autor:user_id(full_name, avatar_url)').single();

  if (error) {
    registrarLog('editar_relato_diario', 'diario_bordo', 'erro', { company: atual.company, user_id: requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: 'Erro ao salvar o relato.' });
  }
  registrarLog('editar_relato_diario', 'diario_bordo', 'sucesso', { company: atual.company, user_id: requester_id, depois: { id: req.params.id } });
  res.json(novo);
});

// DELETE /api/diario/:id?requester_id= — só o autor ou um gestor
router.delete('/:id', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });

  const me = await getPerfil(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const { data: atual } = await supabase
    .from('diario_bordo').select('user_id, company, texto').eq('id', req.params.id).maybeSingle();
  if (!atual) return res.status(404).json({ error: 'Relato não encontrado' });
  if (me.access_level !== 'master' && atual.company !== me.company) {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  if (atual.user_id !== requester_id && !ehGestor(me)) {
    return res.status(403).json({ error: 'Só quem escreveu ou um gestor pode excluir' });
  }

  const { error } = await supabase.from('diario_bordo').delete().eq('id', req.params.id);
  if (error) {
    registrarLog('excluir_relato_diario', 'diario_bordo', 'erro', { company: atual.company, user_id: requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: 'Erro ao excluir o relato.' });
  }
  registrarLog('excluir_relato_diario', 'diario_bordo', 'sucesso', {
    company: atual.company, user_id: requester_id,
    antes: { id: req.params.id, trecho: (atual.texto || '').slice(0, 80) },
  });
  res.json({ ok: true });
});

module.exports = router;
