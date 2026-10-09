/* global __VERSAO_APP__ */

// ─────────────────────────────────────────────────────────────
// SAIU VERSÃO NOVA?
//
// Compara a etiqueta carimbada neste código (no build) com a que o
// servidor publica agora em /version.json. Diferente = alguém publicou
// depois que esta aba abriu. Ver vite.config.js.
//
// Só AVISA, nunca recarrega sozinho: recarregar no meio de uma escala
// sendo montada ou de um texto sendo digitado perde trabalho. A pessoa
// clica em "Atualizar" quando puder.
// ─────────────────────────────────────────────────────────────

export const VERSAO_APP = typeof __VERSAO_APP__ !== 'undefined' ? __VERSAO_APP__ : null;

// Em desenvolvimento não existe /version.json (ele só nasce no build), e
// qualquer falha de rede aqui — sem internet, servidor reiniciando — tem
// que dar "não sei", nunca "tem versão nova". Aviso falso ensina a pessoa
// a ignorar o aviso.
export async function saiuVersaoNova() {
  if (!VERSAO_APP) return false;
  try {
    const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return false;
    const tipo = r.headers.get('content-type') || '';
    // A hospedagem devolve o index.html (200) para qualquer caminho que não
    // existe. Sem esta checagem, isso viraria "versão diferente".
    if (!tipo.includes('json')) return false;
    const { versao } = await r.json();
    return typeof versao === 'string' && versao !== '' && versao !== VERSAO_APP;
  } catch {
    return false;
  }
}
