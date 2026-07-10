const PDFParser = require('pdf2json');

const DAY_COLS = ['domingo','segunda','terca','quarta','quinta','sexta','sabado'];
const DAY_LABELS = ['DOM','SEG','TER','QUA','QUI','SEX','SÁB','SAB'];

function normalize(str) {
  return String(str||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
}

function parseTimeRange(str) {
  const m = String(str).match(/(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return { start: `${m[1].padStart(2,'0')}:${m[2]}`, end: `${m[3].padStart(2,'0')}:${m[4]}` };
}

function parsePDFBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser(null, 1);
    parser.on('pdfParser_dataError', err => reject(err.parserError));
    parser.on('pdfParser_dataReady', pdfData => {
      try {
        const result = extractEscala(pdfData);
        resolve(result);
      } catch(e) {
        reject(e);
      }
    });
    parser.parseBuffer(buffer);
  });
}

function extractEscala(pdfData) {
  const page = pdfData.Pages[0];
  if (!page) return { sector: null, entries: [] };

  // Coletar todos os textos com posição X/Y
  const texts = [];
  for (const t of page.Texts) {
    const text = decodeURIComponent(t.R.map(r => r.T).join(''));
    texts.push({ x: t.x, y: t.y, text: text.trim() });
  }

  // ── Extrair cabeçalho ─────────────────────────────────────────────────────
  let sector = null;
  let period = null;
  for (const t of texts) {
    const n = normalize(t.text);
    if (n === 'FRENTE DE CAIXA' || n.includes('FRENTE DE CAIXA')) sector = 'FRENTE DE CAIXA';
    if (!sector && n === 'FRENTE CAIXA') sector = 'FRENTE DE CAIXA';
    // tentar pegar o valor após "Departamento:"
    if (n.startsWith('DEPARTAMENTO') || n.startsWith('DEPTO')) sector = t.text.replace(/departamento\s*:?\s*/i,'').trim();
  }

  // ── Encontrar a linha dos dias (DOM SEG TER QUA QUI SEX SÁB) ─────────────
  let dayRowY = null;
  const dayXMap = {}; // { 'segunda': x_center, ... }

  for (const t of texts) {
    const n = normalize(t.text);
    const idx = DAY_LABELS.indexOf(n);
    if (idx !== -1) {
      dayXMap[DAY_COLS[idx]] = t.x;
      dayRowY = t.y;
    }
  }

  // fallback: tentar detectar linha com datas (12/07/26)
  if (!dayRowY) {
    const dateTexts = texts.filter(t => /^\d{2}\/\d{2}\/\d{2}$/.test(t.text.trim()));
    if (dateTexts.length >= 5) {
      // ordenar por x e atribuir aos dias a partir do domingo
      dateTexts.sort((a,b) => a.x - b.x);
      dayRowY = dateTexts[0].y;
      const sorted = dateTexts.slice(0, 7);
      sorted.forEach((d, i) => { dayXMap[DAY_COLS[i]] = d.x; });
    }
  }

  // ── Encontrar X da coluna de matrícula e nome ─────────────────────────────
  // Matrícula = números de 5-6 dígitos; Nome = texto em caps
  const matriculaPattern = /^\d{5,7}$/;

  // Agrupar textos por linha (Y arredondado)
  const rows = {};
  for (const t of texts) {
    const yKey = Math.round(t.y * 10) / 10;
    if (!rows[yKey]) rows[yKey] = [];
    rows[yKey].push(t);
  }

  const sortedYs = Object.keys(rows).map(Number).sort((a,b) => a-b);

  // ── Identificar linhas de funcionários ───────────────────────────────────
  // Cada linha de funcionário tem: MATRICULA (5-6 dig), NOME (caps), e horários
  const employees = [];

  for (const y of sortedYs) {
    const rowTexts = rows[y].sort((a,b) => a.x - b.x);
    const first = rowTexts[0]?.text;

    // Linha começa com matrícula?
    if (matriculaPattern.test(first)) {
      const matricula = first;
      // Nome: próximos textos em caps antes dos horários/DSR/FÉRIAS
      let name = '';
      const scheduleByDay = {};

      for (const t of rowTexts.slice(1)) {
        const val = t.text.trim();
        const norm = normalize(val);

        if (/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(val)) {
          // horário — descobrir qual dia pelo X mais próximo
          const day = closestDay(t.x, dayXMap);
          if (day) scheduleByDay[day] = val;
        } else if (norm === 'DSR' || norm === 'FERIAS' || norm === 'FÉRIAS') {
          const day = closestDay(t.x, dayXMap);
          if (day) scheduleByDay[day] = norm === 'DSR' ? 'DSR' : 'FERIAS';
        } else if (!name && val.length > 2 && /^[A-ZÀ-Ú\s]+$/.test(val)) {
          name += (name ? ' ' : '') + val;
        } else if (name && val.length > 2 && /^[A-ZÀ-Ú\s]+$/.test(val) && !parseTimeRange(val)) {
          name += ' ' + val;
        }
      }

      if (name || Object.keys(scheduleByDay).length > 0) {
        employees.push({ matricula, name: name.trim(), sector: sector || 'FRENTE DE CAIXA', scheduleByDay });
      }
    }
  }

  // ── Se não encontramos por matrícula, tentar reconstruir de outra forma ──
  // (fallback: parsear nomes e horários separadamente e fazer zip)
  if (employees.length === 0) {
    return fallbackParse(texts, sector);
  }

  // ── Montar entries por dia ────────────────────────────────────────────────
  const entries = [];
  const dayDateMap = buildDayDateMap(texts);

  for (const emp of employees) {
    for (const [day, sched] of Object.entries(emp.scheduleByDay)) {
      if (sched === 'DSR' || sched === 'FERIAS') continue;
      const time = parseTimeRange(sched);
      if (!time) continue;
      entries.push({
        employee_name: emp.name,
        sector: emp.sector,
        role: 'Operador de Caixa',
        day_of_week: day,
        work_date: dayDateMap[day] || null,
        start_time: time.start,
        end_time: time.end,
        shift: null,
        notes: null,
      });
    }
  }

  return { sector, entries, employeeCount: employees.length };
}

