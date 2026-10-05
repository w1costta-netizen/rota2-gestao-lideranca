const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');
const { logAction, logError, registrarLog } = require('../lib/auditLog');

// Níveis que existem. Qualquer outro valor é recusado: o nível manda em
// tudo que a pessoa vê e pode, e um valor solto (erro de digitação, ou uma
// chamada montada à mão pedindo 'master') não pode entrar no banco.
// 'master' e 'suporte' ficam de fora de propósito — são do dono do sistema,
// e quem os concede é o próprio master, na trava logo abaixo.
const NIVEIS_DA_LOJA = ['admin', 'supervisor', 'lider', 'analista', 'auxiliar_adm', 'colaborador'];
function nivelPermitido(nivel, euSouMaster) {
  if (nivel === undefined) return true;
  if (NIVEIS_DA_LOJA.includes(nivel)) return true;
  return euSouMaster && ['master', 'suporte'].includes(nivel);
}

// Verifica se o solicitante é admin da empresa
async function requireAdmin(req, res, next) {
  const { requester_id } = req.body || req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const { data: me } = await supabase.from('profiles').select('access_level, company').eq('id', requester_id).single();
  if (!me || !['admin','master'].includes(me.access_level)) return res.status(403).json({ error: 'Acesso negado' });
  req.adminCompany = me.company;
  next();
}

// GET /api/admin/users?requester_id=&company=
router.get('/users', async (req, res) => {
  const { requester_id, company: queryCompany } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const { data: me } = await supabase.from('profiles').select('access_level, company').eq('id', requester_id).single();
  if (!me || !['admin','master','supervisor','lider'].includes(me.access_level)) return res.status(403).json({ error: 'Acesso negado' });

  // master pode ver qualquer empresa passada via query, admin vê apenas a sua
  const targetCompany = me.access_level === 'master' ? (queryCompany || me.company) : me.company;

  const ehLideranca = ['supervisor','lider'].includes(me.access_level);

  let query = supabase
    .from('profiles')
    .select(`id, full_name, email, role, sector, access_level, permissions, permissions_versao, phone, active, first_access, created_at, avatar_url${ehLideranca ? ', reports_to_list' : ''}`)
    .neq('id', requester_id)
    .order('full_name');

  if (targetCompany) query = query.eq('company', targetCompany);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  // Supervisor/líder não gerenciam usuários — só precisam da lista pra delegar
  // tarefas e agenda. Por isso enxergam apenas quem reporta a eles no
  // organograma, e não a empresa inteira (que continua exclusiva do admin).
  if (ehLideranca) {
    return res.json((data || [])
      .filter(u => (u.reports_to_list || []).includes(requester_id))
      .map(({ reports_to_list, ...u }) => u));
  }

  res.json(data);
});

// POST /api/admin/users — cria usuário e perfil
// O Supabase responde em inglês, e a mensagem ia crua para a tela do
// cliente: "A user with this email address has already been registered".
// Quem está cadastrando a equipe não tem obrigação de ler inglês, e uma
// mensagem que não se entende vira chamado de suporte.
//
// Traduz só o que acontece de verdade; o resto continua passando, porque
// mensagem estranha em inglês ainda é melhor do que erro genérico que
// esconde a causa. O texto original vai inteiro para o log.
function traduzErroDeConta(mensagem = '') {
  const m = mensagem.toLowerCase();
  if (m.includes('already been registered') || m.includes('already registered')) {
    return 'Este e-mail já está cadastrado no Rota Líder. Se a pessoa já teve acesso '
         + 'antes, use outro e-mail — ou fale com o suporte para reaproveitar a conta.';
  }
  if (m.includes('password') && m.includes('6')) {
    return 'A senha provisória precisa ter pelo menos 6 caracteres.';
  }
  if (m.includes('invalid') && m.includes('email')) {
    return 'E-mail inválido. Confira se não faltou algum caractere.';
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Muitas tentativas seguidas. Espere um minuto e tente de novo.';
  }
  return mensagem;
}

