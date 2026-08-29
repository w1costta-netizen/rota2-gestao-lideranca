import api from '../api';

// Manda pro log de auditoria um erro que aconteceu no navegador (gerar PDF,
// upload, render de tela...). Esses erros nunca chegavam ao servidor, então
// não apareciam em "Logs de Auditoria" — só no console do usuário.
//
// Nunca lança exceção: se o próprio envio do log falhar, isso não pode
// atrapalhar o fluxo de quem está usando o app.
export function reportError({ userId, acao, tabela, erro }) {
  try {
    const mensagem = erro?.message || erro?.name || String(erro || 'falha desconhecida');
    if (!userId || !mensagem) return;
    api.post('/logs/frontend', {
      requester_id: userId,
      status: 'falha',
      acao,
      tabela,
      rota: typeof window !== 'undefined' ? window.location.pathname : null,
      erro_mensagem: mensagem,
    }).catch(() => {});
  } catch {
    /* silencioso de propósito */
  }
}

// Registra uma ação bem-sucedida feita direto do navegador (ex.: importar
// estoque, que grava no Supabase sem passar pelo backend). Mesma regra:
// nunca lança exceção e a empresa é resolvida no servidor pelo perfil.
export function reportAction({ userId, acao, tabela, depois }) {
  try {
    if (!userId || !acao) return;
    api.post('/logs/frontend', {
      requester_id: userId,
      status: 'sucesso',
      acao,
      tabela,
      depois: depois ?? null,
    }).catch(() => {});
  } catch {
    /* silencioso de propósito */
  }
}
