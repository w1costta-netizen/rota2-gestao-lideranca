const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');
const { logAction, logError } = require('../lib/auditLog');

// ─────────────────────────────────────────────────────────────
// Horário de trabalho — Etapa 1: configuração.
//
// A escala é lançada sobre "membros da equipe" (team_members), que não são
// contas do app. Para saber o turno de um USUÁRIO, ele precisa apontar para
// a sua linha da escala (profiles.jornada_membro_id). Esta rota cuida do
// vínculo, da isenção por pessoa e da chave por loja. A trava em si (quem
// está fora do horário não usa o app) vem nas etapas seguintes.
// ─────────────────────────────────────────────────────────────

// Quem mexe nisto: admin da própria loja ou master (na loja que escolher).
async function gestorDaLoja(req, res) {
  const requester_id = req.body?.requester_id || req.query?.requester_id;
  if (!requester_id) { res.status(401).json({ error: 'requester_id obrigatório' }); return null; }
  const { data: me } = await supabase.from('profiles').select('id, access_level, company').eq('id', requester_id).single();
  if (!me || !['admin', 'master'].includes(me.access_level)) { res.status(403).json({ error: 'Acesso negado' }); return null; }
  const pedida = req.body?.company || req.query?.company;
  const company = me.access_level === 'master' ? (pedida || me.company) : me.company;
  if (!company) { res.status(400).json({ error: 'Loja não informada' }); return null; }
  if (me.access_level === 'admin' && pedida && pedida !== me.company) { res.status(403).json({ error: 'Esta loja não é a sua' }); return null; }
  return { ...me, company };
}

// Membros da equipe da loja = as equipes de todos os líderes da loja.
async function membrosDaLoja(company) {
  const { data: donos } = await supabase.from('profiles').select('id, full_name').eq('company', company);
  const ids = (donos || []).map(p => p.id);
  if (!ids.length) return [];
  const nomeDono = Object.fromEntries((donos || []).map(p => [p.id, p.full_name]));
  const { data } = await supabase.from('team_members')
    .select('id, user_id, name, matricula, role, sector, active')
    .in('user_id', ids).eq('active', true).order('name');
  return (data || []).map(m => ({ id: m.id, name: m.name, matricula: m.matricula, role: m.role, sector: m.sector, escala_de: nomeDono[m.user_id] || '' }));
}

// Quem entra na regra: todo mundo que não é admin/master nem isento.
const entraNaRegra = (u) => !['admin', 'master', 'suporte'].includes(u.access_level) && !u.jornada_isento;

// GET /api/jornada/config?requester_id=&company= — chave da loja, membros e situação dos usuários
router.get('/config', async (req, res) => {
  const me = await gestorDaLoja(req, res);
  if (!me) return;

  const [{ data: loja }, membros, { data: usuarios }] = await Promise.all([
    supabase.from('stores').select('id, jornada_ativa, jornada_tolerancia_min').eq('name', me.company).maybeSingle(),
    membrosDaLoja(me.company),
    supabase.from('profiles').select('id, full_name, access_level, active, jornada_membro_id, jornada_isento').eq('company', me.company).eq('active', true).order('full_name'),
  ]);

  const semVinculo = (usuarios || []).filter(u => entraNaRegra(u) && !u.jornada_membro_id);
  res.json({
    jornada_ativa: !!loja?.jornada_ativa,
    tolerancia_min: loja?.jornada_tolerancia_min ?? 15,
    membros,
    usuarios: usuarios || [],
    sem_vinculo: semVinculo.map(u => ({ id: u.id, full_name: u.full_name })),
  });
});

