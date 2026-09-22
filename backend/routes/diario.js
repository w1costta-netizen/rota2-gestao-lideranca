const express  = require('express');
const router   = express.Router();
const supabase = require('../supabase');
const { registrarLog } = require('../lib/auditLog');
const { enviarPush } = require('../lib/notificacoes');
const { vistosDe, marcarVisto, comentariosPorItem, avisarDesde, antesDoCorte } = require('../lib/leituras');

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
//
// Estas 7 ficam no código: toda loja nova já nasce com elas, sem carga
// inicial, e nenhuma pode ser apagada — são a base que garante que a
// análise funcione em qualquer loja.
const CATEGORIAS_BASE = ['resultado', 'operacao', 'clima', 'seguranca', 'equipe', 'cliente', 'outro'];

// Vira identificador sem acento nem espaço. É o que fica gravado no relato,
// então "Quebra de Energia" e "quebra de energia" caem na mesma categoria em
// vez de virarem duas — que é exatamente o problema a evitar.
function paraChave(nome) {
  return String(nome || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

async function chavesDaLoja(company) {
  const { data } = await supabase
    .from('diario_categorias').select('chave').eq('company', company);
  return [...CATEGORIAS_BASE, ...(data || []).map(c => c.chave)];
}

const ehGestor = p => p && ['admin', 'supervisor', 'master'].includes(p.access_level);

// Cadastro desativado não fala com o servidor.
//
// Desativar precisa cortar o acesso de verdade: sem isto, quem foi
// desligado continuava lendo comunicados, tarefas e conversas da loja,
// enquanto o gestor acreditava que já tinha resolvido. É essa crença que
// tornava a falha perigosa.
async function getPerfil(id) {
  const { data } = await supabase
    .from('profiles').select('id, company, full_name, access_level, active, created_at').eq('id', id).maybeSingle();
  if (!data || data.active === false) return null;
  return data;
}

// GET /api/diario/categorias?requester_id= — as que esta loja acrescentou
router.get('/categorias', async (req, res) => {
  const me = await getPerfil(req.query.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  if (!me.company) return res.json([]);

  const { data, error } = await supabase
    .from('diario_categorias').select('id, chave, nome, cor')
    .eq('company', me.company).order('nome');
  if (error) return res.status(500).json({ error: 'Erro ao carregar as categorias.' });
  res.json(data || []);
});

// POST /api/diario/categorias  { requester_id, nome, cor }
router.post('/categorias', async (req, res) => {
  const { requester_id, nome, cor } = req.body || {};
  const me = await getPerfil(requester_id);
  if (!me?.company) return res.status(403).json({ error: 'Usuário sem loja definida' });
  if (!nome?.trim()) return res.status(400).json({ error: 'Dê um nome à categoria.' });

  const chave = paraChave(nome);
  if (!chave) return res.status(400).json({ error: 'Use letras ou números no nome.' });
  if (CATEGORIAS_BASE.includes(chave)) {
    return res.status(400).json({ error: 'Essa categoria já existe.' });
  }

  const { data, error } = await supabase.from('diario_categorias')
    .insert({ company: me.company, chave, nome: nome.trim().slice(0, 40), cor: cor || '#6b7280', created_by: requester_id })
    .select('id, chave, nome, cor').single();

  if (error) {
    // Chave repetida na mesma loja é o caso mais provável, e não é erro do
    // sistema: alguém já criou essa categoria antes.
    const jaExiste = String(error.message || '').includes('duplicate') || error.code === '23505';
    if (jaExiste) return res.status(409).json({ error: 'Essa categoria já existe nesta loja.' });
    registrarLog('criar_categoria_diario', 'diario_categorias', 'erro', { company: me.company, user_id: requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: 'Erro ao criar a categoria.' });
  }
  registrarLog('criar_categoria_diario', 'diario_categorias', 'sucesso', { company: me.company, user_id: requester_id, depois: { nome: data.nome } });
  res.json(data);
});

// DELETE /api/diario/categorias/:id?requester_id=
router.delete('/categorias/:id', async (req, res) => {
  const me = await getPerfil(req.query.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  if (!ehGestor(me)) return res.status(403).json({ error: 'Só um gestor pode remover categoria' });

  const { data: cat } = await supabase
    .from('diario_categorias').select('company, chave, nome').eq('id', req.params.id).maybeSingle();
  if (!cat) return res.status(404).json({ error: 'Categoria não encontrada' });
  if (me.access_level !== 'master' && cat.company !== me.company) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  // Remover categoria em uso deixaria relatos antigos sem rótulo — e o
  // histórico é justamente o que este módulo existe para preservar.
  const { count } = await supabase
    .from('diario_bordo').select('id', { count: 'exact', head: true })
    .eq('company', cat.company).eq('categoria', cat.chave);
  if (count) {
    return res.status(409).json({
      error: `${count} relato(s) usam "${cat.nome}". Só dá para remover categoria que ninguém usou.`,
    });
  }

  const { error } = await supabase.from('diario_categorias').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: 'Erro ao remover a categoria.' });
  registrarLog('excluir_categoria_diario', 'diario_categorias', 'sucesso', { company: cat.company, user_id: req.query.requester_id, antes: { nome: cat.nome } });
  res.json({ ok: true });
});

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
  // Quem já viu o quê, e quantos comentários novos tem em cada relato.
  // Sem isso o Diário era a única tela onde a pessoa não sabia o que chegou
  // depois da última visita dela.
  const ids = (linhas || []).map(l => l.id);
  const desde = avisarDesde(me.created_at);
  const vistos = await vistosDe(requester_id, 'diario', ids);
  const coment = await comentariosPorItem('diario_comentarios', 'diario_id', ids, vistos, requester_id, desde);
  res.json((linhas || []).map(l => ({
    ...l,
    // Relato meu, já visto, ou anterior ao corte: nasce lido.
    lido: !!vistos[l.id] || l.user_id === requester_id || antesDoCorte(l.created_at, desde),
    comentarios: coment[l.id]?.total || 0,
    comentarios_novos: coment[l.id]?.novos || 0,
  })));
});

