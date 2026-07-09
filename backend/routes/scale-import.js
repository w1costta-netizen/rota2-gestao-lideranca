const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const pdfParse = require('pdf-parse');
const supabase = require('../supabase');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAY_MAP = {
  'segunda':'segunda','seg':'segunda','monday':'segunda','mon':'segunda','2ª':'segunda',
  'terça':'terca','terca':'terca','ter':'terca','tuesday':'terca','tue':'terca','3ª':'terca',
  'quarta':'quarta','qua':'quarta','wednesday':'quarta','wed':'quarta','4ª':'quarta',
  'quinta':'quinta','qui':'quinta','thursday':'quinta','thu':'quinta','5ª':'quinta',
  'sexta':'sexta','sex':'sexta','friday':'sexta','fri':'sexta','6ª':'sexta',
  'sábado':'sabado','sabado':'sabado','sab':'sabado','saturday':'sabado','sat':'sabado','7ª':'sabado',
  'domingo':'domingo','dom':'domingo','sunday':'domingo','sun':'domingo','1ª':'domingo',
};

const HEADER_MAP = {
  nome:        ['nome','name','colaborador','funcionário','funcionario','empregado','profissional','trabalhador'],
  setor:       ['setor','departamento','area','área','depto','dept','sector','department'],
  funcao:      ['função','funcao','cargo','role','função/cargo','position','ocupação'],
  data:        ['data','date','dia','day','dt'],
  inicio:      ['início','inicio','entrada','start','hr_inicio','hora início','hora_inicio','check-in'],
  fim:         ['fim','saída','saida','end','hr_fim','hora fim','hora_saida','check-out'],
  turno:       ['turno','shift','jornada','período','periodo'],
  observacao:  ['obs','observação','observacao','nota','notes','note','detalhe'],
  dia_semana:  ['dia semana','dia_semana','weekday','day of week'],
};

function normalizeKey(str) {
  return String(str).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
}

function detectColumn(headers, type) {
  const candidates = HEADER_MAP[type] || [];
  for (const h of headers) {
    const norm = normalizeKey(h);
    if (candidates.some(c => norm.includes(c) || c.includes(norm))) return h;
  }
  return null;
}

function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().split('T')[0];
  if (typeof val === 'number') {
    // Excel serial date
    const date = XLSX.SSF.parse_date_code(val);
    if (date) return `${date.y}-${String(date.m).padStart(2,'0')}-${String(date.d).padStart(2,'0')}`;
  }
  const s = String(val).trim();
  // DD/MM/YYYY
  const m1 = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (m1) {
    const y = m1[3].length === 2 ? '20' + m1[3] : m1[3];
    return `${y}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`;
  }
  // YYYY-MM-DD
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) return s;
  return null;
}

function parseTime(val) {
  if (!val) return null;
  if (typeof val === 'number' && val < 1) {
    const totalMin = Math.round(val * 24 * 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) return `${m[1].padStart(2,'0')}:${m[2]}`;
  return s || null;
}

function detectDayOfWeek(dateStr, rawVal) {
  if (dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    const days = ['domingo','segunda','terca','quarta','quinta','sexta','sabado'];
    return days[d.getDay()];
  }
  if (rawVal) {
    const norm = normalizeKey(String(rawVal));
    for (const [k,v] of Object.entries(DAY_MAP)) {
      if (norm.includes(k)) return v;
    }
  }
  return null;
}

// ── Parse Excel ───────────────────────────────────────────────────────────────
function parseExcel(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
  const results = [];
  const allHeaders = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
    if (!rows.length) continue;

    const headers = Object.keys(rows[0]);
    allHeaders.push(...headers);

    const colNome    = detectColumn(headers, 'nome');
    const colSetor   = detectColumn(headers, 'setor');
    const colFuncao  = detectColumn(headers, 'funcao');
    const colData    = detectColumn(headers, 'data');
    const colInicio  = detectColumn(headers, 'inicio');
    const colFim     = detectColumn(headers, 'fim');
    const colTurno   = detectColumn(headers, 'turno');
    const colObs     = detectColumn(headers, 'observacao');
    const colDia     = detectColumn(headers, 'dia_semana');

    for (const row of rows) {
      const rawDate = colData ? row[colData] : null;
      const dateStr = parseDate(rawDate);
      const dayOfWeek = detectDayOfWeek(dateStr, colDia ? row[colDia] : rawDate);

      results.push({
        employee_name: colNome   ? String(row[colNome] || '').trim()   : null,
        sector:        colSetor  ? String(row[colSetor]|| '').trim()   : null,
        role:          colFuncao ? String(row[colFuncao]||'').trim()   : null,
        work_date:     dateStr,
        day_of_week:   dayOfWeek,
        start_time:    colInicio ? parseTime(row[colInicio])           : null,
        end_time:      colFim    ? parseTime(row[colFim])              : null,
        shift:         colTurno  ? String(row[colTurno]||'').trim()   : null,
        notes:         colObs    ? String(row[colObs]  ||'').trim()   : null,
        raw_row:       row,
      });
    }
  }

  return { entries: results, headers: [...new Set(allHeaders)] };
}

