const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');
const { logAction, logError, registrarLog } = require('../lib/auditLog');
// Toda a regra das tarefas que nascem do plano mora em lib/planoAcao/.
// Esta rota só recebe o pedido e chama o módulo.
const {
  QUADRANTE_LABEL, partirAcao, descricaoDaTarefa, ehRotina, sincronizarRotina,
  RECORRENCIAS, limparDiasSemana, limparDatas, criarTarefasDeMedicao, limparTarefasDeMedicao,
  porTarefaEmDia, criadorDaAcao, podeGerirPlano, NEGADO_PLANO, perfilDe, lojaPermitida,
} = require('../lib/planoAcao');
const { hojeBR } = require('../lib/recorrencia');
const Anthropic = require('@anthropic-ai/sdk');
const Assistente = require('../lib/assistentePlano');

async function getProfile(id) {
  const { data } = await supabase.from('profiles').select('access_level, company, full_name').eq('id', id).single();
  return data;
}
const canManage = p => p && ['admin', 'supervisor', 'master'].includes(p.access_level);
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
  const { data: planoAtual } = await supabase.from('planos_acao').select('company, criado_por').eq('id', req.params.id).maybeSingle();
  if (!(await podeGerirPlano(requester_id, planoAtual))) return res.status(403).json({ error: NEGADO_PLANO });

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

  // Plano reaberto: as rotinas dele voltam a ter a próxima tarefa.
  if (status === 'andamento') {
    const { data: acoesDoPlano } = await supabase.from('acoes_pdca').select('*').eq('plano_id', req.params.id);
    for (const a of acoesDoPlano || []) {
      if (ehRotina(a)) await sincronizarRotina(a, { plano: data, requesterId: requester_id }).catch(() => null);
    }
  }
  res.json(data);
});

// DELETE /api/pdca/:id  — deve vir ANTES de /acoes/:id
router.delete('/:id', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me || !canManage(me)) return res.status(403).json({ error: 'Acesso negado' });

  const { data: plano } = await supabase.from('planos_acao').select('titulo, company, criado_por').eq('id', req.params.id).single();
  if (!(await podeGerirPlano(requester_id, plano))) return res.status(403).json({ error: NEGADO_PLANO });

  // Remove tarefas vinculadas às ações do plano. `tarefa_id` aponta para
  // UMA tarefa; a rotina e a medição do C têm várias, que só se acham pelo
  // vínculo. Apagar só pela referência deixava as outras na lista das
  // pessoas, de um plano que não existe mais.
  const { data: acoes } = await supabase.from('acoes_pdca').select('tarefa_id').eq('plano_id', req.params.id).not('tarefa_id', 'is', null);
  const tarefaIds = (acoes || []).map(a => a.tarefa_id).filter(Boolean);
  if (tarefaIds.length > 0) {
    await supabase.from('tarefas').delete().in('id', tarefaIds);
  }
  await supabase.from('tarefas').delete().eq('pdca_context->>plano_id', req.params.id);

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

  // Quantas medições já foram feitas em cada ação do C. É o que mostra o
  // andamento no cartão — a ação só fecha quando todas estiverem prontas.
  const comMedicao = (data || []).filter(a => (a.datas_medicao || []).length);
  if (comMedicao.length) {
    const { data: tarefas } = await supabase.from('tarefas')
      .select('status, due_date, pdca_context')
      .in('pdca_context->>acao_id', comMedicao.map(a => a.id));
    const feitas = {};
    for (const t of tarefas || []) {
      const id = t.pdca_context?.acao_id;
      if (!id) continue;
      if (!feitas[id]) feitas[id] = { total: 0, concluidas: 0, datas: [] };
      feitas[id].total++;
      if (t.status === 'concluida') { feitas[id].concluidas++; feitas[id].datas.push(t.due_date); }
    }
    for (const a of comMedicao) {
      a.medicoes_total = feitas[a.id]?.total ?? (a.datas_medicao || []).length;
      a.medicoes_feitas = feitas[a.id]?.concluidas || 0;
      // QUAIS datas já foram medidas. Sem isso o cartão dizia "próxima
      // 05/10" num dia 05/10 em que a medição JÁ estava concluída — e
      // quem lia concluía que a tarefa tinha sumido.
      a.medicoes_datas_feitas = feitas[a.id]?.datas || [];
    }
  }

  // Rotina: quantas datas feitas, não realizadas e qual a próxima. É o que
  // o gestor lê no cartão para saber se a rotina está andando.
  const rotinas = (data || []).filter(ehRotina);
  if (rotinas.length) {
    const { data: tr } = await supabase.from('tarefas')
      .select('status, due_date, pdca_context')
      .in('pdca_context->>acao_id', rotinas.map(a => a.id));
    const porAcao = {};
    const hoje = hojeBR();
    for (const t of tr || []) {
      const id = t.pdca_context?.acao_id; if (!id) continue;
      const r = porAcao[id] = porAcao[id] || { feitas: 0, nao_realizadas: 0, proxima: null, hoje: null };
      // O círculo do cartão de uma rotina é "a tarefa de HOJE".
      if (t.due_date === hoje) r.hoje = t.status;
      if (t.status === 'concluida') r.feitas++;
      else if (t.status === 'nao_realizada') r.nao_realizadas++;
      else if (!r.proxima || t.due_date < r.proxima) r.proxima = t.due_date;
    }
    for (const a of rotinas) a.rotina = porAcao[a.id] || { feitas: 0, nao_realizadas: 0, proxima: null, hoje: null };
  }

  res.json(data || []);
});

