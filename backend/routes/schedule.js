const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const { logAction, logError, registrarLog } = require('../lib/auditLog');

function getWeekStart(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().split('T')[0];
}

function dayOfWeekPT(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  return ['domingo','segunda','terca','quarta','quinta','sexta','sabado'][d.getUTCDay()];
}

// GET /api/schedule/month?user_id=&year=&month=
router.get('/month', async (req, res) => {
  const { user_id, year, month } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id obrigatório' });

  const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
  const from = `${year}-${String(month).padStart(2,'0')}-01`;
  const to   = `${year}-${String(month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;

  const { data, error } = await supabase
    .from('schedule_entries')
    .select('*, team_members(name,matricula,role,sector), editor:last_edited_by(full_name)')
    .eq('user_id', user_id)
    .gte('work_date', from)
    .lte('work_date', to);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// GET /api/schedule/last-editor?user_id=&year=&month=
router.get('/last-editor', async (req, res) => {
  const { user_id, year, month } = req.query;
  if (!user_id) return res.json(null);

  const lastDay2 = new Date(parseInt(year), parseInt(month), 0).getDate();
  const from = `${year}-${String(month).padStart(2,'0')}-01`;
  const to   = `${year}-${String(month).padStart(2,'0')}-${String(lastDay2).padStart(2,'0')}`;

  const { data } = await supabase
    .from('schedule_entries')
    .select('last_edited_by, last_edited_at, editor:last_edited_by(full_name)')
    .eq('user_id', user_id)
    .gte('work_date', from)
    .lte('work_date', to)
    .not('last_edited_at', 'is', null)
    .order('last_edited_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  res.json(data || null);
});

// Consultar a escala dos outros é livre; alterar, não.
//
// A tela agora deixa qualquer pessoa abrir a escala de qualquer setor, o
// que expõe os identificadores dos outros. Sem esta conferência bastaria
// repetir a chamada trocando o user_id para alterar a escala alheia — a
// trava da tela é conforto, esta é a que tranca.
//
// Quem pode alterar: a própria pessoa, supervisor/admin/master — que já
// respondiam pela escala do time antes desta tela existir — e quem lidera a
// pessoa no organograma.
//
// A última regra existe porque nível de acesso e chefia são coisas
// diferentes neste app: um LÍDER tem time no organograma, mas não é
// supervisor. Sem ela, quem monta a escala do próprio time todo mês ficava
// justamente de fora, e a escala dependia de alguém acima assumir a digitação.
async function podeAlterar(requester_id, dono_id) {
  if (!requester_id) return false;
  if (requester_id === dono_id) return true;

  const { data: quem } = await supabase
    .from('profiles').select('access_level').eq('id', requester_id).maybeSingle();
  if (['supervisor', 'admin', 'master'].includes(quem?.access_level)) return true;

  const { data: dono } = await supabase
    .from('profiles').select('reports_to_list').eq('id', dono_id).maybeSingle();
  return (dono?.reports_to_list || []).includes(requester_id);
}

// POST /api/schedule/save
router.post('/save', async (req, res) => {
  const { requester_id, user_id, team_member_id, work_date, status, entrada, intervalo, retorno_intervalo, saida } = req.body;
  if (!user_id || !team_member_id || !work_date)
    return res.status(400).json({ error: 'user_id, team_member_id e work_date são obrigatórios' });

  if (!(await podeAlterar(requester_id, user_id))) {
    return res.status(403).json({ error: 'Você pode consultar esta escala, mas não alterá-la.' });
  }

  // Busca dados do perfil para preencher company/sector nos entries
  const { data: prof } = await supabase
    .from('profiles')
    .select('company, sector, full_name')
    .eq('id', user_id)
    .maybeSingle();

  const week_start  = getWeekStart(work_date);
  const day_of_week = dayOfWeekPT(work_date);
  const isWork      = (status || 'trabalha') === 'trabalha';

  const { data, error } = await supabase
    .from('schedule_entries')
    .upsert({
      user_id,
      team_member_id,
      work_date,
      week_start,
      day_of_week,
      status:            status || 'trabalha',
      entrada:           isWork ? (entrada || null)           : null,
      intervalo:         isWork ? (intervalo || null)         : null,
      retorno_intervalo: isWork ? (retorno_intervalo || null) : null,
      saida:             isWork ? (saida || null)             : null,
      start_time:        isWork ? (entrada || null)           : null,
      end_time:          isWork ? (saida   || null)           : null,
      company:           prof?.company || null,
      sector:            prof?.sector  || null,
      // Quem MEXEU, não de quem é a escala. Antes gravava o dono, então o
      // "editado por" mostrava sempre o próprio dono — inútil justamente
      // quando outra pessoa altera a escala dele, que é o caso a rastrear.
      last_edited_by:    requester_id || user_id,
      last_edited_at:    new Date().toISOString(),
    }, { onConflict: 'user_id,team_member_id,work_date' })
    .select('*, team_members(name,matricula,role,sector)')
    .single();

  // Só a falha é registrada: o salvamento acontece a cada célula editada na
  // escala, então logar sucesso geraria centenas de linhas por montagem.
  // O envio do mês (POST /submit) é que fica registrado como ação.
  if (error) {
    registrarLog('salvar_escala', 'schedule_entries', 'erro', {
      company: prof?.company, user_id,
      rota: req.originalUrl, erro: error.message,
    });
    return res.status(500).json({ error: error.message });
  }
  res.json(data);
});

// PUT /api/schedule/setor  { requester_id, user_id, setor }
//
// O nome do setor da escala. Antes ele era herdado do cadastro do líder, e
// isso está errado: o setor é da ESCALA, não do crachá de quem a monta. Um
// líder pode responder pela Frente de Caixa com o próprio cadastro dizendo
// outra coisa — e não havia como corrigir.
//
// Vazio volta a null de propósito, para a tela cair de novo no setor do
// cadastro em vez de mostrar um rótulo em branco.
router.put('/setor', async (req, res) => {
  const { requester_id, user_id, setor } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id obrigatório' });

  if (!(await podeAlterar(requester_id, user_id))) {
    return res.status(403).json({ error: 'Você pode consultar esta escala, mas não renomeá-la.' });
  }

  const nome = (setor || '').trim().slice(0, 60) || null;
  const { data: prof } = await supabase
    .from('profiles').select('company, escala_setor').eq('id', user_id).maybeSingle();

  const { data, error } = await supabase
    .from('profiles').update({ escala_setor: nome }).eq('id', user_id)
    .select('id, escala_setor').single();

  if (error) {
    logError({ company: prof?.company, user_id, acao: 'renomear_escala', tabela: 'profiles',
               rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({ company: prof?.company, user_id: requester_id, acao: 'renomear_escala', tabela: 'profiles',
              antes: { escala_setor: prof?.escala_setor }, depois: { escala_setor: nome } });
  res.json(data);
});

// GET /api/schedule/submission?user_id=&year=&month=
router.get('/submission', async (req, res) => {
  const { user_id, year, month } = req.query;
  if (!user_id) return res.json(null);

  const { data, error } = await supabase
    .from('schedule_submissions')
    .select('*')
    .eq('user_id', user_id)
    .eq('year', parseInt(year))
    .eq('month', parseInt(month))
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || null);
});

// POST /api/schedule/submit
router.post('/submit', async (req, res) => {
  if (!(await podeAlterar(req.body?.requester_id, req.body?.user_id))) {
    return res.status(403).json({ error: 'Você pode consultar esta escala, mas não fechá-la.' });
  }
  const { user_id, year, month, pontos_atencao } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id obrigatório' });

  const { data, error } = await supabase
    .from('schedule_submissions')
    .upsert(
      { user_id, year: parseInt(year), month: parseInt(month), submitted_at: new Date().toISOString() },
      { onConflict: 'user_id,year,month' }
    )
    .select()
    .single();

  const { data: prof } = await supabase.from('profiles').select('company').eq('id', user_id).maybeSingle();
  if (error) {
    logError({ company: prof?.company, user_id, acao: 'enviar_escala', tabela: 'schedule_submissions', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  // Quantos pontos de atenção existiam no momento do fechamento fica no log.
  // Fechar com problema em aberto é decisão de quem fecha — e é legítima, um
  // líder pode ter motivo. O que não pode é a decisão não deixar rastro.
  logAction({
    company: prof?.company, user_id, acao: 'enviar_escala', tabela: 'schedule_submissions',
    depois: { year, month, ...(pontos_atencao != null ? { pontos_atencao } : {}) },
  });
  res.json(data);
});

// DELETE /api/schedule/submission
router.delete('/submission', async (req, res) => {
  if (!(await podeAlterar(req.query?.requester_id, req.query?.user_id))) {
    return res.status(403).json({ error: 'Você pode consultar esta escala, mas não reabri-la.' });
  }
  const { user_id, year, month } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id obrigatório' });

  const { error } = await supabase
    .from('schedule_submissions')
    .delete()
    .eq('user_id', user_id)
    .eq('year', parseInt(year))
    .eq('month', parseInt(month));

  const { data: prof } = await supabase.from('profiles').select('company').eq('id', user_id).maybeSingle();
  if (error) {
    logError({ company: prof?.company, user_id, acao: 'reabrir_escala', tabela: 'schedule_submissions', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({ company: prof?.company, user_id, acao: 'reabrir_escala', tabela: 'schedule_submissions', antes: { year, month } });
  res.json({ ok: true });
});

// GET /api/schedule?user_id=&week_start= (legado)
router.get('/', async (req, res) => {
  const { user_id, week_start } = req.query;
  const { data, error } = await supabase
    .from('schedule_entries')
    .select('*, team_members(id,name,matricula,role,sector)')
    .eq('user_id', user_id)
    .eq('week_start', week_start)
    .order('work_date');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// GET /api/schedule/analise?escala_id=&year=&month=
//
// Pontos de atenção de uma escala fechada. Procura o que ninguém enxerga
// numa planilha de 780 linhas: descanso curto entre dois dias, sequência sem
// folga, intervalo faltando, dia descoberto.
//
// AS REGRAS DA CLT SÃO CITADAS, mas a conferência final é do RH do cliente —
// a escala aqui é uma previsão, e o que vale juridicamente é a jornada
// efetivamente cumprida. A tela diz isso.
//
// Cuidado que veio dos dados reais: FÉRIAS NÃO É CARGA BAIXA. Na escala de
// setembro da frente de loja havia quatro pessoas com metade das horas do
// time, todas de férias. Um relatório que compara hora bruta acusaria quatro
// injustiças inexistentes — o que destrói a confiança no relatório inteiro
// mais rápido do que qualquer erro de conta. Por isso a carga é medida por
// DIA DISPONÍVEL.
const FOLGAS = ['folga', 'dsr', 'folga_premio', 'folga_feriado', 'feriado'];
const AUSENCIAS = ['ferias'];

const paraMinutos = (t) => {
  const [h, m] = String(t || '').split(':').map(Number);
  return Number.isFinite(h) ? h * 60 + (m || 0) : null;
};

// Jornada em minutos, já descontado o intervalo. Vira o dia quando a saída é
// menor que a entrada — turno que atravessa a meia-noite.
function duracao(e) {
  const ini = paraMinutos(e.entrada);
  let fim = paraMinutos(e.saida);
  if (ini === null || fim === null) return null;
  if (fim <= ini) fim += 1440;
  let total = fim - ini;
  const pausa = paraMinutos(e.intervalo);
  const volta = paraMinutos(e.retorno_intervalo);
  if (pausa !== null && volta !== null && volta > pausa) total -= (volta - pausa);
  return total;
}

const diasEntre = (a, b) =>
  Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);

const hhmm = (min) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;

// Achado sem data não serve para nada: quem recebe precisa ir na escala e
// olhar AQUELE dia. Vai a data curta com o dia da semana junto, porque
// "sábado 12/09" já responde metade das perguntas antes de abrir a escala.
const CURTO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
const diaCurto = (iso) => {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00Z');
  return `${CURTO[d.getUTCDay()]} ${iso.slice(8)}/${iso.slice(5, 7)}`;
};

router.get('/analise', async (req, res) => {
  const { escala_id, year, month } = req.query;
  if (!escala_id || !year || !month) {
    return res.status(400).json({ error: 'escala_id, year e month são obrigatórios' });
  }

  const ultimo = new Date(parseInt(year), parseInt(month), 0).getDate();
  const de  = `${year}-${String(month).padStart(2, '0')}-01`;
  const ate = `${year}-${String(month).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`;

  const { data: linhas, error } = await supabase
    .from('schedule_entries')
    .select('team_member_id, work_date, status, entrada, intervalo, retorno_intervalo, saida, team_members(name, role)')
    .eq('user_id', escala_id)
    .gte('work_date', de).lte('work_date', ate)
    .order('work_date');
  if (error) return res.status(500).json({ error: error.message });

  const todas = linhas || [];
  const trabalhou = todas.filter(e => e.status === 'trabalha' && e.entrada && e.saida);

  const nomeDe = (id) => todas.find(e => e.team_member_id === id)?.team_members?.name || 'Sem nome';
  const porPessoa = {};
  trabalhou.forEach(e => (porPessoa[e.team_member_id] = porPessoa[e.team_member_id] || []).push(e));

  const achados = [];
  const registra = (chave, titulo, base, gravidade, itens, oQueFazer) => {
    if (itens.length) achados.push({ chave, titulo, base, gravidade, total: itens.length, itens, oQueFazer });
  };

  // ── 1. Descanso entre jornadas (CLT art. 66: mínimo 11 horas) ──
  const descansoCurto = [];
  Object.entries(porPessoa).forEach(([id, es]) => {
    const ordenadas = [...es].sort((a, b) => a.work_date.localeCompare(b.work_date));
    for (let i = 1; i < ordenadas.length; i++) {
      const antes = ordenadas[i - 1], agora = ordenadas[i];
      if (diasEntre(antes.work_date, agora.work_date) !== 1) continue;
      let saiu = paraMinutos(antes.saida);
      const entrou = paraMinutos(agora.entrada);
      if (saiu === null || entrou === null) continue;
      if (saiu <= paraMinutos(antes.entrada)) saiu += 1440;   // saiu depois da meia-noite
      const descanso = (entrou + 1440) - saiu;
      if (descanso < 11 * 60) descansoCurto.push({
        pessoa: nomeDe(id), data: agora.work_date,
        detalhe: `saiu ${antes.saida} de ${diaCurto(antes.work_date)} e entrou ${antes.saida > agora.entrada ? '' : ''}${agora.entrada} em ${diaCurto(agora.work_date)} — só ${hhmm(descanso)} de descanso, faltam ${hhmm(11 * 60 - descanso)}`,
      });
    }
  });
  registra('descanso', 'Descanso menor que 11 horas entre dois dias', 'CLT art. 66', 'alta', descansoCurto,
    'Adiar a entrada do dia seguinte ou antecipar a saída da véspera.');

  // ── 2. Mais de 6 dias seguidos (CLT art. 67: repouso semanal) ──
  const seguidos = [];
  Object.entries(porPessoa).forEach(([id, es]) => {
    const dias = [...new Set(es.map(e => e.work_date))].sort();
    let inicio = 0;
    for (let i = 1; i <= dias.length; i++) {
      const emSequencia = i < dias.length && diasEntre(dias[i - 1], dias[i]) === 1;
      if (emSequencia) continue;
      const quantos = i - inicio;
      if (quantos > 6) seguidos.push({
        pessoa: nomeDe(id), data: dias[i - 1],
        detalhe: `${quantos} dias seguidos sem folga: de ${diaCurto(dias[inicio])} até ${diaCurto(dias[i - 1])}`,
      });
      inicio = i;
    }
  });
  registra('sequencia', 'Mais de 6 dias seguidos sem folga', 'CLT art. 67', 'alta', seguidos,
    'Encaixar uma folga dentro de cada sete dias.');

  // ── 3. Intervalo (CLT art. 71: acima de 6h exige 1 hora) ──
  const semIntervalo = [], intervaloCurto = [], intervaloErrado = [];
  trabalhou.forEach(e => {
    const entrou = paraMinutos(e.entrada);
    let saiu = paraMinutos(e.saida);
    if (entrou === null || saiu === null) return;
    if (saiu <= entrou) saiu += 1440;
    const bruta = saiu - entrou;

    const pausa = paraMinutos(e.intervalo), volta = paraMinutos(e.retorno_intervalo);
    const temIntervalo = pausa !== null && volta !== null;

    // ERRO DE LANÇAMENTO vem ANTES de qualquer regra de jornada, e é
    // categoria própria.
    //
    // Um retorno anterior à saída para o intervalo não é jornada irregular:
    // é um dígito trocado na hora de digitar. Tratar isso como infração da
    // CLT produz um alerta que a pessoa confere na escala, vê que não
    // procede, e a partir daí passa a duvidar do relatório inteiro — foi
    // exatamente o que aconteceu. Caso real: 16:00 -> 15:00 em três dias,
    // enquanto todos os colegas do mesmo turno usam 16:00 -> 17:00.
    if (temIntervalo && volta <= pausa) {
      intervaloErrado.push({ pessoa: nomeDe(e.team_member_id), data: e.work_date,
        detalhe: `saída para o intervalo ${e.intervalo} e retorno ${e.retorno_intervalo} — o retorno está antes da saída, então o horário não pode estar certo` });
      return;
    }
    if (temIntervalo && (pausa < entrou || volta > saiu)) {
      intervaloErrado.push({ pessoa: nomeDe(e.team_member_id), data: e.work_date,
        detalhe: `intervalo de ${e.intervalo} a ${e.retorno_intervalo} fora da jornada, que vai de ${e.entrada} a ${e.saida}` });
      return;
    }

    if (bruta <= 360) return;   // até 6 horas a lei não exige intervalo

    if (!temIntervalo) {
      semIntervalo.push({ pessoa: nomeDe(e.team_member_id), data: e.work_date,
        detalhe: `entrada ${e.entrada}, saída ${e.saida} — jornada de ${hhmm(bruta)} e nenhum intervalo lançado` });
    } else if (volta - pausa < 60) {
      intervaloCurto.push({ pessoa: nomeDe(e.team_member_id), data: e.work_date,
        detalhe: `entrada ${e.entrada}, saída ${e.saida} (${hhmm(bruta)}) — intervalo de ${e.intervalo} a ${e.retorno_intervalo}, só ${volta - pausa} min; faltam ${60 - (volta - pausa)} min` });
    }
  });

  registra('intervalo_errado', 'Intervalo lançado com horário impossível', null, 'atencao', intervaloErrado,
    'Abrir o dia na escala e corrigir os horários do intervalo — provavelmente é dígito trocado.');
  registra('sem_intervalo', 'Jornada acima de 6 horas sem intervalo lançado', 'CLT art. 71', 'alta', semIntervalo,
    'Lançar o intervalo na escala, ou reduzir a jornada para até 6 horas.');
  registra('intervalo_curto', 'Intervalo menor que 1 hora em jornada acima de 6 horas', 'CLT art. 71', 'alta', intervaloCurto,
    'Completar o intervalo para 1 hora.');

  // ── 4. Jornada acima de 10h (CLT art. 59: 8h + no máximo 2h extras) ──
  const jornadaLonga = trabalhou
    .map(e => ({ e, d: duracao(e) }))
    .filter(x => x.d !== null && x.d > 600)
    .map(x => ({ pessoa: nomeDe(x.e.team_member_id), data: x.e.work_date,
                 detalhe: `entrada ${x.e.entrada}, saída ${x.e.saida} — ${hhmm(x.d)} de trabalho já descontando o intervalo` }));
  registra('jornada_longa', 'Jornada acima de 10 horas', 'CLT art. 59', 'alta', jornadaLonga,
    'Dividir a cobertura desse dia com outra pessoa.');

  // ── 5. Dia sem ninguém escalado ──
  //
  // Só entre o primeiro e o último dia com alguém trabalhando: fora disso a
  // escala pode simplesmente não ter sido preenchida ainda, e apontar mês
  // inteiro de "dia descoberto" seria alarme falso.
  const diasComGente = new Set(trabalhou.map(e => e.work_date));
  const ordenados = [...diasComGente].sort();
  const descobertos = [];
  if (ordenados.length > 1) {
    const primeiro = ordenados[0], ultimoDia = ordenados[ordenados.length - 1];

    // Loja fechada não é falha de escala. Se NENHUMA ocorrência daquele dia
    // da semana tem gente no mês inteiro, a loja não abre nesse dia — acusar
    // todo domingo de "dia descoberto" é o tipo de alarme falso que faz o
    // relatório perder a credibilidade na segunda leitura.
    const vazioNoDiaDaSemana = {};
    for (let d = 1; d <= ultimo; d++) {
      const dia = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (dia < primeiro || dia > ultimoDia) continue;
      const semana = new Date(dia + 'T12:00:00Z').getUTCDay();
      if (vazioNoDiaDaSemana[semana] === undefined) vazioNoDiaDaSemana[semana] = true;
      if (diasComGente.has(dia)) vazioNoDiaDaSemana[semana] = false;
    }

    for (let d = 1; d <= ultimo; d++) {
      const dia = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (dia <= primeiro || dia >= ultimoDia) continue;
      if (diasComGente.has(dia)) continue;
      const semana = new Date(dia + 'T12:00:00Z').getUTCDay();
      if (vazioNoDiaDaSemana[semana]) continue;   // a loja não abre neste dia da semana
      descobertos.push({ pessoa: '—', data: dia,
        detalhe: `${diaCurto(dia)} sem ninguém escalado, e nos outros ${CURTO[semana]} do mês há gente` });
    }
  }
  registra('dia_descoberto', 'Dia sem ninguém escalado', null, 'atencao', descobertos,
    'Conferir se a loja abre neste dia.');

  // ── 6. Carga acima do time, medida por DIA DISPONÍVEL ──
  const disponiveis = {};
  todas.forEach(e => {
    if (AUSENCIAS.includes(e.status)) return;  // férias não conta como dia disponível
    disponiveis[e.team_member_id] = (disponiveis[e.team_member_id] || 0) + 1;
  });
  const carga = Object.entries(porPessoa).map(([id, es]) => {
    const minutos = es.reduce((soma, e) => soma + (duracao(e) || 0), 0);
    const dias = disponiveis[id] || es.length;
    return { id, minutos, dias, porDia: minutos / Math.max(dias, 1), jornadas: es.length };
  }).filter(c => c.jornadas >= 5);

  const sobrecarga = [];
  if (carga.length >= 4) {
    const ordenado = [...carga].map(c => c.porDia).sort((a, b) => a - b);
    const mediana = ordenado[Math.floor(ordenado.length / 2)];
    carga.forEach(c => {
      if (mediana > 0 && c.porDia > mediana * 1.25) sobrecarga.push({
        pessoa: nomeDe(c.id), data: null,
        detalhe: `${hhmm(Math.round(c.minutos))} em ${c.jornadas} dias trabalhados (${c.dias} dias disponíveis no mês) — ${Math.round((c.porDia / mediana - 1) * 100)}% acima da mediana do time, que é ${hhmm(Math.round(mediana))} por dia`,
      });
    });
  }
  registra('sobrecarga', 'Carga bem acima da média do time', null, 'atencao', sobrecarga,
    'Redistribuir alguns dias com quem está mais leve.');

  res.json({
    periodo: { ano: parseInt(year), mes: parseInt(month), de, ate },
    resumo: {
      pessoas: Object.keys(porPessoa).length,
      jornadas: trabalhou.length,
      diasCobertos: diasComGente.size,
      emFerias: [...new Set(todas.filter(e => AUSENCIAS.includes(e.status)).map(e => e.team_member_id))].length,
    },
    achados,
  });
});

// GET /api/schedule/operators?escala_id=&data=YYYY-MM-DD&cargos=
//
// Análise de caixas. Reescrita em 06/09/2026 depois de conferir a escala real
// de setembro da frente de loja — 780 lançamentos. Os quatro defeitos, todos
// medidos, e não suspeitados:
//
// 1. NÃO FILTRAVA SETOR. Buscava a loja inteira. Das 23 pessoas que contava
//    numa terça, 12 eram de Perecíveis e Mercearia — gente que não opera
//    caixa. Agora analisa a escala de UMA pessoa, escolhida na tela: quem
//    responde pela frente de loja. Não há o que adivinhar.
//
// 2. LISTA DE CARGOS FIXA E EXATA (['operador loja','aprendiz']). "Jovem
//    Aprendiz" não bate com "aprendiz", e assim 41% das jornadas da própria
//    frente de loja eram descartadas. Agora os cargos vêm da escala e a tela
//    deixa ligar e desligar cada um — loja nova tem nomes que ninguém aqui
//    adivinha.
//
// 3. FAIXA DE HORAS FIXA em 8h–20h, enquanto a escala vai de 07:00 a 22:20.
//    Havia gente às 7h, às 21h e às 22h que simplesmente não aparecia.
//    Agora a faixa sai da própria escala.
//
// 4. UMA TERÇA VALIA PELO MÊS. Setembro tem cinco terças, com gente e
//    horários diferentes, e o código pegava uma delas pela ordem que o banco
//    devolvesse. Em 26% das combinações pessoa+dia o horário muda dentro do
//    mês. Agora é uma DATA.
const CARGOS_DE_CAIXA = [/operador.*loja/, /aprendiz/];

const semAcento = (t) => String(t || '').toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

// Cargo separado por barra vertical, e não vírgula: nome de cargo com vírgula
// existe, e quebraria a lista sem dar erro nenhum.
const SEPARADOR = '|';

router.get('/operators', async (req, res) => {
  const { escala_id, data: dia, cargos } = req.query;
  if (!escala_id || !dia) {
    return res.status(400).json({ error: 'escala_id e data são obrigatórios' });
  }

  const { data: linhas, error } = await supabase
    .from('schedule_entries')
    .select('team_member_id, entrada, intervalo, retorno_intervalo, saida, status, team_members(name, role, sector)')
    .eq('user_id', escala_id)
    .eq('work_date', dia)
    .eq('status', 'trabalha');
  if (error) return res.status(500).json({ error: error.message });

  const comHorario = (linhas || []).filter(e => e.entrada && e.saida);

  const totalPorCargo = {};
  comHorario.forEach(e => {
    const c = e.team_members?.role?.trim() || 'Sem cargo';
    totalPorCargo[c] = (totalPorCargo[c] || 0) + 1;
  });

  const escolhidos = cargos
    ? new Set(String(cargos).split(SEPARADOR).map(semAcento).filter(Boolean))
    : null;
  const ehDeCaixa = (nomeDoCargo) => {
    const c = semAcento(nomeDoCargo);
    return escolhidos ? escolhidos.has(c) : CARGOS_DE_CAIXA.some(r => r.test(c));
  };

  const doCaixa = comHorario.filter(e => ehDeCaixa(e.team_members?.role));

  const emMinutos = (t) => {
    const [h, m] = String(t).split(':').map(Number);
    return h * 60 + (m || 0);
  };

  let primeira = 23, ultima = 0;
  doCaixa.forEach(e => {
    primeira = Math.min(primeira, Math.floor(emMinutos(e.entrada) / 60));
    // Saída 22:20 cobre a faixa das 22h; por isso o -1 depois do arredonda.
    ultima = Math.max(ultima, Math.ceil(emMinutos(e.saida) / 60) - 1);
  });
  const horas = doCaixa.length && ultima >= primeira
    ? Array.from({ length: ultima - primeira + 1 }, (_, i) => primeira + i)
    : [];

  const resultado = horas.map(h => {
    const H = h * 60;
    const ativos = doCaixa.filter(e => {
      const entrou = emMinutos(e.entrada);
      const saiu   = emMinutos(e.saida);
      if (entrou > H || saiu <= H) return false;
      // Quem está no intervalo não está no caixa.
      const pausa   = e.intervalo ? emMinutos(e.intervalo) : null;
      const voltou  = e.retorno_intervalo ? emMinutos(e.retorno_intervalo) : null;
      if (pausa !== null && voltou !== null && pausa <= H && voltou > H) return false;
      return true;
    });
    return {
      hour: h,
      operators: ativos.length,
      names: ativos.map(e => e.team_members?.name).filter(Boolean).sort(),
    };
  });

  res.json({
    data: dia,
    horas: resultado,
    // Todos os cargos que aparecem nesta escala, com quantas jornadas cada um
    // tem no dia. A tela mostra para a pessoa ver o que entrou e o que ficou
    // de fora — era justamente o que ninguém conseguia enxergar antes.
    cargos: Object.entries(totalPorCargo)
      .map(([nome, total]) => ({ nome, total, ativo: ehDeCaixa(nome) }))
      .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR')),
  });
});

// DELETE /api/schedule/:id
router.delete('/:id', async (req, res) => {
  const { data: antes } = await supabase.from('schedule_entries').select('user_id, work_date').eq('id', req.params.id).maybeSingle();
  const { error } = await supabase.from('schedule_entries').delete().eq('id', req.params.id);
  if (error) {
    registrarLog('excluir_entrada_escala', 'schedule_entries', 'erro', { user_id: antes?.user_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: error.message });
  }
  registrarLog('excluir_entrada_escala', 'schedule_entries', 'sucesso', { user_id: antes?.user_id, antes: { work_date: antes?.work_date } });
  res.json({ ok: true });
});

module.exports = router;
