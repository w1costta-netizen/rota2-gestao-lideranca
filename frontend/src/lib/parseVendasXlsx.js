import * as XLSX from 'xlsx';

// Blocos reconhecidos na primeira coluna do cabeçalho
const TIPOS_BLOCO = ['CANAL', 'DEPARTAMENTO', 'CATEGORIA', 'ITEM', 'PRODUTO'];

function toNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  return parseFloat(String(v).replace(/[%\s]/g, '').replace(',', '.')) || 0;
}

function detectarTipo(val) {
  const t = String(val).trim().toUpperCase();
  if (t === 'CANAL') return 'CANAL';
  if (t.startsWith('DEPART')) return 'DEPARTAMENTO';
  if (t.startsWith('CATEG')) return 'CATEGORIA';
  if (t === 'ITEM' || t === 'PRODUTO' || t === 'SKU') return 'ITEM';
  return null;
}

/**
 * Parser para o formato real do arquivo de vendas:
 * Cada bloco começa com uma linha onde row[0] = CANAL | DEPARTAMENTO | CATEGORIA | ITEM
 * Colunas: Nome | Sócios | YoY | Ticket Médio | YoY | Gasto Médio | YoY | Volume | YoY | Receita | YoY | Saldo Receita | Margem | Saldo Margem | % Margem
 */
export async function parseVendasXlsx(file) {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const linhas = [];
  let i = 0;

  while (i < rows.length) {
    const row = rows[i];
    const tipo = detectarTipo(row[0]);

    if (tipo) {
      // Linha de cabeçalho do bloco — mapeia índices das colunas pelo nome
      const headers = row.map(c => String(c).trim().toUpperCase());

      // Índices das colunas (o arquivo tem YoY repetido; pegamos pela posição)
      // Ordem conhecida: Nome(0) Sócios(1) YoY(2) TicketMédio(3) YoY(4) GastoMédio(5) YoY(6) Volume(7) YoY(8) Receita(9) YoY(10) SaldoReceita(11) Margem(12) SaldoMargem(13) %Margem(14)
      const IDX = {
        socios:        findCol(headers, ['SÓCIOS', 'SOCIOS', 'CLIENTES', 'MEMBROS'], 1),
        yoy_socios:    2,
        ticket_medio:  findCol(headers, ['TICKET'], 3),
        yoy_ticket:    4,
        gasto_medio:   findCol(headers, ['GASTO'], 5),
        yoy_gasto:     6,
        volume:        findCol(headers, ['VOLUME'], 7),
        yoy_volume:    8,
        receita:       findCol(headers, ['RECEITA'], 9),
        yoy_receita:   10,
        saldo_receita: findCol(headers, ['SALDO RECEITA', 'SALDO'], 11),
        margem:        findCol(headers, ['MARGEM'], 12),
        saldo_margem:  13,
        pct_margem:    findCol(headers, ['% MARGEM', '%MARGEM', 'MARGEM%'], 14),
      };

      i++;
      while (i < rows.length) {
        const dr = rows[i];
        const nome = String(dr[0] || '').trim();

        // Linha vazia ou nova linha de bloco: encerra
        if (!nome) { i++; continue; }
        if (detectarTipo(dr[0])) break;

        const receita = toNum(dr[IDX.receita]);
        const saldo   = toNum(dr[IDX.saldo_receita]);
        const yoyR    = toNum(dr[IDX.yoy_receita]);  // decimal, ex: 0.048

        linhas.push({
          tipo,
          nome,
          // meta = receita ano anterior = receita - saldo
          meta:      receita - saldo,
          realizado: receita,
          // percentual = crescimento YoY em % (positivo = cresceu)
          percentual: Math.round(yoyR * 100 * 10) / 10,
          extras: {
            socios:       toNum(dr[IDX.socios]),
            yoy_socios:   Math.round(toNum(dr[IDX.yoy_socios]) * 100 * 10) / 10,
            ticket_medio: toNum(dr[IDX.ticket_medio]),
            gasto_medio:  toNum(dr[IDX.gasto_medio]),
            volume:       toNum(dr[IDX.volume]),
            yoy_volume:   Math.round(toNum(dr[IDX.yoy_volume]) * 100 * 10) / 10,
            yoy_receita:  Math.round(yoyR * 100 * 10) / 10,
            saldo_receita: saldo,
            margem:        toNum(dr[IDX.margem]),
            saldo_margem:  toNum(dr[IDX.saldo_margem]),
            pct_margem:    Math.round(toNum(dr[IDX.pct_margem]) * 100 * 10) / 10,
          },
        });
        i++;
      }
    } else {
      i++;
    }
  }

  const porTipo = {};
  for (const l of linhas) {
    if (!porTipo[l.tipo]) porTipo[l.tipo] = [];
    porTipo[l.tipo].push(l);
  }

  const base = porTipo['CANAL'] || porTipo[Object.keys(porTipo)[0]] || [];
  const totalReceita = base.reduce((s, l) => s + l.realizado, 0);
  const totalSaldo   = base.reduce((s, l) => s + (l.extras?.saldo_receita || 0), 0);

  return {
    linhas,
    resumo: {
      totalReceita,
      totalSaldo,
      crescimentoGeral: totalReceita > 0 && (totalReceita - totalSaldo) > 0
        ? Math.round((totalSaldo / (totalReceita - totalSaldo)) * 100 * 10) / 10
        : 0,
      blocos: Object.keys(porTipo),
    },
  };
}

function findCol(headers, keywords, fallback) {
  const idx = headers.findIndex(h => keywords.some(k => h.includes(k)));
  return idx >= 0 ? idx : fallback;
}
