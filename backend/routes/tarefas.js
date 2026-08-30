const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');
const { enviarPush } = require('../lib/notificacoes');
const { logAction, logError, registrarLog } = require('../lib/auditLog');

async function getProfile(id) {
  const { data } = await supabase.from('profiles').select('access_level, company, full_name').eq('id', id).single();
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
    res.json(data);
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
