const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');

async function getProfile(id) {
  const { data } = await supabase.from('profiles').select('access_level, company, full_name').eq('id', id).single();
  return data;
}
const canManage = p => p && ['admin', 'supervisor', 'master'].includes(p.access_level);

const QUADRANTE_LABEL = { P: 'P — Planejar', D: 'D — Fazer', C: 'C — Checar', A: 'A — Agir' };

// ── PLANOS ──────────────────────────────────────────────────

// GET /api/pdca
router.get('/', async (req, res) => {
  const { requester_id, company: queryCompany } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const targetCompany = me.access_level === 'master' ? queryCompany : me.company;
  if (!targetCompany) return res.json([]);

  const { data: planos, error } = await supabase
    .from('planos_acao')
    .select('*, criador:criado_por(full_name, avatar_url)')
    .eq('company', targetCompany)
    .order('criado_em', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  const ids = (planos || []).map(p => p.id);
  let statsPorPlano = {};

  if (ids.length > 0) {
    const { data: acoes } = await supabase
      .from('acoes_pdca')
      .select('plano_id, concluida, responsavel_id, responsavel:responsavel_id(id, full_name, avatar_url)')
      .in('plano_id', ids);

    (acoes || []).forEach(a => {
      if (!statsPorPlano[a.plano_id]) statsPorPlano[a.plano_id] = { total: 0, concluidas: 0, responsaveis: [] };
      statsPorPlano[a.plano_id].total++;
      if (a.concluida) statsPorPlano[a.plano_id].concluidas++;
      if (a.responsavel && !statsPorPlano[a.plano_id].responsaveis.find(r => r.id === a.responsavel_id)) {
        statsPorPlano[a.plano_id].responsaveis.push(a.responsavel);
      }
    });
  }

  const result = (planos || []).map(p => ({
    ...p,
    total_acoes: statsPorPlano[p.id]?.total || 0,
    acoes_concluidas: statsPorPlano[p.id]?.concluidas || 0,
    responsaveis: statsPorPlano[p.id]?.responsaveis || [],
  }));

  res.json(result);
});

// POST /api/pdca
router.post('/', async (req, res) => {
  const { requester_id, titulo, problema, meta, prazo_final, company: bodyCompany } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me || !canManage(me)) return res.status(403).json({ error: 'Acesso negado' });
  if (!titulo) return res.status(400).json({ error: 'titulo obrigatório' });

  const targetCompany = me.access_level === 'master' ? bodyCompany : me.company;

  const { data, error } = await supabase.from('planos_acao').insert({
    company: targetCompany,
    titulo: titulo.trim(),
    problema: problema?.trim() || null,
    meta: meta?.trim() || null,
    prazo_final: prazo_final || null,
    criado_por: requester_id,
    status: 'andamento',
  }).select('*, criador:criado_por(full_name, avatar_url)').single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ...data, total_acoes: 0, acoes_concluidas: 0, responsaveis: [] });
});