// PUT /api/jornada/config — liga/desliga e tolerância da loja
router.put('/config', async (req, res) => {
  const me = await gestorDaLoja(req, res);
  if (!me) return;

  const { jornada_ativa, tolerancia_min, confirmar_sem_vinculo } = req.body;
  const patch = {};
  if (typeof jornada_ativa === 'boolean') patch.jornada_ativa = jornada_ativa;
  if (tolerancia_min !== undefined) {
    const t = Number(tolerancia_min);
    if (!Number.isInteger(t) || t < 0 || t > 60) return res.status(400).json({ error: 'Tolerância deve ser de 0 a 60 minutos.' });
    patch.jornada_tolerancia_min = t;
  }
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nada para alterar.' });

  // Ligar com gente sem vínculo trava essas pessoas na hora (sem escala =
  // sem app). O gestor precisa ver os nomes e confirmar de propósito.
  if (patch.jornada_ativa === true && !confirmar_sem_vinculo) {
    const { data: usuarios } = await supabase.from('profiles')
      .select('id, full_name, access_level, jornada_membro_id, jornada_isento').eq('company', me.company).eq('active', true);
    const sem = (usuarios || []).filter(u => entraNaRegra(u) && !u.jornada_membro_id);
    if (sem.length) return res.status(409).json({ error: 'Há usuários sem vínculo com a escala.', sem_vinculo: sem.map(u => u.full_name) });
  }

  const { data: antes } = await supabase.from('stores').select('jornada_ativa, jornada_tolerancia_min').eq('name', me.company).maybeSingle();
  const { data, error } = await supabase.from('stores').update(patch).eq('name', me.company).select('jornada_ativa, jornada_tolerancia_min').single();
  if (error) {
    logError({ company: me.company, user_id: me.id, acao: 'configurar_jornada', tabela: 'stores', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({ company: me.company, user_id: me.id, acao: 'configurar_jornada', tabela: 'stores', antes, depois: data });
  res.json(data);
});

// PUT /api/jornada/usuario/:id — vínculo com a escala e isenção de uma pessoa
router.put('/usuario/:id', async (req, res) => {
  const me = await gestorDaLoja(req, res);
  if (!me) return;

  const { data: alvo } = await supabase.from('profiles')
    .select('id, full_name, company, access_level, jornada_membro_id, jornada_isento').eq('id', req.params.id).maybeSingle();
  if (!alvo || alvo.company !== me.company) return res.status(403).json({ error: 'Usuário não é desta loja.' });

  const patch = {};
  if ('jornada_membro_id' in req.body) {
    const mid = req.body.jornada_membro_id || null;
    if (mid) {
      // A linha tem que ser da escala desta loja — e de ninguém mais.
      const membros = await membrosDaLoja(me.company);
      if (!membros.some(m => m.id === mid)) return res.status(400).json({ error: 'Esta linha da escala não é desta loja.' });
      const { data: dono } = await supabase.from('profiles').select('id, full_name').eq('jornada_membro_id', mid).neq('id', alvo.id).maybeSingle();
      if (dono) return res.status(409).json({ error: `Esta linha da escala já está vinculada a ${dono.full_name}.` });
    }
    patch.jornada_membro_id = mid;
  }
  if ('jornada_isento' in req.body) patch.jornada_isento = !!req.body.jornada_isento;
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nada para alterar.' });

  const { data, error } = await supabase.from('profiles').update(patch).eq('id', alvo.id)
    .select('id, full_name, jornada_membro_id, jornada_isento').single();
  if (error) {
    logError({ company: me.company, user_id: me.id, acao: 'jornada_usuario', tabela: 'profiles', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  // Isenção é decisão com peso jurídico: fica com nome, quem fez e quando.
  logAction({
    company: me.company, user_id: me.id,
    acao: 'jornada_isento' in patch && patch.jornada_isento !== alvo.jornada_isento ? 'isentar_jornada' : 'vincular_jornada',
    tabela: 'profiles',
    antes: { usuario: alvo.full_name, jornada_membro_id: alvo.jornada_membro_id, jornada_isento: alvo.jornada_isento },
    depois: { usuario: alvo.full_name, ...patch },
  });
  res.json(data);
});

module.exports = router;
