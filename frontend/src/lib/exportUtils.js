import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

/* ── PDF ────────────────────────────────────────────────────────── */

// O jsPDF usa a Helvetica embutida, que só conhece a tabela WinAnsi. Um
// caractere fora dela — um emoji colado, um ✓ — faz a LINHA INTEIRA virar
// UTF-16: o leitor desenha cada letra separada por um byte nulo, o texto sai
// espaçado com quase o dobro da largura e estoura a margem, enquanto a conta
// da quebra de linha achava que cabia. Já custou um PDF de ata quebrado.
//
// Acentos, cedilha, travessões e aspas curvas SÃO WinAnsi e passam — é o que
// aparece em texto colado de editor, e tirá-los estragaria o documento.
const FORA_DO_WINANSI =
  /[^\n\u0020-\u007E\u00A0-\u00FF\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC\u2013\u2014\u2018\u2019\u201A\u201C\u201D\u201E\u2020\u2021\u2022\u2026\u2030\u2039\u203A\u20AC\u2122]/g;

export const limparParaPDF = (t) => String(t ?? '').replace(FORA_DO_WINANSI, '');

/**
 * gerarPDF({ titulo, subtitulo, secoes, orientacao })
 * secoes: [{ titulo, colunas: [{header, dataKey}], rows: [{}] }]
 * orientacao: 'landscape' (padrão) ou 'portrait', para texto corrido
 */
export function gerarPDF({ titulo, subtitulo, secoes = [], orientacao = 'landscape' }) {
  const doc = new jsPDF({ orientation: orientacao, unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();

  // Cabeçalho
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(limparParaPDF(titulo), W / 2, 36, { align: 'center' });

  if (subtitulo) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120);
    doc.text(limparParaPDF(subtitulo), W / 2, 50, { align: 'center' });
    doc.setTextColor(0);
  }

  let startY = subtitulo ? 64 : 54;

  secoes.forEach((sec, i) => {
    if (i > 0) startY += 14;
    if (sec.titulo) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(limparParaPDF(sec.titulo), 40, startY);
      startY += 4;
    }

    autoTable(doc, {
      startY,
      columns: sec.colunas,
      body: (sec.rows || []).map(linha => {
        const limpa = {};
        Object.entries(linha).forEach(([k, v]) => {
          limpa[k] = typeof v === 'string' ? limparParaPDF(v) : v;
        });
        return limpa;
      }),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [232, 104, 26], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      margin: { left: 40, right: 40 },
      didDrawPage: () => {
        // O nome do app fica só aqui, no rodapé. O cabeçalho é do assunto e
        // da loja — o documento pertence ao cliente, não ao sistema.
        const alturaPagina = doc.internal.pageSize.getHeight();
        doc.setFontSize(7);
        doc.setTextColor(150);
        doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, 40, alturaPagina - 14);
        doc.text('Rota Líder · rotalider.com.br', W - 40, alturaPagina - 14, { align: 'right' });
        doc.setTextColor(0);
      },
    });

    startY = doc.lastAutoTable.finalY + 12;
  });

  doc.save(`${limparParaPDF(titulo).replace(/\s+/g, '_')}_${dataHoje()}.pdf`);
}

/* ── EXCEL ──────────────────────────────────────────────────────── */

/**
 * gerarExcel({ nomeArquivo, abas })
 * abas: [{ nome, colunas: [string], rows: [array] }]
 */
export function gerarExcel({ nomeArquivo, abas = [] }) {
  const wb = XLSX.utils.book_new();

  abas.forEach(aba => {
    const ws = XLSX.utils.aoa_to_sheet([aba.colunas, ...aba.rows]);

    // Largura automática
    const colWidths = aba.colunas.map((h, ci) => ({
      wch: Math.max(
        h.length,
        ...aba.rows.map(r => String(r[ci] ?? '').length)
      ) + 2,
    }));
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, aba.nome.slice(0, 31));
  });

  XLSX.writeFile(wb, `${nomeArquivo}_${dataHoje()}.xlsx`);
}

/* ── WHATSAPP ───────────────────────────────────────────────────── */

export function compartilharWhatsApp(texto) {
  const url = `https://wa.me/?text=${encodeURIComponent(texto)}`;
  window.open(url, '_blank');
}

/* ── EMAIL ──────────────────────────────────────────────────────── */

export function compartilharEmail({ assunto, corpo }) {
  const url = `mailto:?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
  window.location.href = url;
}

/* ── helpers ────────────────────────────────────────────────────── */

function dataHoje() {
  return new Date().toISOString().slice(0, 10);
}
