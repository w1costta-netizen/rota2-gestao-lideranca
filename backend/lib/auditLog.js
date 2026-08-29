const supabase = require('../supabase');

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
