// ─────────────────────────────────────────────────────────────
// CAMINHO DOS ARQUIVOS DE EVIDÊNCIA
//
// Todo arquivo mora dentro da pasta da loja: `<loja>/relatorios/...`.
// É isso, e só isso, que o banco tem para conferir na hora de decidir se
// alguém pode abrir o arquivo — sem a loja no caminho não existe regra
// possível, e era por isso que as fotos de todas as empresas ficavam
// abertas para qualquer um.
//
// O que se guarda no banco é o CAMINHO, nunca o endereço de internet:
// quem transforma caminho em link é o servidor, depois de conferir de
// quem é o dado (backend/lib/arquivos.js).
// ─────────────────────────────────────────────────────────────

// A MESMA conta existe em backend/lib/arquivos.js e na política do banco.
// Mantenha boba: só a barra sai, porque barra criaria uma pasta a mais e
// a loja perderia o próprio arquivo. Nada de acento, maiúscula ou espaço —
// qualquer conversa mais esperta entre JavaScript e SQL descasaria algum
// dia, e descasar aqui é alguém sem acesso à própria foto.
export function pastaDaLoja(company) {
  return String(company || '').replace(/\//g, '-');
}

export function caminhoDaLoja(company, resto) {
  const pasta = pastaDaLoja(company);
  if (!pasta) throw new Error('Sem loja definida para guardar o arquivo.');
  return `${pasta}/${resto}`;
}
