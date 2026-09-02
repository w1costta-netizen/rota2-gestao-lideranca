const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');
const { logAction, logError } = require('../lib/auditLog');

// ─────────────────────────────────────────────────────────────
// Torneios entre setores e entre pessoas.
//
// REGRA CENTRAL: o placar NÃO é gravado. É calculado na hora, a partir do
// que o app já registra quando o trabalho acontece. Isso resolve os três
// motivos que costumam matar gamificação:
//
//  1. Ninguém digita ponto. Placar que depende de alguém alimentar planilha
//     dura até essa pessoa ficar ocupada numa semana.
//  2. Mudar o peso de uma família recalcula o passado inteiro, em vez de
//     deixar um histórico com duas regras misturadas.
//  3. Se a ideia não pegar, apagar a tabela de campanhas apaga tudo — sem
//     deixar pontuação espalhada pelo banco.
//
// O OBJETIVO É HÁBITO, NÃO VOLUME. Quem faz 50 coisas numa terça não pode
// ganhar de quem faz 3 coisas todos os dias — o segundo é exatamente quem
// o torneio quer premiar. Daí as duas travas: teto por dia em cada ação, e
// uma família inteira que pontua DIAS DISTINTOS de uso. Ninguém falsifica
// vinte dias diferentes numa tarde.
// ─────────────────────────────────────────────────────────────

// Ações que pontuam, vindas do registro de auditoria — que já grava mais de
// cem ações do app com quem fez e quando. Ação nova entra no jogo só
// acrescentando a chave aqui; não precisa de consulta nova.
//
// NAVEGAÇÃO NÃO PONTUA de propósito. Premiar quem abre tela ensina a abrir
// tela, e não há como separar quem analisou de quem passou o dedo. O que
// mede a mesma intenção é a constância.
const ACOES = {
  // Planejamento próprio — vale mais porque mede iniciativa, não obediência
  criar_agenda:            { nome: 'Colocar um item na agenda', familia: 'planejamento', base: 4, tetoDia: 3 },
  criar_tarefa:            { nome: 'Criar uma tarefa', familia: 'planejamento', base: 4, tetoDia: 3 },
  criar_plano_pdca:        { nome: 'Criar um plano de ação', familia: 'planejamento', base: 5, tetoDia: 2 },
  criar_acao_pdca:         { nome: 'Criar uma ação dentro do plano', familia: 'planejamento', base: 2, tetoDia: 5 },
  criar_lista:             { nome: 'Criar uma lista', familia: 'planejamento', base: 2, tetoDia: 2 },
  adicionar_item_lista:    { nome: 'Adicionar item numa lista', familia: 'planejamento', base: 1, tetoDia: 5 },
  criar_anotacao:          { nome: 'Criar uma anotação', familia: 'planejamento', base: 1, tetoDia: 3 },

  // Operação — o trabalho da loja registrado no app
  finalizar_conferencia:   { nome: 'Finalizar uma conferência de seção', familia: 'operacao', base: 8, tetoDia: 2 },
  criar_ata:               { nome: 'Criar uma ata de reunião', familia: 'operacao', base: 6, tetoDia: 2 },
  criar_conferencia:       { nome: 'Abrir uma conferência de seção', familia: 'operacao', base: 4, tetoDia: 2 },
  criar_relato_diario:     { nome: 'Escrever no Diário de Bordo', familia: 'operacao', base: 4, tetoDia: 3 },
  salvar_caixas:           { nome: 'Salvar análise de caixas', familia: 'operacao', base: 3, tetoDia: 3 },
  criar_comunicado:        { nome: 'Publicar um comunicado', familia: 'operacao', base: 3, tetoDia: 3 },
  criar_mural:             { nome: 'Publicar no mural', familia: 'operacao', base: 3, tetoDia: 3 },
  coletar_item_conferencia:{ nome: 'Conferir um item de seção', familia: 'operacao', base: 2, tetoDia: 20 },
  sinalizar_item_flyer:    { nome: 'Sinalizar um item de flyer', familia: 'operacao', base: 2, tetoDia: 20 },
  adicionar_foto_flyer:    { nome: 'Adicionar foto num flyer', familia: 'operacao', base: 2, tetoDia: 15 },
  adicionar_foto_tour:     { nome: 'Adicionar foto no Tour 4x4', familia: 'operacao', base: 2, tetoDia: 15 },
  salvar_escala:           { nome: 'Trabalhar na escala', familia: 'operacao', base: 1, tetoDia: 5 },

  // Participação — peso baixo de propósito: comentar é bom, mas não é o que
  // muda a operação, e é o mais fácil de inflar
  concluir_treinamento_produtividade: { nome: 'Concluir um treinamento', familia: 'participacao', base: 10, tetoDia: 2 },
  comentar_tarefa:         { nome: 'Comentar numa tarefa', familia: 'participacao', base: 2, tetoDia: 5 },
  comentar_comunicado:     { nome: 'Comentar num comunicado', familia: 'participacao', base: 2, tetoDia: 5 },
  comentar_mural:          { nome: 'Comentar no mural', familia: 'participacao', base: 2, tetoDia: 5 },
  comentar_ata:            { nome: 'Comentar numa ata', familia: 'participacao', base: 2, tetoDia: 5 },
  reagir:                  { nome: 'Reagir a uma mensagem', familia: 'participacao', base: 1, tetoDia: 8 },
  enviar_mensagem:         { nome: 'Enviar mensagem no chat', familia: 'participacao', base: 1, tetoDia: 10 },
  marcar_comunicado_lido:  { nome: 'Ler um comunicado', familia: 'participacao', base: 1, tetoDia: 5 },
  marcar_mural_lido:       { nome: 'Ler o mural', familia: 'participacao', base: 1, tetoDia: 5 },
};

