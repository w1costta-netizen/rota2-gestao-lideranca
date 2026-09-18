const supabase = require('../supabase');

// ─────────────────────────────────────────────────────────────
// Análise de desempenho — da pessoa e da equipe.
//
// NADA É DIGITADO. Tudo sai do que o app já registra quando o trabalho
// acontece: log de auditoria, tarefas, agenda, plano de ação, atas,
// treinamentos, comunicados lidos, escala enviada, diário, estoque. Mesma
// filosofia dos Torneios — placar que depende de alguém alimentar dura até
// essa pessoa ficar ocupada.
//
// CADA DIMENSÃO VIRA UMA NOTA DE 0 A 100, transparente: a tela mostra os
// números que geraram a nota. Nota que não se explica não muda
// comportamento. Dimensão sem dado no período fica "sem dados" (null) e NÃO
// entra na média — quem não recebeu tarefa não pode ser punido por isso.
//
// AS SUGESTÕES SÃO REGRAS, não adivinhação: cada uma dispara com um número
// concreto, cita a prática de mercado que embasa e diz o próximo passo.
// O tom é de incentivo — o objetivo é a pessoa querer abrir o relatório
// de novo no mês seguinte, não escondê-lo.
// ─────────────────────────────────────────────────────────────

const DIMENSOES = {
  constancia:  { nome: 'Constância',        icone: '📆', peso: 1.5, desc: 'Dias em que usou o app de verdade' },
  tarefas:     { nome: 'Tarefas',           icone: '✅', peso: 2,   desc: 'Conclusão e prazo das tarefas atribuídas' },
  agenda:      { nome: 'Agenda',            icone: '📅', peso: 1,   desc: 'Planejamento da própria semana' },
  plano_acao:  { nome: 'Plano de ação',     icone: '🎯', peso: 1.5, desc: 'Ações do PDCA sob sua responsabilidade' },
  atas:        { nome: 'Atas de reunião',   icone: '🖋️', peso: 1,   desc: 'Atas criadas e assinadas em até 48h' },
  treinamentos:{ nome: 'Treinamentos',      icone: '🎓', peso: 1,   desc: 'Trilha de produtividade concluída' },
  comunicacao: { nome: 'Comunicação',       icone: '💬', peso: 1,   desc: 'Comunicados lidos, comentários e conversas' },
  operacao:    { nome: 'Operação',          icone: '🏬', peso: 1.5, desc: 'Diário, conferência de seção, flyers, Tour 4x4, caixas' },
  estoque:     { nome: 'Estoque',           icone: '📦', peso: 1,   desc: 'Importações e uso dos relatórios de estoque' },
  escala:      { nome: 'Escala',            icone: '📋', peso: 1,   desc: 'Escala trabalhada e enviada no prazo' },
};

// Ações do log que contam em cada dimensão. Uma ação nova entra aqui e
// pronto — sem consulta nova.
const ACOES_POR_DIM = {
  agenda:      ['criar_agenda', 'editar_agenda'],
  comunicacao: ['comentar_tarefa', 'comentar_comunicado', 'comentar_mural', 'comentar_ata', 'comentar_diario',
                'enviar_mensagem', 'reagir', 'marcar_comunicado_lido', 'marcar_mural_lido', 'criar_comunicado', 'criar_mural'],
  operacao:    ['criar_relato_diario', 'criar_conferencia', 'finalizar_conferencia', 'coletar_item_conferencia',
                'sinalizar_item_flyer', 'adicionar_foto_flyer', 'adicionar_foto_tour', 'salvar_caixas', 'adicionar_itens_flyer'],
  estoque:     ['importar_estoque', 'ler_flyer_ia'],
  escala:      ['salvar_escala', 'enviar_escala'],
  plano_acao:  ['criar_plano_pdca', 'criar_acao_pdca', 'editar_acao_pdca'],
  tarefas:     ['criar_tarefa', 'editar_tarefa'],
  atas:        ['criar_ata', 'assinar_ata'],
};
const TODAS_ACOES = [...new Set(Object.values(ACOES_POR_DIM).flat())];

const TOTAL_TREINAMENTOS = 7;

const diaDe   = (iso) => String(iso || '').slice(0, 10);
const fimDoDia = (data) => `${data}T23:59:59.999Z`;
const clamp   = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const pct     = (a, b) => (b > 0 ? a / b : 0);
const arred   = (v) => Math.round(v);

// Dias úteis Brasil-varejo: segunda a sábado. Domingo fica fora para a
// constância não punir a folga.
function diasUteis(de, ate) {
  let n = 0;
  const d = new Date(`${de}T12:00:00Z`);
  const fim = new Date(`${ate}T12:00:00Z`);
  while (d <= fim) { if (d.getUTCDay() !== 0) n++; d.setUTCDate(d.getUTCDate() + 1); }
  return Math.max(1, n);
}

