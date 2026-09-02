const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');
const { logAction, logError } = require('../lib/auditLog');

// ─────────────────────────────────────────────────────────────
// Torneios entre setores e entre pessoas.
//
// REGRA CENTRAL: o placar NÃO é gravado. É calculado na hora, a partir do
// que o app já registra quando o trabalho acontece. Isso resolve de uma vez
// os três problemas que costumam matar gamificação:
//
//  1. Ninguém digita ponto. Placar que depende de alguém alimentar planilha
//     dura até essa pessoa ficar ocupada numa semana.
//  2. Mudar o peso de uma métrica recalcula o passado inteiro, em vez de
//     deixar um histórico com duas regras diferentes misturadas.
//  3. Se a ideia não pegar, apagar a tabela de campanhas apaga tudo — não
//     fica lixo de pontuação espalhado pelo banco.
//
// As métricas foram escolhidas por serem difíceis de fingir: forjar dá o
// mesmo trabalho que fazer. Pontuar "tarefa concluída" sem olhar o prazo,
// por exemplo, ensinaria a fechar tarefa sem fazer — e o placar melhoraria
// enquanto a operação piora.
// ─────────────────────────────────────────────────────────────

const METRICAS = {
  escala_no_prazo: {
    nome: 'Escala enviada até o dia 26',
    // Uma pontuação por mês fechado dentro do período.
    async contar(ids, inicio, fim) {
      const { data } = await supabase
        .from('schedule_submissions').select('user_id, submitted_at')
        .in('user_id', ids).gte('submitted_at', inicio).lte('submitted_at', fimDoDia(fim));
      return contagem(data, r => new Date(r.submitted_at).getDate() <= 26);
    },
  },

  comunicado_lido_no_dia: {
    nome: 'Comunicado lido no mesmo dia',
    async contar(ids, inicio, fim) {
      const { data } = await supabase
        .from('comunicados_lidos').select('user_id, read_at, comunicados(created_at)')
        .in('user_id', ids).gte('read_at', inicio).lte('read_at', fimDoDia(fim));
      return contagem(data, r =>
        r.comunicados?.created_at && mesmoDia(r.read_at, r.comunicados.created_at));
    },
  },

  tarefa_no_prazo: {
    nome: 'Tarefa concluída dentro do prazo',
    async contar(ids, inicio, fim) {
      const { data } = await supabase
        .from('tarefas').select('assigned_to, due_date, concluida_em')
        .in('assigned_to', ids).eq('concluida', true)
        .gte('concluida_em', inicio).lte('concluida_em', fimDoDia(fim));
      // Sem prazo definido não há mérito de prazo: não pontua, para não
      // premiar quem cria tarefa sem data e fecha na hora.
      return contagem(data, r => r.due_date && diaDe(r.concluida_em) <= r.due_date, 'assigned_to');
    },
  },

  diario_do_dia: {
    nome: 'Diário de bordo preenchido no dia',
    async contar(ids, inicio, fim) {
      const { data } = await supabase
        .from('diario_bordo').select('user_id, data, created_at')
        .in('user_id', ids).gte('data', inicio).lte('data', fim);
      // Relato lançado no próprio dia. Escrito três dias depois vira
      // memória, não registro — e é o registro que muda a operação.
      return contagem(data, r => diaDe(r.created_at) === r.data);
    },
  },

  ata_assinada: {
    nome: 'Ata assinada em até 48h',
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

async function getPerfil(id) {
  if (!id) return null;
  const { data } = await supabase
    .from('profiles').select('id, company, access_level, active').eq('id', id).maybeSingle();
  if (!data || data.active === false) return null;
  return data;
}

const podeCriar = (me) => ['admin', 'master'].includes(me.access_level);

// GET /api/gamificacao/metricas — o catálogo, para a tela de criar campanha
router.get('/metricas', (_req, res) => {
  res.json(Object.entries(METRICAS).map(([chave, m]) => ({ chave, nome: m.nome })));
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
  if (!podeCriar(me)) return res.status(403).json({ error: 'Só quem administra a loja cria campanhas.' });

  const { nome, descricao, premio, inicio, fim, metricas, tema } = req.body || {};
  if (!nome?.trim() || !inicio || !fim) {
    return res.status(400).json({ error: 'Nome, início e fim são obrigatórios.' });
  }
  if (fim < inicio) return res.status(400).json({ error: 'O fim não pode ser antes do início.' });

  // Só entram métricas que existem, e com peso dentro de um limite. Sem
  // isto, um peso absurdo faria uma única métrica decidir o torneio todo.
  const limpas = (Array.isArray(metricas) ? metricas : [])
    .filter(m => METRICAS[m?.chave])
    .map(m => ({ chave: m.chave, peso: Math.min(Math.max(Number(m.peso) || 1, 1), 100) }));
  if (!limpas.length) return res.status(400).json({ error: 'Escolha pelo menos uma métrica.' });

  const { data, error } = await supabase.from('campanhas_gamificacao').insert({
    company: me.company,
    nome: nome.trim(),
    descricao: descricao?.trim() || null,
    premio: premio?.trim() || null,
    inicio, fim,
    metricas: limpas,
    // Lista fechada: tema desconhecido vira clássico. A tela também protege,
    // mas quem grava é o servidor.
    tema: ['classico', 'reinos', 'copa', 'corrida'].includes(tema) ? tema : 'classico',
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
//
// Dois placares do MESMO evento: por pessoa e por setor. Ter os dois não
// dobra o trabalho — muda só como a mesma pontuação é somada.
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
  if (!ids.length) return res.json({ campanha, individual: [], setores: [], detalhe: [] });

  // Uma consulta por métrica, não uma por pessoa.
  const pontos = {};
  const detalhe = [];
  for (const regra of campanha.metricas || []) {
    const m = METRICAS[regra.chave];
    if (!m) continue;
    const contados = await m.contar(ids, campanha.inicio, campanha.fim);
    detalhe.push({ chave: regra.chave, nome: m.nome, peso: regra.peso });
    Object.entries(contados).forEach(([id, qtd]) => {
      pontos[id] = (pontos[id] || 0) + qtd * regra.peso;
    });
  }

  const individual = (pessoas || [])
    .map(p => ({ id: p.id, nome: p.full_name, setor: p.sector, avatar_url: p.avatar_url, pontos: pontos[p.id] || 0 }))
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

  res.json({ campanha, individual, setores, detalhe });
});

module.exports = router;
