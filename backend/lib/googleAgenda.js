const crypto   = require('node:crypto');
const supabase = require('../supabase');
const { registrarLog } = require('./auditLog');

// ─────────────────────────────────────────────────────────────
// GOOGLE AGENDA → AGENDA DO ROTA (só leitura)
//
// A pessoa autoriza uma vez (OAuth). O Google devolve uma "chave de
// renovação", que guardamos CIFRADA. Com ela, o servidor busca as reuniões
// da pessoa de tempos em tempos e espelha na Agenda do Rota.
//
// O que o Rota NUNCA faz: criar, alterar ou apagar nada no Google. A
// permissão pedida é só de leitura de eventos.
//
// Privacidade: o compromisso vindo do Google entra como PESSOAL
// (target_type 'pessoal', criado pelo dono). A agenda só devolve item
// pessoal para quem o criou, e a rota da agenda só aceita a própria pessoa
// como quem pede (lib/sessao.js) — então ninguém mais vê, nem o líder, nem
// na mensagem de WhatsApp da semana, que só junta itens gerais/setor/líder.
// ─────────────────────────────────────────────────────────────

const ESCOPO_AGENDA = 'https://www.googleapis.com/auth/calendar.events.readonly';
const ESCOPOS = ['openid', 'email', ESCOPO_AGENDA].join(' ');
const FUSO = 'America/Sao_Paulo';

const CLIENT_ID     = () => process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = () => process.env.GOOGLE_CLIENT_SECRET || '';
const CHAVE         = () => process.env.GOOGLE_TOKEN_CHAVE || '';
// O retorno do Google fica no domínio do app, não no do Render: a
// verificação do Google exige um domínio que a gente comprove ser dono, e
// rotalider.com.br repassa /api/* para o servidor (netlify.toml).
const REDIRECT_URI  = () => process.env.GOOGLE_REDIRECT_URI || 'https://rotalider.com.br/api/google/callback';
const APP_URL       = () => process.env.APP_URL || 'https://rotalider.com.br';

const configurado = () => !!(CLIENT_ID() && CLIENT_SECRET() && CHAVE());

// ─── Cifra da chave de renovação ─────────────────────────────
// AES-256-GCM: além de esconder, acusa se alguém mexeu no texto guardado.
const chaveCifra = () => crypto.createHash('sha256').update('cifra:' + CHAVE()).digest();

function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chaveCifra(), iv);
  const corpo = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), corpo]).toString('base64');
}

function decifrar(b64) {
  const tudo = Buffer.from(String(b64), 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', chaveCifra(), tudo.subarray(0, 12));
  d.setAuthTag(tudo.subarray(12, 28));
  return Buffer.concat([d.update(tudo.subarray(28)), d.final()]).toString('utf8');
}

// ─── "state" assinado ────────────────────────────────────────
// Quem volta do Google chega ao /callback sem a sessão do app (é um
// redirecionamento do navegador). O `state` é o que prova de quem é o
// pedido: id da pessoa + validade, assinados. Sem a assinatura, qualquer
// um poderia ligar a conta Google DELE à agenda de outra pessoa.
const chaveEstado = () => crypto.createHash('sha256').update('estado:' + CHAVE()).digest();
const VALIDADE_ESTADO_MS = 10 * 60 * 1000;

function criarEstado(userId) {
  const corpo = Buffer.from(`${userId}.${Date.now() + VALIDADE_ESTADO_MS}`).toString('base64url');
  const assinatura = crypto.createHmac('sha256', chaveEstado()).update(corpo).digest('base64url');
  return `${corpo}.${assinatura}`;
}

function lerEstado(estado) {
  const [corpo, assinatura] = String(estado || '').split('.');
  if (!corpo || !assinatura) return null;
  const esperada = crypto.createHmac('sha256', chaveEstado()).update(corpo).digest('base64url');
  const a = Buffer.from(assinatura), b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const [userId, ate] = Buffer.from(corpo, 'base64url').toString().split('.');
  if (!userId || !(Number(ate) > Date.now())) return null;
  return userId;
}

function urlDeAutorizacao(userId) {
  const p = new URLSearchParams({
    client_id: CLIENT_ID(),
    redirect_uri: REDIRECT_URI(),
    response_type: 'code',
    scope: ESCOPOS,
    // offline + consent: é o que faz o Google devolver a chave de renovação
    // — sem ela o servidor só conseguiria ler por uma hora.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: criarEstado(userId),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

// ─── Conversa com o Google ───────────────────────────────────
async function postarToken(campos) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID(), client_secret: CLIENT_SECRET(), ...campos }),
  });
  const dados = await r.json().catch(() => ({}));
  return { ok: r.ok, dados };
}

// O e-mail da conta vem dentro do id_token. Ele chega direto do Google, por
// conexão segura, nesta mesma chamada — por isso só lemos o conteúdo, sem
// conferir assinatura.
function emailDoIdToken(idToken) {
  try {
    const meio = String(idToken || '').split('.')[1];
    return JSON.parse(Buffer.from(meio, 'base64url').toString()).email || null;
  } catch { return null; }
}

