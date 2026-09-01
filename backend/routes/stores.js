const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');
const { enviarPush } = require('../lib/notificacoes');
const { logAction, logError, registrarLog } = require('../lib/auditLog');

async function requireMaster(req, res) {
  const id = req.body?.requester_id || req.query?.requester_id;
  if (!id) { res.status(401).json({ error: 'requester_id obrigatório' }); return null; }
  const { data } = await supabase.from('profiles').select('access_level').eq('id', id).single();
  if (!data || data.access_level !== 'master') { res.status(403).json({ error: 'Acesso negado' }); return null; }
  return data;
}

// Quem manda na tela de Lojas: o master (dono do sistema) e o dono de grupo
// (o cliente que contratou para uma rede e administra as lojas DELE).
//
// O grupo é a unica coisa que separa os dois. Master tem `grupo` nulo e vê
// tudo; dono de grupo só enxerga as lojas marcadas com o mesmo grupo dele.
// Toda consulta desta tela passa por aqui — é o ponto único onde esse
// alcance é decidido, para não existir uma rota que esqueça o filtro.
async function requireDonoDeLojas(req, res) {
  const id = req.body?.requester_id || req.query?.requester_id;
  if (!id) { res.status(401).json({ error: 'requester_id obrigatório' }); return null; }
  const { data } = await supabase
    .from('profiles').select('id, access_level, company, grupo').eq('id', id).maybeSingle();
  if (!data) { res.status(403).json({ error: 'Acesso negado' }); return null; }

  const ehMaster = data.access_level === 'master';
  const ehDonoDeGrupo = !!data.grupo && ['admin', 'master'].includes(data.access_level);
  if (!ehMaster && !ehDonoDeGrupo) { res.status(403).json({ error: 'Acesso negado' }); return null; }

  return { ...data, ehMaster, ehDonoDeGrupo: ehDonoDeGrupo && !ehMaster };
}

// GET /api/stores — as lojas que a pessoa pode administrar
//
// Master: todas. Dono de grupo: só as do grupo dele. É a consulta que
// sustenta a separação entre clientes — uma rede não pode nem suspeitar de
// quais outras lojas existem no sistema.
router.get('/', async (req, res) => {
  const me = await requireDonoDeLojas(req, res);
  if (!me) return;

  let consulta = supabase
    .from('stores')
    .select('*')
    .order('created_at', { ascending: false });

  if (me.ehDonoDeGrupo) consulta = consulta.eq('grupo', me.grupo);

  const { data: stores, error } = await consulta;
  if (error) return res.status(500).json({ error: error.message });

  // Enriquecer com contagem de usuários por loja
  const { data: profiles } = await supabase
    .from('profiles')
    .select('company, active');

  const counts = {};
  (profiles || []).forEach(p => {
    if (!counts[p.company]) counts[p.company] = { total: 0, active: 0 };
    counts[p.company].total++;
    if (p.active) counts[p.company].active++;
  });

  const result = (stores || []).map(s => ({
    ...s,
    user_count:  counts[s.name]?.total  || 0,
    active_count: counts[s.name]?.active || 0,
  }));

  res.json(result);
});