// POST /api/diario/:id/visto — a pessoa abriu este relato (ou os comentários)
router.post('/:id/visto', async (req, res) => {
  const me = await getPerfil(req.body.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  await marcarVisto(me.id, 'diario', req.params.id);
  res.json({ ok: true });
});

// GET /api/diario/pendencias?requester_id= — quanto há de novo para mim
//
// Só os números, para o painel inicial não precisar baixar o diário inteiro.
// Olha os últimos 30 dias: relato de dois meses atrás não é "novidade".
router.get('/pendencias', async (req, res) => {
  const me = await getPerfil(req.query.requester_id);
  if (!me) return res.json({ relatos: 0, comentarios: 0 });
  const alvo = me.company;
  if (!alvo) return res.json({ relatos: 0, comentarios: 0 });

  const desde = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const { data: linhas } = await supabase
    .from('diario_bordo').select('id, user_id, created_at').eq('company', alvo).gte('data', desde);

  const corte = avisarDesde(me.created_at);
  const ids = (linhas || []).map(l => l.id);
  const vistos = await vistosDe(me.id, 'diario', ids);
  const coment = await comentariosPorItem('diario_comentarios', 'diario_id', ids, vistos, me.id, corte);
  res.json({
    relatos: (linhas || []).filter(l => !vistos[l.id] && l.user_id !== me.id && !antesDoCorte(l.created_at, corte)).length,
    comentarios: Object.values(coment).reduce((s, c) => s + c.novos, 0),
  });
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
    categoria: (await chavesDaLoja(me.company)).includes(categoria) ? categoria : 'outro',
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
  if (categoria !== undefined) mudancas.categoria = (await chavesDaLoja(atual.company)).includes(categoria) ? categoria : 'outro';
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

// ── Comentários do relato ─────────────────────────────────────
// Mesmo formato do mural e dos comunicados, para o componente <Comentarios>
// servir sem mudança. Todo mundo da loja comenta; editar só o autor; apagar
// o autor ou um gestor. Reações ficam na tabela genérica `reacoes` com
// tipo = 'diario', pela rota /api/reacoes que já existe.

// GET /api/diario/:id/comentarios?requester_id=
router.get('/:id/comentarios', async (req, res) => {
  const me = await getPerfil(req.query.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  // Comentário é da loja: quem não é dela não lê.
  const { data: relato } = await supabase
    .from('diario_bordo').select('company').eq('id', req.params.id).maybeSingle();
  if (!relato) return res.status(404).json({ error: 'Relato não encontrado' });
  if (me.access_level !== 'master' && relato.company !== me.company) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  const { data, error } = await supabase
    .from('diario_comentarios')
    .select('*, author:user_id(full_name, avatar_url)')
    .eq('diario_id', req.params.id)
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: 'Erro ao carregar os comentários.' });
  res.json(data || []);
});

// POST /api/diario/:id/comentarios  { requester_id, text }
router.post('/:id/comentarios', async (req, res) => {
  const { requester_id, text } = req.body || {};
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  if (!text?.trim()) return res.status(400).json({ error: 'Escreva o comentário.' });
  const me = await getPerfil(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const { data: relato } = await supabase
    .from('diario_bordo').select('company, user_id, texto').eq('id', req.params.id).maybeSingle();
  if (!relato) return res.status(404).json({ error: 'Relato não encontrado' });
  if (me.access_level !== 'master' && relato.company !== me.company) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  const { data, error } = await supabase.from('diario_comentarios')
    .insert({ diario_id: req.params.id, user_id: requester_id, text: text.trim().slice(0, 2000) })
    .select('*, author:user_id(full_name, avatar_url)').single();
  if (error) {
    registrarLog('comentar_diario', 'diario_comentarios', 'erro', { company: relato.company, user_id: requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: 'Erro ao salvar o comentário.' });
  }
  registrarLog('comentar_diario', 'diario_comentarios', 'sucesso', { company: relato.company, user_id: requester_id, depois: { relato: req.params.id } });

  // Avisa só quem escreveu o relato — é a quem o comentário interessa.
  if (relato.user_id && relato.user_id !== requester_id) {
    enviarPush(
      relato.user_id,
      `💬 ${me.full_name || 'Alguém'} comentou no seu relato`,
      `${(relato.texto || '').slice(0, 40)}… ${text.trim().slice(0, 60)}`,
      'diario',
      { company: relato.company, rota: req.originalUrl },
    );
  }
  res.json(data);
});

// PUT /api/diario/comentarios/:cid — só o autor edita
router.put('/comentarios/:cid', async (req, res) => {
  const { requester_id, text } = req.body || {};
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  if (!text?.trim()) return res.status(400).json({ error: 'Escreva o comentário.' });

  const { data: c } = await supabase.from('diario_comentarios').select('user_id').eq('id', req.params.cid).maybeSingle();
  if (!c) return res.status(404).json({ error: 'Comentário não encontrado' });
  if (c.user_id !== requester_id) return res.status(403).json({ error: 'Só o autor pode editar' });

  const { data, error } = await supabase.from('diario_comentarios')
    .update({ text: text.trim().slice(0, 2000), updated_at: new Date().toISOString() })
    .eq('id', req.params.cid)
    .select('*, author:user_id(full_name, avatar_url)').single();
  if (error) {
    registrarLog('editar_comentario_diario', 'diario_comentarios', 'erro', { user_id: requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: 'Erro ao salvar o comentário.' });
  }
  registrarLog('editar_comentario_diario', 'diario_comentarios', 'sucesso', { user_id: requester_id, depois: { id: req.params.cid } });
  res.json(data);
});

// DELETE /api/diario/comentarios/:cid?requester_id= — o autor ou um gestor
router.delete('/comentarios/:cid', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getPerfil(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const { data: c } = await supabase
    .from('diario_comentarios').select('user_id, relato:diario_id(company)').eq('id', req.params.cid).maybeSingle();
  if (!c) return res.status(404).json({ error: 'Comentário não encontrado' });
  if (me.access_level !== 'master' && c.relato?.company !== me.company) {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  if (c.user_id !== requester_id && !ehGestor(me)) {
    return res.status(403).json({ error: 'Só o autor ou um gestor pode apagar' });
  }

  const { error } = await supabase.from('diario_comentarios').delete().eq('id', req.params.cid);
  if (error) {
    registrarLog('excluir_comentario_diario', 'diario_comentarios', 'erro', { company: me.company, user_id: requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: 'Erro ao apagar o comentário.' });
  }
  registrarLog('excluir_comentario_diario', 'diario_comentarios', 'sucesso', { company: me.company, user_id: requester_id, antes: { id: req.params.cid } });
  res.json({ ok: true });
});

module.exports = router;
