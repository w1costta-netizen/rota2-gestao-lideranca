import api from '../api';

// Resumo do aparelho/navegador, anexado à mensagem de erro.
// Sem isso, um erro que só acontece no iPhone de uma pessoa é praticamente
// impossível de diagnosticar à distância. Não coleta nada pessoal — só o
// tipo de aparelho, o navegador e se está instalado como app.
function descreverDispositivo() {
  try {
    const ua = navigator.userAgent || '';
    const sistema =
      /iPhone|iPad|iPod/i.test(ua) ? 'iPhone/iPad' :
      /Android/i.test(ua)          ? 'Android' :
      /Windows/i.test(ua)          ? 'Windows' :
      /Mac OS X/i.test(ua)         ? 'Mac' : 'Outro';

    // A ordem importa: Edge e Opera também se dizem "Chrome" no user agent.
    const navegador =
      /Edg\//i.test(ua)                        ? 'Edge' :
      /OPR\/|Opera/i.test(ua)                  ? 'Opera' :
      /Chrome\//i.test(ua)                     ? 'Chrome' :
      /Firefox\//i.test(ua)                    ? 'Firefox' :
      /Safari\//i.test(ua)                     ? 'Safari' : 'Outro';

    const instalado = window.matchMedia?.('(display-mode: standalone)')?.matches
      || window.navigator.standalone === true;

    const tela = `${window.screen?.width || '?'}x${window.screen?.height || '?'}`;
    return `${sistema} · ${navegador} · ${instalado ? 'app instalado' : 'navegador'} · ${tela}`;
  } catch {
    return 'aparelho não identificado';
  }
}

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
      // O aparelho vai junto da mensagem para aparecer direto na lista de
      // logs, sem precisar perguntar ao usuário qual celular ele usa.
      erro_mensagem: `${mensagem} — [${descreverDispositivo()}]`,
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
