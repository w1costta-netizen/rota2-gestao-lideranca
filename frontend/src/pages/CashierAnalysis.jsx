import { useState, useEffect, useCallback } from 'react';
import api from '../api';

const DAYS = [
  { key: 'segunda', label: 'Segunda' },
  { key: 'terca',   label: 'Terça' },
  { key: 'quarta',  label: 'Quarta' },
  { key: 'quinta',  label: 'Quinta' },
  { key: 'sexta',   label: 'Sexta' },
  { key: 'sabado',  label: 'Sábado' },
  { key: 'domingo', label: 'Domingo' },
];

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8..20

const STATUS_CONFIG = {
  ok:         { label: 'OK',          color: '#10B981', bg: 'rgba(16,185,129,.12)',  icon: '✅' },
  atencao:    { label: 'Atenção',     color: '#F59E0B', bg: 'rgba(245,158,11,.12)',  icon: '⚠️' },
  critico:    { label: 'Risco',       color: '#EF4444', bg: 'rgba(239,68,68,.12)',   icon: '🔴' },
  sem_escala: { label: 'Sem escala',  color: '#8B5CF6', bg: 'rgba(139,92,246,.12)', icon: '📋' },
  sem_dados:  { label: 'Sem dados',   color: '#555',    bg: 'rgba(80,80,80,.08)',    icon: '—'  },
};

function fmt(h) { return `${String(h).padStart(2,'0')}:00`; }

