const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');
const { registrarLog } = require('../lib/auditLog');
const { enviarEmail, moldura } = require('../lib/email');

// ─────────────────────────────────────────────────────────────
// Resumo diário por e-mail: tarefas pendentes e agenda de hoje.
//
// E-MAIL, e não push, porque chega com o app fechado, sem depender de
// permissão de notificação nem de Modo de Baixo Consumo. E DISPARADO PELO
// SERVIDOR, e não pelo navegador: os lembretes antigos só saíam quando alguém
// estava com o app aberto — este sai do agendamento diário, com a loja
// fechada e o celular no bolso.
//
// UM E-MAIL POR MANHÃ, e só para quem tem algo a dizer. Um e-mail por
// tarefa vira ruído em duas semanas, e ruído vira "marcar como spam" — e
// spam marcado derruba a reputação do domínio que TAMBÉM entrega o e-mail
// de acesso de quem acabou de pagar. Quem não tem tarefa nem agenda hoje
// não recebe nada.
// ─────────────────────────────────────────────────────────────

const APP = 'https://rotalider.com.br';
const API = 'https://rota2-gestao-lideranca.onrender.com';
const DIAS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
const DIAS_LONGO = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

// O servidor roda em UTC; a loja, em Brasília. Tudo aqui é calculado no
// horário do Brasil, senão "hoje" vira "ontem" às 21h.
function hojeBrasil() {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const iso = d.toISOString().slice(0, 10);
  const dow = d.getUTCDay();
  // Segunda desta semana, no formato que a agenda usa como week_start.
  const seg = new Date(d); seg.setUTCDate(d.getUTCDate() - ((dow + 6) % 7));
  const segIso = seg.toISOString().slice(0, 10);
  const fim = new Date(seg); fim.setUTCDate(seg.getUTCDate() + 7);
  return { iso, dow, dia: DIAS[dow], porExtenso: `${DIAS_LONGO[dow]}, ${iso.slice(8)} de ${MESES[d.getUTCMonth()]}`,
           semanaDe: segIso, semanaAte: fim.toISOString().slice(0, 10) };
}

const fmtData = (iso) => iso ? `${iso.slice(8)}/${iso.slice(5, 7)}` : '';
const escapa = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function montarCorpo({ nome, hoje, atrasadas, deHoje, agenda }) {
  const primeiro = (nome || '').split(' ')[0] || 'Líder';
  const li = (t) => `<li style="margin:0 0 7px;color:#333;font-size:14px;line-height:1.5;">${t}</li>`;
  const bloco = (titulo, cor, itens) => `
    <div style="margin:0 0 20px;">
      <div style="font-size:12px;font-weight:700;color:${cor};text-transform:uppercase;letter-spacing:.5px;margin:0 0 8px;">${titulo}</div>
      <ul style="margin:0;padding:0 0 0 18px;">${itens.join('')}</ul>
    </div>`;

  const partes = [];
  if (atrasadas.length) partes.push(bloco(`🔴 ${atrasadas.length} tarefa(s) atrasada(s)`, '#C62828',
    atrasadas.map(t => li(`<b>${escapa(t.title)}</b> <span style="color:#888;">— venceu ${fmtData(t.due_date)}</span>`))));
  if (deHoje.length) partes.push(bloco(`📋 ${deHoje.length} tarefa(s) para hoje`, '#2E1A47',
    deHoje.map(t => li(`<b>${escapa(t.title)}</b>${t.due_time ? ` <span style="color:#888;">às ${t.due_time.slice(0, 5)}</span>` : ''}`))));
  if (agenda.length) partes.push(bloco('📅 Agenda de hoje', '#1565C0',
    agenda.map(a => li(`<span style="font-weight:700;color:#1565C0;">${(a.time || '').slice(0, 5) || '—'}</span> &nbsp;${escapa(a.title)}`))));

  // Uma frase que resume o dia antes da lista — é o que a pessoa lê se não
  // ler mais nada. O Todoist faz isso, e faz bem.
  const nA = atrasadas.length, nH = deHoje.length, nG = agenda.length;
  let frase;
  if (nA && !nH)      frase = `Você não tem tarefa vencendo hoje, mas tem ${nA} atrasada${nA > 1 ? 's' : ''}. Vale resolver ou reagendar — atrasada não some sozinha.`;
  else if (nA && nH)  frase = `Você tem ${nH} tarefa${nH > 1 ? 's' : ''} para hoje e ${nA} atrasada${nA > 1 ? 's' : ''}. Comece pelas atrasadas.`;
  else if (nH)        frase = `Você tem ${nH} tarefa${nH > 1 ? 's' : ''} para hoje e nada atrasado. Bom sinal.`;
  else                frase = `Nenhuma tarefa pendente hoje. Só a agenda.`;
  if (nG) frase += ` E ${nG} compromisso${nG > 1 ? 's' : ''} na agenda.`;

  return `
    <p style="color:#444;font-size:15px;margin:0 0 6px;">Bom dia, ${escapa(primeiro)}.</p>
    <p style="color:#888;font-size:13px;margin:0 0 16px;">${hoje.porExtenso}</p>
    <p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 22px;">${frase}</p>
    ${partes.join('')}`;
}