// Vale por cada dia distinto em que a pessoa fez qualquer coisa da lista.
// É a métrica mais resistente a fraude que existe aqui, e a que mede o que
// o torneio realmente quer: aparecer todo dia.
const PONTOS_POR_DIA_ATIVO = 5;

const FAMILIAS = {
  constancia:   { nome: 'Constância',   descricao: 'Cada dia em que a pessoa usou o app de verdade' },
  planejamento: { nome: 'Planejamento', descricao: 'O que a pessoa organiza para si: agenda, tarefas, listas, plano de ação' },
  qualidade:    { nome: 'Qualidade',    descricao: 'Prazo cumprido: tarefa, escala, ata, comunicado e diário no dia' },
  operacao:     { nome: 'Operação',     descricao: 'Conferência de seção, flyer, Tour 4x4, escala, caixas e comunicados' },
  participacao: { nome: 'Participação', descricao: 'Comentar, reagir, conversar e concluir treinamentos' },
};

const diaDe    = (iso) => new Date(iso).toISOString().slice(0, 10);
const mesmoDia = (a, b) => diaDe(a) === diaDe(b);
// O período vem em datas; sem isto o último dia ficaria de fora, porque
// qualquer horário depois da meia-noite já é maior que a data pura.
const fimDoDia = (data) => `${data}T23:59:59.999Z`;

function contagem(linhas, vale, campo = 'user_id') {
  const por = {};
  (linhas || []).forEach(r => {
    if (!vale(r)) return;
    por[r[campo]] = (por[r[campo]] || 0) + 1;
  });
  return por;
}