router.post('/users', async (req, res) => {
  const { requester_id, full_name, email, role, sector, access_level, password, phone, company: reqCompany } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });

  const { data: me } = await supabase.from('profiles').select('access_level, company').eq('id', requester_id).single();
  if (!me || !['admin','master'].includes(me.access_level)) return res.status(403).json({ error: 'Acesso negado' });

  if (!full_name || !email || !password) return res.status(400).json({ error: 'full_name, email e password são obrigatórios' });

  // Só o master cria conta de Suporte: ela enxerga os logs de TODAS as lojas.
  // Sem esta trava, o admin de um cliente poderia criar uma e ver os erros
  // (e os dados dentro deles) das outras empresas.
  if (access_level === 'suporte' && me.access_level !== 'master') {
    return res.status(403).json({ error: 'Apenas o master pode criar contas de Suporte.' });
  }
  if (!nivelPermitido(access_level, me.access_level === 'master')) {
    return res.status(400).json({ error: 'Nível de acesso inválido.' });
  }

  const targetCompany = reqCompany !== undefined ? (reqCompany || null) : me.company;
  // A conta de Suporte não pertence a uma loja — ela atende todas.
  if (me.access_level === 'master' && !targetCompany && access_level !== 'suporte') {
    return res.status(400).json({ error: 'Selecione a loja do usuário.' });
  }

  // Cria o usuário no Supabase Auth
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authErr) {
    logError({ company: targetCompany, user_id: requester_id, acao: 'criar_usuario', tabela: 'profiles', rota: req.originalUrl, erro_mensagem: authErr.message });
    return res.status(400).json({ error: traduzErroDeConta(authErr.message) });
  }

  const newUserId = authData.user.id;

  // Cria o perfil
  const { data: profile, error: profErr } = await supabase.from('profiles').upsert({
    id: newUserId,
    full_name: full_name.trim(),
    email,
    company: targetCompany,
    role: role || '',
    sector: sector || '',
    access_level: access_level || 'lider',
    phone: phone || null,
    active: true,
    first_access: true,
    created_by: requester_id,
  }, { onConflict: 'id' }).select().single();

  if (profErr) {
    logError({ company: targetCompany, user_id: requester_id, acao: 'criar_usuario', tabela: 'profiles', rota: req.originalUrl, erro_mensagem: profErr.message });
    return res.status(500).json({ error: profErr.message });
  }
  logAction({ company: targetCompany, user_id: requester_id, acao: 'criar_usuario', tabela: 'profiles', depois: { id: newUserId, full_name: profile.full_name, email, access_level: profile.access_level } });
  res.json(profile);
});

