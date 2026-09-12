const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const supabase = require('../supabase');
const { logAction, logError, registrarLog } = require('../lib/auditLog');
const { enviarPush } = require('../lib/notificacoes');
const {
  lojaPorEmail, bloquearLoja, reativarLoja, definirAcessoAte,
  calcularAcessoAte, bloquearVencidas, avisarMaster,
} = require('../lib/assinatura');
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

// Hotmart envia o "hottok" no header x-hotmart-hottok para validar autenticidade
// FECHA quando não está configurado. A versão anterior aceitava qualquer
// requisição se HOTMART_HOTTOK faltasse no ambiente — qualquer pessoa podia
// forjar uma compra aprovada e ganhar acesso, e, agora que o webhook também
// bloqueia, forjar um reembolso e derrubar a loja de um cliente. Webhook de
// pagamento sem segredo é porta aberta; se o segredo faltar, o log diz e o
// alerta de "compra sem acesso" avisa na primeira compra real.
function validarHottok(req) {
  const hottok = process.env.HOTMART_HOTTOK;
  if (!hottok) {
    console.error('[Hotmart] HOTMART_HOTTOK não configurado — webhook recusado');
    return false;
  }
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

  const email = dados?.buyer?.email || dados?.purchase?.buyer?.email || dados?.subscriber?.email;
  const nome  = dados?.buyer?.name  || dados?.purchase?.buyer?.name  || dados?.subscriber?.name || '';

  if (!email) {
    console.error('[Hotmart] E-mail não encontrado no payload');
    registrarLog('webhook_hotmart', 'pending_signups', 'erro', { rota: req.originalUrl, erro: `${evento} sem e-mail no payload` });
    return res.status(400).json({ error: 'E-mail não encontrado' });
  }

  // 2. O que acontece quando o dinheiro VOLTA ou PARA.
  //
  // Antes, tudo que não fosse compra aprovada era "Evento ignorado": quem
  // pedia reembolso no dia 6 ficava com o app — e com os usuários da loja
  // inteira — para sempre. Um mês pago comprava acesso permanente.
  const BLOQUEIA_NA_HORA = {
    PURCHASE_REFUNDED:   'reembolso na Hotmart',
    PURCHASE_CHARGEBACK: 'chargeback na Hotmart',
  };
  if (BLOQUEIA_NA_HORA[evento]) {
    const { loja } = await lojaPorEmail(email);
    registrarLog('webhook_hotmart', 'stores', 'sucesso', { company: loja?.name, depois: { evento, email } });
    if (!loja) return res.status(200).json({ ok: true, msg: 'Sem loja para este e-mail' });
    const r = await bloquearLoja(loja, BLOQUEIA_NA_HORA[evento], { rota: req.originalUrl });
    return res.status(200).json({ ok: true, msg: 'Loja bloqueada', ...r });
  }

  // Cancelou a assinatura: o que foi pago continua valendo. A pessoa que
  // cancela no dia 10 comprou 30 dias, e cortar na hora é cortar o que ela
  // pagou — o CDC não deixa e a disputa vem certa. A loja vence na data
  // "acesso até", e a checagem diária bloqueia quando ela passar.
  if (evento === 'SUBSCRIPTION_CANCELLATION') {
    const { loja } = await lojaPorEmail(email);
    registrarLog('webhook_hotmart', 'stores', 'sucesso', { company: loja?.name, depois: { evento, email } });
    if (!loja) return res.status(200).json({ ok: true, msg: 'Sem loja para este e-mail' });
    if (!loja.acesso_ate) {
      // Loja de antes desta regra, sem data: dá 30 dias em vez de bloquear
      // no escuro.
      const d = new Date(); d.setUTCDate(d.getUTCDate() + 30);
      await definirAcessoAte(loja, d.toISOString().slice(0, 10), { origem: 'cancelamento sem data anterior' });
    }
    await avisarMaster('📉 Assinatura cancelada',
      `${loja.name} cancelou. O acesso vale até ${loja.acesso_ate || 'daqui a 30 dias'} e bloqueia sozinho depois.`,
      req.originalUrl);
    return res.status(200).json({ ok: true, msg: 'Cancelamento registrado' });
  }

  // Atraso e contestação: a Hotmart tem carência própria e tenta de novo.
  // Bloquear aqui seria punir cartão recusado por engano. Só avisa.
  if (['PURCHASE_DELAYED', 'PURCHASE_PROTEST'].includes(evento)) {
    const { loja } = await lojaPorEmail(email);
    registrarLog('webhook_hotmart', 'stores', 'sucesso', { company: loja?.name, depois: { evento, email } });
    if (loja) await avisarMaster('⚠️ Pagamento com problema',
      `${loja.name}: ${evento === 'PURCHASE_DELAYED' ? 'pagamento atrasado' : 'pagamento contestado'}. Sem bloqueio por enquanto.`,
      req.originalUrl);
    return res.status(200).json({ ok: true, msg: 'Aviso registrado' });
  }

  if (evento !== 'PURCHASE_APPROVED') {
    registrarLog('webhook_hotmart', 'pending_signups', 'sucesso', { depois: { evento, email, tratado: false } });
    return res.status(200).json({ ok: true, msg: 'Evento ignorado' });
  }

  console.log('[Hotmart] Compra aprovada para:', email);
  const acesso = calcularAcessoAte(dados);
  registrarLog('webhook_hotmart', 'pending_signups', 'sucesso', { depois: { evento, email, nome, acesso_ate: acesso.data, origem: acesso.origem } });

  // 3a. RENOVAÇÃO ou RECOMPRA: a conta já existe.
  //
  // Assinatura mensal manda PURCHASE_APPROVED todo mês. O código antigo não
  // sabia disso: gerava um token novo e mandava "Criar minha conta agora"
  // para quem já tinha conta — todo mês. Se a loja estiver bloqueada
  // (reembolso, vencimento), a compra nova reativa.
  {
    const { perfil, loja } = await lojaPorEmail(email);
    if (perfil && loja) {
      if (!loja.active) {
        await reativarLoja(loja, { rota: req.originalUrl, acessoAte: acesso.data });
        await avisarMaster('✅ Loja reativada por nova compra', `${loja.name} voltou. Acesso até ${acesso.data}.`, req.originalUrl);
        return res.status(200).json({ ok: true, msg: 'Loja reativada', acesso_ate: acesso.data });
      }
      await definirAcessoAte(loja, acesso.data, { origem: `renovação (${acesso.origem})` });
      return res.status(200).json({ ok: true, msg: 'Renovação registrada', acesso_ate: acesso.data });
    }
  }

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
    .upsert({ email, token, used: false, acesso_ate: acesso.data }, { onConflict: 'email' });

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
      // Este é o pior erro possível do sistema: a pessoa PAGOU, a Hotmart
      // confirmou, e o acesso não chegou. Antes ficava só no console do
      // servidor — ninguém olha console — e o webhook respondia "ok" mesmo
      // assim. O cliente ficava sem produto e sem ninguém saber.
      console.error('[Resend] Erro ao enviar e-mail:', error);
      await avisarFalhaDeAcesso(email, error?.message || JSON.stringify(error));
    } else {
      console.log('[Resend] E-mail enviado com sucesso. ID:', data?.id);
    }
  } catch (err) {
    console.error('[Resend] Exceção ao enviar e-mail:', err.message);
    await avisarFalhaDeAcesso(email, err?.message || 'exceção sem mensagem');
  }
}

