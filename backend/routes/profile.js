const express = require('express');
const router = express.Router();
const supabase = require('../supabase');

// Lista todos os perfis (id, full_name, sector) — para seletores de setor
router.get('/all', async (req, res) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, sector, access_level')
    .order('sector');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Salva ou atualiza perfil — usa a chave secreta para bypassar RLS
// chamado logo após o signUp, antes do e-mail ser confirmado
router.post('/upsert', async (req, res) => {
  const { id, full_name, email, company, employee_id, sector, role, phone, whatsapp, access_level } = req.body;
  if (!id || !email) return res.status(400).json({ error: 'id e email são obrigatórios' });

  const { data, error } = await supabase.from('profiles').upsert({
    id, full_name, email, company: company || '',
    employee_id: employee_id || '', sector: sector || '',
    role: role || '', phone: phone || '',
    whatsapp: whatsapp || phone || '',
    access_level: access_level || 'lider',
  }, { onConflict: 'id' }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
