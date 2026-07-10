import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Printer, AlertCircle, X, Save } from 'lucide-react';
import api from '../api';

const DAYS = [
  { key: 'domingo', short: 'DOM', label: 'Domingo' },
  { key: 'segunda', short: 'SEG', label: 'Segunda' },
  { key: 'terca',   short: 'TER', label: 'Terça' },
  { key: 'quarta',  short: 'QUA', label: 'Quarta' },
  { key: 'quinta',  short: 'QUI', label: 'Quinta' },
  { key: 'sexta',   short: 'SEX', label: 'Sexta' },
  { key: 'sabado',  short: 'SÁB', label: 'Sábado' },
];

const STATUS_OPT = [
  { key: 'trabalha', label: 'Trabalha', color: 'var(--primary)' },
  { key: 'dsr',      label: 'DSR',      color: '#8B5CF6' },
  { key: 'ferias',   label: 'FÉRIAS',   color: '#F59E0B' },
  { key: 'falta',    label: 'FALTA',    color: '#EF4444' },
  { key: 'folga',    label: 'FOLGA',    color: '#10B981' },
];

function getWeekStart(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function fmtDate(d) {
  return d.toISOString().split('T')[0];
}

function fmtDisplay(d) {
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getFullYear()).slice(-2)}`;
}

function CellEditor({ value, onSave, onClose }) {
  const [status, setStatus] = useState(value?.status || 'trabalha');
  const [start,  setStart]  = useState(value?.start_time || '08:00');
  const [end,    setEnd]    = useState(value?.end_time   || '16:20');

  return (
    <div style={{
      position: 'absolute', zIndex: 200, top: '100%', left: 0,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: 14, minWidth: 200,
      boxShadow: '0 8px 32px rgba(0,0,0,.6)',
    }} onClick={e => e.stopPropagation()}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
        <span style={{ fontSize:12, fontWeight:700, color:'var(--text-muted)' }}>EDITAR CÉLULA</span>
        <button className="btn-icon" onClick={onClose}><X size={12}/></button>
      </div>

      {/* Status buttons */}
      <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:10 }}>
        {STATUS_OPT.map(s => (
          <button key={s.key} onClick={() => setStatus(s.key)} style={{
            padding:'3px 8px', borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer',
            background: status === s.key ? s.color : 'var(--surface-2)',
            color: status === s.key ? 'white' : 'var(--text-muted)',
            border: `1px solid ${status === s.key ? s.color : 'var(--border)'}`,
          }}>{s.label}</button>
        ))}
      </div>

      {status === 'trabalha' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:10 }}>
          <div>
            <label style={{ fontSize:10, color:'var(--text-muted)', display:'block', marginBottom:3 }}>ENTRADA</label>
            <input type="time" className="input" value={start} onChange={e => setStart(e.target.value)}
              style={{ padding:'5px 8px', fontSize:13 }}/>
          </div>
          <div>
            <label style={{ fontSize:10, color:'var(--text-muted)', display:'block', marginBottom:3 }}>SAÍDA</label>
            <input type="time" className="input" value={end} onChange={e => setEnd(e.target.value)}
              style={{ padding:'5px 8px', fontSize:13 }}/>
          </div>
        </div>
      )}

      <div style={{ display:'flex', gap:6 }}>
        <button className="btn btn-ghost btn-sm" style={{ flex:1 }} onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary btn-sm" style={{ flex:1 }}
          onClick={() => onSave({ status, start_time: status==='trabalha' ? start : null, end_time: status==='trabalha' ? end : null })}>
          <Save size={12}/> OK
        </button>
      </div>
    </div>
  );
}

function Cell({ entry, onClick, isToday }) {
  if (!entry) {
    return (
      <td onClick={onClick} style={{
        padding:'6px 4px', textAlign:'center', cursor:'pointer', fontSize:11,
        color:'#333', borderRight:'1px solid var(--border)',
        minWidth: 80,
      }}>
        <span style={{ opacity:.3 }}>—</span>
      </td>
    );
  }
  const st = STATUS_OPT.find(s => s.key === entry.status) || STATUS_OPT[0];
  const isWork = entry.status === 'trabalha';

  return (
    <td onClick={onClick} style={{
      padding:'4px', textAlign:'center', cursor:'pointer',
      borderRight:'1px solid var(--border)', minWidth:80,
      background: isToday ? 'rgba(232,98,42,.04)' : undefined,
    }}>
      {isWork ? (
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--text)' }}>
            {entry.start_time?.slice(0,5)}
          </div>
          <div style={{ fontSize:10, color:'var(--text-muted)' }}>
            {entry.end_time?.slice(0,5)}
          </div>
        </div>
      ) : (
        <span style={{
          fontSize:10, fontWeight:800, color: st.color,
          background: st.color + '20', padding:'2px 6px', borderRadius:4,
        }}>{st.label}</span>
      )}
    </td>
  );
}

export default function NativeSchedule({ userId, profile }) {
  const [weekStart, setWeekStart] = useState(() => fmtDate(getWeekStart(new Date())));
  const [members, setMembers]     = useState([]);
  const [entries, setEntries]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [openCell, setOpenCell]   = useState(null); // { memberId, dayIndex, date }
  const [saving, setSaving]       = useState(false);
  const [toast, setToast]         = useState(null);

  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(new Date(weekStart), i));
  const today = fmtDate(new Date());

  const showToast = (msg, type='success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [membRes, entRes] = await Promise.all([
        api.get(`/team?user_id=${userId}&active=true`),
        api.get(`/schedule?user_id=${userId}&week_start=${weekStart}`),
      ]);
      setMembers(membRes.data);
      setEntries(entRes.data);
    } catch { showToast('Erro ao carregar escala', 'error'); }
    finally { setLoading(false); }
  }, [userId, weekStart]);

  useEffect(() => { load(); }, [load]);

  const getEntry = (memberId, dateStr) =>
    entries.find(e => e.team_member_id === memberId && e.work_date === dateStr);

  const saveCell = async ({ status, start_time, end_time }) => {
    if (!openCell) return;
    setSaving(true);
    try {
      const res = await api.post('/schedule/save', {
        user_id: userId,
        team_member_id: openCell.memberId,
        work_date: openCell.date,
        status, start_time, end_time,
      });
      setEntries(prev => {
        const idx = prev.findIndex(e => e.team_member_id === openCell.memberId && e.work_date === openCell.date);
        if (idx >= 0) { const n=[...prev]; n[idx]=res.data; return n; }
        return [...prev, res.data];
      });
      setOpenCell(null);
    } catch { showToast('Erro ao salvar', 'error'); }
    setSaving(false);
  };

  const prevWeek = () => setWeekStart(fmtDate(addDays(new Date(weekStart), -7)));
  const nextWeek = () => setWeekStart(fmtDate(addDays(new Date(weekStart), 7)));

  const weekEnd = addDays(new Date(weekStart), 6);

  // Contar dias sem preenchimento para alerta
  const totalCells = members.length * 7;
  const filled = entries.filter(e => e.status).length;
  const pct = totalCells > 0 ? Math.round((filled/totalCells)*100) : 0;

  const handlePrint = () => window.print();

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Escala de Trabalho Semanal</h1>
          <p className="page-subtitle">
            {profile?.company || '—'} · <strong style={{ color:'var(--primary)' }}>{profile?.sector || '—'}</strong> · {profile?.full_name || '—'}
          </p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-ghost" onClick={handlePrint}><Printer size={15}/> Imprimir</button>
        </div>
      </div>

      {/* Alerta de preenchimento */}
      {members.length > 0 && pct < 100 && (
        <div style={{
          background:'rgba(245,158,11,.1)', border:'1px solid rgba(245,158,11,.3)',
          borderRadius:10, padding:'10px 16px', marginBottom:16,
          display:'flex', alignItems:'center', gap:10, fontSize:13,
        }}>
          <AlertCircle size={16} color="#F59E0B"/>
          <span style={{ color:'#F59E0B', fontWeight:600 }}>
            Escala {pct}% preenchida esta semana ({filled}/{totalCells} células)
          </span>
          <span style={{ color:'var(--text-muted)' }}>— Clique em cada célula para preencher.</span>
        </div>
      )}

      {/* Navegação de semana */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
        <button className="btn btn-ghost btn-sm" onClick={prevWeek}><ChevronLeft size={16}/></button>
        <span style={{ fontWeight:700, fontSize:14 }}>
          {fmtDisplay(new Date(weekStart + 'T12:00:00'))} à {fmtDisplay(weekEnd)}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={nextWeek}><ChevronRight size={16}/></button>
      </div>

      {/* Sem colaboradores */}
      {!loading && members.length === 0 && (
        <div className="card empty-state">
          <h3>Nenhum colaborador no time</h3>
          <p style={{ marginTop:6, color:'var(--text-muted)' }}>
            Cadastre colaboradores em <strong>Meu Time</strong> para montar a escala.
          </p>
        </div>
      )}

      {/* Grade de escala */}
      {members.length > 0 && (
        <div className="card" style={{ padding:0, overflow:'auto' }} id="schedule-print">
          {/* Cabeçalho estilo PDF */}
          <div style={{
            padding:'12px 20px', borderBottom:'1px solid var(--border)',
            background:'#1A1A1A', display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8,
          }}>
            <div style={{ fontSize:12 }}>
              <span style={{ color:'var(--text-muted)' }}>Unidade: </span>
              <strong>{profile?.company || '—'}</strong>
            </div>
            <div style={{ fontSize:12, textAlign:'center' }}>
              <span style={{ color:'var(--text-muted)' }}>Departamento: </span>
              <strong style={{ color:'var(--primary)' }}>{profile?.sector || '—'}</strong>
            </div>
            <div style={{ fontSize:12, textAlign:'right' }}>
              <span style={{ color:'var(--text-muted)' }}>Gestor: </span>
              <strong>{profile?.full_name || '—'}</strong>
            </div>
          </div>

          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#1E1E1E', borderBottom:'2px solid var(--border)' }}>
                <th style={{ padding:'8px 12px', textAlign:'left', fontSize:11, fontWeight:700, color:'var(--text-muted)', width:80, borderRight:'1px solid var(--border)' }}>MATRÍCULA</th>
                <th style={{ padding:'8px 12px', textAlign:'left', fontSize:11, fontWeight:700, color:'var(--text-muted)', minWidth:180, borderRight:'1px solid var(--border)' }}>NOME DO ASSOCIADO</th>
                {weekDates.map((d, i) => {
                  const dateStr = fmtDate(d);
                  const isToday = dateStr === today;
                  return (
                    <th key={i} style={{
                      padding:'6px 4px', textAlign:'center', fontSize:11, fontWeight:700,
                      color: isToday ? 'white' : 'var(--text-muted)',
                      background: isToday ? 'var(--primary)' : undefined,
                      borderRight:'1px solid var(--border)', minWidth:80,
                    }}>
                      <div>{DAYS[i].short}</div>
                      <div style={{ fontSize:10, fontWeight:400, opacity:.8 }}>{fmtDisplay(d)}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>Carregando...</td></tr>
              ) : members.map(m => (
                <tr key={m.id} style={{ borderBottom:'1px solid var(--border)' }}>
                  <td style={{ padding:'6px 12px', fontSize:12, color:'var(--text-muted)', borderRight:'1px solid var(--border)' }}>
                    {m.matricula || '—'}
                  </td>
                  <td style={{ padding:'6px 12px', fontWeight:600, fontSize:13, borderRight:'1px solid var(--border)' }}>
                    {m.name}
                  </td>
                  {weekDates.map((d, i) => {
                    const dateStr = fmtDate(d);
                    const entry = getEntry(m.id, dateStr);
                    const isOpen = openCell?.memberId === m.id && openCell?.date === dateStr;
                    const isToday = dateStr === today;
                    return (
                      <td key={i} style={{ position:'relative', padding:0, borderRight:'1px solid var(--border)', background: isToday ? 'rgba(232,98,42,.04)' : undefined }}>
                        <div onClick={() => setOpenCell(isOpen ? null : { memberId: m.id, date: dateStr, dayIndex: i })}
                          style={{ padding:'6px 4px', textAlign:'center', cursor:'pointer', minHeight:40, display:'flex', alignItems:'center', justifyContent:'center' }}>
                          {entry ? (
                            entry.status === 'trabalha' ? (
                              <div>
                                <div style={{ fontSize:11, fontWeight:700 }}>{entry.start_time?.slice(0,5)}</div>
                                <div style={{ fontSize:10, color:'var(--text-muted)' }}>{entry.end_time?.slice(0,5)}</div>
                              </div>
                            ) : (
                              <span style={{
                                fontSize:10, fontWeight:800,
                                color: STATUS_OPT.find(s=>s.key===entry.status)?.color,
                                background: (STATUS_OPT.find(s=>s.key===entry.status)?.color||'#888') + '20',
                                padding:'2px 6px', borderRadius:4,
                              }}>
                                {STATUS_OPT.find(s=>s.key===entry.status)?.label || entry.status}
                              </span>
                            )
                          ) : (
                            <span style={{ opacity:.2, fontSize:11 }}>—</span>
                          )}
                        </div>
                        {isOpen && (
                          <CellEditor
                            value={entry}
                            onSave={saveCell}
                            onClose={() => setOpenCell(null)}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Legenda */}
          <div style={{ padding:'10px 16px', borderTop:'1px solid var(--border)', display:'flex', gap:16, flexWrap:'wrap' }}>
            {STATUS_OPT.map(s => (
              <div key={s.key} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'var(--text-muted)' }}>
                <span style={{ width:8, height:8, borderRadius:'50%', background:s.color, display:'inline-block' }}/>
                {s.label}
              </div>
            ))}
          </div>
        </div>
      )}

      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type}`}>
            {toast.type==='success'?'✅':'❌'} {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}
