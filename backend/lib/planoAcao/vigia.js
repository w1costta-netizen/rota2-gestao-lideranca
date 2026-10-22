// ─────────────────────────────────────────────────────────────
// O VIGIA DO PLANO DE AÇÃO (22/10/2026).
//
// Pedido do usuário depois dos casos Joseane, Maristela e Alice: "muita
// atenção com essa parte e evitar que aconteçam falhas novamente". Em vez
// de esperar um líder reclamar, o próprio app confere todo dia (no
// agendamento das 6h, depois de virar o dia) se as tarefas do plano estão
// como o plano manda — e, se não estiverem, registra nos Logs de Auditoria
// como falha, o que avisa o master no celular.
//
// Confere, em cada empresa:
//   1. rotina que tem dia hoje e está sem a tarefa de hoje;
//   2. medição do C com data de hoje em diante e sem tarefa;
//   3. rotina marcada como concluída com datas ainda pela frente;
//   4. rotina ou medição concluída ANTES do próprio dia (nos últimos 2 dias).
// Não conserta nada: só aponta. Consertar é trabalho do garantirTarefas…,
// e um vigia que conserta esconderia o defeito que precisa ser achado.
// ─────────────────────────────────────────────────────────────
const supabase = require('../../supabase');
const { hojeBR } = require('../recorrencia');
const { ehRotina, rotinaAtiva, datasDaRotina, ultimaDataDaRotina } = require('./rotina');

const dm = (ymd) => (ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}` : '');
const diaBR = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const curto = (t) => String(t || '').split('\n')[0].slice(0, 45);

async function vigiarEmpresa(company) {
  const problemas = [];
  const hoje = hojeBR();
  const { data: planos } = await supabase.from('planos_acao').select('*').eq('company', company).neq('status', 'concluido');
  if (!planos?.length) return problemas;
  const porPlano = Object.fromEntries(planos.map(p => [p.id, p]));

  const { data: acoes } = await supabase.from('acoes_pdca').select('*').in('plano_id', planos.map(p => p.id));
  if (!acoes?.length) return problemas;
  const ids = acoes.map(a => a.id);

  const desde = (() => { const d = new Date(hoje + 'T12:00:00'); d.setDate(d.getDate() - 2); return d.toISOString().split('T')[0]; })();
  const { data: tarefas } = await supabase.from('tarefas')
    .select('due_date, status, concluida_em, pdca_context')
    .in('pdca_context->>acao_id', ids).gte('due_date', desde);
  const existe = new Set((tarefas || []).map(t => `${t.pdca_context?.acao_id}|${t.due_date}`));

  const respIds = [...new Set(acoes.map(a => a.responsavel_id).filter(Boolean))];
  const { data: pessoas } = respIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', respIds)
    : { data: [] };
  const nome = Object.fromEntries((pessoas || []).map(p => [p.id, p.full_name]));
  const quem = (a) => nome[a.responsavel_id] || 'sem responsável';

  for (const a of acoes) {
    const plano = porPlano[a.plano_id];
    // 1 e 3: rotina
    if (ehRotina(a)) {
      const puladas = new Set(a.datas_puladas || []);
      if (rotinaAtiva(a, plano) && datasDaRotina(a, hoje, hoje).length && !puladas.has(hoje) && !existe.has(`${a.id}|${hoje}`)) {
        problemas.push(`Rotina sem a tarefa de hoje: "${curto(a.descricao)}" (${quem(a)})`);
      }
      if (a.concluida && (ultimaDataDaRotina(a) || '') > hoje) {
        problemas.push(`Rotina concluída com datas pela frente: "${curto(a.descricao)}" (${quem(a)})`);
      }
    }
    // 2: medição do C
    if ((a.datas_medicao || []).length && a.criar_tarefa !== false && a.responsavel_id && !a.concluida) {
      for (const d of a.datas_medicao) {
        if (d >= hoje && !existe.has(`${a.id}|${d}`)) {
          problemas.push(`Medição de ${dm(d)} sem tarefa: "${curto(a.descricao)}" (${quem(a)})`);
        }
      }
    }
  }

  // 4: concluída antes do dia
  const porAcao = Object.fromEntries(acoes.map(a => [a.id, a]));
  for (const t of tarefas || []) {
    const marcada = t.pdca_context?.rotina || t.pdca_context?.medicao;
    if (!marcada || t.status !== 'concluida' || !t.concluida_em) continue;
    const quando = diaBR(t.concluida_em);
    if (quando < t.due_date && quando >= desde) {
      const a = porAcao[t.pdca_context.acao_id];
      problemas.push(`Concluída antes do dia: tarefa de ${dm(t.due_date)} marcada em ${dm(quando)} ("${curto(a?.descricao)}", ${a ? quem(a) : '?'})`);
    }
  }
  return problemas;
}

module.exports = { vigiarEmpresa };
