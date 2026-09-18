// Prova o módulo de ruptura contra a extração real de 17/09/2026.
//
//   node scripts/testar-ruptura.mjs [caminho-da-extracao.xlsx]
//
// Os 15 números abaixo vieram de uma conferência independente feita sobre a
// mesma extração. Se algum deixar de bater, a regra mudou — e a mudança
// precisa ser intencional.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { montarBlocoRuptura, calcularRuptura } from '../src/lib/ruptura.js';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const ARQ = process.argv[2] || 'C:/Users/w1cos/Downloads/Extracao_VW_SAMS_DASH259_17-09_11_50.xlsx';
const nome = ARQ.split(/[\\/]/).pop();

const wb = XLSX.read(fs.readFileSync(ARQ), { type: 'buffer', cellDates: true });
const ws = wb.Sheets[wb.SheetNames.find(s => s.trim().toUpperCase() === 'DADOS')] || wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });

const bloco = montarBlocoRuptura(rows, nome);
const r = calcularRuptura(bloco, { janela: 30 });
const k = r.kpis;

const bytes = Buffer.byteLength(JSON.stringify(bloco));
console.log(`arquivo: ${nome} | linhas: ${rows.length} | data de extração: ${bloco.data_extracao} (${bloco.origem_data})`);
console.log(`bloco compacto: ${(bytes / 1024).toFixed(0)} KB · ${bloco.itens.length} itens com venda · ${bloco.ativos_sem_venda.length} sem venda · ${bloco.suspensos.length} suspensos\n`);

const faixa = (nomeFaixa) => r.faixas.find(f => f.faixa === nomeFaixa)?.itens;
const obtido = {
  ativos: k.ativos, ativosComVenda: k.ativosComVenda, ruptura: k.ruptura, rupturaCd: k.rupturaCd,
  pctRuptura: (k.pctRuptura * 100).toFixed(1) + '%',
  ruptura30: k.rupturaJanela, ruptura30Cd: k.rupturaJanelaCd,
  vendaPerdida30: Math.round(k.vendaPerdida), vendaPerdidaDia30: Math.round(k.vendaPerdidaDia),
  vendaMesAntRisco: Math.round(k.vendaMesAntRisco),
  'faixa 1-7': faixa('1-7'), 'faixa 8-30': faixa('8-30'), 'faixa 31-90': faixa('31-90'),
  'faixa >90': faixa('>90'), 'faixa sem data': faixa('sem data'),
};
const esperado = {
  ativos: 13783, ativosComVenda: 4218, ruptura: 412, rupturaCd: 25, pctRuptura: '9.8%',
  ruptura30: 299, ruptura30Cd: 19, vendaPerdida30: 217190, vendaPerdidaDia30: 17977, vendaMesAntRisco: 555738,
  'faixa 1-7': 101, 'faixa 8-30': 198, 'faixa 31-90': 62, 'faixa >90': 50, 'faixa sem data': 1,
};

let falhas = 0;
for (const chave of Object.keys(esperado)) {
  const ok = String(obtido[chave]) === String(esperado[chave]);
  if (!ok) falhas++;
  console.log((ok ? '  ok   ' : '  DIFF ') + chave.padEnd(20) + String(obtido[chave]).padStart(9) + '   esperado ' + esperado[chave]);
}
console.log(`\n${falhas ? falhas + ' DIVERGÊNCIA(S)' : 'todos os 15 números batem.'}`);

// Queda observada (mês atual x ritmo das 5 semanas). Não há conferência
// externa desses valores; o que se prova aqui são as invariantes.
const brl = v => 'R$ ' + Math.round(v).toLocaleString('pt-BR');
console.log(`\nqueda observada (janela 30) · dia ${k.diaDoMes}/${k.diasNoMes} do mês`);
console.log(`  esperado até o dia ${k.diaDoMes}: ${brl(k.esperadoMes)} · vendido no mês: ${brl(k.vendidoMes)} · queda: ${brl(k.quedaObservada)}`);
let invalidos = 0;
for (const i of r.tabelaVp) {
  if (!(i.queda >= 0) || i.queda > i.esperadoMes + 1e-6 || !Number.isFinite(i.esperadoMes)) invalidos++;
}
if (!(k.quedaObservada >= 0) || k.quedaObservada > k.esperadoMes + 1e-6) invalidos++;
console.log(`  invariantes (0 <= queda <= esperado, em ${r.tabelaVp.length} itens): ${invalidos ? invalidos + ' INVÁLIDO(S)' : 'ok'}`);
console.log('  top 3 por queda:');
[...r.tabelaVp].sort((a, b) => b.queda - a.queda).slice(0, 3).forEach(i => {
  console.log(`    ${String(i.c).padEnd(10)} ${i.d.slice(0, 32).padEnd(33)} semanas antiga→recente [${[...i.sw].reverse().map(v => Math.round(v)).join(', ')}] esperado ${brl(i.esperadoMes)} vendido ${brl(i.vendidoMes)} queda ${brl(i.queda)}`);
});
falhas += invalidos;
process.exit(falhas ? 1 : 0);
