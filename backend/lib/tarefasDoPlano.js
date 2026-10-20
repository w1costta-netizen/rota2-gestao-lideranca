// ─────────────────────────────────────────────────────────────
// As tarefas que nascem do Plano de Ação.
//
// REGRA: quem manda na rotina é o PLANO. Se a ação diz "seg, qua e sex,
// de 01/10 a 30/11, responsável Fulana", a Fulana tem UMA TAREFA PARA CADA
// UMA DESSAS DATAS (decisão do usuário, 20/10/2026).
//
// O modelo anterior era uma linha só que "pulava" para a próxima data ao
// ser concluída. Qualquer coisa fora do roteiro quebrava a corrente:
// apagar, concluir pelo plano, deixar parada. Em dados reais, líderes
// ficaram de 07/10 a 20/10 sem tarefa nenhuma, e três ações apareciam
// "concluídas" com o prazo correndo. Por data, nada depende de nada:
//   • a tarefa de cada data existe por si (mantemos os próximos 14 dias
//     criados; a janela anda sozinha a cada dia);
//   • a data que passou sem ser feita vira "Não realizada" — sai da lista
//     do líder, fica no histórico do plano e no Desempenho;
//   • apagar uma data a guarda em `acoes_pdca.datas_puladas`, para ela não
//     voltar;
//   • editar a ação refaz só as datas futuras; o passado é registro.
// Vale para TODAS as empresas: é a regra do produto, não de uma loja.
// ─────────────────────────────────────────────────────────────
const supabase = require('../supabase');
const { nextDueDate, hojeBR } = require('./recorrencia');

const QUADRANTE_LABEL = { P: 'P — Planejar', D: 'D — Fazer', C: 'C — Checar', A: 'A — Agir' };

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

// O vínculo que a tarefa carrega. Sempre remontado a partir da ação, nunca
// herdado de outra tarefa — herdar foi como o vínculo se perdeu antes.
function contextoDaAcao(acao, plano, prazo) {
  return {
    plano_id: acao.plano_id,
    plano_titulo: plano?.titulo,
    quadrante: acao.quadrante,
    quadrante_label: QUADRANTE_LABEL[acao.quadrante] || acao.quadrante,
    meta: plano?.meta,
    acao_id: acao.id,
    repetir_ate: prazo || null,
  };
}

// A ação é uma ROTINA: se repete e não é a medição do C com datas
// combinadas (lá cada data já é uma tarefa, escolhida à mão).
const ehRotina = (acao) => !!acao && !!acao.recorrencia && acao.recorrencia !== 'nenhuma'
  && !(acao.datas_medicao || []).length;

// Gera tarefas: tem responsável e prazo, e ninguém encerrou a ação nem o plano.
const rotinaAtiva = (acao, plano) => ehRotina(acao) && !!plano
  && acao.criar_tarefa !== false && !!acao.responsavel_id && !!acao.prazo
  && !acao.concluida && plano.status !== 'concluido';

