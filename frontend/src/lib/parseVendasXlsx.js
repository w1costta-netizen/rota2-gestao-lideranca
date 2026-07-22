import * as XLSX from 'xlsx';

function toNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  return parseFloat(String(v).replace(/[%\s]/g, '').replace(',', '.')) || 0;
}

function detectarTipoBloco(textoLinha, textoAnterior) {
  const t = (textoLinha + ' ' + textoAnterior).toUpperCase();
  if (t.includes('CANAL')) return 'CANAL';
  if (t.includes('DEPART')) return 'DEPARTAMENTO';
  if (t.includes('CATEG')) return 'CATEGORIA';
  if (t.includes('ITEM') || t.includes('PRODUTO') || t.includes('SKU')) return 'ITEM';
  return 'GERAL';
}

/**
 * Lê um arquivo .xlsx de vendas com blocos CANAL / DEPARTAMENTO / CATEGORIA / ITEM.
 * Estratégia: detecta linhas de cabeçalho por presença de palavras-chave numéricas
 * (META, REALIZADO, PREVISTO, VENDIDO, ATINGIDO, etc.).
 * Retorna { linhas, resumo, _debug }.
 */
export async function parseVendasXlsx(file) {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });

  // Tenta a primeira aba com dados
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const debug = { sheetName, totalRows: rows.length, primeiras5: rows.slice(0, 5) };

  // Palavras que indicam coluna de META
  const META_KW   = ['META', 'PREVISTO', 'OBJETIVO', 'PLANEJADO', 'BUDGET'];
  // Palavras que indicam coluna de REALIZADO
  const REAL_KW   = ['REALIZADO', 'VENDIDO', 'ATINGIDO', 'REAL', 'ATUAL'];
  // Palavras que indicam coluna de %
  const PERC_KW   = ['%', 'PERCENT', 'ATINGIMENTO', 'PERFORMANCE'];

  const linhas = [];
  let blocoAtual = 'GERAL';

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const textos = row.map(c => String(c).trim().toUpperCase());

    // Detecta se a linha tem cabeçalho de colunas numéricas
    const idxMeta = textos.findIndex(t => META_KW.some(k => t === k || t.startsWith(k)));
    const idxReal = textos.findIndex(t => REAL_KW.some(k => t === k || t.startsWith(k)));

    if (idxMeta >= 0 && idxReal >= 0) {
      const idxPerc = textos.findIndex(t => PERC_KW.some(k => t.includes(k)));
      const textoAnterior = (rows[i - 1] || []).map(c => String(c)).join(' ');
      const textoLinha = textos.join(' ');
      blocoAtual = detectarTipoBloco(textoLinha, textoAnterior);

      // Lê linhas de dados deste bloco
      let j = i + 1;
      while (j < rows.length) {
        const dr = rows[j];
        const nome = String(dr[0] || '').trim();

        // Linha vazia: pula
        if (!nome) { j++; continue; }

        // Nova linha de cabeçalho: encerra bloco
        const dt = dr.map(c => String(c).trim().toUpperCase());
        const temMeta = dt.findIndex(t => META_KW.some(k => t === k || t.startsWith(k)));
        const temReal = dt.findIndex(t => REAL_KW.some(k => t === k || t.startsWith(k)));
        if (temMeta >= 0 && temReal >= 0) break;

        // Verifica se é linha de título de bloco (texto sem números)
        const temNumero = dr.slice(1).some(v => typeof v === 'number' || /\d/.test(String(v)));
        if (!temNumero) {
          // Pode ser título do próximo bloco — atualiza blocoAtual e continua
          const novoTipo = detectarTipoBloco(dt.join(' '), '');
          if (novoTipo !== 'GERAL') blocoAtual = novoTipo;
          j++;
          continue;
        }

        const meta = toNum(dr[idxMeta]);
        const realizado = toNum(dr[idxReal]);
        const percentual = idxPerc >= 0
          ? toNum(dr[idxPerc])
          : meta > 0 ? Math.round((realizado / meta) * 100) : 0;

        linhas.push({ tipo: blocoAtual, nome, meta, realizado, percentual });
        j++;
      }
      i = j - 1;
    }
  }

  // Resumo global
  const porTipo = {};
  for (const l of linhas) {
    if (!porTipo[l.tipo]) porTipo[l.tipo] = [];
    porTipo[l.tipo].push(l);
  }

  const blocoResumo = porTipo['CANAL'] || porTipo[Object.keys(porTipo)[0]] || [];
  const totalMeta = blocoResumo.reduce((s, l) => s + l.meta, 0);
  const totalReal = blocoResumo.reduce((s, l) => s + l.realizado, 0);

  return {
    linhas,
    _debug: debug,
    resumo: {
      totalMeta,
      totalRealizado: totalReal,
      percentualGeral: totalMeta > 0 ? Math.round((totalReal / totalMeta) * 100) : 0,
      blocos: Object.keys(porTipo),
    },
  };
}
