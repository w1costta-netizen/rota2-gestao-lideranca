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
  const { user_id, year, month } = req.body;
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
  logAction({ company: prof?.company, user_id, acao: 'enviar_escala', tabela: 'schedule_submissions', depois: { year, month } });
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
