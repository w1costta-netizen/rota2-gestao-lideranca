import { useState, useEffect } from 'react';
import api from '../api';
import ExportMenu from '../components/ExportMenu';
import { gerarPDF, gerarExcel, compartilharWhatsApp, compartilharEmail } from '../lib/exportUtils';

const DAYS = [
  { key: 'segunda', label: 'Segunda' },
  { key: 'terca',   label: 'Terça' },
  { key: 'quarta',  label: 'Quarta' },
  { key: 'quinta',  label: 'Quinta' },
  { key: 'sexta',   label: 'Sexta' },
  { key: 'sabado',  label: 'Sábado' },
  { key: 'domingo', label: 'Domingo' },
];

const MAX_CAIXAS = 12;
const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8..20
const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function fmt(h) { return `${String(h).padStart(2, '0')}:00`; }

function statusBar(count) {
  const pct = Math.min((count / MAX_CAIXAS) * 100, 100);
  const color = count === 0 ? '#3A3A3A'
    : count <= 3 ? '#EF4444'
    : count <= 6 ? '#F59E0B'
    : '#10B981';
  return { pct, color };
}

export default function CashierAnalysis({ userId, profile }) {
  const now = new Date();
  const [selectedDay, setSelectedDay] = useState('segunda');
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    api.get(`/schedule/operators?user_id=${userId}&day_of_week=${selectedDay}&year=${year}&month=${month}`)
      .then(res => setData(res.data))
      .catch(() => setError('Erro ao carregar dados da escala'))
      .finally(() => setLoading(false));
  }, [userId, selectedDay, year, month]);

  const totalOperadores = data
    ? Math.max(...data.map(h => h.operators), 0)
    : 0;

  const peakHour = data?.reduce((best, h) =>
    h.operators > (best?.operators ?? -1) ? h : best, null);

  const dayLabel = DAYS.find(d => d.key === selectedDay)?.label || selectedDay;
  const periodoLabel = `${MONTHS_PT[month - 1]} ${year} — ${dayLabel}`;

  function handlePDF() {
    if (!data) return;
    gerarPDF({
      titulo: 'Análise de Caixas',
      subtitulo: periodoLabel,
      secoes: [{
        titulo: 'Operadores por Horário',
        colunas: [
          { header: 'Horário', dataKey: 'horario' },
          { header: 'Operadores', dataKey: 'operadores' },
          { header: 'Caixas disponíveis', dataKey: 'disponivel' },
        ],
        rows: data.map(h => ({
          horario: `${fmt(h.hour)} – ${fmt(h.hour + 1)}`,
          operadores: h.operators,
          disponivel: Math.min(h.operators, MAX_CAIXAS),
        })),
      }],
    });
  }

  function handleExcel() {
    if (!data) return;
    gerarExcel({
      nomeArquivo: 'Caixas',
      abas: [{
        nome: periodoLabel.slice(0, 31),
        colunas: ['Horário', 'Operadores', 'Caixas disponíveis'],
        rows: data.map(h => [
          `${fmt(h.hour)} – ${fmt(h.hour + 1)}`,
          h.operators,
          Math.min(h.operators, MAX_CAIXAS),
        ]),
      }],
    });
  }

  function handleWhatsApp() {
    compartilharWhatsApp([
      `🏪 *Análise de Caixas — ${periodoLabel}*`,
      ``,
      `👥 Máx. operadores: ${totalOperadores}`,
      peakHour ? `⏰ Pico: ${fmt(peakHour.hour)} com ${peakHour.operators} operadores` : '',
      `🔢 Caixas disponíveis: ${Math.min(totalOperadores, MAX_CAIXAS)} de ${MAX_CAIXAS}`,
    ].filter(Boolean).join('\n'));
  }

  function handleEmail() {
    compartilharEmail({
      assunto: `Análise de Caixas — ${periodoLabel}`,
      corpo: [
        `Análise de Caixas — ${periodoLabel}`,
        ``,
        `Máx. operadores no dia: ${totalOperadores}`,
        peakHour ? `Horário de pico: ${fmt(peakHour.hour)} com ${peakHour.operators} operadores` : '',
        `Caixas disponíveis no pico: ${Math.min(totalOperadores, MAX_CAIXAS)} de ${MAX_CAIXAS}`,
      ].filter(Boolean).join('\n'),
    });
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Caixas — Frente de Caixa</h1>
          <p className="page-subtitle">
            Operadores disponíveis por faixa horária baseado na escala • {MAX_CAIXAS} caixas no clube
          </p>
        </div>
        {/* Ações */}
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <ExportMenu
            disabled={!data}
            onPDF={handlePDF}
            onExcel={handleExcel}
            onWhatsApp={handleWhatsApp}
            onEmail={handleEmail}
          />
          {/* Seletor de mês/ano */}
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button onClick={() => { const d = new Date(year, month-2); setYear(d.getFullYear()); setMonth(d.getMonth()+1); }}
            style={{ background:'none', border:'1px solid var(--border)', borderRadius:8, padding:'4px 10px', cursor:'pointer', color:'var(--text)', fontSize:16 }}>‹</button>
          <span style={{ fontWeight:700, fontSize:13, minWidth:110, textAlign:'center' }}>
            {MONTHS_PT[month-1]} {year}
          </span>
          <button onClick={() => { const d = new Date(year, month); setYear(d.getFullYear()); setMonth(d.getMonth()+1); }}
            style={{ background:'none', border:'1px solid var(--border)', borderRadius:8, padding:'4px 10px', cursor:'pointer', color:'var(--text)', fontSize:16 }}>›</button>
          </div>
        </div>
      </div>

      {/* Seletor de dia */}
      <div className="card" style={{ marginBottom: 20 }}>
        <label className="form-label" style={{ marginBottom: 10, display: 'block' }}>Dia da semana</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {DAYS.map(d => (
            <button key={d.key}
              className={`day-chip ${selectedDay === d.key ? 'selected' : ''}`}
              onClick={() => setSelectedDay(d.key)}>
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          Carregando escala...
        </div>
      )}

      {error && (
        <div className="card" style={{ textAlign: 'center', padding: '40px', color: '#EF4444' }}>
          {error}
        </div>
      )}

      {data && !loading && (
        <>
          {/* Resumo */}
          <div className="stats-grid" style={{ marginBottom: 20 }}>
            <div className="stat-card">
              <div className="stat-icon"><span style={{ fontSize: 22 }}>👥</span></div>
              <div>
                <div className="stat-value">{totalOperadores}</div>
                <div className="stat-label">Máx. operadores no dia</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon"><span style={{ fontSize: 22 }}>🏪</span></div>
              <div>
                <div className="stat-value">{MAX_CAIXAS}</div>
                <div className="stat-label">Caixas disponíveis</div>
              </div>
            </div>
            {peakHour && peakHour.operators > 0 && (
              <div className="stat-card">
                <div className="stat-icon"><span style={{ fontSize: 22 }}>🔺</span></div>
                <div>
                  <div className="stat-value">{fmt(peakHour.hour)}</div>
                  <div className="stat-label">Pico • {peakHour.operators} operadores</div>
                </div>
              </div>
            )}
            <div className="stat-card">
              <div className="stat-icon"><span style={{ fontSize: 22 }}>📋</span></div>
              <div>
                <div className="stat-value">
                  {data.filter(h => h.operators === 0).length}
                </div>
                <div className="stat-label">Faixas sem cobertura</div>
              </div>
            </div>
          </div>

          {/* Tabela principal */}
          <div className="card">
            <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 20 }}>
              Operadores por faixa horária —{' '}
              <span style={{ color: 'var(--primary)' }}>
                {DAYS.find(d => d.key === selectedDay)?.label}
              </span>
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {HOURS.map(h => {
                const row = data.find(r => r.hour === h) || { hour: h, operators: 0, names: [] };
                const { pct, color } = statusBar(row.operators);
                return (
                  <div key={h} style={{
                    display: 'grid',
                    gridTemplateColumns: '80px 40px 1fr 200px',
                    alignItems: 'center',
                    gap: 14,
                    padding: '10px 14px',
                    background: 'var(--surface-2)',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                  }}>
                    {/* Faixa horária */}
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      {fmt(h)}–{fmt(h + 1)}
                    </div>

                    {/* Número */}
                    <div style={{
                      fontWeight: 800,
                      fontSize: 18,
                      color,
                      textAlign: 'center',
                    }}>
                      {row.operators}
                    </div>

                    {/* Barra */}
                    <div style={{ background: 'var(--border)', borderRadius: 99, height: 8, overflow: 'hidden' }}>
                      <div style={{
                        width: `${pct}%`,
                        height: '100%',
                        background: color,
                        borderRadius: 99,
                        transition: 'width .3s',
                      }} />
                    </div>

                    {/* Nomes */}
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.names?.length > 0
                        ? row.names.slice(0, 3).join(', ') + (row.names.length > 3 ? ` +${row.names.length - 3}` : '')
                        : <span style={{ color: '#444' }}>Sem operadores</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Legenda cores */}
            <div style={{ display: 'flex', gap: 20, marginTop: 16, flexWrap: 'wrap' }}>
              {[
                { color: '#10B981', label: '7–12 operadores' },
                { color: '#F59E0B', label: '4–6 operadores' },
                { color: '#EF4444', label: '1–3 operadores' },
                { color: '#3A3A3A', label: 'Sem cobertura' },
              ].map(l => (
                <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: l.color, display: 'inline-block' }} />
                  {l.label}
                </div>
              ))}
            </div>
          </div>

          {/* Aviso sem dados */}
          {data.every(h => h.operators === 0) && (
            <div className="card" style={{ marginTop: 16, textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
              <p style={{ fontWeight: 600, color: 'var(--text)' }}>Nenhum operador de caixa na escala para este dia</p>
              <p style={{ fontSize: 13, marginTop: 6 }}>
                Importe uma escala com colaboradores do setor <strong>Frente de Caixa</strong> para ver a cobertura horária.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