// ── Parse PDF (text extraction + pattern recognition) ─────────────────────────
async function parsePDF(buffer) {
  const data = await pdfParse(buffer);
  const text = data.text;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const entries = [];

  // Patterns to detect lines with schedule info
  const timePattern = /(\d{1,2}:\d{2})/g;
  const datePattern = /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/;
  const dayPattern = new RegExp(Object.keys(DAY_MAP).join('|'), 'gi');

  for (const line of lines) {
    const times = [...line.matchAll(timePattern)].map(m => m[1]);
    const dateMatch = line.match(datePattern);
    const dayMatch = line.match(dayPattern);

    if (times.length === 0 && !dateMatch && !dayMatch) continue;

    const dateStr = dateMatch ? parseDate(dateMatch[1]) : null;
    const dayRaw  = dayMatch ? dayMatch[0].toLowerCase() : null;
    const dayOfWeek = detectDayOfWeek(dateStr, dayRaw);

    entries.push({
      employee_name: null,
      sector:        null,
      role:          null,
      work_date:     dateStr,
      day_of_week:   dayOfWeek,
      start_time:    times[0] || null,
      end_time:      times[1] || null,
      shift:         null,
      notes:         line.length < 200 ? line : line.substring(0, 200),
      raw_row:       { line },
    });
  }

  return { entries, headers: ['line'], rawText: text.substring(0, 5000) };
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Upload and parse
router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });

  const { user_id, period } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id obrigatório' });

  const filename  = req.file.originalname;
  const mimetype  = req.file.mimetype;
  const isExcel   = mimetype.includes('spreadsheet') || mimetype.includes('excel') || filename.match(/\.xlsx?$/i);
  const isPDF     = mimetype === 'application/pdf' || filename.match(/\.pdf$/i);

  if (!isExcel && !isPDF) return res.status(400).json({ error: 'Formato inválido. Use Excel (.xlsx/.xls) ou PDF.' });

  try {
    let parsed;
    if (isExcel) parsed = parseExcel(req.file.buffer);
    else         parsed = await parsePDF(req.file.buffer);

    const validEntries = parsed.entries.filter(e => e.employee_name || e.work_date || e.start_time);

    // Save import record
    const { data: importRec, error: ie } = await supabase.from('scale_imports').insert({
      user_id, filename,
      file_type: isExcel ? 'excel' : 'pdf',
      period: period || null,
      total_entries: validEntries.length,
      raw_headers: parsed.headers,
    }).select().single();

    if (ie) return res.status(500).json({ error: ie.message });

    // Save entries in batches of 100
    if (validEntries.length > 0) {
      const toInsert = validEntries.map(e => ({ ...e, import_id: importRec.id, user_id }));
      for (let i = 0; i < toInsert.length; i += 100) {
        const { error: ee } = await supabase.from('scale_entries').insert(toInsert.slice(i, i + 100));
        if (ee) console.error('Batch insert error:', ee.message);
      }
    }

    res.json({
      import: importRec,
      total: validEntries.length,
      preview: validEntries.slice(0, 5),
      headers: parsed.headers,
      rawText: parsed.rawText || null,
    });

  } catch (err) {
    console.error('Parse error:', err);
    res.status(500).json({ error: 'Erro ao processar arquivo: ' + err.message });
  }
});

// List imports
router.get('/imports', async (req, res) => {
  const { user_id } = req.query;
  const { data, error } = await supabase.from('scale_imports')
    .select('*').eq('user_id', user_id).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Get entries for an import
router.get('/imports/:id/entries', async (req, res) => {
  const { data, error } = await supabase.from('scale_entries')
    .select('*').eq('import_id', req.params.id).order('work_date').order('employee_name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Delete import (cascades to entries)
router.delete('/imports/:id', async (req, res) => {
  const { error } = await supabase.from('scale_imports').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// Summary analysis of an import
router.get('/imports/:id/summary', async (req, res) => {
  const { data: entries, error } = await supabase.from('scale_entries')
    .select('*').eq('import_id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });

  const byEmployee = {};
  const bySector   = {};
  const byDay      = {};
  const byShift    = {};

  entries.forEach(e => {
    if (e.employee_name) {
      byEmployee[e.employee_name] = (byEmployee[e.employee_name] || 0) + 1;
    }
    if (e.sector) bySector[e.sector] = (bySector[e.sector] || 0) + 1;
    if (e.day_of_week) byDay[e.day_of_week] = (byDay[e.day_of_week] || 0) + 1;
    if (e.shift) byShift[e.shift] = (byShift[e.shift] || 0) + 1;
  });

  res.json({
    total: entries.length,
    unique_employees: Object.keys(byEmployee).length,
    by_employee: byEmployee,
    by_sector:   bySector,
    by_day:      byDay,
    by_shift:    byShift,
  });
});

module.exports = router;