// POST /api/pdca/:id/acoes
router.post('/:id/acoes', async (req, res) => {
  const { requester_id, quadrante, descricao, responsavel_id, prazo, criar_tarefa, inicio, recorrencia, dias_semana, grupo_id, detalhe, datas_medicao } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me || !canManage(me)) return res.status(403).json({ error: 'Acesso negado' });
  if (!quadrante || !descricao) return res.status(400).json({ error: 'quadrante e descricao obrigatórios' });

  const { data: plano } = await supabase.from('planos_acao').select('*').eq('id', req.params.id).single();
  if (!plano) return res.status(404).json({ error: 'Plano não encontrado' });
  if (!(await podeGerirPlano(requester_id, plano))) return res.status(403).json({ error: NEGADO_PLANO });

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
    // A parte desta pessoa dentro da ação comum. Fica só nela.
    detalhe: detalhe?.trim() || null,
    // Só o C trabalha com lista de datas (ver criarTarefasDeMedicao).
    datas_medicao: quadrante === 'C' && limparDatas(datas_medicao).length ? limparDatas(datas_medicao) : null,
    recorrencia: RECORRENCIAS.includes(recorrencia) ? recorrencia : 'nenhuma',
    dias_semana: recorrencia === 'dias_semana' ? limparDiasSemana(dias_semana) : null,
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

    const datas = quadrante === 'C' ? limparDatas(datas_medicao) : [];
    let tarefaId = null;

    if (datas.length) {
      // Medição com datas combinadas: uma tarefa por data, todas já
      // visíveis para o responsável.
      try {
        tarefaId = await criarTarefasDeMedicao({
          datas, acao: { descricao: descricao.trim() }, plano, responsavel_id, requester_id, detalhe,
          pdcaContext: { ...pdcaContext, medicao: true },
        });
      } catch (e) {
        registrarLog('criar_acao_pdca', 'acoes_pdca', 'erro', { company: plano.company, user_id: requester_id, rota: req.originalUrl, erro: e.message });
        acao.aviso = 'A ação foi salva, mas as tarefas de medição não foram criadas. Abra a ação e salve de novo.';
      }
    } else if (ehRotina(acao)) {
      // Rotina: uma tarefa por data (lib/planoAcao/).
      try {
        await sincronizarRotina(acao, { plano, requesterId: requester_id });
      } catch (e) {
        registrarLog('criar_acao_pdca', 'acoes_pdca', 'erro', { company: plano.company, user_id: requester_id, rota: req.originalUrl, erro: `rotina: ${e.message}` });
        acao.aviso = 'A ação foi salva, mas as tarefas das datas não foram criadas. Abra a ação e salve de novo.';
      }
    } else {
      const { data: tarefa } = await supabase.from('tarefas').insert({
        company: plano.company,
        title: partirAcao(descricao).titulo,
        description: descricaoDaTarefa(plano.titulo, detalhe, partirAcao(descricao).corpo),
        assigned_to: responsavel_id,
        // A tarefa aparece a partir do INÍCIO, não do prazo final: a pessoa
        // precisa ver o que fazer enquanto dá tempo de fazer.
        due_date: inicio || prazo,
        priority: 'normal',
        recorrencia: RECORRENCIAS.includes(recorrencia) ? recorrencia : 'nenhuma',
        dias_semana: recorrencia === 'dias_semana' ? limparDiasSemana(dias_semana) : null,
        tags: ['plano_acao'],
        created_by: requester_id,
        pdca_context: { ...pdcaContext, repetir_ate: prazo },
        status: 'pendente',
      }).select('id').single();
      tarefaId = tarefa?.id || null;
    }

    if (tarefaId) {
      await supabase.from('acoes_pdca').update({ tarefa_id: tarefaId }).eq('id', acao.id);
      acao.tarefa_id = tarefaId;
    }
  }

  res.json(acao);
});

