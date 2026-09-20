const express  = require('express');
const router   = express.Router();
const supabase = require('../supabase');
const { registrarLog } = require('../lib/auditLog');
const { avisarMaster } = require('../lib/assinatura');

// ─────────────────────────────────────────────────────────────
// Avaliação do app: estrelas (1–5) + depoimento + autorização de uso.
//
// Uma avaliação por pessoa, editável. O depoimento só pode ir para rede
// social ou página de vendas com `autoriza_publicar` marcado — é a pessoa
// quem decide, e a tela do master filtra por isso.
//
// Nota baixa (≤ 3) NÃO é vitrine: vira aviso por push ao master, com o
// texto. Reclamação resolvida rápido é o que vira depoimento depois.
//
// CONVITE: 14 dias depois do cadastro, no Dashboard, uma vez; "agora não"
// adia por 60 dias; quem já avaliou não vê mais.
// ─────────────────────────────────────────────────────────────

const DIAS_ATE_CONVIDAR = 14;
const DIAS_ADIAMENTO = 60;
const diasDesde = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / 864e5 : 0);

async function getPerfil(id) {
  if (!id) return null;
  const { data } = await supabase.from('profiles')
    .select('id, full_name, role, sector, company, access_level, active, avatar_url, created_at, avaliacao_adiada_em')
    .eq('id', id).maybeSingle();
  if (!data || data.active === false) return null;
  return data;
}

// GET /api/avaliacoes/minha?requester_id=
router.get('/minha', async (req, res) => {
  const me = await getPerfil(req.query.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  const { data } = await supabase.from('avaliacoes').select('*').eq('user_id', me.id).maybeSingle();
  const convidar = !data
    && diasDesde(me.created_at) >= DIAS_ATE_CONVIDAR
    && (!me.avaliacao_adiada_em || diasDesde(me.avaliacao_adiada_em) >= DIAS_ADIAMENTO);
  res.json({
    avaliacao: data || null,
    convidar,
    // Como o depoimento vai aparecer, para a pessoa ver antes de autorizar.
    assinatura: { nome: me.full_name, cargo: me.role, setor: me.sector, loja: me.company, avatar_url: me.avatar_url },
  });
});

// POST /api/avaliacoes  { requester_id, estrelas, texto, autoriza_publicar }
router.post('/', async (req, res) => {
  const me = await getPerfil(req.body?.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  const estrelas = parseInt(req.body?.estrelas, 10);
  if (!(estrelas >= 1 && estrelas <= 5)) return res.status(400).json({ error: 'Escolha de 1 a 5 estrelas.' });
  const texto = String(req.body?.texto || '').trim().slice(0, 1000) || null;
  const autoriza = !!req.body?.autoriza_publicar && !!texto;   // sem texto não há o que publicar

  const { data: antes } = await supabase.from('avaliacoes').select('id').eq('user_id', me.id).maybeSingle();
  const { data, error } = await supabase.from('avaliacoes')
    .upsert({ user_id: me.id, company: me.company, estrelas, texto, autoriza_publicar: autoriza, updated_at: antes ? new Date().toISOString() : null }, { onConflict: 'user_id' })
    .select().single();
  if (error) {
    registrarLog('avaliar_app', 'avaliacoes', 'erro', { company: me.company, user_id: me.id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: 'Não foi possível salvar a avaliação.' });
  }
  registrarLog('avaliar_app', 'avaliacoes', 'sucesso', { company: me.company, user_id: me.id, depois: { estrelas, autoriza_publicar: autoriza, editou: !!antes } });

  if (estrelas <= 3) {
    avisarMaster(`⭐ Avaliação ${estrelas}/5 — ${me.full_name}`,
      `${me.company || 'sem loja'}: ${texto ? texto.slice(0, 120) : 'sem comentário'}`, req.originalUrl).catch(() => {});
  }
  res.json(data);
});

// POST /api/avaliacoes/adiar  { requester_id } — "agora não"
router.post('/adiar', async (req, res) => {
  const me = await getPerfil(req.body?.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  await supabase.from('profiles').update({ avaliacao_adiada_em: new Date().toISOString() }).eq('id', me.id);
  res.json({ ok: true });
});

// GET /api/avaliacoes/todas?requester_id= — só o master (dono do produto)
router.get('/todas', async (req, res) => {
  const me = await getPerfil(req.query.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  if (me.access_level !== 'master') return res.status(403).json({ error: 'Só o dono do produto vê os depoimentos.' });

  const { data, error } = await supabase.from('avaliacoes')
    .select('*, pessoa:user_id(full_name, role, sector, company, avatar_url)')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: 'Não foi possível carregar.' });

  const lista = data || [];
  const media = lista.length ? lista.reduce((s, a) => s + a.estrelas, 0) / lista.length : 0;
  res.json({
    avaliacoes: lista,
    resumo: {
      total: lista.length,
      media: Math.round(media * 10) / 10,
      autorizadas: lista.filter(a => a.autoriza_publicar && a.texto).length,
      porEstrela: [5, 4, 3, 2, 1].map(n => ({ estrelas: n, qtd: lista.filter(a => a.estrelas === n).length })),
    },
  });
});

module.exports = router;