function nivelDe(nota) {
  if (nota == null) return { chave: 'sem_dados', nome: 'Sem dados', cor: '#9ca3af' };
  if (nota >= 85) return { chave: 'referencia',  nome: 'Referência',   cor: '#16a34a' };
  if (nota >= 70) return { chave: 'consistente', nome: 'Consistente',  cor: '#2563eb' };
  if (nota >= 40) return { chave: 'no_caminho',  nome: 'No caminho',   cor: '#d97706' };
  return               { chave: 'construcao',  nome: 'Em construção', cor: '#dc2626' };
}

// ── Coleta: uma consulta por fonte, para o conjunto todo de ids ──────
async function coletar(company, ids, de, ate) {
  const inicio = `${de}T00:00:00.000Z`;
  const fim = fimDoDia(ate);
  const hoje = new Date().toISOString().slice(0, 10);
  // Dentro de .or() os valores vão sem hora: dois-pontos e 'T' dentro do
  // filtro composto do PostgREST são terreno escorregadio. Data pura +
  // "menor que o dia seguinte" cobre o mesmo intervalo.
  const depoisDoFim = new Date(`${ate}T12:00:00Z`); depoisDoFim.setUTCDate(depoisDoFim.getUTCDate() + 1);
  const ateExcl = depoisDoFim.toISOString().slice(0, 10);

  const [logs, tarefas, agendaCriada, agendaSemana, planos, acoes, atas, assinaturas,
         treinos, comunicados, lidos, submissoes, diario] = await Promise.all([
    supabase.from('audit_logs').select('user_id, acao, created_at')
      .eq('company', company).eq('status', 'sucesso').in('user_id', ids).in('acao', TODAS_ACOES)
      .gte('created_at', inicio).lte('created_at', fim).limit(50000),
    // Tarefas com prazo no período OU concluídas no período OU abertas e atrasadas.
    supabase.from('tarefas').select('id, assigned_to, created_by, due_date, status, updated_at, created_at, priority')
      .eq('company', company).in('assigned_to', ids)
      .or(`and(due_date.gte.${de},due_date.lte.${ate}),and(status.eq.concluida,updated_at.gte.${de},updated_at.lt.${ateExcl}),and(status.neq.concluida,due_date.lt.${hoje})`),
    supabase.from('agenda_items').select('id, created_by, week_start, time, lembrete_minutos')
      .eq('company', company).in('created_by', ids).gte('week_start', de).lte('week_start', ate),
    supabase.from('agenda_items').select('id, target_type, target_value, week_start')
      .eq('company', company).gte('week_start', de).lte('week_start', ate),
    supabase.from('planos_acao').select('id, criado_por, created_at')
      .eq('company', company).in('criado_por', ids).gte('created_at', inicio).lte('created_at', fim),
    supabase.from('acoes_pdca').select('id, responsavel_id, prazo, concluida, concluida_em, created_at, plano:plano_id(company)')
      .in('responsavel_id', ids)
      .or(`and(prazo.gte.${de},prazo.lte.${ate}),and(concluida.eq.true,concluida_em.gte.${de},concluida_em.lt.${ateExcl}),and(concluida.eq.false,prazo.lt.${hoje})`),
    supabase.from('atas_reuniao').select('id, criado_por, participantes, created_at')
      .eq('company', company).gte('created_at', inicio).lte('created_at', fim),
    supabase.from('ata_assinaturas').select('user_id, ata_id, assinado_em, atas_reuniao(created_at)')
      .in('user_id', ids).gte('assinado_em', inicio).lte('assinado_em', fim),
    supabase.from('progresso_produtividade').select('colaborador_id, treinamento_id, etapa_atual, total_etapas, concluido, concluido_em')
      .in('colaborador_id', ids),
    supabase.from('comunicados').select('id, created_at').eq('company', company)
      .gte('created_at', inicio).lte('created_at', fim),
    supabase.from('comunicados_lidos').select('user_id, comunicado_id, read_at, comunicados(created_at)')
      .in('user_id', ids).gte('read_at', inicio).lte('read_at', fim),
    supabase.from('schedule_submissions').select('user_id, year, month, submitted_at')
      .in('user_id', ids).gte('submitted_at', inicio).lte('submitted_at', fim),
    supabase.from('diario_bordo').select('user_id, data, created_at')
      .eq('company', company).in('user_id', ids).gte('data', de).lte('data', ate),
  ]);

  return {
    hoje,
    logs: logs.data || [], tarefas: tarefas.data || [],
    agendaCriada: agendaCriada.data || [], agendaSemana: agendaSemana.data || [],
    planos: planos.data || [], acoes: (acoes.data || []).filter(a => !a.plano || a.plano.company === company),
    atas: atas.data || [], assinaturas: assinaturas.data || [],
    treinos: treinos.data || [], comunicados: comunicados.data || [], lidos: lidos.data || [],
    submissoes: submissoes.data || [], diario: diario.data || [],
  };
}