// Registra no log e avisa quem pode agir. O link de acesso vai junto: com
// ele dá para socorrer o cliente na hora, mandando por WhatsApp, sem
// precisar recriar nada.
async function avisarFalhaDeAcesso(email, motivo) {
  try {
    registrarLog('enviar_email_acesso', 'pending_signups', 'erro', {
      rota: '/api/hotmart/webhook',
      erro: `COMPRA SEM ACESSO ENTREGUE — ${email}: ${motivo}`,
    });

    const { data: donos } = await supabase
      .from('profiles').select('id').eq('access_level', 'master').eq('active', true);
    const ids = (donos || []).map(d => d.id);
    if (ids.length) {
      enviarPush(ids, '🚨 Compra sem acesso entregue',
        `${email} pagou e o e-mail de acesso falhou. Precisa de socorro manual.`,
        'geral', { rota: '/api/hotmart/webhook' });
    }
  } catch (e) {
    console.error('[Hotmart] Falha ao avisar sobre e-mail não entregue:', e.message);
  }
}

// POST /api/hotmart/verificar-vencimentos
//
// Chamado uma vez por dia pelo agendamento do GitHub. Bloqueia as lojas cuja
// data "acesso até" já passou. Não tem segredo de propósito: só aplica uma
// regra que já é verdade no banco — quem chamar de fora não muda nada além
// de antecipar em algumas horas o que o próprio agendamento faria.
router.post('/verificar-vencimentos', async (req, res) => {
  const r = await bloquearVencidas({ rota: req.originalUrl });
  res.status(r.ok ? 200 : 500).json(r);
});

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
    .select('id, email, used, acesso_ate')
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
    // A data de acesso veio da compra e fica na loja: é ela que a
    // checagem diária olha. Sem data, a loja nunca vence — e é o que
    // acontece com as lojas de antes desta regra.
    // MODULOS PREMIUM COMECAM VAZIOS, explicitamente. Vendas, Estoque, Flyers
    // e Conferencia sao contratados a parte; a assinatura da Hotmart nao os
    // inclui. Sem esta linha a loja nascia com o PADRAO da coluna no banco -
    // e o padrao entregava tudo de graca. O master libera modulo por modulo
    // em Lojas quando o cliente contratar.
    .insert({ name: company, active: true, created_by: user_id, approved_by: user_id,
              acesso_ate: signup.acesso_ate || null, modulos_premium: [] })
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
      // Explícito de propósito. Sem isto o tutorial de boas-vindas depende
      // do valor padrão da coluna, que vive fora do código — e é nesse
      // tutorial que a pessoa é convidada a ativar as notificações. Se
      // falhasse, todo cliente que compra começaria sem notificação e sem
      // nunca ter sido perguntado.
      first_access: true,
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