// POST /api/stores/master — cria loja pela tela de Lojas
//
// Master cria já ativa: é o dono do sistema, não precisa da autorização de
// ninguém. Dono de grupo cria PENDENTE, e a loja cai na fila de aprovação
// do master — cada loja nova de uma rede é uma negociação comercial, e
// liberar sozinho seria assinar uma vez e usar em dez lojas.
router.post('/master', async (req, res) => {
  const me = await requireDonoDeLojas(req, res);
  if (!me) return;
  const { name, city } = req.body;
  if (!name) return res.status(400).json({ error: 'name obrigatório' });

  const { data, error } = await supabase.from('stores').insert({
    name,
    city: city || null,
    active: me.ehMaster,
    grupo: me.ehDonoDeGrupo ? me.grupo : (req.body.grupo || null),
    created_by: req.body.requester_id,
    approved_by: me.ehMaster ? req.body.requester_id : null,
  }).select().single();
  if (error) {
    registrarLog('criar_loja', 'stores', 'erro', { company: name, user_id: req.body.requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: error.message });
  }
  registrarLog('criar_loja', 'stores', 'sucesso', {
    company: data.name, user_id: req.body.requester_id,
    depois: { id: data.id, name: data.name, city: data.city, grupo: data.grupo, ativa: data.active },
  });

  // Pedido de loja de uma rede é venda: o master precisa saber na hora, não
  // quando abrir a tela por acaso.
  if (me.ehDonoDeGrupo) {
    const { data: masters } = await supabase
      .from('profiles').select('id').eq('access_level', 'master').eq('active', true);
    const ids = (masters || []).map(m => m.id);
    if (ids.length) {
      enviarPush(ids, '🏪 Pedido de loja nova',
        `${data.name} — grupo ${data.grupo}. Aguardando sua aprovação.`,
        'loja', { company: data.grupo, rota: req.originalUrl });
    }
  }

  res.json(data);
});

// POST /api/stores — gerente cria pedido de loja
router.post('/', async (req, res) => {
  const { requester_id, name, city } = req.body;
  if (!requester_id || !name) return res.status(400).json({ error: 'requester_id e name obrigatórios' });

  const { data: me } = await supabase.from('profiles').select('access_level, company').eq('id', requester_id).single();
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  // Cria a loja como pendente
  const { data, error } = await supabase.from('stores').insert({
    name, city: city || null, active: false, created_by: requester_id
  }).select().single();
  if (error) {
    registrarLog('solicitar_loja', 'stores', 'erro', { company: name, user_id: requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: error.message });
  }

  // Atualiza o company do gerente para o nome da loja
  await supabase.from('profiles').update({ company: name }).eq('id', requester_id);

  registrarLog('solicitar_loja', 'stores', 'sucesso', { company: data.name, user_id: requester_id, depois: { id: data.id, name: data.name, city: data.city } });
  res.json(data);
});