// ── Análise de UMA pessoa a partir dos dados coletados ───────────────
function analisarPessoa(p, dados, de, ate) {
  const id = p.id;
  const uteis = diasUteis(de, ate);
  const meus = (arr, campo = 'user_id') => arr.filter(x => x[campo] === id);
  const logs = meus(dados.logs);
  const conta = (acoes) => logs.filter(l => acoes.includes(l.acao)).length;
  const dims = {};
  const insights = [];
  const add = (tipo, dimensao, texto) => insights.push({ tipo, dimensao, texto }); // tipo: forte | atencao | sugestao

  // Constância ──────────────────────────────────────────────────────
  const diasAtivos = new Set(logs.map(l => diaDe(l.created_at))).size;
  const txConst = pct(diasAtivos, uteis);
  dims.constancia = {
    nota: arred(clamp(txConst * 100)),
    indicadores: [
      { rotulo: 'Dias ativos', valor: diasAtivos, de: uteis },
      { rotulo: 'Ações registradas', valor: logs.length },
    ],
  };
  if (txConst >= 0.8) add('forte', 'constancia', `Presente em ${diasAtivos} de ${uteis} dias úteis. Constância é o que separa quem melhora de quem só tem semanas boas.`);
  else if (txConst >= 0.5) add('sugestao', 'constancia', `Usou o app em ${diasAtivos} de ${uteis} dias úteis. Um ritual de 5 minutos no início do turno (abrir Tarefas e Agenda) costuma levar isso a 80%+.`);
  else if (logs.length) add('atencao', 'constancia', `Só ${diasAtivos} dias ativos em ${uteis}. O que não é registrado não é acompanhado — comece pelo básico: anote o dia no Diário de Bordo ao fechar o turno.`);

  // Tarefas ─────────────────────────────────────────────────────────
  const t = meus(dados.tarefas, 'assigned_to');
  const noPeriodo = t.filter(x => x.due_date && x.due_date >= de && x.due_date <= ate);
  const concluidas = t.filter(x => x.status === 'concluida' && diaDe(x.updated_at) >= de && diaDe(x.updated_at) <= ate);
  const concluidasNoPrazo = concluidas.filter(x => x.due_date && diaDe(x.updated_at) <= x.due_date);
  const abertasAtrasadas = t.filter(x => x.status !== 'concluida' && x.due_date && x.due_date < dados.hoje);
  const vencidasNoPeriodo = noPeriodo.filter(x => x.due_date < dados.hoje);
  const vencidasConcluidas = vencidasNoPeriodo.filter(x => x.status === 'concluida');
  if (noPeriodo.length || concluidas.length || abertasAtrasadas.length) {
    const txConclusao = vencidasNoPeriodo.length ? pct(vencidasConcluidas.length, vencidasNoPeriodo.length) : (concluidas.length ? 1 : 0);
    const txPrazo = concluidas.filter(x => x.due_date).length
      ? pct(concluidasNoPrazo.length, concluidas.filter(x => x.due_date).length) : txConclusao;
    let nota = 60 * txConclusao + 40 * txPrazo;
    nota -= Math.min(30, abertasAtrasadas.length * 6);
    dims.tarefas = {
      nota: arred(clamp(nota)),
      indicadores: [
        { rotulo: 'Com prazo no período', valor: noPeriodo.length },
        { rotulo: 'Concluídas', valor: concluidas.length },
        { rotulo: 'No prazo', valor: concluidasNoPrazo.length, de: concluidas.filter(x => x.due_date).length },
        { rotulo: 'Abertas e atrasadas', valor: abertasAtrasadas.length, alerta: abertasAtrasadas.length > 0 },
        { rotulo: 'Criadas por você', valor: conta(['criar_tarefa']) },
      ],
    };
    if (abertasAtrasadas.length >= 3) add('atencao', 'tarefas', `${abertasAtrasadas.length} tarefas abertas com prazo vencido. Comece por elas: reagende com data real ou conclua — tarefa atrasada não some sozinha e pesa mais que qualquer outra métrica.`);
    else if (abertasAtrasadas.length) add('sugestao', 'tarefas', `Há ${abertasAtrasadas.length} tarefa atrasada em aberto. Regra dos 2 minutos: se resolve em 2 minutos, faça agora; senão, dê um prazo novo hoje.`);
    if (txPrazo >= 0.85 && concluidas.length >= 3) add('forte', 'tarefas', `${arred(txPrazo * 100)}% das tarefas concluídas dentro do prazo. Isso é confiabilidade — quem lidera sabe que pode contar com você.`);
    else if (concluidas.length >= 3 && txPrazo < 0.6) add('sugestao', 'tarefas', `Só ${arred(txPrazo * 100)}% concluídas no prazo. Prática que funciona: na segunda de manhã, olhe as tarefas da semana e bloqueie na Agenda o horário de cada uma (time blocking).`);
    if (conta(['criar_tarefa']) === 0 && noPeriodo.length) add('sugestao', 'tarefas', `Todas as suas tarefas foram criadas por outra pessoa. Quem também cria as próprias tarefas assume o próprio resultado — anote o que você mesmo se comprometeu a fazer.`);
  } else {
    dims.tarefas = { nota: null, indicadores: [{ rotulo: 'Tarefas no período', valor: 0 }] };
  }

  // Agenda ──────────────────────────────────────────────────────────
  const criados = meus(dados.agendaCriada, 'created_by');
  const destinados = dados.agendaSemana.filter(a =>
    a.target_type === 'geral' || (a.target_type === 'lider' && String(a.target_value || '').split(',').includes(id))
    || (a.target_type === 'setor' && a.target_value === p.sector));
  const semanas = Math.max(1, Math.round(uteis / 6));
  const comHorario = criados.filter(a => a.time).length;
  if (criados.length || destinados.length) {
    const porSemana = criados.length / semanas;
    let nota = clamp(porSemana / 3 * 70) + (criados.length ? 30 * pct(comHorario, criados.length) : 0);
    dims.agenda = {
      nota: arred(clamp(nota)),
      indicadores: [
        { rotulo: 'Itens que você criou', valor: criados.length },
        { rotulo: 'Por semana', valor: Math.round(porSemana * 10) / 10 },
        { rotulo: 'Com horário definido', valor: comHorario, de: criados.length },
        { rotulo: 'Compromissos recebidos', valor: destinados.length },
      ],
    };
    if (porSemana >= 3) add('forte', 'agenda', `Você planeja a própria semana: ${criados.length} itens na agenda no período. Planejar na véspera é o hábito nº 1 de quem tem o dia sob controle.`);
    else if (criados.length === 0) add('sugestao', 'agenda', `Você recebeu ${destinados.length} compromisso${destinados.length > 1 ? 's' : ''} mas não criou nenhum. Experimente: na sexta, coloque na agenda os 3 compromissos fixos da próxima semana (agora dá para repetir toda semana).`);
    else if (criados.length && pct(comHorario, criados.length) < 0.5) add('sugestao', 'agenda', `Metade dos seus itens de agenda está sem horário. Compromisso sem hora vira intenção — defina o horário e ligue o lembrete.`);
  } else {
    dims.agenda = { nota: null, indicadores: [{ rotulo: 'Itens no período', valor: 0 }] };
  }

  // Plano de ação (PDCA) ────────────────────────────────────────────
  const minhasAcoes = meus(dados.acoes, 'responsavel_id');
  const planosCriados = meus(dados.planos, 'criado_por').length;
  if (minhasAcoes.length || planosCriados) {
    const acConcluidas = minhasAcoes.filter(a => a.concluida);
    const acNoPrazo = acConcluidas.filter(a => a.prazo && a.concluida_em && diaDe(a.concluida_em) <= a.prazo);
    const acAtrasadas = minhasAcoes.filter(a => !a.concluida && a.prazo && a.prazo < dados.hoje);
    const vencidas = minhasAcoes.filter(a => a.prazo && a.prazo < dados.hoje);
    const txConc = vencidas.length ? pct(vencidas.filter(a => a.concluida).length, vencidas.length) : (acConcluidas.length ? 1 : 0.5);
    let nota = 70 * txConc + 30 * (acConcluidas.length ? pct(acNoPrazo.length, acConcluidas.length) : txConc);
    nota -= Math.min(30, acAtrasadas.length * 8);
    if (planosCriados) nota = Math.min(100, nota + 10);
    dims.plano_acao = {
      nota: arred(clamp(nota)),
      indicadores: [
        { rotulo: 'Ações sob sua responsabilidade', valor: minhasAcoes.length },
        { rotulo: 'Concluídas', valor: acConcluidas.length },
        { rotulo: 'No prazo', valor: acNoPrazo.length, de: acConcluidas.length },
        { rotulo: 'Atrasadas em aberto', valor: acAtrasadas.length, alerta: acAtrasadas.length > 0 },
        { rotulo: 'Planos que você criou', valor: planosCriados },
      ],
    };
    if (acAtrasadas.length) add('atencao', 'plano_acao', `${acAtrasadas.length} ação de plano vencida sem conclusão. PDCA só gira quando o "C" acontece: reveja o prazo ou registre o que travou — o plano precisa refletir a realidade.`);
    if (txConc >= 0.8 && acConcluidas.length >= 2) add('forte', 'plano_acao', `${acConcluidas.length} ações de plano concluídas. Você fecha o que planeja — é assim que plano de ação vira resultado.`);
    if (planosCriados >= 1) add('forte', 'plano_acao', `Criou ${planosCriados} plano(s) de ação. Dica de mercado: ações no formato SMART (o quê, quem, até quando, quanto) têm 2x mais chance de fechar.`);
  } else {
    dims.plano_acao = { nota: null, indicadores: [{ rotulo: 'Ações no período', valor: 0 }] };
  }

  // Atas ────────────────────────────────────────────────────────────
  const atasCriadas = meus(dados.atas, 'criado_por').length;
  const convidado = dados.atas.filter(a => (a.participantes || []).includes(id));
  const minhasAss = meus(dados.assinaturas);
  const assIds = new Set(minhasAss.map(a => a.ata_id));
  const assinadasDasConvidadas = convidado.filter(a => assIds.has(a.id)).length;
  const em48h = minhasAss.filter(a => a.atas_reuniao?.created_at && (new Date(a.assinado_em) - new Date(a.atas_reuniao.created_at)) <= 48 * 3600e3).length;
  if (atasCriadas || convidado.length || minhasAss.length) {
    let nota = convidado.length ? 60 * pct(assinadasDasConvidadas, convidado.length) : 60;
    nota += minhasAss.length ? 40 * pct(em48h, minhasAss.length) : (convidado.length ? 0 : 40);
    if (atasCriadas) nota = Math.min(100, nota + 10);
    dims.atas = {
      nota: arred(clamp(nota)),
      indicadores: [
        { rotulo: 'Reuniões em que participou', valor: convidado.length },
        { rotulo: 'Atas assinadas', valor: assinadasDasConvidadas, de: convidado.length },
        { rotulo: 'Assinadas em até 48h', valor: em48h, de: minhasAss.length },
        { rotulo: 'Atas que você criou', valor: atasCriadas },
      ],
    };
    const pendentes = convidado.length - assinadasDasConvidadas;
    if (pendentes > 0) add('sugestao', 'atas', `${pendentes} ata(s) aguardando sua assinatura. Assinar é o "de acordo" que fecha a reunião — sem ele, o combinado fica em aberto.`);
    if (minhasAss.length && pct(em48h, minhasAss.length) >= 0.8) add('forte', 'atas', `Assina as atas em até 48h. Reunião que fecha rápido gera ação rápida.`);
    if (atasCriadas >= 2) add('forte', 'atas', `${atasCriadas} atas criadas. Registrar decisões é o que faz a reunião valer o tempo de todo mundo.`);
  } else {
    dims.atas = { nota: null, indicadores: [{ rotulo: 'Reuniões no período', valor: 0 }] };
  }

  // Treinamentos (acumulado, não só do período) ─────────────────────
  const meusTreinos = meus(dados.treinos, 'colaborador_id');
  const concluidosT = meusTreinos.filter(x => x.concluido).length;
  const progressoT = meusTreinos.reduce((s, x) => s + Math.min(1, (x.etapa_atual || 0) / (x.total_etapas || 5)), 0);
  const noPeriodoT = meusTreinos.filter(x => x.concluido && x.concluido_em && diaDe(x.concluido_em) >= de && diaDe(x.concluido_em) <= ate).length;
  dims.treinamentos = {
    nota: arred(clamp(pct(progressoT, TOTAL_TREINAMENTOS) * 100)),
    indicadores: [
      { rotulo: 'Concluídos', valor: concluidosT, de: TOTAL_TREINAMENTOS },
      { rotulo: 'Concluídos no período', valor: noPeriodoT },
      { rotulo: 'Em andamento', valor: meusTreinos.filter(x => !x.concluido && x.etapa_atual > 0).length },
    ],
  };
  if (concluidosT >= TOTAL_TREINAMENTOS) add('forte', 'treinamentos', `Trilha de produtividade completa. Agora é aplicar: escolha uma técnica por semana e observe o efeito.`);
  else if (concluidosT === 0) add('sugestao', 'treinamentos', `Nenhum treinamento concluído ainda. São 7 módulos curtos — o primeiro leva 10 minutos e já muda como você organiza o dia.`);
  else if (noPeriodoT === 0) add('sugestao', 'treinamentos', `${concluidosT} de ${TOTAL_TREINAMENTOS} treinamentos feitos, nenhum neste período. Um por quinzena fecha a trilha sem pesar.`);

  // Comunicação ─────────────────────────────────────────────────────
  const meusLidos = meus(dados.lidos);
  const publicados = dados.comunicados.length;
  const lidosDoPeriodo = meusLidos.filter(l => dados.comunicados.some(c => c.id === l.comunicado_id)).length;
  const lidosNoDia = meusLidos.filter(l => l.comunicados?.created_at && diaDe(l.read_at) === diaDe(l.comunicados.created_at)).length;
  const comentarios = conta(['comentar_tarefa', 'comentar_comunicado', 'comentar_mural', 'comentar_ata', 'comentar_diario']);
  const mensagens = conta(['enviar_mensagem']);
  const reacoes = conta(['reagir']);
  if (publicados || comentarios || mensagens || reacoes) {
    let nota = publicados ? 60 * pct(lidosDoPeriodo, publicados) : 60;
    nota += Math.min(40, (comentarios * 4 + reacoes * 1.5 + Math.min(mensagens, 30) * 0.5));
    dims.comunicacao = {
      nota: arred(clamp(nota)),
      indicadores: [
        { rotulo: 'Comunicados lidos', valor: lidosDoPeriodo, de: publicados },
        { rotulo: 'Lidos no mesmo dia', valor: lidosNoDia },
        { rotulo: 'Comentários', valor: comentarios },
        { rotulo: 'Reações', valor: reacoes },
        { rotulo: 'Mensagens no chat', valor: mensagens },
      ],
    };
    if (publicados && pct(lidosDoPeriodo, publicados) < 0.7) add('atencao', 'comunicacao', `${publicados - lidosDoPeriodo} comunicado(s) não lidos de ${publicados}. Comunicado é a versão oficial do combinado — 2 minutos por dia mantêm você alinhado com a loja.`);
    else if (publicados && pct(lidosDoPeriodo, publicados) >= 0.9) add('forte', 'comunicacao', `Leu ${lidosDoPeriodo} de ${publicados} comunicados${lidosNoDia ? `, ${lidosNoDia} no mesmo dia` : ''}. Quem está informado decide melhor.`);
    if (comentarios === 0 && reacoes === 0 && publicados) add('sugestao', 'comunicacao', `Sem comentários nem reações no período. Um "visto, vou fazer" numa tarefa ou comunicado dá ao líder a confirmação que ele precisa — e economiza uma cobrança.`);
  } else {
    dims.comunicacao = { nota: null, indicadores: [{ rotulo: 'Comunicados no período', valor: 0 }] };
  }

  // Operação ────────────────────────────────────────────────────────
  const meuDiario = meus(dados.diario);
  const diarioNoDia = meuDiario.filter(d => diaDe(d.created_at) === d.data).length;
  const confFinal = conta(['finalizar_conferencia']);
  const confAbertas = conta(['criar_conferencia']);
  const itensConf = conta(['coletar_item_conferencia']);
  const flyers = conta(['sinalizar_item_flyer', 'adicionar_foto_flyer', 'adicionar_itens_flyer']);
  const tour = conta(['adicionar_foto_tour']);
  const caixas = conta(['salvar_caixas']);
  const totalOp = meuDiario.length + confFinal + confAbertas + itensConf + flyers + tour + caixas;
  if (totalOp) {
    const pontos = meuDiario.length * 4 + confFinal * 10 + confAbertas * 3 + Math.min(itensConf, 100) * 0.5 + Math.min(flyers, 60) * 1 + Math.min(tour, 40) * 1 + caixas * 4;
    const nota = clamp(pontos / (uteis * 2.5) * 100);
    dims.operacao = {
      nota: arred(nota),
      indicadores: [
        { rotulo: 'Relatos no Diário de Bordo', valor: meuDiario.length },
        { rotulo: 'Diário escrito no mesmo dia', valor: diarioNoDia, de: meuDiario.length },
        { rotulo: 'Conferências de seção finalizadas', valor: confFinal },
        { rotulo: 'Itens conferidos', valor: itensConf },
        { rotulo: 'Flyers / Tour 4x4', valor: flyers + tour },
        { rotulo: 'Análises de caixas', valor: caixas },
      ],
    };
    if (confAbertas > confFinal + 1) add('sugestao', 'operacao', `${confAbertas - confFinal} conferência(s) de seção abertas sem finalizar. Conferência só gera relatório quando finalizada — feche antes de abrir a próxima.`);
    if (meuDiario.length && pct(diarioNoDia, meuDiario.length) < 0.6) add('sugestao', 'operacao', `Parte dos relatos do Diário foi escrita dias depois. Escrever no dia preserva o detalhe — e é o detalhe que explica a venda da terça.`);
    if (nota >= 70) add('forte', 'operacao', `Operação registrada de forma consistente: ${totalOp} registros no período. É esse rastro que permite analisar a loja depois.`);
  } else {
    dims.operacao = { nota: null, indicadores: [{ rotulo: 'Registros de operação', valor: 0 }] };
  }

  // Estoque ─────────────────────────────────────────────────────────
  const importacoes = conta(['importar_estoque']);
  if (importacoes) {
    dims.estoque = {
      nota: arred(clamp(importacoes / semanas * 100)),
      indicadores: [
        { rotulo: 'Importações de estoque', valor: importacoes },
        { rotulo: 'Por semana', valor: Math.round(importacoes / semanas * 10) / 10 },
      ],
    };
    if (importacoes / semanas >= 1) add('forte', 'estoque', `Estoque atualizado toda semana. Ruptura só se combate com dado fresco — o relatório de Ruptura e Venda Perdida depende disso.`);
    else add('sugestao', 'estoque', `Importação de estoque abaixo de uma por semana. Uma extração toda segunda de manhã mantém o painel de ruptura confiável a semana inteira.`);
  } else {
    dims.estoque = { nota: null, indicadores: [{ rotulo: 'Importações no período', valor: 0 }] };
  }

  // Escala ──────────────────────────────────────────────────────────
  const minhasSub = meus(dados.submissoes);
  const noPrazoEsc = minhasSub.filter(s => new Date(s.submitted_at).getUTCDate() <= 26).length;
  const trabalhouEscala = conta(['salvar_escala']);
  if (minhasSub.length || trabalhouEscala) {
    let nota = minhasSub.length ? 50 + 50 * pct(noPrazoEsc, minhasSub.length) : 30;
    dims.escala = {
      nota: arred(clamp(nota)),
      indicadores: [
        { rotulo: 'Escalas enviadas', valor: minhasSub.length },
        { rotulo: 'Enviadas até o dia 26', valor: noPrazoEsc, de: minhasSub.length },
        { rotulo: 'Vezes que trabalhou na escala', valor: trabalhouEscala },
      ],
    };
    if (minhasSub.length && noPrazoEsc === minhasSub.length) add('forte', 'escala', `Escala enviada no prazo. A equipe planeja a vida com base nisso — entregar até o dia 26 é respeito com o time.`);
    else if (minhasSub.length) add('atencao', 'escala', `Escala enviada depois do dia 26. Comece a montar no dia 15: a Análise da escala aponta os erros de CLT antes de enviar.`);
    else add('sugestao', 'escala', `Trabalhou na escala mas não enviou no período. A escala só vale para a equipe depois de enviada — e o painel da loja só mostra quem está escalado a partir daí.`);
  } else {
    dims.escala = { nota: null, indicadores: [{ rotulo: 'Escalas no período', valor: 0 }] };
  }

  // Ninguém pode ter nota 0 por não ter registro nenhum: isso é "sem
  // dados", não "desempenho zero" — e é o que a equipe usa para saber quem
  // ainda não começou a usar o app.
  const semAtividade = !logs.length && !t.length && !minhasAcoes.length && !minhasAss.length
    && !meusTreinos.length && !minhasSub.length && !meuDiario.length && !criados.length;
  if (semAtividade) {
    Object.values(dims).forEach(d => { d.nota = null; });
    insights.length = 0;
  }

  // Nota geral: média ponderada só das dimensões com dado ───────────
  let somaPeso = 0, soma = 0;
  Object.entries(dims).forEach(([k, d]) => {
    if (d.nota == null) return;
    soma += d.nota * DIMENSOES[k].peso; somaPeso += DIMENSOES[k].peso;
  });
  const geral = somaPeso ? arred(soma / somaPeso) : null;

  // Incentivo de fechamento: sempre um, sempre concreto.
  const comNota = Object.entries(dims).filter(([, d]) => d.nota != null);
  const melhor = comNota.sort((a, b) => b[1].nota - a[1].nota)[0];
  const pior = comNota.filter(([, d]) => d.nota < 70).sort((a, b) => a[1].nota - b[1].nota)[0];
  let mensagem;
  if (geral == null) mensagem = 'Ainda não há registros suficientes neste período. Comece pequeno: uma tarefa criada, um relato no diário — a análise cresce com o uso.';
  else if (geral >= 85) mensagem = `Nota ${geral}: você é referência. Seu ponto mais forte é ${DIMENSOES[melhor[0]].nome}. Que tal ajudar um colega a chegar lá?`;
  else if (pior) mensagem = `Nota ${geral}. ${melhor[1].nota >= 60 ? 'Ponto forte' : 'Sua melhor dimensão'}: ${DIMENSOES[melhor[0]].nome} (${melhor[1].nota}). O maior ganho está em ${DIMENSOES[pior[0]].nome} (${pior[1].nota}) — uma única mudança ali move a nota geral.`;
  else mensagem = `Nota ${geral}: consistente em tudo o que tem dado. O próximo nível é constância: o mesmo padrão, toda semana.`;

  return {
    pessoa: { id, nome: p.full_name, setor: p.sector, cargo: p.role, avatar_url: p.avatar_url },
    periodo: { de, ate, diasUteis: uteis },
    geral, nivel: nivelDe(geral), mensagem,
    dimensoes: Object.fromEntries(Object.entries(dims).map(([k, d]) => [k, { ...DIMENSOES[k], ...d, nivel: nivelDe(d.nota) }])),
    insights,
  };
}