async function trocarCodigo(code) {
  const { ok, dados } = await postarToken({ code, redirect_uri: REDIRECT_URI(), grant_type: 'authorization_code' });
  if (!ok) throw new Error(dados.error_description || dados.error || 'falha ao trocar o código');
  return {
    refreshToken: dados.refresh_token || null,
    escopos: String(dados.scope || '').split(' '),
    email: emailDoIdToken(dados.id_token),
  };
}

// Erro de renovação "invalid_grant" = a pessoa revogou, trocou a senha, ou
// (no modo de teste do Google) passaram 7 dias. Não adianta tentar de novo:
// só reconectando.
class PrecisaReconectar extends Error {}

async function tokenDeAcesso(refreshToken) {
  const { ok, dados } = await postarToken({ refresh_token: refreshToken, grant_type: 'refresh_token' });
  if (ok && dados.access_token) return dados.access_token;
  if (dados.error === 'invalid_grant') throw new PrecisaReconectar(dados.error_description || 'invalid_grant');
  throw new Error(dados.error_description || dados.error || 'falha ao renovar o acesso');
}

async function revogar(refreshToken) {
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  } catch { /* desconectar aqui vale mesmo se o Google não responder */ }
}

// `singleEvents=true` faz o Google ABRIR as reuniões que se repetem em uma
// ocorrência por data — não precisamos calcular repetição nenhuma.
async function buscarEventos(accessToken, de, ate) {
  const eventos = [];
  let pagina = null;
  for (let i = 0; i < 20; i++) {
    const p = new URLSearchParams({
      timeMin: de, timeMax: ate, singleEvents: 'true', orderBy: 'startTime',
      maxResults: '2500', showDeleted: 'false', timeZone: FUSO,
      ...(pagina ? { pageToken: pagina } : {}),
    });
    const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${p}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(dados?.error?.message || `Google respondeu ${r.status}`);
    eventos.push(...(dados.items || []));
    pagina = dados.nextPageToken;
    if (!pagina) break;
  }
  return eventos;
}

// ─── Do evento do Google para a linha da agenda ──────────────
const DIAS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];

function somarDias(ymd, n) {
  const [a, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

// A agenda guarda por SEMANA (de segunda a domingo) + dia da semana. O
// domingo é o último dia da semana dele: o evento de domingo 18 entra na
// semana que começa na segunda 12.
function semanaEDia(ymd) {
  const [a, m, d] = ymd.split('-').map(Number);
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return { week_start: somarDias(ymd, -((dow + 6) % 7)), day_of_week: DIAS[dow] };
}

// Data e hora no relógio da loja, não do servidor (que roda em UTC).
const formato = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
function localBR(iso) {
  const v = Object.fromEntries(formato.formatToParts(new Date(iso)).map(p => [p.type, p.value]));
  return { data: `${v.year}-${v.month}-${v.day}`, hora: `${v.hour}:${v.minute}` };
}

const recusou = (ev) => (ev.attendees || []).some(a => a.self && a.responseStatus === 'declined');

// Eventos que o Google mostra na agenda mas não são compromisso:
//  • workingLocation — o "local de trabalho" (Escritório / Casa) que o
//    Google da empresa marca TODO DIA. No primeiro teste real (09/10/2026)
//    ele encheu a semana inteira de "Escritório · Dia todo".
//  • birthday — aniversários dos contatos.
// "Fora do escritório" (outOfOffice) e "tempo de foco" (focusTime) ficam:
// são blocos que a própria pessoa marcou, e dizem que ela não está livre.
const NAO_E_COMPROMISSO = ['workingLocation', 'birthday'];

function descricaoDo(ev) {
  const partes = [];
  if (ev.location) partes.push(`Local: ${ev.location}`);
  const link = ev.hangoutLink || (ev.conferenceData?.entryPoints || []).find(e => e.entryPointType === 'video')?.uri;
  if (link) partes.push(`Link: ${link}`);
  return partes.join('\n').slice(0, 500);
}

// Um evento vira uma ou mais linhas. Evento de dia inteiro que dura vários
// dias vira uma linha por dia (até 14 — um evento de férias de um mês não
// precisa encher a agenda inteira).
function linhasDoEvento(ev, { userId, company }) {
  if (ev.status === 'cancelled' || recusou(ev) || NAO_E_COMPROMISSO.includes(ev.eventType)) return [];
  const base = {
    title: String(ev.summary || '(sem título)').slice(0, 200),
    description: descricaoDo(ev),
    target_type: 'pessoal',
    target_value: '',
    company,
    created_by: userId,
    origem: 'google',
    lembrete_minutos: null,
    lembrete_enviado: false,
    serie_id: null,
    cor: null,
  };

  if (ev.start?.date) {
    const ini = ev.start.date;
    const fim = ev.end?.date && ev.end.date > ini ? ev.end.date : somarDias(ini, 1); // fim é exclusivo
    const linhas = [];
    for (let d = ini, i = 0; d < fim && i < 14; d = somarDias(d, 1), i++) {
      linhas.push({ ...base, ...semanaEDia(d), dia_todo: true, time: '', hora_fim: '', google_event_id: `${ev.id}#${d}` });
    }
    return linhas;
  }

  if (ev.start?.dateTime) {
    const ini = localBR(ev.start.dateTime);
    const fim = ev.end?.dateTime ? localBR(ev.end.dateTime) : null;
    // Fim no mesmo dia vira "das X às Y"; atravessando a meia-noite, fica
    // só o início — a agenda não tem compromisso de dois dias.
    const horaFim = fim && fim.data === ini.data && fim.hora > ini.hora ? fim.hora : '';
    return [{ ...base, ...semanaEDia(ini.data), dia_todo: false, time: ini.hora, hora_fim: horaFim, google_event_id: ev.id }];
  }
  return [];
}

// ─── Sincronizar ─────────────────────────────────────────────
// Janela: da semana passada até 8 semanas à frente. O que fica antes dela
// não é tocado — o histórico da agenda continua lá.
function janela() {
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: FUSO });
  const segundaDestaSemana = semanaEDia(hoje).week_start;
  const de = somarDias(segundaDestaSemana, -7);
  const ate = somarDias(segundaDestaSemana, 63);
  // Brasília não tem horário de verão desde 2019: -03:00 vale o ano todo.
  return { de, ate, deIso: `${de}T00:00:00-03:00`, ateIso: `${ate}T00:00:00-03:00` };
}

