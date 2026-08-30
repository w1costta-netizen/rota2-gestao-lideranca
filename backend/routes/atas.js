const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');
const { enviarPush } = require('../lib/notificacoes');
const { logAction, logError, registrarLog } = require('../lib/auditLog');

async function getRequester(requester_id) {
  if (!requester_id) return null;
  const { data } = await supabase.from('profiles').select('id, company, full_name').eq('id', requester_id).single();
  return data || null;
}

// GET /api/atas?requester_id= — lista as atas da empresa do usuário
router.get('/', async (req, res) => {
  const me = await getRequester(req.query.requester_id);
  if (!me) return res.status(401).json({ error: 'requester_id inválido' });

  const { data: atas, error } = await supabase
    .from('atas_reuniao')
    .select('id, titulo, data, hora_inicio, hora_fim, local, participantes, created_at')
    .eq('company', me.company)
    .order('data', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });

  const ids = [...new Set((atas || []).flatMap(a => a.participantes || []))];
  let nomes = {};
  if (ids.length) {
    const { data: perfis } = await supabase.from('profiles').select('id, full_name').in('id', ids);
    (perfis || []).forEach(p => { nomes[p.id] = p.full_name; });
  }

  const { data: assinaturas } = await supabase
    .from('ata_assinaturas')
    .select('ata_id')
    .in('ata_id', (atas || []).map(a => a.id));
  const contagem = {};
  (assinaturas || []).forEach(a => { contagem[a.ata_id] = (contagem[a.ata_id] || 0) + 1; });

  res.json((atas || []).map(a => ({
    ...a,
    participantes_nomes: (a.participantes || []).map(id => nomes[id] || '—'),
    assinaturas_count: contagem[a.id] || 0,
  })));
});

// GET /api/atas/:id?requester_id= — detalhe completo
router.get('/:id', async (req, res) => {
  const me = await getRequester(req.query.requester_id);
  if (!me) return res.status(401).json({ error: 'requester_id inválido' });

  const { data: ata, error } = await supabase.from('atas_reuniao').select('*').eq('id', req.params.id).single();
  if (error || !ata) return res.status(404).json({ error: 'Ata não encontrada' });
  if (ata.company !== me.company) return res.status(403).json({ error: 'Acesso negado' });

  const ids = ata.participantes || [];
  const { data: perfis } = ids.length
    ? await supabase.from('profiles').select('id, full_name').in('id', ids)
    : { data: [] };
  const nomeMap = {};
  (perfis || []).forEach(p => { nomeMap[p.id] = p.full_name; });

  const { data: comentarios } = await supabase
    .from('ata_comentarios')
    .select('id, texto, created_at, autor_id, profiles(full_name)')
    .eq('ata_id', ata.id)
    .order('created_at', { ascending: true });

  const { data: assinaturas } = await supabase
    .from('ata_assinaturas')
    .select('user_id, texto_assinatura, assinado_em')
    .eq('ata_id', ata.id);

  res.json({
    ...ata,
    participantes_detalhe: ids.map(id => ({ id, full_name: nomeMap[id] || '—' })),
    comentarios: (comentarios || []).map(c => ({
      id: c.id, texto: c.texto, created_at: c.created_at,
      autor_id: c.autor_id, autor_nome: c.profiles?.full_name || '—',
    })),
    assinaturas: assinaturas || [],
  });
});

