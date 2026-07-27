const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');

async function getProfile(id) {
  const { data } = await supabase.from('profiles').select('access_level, company').eq('id', id).single();
  return data;
}

// GET /api/organograma?requester_id=&company=
router.get('/', async (req, res) => {
  const { requester_id, company: queryCompany } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Acesso negado' });

  const targetCompany = me.access_level === 'master' ? queryCompany : me.company;
  if (me.access_level === 'master' && !targetCompany) return res.json([]);

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, access_level, sector, reports_to_list, avatar_url')
    .eq('company', targetCompany)
    .order('full_name');

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// PUT /api/organograma/:id  — define lista de líderes de um colaborador
router.put('/:id', async (req, res) => {
  const { requester_id, reports_to_list } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me || !['admin','master'].includes(me.access_level))
    return res.status(403).json({ error: 'Apenas admin pode editar o organograma' });

  const { data, error } = await supabase
    .from('profiles')
    .update({ reports_to_list: reports_to_list || [] })
    .eq('id', req.params.id)
    .select('id, full_name, access_level, sector, reports_to_list, avatar_url')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
