import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

/* ── PDF ────────────────────────────────────────────────────────── */

/**
 * gerarPDF({ titulo, subtitulo, secoes })
 * secoes: [{ titulo, colunas: [{header, dataKey}], rows: [{}] }]
 */
export function gerarPDF({ titulo, subtitulo, secoes = [] }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();

  // Cabeçalho
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(titulo, W / 2, 36, { align: 'center' });

  if (subtitulo) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120);
    doc.text(subtitulo, W / 2, 50, { align: 'center' });
    doc.setTextColor(0);
  }

  let startY = subtitulo ? 64 : 54;

  secoes.forEach((sec, i) => {
    if (i > 0) startY += 14;
    if (sec.titulo) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(sec.titulo, 40, startY);
      startY += 4;
    }

    autoTable(doc, {
      startY,
      columns: sec.colunas,
      body: sec.rows,
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

  doc.save(`${titulo.replace(/\s+/g, '_')}_${dataHoje()}.pdf`);
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