// PUT /api/admin/users/:id — atualiza perfil
router.put('/users/:id', async (req, res) => {
  const { requester_id } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });

  const { data: me } = await supabase.from('profiles').select('access_level, company').eq('id', requester_id).single();
  if (!me || !['admin','master'].includes(me.access_level)) return res.status(403).json({ error: 'Acesso negado' });

  const { full_name, role, sector, access_level, active, permissions, phone, email, password } = req.body;

  const { data: antes } = await supabase.from('profiles')
    .select('full_name, role, sector, access_level, active, permissions, phone, email')
    .eq('id', req.params.id).single();

  // Mesma trava da criação: só o master mexe em conta de Suporte, seja para
  // promover alguém ou para alterar uma conta de Suporte já existente.
  const mexendoComSuporte = access_level === 'suporte' || antes?.access_level === 'suporte';
  if (mexendoComSuporte && me.access_level !== 'master') {
    return res.status(403).json({ error: 'Apenas o master pode gerenciar contas de Suporte.' });
  }
  if (!nivelPermitido(access_level, me.access_level === 'master')) {
    return res.status(400).json({ error: 'Nível de acesso inválido.' });
  }

  // Atualiza e-mail e/ou senha no Supabase Auth se fornecido
  const authUpdates = {};
  if (email)    authUpdates.email    = email;
  if (password) authUpdates.password = password;
  if (Object.keys(authUpdates).length > 0) {
    const { error: authErr } = await supabase.auth.admin.updateUserById(req.params.id, authUpdates);
    if (authErr) {
      logError({ company: me.company, user_id: requester_id, acao: 'editar_usuario', tabela: 'profiles', rota: req.originalUrl, erro_mensagem: authErr.message });
      return res.status(500).json({ error: 'Erro ao atualizar auth: ' + authErr.message });
    }
    if (email) await supabase.from('profiles').update({ email }).eq('id', req.params.id);
  }

  const updates = {};
  if (full_name    !== undefined) updates.full_name    = full_name;
  if (role         !== undefined) updates.role         = role;
  if (sector       !== undefined) updates.sector       = sector;
  if (access_level !== undefined) updates.access_level = access_level;
  if (active       !== undefined) updates.active       = active;
  if ('permissions' in req.body)  updates.permissions  = permissions;
  // Versão do catálogo em que a lista personalizada foi decidida. Serve
  // para separar "o gestor tirou este módulo" de "o módulo ainda nem
  // existia quando a lista foi montada" — sem isso, quem tem lista
  // personalizada nunca mais recebe nada novo.
  if ('permissions_versao' in req.body) {
    const v = req.body.permissions_versao;
    updates.permissions_versao = Number.isInteger(v) && v > 0 && v < 1000 ? v : null;
  }
  if (phone        !== undefined) updates.phone        = phone;

  const { data, error } = await supabase.from('profiles').update(updates).eq('id', req.params.id).select().single();
  if (error) {
    logError({ company: me.company, user_id: requester_id, acao: 'editar_usuario', tabela: 'profiles', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({ company: me.company, user_id: requester_id, acao: 'editar_usuario', tabela: 'profiles', antes, depois: updates });
  res.json(data);
});

// DELETE /api/admin/users/:id — desativa usuário
router.delete('/users/:id', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });

  const { data: me } = await supabase.from('profiles').select('access_level, company').eq('id', requester_id).single();
  if (!me || !['admin','master'].includes(me.access_level)) return res.status(403).json({ error: 'Acesso negado' });

  const { data: alvo } = await supabase.from('profiles').select('full_name, email').eq('id', req.params.id).single();
  const { error } = await supabase.from('profiles').update({ active: false }).eq('id', req.params.id);
  if (error) {
    logError({ company: me.company, user_id: requester_id, acao: 'desativar_usuario', tabela: 'profiles', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({ company: me.company, user_id: requester_id, acao: 'desativar_usuario', tabela: 'profiles', antes: alvo, depois: { active: false } });
  res.json({ ok: true });
});

// DELETE /api/admin/users/:id/permanent — exclui usuário permanentemente
router.delete('/users/:id/permanent', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });

  const { data: me } = await supabase.from('profiles').select('access_level, company').eq('id', requester_id).single();
  if (!me || !['admin','master'].includes(me.access_level)) return res.status(403).json({ error: 'Acesso negado' });

  // Garante que admin só exclui usuários da própria empresa
  const { data: target } = await supabase.from('profiles').select('company, full_name, email').eq('id', req.params.id).single();
  if (me.access_level === 'admin') {
    if (!target || target.company !== me.company) return res.status(403).json({ error: 'Acesso negado' });
  }

  // Remove o perfil e o usuário do Auth
  await supabase.from('profiles').delete().eq('id', req.params.id);
  const { error } = await supabase.auth.admin.deleteUser(req.params.id);
  if (error) {
    logError({ company: me.company, user_id: requester_id, acao: 'excluir_usuario_permanente', tabela: 'profiles', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({ company: me.company, user_id: requester_id, acao: 'excluir_usuario_permanente', tabela: 'profiles', antes: target });
  res.json({ ok: true });
});

// GET /api/admin/roles?company=
router.get('/roles', async (req, res) => {
  const { company } = req.query;
  if (!company) return res.status(400).json({ error: 'company obrigatório' });
  const { data, error } = await supabase.from('company_roles').select('*').eq('company', company).order('sort_order');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/admin/roles — adiciona cargo customizado
router.post('/roles', async (req, res) => {
  const { requester_id, role_name, company: bodyCompany } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });

  const { data: me } = await supabase.from('profiles').select('access_level, company').eq('id', requester_id).single();
  if (!me || !['admin','master'].includes(me.access_level)) return res.status(403).json({ error: 'Acesso negado' });
  if (!role_name) return res.status(400).json({ error: 'role_name obrigatório' });

  const targetCompany = me.access_level === 'master' ? bodyCompany : me.company;
  if (!targetCompany) return res.status(400).json({ error: 'company obrigatório para master' });

  const { data, error } = await supabase.from('company_roles')
    .upsert({ company: targetCompany, role_name: role_name.trim() }, { onConflict: 'company,role_name' })
    .select().single();
  if (error) {
    registrarLog('criar_cargo', 'company_roles', 'erro', { company: targetCompany, user_id: requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: error.message });
  }
  registrarLog('criar_cargo', 'company_roles', 'sucesso', { company: targetCompany, user_id: requester_id, depois: { role_name: data.role_name } });
  res.json(data);
});

// DELETE /api/admin/roles/:id
router.delete('/roles/:id', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const { data: me } = await supabase.from('profiles').select('access_level').eq('id', requester_id).single();
  if (!me || !['admin','master'].includes(me.access_level)) return res.status(403).json({ error: 'Acesso negado' });

  const { data: antes } = await supabase.from('company_roles').select('role_name, company').eq('id', req.params.id).maybeSingle();
  const { error } = await supabase.from('company_roles').delete().eq('id', req.params.id);
  if (error) {
    registrarLog('excluir_cargo', 'company_roles', 'erro', { company: antes?.company, user_id: requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: error.message });
  }
  registrarLog('excluir_cargo', 'company_roles', 'sucesso', { company: antes?.company, user_id: requester_id, antes: { role_name: antes?.role_name } });
  res.json({ ok: true });
});