// POST /api/resumo/diario
//
// Chamado pelo agendamento às 06:00 de Brasília. Sem segredo: a única coisa
// que faz é mandar o resumo de hoje para quem ainda não recebeu hoje — chamar
// de novo não manda duas vezes, e chamar de fora só antecipa em horas o que
// o próprio agendamento faria.
router.post('/diario', async (req, res) => {
  const hoje = hojeBrasil();

  const { data: pessoas, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, company, sector')
    .eq('active', true)
    .eq('email_resumo', true)
    .not('company', 'is', null)
    .not('email', 'is', null)
    .or(`ultimo_resumo_email.is.null,ultimo_resumo_email.neq.${hoje.iso}`);
  if (error) return res.status(500).json({ error: error.message });

  const porEmpresa = {};
  (pessoas || []).forEach(p => (porEmpresa[p.company] = porEmpresa[p.company] || []).push(p));

  const resultado = { enviados: 0, semNada: 0, falhas: 0, empresas: Object.keys(porEmpresa).length };

  for (const [company, gente] of Object.entries(porEmpresa)) {
    // Uma consulta por empresa, e não por pessoa: 26 pessoas numa loja
    // seriam 52 consultas; assim são 2.
    const [{ data: tarefas }, { data: agendaSemana }] = await Promise.all([
      supabase.from('tarefas')
        .select('id, title, due_date, due_time, assigned_to, status')
        .eq('company', company).neq('status', 'concluida').lte('due_date', hoje.iso),
      supabase.from('agenda_items')
        .select('id, title, time, day_of_week, target_type, target_value, created_by')
        .eq('company', company).eq('day_of_week', hoje.dia)
        .gte('week_start', hoje.semanaDe).lt('week_start', hoje.semanaAte),
    ]);

    for (const p of gente) {
      const minhas = (tarefas || []).filter(t => t.assigned_to === p.id);
      const atrasadas = minhas.filter(t => t.due_date < hoje.iso).sort((a, b) => a.due_date.localeCompare(b.due_date));
      const deHoje    = minhas.filter(t => t.due_date === hoje.iso).sort((a, b) => (a.due_time || '').localeCompare(b.due_time || ''));

      // A mesma regra de visibilidade da tela da Agenda, para o e-mail não
      // mostrar compromisso que a pessoa não veria no app.
      const agenda = (agendaSemana || []).filter(a =>
        a.created_by === p.id
        || a.target_type === 'geral'
        || (a.target_type === 'setor' && a.target_value === p.sector)
        || (a.target_type === 'lider' && String(a.target_value || '').split(',').includes(p.id)))
        .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

      // Marca antes de enviar. Se o envio falhar, a pessoa fica sem hoje e
      // recebe amanhã; se marcasse depois e o processo caísse no meio, uma
      // segunda chamada mandaria em dobro para quem já recebeu.
      await supabase.from('profiles').update({ ultimo_resumo_email: hoje.iso }).eq('id', p.id);

      if (!atrasadas.length && !deHoje.length && !agenda.length) { resultado.semNada++; continue; }

      const partes = [];
      if (atrasadas.length) partes.push(`${atrasadas.length} atrasada(s)`);
      if (deHoje.length)    partes.push(`${deHoje.length} para hoje`);
      if (agenda.length)    partes.push(`${agenda.length} na agenda`);

      const html = moldura({
        titulo: 'O seu dia no Rota Líder',
        corpo: montarCorpo({ nome: p.full_name, hoje, atrasadas, deHoje, agenda }),
        botao: { texto: 'Abrir o Rota Líder', link: APP },
      }).replace('{{RODAPE}}',
        `Você recebe este resumo porque tem tarefas ou compromissos no dia. ` +
        `<a href="${API}/api/resumo/descadastrar?id=${p.id}" style="color:#999;">Não quero mais receber</a>`);

      const r = await enviarEmail({
        para: p.email, assunto: `Seu dia: ${partes.join(', ')}`, html,
        acao: 'enviar_resumo_diario', company, user_id: p.id,
      });
      if (r.ok) resultado.enviados++; else resultado.falhas++;

      // O Resend limita requisições por segundo; sem a pausa, uma loja
      // grande derrubaria a metade dos envios com 429.
      await new Promise(f => setTimeout(f, 600));
    }
  }

  registrarLog('resumo_diario', 'profiles', resultado.falhas ? 'erro' : 'sucesso', {
    depois: { ...resultado, data: hoje.iso },
    ...(resultado.falhas ? { erro: `${resultado.falhas} envio(s) falharam — ver enviar_resumo_diario` } : {}),
  });
  res.json({ ok: true, data: hoje.iso, ...resultado });
});

// ── Diário de Bordo para o gerente ───────────────────────────
//
// Às 03:00 de Brasília, quem comprou o acesso (stores.created_by) recebe o
// que a equipe lançou no diário no dia anterior. É o relato do dia chegando
// na caixa de entrada antes de a loja abrir — sem precisar entrar no app.
//
// Um e-mail por loja por dia, marcado em stores.ultimo_diario_email ANTES do
// envio (mesma razão do resumo pessoal: falhou, fica sem hoje; não manda em
// dobro). Dia sem relato não gera e-mail.

const CATEGORIAS_BASE_DIARIO = {
  resultado: { nome: 'Resultado', cor: '#10b981' }, operacao: { nome: 'Operação', cor: '#3b82f6' },
  clima: { nome: 'Clima', cor: '#06b6d4' },         seguranca: { nome: 'Segurança', cor: '#ef4444' },
  equipe: { nome: 'Equipe', cor: '#8b5cf6' },       cliente: { nome: 'Cliente', cor: '#f59e0b' },
  outro: { nome: 'Outro', cor: '#6b7280' },
};

function ontemBrasil() {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
  d.setUTCDate(d.getUTCDate() - 1);
  const iso = d.toISOString().slice(0, 10);
  const dow = d.getUTCDay();
  return { iso, porExtenso: `${DIAS_LONGO[dow]}, ${iso.slice(8)} de ${MESES[d.getUTCMonth()]}` };
}

function montarCorpoDiario({ nome, loja, ontem, relatos, categorias }) {
  const primeiro = (nome || '').split(' ')[0] || 'Gerente';
  const cat = (chave) => categorias[chave] || { nome: chave, cor: '#6b7280' };

  // Contagem por categoria primeiro: é a leitura de 5 segundos.
  const porCat = {};
  relatos.forEach(r => { porCat[r.categoria] = (porCat[r.categoria] || 0) + 1; });
  const chips = Object.entries(porCat).sort((a, b) => b[1] - a[1]).map(([k, n]) => {
    const c = cat(k);
    return `<span style="display:inline-block;margin:0 6px 6px 0;padding:3px 10px;border-radius:99px;background:${c.cor}18;color:${c.cor};font-size:12px;font-weight:700;">${escapa(c.nome)} · ${n}</span>`;
  }).join('');

  const itens = relatos.map(r => {
    const c = cat(r.categoria);
    const quando = r.hora ? String(r.hora).slice(0, 5) : '';
    const outroDia = r.data !== ontem.iso ? ` <span style="color:#888;">(sobre ${fmtData(r.data)})</span>` : '';
    return `
      <div style="border-left:4px solid ${c.cor};padding:8px 12px;margin:0 0 10px;background:#fafafa;border-radius:0 8px 8px 0;">
        <div style="font-size:11.5px;color:#888;margin:0 0 3px;">
          <span style="color:${c.cor};font-weight:700;">${escapa(c.nome)}</span>
          ${quando ? ` · ${quando}` : ''} · ${escapa(r.autor?.full_name || 'Alguém')}${outroDia}
        </div>
        <div style="font-size:14px;color:#333;line-height:1.55;white-space:pre-wrap;">${escapa(r.texto)}</div>
      </div>`;
  }).join('');

  const seguranca = porCat.seguranca || 0;
  const frase = `${relatos.length} relato${relatos.length > 1 ? 's' : ''} lançado${relatos.length > 1 ? 's' : ''} pela equipe da ${escapa(loja)}`
    + (seguranca ? ` — <b style="color:#C62828;">${seguranca} de segurança</b>.` : '.');

  return `
    <p style="color:#444;font-size:15px;margin:0 0 6px;">Bom dia, ${escapa(primeiro)}.</p>
    <p style="color:#888;font-size:13px;margin:0 0 16px;">Diário de Bordo de ${ontem.porExtenso}</p>
    <p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 14px;">${frase}</p>
    <div style="margin:0 0 18px;">${chips}</div>
    ${itens}`;
}

// POST /api/resumo/diario-bordo — chamado pelo agendamento às 03:00 de Brasília
router.post('/diario-bordo', async (req, res) => {
  const ontem = ontemBrasil();

  const { data: lojas, error } = await supabase
    .from('stores').select('id, name, created_by, ultimo_diario_email')
    .eq('active', true)
    .or(`ultimo_diario_email.is.null,ultimo_diario_email.neq.${ontem.iso}`);
  if (error) return res.status(500).json({ error: error.message });

  const resultado = { enviados: 0, semRelato: 0, semDestinatario: 0, falhas: 0, lojas: (lojas || []).length };

  for (const loja of lojas || []) {
    // Marca antes de qualquer coisa: a loja só é processada uma vez por dia.
    await supabase.from('stores').update({ ultimo_diario_email: ontem.iso }).eq('id', loja.id);

    // Relatos DE ontem, mais os lançados ontem sobre outros dias (comum:
    // registrar hoje o que aconteceu anteontem). Sem duplicar.
    const inicioOntem = `${ontem.iso}T03:00:00Z`;           // 00:00 Brasília
    const fimOntem    = new Date(new Date(inicioOntem).getTime() + 86400000).toISOString();
    const [{ data: doDia }, { data: lancadosOntem }] = await Promise.all([
      supabase.from('diario_bordo').select('id, data, hora, categoria, texto, created_at, autor:user_id(full_name)')
        .eq('company', loja.name).eq('data', ontem.iso),
      supabase.from('diario_bordo').select('id, data, hora, categoria, texto, created_at, autor:user_id(full_name)')
        .eq('company', loja.name).gte('created_at', inicioOntem).lt('created_at', fimOntem).neq('data', ontem.iso),
    ]);
    const vistos = new Set();
    const relatos = [...(doDia || []), ...(lancadosOntem || [])]
      .filter(r => !vistos.has(r.id) && vistos.add(r.id))
      .sort((a, b) => (a.data + (a.hora || '') + a.created_at).localeCompare(b.data + (b.hora || '') + b.created_at));
    if (!relatos.length) { resultado.semRelato++; continue; }

    // Quem comprou o acesso. Se esse perfil não serve (desligado, sem e-mail,
    // de outra loja — caso das lojas criadas pelo master), caem nos admins
    // da loja, que é quem faz o papel de gerente ali.
    let destinatarios = [];
    if (loja.created_by) {
      const { data: dono } = await supabase.from('profiles')
        .select('id, full_name, email, company, active, email_diario')
        .eq('id', loja.created_by).maybeSingle();
      if (dono?.active && dono.email && dono.company === loja.name) destinatarios = [dono];
    }
    if (!destinatarios.length) {
      const { data: admins } = await supabase.from('profiles')
        .select('id, full_name, email, company, active, email_diario')
        .eq('company', loja.name).eq('access_level', 'admin').eq('active', true).not('email', 'is', null);
      destinatarios = admins || [];
    }
    destinatarios = destinatarios.filter(p => p.email_diario !== false);
    if (!destinatarios.length) { resultado.semDestinatario++; continue; }

    const { data: extras } = await supabase.from('diario_categorias').select('chave, nome, cor').eq('company', loja.name);
    const categorias = { ...CATEGORIAS_BASE_DIARIO };
    (extras || []).forEach(c => { categorias[c.chave] = { nome: c.nome, cor: c.cor || '#6b7280' }; });

    for (const p of destinatarios) {
      const html = moldura({
        titulo: 'Diário de Bordo de ontem',
        corpo: montarCorpoDiario({ nome: p.full_name, loja: loja.name, ontem, relatos, categorias }),
        botao: { texto: 'Abrir o Rota Líder', link: APP },
      }).replace('{{RODAPE}}',
        `Você recebe este resumo porque é o gerente da loja ${escapa(loja.name)} no Rota Líder. ` +
        `<a href="${API}/api/resumo/descadastrar-diario?id=${p.id}" style="color:#999;">Não quero mais receber</a>`);

      const r = await enviarEmail({
        para: p.email, assunto: `Diário de Bordo ${fmtData(ontem.iso)}: ${relatos.length} relato${relatos.length > 1 ? 's' : ''} — ${loja.name}`,
        html, acao: 'enviar_resumo_diario_bordo', company: loja.name, user_id: p.id,
      });
      if (r.ok) resultado.enviados++; else resultado.falhas++;
      await new Promise(f => setTimeout(f, 600));
    }
  }

  registrarLog('resumo_diario_bordo', 'stores', resultado.falhas ? 'erro' : 'sucesso', {
    depois: { ...resultado, data: ontem.iso },
    ...(resultado.falhas ? { erro: `${resultado.falhas} envio(s) falharam — ver enviar_resumo_diario_bordo` } : {}),
  });
  res.json({ ok: true, data: ontem.iso, ...resultado });
});

// GET /api/resumo/descadastrar-diario?id= — desliga só o e-mail do diário
router.get('/descadastrar-diario', async (req, res) => {
  const { id } = req.query;
  const pagina = (msg) => `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Rota Líder</title></head>
<body style="margin:0;font-family:Arial,sans-serif;background:#f5f5f5;display:flex;align-items:center;justify-content:center;min-height:100vh;">
<div style="background:#fff;border-radius:12px;padding:32px 36px;max-width:420px;text-align:center;">
<h2 style="color:#2E1A47;margin:0 0 12px;">Rota Líder</h2>
<p style="color:#444;font-size:15px;line-height:1.6;margin:0;">${msg}</p></div></body></html>`;

  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).send(pagina('Link inválido.'));
  const { data, error } = await supabase.from('profiles')
    .update({ email_diario: false }).eq('id', id).select('id, company').maybeSingle();
  if (error || !data) return res.status(404).send(pagina('Não encontramos este cadastro.'));
  registrarLog('descadastrar_diario_email', 'profiles', 'sucesso', { company: data.company, user_id: id });
  res.send(pagina('Pronto. Você não vai mais receber o Diário de Bordo por e-mail.<br><br>' +
    'Se mudar de ideia, dá para religar no seu perfil dentro do app.'));
});

