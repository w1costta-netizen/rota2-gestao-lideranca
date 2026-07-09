import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, Upload, FileSpreadsheet, FileText,
  Trash2, Calendar, Clock, BarChart2, Users, Loader,
} from 'lucide-react';
import { leadersAPI } from '../api';
import { getWeekStart, addDays, formatDate } from '../utils';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';

const DAYS = ['segunda','terca','quarta','quinta','sexta','sabado','domingo'];
const DAY_LABELS = { segunda:'Segunda', terca:'Terça', quarta:'Quarta', quinta:'Quinta', sexta:'Sexta', sabado:'Sábado', domingo:'Domingo' };
const WEEKEND = ['sabado','domingo'];
const SECTOR_COLORS = ['#1d4ed8','#059669','#d97706','#7c3aed','#db2777','#0891b2','#65a30d','#9f1239'];

function getTodayDay() {
  return ['domingo','segunda','terca','quarta','quinta','sexta','sabado'][new Date().getDay()];
}
function formatDateBR(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

// ─────────────────────────────────────────────
// TAB 1 — Escala visual de líderes (original)
// ─────────────────────────────────────────────
function ScaleVisual() {
  const [week, setWeek] = useState(getWeekStart());
  const [leaders, setLeaders] = useState([]);
  const today = getTodayDay();

  useEffect(() => { leadersAPI.list().then(r => setLeaders(r.data)); }, []);

  const sectors = [...new Set(leaders.map(l => l.sector))];
  const sectorColor = (sec) => SECTOR_COLORS[sectors.indexOf(sec) % SECTOR_COLORS.length];
  const dayLeaders = (day) => leaders.filter(l => l.work_days.includes(day));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, gap: 10, alignItems: 'center' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setWeek(addDays(week, -7))}><ChevronLeft size={15} /></button>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{formatDate(week)}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setWeek(addDays(week, 7))}><ChevronRight size={15} /></button>
      </div>

      {sectors.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {sectors.map(s => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'white', padding: '4px 12px', borderRadius: 99, boxShadow: 'var(--shadow)', fontSize: 12, fontWeight: 600 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: sectorColor(s) }} />
              {s}
            </div>
          ))}
        </div>
      )}

      <div className="scale-grid">
        {DAYS.map(day => {
          const dl = dayLeaders(day);
          const isToday = day === today;
          const isWeekend = WEEKEND.includes(day);
          return (
            <div className="scale-day" key={day}>
              <div className={`scale-day-header${isToday ? ' today' : isWeekend ? ' weekend' : ''}`}>
                {DAY_LABELS[day]}
                {isToday && <span style={{ marginLeft: 6, fontSize: 10, background: 'rgba(255,255,255,.25)', padding: '1px 6px', borderRadius: 99 }}>Hoje</span>}
              </div>
              <div className="scale-day-body">
                {dl.length === 0 ? (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', paddingTop: 12 }}>Ninguém</div>
                ) : (
                  dl.map(l => (
                    <div key={l.id} className="scale-leader-chip">
                      <div className="dot" style={{ background: sectorColor(l.sector) }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{l.start_time}–{l.end_time}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div style={{ padding: '4px 10px 10px', fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 600 }}>
                {dl.length} líder{dl.length !== 1 ? 'es' : ''}
              </div>
            </div>
          );
        })}
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Resumo por líder</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Líder</th><th>Setor</th>
                <th>Seg</th><th>Ter</th><th>Qua</th><th>Qui</th><th>Sex</th><th>Sáb</th><th>Dom</th>
                <th>Total dias</th>
              </tr>
            </thead>
            <tbody>
              {leaders.map(l => (
                <tr key={l.id}>
                  <td style={{ fontWeight: 600 }}>{l.name}</td>
                  <td><span className="badge badge-blue">{l.sector}</span></td>
                  {['segunda','terca','quarta','quinta','sexta','sabado','domingo'].map(d => (
                    <td key={d} style={{ textAlign: 'center' }}>
                      {l.work_days.includes(d) ? <span style={{ color: 'var(--accent)', fontWeight: 700 }}>✓</span> : <span style={{ color: '#e2e8f0' }}>—</span>}
                    </td>
                  ))}
                  <td style={{ textAlign: 'center', fontWeight: 700 }}>{l.work_days.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// TAB 2 — Importação de escalas (Excel / PDF)
// ─────────────────────────────────────────────
function FileTypeIcon({ type }) {
  if (type === 'excel') return <FileSpreadsheet size={18} color="#1d6f42" />;
  return <FileText size={18} color="#c0392b" />;
}

function StatusBadge({ status }) {
  const colors = { processed: '#10b981', error: '#ef4444', pending: '#f59e0b' };
  const labels = { processed: 'Processado', error: 'Erro', pending: 'Pendente' };
  const s = status || 'processed';
  return (
    <span style={{ background: (colors[s] || '#888') + '22', color: colors[s] || '#888', borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
      {labels[s] || s}
    </span>
  );
}

function Bar({ label, value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
        <span>{label}</span>
        <span style={{ color: 'var(--text-muted)' }}>{value}</span>
      </div>
      <div style={{ background: 'var(--border)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
        <div style={{ width: pct + '%', background: color, height: '100%', borderRadius: 4, transition: 'width .4s' }} />
      </div>
    </div>
  );
}

function SummaryView({ s }) {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 18 }}>
        {[
          { icon: <Calendar size={22} />, label: 'Total de registros', value: s.total, color: 'var(--primary)' },
          { icon: <Users size={22} />, label: 'Colaboradores únicos', value: s.unique_employees, color: '#8b5cf6' },
        ].map(({ icon, label, value, color }) => (
          <div key={label} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ color, opacity: .8 }}>{icon}</div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {Object.keys(s.by_sector || {}).length > 0 && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Por setor</div>
            {Object.entries(s.by_sector).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <Bar key={k} label={k} value={v} max={s.total} color="#3b82f6" />
            ))}
          </div>
        )}
        {Object.keys(s.by_day || {}).length > 0 && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Por dia da semana</div>
            {Object.entries(s.by_day).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <Bar key={k} label={DAY_LABELS[k] || k} value={v} max={s.total} color="#10b981" />
            ))}
          </div>
        )}
        {Object.keys(s.by_employee || {}).length > 0 && (
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Colaboradores (top 10)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {Object.entries(s.by_employee).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => (
                <span key={k} className="badge badge-blue" style={{ fontSize: 12 }}>
                  {k} <strong style={{ marginLeft: 4 }}>({v})</strong>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ScaleImport() {
  const { profile } = useAuth();
  const toast = useToast();
  const userId = profile?.id;

  const [imports, setImports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [period, setPeriod] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [entries, setEntries] = useState({});
  const [summary, setSummary] = useState({});
  const [activeTab, setActiveTab] = useState({});
  const fileRef = useRef();

  const loadImports = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/scale/imports?user_id=${userId}`);
      const data = await r.json();
      setImports(Array.isArray(data) ? data : []);
    } catch { toast('Erro ao carregar histórico', 'error'); }
    setLoading(false);
  }, [userId]);

  useEffect(() => { loadImports(); }, [loadImports]);

  const doUpload = async (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx','xls','pdf'].includes(ext)) {
      toast('Use Excel (.xlsx, .xls) ou PDF.', 'error'); return;
    }
    if (file.size > 20 * 1024 * 1024) { toast('Arquivo muito grande (máx. 20MB)', 'error'); return; }

    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('user_id', userId);
    if (period) fd.append('period', period);

    try {
      const r = await fetch('/api/scale/upload', { method: 'POST', body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      toast(`${data.total} registros importados com sucesso!`);
      setPeriod('');
      loadImports();
    } catch (e) { toast(e.message || 'Erro ao importar', 'error'); }
    setUploading(false);
  };

  const handleDrop = (e) => { e.preventDefault(); setDragging(false); doUpload(e.dataTransfer.files[0]); };

  const toggleExpand = async (imp) => {
    const id = imp.id;
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!entries[id]) {
      const [re, rs] = await Promise.all([
        fetch(`/api/scale/imports/${id}/entries`).then(r => r.json()),
        fetch(`/api/scale/imports/${id}/summary`).then(r => r.json()),
      ]);
      setEntries(p => ({ ...p, [id]: re }));
      setSummary(p => ({ ...p, [id]: rs }));
    }
    setActiveTab(p => ({ ...p, [id]: p[id] || 'entries' }));
  };

  const deleteImport = async (id, filename) => {
    if (!confirm(`Excluir "${filename}" e todos os dados importados?`)) return;
    await fetch(`/api/scale/imports/${id}`, { method: 'DELETE' });
    toast('Importação excluída');
    if (expanded === id) setExpanded(null);
    loadImports();
  };

  return (
    <div>
      {/* Upload zone */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ marginBottom: 12 }}>
          <label className="form-label">Período da escala (opcional)</label>
          <input
            className="input" style={{ maxWidth: 280 }}
            placeholder="Ex: Julho 2025, Semana 28..."
            value={period} onChange={e => setPeriod(e.target.value)}
          />
        </div>

        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => !uploading && fileRef.current.click()}
          style={{
            border: `2px dashed ${dragging ? 'var(--primary)' : 'var(--border)'}`,
            borderRadius: 12, padding: '40px 24px', textAlign: 'center',
            cursor: uploading ? 'default' : 'pointer',
            background: dragging ? 'var(--primary)11' : 'var(--bg)',
            transition: 'all .2s',
          }}
        >
          <input ref={fileRef} type="file" style={{ display: 'none' }} accept=".xlsx,.xls,.pdf" onChange={e => { doUpload(e.target.files[0]); e.target.value = ''; }} />
          {uploading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <Loader size={36} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
              <div style={{ fontWeight: 600 }}>Processando arquivo...</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Lendo e salvando os dados da escala</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', gap: 16 }}>
                <FileSpreadsheet size={40} color="#1d6f42" />
                <FileText size={40} color="#c0392b" />
              </div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>
                {dragging ? 'Solte o arquivo aqui' : 'Clique ou arraste o arquivo'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Suporta Excel (.xlsx, .xls) e PDF · Máximo 20MB
              </div>
              <button className="btn btn-primary btn-sm" style={{ pointerEvents: 'none' }}>
                <Upload size={15} /> Selecionar arquivo
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Import history */}
      <div style={{ marginBottom: 8, fontWeight: 700, fontSize: 13, color: 'var(--text-muted)', letterSpacing: '.5px', textTransform: 'uppercase' }}>
        Histórico de importações
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <Loader size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
        </div>
      ) : imports.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
          <Upload size={40} style={{ marginBottom: 12, opacity: .3 }} />
          <div style={{ fontWeight: 600 }}>Nenhuma escala importada ainda</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Importe seu primeiro arquivo acima</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {imports.map(imp => (
            <div key={imp.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => toggleExpand(imp)}
              >
                <FileTypeIcon type={imp.file_type} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{imp.filename}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 12, marginTop: 2 }}>
                    {imp.period && <span>📅 {imp.period}</span>}
                    <span><Users size={11} style={{ verticalAlign: 'middle' }} /> {imp.total_entries} registros</span>
                    <span><Calendar size={11} style={{ verticalAlign: 'middle' }} /> {new Date(imp.created_at).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>
                <StatusBadge status={imp.status} />
                <button className="btn-icon danger" onClick={e => { e.stopPropagation(); deleteImport(imp.id, imp.filename); }} title="Excluir">
                  <Trash2 size={14} />
                </button>
                {expanded === imp.id ? <ChevronLeft size={16} style={{ transform: 'rotate(-90deg)' }} /> : <ChevronRight size={16} />}
              </div>

              {expanded === imp.id && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '16px 18px' }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    {['entries','summary'].map(tab => (
                      <button key={tab} onClick={() => setActiveTab(p => ({ ...p, [imp.id]: tab }))}
                        className={`btn btn-sm ${activeTab[imp.id] === tab ? 'btn-primary' : 'btn-ghost'}`}>
                        {tab === 'entries' ? <><Calendar size={13} /> Registros</> : <><BarChart2 size={13} /> Resumo</>}
                      </button>
                    ))}
                  </div>

                  {activeTab[imp.id] === 'entries' && (
                    !entries[imp.id] ? (
                      <div style={{ textAlign: 'center', padding: 24 }}><Loader size={20} style={{ animation: 'spin 1s linear infinite' }} /></div>
                    ) : entries[imp.id].length === 0 ? (
                      <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>Nenhum registro encontrado.</div>
                    ) : (
                      <div className="table-wrap" style={{ maxHeight: 360, overflowY: 'auto' }}>
                        <table>
                          <thead>
                            <tr>
                              <th>Colaborador</th><th>Setor</th><th>Função</th>
                              <th>Data</th><th>Dia</th><th>Entrada</th><th>Saída</th><th>Turno</th><th>Obs</th>
                            </tr>
                          </thead>
                          <tbody>
                            {entries[imp.id].map(e => (
                              <tr key={e.id}>
                                <td style={{ fontWeight: 600 }}>{e.employee_name || '—'}</td>
                                <td>{e.sector ? <span className="badge badge-blue">{e.sector}</span> : '—'}</td>
                                <td>{e.role || '—'}</td>
                                <td style={{ whiteSpace: 'nowrap' }}>{formatDateBR(e.work_date)}</td>
                                <td>{DAY_LABELS[e.day_of_week] || e.day_of_week || '—'}</td>
                                <td><Clock size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />{e.start_time || '—'}</td>
                                <td>{e.end_time || '—'}</td>
                                <td>{e.shift ? <span className="badge badge-green">{e.shift}</span> : '—'}</td>
                                <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.notes || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  )}

                  {activeTab[imp.id] === 'summary' && (
                    !summary[imp.id] ? (
                      <div style={{ textAlign: 'center', padding: 24 }}><Loader size={20} style={{ animation: 'spin 1s linear infinite' }} /></div>
                    ) : <SummaryView s={summary[imp.id]} />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Main page — tabs
// ─────────────────────────────────────────────
export default function Scale() {
  const [mainTab, setMainTab] = useState('visual');

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Escalas</div>
          <div className="page-subtitle">Visualize e importe escalas de trabalho</div>
        </div>
      </div>

      {/* Main tab bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
        {[
          { key: 'visual', label: '📅 Escala Semanal' },
          { key: 'import', label: '📂 Importar Escalas' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setMainTab(t.key)}
            className={`btn btn-sm ${mainTab === t.key ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontWeight: mainTab === t.key ? 700 : 500 }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mainTab === 'visual' && <ScaleVisual />}
      {mainTab === 'import' && <ScaleImport />}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
