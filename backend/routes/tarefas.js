const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');
const { enviarPush } = require('../lib/notificacoes');
const { logAction, logError, registrarLog } = require('../lib/auditLog');
const { vistosDe, marcarVisto, comentariosPorItem, avisarDesde } = require('../lib/leituras');

async function getProfile(id) {
  const { data } = await supabase.from('profiles').select('access_level, company, full_name, created_at').eq('id', id).single();
  return data;
}
const isManager = p => p && ['admin','supervisor','master'].includes(p.access_level);

function nextDueDate(due_date, recorrencia) {
  if (!due_date || !recorrencia || recorrencia === 'nenhuma') return null;
  const d = new Date(due_date + 'T12:00:00');
  if (recorrencia === 'diaria')     d.setDate(d.getDate() + 1);
  if (recorrencia === 'semanal')    d.setDate(d.getDate() + 7);
  if (recorrencia === 'quinzenal')  d.setDate(d.getDate() + 15);
  if (recorrencia === 'mensal')     d.setMonth(d.getMonth() + 1);
  return d.toISOString().split('T')[0];
}

// GET /api/tarefas
router.get('/', async (req, res) => {
  const { requester_id, company: queryCompany } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  // requester_id entra cru numa string de filtro do PostgREST (.or) mais abaixo —
  // validamos o formato UUID antes pra não abrir brecha de injeção de filtro.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requester_id)) {
    return res.status(400).json({ error: 'requester_id inválido' });
  }

  // Tudo dentro de um try/catch: sem isso, qualquer erro inesperado aqui
  // (dado corrompido, falha de rede pontual etc.) deixava a requisição sem
  // resposta nenhuma — o navegador ficava "carregando" pra sempre, e como
  // nada era logado, não sobrava nenhum rastro pra investigar depois.
  try {
    const me = await getProfile(requester_id);
    if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

    const targetCompany = me.access_level === 'master' ? queryCompany : me.company;
    if (me.access_level === 'master' && !targetCompany) return res.json([]);

    // Privacidade: cada pessoa só vê tarefas que ela mesma criou/delegou
    // (created_by) ou que estão atribuídas a ela (assigned_to) — mesmo
    // admin/master não veem tarefas pessoais que outra pessoa criou só
    // para si mesma. Vale igual pra todo mundo, sem exceção por cargo.
    const { data, error } = await supabase
      .from('tarefas')
      .select('*, assigned:assigned_to(id,full_name,sector,avatar_url), creator:created_by(full_name,avatar_url)')
      .eq('company', targetCompany)
      .or(`assigned_to.eq.${requester_id},created_by.eq.${requester_id}`)
      .order('created_at', { ascending: false });
    if (error) throw error;

    // Duas informações que a lista precisa dar sem a pessoa abrir nada:
    // quantas atualizações novas tem, e se existe pedido de novo prazo
    // esperando resposta.
    const ids = (data || []).map(t => t.id);
    const desde = avisarDesde(me.created_at);
    const [vistos, prazos] = await Promise.all([
      vistosDe(requester_id, 'tarefa', ids),
      ids.length
        ? supabase.from('tarefa_prazos')
            .select('*, solicitante:pedido_por(full_name)')
            .in('tarefa_id', ids).eq('situacao', 'pendente')
            .then(r => r.data || []).catch(() => [])
        : [],
    ]);
    const coment = await comentariosPorItem('tarefa_comentarios', 'tarefa_id', ids, vistos, requester_id, desde);
    const pendentePorTarefa = Object.fromEntries(prazos.map(p => [p.tarefa_id, p]));
    // Quantas vezes o prazo já foi adiado: quem aprova precisa enxergar o
    // padrão, mesmo sem nada bloquear.
    const { data: aceitos } = ids.length
      ? await supabase.from('tarefa_prazos').select('tarefa_id').in('tarefa_id', ids).eq('situacao', 'aceito')
      : { data: [] };
    const adiamentos = {};
    for (const a of aceitos || []) adiamentos[a.tarefa_id] = (adiamentos[a.tarefa_id] || 0) + 1;

    res.json((data || []).map(t => ({
      ...t,
      comentarios: coment[t.id]?.total || 0,
      comentarios_novos: coment[t.id]?.novos || 0,
      prazo_pendente: pendentePorTarefa[t.id] || null,
      adiamentos: adiamentos[t.id] || 0,
    })));
  } catch (e) {
    logError({ company: queryCompany || null, user_id: requester_id, acao: 'listar_tarefas', tabela: 'tarefas', rota: req.originalUrl, erro_mensagem: e.message });
    res.status(500).json({ error: 'Erro ao carregar tarefas.' });
  }
});