// PUT /api/pdca/acoes/:id  — ANTES de PUT /:id para não conflitar
router.put('/acoes/:id', async (req, res) => {
  const { requester_id, descricao, responsavel_id, prazo, concluida, criar_tarefa, inicio, recorrencia, dias_semana, aplicar_grupo, detalhe, datas_medicao, grupo_id } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const { data: acaoAtual } = await supabase
    .from('acoes_pdca')
    .select('*, plano:plano_id(*)')
    .eq('id', req.params.id).single();
  if (!acaoAtual) return res.status(404).json({ error: 'Ação não encontrada' });

  // Só o círculo de "feito" (concluir/reabrir): também o RESPONSÁVEL pela
  // ação. Qualquer outra mudança: quem criou o plano, ou admin/master.
  const soCirculo = Object.keys(req.body).every(k => ['requester_id', 'concluida', 'hoje_feita'].includes(k));
  const gere = await podeGerirPlano(requester_id, acaoAtual.plano);
  if (!gere) {
    const mesmaEmpresa = (await lojaPermitida(await perfilDe(requester_id), acaoAtual.plano?.company)) === acaoAtual.plano?.company;
    if (!(soCirculo && mesmaEmpresa && acaoAtual.responsavel_id === requester_id)) {
      return res.status(403).json({ error: NEGADO_PLANO });
    }
  }

  const updates = {};
  if (descricao !== undefined)    updates.descricao    = descricao.trim();
  if (responsavel_id !== undefined) updates.responsavel_id = responsavel_id || null;
  if (prazo !== undefined)        updates.prazo        = prazo || null;
  if (inicio !== undefined)       updates.inicio       = inicio || null;
  // Individual de propósito: `detalhe` NUNCA entra no que se aplica ao grupo.
  if (detalhe !== undefined)      updates.detalhe      = detalhe?.trim() || null;
  if (datas_medicao !== undefined) updates.datas_medicao = limparDatas(datas_medicao).length ? limparDatas(datas_medicao) : null;
  if (recorrencia !== undefined)  updates.recorrencia  = RECORRENCIAS.includes(recorrencia) ? recorrencia : 'nenhuma';
  if (recorrencia !== undefined || dias_semana !== undefined) {
    const repete = recorrencia !== undefined ? recorrencia : acaoAtual.recorrencia;
    updates.dias_semana = repete === 'dias_semana'
      ? limparDiasSemana(dias_semana !== undefined ? dias_semana : acaoAtual.dias_semana)
      : null;
  }
  if (criar_tarefa !== undefined) updates.criar_tarefa = criar_tarefa;
  // Uma ação que era de uma pessoa só vira grupo quando alguém acrescenta
  // mais gente na edição: sem receber o grupo aqui, as ações novas nasceriam
  // soltas e a tela mostraria dois cartões para a mesma ação.
  if (grupo_id !== undefined) updates.grupo_id = grupo_id || null;
  // ROTINA: o círculo do cartão é "a tarefa de HOJE" (decisão de 21/10/2026).
  // Ele encerrava a rotina inteira — e era usado justamente para registrar
  // "fiz a de hoje": três ações de líderes pararam assim. Agora marcar só
  // conclui (ou reabre) a tarefa de hoje; a ação continua aberta. Vale também
  // para quem ainda está com a tela antiga, que manda `concluida`. Encerrar
  // antes do prazo é mudar o prazo ou apagar a ação.
  const rotinaAtual = ehRotina(acaoAtual);
  const marcarHoje = rotinaAtual ? (req.body.hoje_feita !== undefined ? !!req.body.hoje_feita : concluida) : undefined;
  if (rotinaAtual) {
    if (acaoAtual.concluida && acaoAtual.prazo >= hojeBR()) { updates.concluida = false; updates.concluida_em = null; }
  } else if (concluida !== undefined) {
    // Medição do C: a verificação só fecha quando as medições até hoje
    // foram feitas. Fechar pelo círculo com datas pela frente era o jeito de
    // "concluir" medições que ainda não aconteceram (caso real, 22/10/2026).
    if (concluida && (acaoAtual.datas_medicao || []).length) {
      const { data: futuras } = await supabase.from('tarefas').select('due_date')
        .eq('pdca_context->>acao_id', req.params.id).in('status', ['pendente', 'em_andamento'])
        .gt('due_date', hojeBR()).order('due_date', { ascending: true }).limit(1);
      if (futuras?.length) {
        const [a, m, d] = futuras[0].due_date.split('-');
        return res.status(400).json({ error: `Ainda há medições pela frente (a próxima é em ${d}/${m}). Cada medição é concluída no dia dela.`, codigo: 'antes_do_dia' });
      }
    }
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

  // Sync tarefa vinculada quando concluida muda.
  //
  // Ação que SE REPETE é diferente: `tarefa_id` costuma apontar para a
  // PRIMEIRA ocorrência, de semanas atrás. Desmarcar reabria essa tarefa
  // velha (que aparecia como atrasada) e não trazia a de hoje. Agora:
  // concluir a ação fecha o que está em aberto dela e encerra a rotina;
  // desmarcar devolve a próxima data que a rotina manda.
  if (rotinaAtual && marcarHoje !== undefined) {
    const { data: deHoje } = await supabase.from('tarefas').select('id, status')
      .eq('pdca_context->>acao_id', req.params.id).eq('due_date', hojeBR()).maybeSingle();
    if (deHoje) {
      const agora = new Date().toISOString();
      await supabase.from('tarefas').update({
        status: marcarHoje ? 'concluida' : 'pendente', updated_at: agora,
        concluida_em: marcarHoje ? agora : null, concluida_por: marcarHoje ? requester_id : null,
      }).eq('id', deHoje.id);
      registrarLog(marcarHoje ? 'concluir_tarefa_pelo_plano' : 'reabrir_tarefa_pelo_plano', 'tarefas', 'sucesso', {
        company: acaoAtual.plano?.company, user_id: requester_id, depois: { tarefa_id: deHoje.id, acao_id: req.params.id },
      });
    }
    data.rotina_hoje = deHoje ? (marcarHoje ? 'concluida' : 'pendente') : null;
    // Ação que estava encerrada por engano volta a gerar as datas.
    if (updates.concluida === false) {
      await sincronizarRotina({ ...acaoAtual, ...updates, id: req.params.id }, { plano: acaoAtual.plano, requesterId: requester_id }).catch(() => null);
    }
  } else if (concluida !== undefined && acaoAtual.tarefa_id) {
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
  const finalDias       = finalRepete === 'dias_semana'
    ? limparDiasSemana(dias_semana !== undefined ? dias_semana : acaoAtual.dias_semana) : null;
  const plano           = acaoAtual.plano;
  // Verificação com datas combinadas é uma tarefa POR DATA. Tratá-la como
  // tarefa comum (uma só, com recorrência) fazia as duas coisas brigarem:
  // a tarefa da primeira data era reescrita com a recorrência da ação e
  // passava a se duplicar ao ser concluída.
  const datasFinais = acaoAtual.quadrante === 'C'
    ? limparDatas(datas_medicao !== undefined ? datas_medicao : acaoAtual.datas_medicao)
    : [];

  // A tarefa da ação acompanha a edição: atualiza o que existe, adota a
  // órfã e cria se não houver nenhuma viva. Mesma função usada para as
  // outras pessoas do grupo, mais abaixo.
  const mexeuNaTarefa = inicio !== undefined || prazo !== undefined || recorrencia !== undefined || dias_semana !== undefined
    || descricao !== undefined || detalhe !== undefined || criar_tarefa !== undefined || responsavel_id !== undefined;
  const acaoFinal = { ...acaoAtual, ...updates, id: req.params.id };
  if (!datasFinais.length && mexeuNaTarefa && ehRotina(acaoFinal)) {
    // Rotina: refaz só as datas futuras não feitas; o passado é registro.
    try {
      await sincronizarRotina(acaoFinal, { plano, requesterId: requester_id });
    } catch (e) {
      registrarLog('editar_acao_pdca', 'acoes_pdca', 'erro', { company: plano?.company, user_id: requester_id, rota: req.originalUrl, erro: `rotina: ${e.message}` });
      data.aviso = 'A ação foi salva, mas as tarefas das datas não foram atualizadas. Tente salvar de novo.';
    }
  } else if (!datasFinais.length && mexeuNaTarefa) {
    const novaId = await porTarefaEmDia({
      acao: { ...acaoAtual, id: req.params.id, responsavel_id: finalResponsavel },
      plano,
      descricao: descricao !== undefined ? descricao : acaoAtual.descricao,
      detalhe: detalhe !== undefined ? detalhe : acaoAtual.detalhe,
      repete: finalRepete, dias: finalDias,
      inicio: finalInicio, prazo: finalPrazo,
      criarTarefa: finalCriar, requesterId: requester_id,
    });
    if (novaId) data.tarefa_id = novaId;
  }

  // Refaz as tarefas de medição que ainda estão pendentes; as concluídas
  // ficam, são o registro do que foi medido. Roda também quando as datas
  // NÃO mudaram: é o que permite consertar uma ação cujas tarefas não
  // chegaram a nascer — basta abrir e salvar de novo.
  if (datasFinais.length && acaoAtual.quadrante === 'C' && finalCriar) {
    await limparTarefasDeMedicao(req.params.id);
    const respFinal = finalResponsavel;

    // SÓ AS DATAS QUE FICARAM SEM TAREFA.
    //
    // A limpeza acima apaga apenas as PENDENTES — as concluídas ficam, são o
    // registro do que foi medido. Mas a criação recriava a lista inteira, e
    // as datas já concluídas ganhavam uma segunda tarefa a cada vez que a
    // ação era salva. Quem salvou a ação três vezes ficou com a mesma
    // medição três vezes na lista.
    const { data: jaTem } = await supabase.from('tarefas')
      .select('due_date')
      .eq('pdca_context->>acao_id', req.params.id)
      .eq('pdca_context->>medicao', 'true');
    const comTarefa = new Set((jaTem || []).map(t => t.due_date));
    const datas = datasFinais.filter(d => !comTarefa.has(d));

    if (datas.length && respFinal) {
      const pdcaContext = {
        plano_id: acaoAtual.plano_id,
        plano_titulo: plano?.titulo,
        quadrante: acaoAtual.quadrante,
        quadrante_label: QUADRANTE_LABEL[acaoAtual.quadrante] || acaoAtual.quadrante,
        meta: plano?.meta,
        acao_id: req.params.id,
        medicao: true,
      };
      try {
        const primeira = await criarTarefasDeMedicao({
          datas, acao: { descricao: data.descricao }, plano, responsavel_id: respFinal,
          requester_id: await criadorDaAcao(req.params.id, plano, requester_id),
          detalhe: detalhe !== undefined ? detalhe : acaoAtual.detalhe, pdcaContext,
        });
        if (primeira) {
          await supabase.from('acoes_pdca').update({ tarefa_id: primeira }).eq('id', req.params.id);
          data.tarefa_id = primeira;
        }
      } catch (e) {
        registrarLog('editar_acao_pdca', 'acoes_pdca', 'erro', { company: plano?.company, user_id: requester_id, rota: req.originalUrl, erro: e.message });
        data.aviso = 'A ação foi salva, mas as tarefas de medição não foram criadas. Tente salvar de novo.';
      }
    }
  }

  // Ação de várias pessoas: o texto, o prazo e a repetição são os mesmos
  // para todo mundo — editar em uma tem que valer para todas, senão o
  // cartão único da tela mostraria uma versão e as tarefas, outra.
  // `concluida` NUNCA se propaga: cada pessoa conclui a sua.
  if (aplicar_grupo && acaoAtual.grupo_id) {
    const doGrupo = {};
    for (const campo of ['descricao', 'prazo', 'inicio', 'recorrencia', 'dias_semana', 'criar_tarefa']) {
      if (updates[campo] !== undefined) doGrupo[campo] = updates[campo];
    }
    if (Object.keys(doGrupo).length) {
      const { data: irmas } = await supabase.from('acoes_pdca')
        .select('id, tarefa_id, detalhe, responsavel_id')
        .eq('grupo_id', acaoAtual.grupo_id).neq('id', req.params.id);

      await supabase.from('acoes_pdca').update(doGrupo).eq('grupo_id', acaoAtual.grupo_id).neq('id', req.params.id);

      // As outras pessoas do grupo passam pela MESMA função. Antes havia
      // aqui uma versão mais pobre: pulava quem não tivesse `tarefa_id` e
      // nunca criava nada — então salvar a ação arrumava a tarefa de uma
      // líder, deixava a da outra no formato antigo e uma terceira sem
      // tarefa nenhuma.
      for (const irma of (irmas || [])) {
        const irmaFinal = { ...acaoAtual, ...doGrupo, id: irma.id, detalhe: irma.detalhe, responsavel_id: irma.responsavel_id, grupo_id: acaoAtual.grupo_id };
        if (ehRotina(irmaFinal)) {
          await sincronizarRotina(irmaFinal, { plano, requesterId: requester_id }).catch(() => null);
          continue;
        }
        await porTarefaEmDia({
          acao: { ...irma, plano_id: acaoAtual.plano_id, quadrante: acaoAtual.quadrante },
          plano,
          descricao: doGrupo.descricao !== undefined ? doGrupo.descricao : acaoAtual.descricao,
          // O texto comum vem de quem foi editado; a parte de cada um
          // continua sendo a da própria pessoa.
          detalhe: irma.detalhe,
          repete: finalRepete, dias: finalDias,
          inicio: finalInicio, prazo: finalPrazo,
          criarTarefa: finalCriar, requesterId: requester_id,
        });
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
    .select('tarefa_id, descricao, grupo_id, plano:plano_id(company, criado_por)').eq('id', req.params.id).single();
  if (!(await podeGerirPlano(requester_id, acao?.plano))) return res.status(403).json({ error: NEGADO_PLANO });

  // Apagar a ação de várias pessoas de uma vez: é um cartão só na tela, e
  // apagar linha por linha deixaria metade do grupo órfã.
  const apagarGrupo = req.query.grupo === '1' && acao?.grupo_id;
  let tarefasParaApagar = acao?.tarefa_id ? [acao.tarefa_id] : [];
  // Os ids têm que ser lidos ANTES do delete: depois as linhas não existem
  // mais e as tarefas de medição ficariam órfãs na lista das pessoas.
  let idsDasAcoes = [req.params.id];
  if (apagarGrupo) {
    const { data: irmas } = await supabase.from('acoes_pdca')
      .select('id, tarefa_id').eq('grupo_id', acao.grupo_id);
    tarefasParaApagar = (irmas || []).map(i => i.tarefa_id).filter(Boolean);
    idsDasAcoes = (irmas || []).map(i => i.id);
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
  // A medição do C tem várias tarefas (uma por data) e só uma delas está em
  // `tarefa_id` — as outras se encontram pelo vínculo com a ação.
  for (const idAcao of idsDasAcoes) {
    await supabase.from('tarefas').delete().eq('pdca_context->>acao_id', idAcao);
  }

  res.json({ ok: true });
});

// ── ASSISTENTE (IA) ─────────────────────────────────────────
// Sugere os 5 porquês, ações para o D ou uma revisão do plano. Só sugere:
// quem grava é a tela, quando o líder clica em "Usar". Regras do pedido e
// da resposta em lib/assistentePlano.js.
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// POST /api/pdca/:id/assistente  { modo: 'porques'|'acoes'|'revisar', rascunho? }
router.post('/:id/assistente', async (req, res) => {
  const userId = req.usuario?.id;
  if (!userId) return res.status(401).json({ error: 'Sessão expirada. Entre de novo.' });
  const { modo, rascunho } = req.body || {};
  if (!Assistente.MODOS.includes(modo)) return res.status(400).json({ error: 'Pedido inválido.' });

  const me = await perfilDe(userId);
  if (!me || !canManage(me)) return res.status(403).json({ error: 'Acesso negado' });
  const { data: plano } = await supabase.from('planos_acao').select('*').eq('id', req.params.id).maybeSingle();
  if (!plano) return res.status(404).json({ error: 'Plano não encontrado' });
  if ((await lojaPermitida(me, plano.company)) !== plano.company) return res.status(403).json({ error: 'Acesso negado' });

  const { data: acoes } = await supabase.from('acoes_pdca')
    .select('id, grupo_id, quadrante, descricao, responsavel_id, prazo, recorrencia, datas_medicao, concluida')
    .eq('plano_id', plano.id).order('criado_em', { ascending: true });

  const falta = Assistente.faltaParaUsar(modo, plano, acoes, rascunho);
  if (falta) return res.status(400).json({ error: falta });
  if (!Assistente.podeUsar(userId)) {
    return res.status(429).json({ error: `Você chegou ao limite de ${Assistente.USOS_POR_DIA} usos do assistente por hoje.` });
  }

  const pedido = Assistente.montarPedido(modo, plano, acoes, rascunho);
  const logBase = { company: plano.company, user_id: userId, rota: req.originalUrl };
  try {
    // `fallbacks: 'default'`: se o modelo estiver ocupado ou recusar por
    // engano, outro modelo responde na mesma chamada.
    // Esforço baixo: o custo de cada clique fica em centavos.
    const resposta = await anthropic.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: pedido.schema } },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: pedido.system,
      messages: [{ role: 'user', content: pedido.mensagem }],
    });

    if (resposta.stop_reason === 'refusal') {
      Assistente.devolverUso(userId);
      registrarLog('assistente_pdca', 'planos_acao', 'erro', { ...logBase, erro: `recusado: ${resposta.stop_details?.category || '?'}` });
      return res.status(422).json({ error: 'O assistente não conseguiu ajudar com este plano. Tente reescrever o problema.' });
    }
    if (resposta.stop_reason === 'max_tokens') {
      Assistente.devolverUso(userId);
      registrarLog('assistente_pdca', 'planos_acao', 'erro', { ...logBase, erro: 'resposta cortada (max_tokens)' });
      return res.status(502).json({ error: 'O assistente não terminou a resposta. Tente de novo.' });
    }

    const json = resposta.content.filter(b => b.type === 'text').map(b => b.text).join('');
    let bruto;
    try { bruto = JSON.parse(json); } catch { bruto = null; }
    if (!bruto) {
      Assistente.devolverUso(userId);
      registrarLog('assistente_pdca', 'planos_acao', 'erro', { ...logBase, erro: 'resposta fora do formato' });
      return res.status(502).json({ error: 'O assistente respondeu fora do formato. Tente de novo.' });
    }

    // O conteúdo do plano NÃO vai para o log: só o que foi pedido e o custo.
    registrarLog('assistente_pdca', 'planos_acao', 'sucesso', {
      ...logBase,
      depois: { plano_id: plano.id, modo, modelo: resposta.model, tokens_entrada: resposta.usage?.input_tokens, tokens_saida: resposta.usage?.output_tokens },
    });
    res.json({ modo, ...Assistente.arrumarResposta(modo, bruto) });
  } catch (e) {
    Assistente.devolverUso(userId);
    let status = 500;
    let msg = 'O assistente não respondeu agora. Tente de novo.';
    if (e instanceof Anthropic.RateLimitError) {
      status = 429; msg = 'O assistente está ocupado. Tente em um minuto.';
    } else if (e instanceof Anthropic.APIError) {
      status = 502; msg = 'O assistente está fora do ar agora. Tente mais tarde.';
    }
    registrarLog('assistente_pdca', 'planos_acao', 'erro', { ...logBase, erro: `${e?.status || ''} ${e?.message || e}`.trim() });
    res.status(status).json({ error: msg });
  }
});

module.exports = router;
