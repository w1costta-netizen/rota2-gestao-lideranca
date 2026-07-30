import * as XLSX from 'xlsx';

const COL_MAP = {
  CD_PRODUTO:                    ['CD_PRODUTO','COD_PRODUTO','CODIGO_PRODUTO','CD PRODUTO'],
  DESCRICAO_PRODUTO:             ['DESCRICAO_PRODUTO','DESC_PRODUTO','DESCRICAO PRODUTO','NOME_PRODUTO'],
  PRODUTO_STATUS:                ['PRODUTO_STATUS','STATUS_PRODUTO','STATUS'],
  DESCRICAO_SETOR:               ['DESCRICAO_SETOR','DESC_SETOR','SETOR','DIVISAO'],
  DESCRICAO_DEPARTAMENTO:        ['DESCRICAO_DEPARTAMENTO','DESC_DEPARTAMENTO','DEPARTAMENTO'],
  DESCRICAO_SECAO:               ['DESCRICAO_SECAO','DESC_SECAO','SECAO'],
  DESC_MOTIVO_SUSPENCAO:         ['DESC_MOTIVO_SUSPENCAO','DESC_MOTIVO_SUSPENSAO','MOTIVO_SUSPENSAO','MOTIVO SUSPENSAO'],
  NOME_FORNECEDOR:               ['NOME_FORNECEDOR','FORNECEDOR'],
  IDADE_ULTIMA_NF:               ['IDADE_ULTIMA_NF','IDADE_NF','DIAS_ULTIMA_NF'],
  DT_ULTIMA_VENDA:               ['DT_ULTIMA_VENDA','DATA_ULTIMA_VENDA','ULTIMA_VENDA'],
  sum_ESTOQUE_ON_HAND_LOJA_QTD:  ['sum_ESTOQUE_ON_HAND_LOJA_QTD','ESTOQUE_ON_HAND_LOJA_QTD','ESTOQUE_QTD','QTD_ESTOQUE'],
  ESTOQUE_ON_HAND_CD_CXS:        ['ESTOQUE_ON_HAND_CD_CXS','ESTOQUE_CD_CXS','ESTOQUE_CD','QTD_CD'],
  sum_VALOR_ESTOQUE_LOJA_A_CUSTO:['sum_VALOR_ESTOQUE_LOJA_A_CUSTO','VALOR_ESTOQUE_CUSTO','VLR_ESTOQUE_CUSTO'],
  sum_VALOR_ESTOQUE_LOJA_A_PRECO:['sum_VALOR_ESTOQUE_LOJA_A_PRECO','VALOR_ESTOQUE_PRECO','VLR_ESTOQUE_PRECO'],
  sum_CUSTO_MEDIO:               ['sum_CUSTO_MEDIO','CUSTO_MEDIO'],
  sum_PRECO_VENDA_MEDIO:         ['sum_PRECO_VENDA_MEDIO','PRECO_VENDA_MEDIO','PRECO_MEDIO'],
  sum_ESTOQUE_MINIMO_LOJA:       ['sum_ESTOQUE_MINIMO_LOJA','ESTOQUE_MINIMO','QTD_MINIMA'],
  sum_VENDA_MEDIA:               ['sum_VENDA_MEDIA','VENDA_MEDIA','MEDIA_VENDA'],
  sum_QTD_VENDAS_MES_ATUAL:      ['sum_QTD_VENDAS_MES_ATUAL','QTD_VENDAS_MES_ATUAL','VENDAS_MES_ATUAL'],
  sum_QTD_VENDAS_MES_ANTERIOR:   ['sum_QTD_VENDAS_MES_ANTERIOR','QTD_VENDAS_MES_ANTERIOR','VENDAS_MES_ANT'],
  sum_QTD_VENDAS_SEMANA_1:       ['sum_QTD_VENDAS_SEMANA_1','QTD_VENDAS_SEMANA_1','VENDAS_S1'],
  sum_QTD_VENDAS_SEMANA_2:       ['sum_QTD_VENDAS_SEMANA_2','QTD_VENDAS_SEMANA_2','VENDAS_S2'],
  sum_QTD_VENDAS_SEMANA_3:       ['sum_QTD_VENDAS_SEMANA_3','QTD_VENDAS_SEMANA_3','VENDAS_S3'],
  sum_QTD_VENDAS_SEMANA_4:       ['sum_QTD_VENDAS_SEMANA_4','QTD_VENDAS_SEMANA_4','VENDAS_S4'],
};

