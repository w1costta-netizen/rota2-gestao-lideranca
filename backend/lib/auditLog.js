const supabase = require('../supabase');

// Registra uma ação administrativa bem-sucedida (create/update/delete)
// Nunca lança erro — se o log falhar, não pode quebrar a operação principal.
async function logAction({ company, user_id, acao, tabela, antes, depois }) {
  try {
    await supabase.from('audit_logs').insert({
      company: company || null,
      user_id: user_id || null,
      status: 'sucesso',
      acao,
      tabela,
      antes: antes ?? null,
      depois: depois ?? null,
    });
  } catch (e) {
    console.error('[auditLog] falha ao registrar ação:', e.message);
  }
}

// Registra uma falha/erro (tentativa que não deu certo)
async function logError({ company, user_id, acao, tabela, rota, erro_mensagem }) {
  try {
    await supabase.from('audit_logs').insert({
      company: company || null,
      user_id: user_id || null,
      status: 'falha',
      acao: acao || 'erro',
      tabela: tabela || null,
      rota: rota || null,
      erro_mensagem: String(erro_mensagem || '').slice(0, 500),
    });
  } catch (e) {
    console.error('[auditLog] falha ao registrar erro:', e.message);
  }
}

module.exports = { logAction, logError };
