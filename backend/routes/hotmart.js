const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const supabase = require('../supabase');
const { logAction, logError, registrarLog } = require('../lib/auditLog');
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

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
    registrarLog('webhook_hotmart', 'pending_signups', 'erro', { rota: req.originalUrl, erro: 'Hottok inválido — requisição rejeitada' });
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
    registrarLog('webhook_hotmart', 'pending_signups', 'erro', { rota: req.originalUrl, erro: 'Compra aprovada sem e-mail no payload' });
    return res.status(400).json({ error: 'E-mail não encontrado' });
  }

  console.log('[Hotmart] Compra aprovada para:', email);
  registrarLog('webhook_hotmart', 'pending_signups', 'sucesso', { depois: { evento, email, nome } });

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

  console.log(`[Hotmart] Enviando e-mail de acesso para ${email}: ${link}`);

  try {
    const { data, error } = await resend.emails.send({
      from: 'Rota Líder <acesso@rotalider.com.br>',
      to: email,
      subject: 'Seu acesso ao Rota Líder está pronto!',
      html: `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:600px;">
        <!-- Header -->
        <tr>
          <td style="background:#2E1A47;padding:32px 40px;text-align:center;">
            <div style="display:inline-block;width:48px;height:48px;background:#EE5A24;border-radius:50%;margin-bottom:12px;">
              <svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                <circle cx="24" cy="24" r="16" fill="none" stroke="white" stroke-width="1.5"/>
                <polygon points="24,9 27,24 24,21 21,24" fill="white"/>
                <polygon points="24,39 27,24 24,27 21,24" fill="rgba(255,255,255,0.4)"/>
                <circle cx="24" cy="24" r="2.5" fill="white"/>
              </svg>
            </div>
            <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;">Rota Líder</h1>
            <p style="color:rgba(255,255,255,0.7);margin:4px 0 0;font-size:14px;">Gestão de Liderança</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <h2 style="color:#2E1A47;font-size:20px;margin:0 0 16px;">Olá, ${primeiroNome}! 👋</h2>
            <p style="color:#444;font-size:15px;line-height:1.6;margin:0 0 16px;">
              Sua compra foi confirmada e seu acesso ao <strong>Rota Líder</strong> está pronto.<br>
              Clique no botão abaixo para criar sua conta e configurar seu workspace.
            </p>
            <div style="text-align:center;margin:32px 0;">
              <a href="${link}" style="display:inline-block;background:#EE5A24;color:#ffffff;font-size:16px;font-weight:700;padding:16px 40px;border-radius:8px;text-decoration:none;">
                Criar minha conta agora
              </a>
            </div>
            <p style="color:#888;font-size:13px;line-height:1.6;margin:0 0 8px;">
              Ou copie e cole este link no seu navegador:
            </p>
            <p style="background:#f5f5f5;border-radius:6px;padding:12px;font-size:12px;color:#555;word-break:break-all;margin:0 0 24px;">
              ${link}
            </p>
            <p style="color:#aaa;font-size:12px;margin:0;">
              Este link é pessoal e intransferível. Use-o para criar sua conta de acesso ao sistema.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f9f9f9;padding:20px 40px;text-align:center;border-top:1px solid #eee;">
            <p style="color:#bbb;font-size:12px;margin:0;">
              Rota Líder · rotalider.com.br<br>
              Dúvidas? Responda este e-mail.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    });

    if (error) {
      console.error('[Resend] Erro ao enviar e-mail:', error);
    } else {
      console.log('[Resend] E-mail enviado com sucesso. ID:', data?.id);
    }
  } catch (err) {
    console.error('[Resend] Exceção ao enviar e-mail:', err.message);
  }
}

// GET /api/hotmart/verificar-token?token=
// Usado pela tela de cadastro para validar o link recebido por e-mail.
// Fica no backend (service role) para não expor a tabela pending_signups
// direto pro cliente via chave anon do Supabase.
router.get('/verificar-token', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'token obrigatório' });

  const { data, error } = await supabase
    .from('pending_signups')
    .select('email, used')
    .eq('token', token)
    .single();

  if (error || !data || data.used) return res.status(404).json({ error: 'Token inválido ou já utilizado.' });
  res.json({ email: data.email });
});

// POST /api/hotmart/ativar-conta
// Chamado pelo frontend após criar usuário no Supabase Auth
router.post('/ativar-conta', async (req, res) => {
  const { token, user_id, full_name, email, company, aceite_termos } = req.body;

  if (!token || !user_id || !email || !company) {
    return res.status(400).json({ error: 'Dados incompletos.' });
  }
  if (!aceite_termos) {
    return res.status(400).json({ error: 'É necessário aceitar os Termos de Uso e a Política de Privacidade.' });
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

  // 2. Criar a loja (workspace) já ativa — quem comprou na Hotmart não precisa
  // esperar aprovação de ninguém. Segue o mesmo modelo usado no resto do app
  // (tabela "stores" + profiles.company), não uma tabela "tenants" separada.
  const { data: store, error: storeErr } = await supabase
    .from('stores')
    .insert({ name: company, active: true, created_by: user_id, approved_by: user_id })
    .select()
    .single();

  if (storeErr) {
    console.error('[Hotmart] Erro ao criar loja:', storeErr);
    logError({ company, user_id, acao: 'ativar_conta_hotmart', tabela: 'stores', rota: req.originalUrl, erro_mensagem: storeErr.message });
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
      access_level: 'admin',
      active:       true,
      aceite_termos_em: new Date().toISOString(),
      aceite_privacidade_em: new Date().toISOString(),
      versao_termos: '1.0',
    });

  if (profileErr) {
    console.error('[Hotmart] Erro ao criar perfil:', profileErr);
    logError({ company, user_id, acao: 'ativar_conta_hotmart', tabela: 'profiles', rota: req.originalUrl, erro_mensagem: profileErr.message });
    return res.status(500).json({ error: 'Erro ao criar perfil.' });
  }

  // 4. Marcar token como usado
  await supabase
    .from('pending_signups')
    .update({ used: true })
    .eq('token', token);

  console.log(`[Hotmart] Conta ativada: ${email} → loja ${store.id}`);
  logAction({
    company, user_id,
    acao: 'ativar_conta_hotmart', tabela: 'stores',
    depois: { store_id: store.id, loja: company, email },
  });
  res.json({ ok: true, store_id: store.id });
});

module.exports = router;