const norm = s => String(s || '').toUpperCase().trim().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');

function resolveColumns(headers) {
  const normHeaders = headers.map(h => ({ orig: h, n: norm(h) }));
  const result = {}, missing = [];
  for (const [canonical, aliases] of Object.entries(COL_MAP)) {
    const normAliases = aliases.map(norm);
    const found = normHeaders.find(h => normAliases.includes(h.n));
    if (found) result[canonical] = found.orig;
    else missing.push(canonical);
  }
  return { result, missing };
}

function parseDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).slice(0, 10);
  return s.match(/\d{4}-\d{2}-\d{2}/) ? s : null;
}

const DIVISOES_OK = new Set([
  'DIVISAO DE NAO-ALIMENTAR',
  'DIVISAO DE PRODUTOS DE GRANDE CONSUMO',
  'DIVISAO DE PERECIVEIS',
]);
const EXCLUIR_SECOES = new Set([
  'FLV', 'ACOUGUE', 'FLORES E PLANTAS', 'PADARIA', 'SALSICHARIA', 'ROTISSERIE',
]);

export async function parseEstoqueXlsx(file) {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });

  const abaIdx = wb.SheetNames.findIndex(s => s.trim().toUpperCase() === 'DADOS');
  if (abaIdx === -1) throw new Error(`Aba "Dados" não encontrada. Abas: ${wb.SheetNames.join(', ')}`);

  const ws = wb.Sheets[wb.SheetNames[abaIdx]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false });
  if (!rows.length) throw new Error('Planilha sem dados na aba "Dados"');

  const COLUNAS_OPCIONAIS = new Set(['ESTOQUE_ON_HAND_CD_CXS']);
  const { result: colMap, missing } = resolveColumns(Object.keys(rows[0]));
  const missingObrigatorias = missing.filter(c => !COLUNAS_OPCIONAIS.has(c));
  if (missingObrigatorias.length) throw new Error(`Colunas não encontradas: ${missingObrigatorias.join(', ')}`);

  const get = (row, col) => row[colMap[col]];

  const items = [];
  for (const row of rows) {
    const setor = String(get(row, 'DESCRICAO_SETOR') || '').trim().toUpperCase().replace(/\s+/g, ' ');
    const secao = String(get(row, 'DESCRICAO_SECAO') || '').trim().toUpperCase();
    if (!DIVISOES_OK.has(setor)) continue;
    if (EXCLUIR_SECOES.has(secao)) continue;

    const motivo = get(row, 'DESC_MOTIVO_SUSPENCAO');
    const statusReal = (motivo && motivo !== 'null' && String(motivo).trim() !== '')
      ? 'Suspenso' : String(get(row, 'PRODUTO_STATUS') || '');

    const s1 = parseFloat(get(row, 'sum_QTD_VENDAS_SEMANA_1')) || 0;
    const s2 = parseFloat(get(row, 'sum_QTD_VENDAS_SEMANA_2')) || 0;
    const s3 = parseFloat(get(row, 'sum_QTD_VENDAS_SEMANA_3')) || 0;
    const s4 = parseFloat(get(row, 'sum_QTD_VENDAS_SEMANA_4')) || 0;
    const vendMedia  = parseFloat(get(row, 'sum_VENDA_MEDIA')) || 0;
    const precoMedio = parseFloat(get(row, 'sum_PRECO_VENDA_MEDIO')) || 0;
    const qtdMesAtual = parseFloat(get(row, 'sum_QTD_VENDAS_MES_ATUAL')) || 0;
    const estoque    = parseFloat(get(row, 'sum_ESTOQUE_ON_HAND_LOJA_QTD')) || 0;
    const diasCob    = vendMedia > 0 ? estoque / (vendMedia / 7) : null;
    const vendaMesVlr = Math.round(qtdMesAtual * precoMedio * 100) / 100;
    const estoque_cd_cxs = parseFloat(get(row, 'ESTOQUE_ON_HAND_CD_CXS')) || 0;

    items.push({
      CD_PRODUTO:                    parseInt(get(row, 'CD_PRODUTO')) || 0,
      DESCRICAO_PRODUTO:             String(get(row, 'DESCRICAO_PRODUTO') || ''),
      PRODUTO_STATUS:                String(get(row, 'PRODUTO_STATUS') || ''),
      STATUS_REAL:                   statusReal,
      MOTIVO_SUSPENSAO:              motivo && String(motivo).trim() !== '' ? String(motivo).trim() : null,
      DESCRICAO_SETOR:               String(get(row, 'DESCRICAO_SETOR') || ''),
      DESCRICAO_DEPARTAMENTO:        String(get(row, 'DESCRICAO_DEPARTAMENTO') || ''),
      DESCRICAO_SECAO:               String(get(row, 'DESCRICAO_SECAO') || ''),
      NOME_FORNECEDOR:               String(get(row, 'NOME_FORNECEDOR') || ''),
      IDADE_ULTIMA_NF:               parseFloat(get(row, 'IDADE_ULTIMA_NF')) || null,
      DT_ULTIMA_VENDA:               parseDate(get(row, 'DT_ULTIMA_VENDA')),
      sum_ESTOQUE_ON_HAND_LOJA_QTD:  estoque,
      sum_VALOR_ESTOQUE_LOJA_A_CUSTO: parseFloat(get(row, 'sum_VALOR_ESTOQUE_LOJA_A_CUSTO')) || 0,
      sum_VALOR_ESTOQUE_LOJA_A_PRECO: parseFloat(get(row, 'sum_VALOR_ESTOQUE_LOJA_A_PRECO')) || 0,
      sum_CUSTO_MEDIO:               parseFloat(get(row, 'sum_CUSTO_MEDIO')) || null,
      sum_PRECO_VENDA_MEDIO:         parseFloat(get(row, 'sum_PRECO_VENDA_MEDIO')) || null,
      sum_ESTOQUE_MINIMO_LOJA:       parseFloat(get(row, 'sum_ESTOQUE_MINIMO_LOJA')) || null,
      sum_VENDA_MEDIA:               vendMedia || null,
      sum_QTD_VENDAS_MES_ATUAL:      qtdMesAtual || null,
      sum_QTD_VENDAS_MES_ANTERIOR:   parseFloat(get(row, 'sum_QTD_VENDAS_MES_ANTERIOR')) || null,
      sum_QTD_VENDAS_SEMANA_1:       s1,
      sum_QTD_VENDAS_SEMANA_2:       s2,
      sum_QTD_VENDAS_SEMANA_3:       s3,
      sum_QTD_VENDAS_SEMANA_4:       s4,
      total_4s:                      s1 + s2 + s3 + s4,
      dias_cobertura:                diasCob ? Math.round(diasCob * 10) / 10 : null,
      venda_mes_vlr: vendaMesVlr,
      estoque_cd_cxs,
    });
  }

  if (!items.length) throw new Error('Nenhum item encontrado após aplicar os filtros de divisão/seção.');

  const sum     = (arr, k) => arr.reduce((a, r) => a + (r[k] || 0), 0);
  const topN    = (arr, key, asc = false, n = 50) =>
    [...arr].sort((a, b) => asc ? (a[key] || 0) - (b[key] || 0) : (b[key] || 0) - (a[key] || 0)).slice(0, n);
  const bySecao = (arr, valKey = 'sum_VALOR_ESTOQUE_LOJA_A_CUSTO') => {
    const m = {};
    for (const r of arr) {
      const s = r.DESCRICAO_SECAO;
      if (!m[s]) m[s] = { DESCRICAO_SECAO: s, DESCRICAO_DEPARTAMENTO: r.DESCRICAO_DEPARTAMENTO, itens: 0, custo_total: 0 };
      m[s].itens++; m[s].custo_total += r[valKey] || 0;
    }
    return Object.values(m).sort((a, b) => b.custo_total - a.custo_total);
  };
  const bySecaoQtd = (arr, valKey = 'sum_QTD_VENDAS_MES_ATUAL') => {
    const m = {};
    for (const r of arr) {
      const s = r.DESCRICAO_SECAO;
      if (!m[s]) m[s] = { DESCRICAO_SECAO: s, DESCRICAO_DEPARTAMENTO: r.DESCRICAO_DEPARTAMENTO, itens: 0, venda_mes: 0 };
      m[s].itens++; m[s].venda_mes += r[valKey] || 0;
    }
    return Object.values(m).sort((a, b) => b.venda_mes - a.venda_mes);
  };
  const byDivisao = (arr) => {
    const m = {};
    for (const r of arr) {
      const d = r.DESCRICAO_SETOR || 'Sem divisão';
      if (!m[d]) m[d] = { DESCRICAO_SETOR: d, itens: 0, zero_estoque: 0, zero_venda_4s: 0, zero_venda_mes: 0 };
      m[d].itens++;
      if (r.sum_ESTOQUE_ON_HAND_LOJA_QTD === 0) {
        m[d].zero_estoque++;
        if (r.total_4s > 0)                      m[d].zero_venda_4s++;
        if ((r.sum_QTD_VENDAS_MES_ATUAL || 0) > 0) m[d].zero_venda_mes++;
      }
    }
    return Object.values(m).sort((a, b) => b.itens - a.itens);
  };
  const byDepto = (arr) => {
    const m = {};
    for (const r of arr) {
      const d = r.DESCRICAO_DEPARTAMENTO || 'Sem departamento';
      if (!m[d]) m[d] = { DESCRICAO_DEPARTAMENTO: d, DESCRICAO_SETOR: r.DESCRICAO_SETOR, itens: 0, zero_estoque: 0, zero_venda_4s: 0, zero_venda_mes: 0 };
      m[d].itens++;
      if (r.sum_ESTOQUE_ON_HAND_LOJA_QTD === 0) {
        m[d].zero_estoque++;
        if (r.total_4s > 0)                      m[d].zero_venda_4s++;
        if ((r.sum_QTD_VENDAS_MES_ATUAL || 0) > 0) m[d].zero_venda_mes++;
      }
    }
    return Object.values(m).sort((a, b) => b.itens - a.itens);
  };

  const com_estoque       = items.filter(r => r.sum_ESTOQUE_ON_HAND_LOJA_QTD > 0);
  const ativos            = com_estoque.filter(r => r.STATUS_REAL === 'Ativo');
  const ativos_geral      = items.filter(r => r.STATUS_REAL === 'Ativo'); // todos ativos, com ou sem estoque
  const ruptura           = items.filter(r => r.STATUS_REAL === 'Ativo' && r.sum_ESTOQUE_ON_HAND_LOJA_QTD === 0 && (r.sum_QTD_VENDAS_MES_ATUAL || 0) > 0);
  const urgente           = ativos
    .filter(r => r.sum_VENDA_MEDIA && r.dias_cobertura != null && r.dias_cobertura < 30)
    .map(r => ({
      ...r,
      criticidade: r.dias_cobertura < 7 ? 'critico' : r.dias_cobertura < 15 ? 'urgente' : 'atencao',
    }))
    .sort((a, b) => a.dias_cobertura - b.dias_cobertura);
  const urgente_15        = urgente.filter(r => r.dias_cobertura < 15);
  const aging             = ativos.filter(r => (r.IDADE_ULTIMA_NF || 0) > 365);
  const sem4s             = ativos.filter(r => r.total_4s === 0);
  const giro_lento        = ativos.filter(r => r.sum_VENDA_MEDIA && r.dias_cobertura >= 45).sort((a, b) => b.sum_VALOR_ESTOQUE_LOJA_A_CUSTO - a.sum_VALOR_ESTOQUE_LOJA_A_CUSTO);
  const estq_neg          = items.filter(r => r.sum_ESTOQUE_ON_HAND_LOJA_QTD < 0);
  const suspensos_est     = com_estoque.filter(r => r.STATUS_REAL === 'Suspenso');
  const deletados_est     = com_estoque.filter(r => r.STATUS_REAL === 'Deletado');
  const ativos_zer_lst    = items.filter(r => r.STATUS_REAL === 'Ativo' && r.sum_ESTOQUE_ON_HAND_LOJA_QTD === 0);
  const sem_mov           = ativos_zer_lst.filter(r => !(r.sum_QTD_VENDAS_MES_ATUAL > 0));
  const zero_venda_4s     = ativos_zer_lst.filter(r => r.total_4s > 0);
  const zero_venda_mes    = ativos_zer_lst.filter(r => (r.sum_QTD_VENDAS_MES_ATUAL || 0) > 0);

  const hoje    = new Date();
  const pad     = n => String(n).padStart(2, '0');
  const gerado_em = `${pad(hoje.getDate())}/${pad(hoje.getMonth() + 1)}/${hoje.getFullYear()} ${pad(hoje.getHours())}:${pad(hoje.getMinutes())}`;

  const statusMap = {};
  for (const r of com_estoque) {
    const s = r.STATUS_REAL || 'Desconhecido';
    if (!statusMap[s]) statusMap[s] = { STATUS_REAL: s, itens: 0, custo_total: 0 };
    statusMap[s].itens++;
    statusMap[s].custo_total += r.sum_VALOR_ESTOQUE_LOJA_A_CUSTO || 0;
  }

  return {
    gerado_em,
    arquivo: file.name,
    linhas: items.length,
    totais: {
      ruptura_count:         ruptura.length,
      ruptura_venda_mes:     sum(ruptura, 'sum_QTD_VENDAS_MES_ATUAL'),
      ruptura_venda_mes_vlr: Math.round(sum(ruptura, 'venda_mes_vlr') * 100) / 100,
      ruptura_com_cd_count:  ruptura.filter(r => r.estoque_cd_cxs > 0).length,
      urgente_count:         urgente_15.length,
      urgente_30_count:      urgente.length,
      urgente_com_cd_count:  urgente.filter(r => r.estoque_cd_cxs > 0).length,
      aging_count:           aging.length,
      aging_custo:           Math.round(sum(aging, 'sum_VALOR_ESTOQUE_LOJA_A_CUSTO') * 100) / 100,
      sem4s_count:           sem4s.length,
      sem4s_custo:           Math.round(sum(sem4s, 'sum_VALOR_ESTOQUE_LOJA_A_CUSTO') * 100) / 100,
      giro_lento_count:      giro_lento.length,
      giro_lento_custo:      Math.round(sum(giro_lento, 'sum_VALOR_ESTOQUE_LOJA_A_CUSTO') * 100) / 100,
      estq_neg_count:        estq_neg.length,
      suspensos_count:       suspensos_est.length,
      suspensos_custo:       Math.round(sum(suspensos_est, 'sum_VALOR_ESTOQUE_LOJA_A_CUSTO') * 100) / 100,
      deletados_com_estoque: deletados_est.length,
      deletados_custo:       Math.round(sum(deletados_est, 'sum_VALOR_ESTOQUE_LOJA_A_CUSTO') * 100) / 100,
      ativos_zerados:           ativos_zer_lst.length,
      ativos_com_estoque:       ativos.length,
      com_estoque:              com_estoque.length,
      ativos_total:             ativos_geral.length,
      ativos_zero_count:        ativos_zer_lst.length,
      ativos_zero_venda_4s:     zero_venda_4s.length,
      ativos_zero_venda_mes:    zero_venda_mes.length,
    },
    secao_ruptura:    bySecaoQtd(ruptura),
    secao_urgente:    bySecao(urgente, 'sum_ESTOQUE_ON_HAND_LOJA_QTD'),
    secao_aging:      bySecao(aging),
    secao_sem4s:      bySecao(sem4s),
    secao_giro_lento: bySecao(giro_lento),
    secao_estq_neg:   bySecao(estq_neg, 'sum_ESTOQUE_ON_HAND_LOJA_QTD'),
    ruptura_top:      topN(ruptura, 'sum_QTD_VENDAS_MES_ATUAL'),
    urgente_top:      topN(urgente, 'dias_cobertura', true),
    aging_top:        topN(aging, 'IDADE_ULTIMA_NF'),
    sem4s_top:        topN(sem4s, 'sum_VALOR_ESTOQUE_LOJA_A_CUSTO'),
    giro_lento_top:   topN(giro_lento, 'sum_VALOR_ESTOQUE_LOJA_A_CUSTO'),
    estq_neg_top:     topN([...estq_neg].sort((a, b) => a.sum_ESTOQUE_ON_HAND_LOJA_QTD - b.sum_ESTOQUE_ON_HAND_LOJA_QTD), 'sum_ESTOQUE_ON_HAND_LOJA_QTD', true),
    suspensos_top:    topN(suspensos_est, 'sum_VALOR_ESTOQUE_LOJA_A_CUSTO'),
    deletados_top:    topN(deletados_est, 'sum_VALOR_ESTOQUE_LOJA_A_CUSTO'),
    sem_mov_top:      topN(sem_mov, 'sum_VALOR_ESTOQUE_LOJA_A_CUSTO'),
    dep_suspensos:    bySecao(suspensos_est),
    dep_aging:        bySecao(aging),
    dep_sem4s:        bySecao(sem4s),
    status_com_estoque: Object.values(statusMap).sort((a, b) => b.custo_total - a.custo_total),
    // acervo ativo
    divisao_ativos:       byDivisao(ativos_geral),
    depto_ativos:         byDepto(ativos_geral),
    zero_venda_4s_top:    topN(zero_venda_4s, 'total_4s'),
    zero_venda_mes_top:   topN(zero_venda_mes, 'sum_QTD_VENDAS_MES_ATUAL'),
  };
}
