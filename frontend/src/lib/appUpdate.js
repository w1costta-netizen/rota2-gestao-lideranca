// Recarregamento automático quando sai uma versão nova do app.
//
// A cada deploy os arquivos de código mudam de nome. Quem estava com o app
// aberto continua com a versão antiga na memória e, ao abrir uma tela que
// ainda não tinha carregado, pede um arquivo que não existe mais — o servidor
// responde com a página HTML e o navegador reclama que "não é JavaScript".
// O usuário via uma tela de erro sem entender o motivo.
//
// Aqui detectamos exatamente esse caso e recarregamos a página sozinho.

const CHAVE = 'rota_recarregou_por_versao';
const JANELA_MS = 30000; // não recarrega de novo dentro desse intervalo

const SINAIS = [
  'is not a valid javascript mime type',
  'failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'importing a module script failed',
  'unable to preload css',
  'failed to load module script',
  // Módulo que "carregou" vazio: é o que o React vê quando o Vite devolve
  // undefined no lugar do arquivo que não existe mais (ver abaixo).
  "reading 'default'",
  '_result.default',
  'módulo vazio',
];

// O erro é de "versão antiga em cache" e não um bug real da tela?
export function ehErroDeVersaoAntiga(erro) {
  const msg = String(erro?.message || erro || '').toLowerCase();
  return SINAIS.some(s => msg.includes(s));
}

// Recarrega uma única vez. O guarda é essencial: se o recarregamento não
// resolver (deploy realmente quebrado), sem ele a página entraria num laço
// infinito de refresh e ninguém conseguiria usar nem ler o erro.
export function recarregarPorVersaoNova() {
  try {
    const ultima = Number(sessionStorage.getItem(CHAVE) || 0);
    if (Date.now() - ultima < JANELA_MS) return false;
    sessionStorage.setItem(CHAVE, String(Date.now()));
  } catch {
    // Se o sessionStorage estiver bloqueado, não dá pra garantir o guarda
    // contra laço infinito — melhor não recarregar e deixar o erro na tela.
    return false;
  }
  window.location.reload();
  return true;
}

// O Vite avisa por este evento quando falha ao carregar um pedaço do app.
//
// NUNCA chamar e.preventDefault() aqui. Com o evento cancelado, o Vite não
// lança o erro: o import resolve com `undefined`, o React.lazy tenta ler
// `.default` de undefined e a pessoa vê "Algo deu errado" — foram 22
// falhas em 8 pessoas entre 01/09 e 18/09, quase nenhuma no horário de
// deploy. Deixando o erro seguir, o lazy() do App.jsx faz o que sabe:
// tenta de novo e recarrega. O evento fica só como reforço para imports
// fora do React (html2pdf, por exemplo).
export function monitorarVersaoNova() {
  window.addEventListener('vite:preloadError', (e) => {
    if (ehErroDeVersaoAntiga(e?.payload)) recarregarPorVersaoNova();
  });

  window.addEventListener('unhandledrejection', (e) => {
    if (ehErroDeVersaoAntiga(e?.reason)) recarregarPorVersaoNova();
  });
}
