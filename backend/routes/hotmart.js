const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const supabase = require('../supabase');

// Hotmart envia o "hottok" no header x-hotmart-hottok para validar autenticidade
function validarHottok(req) {
  const hottok = process.env.HOTMART_HOTTOK;
  if (!hottok) return true; // se não configurado, aceita (remover em produção)
  return req.headers['x-hotmart-hottok'] === hottok;
}

// POST /api/hotmart/webhook
router.post('/webhook', async (req, res) => {
  // 1. Validar autenticidade
  if (!validarHottok(req)) {
    console.warn('[Hotmart] Hottok inválido:', req.headers['x-hotmart-hottok']);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const evento = req.body?.event;
  const dados  = req.body?.data;

  console.log('[Hotmart] Evento recebido:', evento);

  // 2. Só processa compra aprovada
  if (evento !== 'PURCHASE_APPROVED') {
    return res.status(200).json({ ok: true, msg: 'Evento ignorado' });
  }

  const email = dados?.buyer?.email || dados?.purchase?.buyer?.email;
  const nome  = dados?.buyer?.name  || dados?.purchase?.buyer?.name || '';

  if (!email) {
    console.error('[Hotmart] E-mail não encontrado no payload');
    return res.status(400).json({ error: 'E-mail não encontrado' });
  }

  console.log('[Hotmart] Compra aprovada para:', email);

  // 3. Verificar se já existe cadastro pendente para este e-mail
  const { data: existente } = await supabase
    .from('pending_signups')
    .select('id, used')
    .eq('email', email)
    .single();

  if (existente && !existente.used) {
    // Já tem convite ativo — reenviar e-mail (sem duplicar)
    await enviarEmailAcesso(email, nome, existente.token);
    return res.status(200).json({ ok: true, msg: 'Convite reenviado' });
  }

  // 4. Criar registro de acesso pendente
  const token = crypto.randomUUID();
  const { error } = await supabase
    .from('pending_signups')
    .upsert({ email, token, used: false }, { onConflict: 'email' });

  if (error) {
    console.error('[Hotmart] Erro ao salvar pending_signup:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }

  // 5. Enviar e-mail com link de cadastro via Supabase
  await enviarEmailAcesso(email, nome, token);

  res.status(200).json({ ok: true, msg: 'Acesso liberado, e-mail enviado' });
});

async function enviarEmailAcesso(email, nome, token) {
  const primeiroNome = nome.split(' ')[0] || 'Líder';
  const link = `https://rotalider.com.br/cadastro?token=${token}`;

  // Envia e-mail via Supabase Auth (magic link personalizado)
  // Por ora registramos apenas o log — o e-mail será implementado na próxima etapa
  console.log(`[Hotmart] Link de acesso para ${email}: ${link}`);

  // TODO: integrar com provedor de e-mail (Resend, SendGrid, etc.)
}

// POST /api/hotmart/ativar-conta
// Chamado pelo frontend após criar usuário no Supabase Auth
router.post('/ativar-conta', async (req, res) => {
  const { token, user_id, full_name, email, company } = req.body;

  if (!token || !user_id || !email || !company) {
    return res.status(400).json({ error: 'Dados incompletos.' });
  }

  // 1. Validar token
  const { data: signup, error: tokenErr } = await supabase
    .from('pending_signups')
    .select('id, email, used')
    .eq('token', token)
    .single();

  if (tokenErr || !signup) return res.status(400).json({ error: 'Token inválido.' });
  if (signup.used)         return res.status(400).json({ error: 'Token já utilizado.' });
  if (signup.email !== email) return res.status(400).json({ error: 'E-mail não corresponde.' });

  // 2. Criar tenant
  const { data: tenant, error: tenantErr } = await supabase
    .from('tenants')
    .insert({ name: company, owner_id: user_id, hotmart_email: email, status: 'active' })
    .select()
    .single();

  if (tenantErr) {
    console.error('[Hotmart] Erro ao criar tenant:', tenantErr);
    return res.status(500).json({ error: 'Erro ao criar workspace.' });
  }

  // 3. Criar perfil admin
  const { error: profileErr } = await supabase
    .from('profiles')
    .upsert({
      id:           user_id,
      full_name,
      email,
      company,
      tenant_id:    tenant.id,
      access_level: 'admin',
      aceite_termos_em: new Date().toISOString(),
      aceite_privacidade_em: new Date().toISOString(),
      versao_termos: '1.0',
    });

  if (profileErr) {
    console.error('[Hotmart] Erro ao criar perfil:', profileErr);
    return res.status(500).json({ error: 'Erro ao criar perfil.' });
  }

  // 4. Marcar token como usado
  await supabase
    .from('pending_signups')
    .update({ used: true })
    .eq('token', token);

  console.log(`[Hotmart] Conta ativada: ${email} → tenant ${tenant.id}`);
  res.json({ ok: true, tenant_id: tenant.id });
});

module.exports = router;