export default function CashierAnalysis({ userId }) {
  const [tab, setTab] = useState('analysis');
  const [selectedDay, setSelectedDay] = useState('segunda');
  const [throughput, setThroughput] = useState(25);
  const [analysis, setAnalysis] = useState(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);

  // histórico
  const [histDate, setHistDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [histEntries, setHistEntries] = useState(
    HOURS.reduce((a, h) => ({ ...a, [h]: '' }), {})
  );
  const [saving, setSaving] = useState(false);
  const [historyList, setHistoryList] = useState([]);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ── Análise ──────────────────────────────────────────────────────────────────
  const loadAnalysis = useCallback(async () => {
    if (!userId) return;
    setLoadingAnalysis(true);
    try {
      const data = await api.get(
        `/cashier/analysis?user_id=${userId}&day_of_week=${selectedDay}&throughput=${throughput}`
      );
      setAnalysis(data);
    } catch {
      showToast('Erro ao carregar análise', 'error');
    } finally {
      setLoadingAnalysis(false);
    }
  }, [userId, selectedDay, throughput]);

  useEffect(() => { if (tab === 'analysis') loadAnalysis(); }, [tab, loadAnalysis]);

  // ── Histórico ─────────────────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await api.get(`/cashier/tickets?user_id=${userId}&limit=30`);
      // agrupar por date
      const byDate = {};
      for (const r of data) {
        if (!byDate[r.date]) byDate[r.date] = { date: r.date, day_of_week: r.day_of_week, total: 0, hours: 0 };
        byDate[r.date].total += r.tickets;
        byDate[r.date].hours += 1;
      }
      setHistoryList(Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15));
    } catch {}
  }, [userId]);

  useEffect(() => { if (tab === 'history') loadHistory(); }, [tab, loadHistory]);

  const saveHistory = async () => {
    const entries = HOURS
      .filter(h => histEntries[h] !== '' && !isNaN(Number(histEntries[h])))
      .map(h => ({ hour: h, tickets: Number(histEntries[h]) }));
    if (!entries.length) return showToast('Preencha ao menos um horário', 'error');
    setSaving(true);
    try {
      await api.post('/cashier/tickets', { user_id: userId, date: histDate, entries });
      showToast(`${entries.length} horários salvos com sucesso`);
      setHistEntries(HOURS.reduce((a, h) => ({ ...a, [h]: '' }), {}));
      loadHistory();
    } catch {
      showToast('Erro ao salvar', 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteHistory = async (date) => {
    if (!confirm(`Excluir todos os dados de ${date}?`)) return;
    await api.delete(`/cashier/tickets?user_id=${userId}&date=${date}`);
    loadHistory();
  };

  // ── Sumário da análise ───────────────────────────────────────────────────────
  const summary = analysis?.hours?.reduce((acc, h) => {
    if (h.status === 'critico') acc.critico++;
    else if (h.status === 'atencao') acc.atencao++;
    else if (h.status === 'ok') acc.ok++;
    return acc;
  }, { critico: 0, atencao: 0, ok: 0 }) || {};

  const peakHour = analysis?.hours?.reduce((best, h) => {
    if (!h.avg_tickets) return best;
    return (!best || h.avg_tickets > best.avg_tickets) ? h : best;
  }, null);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Análise de Caixas</h1>
          <p className="page-subtitle">Otimização de abertura de caixas baseada em histórico de tickets</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {[
          { k: 'analysis', label: '📊 Painel de Análise' },
          { k: 'history',  label: '📥 Inserir Histórico' },
        ].map(t => (
          <button key={t.k} className={`btn ${tab === t.k ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTab(t.k)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── ABA ANÁLISE ─────────────────────────────────────────────────── */}
      {tab === 'analysis' && (
        <div>
          {/* Controles */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ margin: 0, minWidth: 200 }}>
                <label className="form-label">Dia da semana</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {DAYS.map(d => (
                    <button key={d.key}
                      className={`day-chip ${selectedDay === d.key ? 'selected' : ''}`}
                      onClick={() => setSelectedDay(d.key)}>
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Tickets por caixa/hora</label>
                <input type="number" className="input" value={throughput} min={5} max={100}
                  onChange={e => setThroughput(Number(e.target.value))}
                  style={{ width: 100 }} />
              </div>
              <button className="btn btn-primary" onClick={loadAnalysis} disabled={loadingAnalysis}>
                {loadingAnalysis ? 'Analisando...' : '🔄 Atualizar'}
              </button>
            </div>
          </div>

          {/* Cards resumo */}
          {analysis && (
            <>
              <div className="stats-grid" style={{ marginBottom: 20 }}>
                <div className="stat-card">
                  <div className="stat-icon" style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.2)' }}>
                    <span style={{ fontSize: 22 }}>🔴</span>
                  </div>
                  <div>
                    <div className="stat-value" style={{ color: '#EF4444' }}>{summary.critico}</div>
                    <div className="stat-label">Horários críticos</div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon" style={{ background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.2)' }}>
                    <span style={{ fontSize: 22 }}>⚠️</span>
                  </div>
                  <div>
                    <div className="stat-value" style={{ color: '#F59E0B' }}>{summary.atencao}</div>
                    <div className="stat-label">Atenção</div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon" style={{ background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.2)' }}>
                    <span style={{ fontSize: 22 }}>✅</span>
                  </div>
                  <div>
                    <div className="stat-value" style={{ color: '#10B981' }}>{summary.ok}</div>
                    <div className="stat-label">Horários OK</div>
                  </div>
                </div>
                {peakHour && (
                  <div className="stat-card">
                    <div className="stat-icon">
                      <span style={{ fontSize: 22 }}>🏔️</span>
                    </div>
                    <div>
                      <div className="stat-value">{fmt(peakHour.hour)}</div>
                      <div className="stat-label">Pico • {peakHour.avg_tickets} tickets/h</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Tabela hora a hora */}
              <div className="card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <h3 style={{ fontWeight: 700, fontSize: 15 }}>
                    Análise hora a hora —{' '}
                    <span style={{ color: 'var(--primary)' }}>
                      {DAYS.find(d => d.key === selectedDay)?.label}
                    </span>
                  </h3>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Capacidade: {throughput} tickets/caixa/hora • Máx. 12 caixas
                  </span>
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Horário</th>
                        <th>Tickets (média)</th>
                        <th>Amostras</th>
                        <th>Caixas necessários</th>
                        <th>Caixas na escala</th>
                        <th>Diferença</th>
                        <th>Status</th>
                        <th>Operadores</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.hours.map(h => {
                        const cfg = STATUS_CONFIG[h.status];
                        const diff = h.cashiers_surplus;
                        return (
                          <tr key={h.hour}>
                            <td style={{ fontWeight: 700, fontSize: 15 }}>{fmt(h.hour)}</td>
                            <td>
                              {h.avg_tickets !== null
                                ? <span style={{ fontWeight: 600 }}>{h.avg_tickets}</span>
                                : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                            </td>
                            <td style={{ color: 'var(--text-muted)' }}>
                              {h.sample_count > 0 ? `${h.sample_count}x` : '—'}
                            </td>
                            <td>
                              {h.cashiers_needed !== null
                                ? <span style={{ fontWeight: 600 }}>{h.cashiers_needed}</span>
                                : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                            </td>
                            <td>
                              <span style={{
                                fontWeight: 700,
                                color: h.cashiers_available === 0 ? 'var(--text-muted)' : 'var(--text)'
                              }}>
                                {h.cashiers_available}
                              </span>
                            </td>
                            <td>
                              {diff !== null
                                ? <span style={{
                                    fontWeight: 700,
                                    color: diff < 0 ? '#EF4444' : diff <= 1 ? '#F59E0B' : '#10B981'
                                  }}>
                                    {diff > 0 ? `+${diff}` : diff}
                                  </span>
                                : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                            </td>
                            <td>
                              <span className="badge" style={{
                                background: cfg.bg,
                                color: cfg.color,
                                border: `1px solid ${cfg.color}33`,
                                gap: 4
                              }}>
                                {cfg.icon} {cfg.label}
                              </span>
                            </td>
                            <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 200 }}>
                              {h.operators?.length > 0
                                ? h.operators.slice(0, 3).join(', ') + (h.operators.length > 3 ? ` +${h.operators.length - 3}` : '')
                                : <span style={{ color: '#555' }}>Sem escala</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Legenda */}
                <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-muted)' }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: v.color, display: 'inline-block' }} />
                      {v.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* Gráfico de barras visual */}
              <div className="card" style={{ marginTop: 20 }}>
                <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>
                  Distribuição de tickets por hora
                </h3>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120 }}>
                  {analysis.hours.map(h => {
                    const max = Math.max(...analysis.hours.map(x => x.avg_tickets || 0), 1);
                    const pct = h.avg_tickets ? (h.avg_tickets / max) * 100 : 0;
                    const cfg = STATUS_CONFIG[h.status];
                    return (
                      <div key={h.hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                          {h.avg_tickets || ''}
                        </div>
                        <div style={{
                          width: '100%',
                          height: `${Math.max(pct, 4)}%`,
                          background: pct > 0 ? cfg.color : '#2A2A2A',
                          borderRadius: '4px 4px 0 0',
                          opacity: pct > 0 ? 0.85 : 0.3,
                          transition: 'height .3s',
                        }} />
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                          {fmt(h.hour)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {!analysis && !loadingAnalysis && (
            <div className="empty-state">
              <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
              <h3>Nenhuma análise ainda</h3>
              <p>Selecione um dia da semana e clique em Atualizar</p>
            </div>
          )}
        </div>
      )}

      {/* ── ABA HISTÓRICO ───────────────────────────────────────────────── */}
      {tab === 'history' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Formulário de entrada */}
          <div className="card">
            <h3 style={{ fontWeight: 700, marginBottom: 16 }}>Inserir tickets por hora</h3>
            <div className="form-group">
              <label className="form-label">Data</label>
              <input type="date" className="input" value={histDate}
                onChange={e => setHistDate(e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {HOURS.map(h => (
                <div key={h} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', width: 42, flexShrink: 0 }}>
                    {fmt(h)}
                  </span>
                  <input
                    type="number"
                    className="input"
                    placeholder="tickets"
                    min={0}
                    value={histEntries[h]}
                    onChange={e => setHistEntries(prev => ({ ...prev, [h]: e.target.value }))}
                    style={{ padding: '6px 10px' }}
                  />
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={saveHistory} disabled={saving} style={{ flex: 1 }}>
                {saving ? 'Salvando...' : '💾 Salvar dia'}
              </button>
              <button className="btn btn-ghost"
                onClick={() => setHistEntries(HOURS.reduce((a, h) => ({ ...a, [h]: '' }), {}))}>
                Limpar
              </button>
            </div>
            <p className="form-hint" style={{ marginTop: 10 }}>
              Deixe em branco os horários sem movimento. O sistema calcula as médias por dia da semana ao longo do tempo.
            </p>
          </div>

          {/* Histórico salvo */}
          <div className="card">
            <h3 style={{ fontWeight: 700, marginBottom: 16 }}>Histórico inserido</h3>
            {historyList.length === 0
              ? <div className="empty-state" style={{ padding: '40px 0' }}>
                  <p>Nenhum dado inserido ainda.</p>
                </div>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {historyList.map(d => (
                    <div key={d.date} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 8,
                      border: '1px solid var(--border)'
                    }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>
                          {d.date} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                            ({DAYS.find(x => x.key === d.day_of_week)?.label || d.day_of_week})
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {d.hours} horários • {d.total.toLocaleString('pt-BR')} tickets total
                        </div>
                      </div>
                      <button className="btn-icon danger" onClick={() => deleteHistory(d.date)}
                        title="Excluir este dia">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
            }
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type}`}>
            {toast.type === 'success' ? '✅' : '❌'} {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}