function closestDay(x, dayXMap) {
  let best = null;
  let bestDist = Infinity;
  for (const [day, dx] of Object.entries(dayXMap)) {
    const dist = Math.abs(x - dx);
    if (dist < bestDist) { bestDist = dist; best = day; }
  }
  return bestDist < 3 ? best : null; // tolerância de 3 unidades PDF
}

function buildDayDateMap(texts) {
  // procura datas no formato DD/MM/YY e mapeia para dia da semana
  const dateTexts = texts.filter(t => /^\d{2}\/\d{2}\/\d{2}$/.test(t.text.trim()))
    .sort((a,b) => a.x - b.x);
  const map = {};
  dateTexts.slice(0,7).forEach((d, i) => {
    const [dd, mm, yy] = d.text.trim().split('/');
    const fullYear = '20' + yy;
    const iso = `${fullYear}-${mm}-${dd}`;
    map[DAY_COLS[i]] = iso;
  });
  return map;
}

// Fallback: parsear nomes e horários independentemente e fazer zip por ordem
function fallbackParse(texts, sector) {
  const sortedByY = [...texts].sort((a,b) => a.y - b.y || a.x - b.x);

  const names = [];
  const scheduleRows = [];

  const matriculaPattern = /^\d{5,7}$/;
  let currentName = null;

  const groups = {};
  for (const t of sortedByY) {
    const yKey = Math.round(t.y * 2) / 2;
    if (!groups[yKey]) groups[yKey] = [];
    groups[yKey].push(t);
  }

  for (const y of Object.keys(groups).map(Number).sort((a,b)=>a-b)) {
    const row = groups[y].sort((a,b) => a.x - b.x);
    const vals = row.map(r => r.text.trim()).filter(Boolean);

    // linha de nome: começa com matrícula seguida de nome em caps
    if (matriculaPattern.test(vals[0]) && vals[1] && /^[A-ZÀ-Ú]/.test(vals[1])) {
      const nameParts = vals.slice(1).filter(v => /^[A-ZÀ-Ú\s\.]+$/.test(v) && !matriculaPattern.test(v));
      currentName = nameParts.join(' ').trim();
      if (currentName) names.push({ name: currentName, schedules: {} });
    }
    // linha de horários
    else if (vals.some(v => /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(v))) {
      scheduleRows.push({ y, vals, row });
    }
  }

  // Sem mapeamento posicional confiável — retornar vazio com aviso
  return { sector, entries: [], employeeCount: names.length, warning: 'fallback_sem_posicao' };
}

module.exports = { parsePDFBuffer };
