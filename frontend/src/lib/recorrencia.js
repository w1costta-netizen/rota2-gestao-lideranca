// ─────────────────────────────────────────────────────────────
// A tarefa que se repete cai em QUAL dia?
//
// O modelo, que explica quase todo defeito desta área: a tarefa recorrente
// é UMA linha só, com a data da próxima vez — e essa data só anda quando
// alguém CONCLUI. Uma rotina diária que ninguém fechou fica parada numa
// data antiga, de propósito. Não existe uma linha por dia.
//
// Por isso perguntar "a data é menor que hoje?" dá a resposta errada: a
// tarefa parece vencida quando na verdade é a rotina de hoje.
//
// ESTA FUNÇÃO MORA SOZINHA DE PROPÓSITO. A mesma regra já existiu em três
// lugares com três respostas diferentes — a lista de Tarefas, o calendário
// e o painel — e foi assim que a mesma tarefa apareceu como "de hoje" numa
// tela e "vencida 29/09" na outra, no mesmo minuto. Quem precisar da regra
// importa daqui; ninguém reescreve.
// ─────────────────────────────────────────────────────────────

export function caiNoDia(t, diaYMD) {
  if (!t?.recorrencia || t.recorrencia === 'nenhuma' || !t.due_date) return false;
  if (diaYMD < t.due_date) return false;                       // ainda não começou
  const ate = t.pdca_context?.repetir_ate;
  if (ate && diaYMD > ate) return false;                       // já passou do fim
  if (t.recorrencia === 'diaria') return true;

  const [cy, cm, cd] = diaYMD.split('-').map(Number);
  const dowDia = new Date(cy, cm - 1, cd).getDay();
  if (t.recorrencia === 'dias_semana') return (t.dias_semana || []).includes(dowDia);

  const [dy, dm, dd] = t.due_date.split('-').map(Number);
  if (t.recorrencia === 'semanal') return new Date(dy, dm - 1, dd).getDay() === dowDia;
  // QUINZENAL = A CADA 15 DIAS, decisão do usuário em 09/10/2026.
  // Aqui era 14 enquanto o servidor criava a próxima com 15
  // (`nextDueDate`, backend/routes/tarefas.js) e toda a tela dizia "a cada
  // 15 dias". A lista mostrava a rotina num dia e o servidor fazia ela
  // nascer no dia seguinte — com o tempo, cada vez mais longe.
  // Os dois lados TÊM que dar o mesmo número; se mudar, muda nos dois.
  if (t.recorrencia === 'quinzenal') {
    const diff = Math.round((new Date(diaYMD) - new Date(t.due_date)) / 86400000);
    return diff % 15 === 0;
  }
  if (t.recorrencia === 'mensal') return t.due_date.split('-')[2] === diaYMD.split('-')[2];
  return false;
}

// Está atrasada DE VERDADE: passou da data e não é a rotina de hoje.
// Concluída nunca está atrasada.
export function estaAtrasada(t, hojeYMD) {
  if (!t?.due_date || t.status === 'concluida') return false;
  if (t.due_date >= hojeYMD) return false;
  return !caiNoDia(t, hojeYMD);
}