// Duas sincronizações da mesma pessoa ao mesmo tempo (a tela abrindo e o
// agendamento de 15 em 15 minutos) se atropelariam. Uma por vez.
const emAndamento = new Set();

async function sincronizarUsuario(userId) {
  if (emAndamento.has(userId)) return { ok: true, pulado: true };
  emAndamento.add(userId);
  try {
    const { data: conexao } = await supabase.from('google_conexoes').select('*').eq('user_id', userId).maybeSingle();
    if (!conexao) return { ok: false, motivo: 'sem_conexao' };

    let acesso;
    try {
      acesso = await tokenDeAcesso(decifrar(conexao.refresh_token_cifrado));
    } catch (e) {
      const reconectar = e instanceof PrecisaReconectar;
      await supabase.from('google_conexoes').update({ ultimo_erro: reconectar ? 'reconectar' : String(e.message).slice(0, 300) }).eq('user_id', userId);
      registrarLog('sincronizar_google', 'google_conexoes', 'erro', { user_id: userId, erro: reconectar ? 'precisa reconectar' : e.message });
      return { ok: false, motivo: reconectar ? 'reconectar' : 'erro' };
    }

    const { data: perfil } = await supabase.from('profiles').select('company').eq('id', userId).maybeSingle();
    const company = perfil?.company || null;
    const j = janela();
    const eventos = await buscarEventos(acesso, j.deIso, j.ateIso);

    // Só linhas DENTRO da janela: um evento que começou antes dela e
    // termina dentro geraria dias que a limpeza abaixo nunca alcançaria —
    // e que voltariam duplicados na sincronização seguinte.
    const linhas = eventos
      .flatMap(ev => linhasDoEvento(ev, { userId, company }))
      .filter(l => l.week_start >= j.de && l.week_start < j.ate);

    // Upsert pelo par (dono, id do evento): sincronizar de novo atualiza a
    // mesma linha em vez de criar outra.
    for (let i = 0; i < linhas.length; i += 500) {
      const { error } = await supabase.from('agenda_items')
        .upsert(linhas.slice(i, i + 500), { onConflict: 'created_by,google_event_id' });
      if (error) throw new Error(error.message);
    }

    // O que saiu do Google (cancelado, recusado, apagado, mudou de semana
    // para fora da janela) sai daqui também — mas só dentro da janela.
    const vindos = new Set(linhas.map(l => l.google_event_id));
    const { data: existentes } = await supabase.from('agenda_items')
      .select('id, google_event_id')
      .eq('created_by', userId).eq('origem', 'google')
      .gte('week_start', j.de).lt('week_start', j.ate);
    const sobrando = (existentes || []).filter(x => !vindos.has(x.google_event_id)).map(x => x.id);
    for (let i = 0; i < sobrando.length; i += 500) {
      await supabase.from('agenda_items').delete().in('id', sobrando.slice(i, i + 500));
    }

    await supabase.from('google_conexoes')
      .update({ ultima_sincronizacao: new Date().toISOString(), ultimo_erro: null }).eq('user_id', userId);
    return { ok: true, eventos: eventos.length, linhas: linhas.length, removidas: sobrando.length };
  } catch (e) {
    await supabase.from('google_conexoes').update({ ultimo_erro: String(e.message).slice(0, 300) }).eq('user_id', userId);
    registrarLog('sincronizar_google', 'agenda_items', 'erro', { user_id: userId, erro: e.message });
    return { ok: false, motivo: 'erro' };
  } finally {
    emAndamento.delete(userId);
  }
}

module.exports = {
  ESCOPO_AGENDA, configurado, urlDeAutorizacao, lerEstado, trocarCodigo, cifrar, decifrar,
  revogar, sincronizarUsuario, APP_URL,
  // expostos para teste
  linhasDoEvento, semanaEDia, localBR, janela,
};
