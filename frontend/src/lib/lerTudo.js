// O Supabase devolve no máximo 1.000 linhas por consulta, em silêncio: uma
// tabela com 8.000 itens de venda vinha com 1.000 e ninguém era avisado.
// Lê em páginas até acabar. `montar` devolve a consulta já filtrada e
// ordenada (a ordem precisa ser estável para as páginas não se repetirem).
export async function lerTudo(montar, passo = 1000) {
  const tudo = [];
  for (let de = 0; ; de += passo) {
    const { data, error } = await montar().range(de, de + passo - 1);
    if (error) throw error;
    tudo.push(...(data || []));
    if (!data || data.length < passo) return tudo;
  }
}