// POST /api/atas — cria uma nova ata
router.post('/', async (req, res) => {
  const me = await getRequester(req.body.requester_id);
  if (!me) return res.status(401).json({ error: 'requester_id inválido' });

  const { titulo, data, hora_inicio, hora_fim, local, participantes, pauta, decisoes, acoes, proxima_reuniao } = req.body;
  if (!titulo?.trim() || !data) return res.status(400).json({ error: 'titulo e data são obrigatórios' });

  const { data: nova, error } = await supabase.from('atas_reuniao').insert({
    company: me.company,
    criado_por: me.id,
    titulo: titulo.trim(),
    data,
    hora_inicio: hora_inicio || null,
    hora_fim: hora_fim || null,
    local: local || null,
    participantes: Array.isArray(participantes) ? participantes : [],
    pauta: Array.isArray(pauta) ? pauta : [],
    decisoes: Array.isArray(decisoes) ? decisoes : [],
    acoes: Array.isArray(acoes) ? acoes : [],
    proxima_reuniao: proxima_reuniao || null,
  }).select().single();
  if (error) {
    logError({ company: me.company, user_id: me.id, acao: 'criar_ata', tabela: 'atas_reuniao', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({ company: me.company, user_id: me.id, acao: 'criar_ata', tabela: 'atas_reuniao', depois: { id: nova.id, titulo: nova.titulo, data: nova.data } });

  // Avisa os participantes de que há uma ata para ler e assinar. Sem isso
  // a assinatura ficava dependendo de alguém lembrar de cobrar pessoalmente.
  const convidados = (nova.participantes || []).filter(id => id !== me.id);
  if (convidados.length) {
    enviarPush(
      convidados,
      '🖋️ Ata de reunião para assinar',
      nova.titulo,
      'ata',
      { company: me.company, rota: req.originalUrl },
    );
  }

  res.json(nova);
});

// PUT /api/atas/:id — edita uma ata já criada (só quem criou ou admin/master)
//
// ASSINATURAS SÃO APAGADAS quando a ata é editada. Uma assinatura vale para
// o texto que a pessoa leu; mantê-la depois de o conteúdo mudar faria o
// documento afirmar que alguém concordou com algo que nunca viu. Todos
// assinam de novo — é o que preserva o sentido da assinatura.
router.put('/:id', async (req, res) => {
  const me = await getRequester(req.body.requester_id);
  if (!me) return res.status(401).json({ error: 'requester_id inválido' });

  const { data: profileFull } = await supabase.from('profiles').select('access_level').eq('id', me.id).single();
  const { data: ata } = await supabase.from('atas_reuniao').select('criado_por, company, titulo').eq('id', req.params.id).single();
  if (!ata || ata.company !== me.company) return res.status(404).json({ error: 'Ata não encontrada' });

  const podeEditar = ata.criado_por === me.id || ['admin', 'master'].includes(profileFull?.access_level);
  if (!podeEditar) return res.status(403).json({ error: 'Só quem criou a ata ou um gestor pode editar' });

  const { titulo, data, hora_inicio, hora_fim, local, participantes, pauta, decisoes, acoes, proxima_reuniao } = req.body;
  if (!titulo?.trim() || !data) return res.status(400).json({ error: 'titulo e data são obrigatórios' });

  const { data: nova, error } = await supabase.from('atas_reuniao').update({
    titulo: titulo.trim(),
    data,
    hora_inicio: hora_inicio || null,
    hora_fim: hora_fim || null,
    local: local || null,
    participantes: Array.isArray(participantes) ? participantes : [],
    pauta: Array.isArray(pauta) ? pauta : [],
    decisoes: Array.isArray(decisoes) ? decisoes : [],
    acoes: Array.isArray(acoes) ? acoes : [],
    proxima_reuniao: proxima_reuniao || null,
    editado_em: new Date().toISOString(),
    editado_por: me.id,
  }).eq('id', req.params.id).select().single();

  if (error) {
    logError({ company: me.company, user_id: me.id, acao: 'editar_ata', tabela: 'atas_reuniao', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }

  const { count: assinaturasAntes } = await supabase
    .from('ata_assinaturas').select('user_id', { count: 'exact', head: true }).eq('ata_id', req.params.id);

  if (assinaturasAntes) {
    await supabase.from('ata_assinaturas').delete().eq('ata_id', req.params.id);
  }

  logAction({
    company: me.company, user_id: me.id, acao: 'editar_ata', tabela: 'atas_reuniao',
    antes: { titulo: ata.titulo },
    depois: { titulo: nova.titulo, assinaturas_invalidadas: assinaturasAntes || 0 },
  });

  // Quem já tinha assinado precisa saber que a assinatura caiu — senão a ata
  // fica esperando por uma assinatura que ninguém sabe que sumiu.
  const avisar = (nova.participantes || []).filter(id => id !== me.id);
  if (avisar.length) {
    enviarPush(
      avisar,
      assinaturasAntes ? '🖋️ Ata alterada — assine de novo' : '📝 Ata de reunião alterada',
      nova.titulo,
      'ata',
      { company: me.company, rota: req.originalUrl },
    );
  }

  res.json({ ...nova, assinaturas_invalidadas: assinaturasAntes || 0 });
});

// DELETE /api/atas/:id?requester_id= — apaga a ata (só quem criou ou admin/master)
router.delete('/:id', async (req, res) => {
  const me = await getRequester(req.query.requester_id);
  if (!me) return res.status(401).json({ error: 'requester_id inválido' });

  const { data: profileFull } = await supabase.from('profiles').select('access_level').eq('id', me.id).single();
  const { data: ata } = await supabase.from('atas_reuniao').select('criado_por, company, titulo').eq('id', req.params.id).single();
  if (!ata || ata.company !== me.company) return res.status(404).json({ error: 'Ata não encontrada' });
  const podeApagar = ata.criado_por === me.id || ['admin', 'master'].includes(profileFull?.access_level);
  if (!podeApagar) return res.status(403).json({ error: 'Acesso negado' });

  const { error } = await supabase.from('atas_reuniao').delete().eq('id', req.params.id);
  if (error) {
    logError({ company: me.company, user_id: me.id, acao: 'excluir_ata', tabela: 'atas_reuniao', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({ company: me.company, user_id: me.id, acao: 'excluir_ata', tabela: 'atas_reuniao', antes: { titulo: ata.titulo } });
  res.json({ ok: true });
});

// POST /api/atas/:id/comentarios — adiciona comentário
router.post('/:id/comentarios', async (req, res) => {
  const me = await getRequester(req.body.requester_id);
  if (!me) return res.status(401).json({ error: 'requester_id inválido' });
  if (!req.body.texto?.trim()) return res.status(400).json({ error: 'texto obrigatório' });

  const { data: ata } = await supabase.from('atas_reuniao').select('company').eq('id', req.params.id).single();
  if (!ata || ata.company !== me.company) return res.status(404).json({ error: 'Ata não encontrada' });

  const { data, error } = await supabase.from('ata_comentarios').insert({
    ata_id: req.params.id, autor_id: me.id, texto: req.body.texto.trim(),
  }).select().single();
  if (error) {
    registrarLog('comentar_ata', 'ata_comentarios', 'erro', { company: me.company, user_id: me.id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: error.message });
  }
  registrarLog('comentar_ata', 'ata_comentarios', 'sucesso', { company: me.company, user_id: me.id, depois: { ata_id: req.params.id } });

  // Avisa os demais participantes do comentário
  const { data: ataFull } = await supabase.from('atas_reuniao').select('titulo, participantes, criado_por').eq('id', req.params.id).single();
  const avisar = [...new Set([...(ataFull?.participantes || []), ataFull?.criado_por])]
    .filter(id => id && id !== me.id);
  if (avisar.length) {
    enviarPush(
      avisar,
      `💬 ${me.full_name || 'Alguém'} comentou na ata`,
      `${ataFull?.titulo || ''}: ${req.body.texto.trim().slice(0, 60)}`,
      'ata',
      { company: me.company, rota: req.originalUrl },
    );
  }

  res.json({ ...data, autor_nome: me.full_name });
});

// POST /api/atas/:id/assinar — assina com a assinatura salva no próprio perfil
router.post('/:id/assinar', async (req, res) => {
  const me = await getRequester(req.body.requester_id);
  if (!me) return res.status(401).json({ error: 'requester_id inválido' });

  const { data: ata } = await supabase.from('atas_reuniao').select('company, participantes').eq('id', req.params.id).single();
  if (!ata || ata.company !== me.company) return res.status(404).json({ error: 'Ata não encontrada' });
  if (!(ata.participantes || []).includes(me.id)) return res.status(403).json({ error: 'Você não é participante desta ata' });

  const { data: perfil } = await supabase.from('profiles').select('assinatura_texto, full_name').eq('id', me.id).single();
  const texto = perfil?.assinatura_texto?.trim() || perfil?.full_name || me.full_name;

  const { data, error } = await supabase.from('ata_assinaturas')
    .upsert({ ata_id: req.params.id, user_id: me.id, texto_assinatura: texto, assinado_em: new Date().toISOString() }, { onConflict: 'ata_id,user_id' })
    .select().single();
  if (error) {
    logError({ company: me.company, user_id: me.id, acao: 'assinar_ata', tabela: 'ata_assinaturas', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({ company: me.company, user_id: me.id, acao: 'assinar_ata', tabela: 'ata_assinaturas', depois: { ata_id: req.params.id, assinatura: texto } });
  res.json(data);
});

// DELETE /api/atas/:id/assinar?requester_id= — desfaz a própria assinatura
router.delete('/:id/assinar', async (req, res) => {
  const me = await getRequester(req.query.requester_id);
  if (!me) return res.status(401).json({ error: 'requester_id inválido' });

  const { error } = await supabase.from('ata_assinaturas').delete().eq('ata_id', req.params.id).eq('user_id', me.id);
  if (error) {
    logError({ company: me.company, user_id: me.id, acao: 'desfazer_assinatura_ata', tabela: 'ata_assinaturas', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({ company: me.company, user_id: me.id, acao: 'desfazer_assinatura_ata', tabela: 'ata_assinaturas', antes: { ata_id: req.params.id } });
  res.json({ ok: true });
});

module.exports = router;
