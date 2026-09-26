const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');
const { logAction, logError, registrarLog } = require('../lib/auditLog');

async function getProfile(id) {
  const { data } = await supabase.from('profiles').select('access_level, company, full_name').eq('id', id).single();
  return data;
}
const canManage = p => p && ['admin', 'supervisor', 'master'].includes(p.access_level);

// As mesmas repetições que as Tarefas entendem — a tarefa da ação é uma
// tarefa comum, e quem repete é o motor de lá.
const RECORRENCIAS = ['nenhuma', 'diaria', 'semanal', 'quinzenal', 'mensal'];

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

  if (error) {
    logError({ company: targetCompany, user_id: requester_id, acao: 'criar_plano_pdca', tabela: 'planos_acao', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({ company: targetCompany, user_id: requester_id, acao: 'criar_plano_pdca', tabela: 'planos_acao', depois: { id: data.id, titulo: data.titulo } });
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
  if (error) {
    logError({ company: me.company, user_id: requester_id, acao: 'editar_plano_pdca', tabela: 'planos_acao', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({ company: data.company, user_id: requester_id, acao: 'editar_plano_pdca', tabela: 'planos_acao', depois: updates });
  res.json(data);
});

// DELETE /api/pdca/:id  — deve vir ANTES de /acoes/:id
router.delete('/:id', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me || !canManage(me)) return res.status(403).json({ error: 'Acesso negado' });

  const { data: plano } = await supabase.from('planos_acao').select('titulo, company').eq('id', req.params.id).single();

  // Remove tarefas vinculadas às ações do plano
  const { data: acoes } = await supabase.from('acoes_pdca').select('tarefa_id').eq('plano_id', req.params.id).not('tarefa_id', 'is', null);
  const tarefaIds = (acoes || []).map(a => a.tarefa_id).filter(Boolean);
  if (tarefaIds.length > 0) {
    await supabase.from('tarefas').delete().in('id', tarefaIds);
  }

  await supabase.from('acoes_pdca').delete().eq('plano_id', req.params.id);
  const { error } = await supabase.from('planos_acao').delete().eq('id', req.params.id);
  if (error) {
    logError({ company: plano?.company, user_id: requester_id, acao: 'excluir_plano_pdca', tabela: 'planos_acao', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({ company: plano?.company, user_id: requester_id, acao: 'excluir_plano_pdca', tabela: 'planos_acao', antes: { titulo: plano?.titulo } });
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
  const { requester_id, quadrante, descricao, responsavel_id, prazo, criar_tarefa, inicio, recorrencia, grupo_id } = req.body;
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
    inicio: inicio || null,
    // Mesma ação delegada a várias pessoas: uma linha por pessoa (cada uma
    // vira tarefa e conclui no seu tempo), todas com o mesmo grupo para a
    // tela mostrar um cartão só.
    grupo_id: grupo_id || null,
    recorrencia: RECORRENCIAS.includes(recorrencia) ? recorrencia : 'nenhuma',
    concluida: false,
    criar_tarefa: criar_tarefa !== false,
  }).select('*, responsavel:responsavel_id(id, full_name, avatar_url)').single();

  if (error) {
    registrarLog('criar_acao_pdca', 'acoes_pdca', 'erro', { company: plano.company, user_id: requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: error.message });
  }
  registrarLog('criar_acao_pdca', 'acoes_pdca', 'sucesso', {
    company: plano.company, user_id: requester_id,
    depois: { plano: plano.titulo, quadrante, descricao: acao.descricao, prazo },
  });

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
      // A tarefa aparece a partir do INÍCIO, não do prazo final: a pessoa
      // precisa ver o que fazer enquanto dá tempo de fazer.
      due_date: inicio || prazo,
      priority: 'normal',
      recorrencia: RECORRENCIAS.includes(recorrencia) ? recorrencia : 'nenhuma',
      tags: ['plano_acao'],
      created_by: requester_id,
      pdca_context: { ...pdcaContext, repetir_ate: prazo },
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
  const { requester_id, descricao, responsavel_id, prazo, concluida, criar_tarefa, inicio, recorrencia, aplicar_grupo } = req.body;
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
  if (inicio !== undefined)       updates.inicio       = inicio || null;
  if (recorrencia !== undefined)  updates.recorrencia  = RECORRENCIAS.includes(recorrencia) ? recorrencia : 'nenhuma';
  if (criar_tarefa !== undefined) updates.criar_tarefa = criar_tarefa;
  if (concluida !== undefined) {
    updates.concluida    = concluida;
    updates.concluida_em = concluida ? new Date().toISOString() : null;
  }

  const { data, error } = await supabase.from('acoes_pdca').update(updates).eq('id', req.params.id)
    .select('*, responsavel:responsavel_id(id, full_name, avatar_url)').single();
  if (error) {
    registrarLog('editar_acao_pdca', 'acoes_pdca', 'erro', { company: acaoAtual.plano?.company, user_id: requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: error.message });
  }
  registrarLog('editar_acao_pdca', 'acoes_pdca', 'sucesso', {
    company: acaoAtual.plano?.company, user_id: requester_id,
    antes: { descricao: acaoAtual.descricao, concluida: acaoAtual.concluida },
    depois: updates,
  });

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
  const finalInicio     = inicio !== undefined ? inicio : acaoAtual.inicio;
  const finalRepete     = recorrencia !== undefined ? recorrencia : acaoAtual.recorrencia;
  const plano           = acaoAtual.plano;

  // Mudou a data ou a repetição de uma ação que JÁ tem tarefa: a tarefa
  // acompanha. Sem isso, corrigir o plano não corrigia o que a pessoa vê.
  if (acaoAtual.tarefa_id && (inicio !== undefined || prazo !== undefined || recorrencia !== undefined)) {
    const { data: tAtual } = await supabase.from('tarefas')
      .select('due_date, pdca_context').eq('id', acaoAtual.tarefa_id).maybeSingle();
    const patchTarefa = {
      recorrencia: RECORRENCIAS.includes(finalRepete) ? finalRepete : 'nenhuma',
      pdca_context: { ...(tAtual?.pdca_context || {}), repetir_ate: finalPrazo || null },
    };
    // A data só volta para trás se a tarefa ainda não foi feita nem
    // repactuada — mexer numa data já combinada seria atropelar a pessoa.
    const novaData = finalInicio || finalPrazo;
    if (novaData && tAtual?.due_date !== novaData) patchTarefa.due_date = novaData;
    await supabase.from('tarefas').update(patchTarefa).eq('id', acaoAtual.tarefa_id);
  }

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
      due_date: finalInicio || finalPrazo,
      priority: 'normal',
      recorrencia: RECORRENCIAS.includes(finalRepete) ? finalRepete : 'nenhuma',
      tags: ['plano_acao'],
      created_by: requester_id,
      pdca_context: { ...pdcaContext, repetir_ate: finalPrazo },
      status: 'pendente',
    }).select('id').single();

    if (tarefa) {
      await supabase.from('acoes_pdca').update({ tarefa_id: tarefa.id }).eq('id', req.params.id);
      data.tarefa_id = tarefa.id;
    }
  }

  // Ação de várias pessoas: o texto, o prazo e a repetição são os mesmos
  // para todo mundo — editar em uma tem que valer para todas, senão o
  // cartão único da tela mostraria uma versão e as tarefas, outra.
  // `concluida` NUNCA se propaga: cada pessoa conclui a sua.
  if (aplicar_grupo && acaoAtual.grupo_id) {
    const doGrupo = {};
    for (const campo of ['descricao', 'prazo', 'inicio', 'recorrencia', 'criar_tarefa']) {
      if (updates[campo] !== undefined) doGrupo[campo] = updates[campo];
    }
    if (Object.keys(doGrupo).length) {
      const { data: irmas } = await supabase.from('acoes_pdca')
        .select('id, tarefa_id')
        .eq('grupo_id', acaoAtual.grupo_id).neq('id', req.params.id);

      await supabase.from('acoes_pdca').update(doGrupo).eq('grupo_id', acaoAtual.grupo_id).neq('id', req.params.id);

      // As tarefas das outras pessoas acompanham a mesma mudança.
      for (const irma of (irmas || [])) {
        if (!irma.tarefa_id) continue;
        const { data: t } = await supabase.from('tarefas')
          .select('due_date, pdca_context').eq('id', irma.tarefa_id).maybeSingle();
        const patch = {};
        if (doGrupo.descricao !== undefined) patch.title = doGrupo.descricao;
        if (doGrupo.recorrencia !== undefined) patch.recorrencia = doGrupo.recorrencia;
        if (doGrupo.prazo !== undefined || doGrupo.inicio !== undefined) {
          patch.pdca_context = { ...(t?.pdca_context || {}), repetir_ate: finalPrazo || null };
          const novaData = finalInicio || finalPrazo;
          if (novaData && t?.due_date !== novaData) patch.due_date = novaData;
        }
        if (Object.keys(patch).length) await supabase.from('tarefas').update(patch).eq('id', irma.tarefa_id);
      }
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

  const { data: acao } = await supabase.from('acoes_pdca')
    .select('tarefa_id, descricao, grupo_id, plano:plano_id(company)').eq('id', req.params.id).single();

  // Apagar a ação de várias pessoas de uma vez: é um cartão só na tela, e
  // apagar linha por linha deixaria metade do grupo órfã.
  const apagarGrupo = req.query.grupo === '1' && acao?.grupo_id;
  let tarefasParaApagar = acao?.tarefa_id ? [acao.tarefa_id] : [];
  if (apagarGrupo) {
    const { data: irmas } = await supabase.from('acoes_pdca')
      .select('tarefa_id').eq('grupo_id', acao.grupo_id);
    tarefasParaApagar = (irmas || []).map(i => i.tarefa_id).filter(Boolean);
  }

  const { error } = apagarGrupo
    ? await supabase.from('acoes_pdca').delete().eq('grupo_id', acao.grupo_id)
    : await supabase.from('acoes_pdca').delete().eq('id', req.params.id);
  if (error) {
    logError({ company: acao?.plano?.company, user_id: requester_id, acao: 'excluir_acao_pdca', tabela: 'acoes_pdca', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({ company: acao?.plano?.company, user_id: requester_id, acao: 'excluir_acao_pdca', tabela: 'acoes_pdca', antes: { descricao: acao?.descricao } });

  if (tarefasParaApagar.length) {
    await supabase.from('tarefas').delete().in('id', tarefasParaApagar);
  }

  res.json({ ok: true });
});

module.exports = router;