// PUT /api/pdca/:id
router.put('/:id', async (req, res) => {
  const { requester_id, titulo, problema, meta, prazo_final, status } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me || !canManage(me)) return res.status(403).json({ error: 'Acesso negado' });

  const updates = {};
  if (titulo !== undefined)      updates.titulo      = titulo.trim();
  if (problema !== undefined)    updates.problema    = problema?.trim() || null;
  if (meta !== undefined)        updates.meta        = meta?.trim() || null;
  if (prazo_final !== undefined) updates.prazo_final = prazo_final || null;
  if (status !== undefined)      updates.status      = status;

  const { data, error } = await supabase.from('planos_acao').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/pdca/:id  — deve vir ANTES de /acoes/:id
router.delete('/:id', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me || !canManage(me)) return res.status(403).json({ error: 'Acesso negado' });

  // Remove tarefas vinculadas às ações do plano
  const { data: acoes } = await supabase.from('acoes_pdca').select('tarefa_id').eq('plano_id', req.params.id).not('tarefa_id', 'is', null);
  const tarefaIds = (acoes || []).map(a => a.tarefa_id).filter(Boolean);
  if (tarefaIds.length > 0) {
    await supabase.from('tarefas').delete().in('id', tarefaIds);
  }

  await supabase.from('acoes_pdca').delete().eq('plano_id', req.params.id);
  const { error } = await supabase.from('planos_acao').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── AÇÕES ───────────────────────────────────────────────────

// GET /api/pdca/:id/acoes
router.get('/:id/acoes', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const { data, error } = await supabase
    .from('acoes_pdca')
    .select('*, responsavel:responsavel_id(id, full_name, avatar_url)')
    .eq('plano_id', req.params.id)
    .order('criado_em', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// POST /api/pdca/:id/acoes
router.post('/:id/acoes', async (req, res) => {
  const { requester_id, quadrante, descricao, responsavel_id, prazo, criar_tarefa } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me || !canManage(me)) return res.status(403).json({ error: 'Acesso negado' });
  if (!quadrante || !descricao) return res.status(400).json({ error: 'quadrante e descricao obrigatórios' });

  const { data: plano } = await supabase.from('planos_acao').select('*').eq('id', req.params.id).single();
  if (!plano) return res.status(404).json({ error: 'Plano não encontrado' });

  const { data: acao, error } = await supabase.from('acoes_pdca').insert({
    plano_id: req.params.id,
    quadrante,
    descricao: descricao.trim(),
    responsavel_id: responsavel_id || null,
    prazo: prazo || null,
    concluida: false,
    criar_tarefa: criar_tarefa !== false,
  }).select('*, responsavel:responsavel_id(id, full_name, avatar_url)').single();

  if (error) return res.status(500).json({ error: error.message });

  // Auto-criar tarefa se toggle ativo + responsavel + prazo
  if (criar_tarefa !== false && responsavel_id && prazo) {
    const pdcaContext = {
      plano_id: req.params.id,
      plano_titulo: plano.titulo,
      quadrante,
      quadrante_label: QUADRANTE_LABEL[quadrante] || quadrante,
      meta: plano.meta,
      acao_id: acao.id,
    };

    const { data: tarefa } = await supabase.from('tarefas').insert({
      company: plano.company,
      title: descricao.trim(),
      description: `Ação do Plano: ${plano.titulo}`,
      assigned_to: responsavel_id,
      due_date: prazo,
      priority: 'normal',
      recorrencia: 'nenhuma',
      tags: ['plano_acao'],
      created_by: requester_id,
      pdca_context: pdcaContext,
      status: 'pendente',
    }).select('id').single();

    if (tarefa) {
      await supabase.from('acoes_pdca').update({ tarefa_id: tarefa.id }).eq('id', acao.id);
      acao.tarefa_id = tarefa.id;
    }
  }

  res.json(acao);
});

// PUT /api/pdca/acoes/:id  — ANTES de PUT /:id para não conflitar
router.put('/acoes/:id', async (req, res) => {
  const { requester_id, descricao, responsavel_id, prazo, concluida, criar_tarefa } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const { data: acaoAtual } = await supabase
    .from('acoes_pdca')
    .select('*, plano:plano_id(*)')
    .eq('id', req.params.id).single();
  if (!acaoAtual) return res.status(404).json({ error: 'Ação não encontrada' });

  const updates = {};
  if (descricao !== undefined)    updates.descricao    = descricao.trim();
  if (responsavel_id !== undefined) updates.responsavel_id = responsavel_id || null;
  if (prazo !== undefined)        updates.prazo        = prazo || null;
  if (criar_tarefa !== undefined) updates.criar_tarefa = criar_tarefa;
  if (concluida !== undefined) {
    updates.concluida    = concluida;
    updates.concluida_em = concluida ? new Date().toISOString() : null;
  }

  const { data, error } = await supabase.from('acoes_pdca').update(updates).eq('id', req.params.id)
    .select('*, responsavel:responsavel_id(id, full_name, avatar_url)').single();
  if (error) return res.status(500).json({ error: error.message });

  // Sync tarefa vinculada quando concluida muda
  if (concluida !== undefined && acaoAtual.tarefa_id) {
    supabase.from('tarefas').update({
      status: concluida ? 'concluida' : 'pendente',
    }).eq('id', acaoAtual.tarefa_id).then(() => {}).catch(() => {});
  }

  // Auto-criar tarefa se agora atende os critérios e ainda não tem tarefa
  const finalCriar      = criar_tarefa !== undefined ? criar_tarefa : acaoAtual.criar_tarefa;
  const finalResponsavel = responsavel_id !== undefined ? responsavel_id : acaoAtual.responsavel_id;
  const finalPrazo      = prazo !== undefined ? prazo : acaoAtual.prazo;
  const plano           = acaoAtual.plano;

  if (finalCriar && finalResponsavel && finalPrazo && !acaoAtual.tarefa_id) {
    const pdcaContext = {
      plano_id: acaoAtual.plano_id,
      plano_titulo: plano?.titulo,
      quadrante: acaoAtual.quadrante,
      quadrante_label: QUADRANTE_LABEL[acaoAtual.quadrante] || acaoAtual.quadrante,
      meta: plano?.meta,
      acao_id: req.params.id,
    };

    const { data: tarefa } = await supabase.from('tarefas').insert({
      company: plano?.company,
      title: data.descricao,
      description: `Ação do Plano: ${plano?.titulo}`,
      assigned_to: finalResponsavel,
      due_date: finalPrazo,
      priority: 'normal',
      recorrencia: 'nenhuma',
      tags: ['plano_acao'],
      created_by: requester_id,
      pdca_context: pdcaContext,
      status: 'pendente',
    }).select('id').single();

    if (tarefa) {
      await supabase.from('acoes_pdca').update({ tarefa_id: tarefa.id }).eq('id', req.params.id);
      data.tarefa_id = tarefa.id;
    }
  }

  res.json(data);
});

// DELETE /api/pdca/acoes/:id
router.delete('/acoes/:id', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me || !canManage(me)) return res.status(403).json({ error: 'Acesso negado' });

  const { data: acao } = await supabase.from('acoes_pdca').select('tarefa_id').eq('id', req.params.id).single();

  const { error } = await supabase.from('acoes_pdca').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });

  if (acao?.tarefa_id) {
    await supabase.from('tarefas').delete().eq('id', acao.tarefa_id);
  }

  res.json({ ok: true });
});

module.exports = router;