const JANELA_DIAS = 14;
const FECHADAS = ['concluida', 'nao_realizada'];
const somaDias = (ymd, n) => { const d = new Date(ymd + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().split('T')[0]; };
const diaDaSemana = (ymd) => new Date(ymd + 'T12:00:00').getDay();

// AS DATAS DA ROTINA entre `de` e `ate` (inclusive), nunca depois do prazo.
// Começa no início da ação e anda pela regra de repetição, para manter o
// ritmo: "toda segunda" cai sempre na segunda; quinzenal, no mesmo ciclo.
function datasDaRotina(acao, de, ate) {
  const ancora = acao.inicio || acao.prazo;
  if (!ancora || !acao.prazo) return [];
  const limite = ate && ate < acao.prazo ? ate : acao.prazo;
  let d = ancora;
  // Dias da semana: o início pode cair num dia não marcado; aí a primeira
  // data é o primeiro dia marcado a partir dele.
  if (acao.recorrencia === 'dias_semana') {
    const dias = (acao.dias_semana || []).map(Number);
    if (!dias.length) return [];
    if (!dias.includes(diaDaSemana(d))) d = nextDueDate(d, 'dias_semana', dias);
  }
  const out = [];
  for (let i = 0; d && d <= limite && i < 800; i++) {
    if (!de || d >= de) out.push(d);
    d = nextDueDate(d, acao.recorrencia, acao.dias_semana);
  }
  return out;
}
const ultimaDataDaRotina = (acao) => { const t = datasDaRotina(acao, null, acao.prazo); return t[t.length - 1] || null; };

// Tarefas paradas no passado viram "Não realizada" (opção B do usuário).
// Só as da rotina: tarefa comum e medição seguem como sempre.
async function encerrarVencidas(filtro) {
  let q = supabase.from('tarefas')
    .update({ status: 'nao_realizada', updated_at: new Date().toISOString() })
    .eq('pdca_context->>rotina', 'true')
    .in('status', ['pendente', 'em_andamento'])
    .lt('due_date', hojeBR());
  q = filtro.acaoId ? q.eq('pdca_context->>acao_id', filtro.acaoId) : q.eq('company', filtro.company);
  const { error } = await q;
  if (error) throw new Error(`encerrar vencidas: ${error.message}`);
}

// Apaga datas futuras ainda não feitas. Tarefa com comentário fica: é
// conversa de gente, e some só com decisão de alguém.
async function apagarFuturasPendentes(acaoId, manter, depoisDe) {
  let q = supabase.from('tarefas').select('id, due_date')
    .eq('pdca_context->>acao_id', acaoId).in('status', ['pendente', 'em_andamento']);
  q = depoisDe ? q.gt('due_date', depoisDe) : q.gte('due_date', hojeBR());
  const { data: futuras } = await q;
  const sair = (futuras || []).filter(t => !(manter && manter.has(t.due_date))).map(t => t.id);
  if (!sair.length) return 0;
  const { data: com } = await supabase.from('tarefa_comentarios').select('tarefa_id').in('tarefa_id', sair);
  const comConversa = new Set((com || []).map(c => c.tarefa_id));
  const ids = sair.filter(id => !comConversa.has(id));
  if (ids.length) await supabase.from('tarefas').delete().in('id', ids);
  return ids.length;
}

// PÕE A ROTINA DE UMA AÇÃO EM DIA. Pode ser chamada quantas vezes for:
// só cria o que falta e só apaga o que sobrou.
async function sincronizarRotina(acaoOuId, { plano: planoDado, requesterId } = {}) {
  let acao = acaoOuId;
  if (typeof acaoOuId === 'string') {
    const { data } = await supabase.from('acoes_pdca').select('*').eq('id', acaoOuId).maybeSingle();
    acao = data;
  }
  if (!ehRotina(acao)) return { criadas: 0 };
  let plano = planoDado;
  if (!plano) {
    const { data } = await supabase.from('planos_acao').select('*').eq('id', acao.plano_id).maybeSingle();
    plano = data;
  }
  if (!plano) return { criadas: 0 };
  const hoje = hojeBR();
  const contexto = { ...contextoDaAcao(acao, plano, acao.prazo), rotina: true };

  // 1. Tarefas no modelo antigo (uma linha que se repetia) passam para o
  //    novo: sem repetição própria e com a marca de rotina.
  await supabase.from('tarefas').update({ recorrencia: 'nenhuma', dias_semana: null })
    .eq('pdca_context->>acao_id', acao.id).neq('recorrencia', 'nenhuma');
  const { data: semMarca } = await supabase.from('tarefas').select('id, pdca_context')
    .eq('pdca_context->>acao_id', acao.id).is('pdca_context->>rotina', null);
  for (const t of semMarca || []) {
    await supabase.from('tarefas').update({ pdca_context: { ...(t.pdca_context || {}), rotina: true } }).eq('id', t.id);
  }

  // 2. O que passou sem ser feito vira "Não realizada".
  await encerrarVencidas({ acaoId: acao.id });

  if (!rotinaAtiva(acao, plano)) return { criadas: 0 };

  // 3. As datas que devem existir agora: de hoje a 14 dias, menos as que
  //    alguém apagou de propósito.
  const puladas = new Set(acao.datas_puladas || []);
  const desejadas = datasDaRotina(acao, hoje, somaDias(hoje, JANELA_DIAS)).filter(d => !puladas.has(d));

  // 4. Futuras que não batem mais com a regra (a ação foi editada) saem.
  await apagarFuturasPendentes(acao.id, new Set(desejadas));

  // 5. Futuras que ficam acompanham a ação: texto, responsável e vínculo.
  const partida = partirAcao(acao.descricao);
  const base = {
    title: partida.titulo,
    description: descricaoDaTarefa(plano.titulo, acao.detalhe, partida.corpo),
    assigned_to: acao.responsavel_id,
    pdca_context: contexto,
    recorrencia: 'nenhuma',
    dias_semana: null,
  };
  await supabase.from('tarefas').update(base)
    .eq('pdca_context->>acao_id', acao.id).gte('due_date', hoje).in('status', ['pendente', 'em_andamento']);

  // 6. Cria as datas que faltam.
  const { data: existentes } = await supabase.from('tarefas').select('due_date, created_by')
    .eq('pdca_context->>acao_id', acao.id).order('due_date', { ascending: true });
  const ja = new Set((existentes || []).map(t => t.due_date));
  const criador = existentes?.[0]?.created_by || requesterId || plano.criado_por;
  const linhas = desejadas.filter(d => !ja.has(d)).map(d => ({
    ...base, company: plano.company, created_by: criador, due_date: d,
    priority: 'normal', tags: ['plano_acao'], status: 'pendente',
  }));
  let criadas = 0;
  if (linhas.length) {
    const { error } = await supabase.from('tarefas').insert(linhas);
    if (!error) criadas = linhas.length;
    else if (error.code === '23505') {
      // Outra chamada criou alguma das datas no mesmo instante (o índice
      // único segura). Uma a uma, ignorando as que já existem.
      for (const l of linhas) {
        const r = await supabase.from('tarefas').insert(l);
        if (!r.error) criadas++;
        else if (r.error.code !== '23505') throw new Error(r.error.message);
      }
    } else throw new Error(error.message);
  }

  // 7. A ação aponta para a próxima tarefa em aberto (telas antigas usam).
  const { data: proxima } = await supabase.from('tarefas').select('id')
    .eq('pdca_context->>acao_id', acao.id).in('status', ['pendente', 'em_andamento'])
    .order('due_date', { ascending: true }).limit(1);
  if (proxima?.[0]) await supabase.from('acoes_pdca').update({ tarefa_id: proxima[0].id }).eq('id', acao.id);
  return { criadas };
}

// ENCERRAR A ROTINA ANTES DO PRAZO (concluir a ação no plano): as datas
// depois de hoje que ainda não foram feitas saem. Hoje e o passado ficam.
async function encerrarRotina(acaoId) {
  return apagarFuturasPendentes(acaoId, null, hojeBR());
}

// A EMPRESA INTEIRA — a rede de segurança e o "relógio" da rotina.
// Roda ao abrir as Tarefas (no máximo a cada 5 min por empresa) e no
// agendamento das 6h. Cada vez: encerra o que venceu, completa a janela
// de 14 dias de cada ação e fecha as ações cujo prazo já passou.
const INTERVALO_MS = 5 * 60 * 1000;
const ultimaVez = new Map();
const emAndamento = new Map();

async function garantirTarefasDaEmpresa(company, { forcar = false } = {}) {
  if (!company) return 0;
  if (emAndamento.has(company)) return emAndamento.get(company);
  if (!forcar && Date.now() - (ultimaVez.get(company) || 0) < INTERVALO_MS) return 0;
  ultimaVez.set(company, Date.now());

  const trabalho = (async () => {
    await encerrarVencidas({ company }).catch(e => console.error('[plano]', e.message));
    const { data: planos } = await supabase.from('planos_acao').select('*').eq('company', company);
    if (!planos?.length) return 0;
    const porId = Object.fromEntries(planos.map(p => [p.id, p]));
    const { data: acoes } = await supabase.from('acoes_pdca').select('*')
      .in('plano_id', planos.map(p => p.id)).neq('recorrencia', 'nenhuma');
    const hoje = hojeBR();
    let criadas = 0;
    for (const acao of (acoes || []).filter(ehRotina)) {
      try {
        // Prazo passado: a rotina acabou e a ação fecha no plano.
        if (acao.prazo && acao.prazo < hoje) {
          if (!acao.concluida) await supabase.from('acoes_pdca').update({ concluida: true, concluida_em: new Date().toISOString() }).eq('id', acao.id);
          continue;
        }
        if (!rotinaAtiva(acao, porId[acao.plano_id])) continue;
        criadas += (await sincronizarRotina(acao, { plano: porId[acao.plano_id] })).criadas;
      } catch (e) {
        console.error('[plano] rotina da ação', acao.id, e.message);
      }
    }
    return criadas;
  })();

  emAndamento.set(company, trabalho);
  try { return await trabalho; } finally { emAndamento.delete(company); }
}

module.exports = {
  QUADRANTE_LABEL, partirAcao, descricaoDaTarefa, contextoDaAcao,
  FECHADAS, ehRotina, datasDaRotina, ultimaDataDaRotina,
  sincronizarRotina, encerrarRotina, garantirTarefasDaEmpresa,
};
