const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');

async function getProfile(id) {
  const { data } = await supabase.from('profiles').select('access_level, company').eq('id', id).single();
  return data;
}

// GET /api/logs?requester_id=&company=&acao=&tabela=&status=&q=
router.get('/', async (req, res) => {
  const { requester_id, company: queryCompany, acao, tabela, status, q } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me || !['admin', 'master'].includes(me.access_level)) return res.status(403).json({ error: 'Acesso negado' });

  let query = supabase
    .from('audit_logs')
    .select('*, usuario:user_id(full_name, email)')
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

  if (acao)   query = query.eq('acao', acao);
  if (tabela) query = query.eq('tabela', tabela);
  if (status) query = query.eq('status', status);
  if (q) query = query.or(`acao.ilike.%${q}%,tabela.ilike.%${q}%,erro_mensagem.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

module.exports = router;
