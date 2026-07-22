import * as XLSX from 'xlsx';

/**
 * Lê um arquivo .xlsx de vendas com blocos CANAL / DEPARTAMENTO / CATEGORIA / ITEM.
 * Cada bloco começa com uma linha de cabeçalho contendo "META" e "REALIZADO".
 * Retorna { linhas, resumo }.
 */
export async function parseVendasXlsx(file) {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const linhas = [];
  let blocoAtual = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const textos = row.map(c => String(c).trim().toUpperCase());

    // Detecta linha de cabeçalho de bloco (contém META e REALIZADO)
    if (textos.includes('META') && textos.includes('REALIZADO')) {
      // A célula não-vazia antes de META define o tipo do bloco
      const idxMeta = textos.indexOf('META');
      const idxReal = textos.indexOf('REALIZADO');
      const idxPerc = textos.findIndex(t => t.includes('%') || t === 'PERCENTUAL' || t === 'ATINGIMENTO');

      // Detecta o nome do bloco pela linha anterior ou pela primeira coluna
      const linhaAnterior = rows[i - 1] || [];
      const nomeBloco = String(linhaAnterior[0] || row[0] || '').trim().toUpperCase();

      if (nomeBloco.includes('CANAL')) blocoAtual = 'CANAL';
      else if (nomeBloco.includes('DEPART')) blocoAtual = 'DEPARTAMENTO';
      else if (nomeBloco.includes('CATEG')) blocoAtual = 'CATEGORIA';
      else if (nomeBloco.includes('ITEM') || nomeBloco.includes('PRODUTO')) blocoAtual = 'ITEM';
      else blocoAtual = nomeBloco || 'GERAL';

      // Lê as linhas de dados até encontrar linha vazia ou novo cabeçalho
      let j = i + 1;
      while (j < rows.length) {
        const dataRow = rows[j];
        const nome = String(dataRow[0] || '').trim();
        if (!nome) { j++; continue; }

        // Para se encontrar outro cabeçalho
        const t = dataRow.map(c => String(c).trim().toUpperCase());
        if (t.includes('META') && t.includes('REALIZADO')) break;

        const meta = parseFloat(String(dataRow[idxMeta] || '0').replace(',', '.')) || 0;
        const realizado = parseFloat(String(dataRow[idxReal] || '0').replace(',', '.')) || 0;
        const percentual = idxPerc >= 0
          ? parseFloat(String(dataRow[idxPerc] || '0').replace(',', '.').replace('%', '')) || 0
          : meta > 0 ? Math.round((realizado / meta) * 100) : 0;

        linhas.push({
          tipo: blocoAtual,
          nome,
          meta,
          realizado,
          percentual,
        });
        j++;
      }
      i = j - 1;
    }
  }

  // Resumo global (soma do bloco CANAL ou primeiro bloco disponível)
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
    resumo: {
      totalMeta,
      totalRealizado: totalReal,
      percentualGeral: totalMeta > 0 ? Math.round((totalReal / totalMeta) * 100) : 0,
      blocos: Object.keys(porTipo),
    },
  };
}
