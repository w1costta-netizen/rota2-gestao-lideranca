const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');
const { sendPushToUsers } = require('../lib/push');

async function getProfile(id) {
  const { data } = await supabase.from('profiles').select('access_level, company, full_name').eq('id', id).single();
  return data;
}
const isManager = p => p && ['admin','supervisor','master'].includes(p.access_level);

// GET /api/tarefas?requester_id=&company=
router.get('/', async (req, res) => {
  const { requester_id, company: queryCompany } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const targetCompany = me.access_level === 'master' ? queryCompany : me.company;

  // Master sem loja selecionada → retorna lista vazia
  if (me.access_level === 'master' && !targetCompany) return res.json([]);

  let query = supabase
    .from('tarefas')
    .select('*, assigned:assigned_to(id,full_name,sector), creator:created_by(full_name)')
    .eq('company', targetCompany)
    .order('created_at', { ascending: false });

  if (me.access_level === 'admin' || me.access_level === 'master') {
    // Admin e master veem tudo da empresa
  } else if (me.access_level === 'supervisor') {
    // Supervisor vê tarefas atribuídas a ele + tarefas que ele criou/delegou
    query = query.or(`assigned_to.eq.${requester_id},created_by.eq.${requester_id}`);
  } else {
    // Lider/colaborador vê apenas as tarefas atribuídas a ele
    query = query.eq('assigned_to', requester_id);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/tarefas
router.post('/', async (req, res) => {
  const { requester_id, title, description, assigned_to, due_date, priority, company: bodyCompany } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  // Não-admin só pode criar tarefa para si mesmo
  if (!isManager(me) && me.access_level !== 'master' && assigned_to && assigned_to !== requester_id)
    return res.status(403).json({ error: 'Você só pode criar tarefas para você mesmo' });
  if (!title) return res.status(400).json({ error: 'title obrigatório' });
  const finalAssignee = assigned_to || requester_id;
  const targetCompany = me.access_level === 'master' ? bodyCompany : me.company;

  const { data, error } = await supabase.from('tarefas').insert({
    company: targetCompany, title: title.trim(),
    description: description?.trim() || '',
    assigned_to: finalAssignee, created_by: requester_id,
    due_date: due_date || null,
    priority: priority || 'normal',
  }).select('*, assigned:assigned_to(id,full_name,sector), creator:created_by(full_name)').single();

  if (error) return res.status(500).json({ error: error.message });

  // Notifica o destinatário se for diferente de quem criou
  if (data.assigned_to && data.assigned_to !== requester_id) {
    sendPushToUsers([data.assigned_to], {
      title: '📋 Nova tarefa atribuída',
      body: title.trim().slice(0, 80),
      page: 'tarefas',
    }).catch(() => {});
  }

  res.json(data);
});

// PUT /api/tarefas/:id
router.put('/:id', async (req, res) => {
  const { requester_id, title, description, assigned_to, due_date, priority, status } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Acesso negado' });

  // Verifica se é dono da tarefa (criou para si mesmo)
  const { data: task } = await supabase.from('tarefas').select('created_by, assigned_to').eq('id', req.params.id).single();
  const isOwner = task?.created_by === requester_id && task?.assigned_to === requester_id;

  const updates = { updated_at: new Date().toISOString() };
  // Admin edita tudo; dono da tarefa edita tudo exceto atribuição; outros só mudam status
  if (isManager(me) || isOwner) {
    if (title)       updates.title       = title.trim();
    if (description !== undefined) updates.description = description?.trim() || '';
    if (due_date !== undefined) updates.due_date = due_date || null;
    if (priority)    updates.priority    = priority;
  }
  if (isManager(me) && assigned_to) updates.assigned_to = assigned_to;
  if (status) updates.status = status;

  // Notifica criador quando tarefa é concluída por outra pessoa
  if (status === 'concluida') {
    const { data: taskFull } = await supabase.from('tarefas').select('created_by, title').eq('id', req.params.id).single();
    if (taskFull && taskFull.created_by && taskFull.created_by !== requester_id) {
      sendPushToUsers([taskFull.created_by], {
        title: '✅ Tarefa concluída',
        body: (taskFull.title || '').slice(0, 80),
        page: 'tarefas',
      }).catch(() => {});
    }
  }

  const { data, error } = await supabase.from('tarefas').update(updates).eq('id', req.params.id)
    .select('*, assigned:assigned_to(id,full_name,sector), creator:created_by(full_name)').single();
  if (error) return res.status(500).json({ error: error.message });
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
    .select('*, author:user_id(full_name)')
    .single();
  if (error) return res.status(500).json({ error: error.message });

  // Notifica responsável da tarefa
  const { data: task } = await supabase.from('tarefas').select('assigned_to, title, created_by').eq('id', req.params.id).single();
  const notify = [...new Set([task?.assigned_to, task?.created_by].filter(id => id && id !== requester_id))];
  if (notify.length) {
    sendPushToUsers(notify, {
      title: '💬 Novo comentário na tarefa',
      body: text.trim().slice(0, 80),
      page: 'tarefas',
    }).catch(() => {});
  }
  res.json(data);
});

// DELETE /api/tarefas/:id
router.delete('/:id', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Acesso negado' });
  // Verifica se é o dono (criou para si mesmo)
  const { data: task } = await supabase.from('tarefas').select('created_by, assigned_to').eq('id', req.params.id).single();
  const isOwner = task?.created_by === requester_id && task?.assigned_to === requester_id;
  if (!isManager(me) && !isOwner) return res.status(403).json({ error: 'Acesso negado' });
  const { error } = await supabase.from('tarefas').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
