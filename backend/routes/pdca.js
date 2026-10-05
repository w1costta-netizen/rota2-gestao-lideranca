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
const RECORRENCIAS = ['nenhuma', 'diaria', 'dias_semana', 'semanal', 'quinzenal', 'mensal'];

// 0 = domingo ... 6 = sábado. Mesma numeração do JavaScript, para não
// precisar converter em lugar nenhum — converter dia da semana é fonte
// clássica de erro de um dia.
const limparDiasSemana = (ds) => {
  const limpos = [...new Set((Array.isArray(ds) ? ds : []).map(Number))]
    .filter(n => Number.isInteger(n) && n >= 0 && n <= 6).sort();
  return limpos.length ? limpos : null;
};

// O que a pessoa lê na tarefa dela. O título é a ação (igual para o grupo);
// a parte individual entra aqui, que é onde ela trabalha.
// Datas de medição do C: uma tarefa por data, todas criadas de uma vez.
//
// Com repetição, só existia a PRIMEIRA tarefa — a seguinte nascia quando a
// pessoa concluía a anterior. Quem não concluía nunca via as próximas, e o
// gestor não tinha onde conferir o calendário da coleta.
function limparDatas(datas) {
  if (!Array.isArray(datas)) return [];
  const so = datas
    .filter(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  // Teto de segurança: uma lista enorme viraria centenas de tarefas na mão
  // de uma pessoa só.
  return [...new Set(so)].slice(0, 60);
}

async function criarTarefasDeMedicao({ datas, acao, plano, responsavel_id, requester_id, detalhe, pdcaContext }) {
  const linhas = datas.map(data => ({
    company: plano?.company,
    title: partirAcao(acao.descricao).titulo,
    description: descricaoDaTarefa(plano?.titulo, detalhe, partirAcao(acao.descricao).corpo),
    assigned_to: responsavel_id,
    due_date: data,
    priority: 'normal',
    recorrencia: 'nenhuma',
    tags: ['plano_acao'],
    created_by: requester_id,
    pdca_context: pdcaContext,
    status: 'pendente',
  }));
  if (!linhas.length) return null;
  // O erro AQUI era engolido. Como as tarefas antigas já foram apagadas
  // logo antes, uma falha deixava a pessoa com zero tarefas e nenhuma
  // mensagem em lugar nenhum — o cartão continuava dizendo "0 de 6
  // medições" e ninguém tinha como saber que deu errado.
  const { data: criadas, error } = await supabase.from('tarefas').insert(linhas).select('id');
  if (error) {
    const e = new Error(`Não foi possível criar as tarefas de medição: ${error.message}`);
    e.medicao = true;
    throw e;
  }
  return (criadas || [])[0]?.id || null;
}

// Apaga as tarefas de medição desta ação que ainda estão pendentes. O que a
// pessoa já concluiu fica: é registro do que aconteceu.
async function limparTarefasDeMedicao(acaoId) {
  if (!acaoId) return;
  // Só as de medição: o filtro apagava QUALQUER tarefa pendente da ação,
  // inclusive uma tarefa comum criada segundos antes na mesma requisição.
  await supabase.from('tarefas').delete()
    .eq('pdca_context->>acao_id', acaoId)
    .eq('pdca_context->>medicao', 'true')
    .eq('status', 'pendente');
}

// Os quadrantes estruturados guardam a ação como um texto com rótulos
// ("Onde:", "Como:", "Por quê:"...). Esse texto inteiro virava o TÍTULO da
// tarefa — um parágrafo de seis linhas onde devia haver um título. Aqui ele
// é partido: a primeira linha (o "o quê") vira o título; o resto desce para
// a descrição, cada rótulo na sua linha.
const ROTULOS_ACAO = /^(Onde|Como|Por quê|Quanto custa|Comunicação|Treinamento|Monitoramento|Resultado observado|Problema|Meta|Causa raiz \(5 Porquês\)):/;

function partirAcao(descricao) {
  let linhas = String(descricao || '').split('\n');
  // No C a primeira linha é a classificação (emoji + rótulo em maiúsculas):
  // é estado da verificação, não o nome do que precisa ser feito.
  if (linhas.length > 1 && /^(✅|⚠️|⏳)\s/.test(linhas[0].trim())) linhas = linhas.slice(1);
  if (!linhas.join('').trim()) return { titulo: 'Ação do plano', corpo: '' };

  const i = linhas.findIndex(l => ROTULOS_ACAO.test(l.trim()));
  const livre    = (i < 0 ? linhas : linhas.slice(0, i)).join('\n').trim();
  const rotulada = (i < 0 ? [] : linhas.slice(i)).join('\n').trim();

  // O título é a primeira linha do texto livre. Se a ação só tem partes
  // rotuladas, a primeira delas vira título — melhor que tarefa sem nome.
  const fonte  = (livre || rotulada).split('\n');
  const titulo = fonte[0].trim();
  const resto  = fonte.slice(1).join('\n').trim();
  return {
    // 120 é folgado para um título e curto o bastante para caber no cartão.
    titulo: titulo.length > 120 ? `${titulo.slice(0, 117)}...` : titulo,
    corpo: livre ? [resto, rotulada].filter(Boolean).join('\n') : resto,
  };
}

function descricaoDaTarefa(tituloPlano, detalhe, corpo) {
  const partes = [`Ação do Plano: ${tituloPlano}`];
  if (detalhe?.trim()) partes.push(`Sua parte: ${detalhe.trim()}`);
  if (corpo?.trim()) partes.push('', corpo.trim());
  return partes.join('\n');
}

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

  // Quantas medições já foram feitas em cada ação do C. É o que mostra o
  // andamento no cartão — a ação só fecha quando todas estiverem prontas.
  const comMedicao = (data || []).filter(a => (a.datas_medicao || []).length);
  if (comMedicao.length) {
    const { data: tarefas } = await supabase.from('tarefas')
      .select('status, pdca_context')
      .in('pdca_context->>acao_id', comMedicao.map(a => a.id));
    const feitas = {};
    for (const t of tarefas || []) {
      const id = t.pdca_context?.acao_id;
      if (!id) continue;
      if (!feitas[id]) feitas[id] = { total: 0, concluidas: 0 };
      feitas[id].total++;
      if (t.status === 'concluida') feitas[id].concluidas++;
    }
    for (const a of comMedicao) {
      a.medicoes_total = feitas[a.id]?.total ?? (a.datas_medicao || []).length;
      a.medicoes_feitas = feitas[a.id]?.concluidas || 0;
    }
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

  // Editou a ação: TODAS as tarefas em aberto dela acompanham.
  //
  // Antes isto atualizava só `acoes_pdca.tarefa_id`, ou seja, a PRIMEIRA
  // tarefa. Só que a recorrência cria a próxima ocorrência como linha nova,
  // e essa linha não fica ligada à ação. Resultado real: ao trocar o texto
  // e a repetição, a pessoa ficava com DUAS tarefas na tela — a atualizada
  // e um resto da versão anterior, ainda com o texto antigo e "Diária".
  //
  // Concluída não se mexe: é registro do que aconteceu.
  if (!datasFinais.length && (inicio !== undefined || prazo !== undefined || recorrencia !== undefined || descricao !== undefined || detalhe !== undefined)) {
    const { data: abertas } = await supabase.from('tarefas')
      .select('id, due_date, pdca_context')
      .eq('pdca_context->>acao_id', req.params.id)
      .neq('status', 'concluida');

    // Tarefa antiga pode ter perdido o pdca_context (a recorrência não o
    // copiava até o conserto de hoje). A referência da ação entra como rede
    // de segurança para alcançar essa.
    const ids = new Set((abertas || []).map(t => t.id));
    if (acaoAtual.tarefa_id) ids.add(acaoAtual.tarefa_id);

    if (ids.size) {
      const partida = partirAcao(descricao !== undefined ? descricao : acaoAtual.descricao);
      const base = {
        recorrencia: RECORRENCIAS.includes(finalRepete) ? finalRepete : 'nenhuma',
        dias_semana: finalDias,
        title: partida.titulo,
        description: descricaoDaTarefa(plano?.titulo, detalhe !== undefined ? detalhe : acaoAtual.detalhe, partida.corpo),
      };
      const novaData = finalInicio || finalPrazo;

      // O contexto é REMONTADO a partir da ação, não herdado da tarefa.
      // Assim a tarefa alcançada pela referência antiga — que pode ter
      // perdido o vínculo, porque a recorrência não o copiava — volta a
      // pertencer à ação em vez de continuar órfã. Sem isso, a criação
      // logo abaixo não a enxergaria e abriria uma SEGUNDA tarefa.
      const contexto = {
        plano_id: acaoAtual.plano_id,
        plano_titulo: plano?.titulo,
        quadrante: acaoAtual.quadrante,
        quadrante_label: QUADRANTE_LABEL[acaoAtual.quadrante] || acaoAtual.quadrante,
        meta: plano?.meta,
        acao_id: req.params.id,
        repetir_ate: finalPrazo || null,
      };

      for (const id of ids) {
        const atual = (abertas || []).find(t => t.id === id);
        const patch = { ...base, pdca_context: contexto };
        // A data só muda na tarefa que a ação referencia. Empurrar todas as
        // ocorrências em aberto para a mesma data juntaria todas no mesmo
        // dia — e é assim que nasce a duplicata que a tela mostra.
        if (id === acaoAtual.tarefa_id && novaData && atual?.due_date !== novaData) patch.due_date = novaData;
        await supabase.from('tarefas').update(patch).eq('id', id);
      }
    }
  }

  // CRIAR QUANDO NÃO HÁ TAREFA VIVA — e não só quando a ação nunca teve.
  //
  // A condição era `!acaoAtual.tarefa_id`. Mas a referência fica apontando
  // para linha apagada (ou para tarefa já concluída), e aí salvar a ação
  // não criava nada: a pessoa ficava SEM tarefa nenhuma e ninguém via o
  // problema. Caso real: duas líderes de um plano sem tarefa alguma, e uma
  // terceira sem nada no banco.
  const { data: vivas } = await supabase.from('tarefas')
    .select('id')
    .eq('pdca_context->>acao_id', req.params.id)
    .neq('status', 'concluida')
    .limit(1);
  const semTarefaViva = !vivas?.length;

  if (!datasFinais.length && finalCriar && finalResponsavel && finalPrazo && semTarefaViva) {
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
      title: partirAcao(data.descricao).titulo,
      description: descricaoDaTarefa(plano?.titulo, detalhe !== undefined ? detalhe : acaoAtual.detalhe, partirAcao(data.descricao).corpo),
      assigned_to: finalResponsavel,
      due_date: finalInicio || finalPrazo,
      priority: 'normal',
      recorrencia: RECORRENCIAS.includes(finalRepete) ? finalRepete : 'nenhuma',
      dias_semana: finalDias,
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
          requester_id, detalhe: detalhe !== undefined ? detalhe : acaoAtual.detalhe, pdcaContext,
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
        .select('id, tarefa_id, detalhe')
        .eq('grupo_id', acaoAtual.grupo_id).neq('id', req.params.id);

      await supabase.from('acoes_pdca').update(doGrupo).eq('grupo_id', acaoAtual.grupo_id).neq('id', req.params.id);

      // As tarefas das outras pessoas acompanham a mesma mudança.
      for (const irma of (irmas || [])) {
        if (!irma.tarefa_id) continue;
        const { data: t } = await supabase.from('tarefas')
          .select('due_date, pdca_context').eq('id', irma.tarefa_id).maybeSingle();
        const patch = {};
        // O título é o texto comum; a descrição mantém a parte de cada um
        // (por isso lê o `detalhe` da irmã, não o de quem foi editado).
        if (doGrupo.descricao !== undefined) {
          patch.title = partirAcao(doGrupo.descricao).titulo;
          patch.description = descricaoDaTarefa(plano?.titulo, irma.detalhe, partirAcao(doGrupo.descricao).corpo);
        }
        if (doGrupo.recorrencia !== undefined) {
          patch.recorrencia = doGrupo.recorrencia;
          // Os dias escolhidos fazem parte da repetição: propagar uma sem a
          // outra deixaria a tarefa das irmãs repetindo em dia errado.
          patch.dias_semana = finalDias;
        }
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

module.exports = router;
