const express = require('express');
const crypto  = require('node:crypto');
const router  = express.Router();
const supabase = require('../supabase');
const { enviarPush } = require('../lib/notificacoes');
const { logAction, logError } = require('../lib/auditLog');
const { perfilDe, lojaPermitida } = require('../lib/lojaPermitida');

// A loja de cada leitura e escrita é decidida em lib/lojaPermitida.js —
// até out/2026 a agenda buscava sem empresa e mostrava os compromissos
// "gerais" de TODAS as empresas para qualquer usuário.
const getProfile = perfilDe;
const canManage = p => p && ['admin', 'supervisor', 'lider', 'master'].includes(p.access_level);

// Cor escolhida pela pessoa (opcional). Sem cor, a tela usa a do destino
// (geral/setor/pessoas), como sempre foi.
const CORES_AGENDA = ['azul', 'verde', 'roxo', 'rosa', 'laranja', 'amarelo', 'vermelho', 'cinza'];
const corValida = c => (CORES_AGENDA.includes(c) ? c : null);

// HH:MM ou nada. Campo de hora vem do navegador, mas a rota não pode
// confiar nisso: um valor estranho aqui estragaria a ordenação da agenda e
// a conta do lembrete.
// Como o horário é dito nos avisos: "das 09:00 às 11:00", "às 09:00" ou
// "dia todo". Uma função só, para os dois push não divergirem.
const quando = (it) => it.dia_todo ? ' (dia todo)'
  : it.time && it.hora_fim ? ` das ${it.time} às ${it.hora_fim}`
  : it.time ? ` às ${it.time}` : '';

const horaValida = (t) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(t || '').trim()) ? String(t).trim() : '');

// Dia inteiro MANDA sobre os horários. Guardar "das 00:00 às 23:59" faria o
// compromisso aparecer como coisa de madrugada na lista e entrar em
// qualquer conta de horário; e deixar hora guardada com dia_todo ligado
// faria o lembrete tocar na hora errada.
//
// Fim antes do início é descartado em vez de recusado: quase sempre é
// digitação, e travar o salvamento por causa disso faria a pessoa perder o
// compromisso inteiro que acabou de escrever.
function horarios({ time, hora_fim, dia_todo }) {
  if (dia_todo) return { dia_todo: true, time: '', hora_fim: '' };
  const ini = horaValida(time);
  let fim = horaValida(hora_fim);
  if (!ini) fim = '';
  if (ini && fim && fim <= ini) fim = '';
  return { dia_todo: false, time: ini, hora_fim: fim };
}

const DIA_POR_EXTENSO = {
  segunda:'Segunda', terca:'Terça', quarta:'Quarta', quinta:'Quinta',
  sexta:'Sexta', sabado:'Sábado', domingo:'Domingo',
};

// Quem deve ser avisado de um item da agenda. A mesma regra de três casos
// usada na tela e nos lembretes: para toda a loja, para um setor, ou para
// pessoas específicas.
async function destinatarios(target_type, target_value, company) {
  if (target_type === 'lider') {
    return String(target_value || '').split(',').map(s => s.trim()).filter(Boolean);
  }
  if (!company) return [];

  let consulta = supabase.from('profiles').select('id').eq('company', company).eq('active', true);
  if (target_type === 'setor') consulta = consulta.eq('sector', target_value);

  const { data } = await consulta;
  return (data || []).map(p => p.id);
}

// GET /api/agenda?week_start=&user_id=&sector=&company=
// Sempre filtra pelo destinatário: cada pessoa só vê o que é destinado a ela
// (geral / próprio setor / individual) OU o que ela mesma criou. Ninguém —
// nem admin/master — vê automaticamente a agenda de outra pessoa.
router.get('/', async (req, res) => {
  const { week_start, user_id, sector } = req.query;
  if (!user_id) return res.json([]); // requester_id obrigatório para não vazar tudo

  // `user_id` é o dono do token (conferido em lib/sessao.js), então o perfil
  // daqui é de quem está pedindo de verdade.
  const me = await getProfile(user_id);
  const company = await lojaPermitida(me, req.query.company);
  // Sem loja não há o que mostrar — e buscar sem filtro é exatamente o
  // vazamento que esta função existe para impedir.
  if (!company) return res.json([]);

  let query = supabase.from('agenda_items').select('*').eq('company', company).order('day_of_week').order('time');
  if (week_start) {
    // Busca por intervalo da semana (segunda a domingo) para tolerar
    // itens salvos com week_start ligeiramente diferente por bug de fuso horário
    const [wy, wm, wd] = week_start.split('-').map(Number);
    const endDate = new Date(Date.UTC(wy, wm - 1, wd + 7));
    const week_end = endDate.toISOString().split('T')[0];
    query = query.gte('week_start', week_start).lt('week_start', week_end);
  }
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const filtered = (data || []).filter(item => {
    if (item.created_by === user_id) return true;
    if (item.target_type === 'geral') return true;
    if (item.target_type === 'setor') return item.target_value === sector;
    if (item.target_type === 'lider') return (item.target_value ? item.target_value.split(',') : []).includes(user_id);
    return false;
  });
  res.json(filtered);
});

