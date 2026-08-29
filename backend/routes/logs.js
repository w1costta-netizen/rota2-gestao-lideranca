const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');
const { logAction, logError } = require('../lib/auditLog');

async function getProfile(id) {
  const { data } = await supabase.from('profiles').select('access_level, company').eq('id', id).single();
  return data;
}

// POST /api/logs/frontend — registra no log de auditoria algo que aconteceu
// no navegador. Ações feitas direto contra o Supabase (importar estoque) e
// erros de tela (gerar PDF, upload) nunca passavam pelo servidor, então
// simplesmente não existiam no log. Aberto a qualquer usuário logado, porque
// qualquer um pode executar essas ações — mas só grava se o requester_id for
// um perfil real, e a empresa vem sempre do perfil (nunca do corpo da
// requisição), pra ninguém conseguir plantar log em outra loja.
router.post('/frontend', async (req, res) => {
  const { requester_id, acao, tabela, rota, erro_mensagem, status, depois } = req.body;
  if (!requester_id) return res.status(400).json({ error: 'requester_id obrigatório' });

  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Acesso negado' });

  const base = {
    company: me.company,
    user_id: requester_id,
    acao: String(acao || 'acao_tela').slice(0, 80),
    tabela: tabela ? String(tabela).slice(0, 80) : null,
  };

  if (status === 'sucesso') {
    await logAction({ ...base, depois: depois ?? null });
  } else {
    if (!erro_mensagem) return res.status(400).json({ error: 'erro_mensagem obrigatório' });
    await logError({ ...base, rota: rota ? String(rota).slice(0, 200) : null, erro_mensagem });
  }
  res.json({ ok: true });
});

// GET /api/logs?requester_id=&company=&acao=&tabela=&status=&q=&user_id=&data_ini=&data_fim=
router.get('/', async (req, res) => {
  const { requester_id, company: queryCompany, acao, tabela, status, q, user_id, data_ini, data_fim } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me || !['admin', 'master'].includes(me.access_level)) return res.status(403).json({ error: 'Acesso negado' });

  let query = supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  if (me.access_level === 'master') {
    // Master vê todas as empresas, ou filtra por uma específica via query
    if (queryCompany) query = query.eq('company', queryCompany);
  } else {
    // Admin vê a própria empresa + empresas extras liberadas para esta conta
    // (ex.: contas usadas para gerenciar/testar mais de uma loja)
    const { data: extras } = await supabase
      .from('admin_companies')
      .select('company')
      .eq('user_id', requester_id);
    const empresasPermitidas = [me.company, ...(extras || []).map(e => e.company)].filter(Boolean);
    if (empresasPermitidas.length === 0) return res.json([]);
    query = query.in('company', empresasPermitidas);
  }

  if (acao)    query = query.eq('acao', acao);
  if (tabela)  query = query.eq('tabela', tabela);
  if (status)  query = query.eq('status', status);
  if (user_id) query = query.eq('user_id', user_id);
  if (data_ini) query = query.gte('created_at', `${data_ini}T00:00:00`);
  if (data_fim) query = query.lte('created_at', `${data_fim}T23:59:59`);
  if (q) query = query.or(`acao.ilike.%${q}%,tabela.ilike.%${q}%,erro_mensagem.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  // Busca os nomes/e-mails dos usuários separadamente (profiles, não auth.users —
  // full_name e email vivem em profiles, não dá pra fazer embed direto de auth.users)
  const userIds = [...new Set((data || []).map(l => l.user_id).filter(Boolean))];
  let perfis = {};
  if (userIds.length > 0) {
    const { data: profs } = await supabase.from('profiles').select('id, full_name, email').in('id', userIds);
    perfis = Object.fromEntries((profs || []).map(p => [p.id, p]));
  }

  const result = (data || []).map(l => ({ ...l, usuario: perfis[l.user_id] || null }));
  res.json(result);
});

// ── Empresas extras liberadas para a própria conta (admin_companies) ──────
// Uma conta admin normalmente só vê a própria loja. Isso permite que uma
// mesma conta (ex.: usada para gerenciar/testar várias lojas) enxergue
// os logs de outras lojas também, sem precisar virar master.

// GET /api/logs/empresas-extras?requester_id=
router.get('/empresas-extras', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me || !['admin', 'master'].includes(me.access_level)) return res.status(403).json({ error: 'Acesso negado' });

  const { data, error } = await supabase
    .from('admin_companies')
    .select('id, company, created_at')
    .eq('user_id', requester_id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// POST /api/logs/empresas-extras — adiciona uma loja extra à própria conta
router.post('/empresas-extras', async (req, res) => {
  const { requester_id, company } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  if (!company?.trim()) return res.status(400).json({ error: 'Nome da loja obrigatório' });
  const me = await getProfile(requester_id);
  if (!me || !['admin', 'master'].includes(me.access_level)) return res.status(403).json({ error: 'Acesso negado' });

  const { data, error } = await supabase
    .from('admin_companies')
    .insert({ user_id: requester_id, company: company.trim() })
    .select().single();

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Essa loja já está na sua lista' });
    return res.status(500).json({ error: error.message });
  }
  res.json(data);
});

// DELETE /api/logs/empresas-extras/:id — remove uma loja extra da própria conta
router.delete('/empresas-extras/:id', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me || !['admin', 'master'].includes(me.access_level)) return res.status(403).json({ error: 'Acesso negado' });

  // Só pode remover empresas da própria lista
  const { error } = await supabase.from('admin_companies')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', requester_id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
