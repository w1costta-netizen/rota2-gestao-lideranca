// ─────────────────────────────────────────────────────────────
// Ruptura e venda perdida — a fonte única de verdade.
//
// Duas funções, e só elas:
//   montarBlocoRuptura(rows, nomeArquivo)  → na importação, transforma a
//       extração inteira num bloco compacto que cabe no payload
//   calcularRuptura(bloco, { janela, filtros }) → na tela, aplica regras,
//       filtros e janela sobre o bloco e devolve KPIs, gráficos e tabelas
//
// As regras estão numeradas como no pedido, e há um teste que roda as duas
// funções contra a extração real de 17/09/2026 e confere os 15 números de
// validação (scripts/testar-ruptura.mjs). Qualquer mudança aqui tem que
// passar por ele.
//
// A EXTRAÇÃO INTEIRA, não o recorte do importador. Os números de validação
// (13.783 ativos, 412 em ruptura) só fecham com as 40.856 linhas; o recorte
// por divisões que o importador aplica aos relatórios antigos dá 8.078
// ativos. O painel de ruptura olha a loja toda — e o importador continua
// fazendo o que sempre fez para os outros relatórios.
// ─────────────────────────────────────────────────────────────

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

// Data como 'AAAA-MM-DD' pelas partes UTC. A data do Excel chega como
// instante em UTC e, convertida para o fuso local, cai no dia anterior com
// horas de sobra — diferença de instantes perdia um dia em todos os itens.
// Diferença de CALENDÁRIO foi o que fechou os números de validação.
function dataISO(v) {
  if (v == null || v === '') return null;
  let d;
  if (v instanceof Date) d = v;
  else if (typeof v === 'number') d = new Date(Math.round((v - 25569) * 86400 * 1000));
  else { const s = String(v).slice(0, 10); if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; d = new Date(v); }
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function diasEntre(deISO, ateISO) {
  if (!deISO || !ateISO) return null;
  const [a1, m1, d1] = deISO.split('-').map(Number);
  const [a2, m2, d2] = ateISO.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}

// Regra 5: a data de extração vem do nome do arquivo ("17-09" → 17/09 do
// ano corrente). Sem isso, hoje. E a hora, se estiver no nome, vai para o
// cabeçalho.
export function dataDoNomeDoArquivo(nome, hoje = new Date()) {
  const m = String(nome || '').match(/(\d{2})-(\d{2})(?:[_ ](\d{2})[_:h](\d{2}))?/);
  const ano = hoje.getFullYear();
  if (!m) {
    const iso = `${ano}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    return { iso, origem: 'data de hoje', extraidoEm: null };
  }
  const dia = m[1], mes = m[2];
  const iso = `${ano}-${mes}-${dia}`;
  const hora = m[3] && m[4] ? ` ${m[3]}:${m[4]}` : '';
  return { iso, origem: 'nome do arquivo', extraidoEm: `${dia}/${mes}/${ano}${hora}` };
}

function dicionario() {
  const nomes = [];
  const idx = new Map();
  return {
    id(nome) {
      const n = String(nome ?? '').trim() || '—';
      if (!idx.has(n)) { idx.set(n, nomes.length); nomes.push(n); }
      return idx.get(n);
    },
    nomes,
  };
}

// ── Importação: bloco compacto ──────────────────────────────────────
//
// Cabe no payload porque só os ativos COM venda média levam campos
// completos (são ~4.200). Os demais viram tuplas de índices de dicionário
// — servem para as contagens e para o funil, e nada mais é exibido deles.
export function montarBlocoRuptura(rows, nomeArquivo) {
  const { iso: dataExtracao, origem, extraidoEm } = dataDoNomeDoArquivo(nomeArquivo);
  const P = dicionario(), DP = dicionario(), S = dicionario(), F = dicionario();

  const itens = [], ativosSemVenda = [], suspensos = [];
  let loja = null, uf = null;

  for (const r of rows) {
    if (!loja && r.NOME_LOJA) loja = String(r.NOME_LOJA).trim();
    if (!uf && r.UF) uf = String(r.UF).trim();

    const pi = P.id(r.DESCRICAO_PORTIFOLIO), dpi = DP.id(r.DESCRICAO_DEPARTAMENTO);
    const si = S.id(r.DESCRICAO_SECAO), fi = F.id(r.NOME_FORNECEDOR);

    // Regra 1: ativo = MOTIVO_SUSPENCAO == 0. PRODUTO_STATUS é ignorado.
    const motivo = Math.round(num(r.MOTIVO_SUSPENCAO) ?? 0);
    if (motivo !== 0) { suspensos.push([pi, dpi, si, fi, motivo]); continue; }

    const vm = num(r.sum_VENDA_MEDIA) ?? 0;
    if (!(vm > 0)) { ativosSemVenda.push([pi, dpi, si, fi]); continue; }

    itens.push({
      c: num(r.CD_PRODUTO) ?? 0,
      d: String(r.DESCRICAO_PRODUTO ?? '').trim().slice(0, 60),
      pi, dpi, si, fi,
      e: num(r.sum_ESTOQUE_ON_HAND_LOJA_QTD) ?? 0,
      cd: num(r.ESTOQUE_ON_HAND_CD_CXS) ?? 0,
      vm,
      pr: num(r.sum_PRECO_VENDA_MEDIO) ?? 0,
      uv: dataISO(r.DT_ULTIMA_VENDA),
      rc: dataISO(r.DATA_ULTIMO_RECEBIMENTO),
      va: num(r.sum_VL_VENDAS_BRT_MES_ANTERIOR) ?? 0,
    });
  }

  return {
    versao: 2,
    data_extracao: dataExtracao, origem_data: origem, extraido_em: extraidoEm,
    arquivo: nomeArquivo || null, loja, uf,
    linhas_total: rows.length,
    ativos_total: itens.length + ativosSemVenda.length,
    suspensos_total: suspensos.length,
    dic: { p: P.nomes, dp: DP.nomes, s: S.nomes, f: F.nomes },
    ativos_sem_venda: ativosSemVenda,
    suspensos,
    itens,
  };
}

// ── Tela: regras, filtros e janela ──────────────────────────────────
export const JANELAS = [7, 30, 90, 'todos'];
export const FAIXAS = ['1-7', '8-30', '31-90', '>90', 'sem data'];

function faixaDe(dias) {
  if (dias == null) return 'sem data';
  if (dias <= 7) return '1-7';
  if (dias <= 30) return '8-30';
  if (dias <= 90) return '31-90';
  return '>90';
}

export function calcularRuptura(bloco, { janela = 30, filtros = {} } = {}) {
  const { dic } = bloco;
  const f = {
    p:  filtros.portfolio    ? dic.p.indexOf(filtros.portfolio)     : -1,
    dp: filtros.departamento ? dic.dp.indexOf(filtros.departamento) : -1,
    s:  filtros.secao        ? dic.s.indexOf(filtros.secao)         : -1,
    f:  filtros.fornecedor   ? dic.f.indexOf(filtros.fornecedor)    : -1,
  };
  const busca = String(filtros.busca || '').trim().toLowerCase();

  const passaDim = (pi, dpi, si, fi) =>
    (f.p < 0 || pi === f.p) && (f.dp < 0 || dpi === f.dp) && (f.s < 0 || si === f.s) && (f.f < 0 || fi === f.f);

  // A busca por código/descrição só faz sentido em quem tem descrição — os
  // itens com venda. Contagens de tuplas ignoram a busca.
  const itensFiltrados = bloco.itens.filter(i =>
    passaDim(i.pi, i.dpi, i.si, i.fi)
    && (!busca || String(i.c).includes(busca) || i.d.toLowerCase().includes(busca)));

  const semVenda   = busca ? 0 : bloco.ativos_sem_venda.filter(t => passaDim(...t)).length;
  const suspensos  = busca ? 0 : bloco.suspensos.filter(t => passaDim(t[0], t[1], t[2], t[3])).length;

  // Regras 3, 4, 6, 7 por item.
  const enriquecidos = itensFiltrados.map(i => {
    const dias = diasEntre(i.uv, bloco.data_extracao);
    const ruptura = i.e <= 0 && i.vm > 0;
    const vpDia = i.vm * (i.pr || 0);
    const vp = vpDia * Math.max(1, dias ?? 1);
    return {
      ...i,
      portfolio: dic.p[i.pi], departamento: dic.dp[i.dpi], secao: dic.s[i.si], fornecedor: dic.f[i.fi],
      dias, faixa: faixaDe(dias), ruptura, temCd: ruptura && i.cd > 0, vpDia, vp,
    };
  });

  const ativosComVenda = enriquecidos.length;
  const ativos = ativosComVenda + semVenda;
  const emRuptura = enriquecidos.filter(x => x.ruptura);
  const rupturaCd = emRuptura.filter(x => x.temCd);

  // Regra 8: a janela recorta a ruptura pelos dias sem venda. "todos" inclui
  // até quem não tem data.
  const naJanela = janela === 'todos'
    ? emRuptura
    : emRuptura.filter(x => x.dias != null && x.dias <= janela);
  const naJanelaCd = naJanela.filter(x => x.temCd);

  const soma = (arr, k) => arr.reduce((s, x) => s + (x[k] || 0), 0);
  const pct = (a, b) => b > 0 ? a / b : 0;

  const agrupar = (arr, chave) => {
    const m = new Map();
    arr.forEach(x => {
      const k = x[chave];
      const g = m.get(k) || { nome: k, itens: 0, vendaPerdida: 0 };
      g.itens++; g.vendaPerdida += x.vp; m.set(k, g);
    });
    return [...m.values()].sort((a, b) => b.vendaPerdida - a.vendaPerdida);
  };

  const faixas = FAIXAS.map(fx => {
    const doGrupo = emRuptura.filter(x => x.faixa === fx);
    return { faixa: fx, itens: doGrupo.length, vendaPerdida: soma(doGrupo, 'vp') };
  });

  const porVp = [...naJanela].sort((a, b) => b.vp - a.vp);

  return {
    dataExtracao: bloco.data_extracao, janela,
    kpis: {
      ativos, ativosComVenda, semVenda, suspensos,
      abastecidos: ativosComVenda - emRuptura.length,
      ruptura: emRuptura.length, rupturaCd: rupturaCd.length,
      pctRuptura: pct(emRuptura.length, ativosComVenda),           // regra 9, principal
      pctRupturaSobreAtivos: pct(emRuptura.length, ativos),         // regra 9, secundário
      pctRupturaCd: pct(rupturaCd.length, emRuptura.length),
      rupturaJanela: naJanela.length, rupturaJanelaCd: naJanelaCd.length,
      vendaPerdida: soma(naJanela, 'vp'),
      vendaPerdidaDia: soma(naJanela, 'vpDia'),
      vendaMesAntRisco: soma(naJanela, 'va'),                       // regra 10
    },
    faixas,
    porPortfolio:  agrupar(naJanela, 'portfolio'),
    porSecao:      agrupar(naJanela, 'secao').slice(0, 12),
    porFornecedor: agrupar(naJanela, 'fornecedor').slice(0, 10),
    tabelaCd:      porVp.filter(x => x.temCd),
    tabelaVp:      porVp,
    opcoes: {
      portfolio:    [...new Set(bloco.itens.map(i => dic.p[i.pi]))].sort(),
      departamento: [...new Set(bloco.itens.map(i => dic.dp[i.dpi]))].sort(),
      secao:        [...new Set(bloco.itens.map(i => dic.s[i.si]))].sort(),
      fornecedor:   [...new Set(bloco.itens.map(i => dic.f[i.fi]))].sort(),
    },
  };
}