// Qualidade fica fora do registro de auditoria porque "no prazo" não é uma
// ação: é a comparação entre duas datas. São as de maior valor — medem
// fazer BEM, não apenas fazer — e as mais difíceis de forjar, porque fingir
// dá o mesmo trabalho que cumprir.
const QUALIDADE = {
  escala_no_prazo: {
    nome: 'Escala enviada até o dia 26', base: 10,
    async contar(ids, inicio, fim) {
      const { data } = await supabase
        .from('schedule_submissions').select('user_id, submitted_at')
        .in('user_id', ids).gte('submitted_at', inicio).lte('submitted_at', fimDoDia(fim));
      return contagem(data, r => new Date(r.submitted_at).getDate() <= 26);
    },
  },
  tarefa_no_prazo: {
    nome: 'Tarefa concluída dentro do prazo', base: 5,
    async contar(ids, inicio, fim) {
      const { data } = await supabase
        .from('tarefas').select('assigned_to, due_date, concluida_em')
        .in('assigned_to', ids).eq('concluida', true)
        .gte('concluida_em', inicio).lte('concluida_em', fimDoDia(fim));
      // Sem prazo definido não há mérito de prazo: não pontua, senão
      // premiaria quem cria tarefa sem data e fecha na hora.
      return contagem(data, r => r.due_date && diaDe(r.concluida_em) <= r.due_date, 'assigned_to');
    },
  },
  ata_assinada: {
    nome: 'Ata assinada em até 48h', base: 5,
    async contar(ids, inicio, fim) {
      const { data } = await supabase
        .from('ata_assinaturas').select('user_id, assinado_em, atas_reuniao(created_at)')
        .in('user_id', ids).gte('assinado_em', inicio).lte('assinado_em', fimDoDia(fim));
      return contagem(data, r => {
        const criada = r.atas_reuniao?.created_at;
        if (!criada) return false;
        return (new Date(r.assinado_em) - new Date(criada)) <= 48 * 3600 * 1000;
      });
    },
  },
  diario_do_dia: {
    nome: 'Diário de bordo preenchido no dia', base: 4,
    async contar(ids, inicio, fim) {
      const { data } = await supabase
        .from('diario_bordo').select('user_id, data, created_at')
        .in('user_id', ids).gte('data', inicio).lte('data', fim);
      return contagem(data, r => diaDe(r.created_at) === r.data);
    },
  },
  comunicado_lido_no_dia: {
    nome: 'Comunicado lido no mesmo dia', base: 3,
    async contar(ids, inicio, fim) {
      const { data } = await supabase
        .from('comunicados_lidos').select('user_id, read_at, comunicados(created_at)')
        .in('user_id', ids).gte('read_at', inicio).lte('read_at', fimDoDia(fim));
      return contagem(data, r =>
        r.comunicados?.created_at && mesmoDia(r.read_at, r.comunicados.created_at));
    },
  },
};

async function getPerfil(id) {
  if (!id) return null;
  const { data } = await supabase
    .from('profiles').select('id, company, access_level, active').eq('id', id).maybeSingle();
  if (!data || data.active === false) return null;
  return data;
}

const podeCriar = (me) => ['admin', 'master'].includes(me.access_level);
const FAMILIAS_VALIDAS = Object.keys(FAMILIAS);
const TEMAS_VALIDOS = ['classico', 'reinos', 'copa', 'corrida'];

// GET /api/gamificacao/regras
//
// As regras saem do MESMO objeto que calcula o placar. Escrever a
// explicacao a mao criaria duas verdades: bastaria mexer num peso e a tela
// passaria a mentir sem ninguem perceber. Aqui, mudar a pontuacao muda a
// explicacao no mesmo instante.
//
// E os TETOS aparecem abertos de proposito. Esconder limite nao evita
// fraude - quem quer burlar descobre testando - e so prejudica quem esta
// jogando limpo e gastaria esforco a toa.
router.get('/regras', (_req, res) => {
  const porFamilia = {};
  FAMILIAS_VALIDAS.forEach(chave => {
    porFamilia[chave] = { chave, ...FAMILIAS[chave], acoes: [] };
  });

  Object.entries(ACOES).forEach(([chave, a]) => {
    porFamilia[a.familia].acoes.push({
      chave, nome: a.nome, base: a.base, tetoDia: a.tetoDia,
    });
  });

  Object.entries(QUALIDADE).forEach(([chave, q]) => {
    porFamilia.qualidade.acoes.push({
      chave, nome: q.nome, base: q.base, tetoDia: null,
    });
  });

  // Do mais valioso para o menos, dentro de cada familia.
  Object.values(porFamilia).forEach(f => f.acoes.sort((a, b) => b.base - a.base));

  res.json({
    pontosPorDiaAtivo: PONTOS_POR_DIA_ATIVO,
    familias: Object.values(porFamilia),
  });
});

