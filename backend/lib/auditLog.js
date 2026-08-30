const supabase = require('../supabase');

// ─────────────────────────────────────────────────────────────
// ETAPA 5 — alerta de falha para quem cuida do sistema.
//
// Serve para descobrir problema de cliente sem depender de ele reclamar.
// A maior parte das pessoas não reclama: desiste calado e some.
//
// O controle de repetição é a parte crítica. Se algo quebrar em laço, sem
// freio o celular receberia centenas de avisos e a pessoa desligaria a
// notificação — justamente quando ela mais importa.
// ─────────────────────────────────────────────────────────────
const JANELA_MESMO_ERRO_MS = 15 * 60 * 1000; // no máximo 1 aviso por tipo a cada 15 min
const TETO_POR_HORA        = 8;              // teto geral, some o que for

const ultimoAlertaPorAcao = new Map();
let alertasNaHora = [];

const NAO_ALERTAR = new Set([
  // OBRIGATÓRIO. O alerta é entregue por push, e uma falha de envio de push
  // é registrada no log. Sem esta entrada, uma falha de envio dispararia um
  // alerta que também falharia, registrando outra falha... em laço infinito.
  'enviar_push',
]);

function podeAlertar(acao) {
  if (NAO_ALERTAR.has(acao)) return false;
  const agora = Date.now();

  alertasNaHora = alertasNaHora.filter(t => agora - t < 60 * 60 * 1000);
  if (alertasNaHora.length >= TETO_POR_HORA) return false;

  const ultimo = ultimoAlertaPorAcao.get(acao) || 0;
  if (agora - ultimo < JANELA_MESMO_ERRO_MS) return false;

  ultimoAlertaPorAcao.set(acao, agora);
  alertasNaHora.push(agora);
  return true;
}

async function alertarResponsaveis({ acao, company, user_id, erro }) {
  try {
    if (!podeAlertar(acao)) return;

    const { data: responsaveis } = await supabase
      .from('profiles').select('id')
      .in('access_level', ['master', 'suporte'])
      .eq('active', true);

    // Quem causou o erro não precisa ser avisado: ele viu na própria tela.
    const ids = (responsaveis || []).map(r => r.id).filter(id => id !== user_id);
    if (!ids.length) return;

    let quem = '';
    if (user_id) {
      const { data: p } = await supabase.from('profiles').select('full_name').eq('id', user_id).maybeSingle();
      quem = p?.full_name ? ` · ${p.full_name}` : '';
    }

    // O require vai aqui dentro, e não no topo, para quebrar a dependência
    // circular: lib/notificacoes importa este arquivo para registrar log.
    const { enviarPush } = require('./notificacoes');
    await enviarPush(
      ids,
      `⚠️ Falha no app${company ? ' · ' + company : ''}`,
      `${acao}${quem}: ${String(erro || '').slice(0, 90)}`,
      'geral',
      { company },
    );
  } catch (e) {
    // Alerta nunca pode atrapalhar o log nem a ação do usuário.
    console.error('[auditLog] falha ao alertar responsáveis:', e.message);
  }
}

// ─────────────────────────────────────────────────────────────
// Função central de log de auditoria.
// Todo módulo do app registra por aqui — assim o formato é único
// e não depende de cada rota implementar do zero.
//
//   registrarLog('criar_tarefa', 'tarefas', 'sucesso', { user_id, company, depois })
//   registrarLog('criar_tarefa', 'tarefas', 'erro',    { user_id, company, rota, erro })
//
// Nunca lança exceção: falhar ao gravar log não pode derrubar a
// operação que o usuário estava fazendo.
// ─────────────────────────────────────────────────────────────
async function registrarLog(acao, tabela, status, detalhes = {}) {
  const { user_id, company, antes, depois, rota, erro } = detalhes;
  try {
    const ehErro = status === 'erro' || status === 'falha';
    await supabase.from('audit_logs').insert({
      company: company || null,
      user_id: user_id || null,
      // 'falha' é o valor que o restante do sistema (filtros da tela de
      // Logs) já espera para erros — 'erro' é aceito como sinônimo.
      status: ehErro ? 'falha' : 'sucesso',
      acao: acao ? String(acao).slice(0, 80) : 'acao_desconhecida',
      tabela: tabela ? String(tabela).slice(0, 80) : null,
      antes: antes ?? null,
      depois: depois ?? null,
      rota: rota ? String(rota).slice(0, 200) : null,
      erro_mensagem: ehErro ? String(erro?.message || erro || '').slice(0, 500) : null,
    });

    // Avisa quem cuida do sistema. Sem await de propósito: o alerta não pode
    // segurar a resposta da ação que o usuário está fazendo.
    if (ehErro) {
      alertarResponsaveis({ acao, company, user_id, erro: erro?.message || erro });
    }
  } catch (e) {
    console.error('[auditLog] falha ao registrar:', e.message);
  }
}

// Atalhos usados na maior parte do código. Mantidos porque já existem
// dezenas de chamadas espalhadas — ambos caem no registrarLog acima.
async function logAction({ company, user_id, acao, tabela, antes, depois }) {
  return registrarLog(acao, tabela, 'sucesso', { company, user_id, antes, depois });
}

async function logError({ company, user_id, acao, tabela, rota, erro_mensagem }) {
  return registrarLog(acao || 'erro', tabela, 'erro', { company, user_id, rota, erro: erro_mensagem });
}

module.exports = { registrarLog, logAction, logError };
