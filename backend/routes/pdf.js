const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const supabase = require('../supabase');

const DAY_LABELS = {
  domingo: 'Domingo',
  segunda: 'Segunda-feira',
  terca: 'Terça-feira',
  quarta: 'Quarta-feira',
  quinta: 'Quinta-feira',
  sexta: 'Sexta-feira',
  sabado: 'Sábado',
};

router.get('/leader/:id', async (req, res) => {
  const { week_start } = req.query;

  const { data: leader, error: le } = await supabase.from('leaders').select('*').eq('id', req.params.id).single();
  if (le) return res.status(404).json({ error: 'Líder não encontrado' });

  const workDays = leader.work_days;

  const { data: items } = await supabase.from('agenda_items')
    .select('*').eq('week_start', week_start).order('day_of_week').order('time');

  const filtered = (items || []).filter(item => {
    if (!workDays.includes(item.day_of_week)) return false;
    if (item.target_type === 'geral') return true;
    if (item.target_type === 'setor') return item.target_value === leader.sector;
    if (item.target_type === 'lider') return item.target_value === String(leader.id);
    return false;
  });

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="agenda_${leader.name.replace(/\s/g,'_')}.pdf"`);
  doc.pipe(res);

  // Header
  doc.rect(0, 0, doc.page.width, 90).fill('#1e3a5f');
  doc.fillColor('white').fontSize(22).font('Helvetica-Bold')
    .text('GestãoLiderança', 50, 20);
  doc.fontSize(12).font('Helvetica')
    .text(`Agenda Semanal — ${leader.name}`, 50, 50);
  doc.text(`Setor: ${leader.sector}  |  Semana: ${formatWeek(week_start)}`, 50, 68);
  doc.fillColor('black');

  let y = 110;

  if (filtered.length === 0) {
    doc.fontSize(13).text('Nenhum item de agenda para esta semana.', 50, y);
  } else {
    const byDay = {};
    filtered.forEach(item => {
      if (!byDay[item.day_of_week]) byDay[item.day_of_week] = [];
      byDay[item.day_of_week].push(item);
    });

    workDays.forEach(day => {
      if (!byDay[day]) return;

      // Day header
      doc.rect(50, y, doc.page.width - 100, 24).fill('#e8f0fe');
      doc.fillColor('#1e3a5f').fontSize(12).font('Helvetica-Bold')
        .text(DAY_LABELS[day] || day, 58, y + 6);
      doc.fillColor('black').font('Helvetica');
      y += 32;

      byDay[day].forEach(item => {
        if (y > doc.page.height - 80) { doc.addPage(); y = 50; }

        const tagColor = item.target_type === 'geral' ? '#10b981' : item.target_type === 'setor' ? '#f59e0b' : '#6366f1';
        doc.rect(50, y, 4, 40).fill(tagColor);

        doc.fillColor('#111').fontSize(11).font('Helvetica-Bold')
          .text((item.time ? `${item.time} — ` : '') + item.title, 62, y + 4, { width: doc.page.width - 130 });

        if (item.description) {
          doc.fontSize(10).font('Helvetica').fillColor('#555')
            .text(item.description, 62, y + 20, { width: doc.page.width - 130 });
        }

        const tagLabel = item.target_type === 'geral' ? 'Geral' : item.target_type === 'setor' ? `Setor: ${item.target_value}` : 'Individual';
        doc.fontSize(8).fillColor(tagColor)
          .text(tagLabel, doc.page.width - 120, y + 4, { width: 70, align: 'right' });

        doc.fillColor('black');
        y += 50;
      });

      y += 8;
    });
  }

  // Footer
  doc.fontSize(9).fillColor('#888')
    .text(`Gerado em ${new Date().toLocaleString('pt-BR')} — GestãoLiderança`, 50, doc.page.height - 40, { align: 'center' });

  doc.end();
});

function formatWeek(week_start) {
  if (!week_start) return '—';
  const [y, m, d] = week_start.split('-');
  return `${d}/${m}/${y}`;
}

module.exports = router;