// ── SETORES ──────────────────────────────────────────────────────

// GET /api/admin/sectors?company=
router.get('/sectors', async (req, res) => {
  const { company } = req.query;
  if (!company) return res.status(400).json({ error: 'company obrigatório' });
  const { data, error } = await supabase.from('company_sectors').select('*').eq('company', company).order('sort_order');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/admin/sectors
// PUT /api/admin/sectors/:id  { requester_id, efetivo_minimo }
//
// Quantas pessoas o setor precisa ter na loja para operar. É a régua do
// alerta do Painel da Loja: sem ela o semáforo só compara o setor com o
// pico dele mesmo, que mostra a variação do dia mas não diz se está ruim.
//
// Vazio volta a null de propósito — significa "não definido", e é diferente
// de zero. Zero seria uma loja que pode operar o setor sem ninguém.
router.put('/sectors/:id', async (req, res) => {
  const { requester_id, efetivo_minimo } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const { data: me } = await supabase.from('profiles').select('access_level, company').eq('id', requester_id).single();
  if (!me || !['admin', 'master'].includes(me.access_level)) return res.status(403).json({ error: 'Acesso negado' });

  const bruto = efetivo_minimo;
  const valor = (bruto === '' || bruto === null || bruto === undefined)
    ? null
    : Math.max(0, Math.min(999, parseInt(bruto, 10) || 0));

  const { data, error } = await supabase.from('company_sectors')
    .update({ efetivo_minimo: valor }).eq('id', req.params.id)
    .select('id, sector_name, efetivo_minimo, company').single();
  if (error) {
    logError({ company: me.company, user_id: requester_id, acao: 'definir_efetivo_minimo',
               tabela: 'company_sectors', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({ company: data.company, user_id: requester_id, acao: 'definir_efetivo_minimo',
              tabela: 'company_sectors', depois: { setor: data.sector_name, efetivo_minimo: valor } });
  res.json(data);
});

router.post('/sectors', async (req, res) => {
  const { requester_id, sector_name, company: bodyCompany } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const { data: me } = await supabase.from('profiles').select('access_level, company').eq('id', requester_id).single();
  if (!me || !['admin','master'].includes(me.access_level)) return res.status(403).json({ error: 'Acesso negado' });
  if (!sector_name) return res.status(400).json({ error: 'sector_name obrigatório' });

  const targetCompany = me.access_level === 'master' ? bodyCompany : me.company;
  if (!targetCompany) return res.status(400).json({ error: 'company obrigatório para master' });

  const { data, error } = await supabase.from('company_sectors')
    .upsert({ company: targetCompany, sector_name: sector_name.trim() }, { onConflict: 'company,sector_name' })
    .select().single();
  if (error) {
    registrarLog('criar_setor', 'company_sectors', 'erro', { company: targetCompany, user_id: requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: error.message });
  }
  registrarLog('criar_setor', 'company_sectors', 'sucesso', { company: targetCompany, user_id: requester_id, depois: { sector_name: data.sector_name } });
  res.json(data);
});

// DELETE /api/admin/sectors/:id
router.delete('/sectors/:id', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const { data: me } = await supabase.from('profiles').select('access_level').eq('id', requester_id).single();
  if (!me || !['admin','master'].includes(me.access_level)) return res.status(403).json({ error: 'Acesso negado' });

  const { data: antes } = await supabase.from('company_sectors').select('sector_name, company').eq('id', req.params.id).maybeSingle();
  const { error } = await supabase.from('company_sectors').delete().eq('id', req.params.id);
  if (error) {
    registrarLog('excluir_setor', 'company_sectors', 'erro', { company: antes?.company, user_id: requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: error.message });
  }
  registrarLog('excluir_setor', 'company_sectors', 'sucesso', { company: antes?.company, user_id: requester_id, antes: { sector_name: antes?.sector_name } });
  res.json({ ok: true });
});


// ─────────────────────────────────────────────────────────────
// MIGRAÇÃO ÚNICA — arquivos de evidência para a pasta da loja
//
// Até 05/10/2026 o balde `evidencias` era aberto e o banco guardava o
// endereço permanente do arquivo. Isso deixava as fotos de dentro da loja
// de TODAS as empresas acessíveis a qualquer pessoa com a chave pública,
// e não dava para fechar: sem a loja no caminho, não existe regra para o
// banco conferir.
//
// Esta rota move cada arquivo para `<loja>/<caminho antigo>` e troca, no
// banco, o endereço pelo CAMINHO. Roda uma vez; depois dela é que o balde
// pode ser fechado (supabase_fechar_evidencias.sql).
//
// A migração é guiada pelo BANCO, não pela lista de arquivos: é a linha
// que sabe de qual loja o arquivo é. Arquivo que nenhuma linha aponta
// fica para trás de propósito — ninguém o exibe, e depois do fechamento
// ele deixa de ser alcançável.
//
// Idempotente: valor que já é caminho (não começa com http) é pulado, e
// arquivo já movido não é movido de novo. Pode rodar quantas vezes
// quiser; a segunda não faz nada.
// ─────────────────────────────────────────────────────────────
router.post('/migrar-evidencias', async (req, res) => {
  const { requester_id, confirmar } = req.body || {};
  const { data: me } = await supabase.from('profiles').select('access_level').eq('id', requester_id).maybeSingle();
  if (!me || me.access_level !== 'master') return res.status(403).json({ error: 'Só o master roda a migração.' });

  const BALDE = 'evidencias';
  const MARCA = '/evidencias/';
  const pastaDaLoja = (c) => String(c || '').replace(/\//g, '-');
  const caminhoDoEndereco = (v) => {
    if (typeof v !== 'string' || !/^https?:\/\//.test(v)) return null;
    const i = v.indexOf(MARCA);
    if (i < 0) return null;
    try { return decodeURIComponent(v.slice(i + MARCA.length).split('?')[0]); }
    catch { return null; }
  };

  // Tudo que guarda arquivo: a tabela, o campo, e como descobrir a loja.
  const ALVOS = [
    { tabela: 'relatorios_fotograficos', campo: 'pdf_url',       select: 'id, company, pdf_url' },
    { tabela: 'relatorio_fotos',         campo: 'photo_url',     select: 'id, photo_url, relatorio:relatorio_id(company)' },
    { tabela: 'relatorio_fotos',         campo: 'evidencia_url', select: 'id, evidencia_url, relatorio:relatorio_id(company)' },
    { tabela: 'campanhas',               campo: 'flyer_pdf_url', select: 'id, company, flyer_pdf_url' },
    { tabela: 'campanha_evidencias',     campo: 'foto_url',      select: 'id, foto_url, campanha:campanha_id(company)' },
  ];

  const resumo = { movidos: 0, linhas: 0, pulados: 0, semLoja: 0, erros: [] };
  const planoTodo = [];

  for (const alvo of ALVOS) {
    // Paginado: o Supabase corta em 1000 linhas sem avisar.
    for (let de = 0; ; de += 1000) {
      const { data, error } = await supabase.from(alvo.tabela).select(alvo.select).range(de, de + 999);
      if (error) { resumo.erros.push(`${alvo.tabela}.${alvo.campo}: ${error.message}`); break; }
      if (!data?.length) break;
      for (const linha of data) {
        const valor = linha[alvo.campo];
        if (!valor) continue;
        const antigo = caminhoDoEndereco(valor);
        if (!antigo) { resumo.pulados++; continue; }       // já é caminho
        const company = linha.company || linha.relatorio?.company || linha.campanha?.company;
        if (!company) { resumo.semLoja++; continue; }
        const pasta = pastaDaLoja(company);
        if (antigo.startsWith(pasta + '/')) { resumo.pulados++; continue; }
        planoTodo.push({ ...alvo, id: linha.id, de: antigo, para: `${pasta}/${antigo}` });
      }
      if (data.length < 1000) break;
    }
  }

  // Sem `confirmar: true` só mostra o que faria. Mexer em arquivo de
  // cliente sem deixar olhar antes não é coisa que se faça.
  if (!confirmar) return res.json({ simulacao: true, total: planoTodo.length, resumo, exemplos: planoTodo.slice(0, 10) });

  for (const item of planoTodo) {
    const { error: errMove } = await supabase.storage.from(BALDE).move(item.de, item.para);
    // "not found" aqui quer dizer que o arquivo já foi movido numa rodada
    // anterior e só o banco ficou para trás — seguir e atualizar a linha.
    const jaMovido = errMove && /not found|exists/i.test(errMove.message || '');
    if (errMove && !jaMovido) { resumo.erros.push(`${item.de}: ${errMove.message}`); continue; }
    if (!errMove) resumo.movidos++;

    const { error: errLinha } = await supabase.from(item.tabela)
      .update({ [item.campo]: item.para }).eq('id', item.id);
    if (errLinha) resumo.erros.push(`${item.tabela}#${item.id}: ${errLinha.message}`);
    else resumo.linhas++;
  }

  registrarLog('migrar_evidencias', 'storage', resumo.erros.length ? 'erro' : 'sucesso', {
    user_id: requester_id, depois: { movidos: resumo.movidos, linhas: resumo.linhas, erros: resumo.erros.length },
  });
  res.json({ simulacao: false, ...resumo });
});

module.exports = router;