router.get('/leader/:id', async (req, res) => {
  const { week_start } = req.query;
  const { data: leader, error: le } = await supabase.from('leaders').select('*').eq('id', req.params.id).single();
  if (le) return res.status(404).json({ error: 'Líder não encontrado' });

  // Monta a mensagem de WhatsApp da semana. Buscava os itens de TODAS as
  // empresas — o "geral" de outra loja entrava na mensagem. A tabela
  // `leaders` é antiga e não tem empresa; quem define a loja é a pessoa
  // que está pedindo, pela mesma regra da agenda.
  const me = await getProfile(req.usuario?.id);
  const company = await lojaPermitida(me, req.query.company);
  if (!company) return res.json({ leader, items: [] });

  const { data: items, error: ie } = await supabase.from('agenda_items')
    .select('*').eq('week_start', week_start).eq('company', company).order('day_of_week').order('time');
  if (ie) return res.status(500).json({ error: ie.message });

  const filtered = items.filter(item => {
    if (!leader.work_days.includes(item.day_of_week)) return false;
    if (item.target_type === 'geral') return true;
    if (item.target_type === 'setor') return item.target_value === leader.sector;
    if (item.target_type === 'lider') return (item.target_value ? item.target_value.split(',') : []).includes(String(leader.id));
    return false;
  });
  res.json({ leader, items: filtered });
});

// Soma dias a uma data ISO (AAAA-MM-DD) sem passar por fuso local.
function somarDias(iso, n) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().split('T')[0];
}

// Recorrência semanal. O compromisso fixo ("toda terça às 9h") vira uma
// linha por semana, todas com o mesmo `serie_id`. Materializar (em vez de
// calcular na leitura) é o que mantém intactos lembretes, resumo por e-mail,
// PDF e WhatsApp, que já leem a agenda semana a semana. Limite de 52 para
// ninguém criar centenas de linhas por engano.
const MAX_SEMANAS = 52;