// GET /api/gamificacao/familias — o catálogo, para a tela de criar torneio
router.get('/familias', (_req, res) => {
  res.json(FAMILIAS_VALIDAS.map(chave => ({ chave, ...FAMILIAS[chave] })));
});

// GET /api/gamificacao/campanhas?requester_id=
router.get('/campanhas', async (req, res) => {
  const me = await getPerfil(req.query.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  if (!me.company) return res.json([]);

  const { data, error } = await supabase
    .from('campanhas_gamificacao').select('*')
    .eq('company', me.company).order('inicio', { ascending: false });
  if (error) return res.status(500).json({ error: 'Erro ao carregar as campanhas.' });
  res.json(data || []);
});

// POST /api/gamificacao/campanhas
router.post('/campanhas', async (req, res) => {
  const me = await getPerfil(req.body?.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  if (!podeCriar(me)) return res.status(403).json({ error: 'Só quem administra a loja cria torneios.' });

  const { nome, descricao, premio, inicio, fim, metricas, tema } = req.body || {};
  if (!nome?.trim() || !inicio || !fim) {
    return res.status(400).json({ error: 'Nome, início e fim são obrigatórios.' });
  }
  if (fim < inicio) return res.status(400).json({ error: 'O fim não pode ser antes do início.' });

  // `metricas` guarda o PESO DE CADA FAMÍLIA. Peso limitado entre 1 e 5:
  // sem limite, um número absurdo faria uma família decidir o torneio
  // inteiro e as outras viravam enfeite.
  const pesos = (Array.isArray(metricas) ? metricas : [])
    .filter(m => FAMILIAS_VALIDAS.includes(m?.chave))
    .map(m => ({ chave: m.chave, peso: Math.min(Math.max(Number(m.peso) || 1, 1), 5) }));
  if (!pesos.length) return res.status(400).json({ error: 'Escolha pelo menos uma família de pontos.' });

  const { data, error } = await supabase.from('campanhas_gamificacao').insert({
    company: me.company,
    nome: nome.trim(),
    descricao: descricao?.trim() || null,
    premio: premio?.trim() || null,
    inicio, fim,
    metricas: pesos,
    tema: TEMAS_VALIDOS.includes(tema) ? tema : 'classico',
    criado_por: me.id,
  }).select().single();

  if (error) {
    logError({ company: me.company, user_id: me.id, acao: 'criar_campanha', tabela: 'campanhas_gamificacao', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({ company: me.company, user_id: me.id, acao: 'criar_campanha', tabela: 'campanhas_gamificacao', depois: { id: data.id, nome: data.nome } });
  res.json(data);
});

// PUT /api/gamificacao/campanhas/:id/encerrar
router.put('/campanhas/:id/encerrar', async (req, res) => {
  const me = await getPerfil(req.body?.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  if (!podeCriar(me)) return res.status(403).json({ error: 'Acesso negado' });

  const { data: c } = await supabase
    .from('campanhas_gamificacao').select('company').eq('id', req.params.id).maybeSingle();
  if (!c || c.company !== me.company) return res.status(404).json({ error: 'Campanha não encontrada' });

  await supabase.from('campanhas_gamificacao').update({ ativa: false }).eq('id', req.params.id);
  logAction({ company: me.company, user_id: me.id, acao: 'encerrar_campanha', tabela: 'campanhas_gamificacao', antes: { id: req.params.id } });
  res.json({ ok: true });
});

// GET /api/gamificacao/campanhas/:id/placar?requester_id=
router.get('/campanhas/:id/placar', async (req, res) => {
  const me = await getPerfil(req.query.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const { data: campanha } = await supabase
    .from('campanhas_gamificacao').select('*').eq('id', req.params.id).maybeSingle();
  if (!campanha || campanha.company !== me.company) {
    return res.status(404).json({ error: 'Campanha não encontrada' });
  }

  const { data: pessoas } = await supabase
    .from('profiles').select('id, full_name, sector, avatar_url')
    .eq('company', me.company).eq('active', true);

  const ids = (pessoas || []).map(p => p.id);
  if (!ids.length) return res.json({ campanha, individual: [], setores: [], familias: [] });

  const pesoDe = {};
  (campanha.metricas || []).forEach(m => { pesoDe[m.chave] = m.peso; });

  // Pontos por pessoa E por família: a tela mostra de onde veio cada ponto.
  // Placar que não se explica não muda comportamento — a pessoa precisa
  // saber o que fazer para subir.
  const pontos = {};
  const somar = (id, familia, valor) => {
    if (!pontos[id]) pontos[id] = {};
    pontos[id][familia] = (pontos[id][familia] || 0) + valor;
  };

  // ── Famílias vindas do registro de auditoria ──────────────────
  const precisaLog = ['constancia', 'planejamento', 'operacao', 'participacao'].some(f => pesoDe[f]);
  if (precisaLog) {
    const { data: registros } = await supabase
      .from('audit_logs')
      .select('user_id, acao, created_at')
      .eq('company', me.company).eq('status', 'sucesso')
      .in('user_id', ids)
      .in('acao', Object.keys(ACOES))
      .gte('created_at', campanha.inicio).lte('created_at', fimDoDia(campanha.fim))
      .limit(50000);

    // Teto por dia: agrupa por pessoa + ação + dia ANTES de somar. É o que
    // impede alguém de criar 50 tarefas numa tarde e ganhar o torneio.
    const balde = {};
    const diasAtivos = {};
    (registros || []).forEach(r => {
      const dia = diaDe(r.created_at);
      const k = `${r.user_id}|${r.acao}|${dia}`;
      balde[k] = (balde[k] || 0) + 1;
      if (!diasAtivos[r.user_id]) diasAtivos[r.user_id] = new Set();
      diasAtivos[r.user_id].add(dia);
    });

    Object.entries(balde).forEach(([k, vezes]) => {
      const [userId, acao] = k.split('|');
      const regra = ACOES[acao];
      const peso = pesoDe[regra.familia];
      if (!peso) return;
      somar(userId, regra.familia, Math.min(vezes, regra.tetoDia) * regra.base * peso);
    });

    if (pesoDe.constancia) {
      Object.entries(diasAtivos).forEach(([userId, dias]) => {
        somar(userId, 'constancia', dias.size * PONTOS_POR_DIA_ATIVO * pesoDe.constancia);
      });
    }
  }

  // ── Qualidade: as cinco que medem prazo ───────────────────────
  if (pesoDe.qualidade) {
    for (const regra of Object.values(QUALIDADE)) {
      const contados = await regra.contar(ids, campanha.inicio, campanha.fim);
      Object.entries(contados).forEach(([id, qtd]) => {
        somar(id, 'qualidade', qtd * regra.base * pesoDe.qualidade);
      });
    }
  }

  const total = (id) => Object.values(pontos[id] || {}).reduce((s, v) => s + v, 0);

  const individual = (pessoas || [])
    .map(p => ({
      id: p.id, nome: p.full_name, setor: p.sector, avatar_url: p.avatar_url,
      pontos: total(p.id),
      porFamilia: pontos[p.id] || {},
    }))
    .sort((a, b) => b.pontos - a.pontos);

  // Setor grande contra setor pequeno: soma bruta já nasceria decidida.
  // A média por pessoa é o que torna a disputa justa.
  const porSetor = {};
  individual.forEach(p => {
    const s = p.setor || 'Sem setor';
    if (!porSetor[s]) porSetor[s] = { setor: s, pontos: 0, pessoas: 0 };
    porSetor[s].pontos += p.pontos;
    porSetor[s].pessoas += 1;
  });
  const setores = Object.values(porSetor)
    .map(s => ({ ...s, media: s.pessoas ? Math.round((s.pontos / s.pessoas) * 10) / 10 : 0 }))
    .sort((a, b) => b.media - a.media);

  const familias = (campanha.metricas || [])
    .filter(m => FAMILIAS[m.chave])
    .map(m => ({ chave: m.chave, nome: FAMILIAS[m.chave].nome, peso: m.peso }));

  res.json({ campanha, individual, setores, familias });
});

module.exports = router;