// GET /api/resumo/descadastrar?id=
//
// Um clique, sem login: é o que o rodapé do e-mail promete, e é o que evita
// o botão de spam. O id é o UUID do perfil — não adivinhável, e o pior que
// alguém com o link faz é desligar o próprio resumo.
router.get('/descadastrar', async (req, res) => {
  const { id } = req.query;
  const pagina = (msg) => `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Rota Líder</title></head>
<body style="margin:0;font-family:Arial,sans-serif;background:#f5f5f5;display:flex;align-items:center;justify-content:center;min-height:100vh;">
<div style="background:#fff;border-radius:12px;padding:32px 36px;max-width:420px;text-align:center;">
<h2 style="color:#2E1A47;margin:0 0 12px;">Rota Líder</h2>
<p style="color:#444;font-size:15px;line-height:1.6;margin:0;">${msg}</p></div></body></html>`;

  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).send(pagina('Link inválido.'));

  const { data, error } = await supabase.from('profiles')
    .update({ email_resumo: false }).eq('id', id).select('id, company').maybeSingle();
  if (error || !data) return res.status(404).send(pagina('Não encontramos este cadastro.'));

  registrarLog('descadastrar_resumo_email', 'profiles', 'sucesso', { company: data.company, user_id: id });
  res.send(pagina('Pronto. Você não vai mais receber o resumo diário por e-mail.<br><br>' +
    'Se mudar de ideia, dá para religar no seu perfil dentro do app.'));
});

// PUT /api/resumo/preferencia  { requester_id, email_resumo }
router.put('/preferencia', async (req, res) => {
  const { requester_id, email_resumo, email_diario } = req.body;
  if (!requester_id) return res.status(400).json({ error: 'requester_id obrigatório' });
  const mudancas = {};
  if (email_resumo !== undefined) mudancas.email_resumo = !!email_resumo;
  if (email_diario !== undefined) mudancas.email_diario = !!email_diario;
  if (!Object.keys(mudancas).length) return res.status(400).json({ error: 'Nada para alterar' });
  const { data, error } = await supabase.from('profiles')
    .update(mudancas).eq('id', requester_id).select('id, email_resumo, email_diario, company').single();
  if (error) return res.status(500).json({ error: error.message });
  registrarLog('preferencia_resumo_email', 'profiles', 'sucesso', { company: data.company, user_id: requester_id, depois: mudancas });
  res.json(data);
});

module.exports = router;
// Exposto para a previa do e-mail em desenvolvimento.
module.exports.montarCorpo = montarCorpo;
module.exports.hojeBrasil = hojeBrasil;
module.exports.montarCorpoDiario = montarCorpoDiario;
module.exports.ontemBrasil = ontemBrasil;