// POST /api/agenda — cria item (ou uma série semanal) e dispara push
router.post('/', async (req, res) => {
  const { title, description, week_start, target_type, target_value, day_of_week, time, hora_fim, dia_todo, created_by, lembrete_minutos, recorrencia_semanas, cor } = req.body;
  if (!title || !week_start || !target_type || !day_of_week)
    return res.status(400).json({ error: 'Campos obrigatórios: title, week_start, target_type, day_of_week' });
  if (!created_by) return res.status(401).json({ error: 'created_by obrigatório' });
  const meCreate = await getProfile(created_by);
  if (!meCreate || !canManage(meCreate)) return res.status(403).json({ error: 'Acesso negado' });

  // Determina company: usa a passada no body, ou busca do criador
  let company = req.body.company || null;
  if (!company && created_by) {
    const { data: me } = await supabase.from('profiles').select('company').eq('id', created_by).single();
    company = me?.company || null;
  }

  const semanas = Math.min(MAX_SEMANAS, Math.max(1, parseInt(recorrencia_semanas, 10) || 1));
  const serie_id = semanas > 1 ? crypto.randomUUID() : null;
  // Dia inteiro manda: com ele ligado, hora de início e fim são apagadas em
  // vez de guardadas "por via das dúvidas" — senão a lista mostraria um
  // horário que não vale, e o lembrete dispararia na hora errada.
  const h = horarios({ time, hora_fim, dia_todo });
  const base = { title, description: description || '', target_type, target_value: target_value || '', day_of_week, ...h, company, created_by: created_by || null, lembrete_minutos: lembrete_minutos ?? null, lembrete_enviado: false, serie_id, cor: corValida(cor) };
  const linhas = Array.from({ length: semanas }, (_, i) => ({ ...base, week_start: somarDias(week_start, 7 * i) }));

  const { data: criados, error } = await supabase.from('agenda_items').insert(linhas).select();
  if (error) {
    logError({ company, user_id: created_by, acao: 'criar_agenda', tabela: 'agenda_items', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  const data = (criados || []).find(x => x.week_start === week_start) || criados?.[0];
  logAction({ company, user_id: created_by, acao: 'criar_agenda', tabela: 'agenda_items', depois: { id: data?.id, title, target_type, target_value, semanas, serie_id } });

  // Avisa o público do item — uma vez, mesmo na série. Quem criou não recebe.
  destinatarios(target_type, target_value, company).then(pessoas => {
    enviarPush(
      pessoas.filter(id => id !== created_by),
      '📅 Novo na agenda',
      `${title}${quando(h)} — ${DIA_POR_EXTENSO[day_of_week] || day_of_week}${semanas > 1 ? ' (toda semana)' : ''}`,
      'agenda',
      { company, rota: req.originalUrl },
    );
  }).catch(() => {});

  res.status(201).json({ ...data, criados: semanas });
});

// PUT /api/agenda/:id — atualiza item e dispara push
router.put('/:id', async (req, res) => {
  const { title, description, week_start, target_type, target_value, day_of_week, time, hora_fim, dia_todo, updated_by, lembrete_minutos, cor } = req.body;
  if (!updated_by) return res.status(401).json({ error: 'updated_by obrigatório' });
  const meUpdate = await getProfile(updated_by);
  if (!meUpdate || !canManage(meUpdate)) return res.status(403).json({ error: 'Acesso negado' });

  let company = null;
  if (updated_by) {
    const { data: me } = await supabase.from('profiles').select('company').eq('id', updated_by).single();
    company = me?.company;
  }

  const mudancas = { title, description: description || '', target_type, target_value: target_value || '', day_of_week, ...horarios({ time, hora_fim, dia_todo }), lembrete_minutos: lembrete_minutos ?? null, lembrete_enviado: false, cor: corValida(cor) };

  // Item de série: `escopo: 'futuros'` aplica a mudança a esta semana e às
  // seguintes da mesma série (cada uma mantém a própria week_start). Sem
  // escopo, ou 'este', mexe só nesta semana — e ela sai da série, para não
  // ser sobrescrita numa edição futura "deste e dos próximos".
  const { data: atual } = await supabase.from('agenda_items').select('serie_id, week_start, company').eq('id', req.params.id).maybeSingle();
  // Item de outra loja responde como inexistente: sem esta trava, bastava
  // o id para editar o compromisso de outra empresa.
  if (!atual || atual.company !== await lojaPermitida(meUpdate, atual.company)) {
    return res.status(404).json({ error: 'Item não encontrado' });
  }
  const emSerie = req.body.escopo === 'futuros' && atual.serie_id;

  let data, error;
  if (emSerie) {
    const r = await supabase.from('agenda_items').update(mudancas)
      .eq('serie_id', atual.serie_id).gte('week_start', atual.week_start).select();
    error = r.error; data = (r.data || []).find(x => x.id === req.params.id) || r.data?.[0];
  } else {
    const r = await supabase.from('agenda_items')
      .update({ ...mudancas, week_start, ...(atual.serie_id ? { serie_id: null } : {}) })
      .eq('id', req.params.id).select().single();
    error = r.error; data = r.data;
  }
  if (error) {
    logError({ company, user_id: updated_by, acao: 'editar_agenda', tabela: 'agenda_items', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({ company, user_id: updated_by, acao: 'editar_agenda', tabela: 'agenda_items', depois: { title, target_type, target_value, escopo: emSerie ? 'futuros' : 'este' } });

  // Alteração de agenda é o que a equipe mais precisa saber na hora: quem
  // não for avisado aparece no horário antigo. Quem alterou não recebe.
  destinatarios(target_type, target_value, company).then(pessoas => {
    enviarPush(
      pessoas.filter(id => id !== updated_by),
      '📅 Agenda alterada',
      `${title}${quando(horarios({ time, hora_fim, dia_todo }))} — ${DIA_POR_EXTENSO[day_of_week] || day_of_week}`,
      'agenda',
      { company, rota: req.originalUrl },
    );
  }).catch(() => {});

  res.json(data);
});

router.delete('/:id', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me || !canManage(me)) return res.status(403).json({ error: 'Acesso negado' });

  const { data: item } = await supabase.from('agenda_items').select('title, company, serie_id, week_start').eq('id', req.params.id).single();
  if (!item || item.company !== await lojaPermitida(me, item.company)) {
    return res.status(404).json({ error: 'Item não encontrado' });
  }

  // ?escopo=futuros apaga esta semana e as seguintes da série; o passado fica.
  const emSerie = req.query.escopo === 'futuros' && item?.serie_id;
  const { error } = emSerie
    ? await supabase.from('agenda_items').delete().eq('serie_id', item.serie_id).gte('week_start', item.week_start)
    : await supabase.from('agenda_items').delete().eq('id', req.params.id);
  if (error) {
    logError({ company: item?.company, user_id: requester_id, acao: 'excluir_agenda', tabela: 'agenda_items', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({ company: item?.company, user_id: requester_id, acao: 'excluir_agenda', tabela: 'agenda_items', antes: { title: item?.title, escopo: emSerie ? 'futuros' : 'este' } });
  res.json({ ok: true });
});

module.exports = router;
