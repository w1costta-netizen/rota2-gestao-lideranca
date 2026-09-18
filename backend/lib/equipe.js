const supabase = require('../supabase');

// Cadeia de subordinação de uma pessoa: quem responde a ela
// (reports_to_list), quem responde a esses, e assim por diante. É a
// definição de "minha equipe" usada pela Análise de Desempenho e pelos
// Torneios — a regra do dono do produto é "cada um vê o seu e o dos seus
// subordinados", e a cadeia inteira é subordinada.
//
// Com proteção contra ciclo (A responde a B que responde a A).
async function cadeiaDeSubordinados(company, meId) {
  const { data } = await supabase.from('profiles')
    .select('id, full_name, sector, role, avatar_url, access_level, reports_to_list')
    .eq('company', company).eq('active', true).neq('access_level', 'suporte').order('full_name');
  const todos = data || [];
  const vistos = new Set([meId]);
  let fronteira = [meId];
  while (fronteira.length) {
    const proximos = todos
      .filter(p => !vistos.has(p.id) && (p.reports_to_list || []).some(chefe => fronteira.includes(chefe)))
      .map(p => p.id);
    proximos.forEach(id => vistos.add(id));
    fronteira = proximos;
  }
  return {
    todos,
    subordinados: todos.filter(p => p.id !== meId && vistos.has(p.id)),
  };
}

module.exports = { cadeiaDeSubordinados };