// ── Equipe: agregado + leitura para o líder ──────────────────────────
function analisarEquipe(analises, de, ate) {
  const medias = {};
  Object.keys(DIMENSOES).forEach(k => {
    const notas = analises.map(a => a.dimensoes[k]?.nota).filter(n => n != null);
    medias[k] = { ...DIMENSOES[k], nota: notas.length ? arred(notas.reduce((s, n) => s + n, 0) / notas.length) : null, pessoas: notas.length };
    medias[k].nivel = nivelDe(medias[k].nota);
  });
  const gerais = analises.map(a => a.geral).filter(n => n != null);
  const geral = gerais.length ? arred(gerais.reduce((s, n) => s + n, 0) / gerais.length) : null;

  const comNota = Object.entries(medias).filter(([, d]) => d.nota != null);
  const fortes = [...comNota].sort((a, b) => b[1].nota - a[1].nota).slice(0, 2);
  const fracas = [...comNota].sort((a, b) => a[1].nota - b[1].nota).slice(0, 2);

  const semDados = analises.filter(a => a.geral == null);
  const destaques = analises.filter(a => a.geral != null && a.geral >= 80).sort((a, b) => b.geral - a.geral).slice(0, 3);
  const apoio = analises.filter(a => a.geral != null && a.geral < 50).sort((a, b) => a.geral - b.geral).slice(0, 3);

  const insights = [];
  fortes.filter(([, d]) => d.nota >= 70).forEach(([k, d]) => insights.push({ tipo: 'forte', dimensao: k, texto: `${d.nome} é um ponto forte da equipe (média ${d.nota}). Reconheça em público — o que é reconhecido se repete.` }));
  fracas.filter(([, d]) => d.nota < 60).forEach(([k, d]) => {
    const dica = {
      constancia: 'Combine um ritual de abertura de turno: 5 minutos no app antes de ir para a área.',
      tarefas: 'Revise as tarefas atrasadas na reunião semanal, uma a uma. Tarefa sem dono ou sem prazo real não fecha.',
      agenda: 'Peça que cada líder coloque os 3 compromissos fixos da semana na agenda — agora dá para repetir semanalmente.',
      plano_acao: 'Cada ação do PDCA precisa de responsável e prazo. Sem isso o plano vira lista de desejos.',
      atas: 'Encerre toda reunião com a ata criada na hora e um prazo de 48h para as assinaturas.',
      treinamentos: 'Reserve 15 minutos por semana para um módulo de treinamento por pessoa.',
      comunicacao: 'Publique menos e melhor: comunicados curtos, com o que muda e até quando, aumentam a leitura.',
      operacao: 'Defina quem registra o Diário de Bordo em cada turno — o relato do dia não pode depender de lembrar.',
      estoque: 'Uma pessoa dona da importação semanal de estoque, toda segunda.',
      escala: 'Escala pronta no dia 20 e enviada até o dia 26 — use a Análise da escala antes de enviar.',
    }[k];
    insights.push({ tipo: 'atencao', dimensao: k, texto: `${d.nome} pede atenção (média ${d.nota}). ${dica}` });
  });
  if (semDados.length) insights.push({ tipo: 'sugestao', dimensao: 'constancia', texto: `${semDados.length} pessoa(s) sem nenhum registro no período: ${semDados.slice(0, 5).map(a => a.pessoa.nome.split(' ')[0]).join(', ')}${semDados.length > 5 ? '…' : ''}. Vale uma conversa: acesso, treinamento ou simplesmente não sabem o que registrar.` });
  if (destaques.length) insights.push({ tipo: 'forte', dimensao: 'geral', texto: `Destaques do período: ${destaques.map(a => `${a.pessoa.nome.split(' ')[0]} (${a.geral})`).join(', ')}. Considere um reconhecimento no Mural — custa zero e vale muito.` });
  if (apoio.length) insights.push({ tipo: 'atencao', dimensao: 'geral', texto: `Precisam de apoio: ${apoio.map(a => `${a.pessoa.nome.split(' ')[0]} (${a.geral})`).join(', ')}. Feedback 1:1 curto, com um combinado só, funciona melhor que cobrança geral.` });

  return {
    periodo: { de, ate },
    geral, nivel: nivelDe(geral), pessoas: analises.length,
    medias, insights,
    ranking: analises.map(a => ({
      pessoa: a.pessoa, geral: a.geral, nivel: a.nivel,
      notas: Object.fromEntries(Object.entries(a.dimensoes).map(([k, d]) => [k, d.nota])),
    })).sort((a, b) => (b.geral ?? -1) - (a.geral ?? -1)),
  };
}

module.exports = { DIMENSOES, coletar, analisarPessoa, analisarEquipe, nivelDe, diasUteis };
