const { Resend } = require('resend');
const { registrarLog } = require('./auditLog');

// O cliente nasce no primeiro envio, não na carga do módulo. O construtor
// do Resend LANÇA sem chave — e este módulo é carregado na inicialização do
// servidor: uma variável de ambiente faltando derrubaria o app inteiro por
// causa do e-mail, que é efeito secundário. Sem chave, o envio falha, fica
// no log, e o resto continua de pé.
let _resend = null;
function cliente() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

const REMETENTE = 'Rota Líder <acesso@rotalider.com.br>';
// A logo do app, publicada com o site. Hospedada, e não embutida: Gmail
// descarta imagem em base64 e SVG dentro de e-mail.
const LOGO = 'https://rotalider.com.br/icon-192.png';

// Nunca lança: e-mail é efeito secundário, e uma falha dele não pode
// derrubar quem chamou. Devolve { ok, id | erro } e deixa rastro no log.
async function enviarEmail({ para, assunto, html, acao = 'enviar_email', company = null, user_id = null }) {
  try {
    const { data, error } = await cliente().emails.send({ from: REMETENTE, to: para, subject: assunto, html });
    if (error) {
      registrarLog(acao, 'profiles', 'erro', {
        company, user_id, erro: `${para}: ${error.message || JSON.stringify(error)}`,
      });
      return { ok: false, erro: error.message || 'erro do Resend' };
    }
    return { ok: true, id: data?.id };
  } catch (e) {
    registrarLog(acao, 'profiles', 'erro', { company, user_id, erro: `${para}: ${e.message}` });
    return { ok: false, erro: e.message };
  }
}

// A moldura visual dos e-mails do app: mesmo cabeçalho roxo e botão laranja
// do e-mail de acesso, para o cliente reconhecer de quem é.
function moldura({ titulo, corpo, botao = null }) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:600px;">
        <tr>
          <td style="background:#2E1A47;padding:22px 40px;text-align:center;">
            <!-- Imagem HOSPEDADA com alt e o nome em texto ao lado, sempre.
                 Apple Mail, Gmail e Outlook bloqueiam imagem por padrão; sem
                 o texto a marca vira uma caixinha quebrada — foi exatamente
                 o que aconteceu no e-mail do Todoist usado de referência. -->
            <table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>
              <td style="vertical-align:middle;padding-right:12px;">
                <img src="${LOGO}" width="44" height="44" alt="Rota Líder"
                     style="display:block;width:44px;height:44px;border-radius:10px;border:0;">
              </td>
              <td style="vertical-align:middle;">
                <div style="color:#ffffff;font-size:22px;font-weight:700;line-height:1;">Rota Líder</div>
                <div style="color:rgba(255,255,255,.65);font-size:12px;margin-top:4px;">Gestão, Liderança e Produtividade</div>
              </td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px;">
            <h2 style="color:#2E1A47;font-size:19px;margin:0 0 18px;">${titulo}</h2>
            ${corpo}
            ${botao ? `
            <div style="text-align:center;margin:28px 0 8px;">
              <a href="${botao.link}" style="display:inline-block;background:#EE5A24;color:#ffffff;font-size:15px;font-weight:700;padding:14px 36px;border-radius:8px;text-decoration:none;">
                ${botao.texto}
              </a>
            </div>` : ''}
          </td>
        </tr>
        <tr>
          <td style="background:#f9f9f9;padding:16px 40px;text-align:center;">
            <img src="${LOGO}" width="22" height="22" alt="" style="display:inline-block;width:22px;height:22px;border-radius:5px;vertical-align:middle;margin-right:6px;border:0;">
            <span style="color:#666;font-size:12px;font-weight:700;vertical-align:middle;">Rota Líder</span>
            <p style="color:#999;font-size:11px;margin:8px 0 0;line-height:1.6;">
              rotalider.com.br<br>
              {{RODAPE}}
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

module.exports = { enviarEmail, moldura, REMETENTE, LOGO };