// POST /api/tarefas
router.post('/', async (req, res) => {
  const { requester_id, title, description, assigned_to, due_date, due_time, priority, company: bodyCompany, recorrencia, tags, lembrete_minutos } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  if (!isManager(me) && assigned_to && assigned_to !== requester_id)
    return res.status(403).json({ error: 'Você só pode criar tarefas para você mesmo' });
  if (!title) return res.status(400).json({ error: 'title obrigatório' });

  const finalAssignee = assigned_to || requester_id;
  const targetCompany = me.access_level === 'master' ? bodyCompany : me.company;

  const { data, error } = await supabase.from('tarefas').insert({
    company:          targetCompany,
    title:            title.trim(),
    description:      description?.trim() || '',
    assigned_to:      finalAssignee,
    created_by:       requester_id,
    due_date:         due_date || null,
    due_time:         due_time || null,
    priority:         priority || 'normal',
    recorrencia:      recorrencia || 'nenhuma',
    tags:             tags || [],
    lembrete_minutos: lembrete_minutos ?? null,
    lembrete_enviado: false,
  }).select('*, assigned:assigned_to(id,full_name,sector), creator:created_by(full_name)').single();

  if (error) {
    logError({ company: targetCompany, user_id: requester_id, acao: 'criar_tarefa', tabela: 'tarefas', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({ company: targetCompany, user_id: requester_id, acao: 'criar_tarefa', tabela: 'tarefas', depois: { id: data.id, title: data.title, assigned_to: finalAssignee } });

  // Avisa quem recebeu a tarefa. Sem await: notificação nunca pode segurar
  // a resposta de uma ação do usuário. Não avisa quem criou para si mesmo.
  if (data.assigned_to && data.assigned_to !== requester_id) {
    enviarPush(data.assigned_to, '📋 Nova tarefa para você', data.title, 'tarefa',
      { company: targetCompany, rota: req.originalUrl });
  }

  res.json(data);
});

// PUT /api/tarefas/:id
router.put('/:id', async (req, res) => {
  const { requester_id, title, description, assigned_to, due_date, due_time, priority, status, recorrencia, tags, lembrete_minutos } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Acesso negado' });

  const { data: task } = await supabase
    .from('tarefas')
    .select('created_by, assigned_to, title, due_date, due_time, recorrencia, tags, company, description, priority, lembrete_minutos, pdca_context')
    .eq('id', req.params.id).single();

  const isOwner = task?.created_by === requester_id && task?.assigned_to === requester_id;

  const updates = { updated_at: new Date().toISOString() };
  if (isManager(me) || isOwner) {
    if (title !== undefined)       updates.title       = title.trim();
    if (description !== undefined) updates.description = description?.trim() || '';
    if (due_date !== undefined)    updates.due_date    = due_date || null;
    if (due_time !== undefined)    updates.due_time    = due_time || null;
    if (priority)                  updates.priority    = priority;
    if (recorrencia !== undefined)        updates.recorrencia      = recorrencia;
    if (tags !== undefined)               updates.tags             = tags;
    if (lembrete_minutos !== undefined) { updates.lembrete_minutos = lembrete_minutos ?? null; updates.lembrete_enviado = false; }
  }
  if (isManager(me) && assigned_to) updates.assigned_to = assigned_to;
  if (status) updates.status = status;

  // Sync ação PDCA quando tarefa é marcada como concluída/pendente
  if (status !== undefined && task?.pdca_context?.acao_id) {
    supabase.from('acoes_pdca').update({
      concluida: status === 'concluida',
      concluida_em: status === 'concluida' ? new Date().toISOString() : null,
    }).eq('id', task.pdca_context.acao_id).then(() => {}).catch(() => {});
  }

  // Recorrência: ao concluir, cria próxima instância automaticamente
  if (status === 'concluida' && task?.recorrencia && task.recorrencia !== 'nenhuma') {
    const proxData = nextDueDate(task.due_date, task.recorrencia);
    if (proxData) {
      supabase.from('tarefas').insert({
        company:          task.company,
        title:            task.title,
        description:      task.description || null,
        assigned_to:      task.assigned_to,
        created_by:       task.created_by,
        due_date:         proxData,
        due_time:         task.due_time || null,
        priority:         task.priority || 'normal',
        recorrencia:      task.recorrencia,
        tags:             task.tags || [],
        lembrete_minutos: task.lembrete_minutos || null,
        status:           'pendente',
      }).then(({ error: e }) => {
        if (e) console.error('[recorrencia] falha ao criar próxima instância:', e.message);
      }).catch(err => console.error('[recorrencia] erro inesperado:', err));
    }
  }

  const { data, error } = await supabase.from('tarefas').update(updates).eq('id', req.params.id)
    .select('*, assigned:assigned_to(id,full_name,sector,avatar_url), creator:created_by(full_name,avatar_url)').single();
  if (error) {
    logError({ company: task?.company, user_id: requester_id, acao: 'editar_tarefa', tabela: 'tarefas', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({ company: task?.company, user_id: requester_id, acao: 'editar_tarefa', tabela: 'tarefas', antes: { title: task?.title }, depois: updates });

  // Avisa quem pediu a tarefa que ela foi concluída — sem isso a pessoa
  // precisa ficar voltando na tela para saber. Vai DEPOIS da gravação dar
  // certo: avisar antes anunciaria uma conclusão que pode não ter
  // acontecido. Não avisa quem concluiu a própria tarefa.
  if (status === 'concluida' && task?.created_by && task.created_by !== requester_id) {
    enviarPush(task.created_by, '✅ Tarefa concluída', task.title || '', 'tarefa',
      { company: task.company, rota: req.originalUrl });
  }

  res.json(data);
});

// POST /api/tarefas/:id/visto — abri esta tarefa (e as atualizações dela)
router.post('/:id/visto', async (req, res) => {
  const { requester_id } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  await marcarVisto(requester_id, 'tarefa', req.params.id);
  res.json({ ok: true });
});

// ── Pedido de novo prazo ──────────────────────────────────────
//
// Tarefa que depende de terceiro não cabe num dia só. Sem este caminho, a
// pessoa cumpria a parte dela, avisava por fora e a tarefa seguia marcada
// como atrasada — ou, pior, era fechada como concluída sem ter sido feita.
//
// Regras: pede quem recebeu a tarefa; decide quem criou. Enquanto não
// houver resposta, a DATA ANTIGA CONTINUA VALENDO — senão pedir prazo
// viraria um jeito de nunca atrasar.

// POST /api/tarefas/:id/prazo  { requester_id, data_nova, motivo }
router.post('/:id/prazo', async (req, res) => {
  const { requester_id, data_nova, motivo } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  if (!data_nova) return res.status(400).json({ error: 'Escolha a nova data.' });
  if (!motivo?.trim()) return res.status(400).json({ error: 'Explique por que precisa de mais prazo.' });

  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const { data: task } = await supabase.from('tarefas')
    .select('id, title, due_date, assigned_to, created_by, company, status').eq('id', req.params.id).maybeSingle();
  if (!task) return res.status(404).json({ error: 'Tarefa não encontrada' });
  if (task.assigned_to !== requester_id) return res.status(403).json({ error: 'Só quem recebeu a tarefa pode pedir novo prazo.' });
  if (task.status === 'concluida') return res.status(400).json({ error: 'Esta tarefa já está concluída.' });
  if (task.due_date && data_nova <= task.due_date) {
    return res.status(400).json({ error: 'A nova data precisa ser depois do prazo atual.' });
  }

  const { data, error } = await supabase.from('tarefa_prazos').insert({
    tarefa_id: task.id, pedido_por: requester_id,
    data_antiga: task.due_date || null, data_nova, motivo: motivo.trim(),
  }).select('*, solicitante:pedido_por(full_name)').single();
  if (error) {
    // O índice único barra um segundo pedido em aberto.
    const jaTem = String(error.message || '').includes('idx_tarefa_prazo_pendente');
    logError({ company: task.company, user_id: requester_id, acao: 'pedir_prazo_tarefa', tabela: 'tarefa_prazos', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(jaTem ? 409 : 500).json({ error: jaTem ? 'Já existe um pedido de prazo aguardando resposta.' : error.message });
  }

  // O pedido também vira atualização da tarefa: é ali que a equipe procura
  // o histórico, e é o que prova que foi comunicado.
  await supabase.from('tarefa_comentarios').insert({
    tarefa_id: task.id, user_id: requester_id,
    text: `⏳ Pedido de novo prazo para ${data_nova.split('-').reverse().join('/')}: ${motivo.trim()}`,
  });

  logAction({ company: task.company, user_id: requester_id, acao: 'pedir_prazo_tarefa', tabela: 'tarefa_prazos',
    antes: { prazo: task.due_date }, depois: { tarefa: task.title, prazo: data_nova, motivo: motivo.trim() } });

  enviarPush([task.created_by].filter(id => id && id !== requester_id),
    '⏳ Pedido de novo prazo',
    `${me.full_name || 'Alguém'} pediu ${data_nova.split('-').reverse().join('/')} para "${task.title}"`,
    'tarefa', { company: task.company, rota: req.originalUrl });

  res.json(data);
});

// PUT /api/tarefas/prazos/:pid  { requester_id, aceitar, resposta }
router.put('/prazos/:pid', async (req, res) => {
  const { requester_id, aceitar, resposta } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });

  const { data: pedido } = await supabase.from('tarefa_prazos')
    .select('*, tarefa:tarefa_id(id, title, created_by, assigned_to, company, due_date)')
    .eq('id', req.params.pid).maybeSingle();
  if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });
  if (pedido.situacao !== 'pendente') return res.status(400).json({ error: 'Este pedido já foi respondido.' });
  // Quem criou a tarefa é quem decide. Foi a escolha da loja: o prazo é um
  // acordo entre duas pessoas, e quem combinou é quem desfaz.
  if (pedido.tarefa?.created_by !== requester_id) {
    return res.status(403).json({ error: 'Só quem criou a tarefa pode responder ao pedido de prazo.' });
  }

  const me = await getProfile(requester_id);
  const situacao = aceitar ? 'aceito' : 'recusado';

  const { error } = await supabase.from('tarefa_prazos').update({
    situacao, decidido_por: requester_id, decidido_em: new Date().toISOString(),
    resposta: resposta?.trim() || null,
  }).eq('id', pedido.id);
  if (error) {
    logError({ company: pedido.tarefa?.company, user_id: requester_id, acao: 'responder_prazo_tarefa', tabela: 'tarefa_prazos', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }

  // Só agora a data muda — e só se foi aceita.
  if (aceitar) {
    await supabase.from('tarefas').update({ due_date: pedido.data_nova }).eq('id', pedido.tarefa_id);
  }

  const dia = (d) => (d ? String(d).split('-').reverse().join('/') : 'sem data');
  await supabase.from('tarefa_comentarios').insert({
    tarefa_id: pedido.tarefa_id, user_id: requester_id,
    text: aceitar
      ? `✅ Novo prazo aceito: de ${dia(pedido.data_antiga)} para ${dia(pedido.data_nova)}.${resposta?.trim() ? ` ${resposta.trim()}` : ''}`
      : `❌ Novo prazo recusado — continua valendo ${dia(pedido.data_antiga)}.${resposta?.trim() ? ` ${resposta.trim()}` : ''}`,
  });

  logAction({ company: pedido.tarefa?.company, user_id: requester_id, acao: 'responder_prazo_tarefa', tabela: 'tarefa_prazos',
    antes: { prazo: pedido.data_antiga }, depois: { tarefa: pedido.tarefa?.title, situacao, prazo: aceitar ? pedido.data_nova : pedido.data_antiga } });

  enviarPush([pedido.pedido_por].filter(id => id && id !== requester_id),
    aceitar ? '✅ Novo prazo aceito' : '❌ Novo prazo recusado',
    `${me?.full_name || 'Quem pediu a tarefa'} respondeu: "${pedido.tarefa?.title || ''}"`,
    'tarefa', { company: pedido.tarefa?.company, rota: req.originalUrl });

  res.json({ ok: true, situacao });
});

// GET /api/tarefas/:id/prazos — histórico de repactuações da tarefa
router.get('/:id/prazos', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const { data, error } = await supabase.from('tarefa_prazos')
    .select('*, solicitante:pedido_por(full_name), decisor:decidido_por(full_name)')
    .eq('tarefa_id', req.params.id).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// GET /api/tarefas/:id/comentarios
router.get('/:id/comentarios', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const { data, error } = await supabase
    .from('tarefa_comentarios')
    .select('*, author:user_id(full_name)')
    .eq('tarefa_id', req.params.id)
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// POST /api/tarefas/:id/comentarios
router.post('/:id/comentarios', async (req, res) => {
  const { requester_id, text } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  if (!text?.trim()) return res.status(400).json({ error: 'text obrigatório' });
  const { data, error } = await supabase
    .from('tarefa_comentarios')
    .insert({ tarefa_id: req.params.id, user_id: requester_id, text: text.trim() })
    .select('*, author:user_id(full_name)').single();
  if (error) {
    registrarLog('comentar_tarefa', 'tarefa_comentarios', 'erro', { user_id: requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: error.message });
  }

  const { data: task } = await supabase.from('tarefas').select('assigned_to, title, created_by, company').eq('id', req.params.id).single();
  registrarLog('comentar_tarefa', 'tarefa_comentarios', 'sucesso', { company: task?.company, user_id: requester_id, depois: { tarefa: task?.title } });

  // Avisa quem recebeu e quem criou a tarefa. A função central já descarta
  // repetidos, então quando as duas pessoas são a mesma vai um aviso só.
  // Quem comentou não recebe aviso do próprio comentário.
  enviarPush(
    [task?.assigned_to, task?.created_by].filter(id => id && id !== requester_id),
    `💬 ${data.author?.full_name || 'Alguém'} comentou na tarefa`,
    `${task?.title || ''}: ${text.trim().slice(0, 60)}`,
    'tarefa',
    { company: task?.company, rota: req.originalUrl },
  );

  res.json(data);
});

// PUT /api/tarefas/comentarios/:cid — editar comentário (só o autor)
router.put('/comentarios/:cid', async (req, res) => {
  const { requester_id, text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'text obrigatório' });
  const { data: c } = await supabase.from('tarefa_comentarios').select('user_id').eq('id', req.params.cid).single();
  if (!c) return res.status(404).json({ error: 'Comentário não encontrado' });
  if (c.user_id !== requester_id) return res.status(403).json({ error: 'Só o autor pode editar' });
  const { data, error } = await supabase.from('tarefa_comentarios')
    .update({ text: text.trim() }).eq('id', req.params.cid)
    .select('*, author:user_id(full_name)').single();
  if (error) {
    registrarLog('editar_comentario_tarefa', 'tarefa_comentarios', 'erro', { user_id: requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: error.message });
  }
  registrarLog('editar_comentario_tarefa', 'tarefa_comentarios', 'sucesso', { user_id: requester_id, depois: { id: req.params.cid } });
  res.json(data);
});

// DELETE /api/tarefas/comentarios/:cid — apagar comentário (só o autor)
router.delete('/comentarios/:cid', async (req, res) => {
  const { requester_id } = req.query;
  const { data: c } = await supabase.from('tarefa_comentarios').select('user_id').eq('id', req.params.cid).single();
  if (!c) return res.status(404).json({ error: 'Comentário não encontrado' });
  if (c.user_id !== requester_id) return res.status(403).json({ error: 'Só o autor pode apagar' });
  const { error } = await supabase.from('tarefa_comentarios').delete().eq('id', req.params.cid);
  if (error) {
    registrarLog('excluir_comentario_tarefa', 'tarefa_comentarios', 'erro', { user_id: requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: error.message });
  }
  registrarLog('excluir_comentario_tarefa', 'tarefa_comentarios', 'sucesso', { user_id: requester_id, antes: { id: req.params.cid } });
  res.json({ ok: true });
});

// DELETE /api/tarefas/:id
router.delete('/:id', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Acesso negado' });
  const { data: task } = await supabase.from('tarefas').select('created_by, assigned_to, title, company').eq('id', req.params.id).single();
  const isOwner = task?.created_by === requester_id && task?.assigned_to === requester_id;
  if (!isManager(me) && !isOwner) return res.status(403).json({ error: 'Acesso negado' });
  const { error } = await supabase.from('tarefas').delete().eq('id', req.params.id);
  if (error) {
    logError({ company: task?.company, user_id: requester_id, acao: 'excluir_tarefa', tabela: 'tarefas', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({ company: task?.company, user_id: requester_id, acao: 'excluir_tarefa', tabela: 'tarefas', antes: { title: task?.title } });
  res.json({ ok: true });
});

module.exports = router;