// PUT /api/stores/:id/approve — master aprova loja
router.put('/:id/approve', async (req, res) => {
  const me = await requireMaster(req, res);
  if (!me) return;

  const { data, error } = await supabase
    .from('stores')
    .update({ active: true, approved_by: req.body.requester_id })
    .eq('id', req.params.id)
    .select().single();
  if (error) {
    logError({ user_id: req.body.requester_id, acao: 'aprovar_loja', tabela: 'stores', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({ company: data.name, user_id: req.body.requester_id, acao: 'aprovar_loja', tabela: 'stores', depois: { id: data.id, name: data.name } });

  // Ativa o gerente que criou a loja como admin dela
  if (data.created_by) {
    await supabase.from('profiles').update({ active: true, access_level: 'admin' }).eq('id', data.created_by);
    // Avisa que o acesso foi liberado — sem isso ele fica tentando entrar
    // até funcionar, sem saber se foi aprovado. É a primeira notificação
    // que um cliente novo recebe, então vale ela chegar.
    enviarPush(
      data.created_by,
      '✅ Sua loja foi aprovada!',
      `${data.name} está liberada. Já pode usar o Rota Líder.`,
      'loja',
      { company: data.name, rota: req.originalUrl },
    );
  }

  res.json(data);
});

// PUT /api/stores/:id/disable — master desativa loja
router.put('/:id/disable', async (req, res) => {
  const me = await requireMaster(req, res);
  if (!me) return;

  const { data, error } = await supabase
    .from('stores')
    .update({ active: false })
    .eq('id', req.params.id)
    .select().single();
  if (error) {
    logError({ user_id: req.body.requester_id, acao: 'desativar_loja', tabela: 'stores', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({ company: data.name, user_id: req.body.requester_id, acao: 'desativar_loja', tabela: 'stores', antes: { id: data.id, name: data.name } });
  res.json(data);
});

// DELETE /api/stores/:id — master apaga a loja de vez
//
// Existe porque recusar um pedido não tinha como sair da tela: o botão
// "Recusar" marcava a loja como inativa, e loja inativa era exatamente o
// que a fila de aprovação mostrava. O pedido recusado voltava para a fila
// para sempre.
//
// Só apaga loja inativa. Apagar uma loja em uso deixaria os usuários dela
// órfãos, sem loja e sem aviso — para isso existe o desativar, que é
// reversível.
router.delete('/:id', async (req, res) => {
  const me = await requireMaster(req, res);
  if (!me) return;
  // O apagar vem por query (DELETE não carrega corpo em toda biblioteca).
  const quem = req.body?.requester_id || req.query?.requester_id;

  const { data: loja } = await supabase
    .from('stores').select('id, name, active').eq('id', req.params.id).maybeSingle();
  if (!loja) return res.status(404).json({ error: 'Loja não encontrada' });
  if (loja.active) {
    return res.status(400).json({ error: 'Desative a loja antes de apagá-la.' });
  }

  // Quantas pessoas ficam sem loja. Não impede: um pedido recusado costuma
  // ter o próprio solicitante ligado a ele. Mas vai para o log, porque
  // depois ninguém lembra quantos eram.
  const { count: usuarios } = await supabase
    .from('profiles').select('id', { count: 'exact', head: true }).eq('company', loja.name);

  const { error } = await supabase.from('stores').delete().eq('id', req.params.id);
  if (error) {
    logError({ company: loja.name, user_id: quem, acao: 'apagar_loja', tabela: 'stores', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }

  logAction({
    company: loja.name, user_id: quem, acao: 'apagar_loja', tabela: 'stores',
    antes: { id: loja.id, name: loja.name, usuarios_vinculados: usuarios || 0 },
  });
  res.json({ ok: true, usuarios_vinculados: usuarios || 0 });
});

// GET /api/stores/my — verifica se o usuário tem loja cadastrada
router.get('/my', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });

  const { data: profile } = await supabase.from('profiles').select('company').eq('id', requester_id).single();
  if (!profile?.company) return res.json(null);

  const { data } = await supabase.from('stores').select('*').eq('name', profile.company).maybeSingle();
  res.json(data || null);
});

// PUT /api/stores/:id/modulos — master ativa/desativa módulos premium da loja
router.put('/:id/modulos', async (req, res) => {
  const me = await requireMaster(req, res);
  if (!me) return;

  const { modulos_premium } = req.body;
  if (!Array.isArray(modulos_premium)) return res.status(400).json({ error: 'modulos_premium deve ser um array' });

  const { data: antes } = await supabase.from('stores').select('name, modulos_premium').eq('id', req.params.id).single();

  const { data, error } = await supabase
    .from('stores')
    .update({ modulos_premium })
    .eq('id', req.params.id)
    .select().single();
  if (error) {
    logError({ company: antes?.name, user_id: req.body.requester_id, acao: 'editar_modulos_premium', tabela: 'stores', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({
    company: data.name, user_id: req.body.requester_id,
    acao: 'editar_modulos_premium', tabela: 'stores',
    antes: { modulos_premium: antes?.modulos_premium },
    depois: { modulos_premium: data.modulos_premium },
  });
  res.json(data);
});

// GET /api/stores/users?company= — quem administra vê os usuários de uma loja
router.get('/users', async (req, res) => {
  const me = await requireDonoDeLojas(req, res);
  if (!me) return;
  const { company } = req.query;
  if (!company) return res.status(400).json({ error: 'company obrigatório' });

  // Dono de grupo só lê a equipe das lojas DELE. Sem esta conferência,
  // bastaria digitar o nome da loja de outro cliente na barra de endereço
  // para ver a equipe inteira dela — a lista da tela estaria filtrada, mas
  // a porta continuaria destrancada.
  if (me.ehDonoDeGrupo) {
    const { data: loja } = await supabase
      .from('stores').select('grupo').eq('name', company).maybeSingle();
    if (!loja || loja.grupo !== me.grupo) {
      return res.status(403).json({ error: 'Esta loja não é do seu grupo' });
    }
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, sector, access_level, active, created_at')
    .eq('company', company)
    .order('full_name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
