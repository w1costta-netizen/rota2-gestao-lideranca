const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');
const { sendPushToUsers } = require('../lib/push');

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
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const targetCompany = me.access_level === 'master' ? queryCompany : me.company;
  if (me.access_level === 'master' && !targetCompany) return res.json([]);

  // Busca membros do time que reportam ao usuário (para líderes)
  let teamIds = [];
  if (!['admin','master'].includes(me.access_level)) {
    const { data: teamMembers } = await supabase
      .from('profiles')
      .select('id, reports_to_list')
      .eq('company', targetCompany);
    teamIds = (teamMembers || [])
      .filter(m => Array.isArray(m.reports_to_list) && m.reports_to_list.includes(requester_id))
      .map(m => m.id);
  }

  let query = supabase
    .from('tarefas')
    .select('*, assigned:assigned_to(id,full_name,sector), creator:created_by(full_name)')
    .eq('company', targetCompany)
    .order('created_at', { ascending: false });

  if (me.access_level === 'admin' || me.access_level === 'master') {
    // vê tudo da empresa
  } else if (me.access_level === 'supervisor') {
    const ids = [requester_id, ...teamIds];
    query = query.in('assigned_to', ids);
  } else if (teamIds.length > 0) {
    // lider com time: vê próprias + do time
    const ids = [requester_id, ...teamIds];
    query = query.in('assigned_to', ids);
  } else {
    query = query.eq('assigned_to', requester_id);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
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

  if (error) return res.status(500).json({ error: error.message });

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
  const { requester_id, title, description, assigned_to, due_date, due_time, priority, status, recorrencia, tags, lembrete_minutos } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Acesso negado' });

  const { data: task } = await supabase
    .from('tarefas')
    .select('created_by, assigned_to, title, due_date, due_time, recorrencia, tags, company, description, priority')
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

  // Notifica criador quando concluída
  if (status === 'concluida' && task?.created_by && task.created_by !== requester_id) {
    sendPushToUsers([task.created_by], {
      title: '✅ Tarefa concluída',
      body: (task.title || '').slice(0, 80),
      page: 'tarefas',
    }).catch(() => {});
  }

  // Recorrência: ao concluir, cria próxima instância automaticamente
  if (status === 'concluida' && task?.recorrencia && task.recorrencia !== 'nenhuma') {
    const proxData = nextDueDate(task.due_date, task.recorrencia);
    if (proxData) {
      supabase.from('tarefas').insert({
        company:     task.company,
        title:       task.title,
        description: task.description,
        assigned_to: task.assigned_to,
        created_by:  task.created_by,
        due_date:    proxData,
        due_time:    task.due_time,
        priority:    task.priority,
        recorrencia: task.recorrencia,
        tags:        task.tags || [],
        status:      'pendente',
      }).then(() => {}).catch(() => {});
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
    .select('*, author:user_id(full_name)').single();
  if (error) return res.status(500).json({ error: error.message });

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
  const { data: task } = await supabase.from('tarefas').select('created_by, assigned_to').eq('id', req.params.id).single();
  const isOwner = task?.created_by === requester_id && task?.assigned_to === requester_id;
  if (!isManager(me) && !isOwner) return res.status(403).json({ error: 'Acesso negado' });
  const { error } = await supabase.from('tarefas').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
