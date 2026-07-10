import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Download, Users, X, Save, Trash2, Plus, CheckCircle, AlertCircle } from 'lucide-react';
import api from '../api';

const DAY_NAME  = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const DAY_FULL  = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const ROLES     = ['Operador(a) de Caixa','Atendente','Repositor(a)','Supervisor(a)','Coordenador(a)','Auxiliar','Outro'];

const STATUS = {
  trabalha: { label:'Trabalha', bg:'#e0f2fe', color:'#0369a1' },
  dsr:      { label:'DSR',      bg:'#dbeafe', color:'#1d4ed8' },
  ferias:   { label:'FÉRIAS',   bg:'#fef9c3', color:'#92400e' },
  feriado:  { label:'FERIADO',  bg:'#dcfce7', color:'#166534' },
  falta:    { label:'FALTA',    bg:'#fee2e2', color:'#991b1b' },
  folga:    { label:'FOLGA',    bg:'#f3e8ff', color:'#6b21a8' },
};

function todayISO() { return new Date().toISOString().split('T')[0]; }
function fmtDate(y, m, d) { return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
function getDOW(dateStr) { return new Date(dateStr + 'T12:00:00Z').getUTCDay(); }

/* divide os dias do mês em semanas (linhas de 7 dias, Dom→Sáb) */
function buildWeeks(year, month) {
  const total = daysInMonth(year, month);
  const all   = Array.from({ length: total }, (_, i) => fmtDate(year, month, i + 1));
  const weeks = [];
  let week    = Array(7).fill(null);
  for (const date of all) {
    const dow = getDOW(date);
    week[dow] = date;
    if (dow === 6) { weeks.push(week); week = Array(7).fill(null); }
  }
  if (week.some(Boolean)) weeks.push(week);
  return weeks;
}

/* ── Editor de célula ── */
function CellEditor({ entry, memberName, dateStr, dayName, allDatesOfMonth, onSave, onClose }) {
  const [status,    setStatus]    = useState(entry?.status || 'trabalha');
  const [entrada,   setEntrada]   = useState(entry?.entrada || '');
  const [intervalo, setIntervalo] = useState(entry?.intervalo || '');
  const [retorno,   setRetorno]   = useState(entry?.retorno_intervalo || '');
  const [saida,     setSaida]     = useState(entry?.saida || '');
  const [copyDays,  setCopyDays]  = useState([]);
  const [showCopy,  setShowCopy]  = useState(false);

  const otherDates = allDatesOfMonth.filter(d => d !== dateStr);
  const toggleDay  = d => setCopyDays(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d]);
  const selectAll  = () => setCopyDays(p => p.length === otherDates.length ? [] : [...otherDates]);
  const [,mm,dd]   = dateStr.split('-');

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:9998, background:'rgba(0,0,0,.45)' }}/>
      <div style={{
        position:'fixed', zIndex:9999, top:'50%', left:'50%', transform:'translate(-50%,-50%)',
        background:'#fff', borderRadius:14, padding:22, width:340,
        boxShadow:'0 24px 64px rgba(0,0,0,.3)', color:'#111', maxHeight:'90vh', overflowY:'auto',
      }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <div>
            <div style={{ fontWeight:800, fontSize:14 }}>{memberName}</div>
            <div style={{ fontSize:11, color:'#64748b' }}>{dayName} · {dd}/{mm}</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8', fontSize:22, lineHeight:1 }}>×</button>
        </div>

        {/* Status */}
        <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:14 }}>
          {Object.entries(STATUS).map(([k, v]) => (
            <button key={k} onClick={() => setStatus(k)} style={{
              padding:'5px 12px', borderRadius:7, fontSize:11, fontWeight:700, cursor:'pointer',
              background: status === k ? v.color : '#f1f5f9',
              color:      status === k ? '#fff'   : '#475569',
              border:`1.5px solid ${status === k ? v.color : '#e2e8f0'}`,
            }}>{v.label}</button>
          ))}
        </div>

        {/* Horários */}
        {status === 'trabalha' && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
            {[
              { label:'Entrada',            val:entrada,   set:setEntrada },
              { label:'Saída p/ intervalo', val:intervalo, set:setIntervalo },
              { label:'Retorno intervalo',  val:retorno,   set:setRetorno },
              { label:'Saída',              val:saida,     set:setSaida },
            ].map(f => (
              <div key={f.label}>
                <div style={{ fontSize:10, color:'#64748b', marginBottom:4, fontWeight:700, textTransform:'uppercase' }}>{f.label}</div>
                <input type="time" value={f.val} onChange={e => f.set(e.target.value)}
                  style={{ width:'100%', padding:'8px 10px', border:'1.5px solid #e2e8f0', borderRadius:8, fontSize:14, color:'#111', outline:'none', boxSizing:'border-box' }}/>
              </div>
            ))}
          </div>
        )}

        {/* Copiar para outros dias */}
        <div style={{ marginBottom:14 }}>
          <button onClick={() => setShowCopy(s => !s)} style={{
            width:'100%', padding:'8px 12px', borderRadius:8, cursor:'pointer', fontSize:12, fontWeight:700,
            background: showCopy ? '#eff6ff' : '#f8fafc',
            border:`1.5px solid ${showCopy ? '#93c5fd' : '#e2e8f0'}`,
            color: showCopy ? '#1d4ed8' : '#475569',
            display:'flex', alignItems:'center', justifyContent:'center', gap:6,
          }}>
            📋 {showCopy ? 'Ocultar' : 'Copiar horário para outros dias'}
          </button>
          {showCopy && (
            <div style={{ marginTop:8, background:'#f0f9ff', borderRadius:8, padding:12, border:'1px solid #bae6fd' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <span style={{ fontSize:11, fontWeight:700, color:'#0369a1' }}>Selecione os dias:</span>
                <button onClick={selectAll} style={{
                  fontSize:10, padding:'3px 8px', borderRadius:5, border:'1px solid #93c5fd',
                  background:'#dbeafe', color:'#1d4ed8', cursor:'pointer', fontWeight:700,
                }}>{copyDays.length === otherDates.length ? 'Desmarcar' : 'Todos'}</button>
              </div>
              <div style={{ display:'flex', gap:4, flexWrap:'wrap', maxHeight:120, overflowY:'auto' }}>
                {otherDates.map(d => {
                  const [, m2, d2] = d.split('-');
                  const dow = getDOW(d);
                  const sel = copyDays.includes(d);
                  return (
                    <button key={d} onClick={() => toggleDay(d)} style={{
                      padding:'4px 7px', borderRadius:5, fontSize:11, fontWeight:700, cursor:'pointer',
                      background: sel ? '#1d4ed8' : '#fff',
                      color:      sel ? '#fff'    : '#374151',
                      border:`1.5px solid ${sel ? '#1d4ed8' : '#d1d5db'}`,
                    }}>{d2}/{m2} <span style={{ fontWeight:400, fontSize:9 }}>{DAY_NAME[dow]}</span></button>
                  );
                })}
              </div>
              {copyDays.length > 0 && (
                <div style={{ marginTop:8, fontSize:11, color:'#0369a1', fontWeight:600 }}>
                  ✓ Será copiado para {copyDays.length} dia{copyDays.length > 1 ? 's' : ''}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onClose} style={{
            flex:1, padding:'10px', borderRadius:8, border:'1.5px solid #e2e8f0',
            background:'#f8fafc', cursor:'pointer', fontSize:13, color:'#475569', fontWeight:600,
          }}>Cancelar</button>
          <button onClick={() => onSave({ status, entrada, intervalo, retorno_intervalo:retorno, saida, copyToDays:copyDays })} style={{
            flex:2, padding:'10px', borderRadius:8, border:'none',
            background:'#1d4ed8', color:'#fff', cursor:'pointer', fontSize:13, fontWeight:700,
          }}>✓ Salvar{copyDays.length > 0 ? ` + copiar (${copyDays.length})` : ''}</button>
        </div>
      </div>
    </>
  );
}

/* ── Modal Time ── */
function TeamModal({ userId, userSector, onClose }) {
  const [members, setMembers] = useState([]);
  const [form, setForm]       = useState({ matricula:'', name:'', role:'', sector:'' });
  const [adding, setAdding]   = useState(false);
  const [saving, setSaving]   = useState(false);

  const load = useCallback(async () => {
    const res = await api.get(`/team?user_id=${userId}`);
    setMembers(res.data);
  }, [userId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setForm(f => ({ ...f, sector: userSector || '' })); }, [userSector]);

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await api.post('/team', { user_id:userId, ...form });
      setForm({ matricula:'', name:'', role:'', sector:userSector||'' });
      setAdding(false); load();
    } catch {}
    setSaving(false);
  };

  const remove = async (id, name) => {
    if (!confirm(`Excluir ${name}?`)) return;
    await api.delete(`/team/${id}`); load();
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:500, background:'rgba(0,0,0,.75)', display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={onClose}>
      <div style={{ background:'#1a1a1a', borderRadius:12, padding:24, width:560, maxHeight:'80vh', overflowY:'auto', border:'1px solid #333' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <h3 style={{ fontWeight:700, fontSize:16 }}>Colaboradores do Time</h3>
          <button className="btn-icon" onClick={onClose}><X size={16}/></button>
        </div>
        {adding ? (
          <div style={{ background:'#111', borderRadius:8, padding:14, marginBottom:14, border:'1px solid #2a2a2a' }}>
            <div style={{ display:'grid', gridTemplateColumns:'100px 1fr', gap:8, marginBottom:8 }}>
              <input className="input" placeholder="Matrícula" value={form.matricula}
                onChange={e => setForm(f => ({...f, matricula:e.target.value}))} style={{ fontSize:12 }}/>
              <input className="input" placeholder="NOME COMPLETO" value={form.name}
                onChange={e => setForm(f => ({...f, name:e.target.value.toUpperCase()}))} style={{ fontSize:12 }}/>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
              <select className="select" value={form.role} onChange={e => setForm(f => ({...f, role:e.target.value}))} style={{ fontSize:12 }}>
                <option value="">Função...</option>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <input className="input" placeholder="Setor" value={form.sector}
                onChange={e => setForm(f => ({...f, sector:e.target.value}))} style={{ fontSize:12 }}/>
            </div>
            <div style={{ display:'flex', gap:6 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
                <Save size={12}/> {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        ) : (
          <button className="btn btn-primary btn-sm" style={{ marginBottom:14 }} onClick={() => setAdding(true)}>
            <Plus size={13}/> Adicionar colaborador
          </button>
        )}
        {members.length === 0
          ? <p style={{ color:'var(--text-muted)', fontSize:13, textAlign:'center', padding:'20px 0' }}>Nenhum colaborador cadastrado.</p>
          : <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ background:'#111', borderBottom:'1px solid #2a2a2a' }}>
                  {['Matrícula','Nome','Função',''].map(h => (
                    <th key={h} style={{ padding:'7px 10px', textAlign:'left', color:'var(--text-muted)', fontWeight:600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.id} style={{ borderBottom:'1px solid #222' }}>
                    <td style={{ padding:'7px 10px', color:'var(--text-muted)' }}>{m.matricula||'—'}</td>
                    <td style={{ padding:'7px 10px', fontWeight:600 }}>{m.name}</td>
                    <td style={{ padding:'7px 10px', color:'var(--text-muted)' }}>{m.role||'—'}</td>
                    <td style={{ padding:'7px 10px', textAlign:'right' }}>
                      <button className="btn-icon danger" onClick={() => remove(m.id, m.name)}><Trash2 size={13}/></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        }
      </div>
    </div>
  );
}

/* ── Página principal ── */
const ELEVATED_ROLES = ['supervisor', 'supervisor(a)', 'gerente geral', 'gerente_geral', 'gerente', 'diretor', 'diretor(a)'];

export default function NativeSchedule({ userId, profile }) {
  const now = new Date();
  const [year,       setYear]       = useState(now.getFullYear());
  const [month,      setMonth]      = useState(now.getMonth() + 1);
  const [members,    setMembers]    = useState([]);
  const [entries,    setEntries]    = useState([]);
  const [openCell,   setOpenCell]   = useState(null);
  const [showTeam,   setShowTeam]   = useState(false);
  const [submission, setSubmission] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const today = todayISO();
  const todayDay   = parseInt(today.split('-')[2]);
  const todayMonth = parseInt(today.split('-')[1]);
  const todayYear  = parseInt(today.split('-')[0]);

  const isElevated = ELEVATED_ROLES.includes((profile?.role || '').toLowerCase());
  const [allProfiles,    setAllProfiles]    = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);

  // Para perfis elevados: carrega lista de todos os líderes com setor
  useEffect(() => {
    if (!isElevated) return;
    api.get('/profile/all').then(r => setAllProfiles(r.data)).catch(() => {});
  }, [isElevated]);

  // O userId efetivo: supervisor pode trocar, líder usa o próprio
  const effectiveUserId = isElevated && selectedUserId ? selectedUserId : userId;

  // Perfil do usuário sendo visualizado (para mostrar setor/nome correto no cabeçalho)
  const viewedProfile = isElevated && selectedUserId
    ? allProfiles.find(p => p.id === selectedUserId) || profile
    : profile;

  const weeks   = buildWeeks(year, month);
  const allDates = Array.from({ length: daysInMonth(year, month) }, (_, i) => fmtDate(year, month, i + 1));

  const isCurrentMonth = year === todayYear && month === todayMonth;
  const alertDay    = isCurrentMonth && todayDay >= 24 && todayDay <= 26 && !submission;
  const alertUrgent = isCurrentMonth && todayDay === 26 && !submission;
  const daysLeft    = 26 - todayDay;

  const load = useCallback(async () => {
    if (!effectiveUserId) return;
    const [mRes, eRes, sRes] = await Promise.all([
      api.get(`/team?user_id=${effectiveUserId}&active=true`),
      api.get(`/schedule/month?user_id=${effectiveUserId}&year=${year}&month=${month}`),
      api.get(`/schedule/submission?user_id=${effectiveUserId}&year=${year}&month=${month}`).catch(() => ({ data: null })),
    ]);
    setMembers(mRes.data);
    setEntries(eRes.data);
    setSubmission(sRes.data);
  }, [effectiveUserId, year, month]);

  useEffect(() => { load(); }, [load]);

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(y => y-1); } else setMonth(m => m-1); };
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear(y => y+1); } else setMonth(m => m+1); };

  const getEntry = (memberId, date) =>
    entries.find(e => e.team_member_id === memberId && e.work_date === date);

  const saveCell = async ({ copyToDays = [], ...payload }) => {
    if (!openCell) return;
    const dates   = [openCell.date, ...copyToDays];
    const results = await Promise.all(
      dates.map(date => api.post('/schedule/save', { user_id:effectiveUserId, team_member_id:openCell.memberId, work_date:date, ...payload }))
    );
    setEntries(prev => {
      let next = [...prev];
      results.forEach(res => {
        const idx = next.findIndex(e => e.team_member_id === openCell.memberId && e.work_date === res.data.work_date);
        if (idx >= 0) next[idx] = res.data; else next.push(res.data);
      });
      return next;
    });
    setOpenCell(null);
  };

  const submitSchedule = async () => {
    setSubmitting(true);
    try {
      const res = await api.post('/schedule/submit', { user_id:effectiveUserId, year, month });
      setSubmission(res.data);
    } catch {}
    setSubmitting(false);
  };

  const reopenSchedule = async () => {
    try {
      await api.delete(`/schedule/submission?user_id=${effectiveUserId}&year=${year}&month=${month}`);
      setSubmission(null);
    } catch {}
  };

  const [generatingPdf, setGeneratingPdf] = useState(false);
  const downloadPDF = async () => {
    const el = document.getElementById('schedule-print');
    if (!el) return;
    setGeneratingPdf(true);
    el.classList.add('pdf-generating');
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      await html2pdf()
        .set({
          margin: [4, 4, 4, 4],
          filename: `Escala_${MONTHS_PT[month-1]}_${year}_${viewedProfile?.sector||'depto'}.pdf`,
          image: { type:'jpeg', quality:0.95 },
          html2canvas: { scale:2, useCORS:true, logging:false },
          jsPDF: { unit:'mm', format:'a4', orientation:'landscape' },
        })
        .from(el)
        .save();
    } catch (e) {
      console.error(e);
    }
    el.classList.remove('pdf-generating');
    setGeneratingPdf(false);
  };

  // progresso
  const filled = entries.filter(e => e.work_date >= allDates[0] && e.work_date <= allDates[allDates.length-1]).length;
  const total  = members.length * allDates.filter(d => getDOW(d) !== 0).length;
  const pct    = total > 0 ? Math.round(filled / total * 100) : 0;

  /* ── Célula de dia ── */
  function DayCell({ m, date }) {
    if (!date) return <td style={{ background:'#f3f4f6', border:'1px solid #e5e7eb' }}/>;

    const entry   = getEntry(m.id, date);
    const isToday = date === today;
    const isSun   = getDOW(date) === 0;
    const isD26   = parseInt(date.split('-')[2]) === 26;
    const bg      = isToday ? '#eff6ff' : isD26 ? '#faf5ff' : isSun ? '#fafafa' : '#fff';
    const open    = () => setOpenCell({ memberId:m.id, date, dow:getDOW(date) });

    if (!entry) return (
      <td onClick={open} style={{ background:bg, cursor:'pointer', textAlign:'center',
        verticalAlign:'middle', border:`1px solid ${isD26?'#c4b5fd':'#e5e7eb'}`, padding:'3px 1px',
        opacity: isSun ? .35 : 1 }}>
        <span style={{ color:'#d1d5db', fontSize:13, fontWeight:700 }}>+</span>
      </td>
    );

    if (entry.status !== 'trabalha') {
      const st = STATUS[entry.status] || STATUS.dsr;
      return (
        <td onClick={open} style={{ background:st.bg, cursor:'pointer', textAlign:'center',
          verticalAlign:'middle', border:`1px solid ${isD26?'#c4b5fd':'#e5e7eb'}`, padding:'2px 1px' }}>
          <span style={{ fontWeight:800, fontSize:8, color:st.color }}>{st.label}</span>
        </td>
      );
    }

    /* horários na horizontal: 2 colunas × 2 linhas */
    return (
      <td onClick={open} style={{ background:bg, cursor:'pointer',
        verticalAlign:'middle', border:`1px solid ${isD26?'#c4b5fd':'#e5e7eb'}`, padding:'2px 3px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 4px', fontSize:9, lineHeight:1.45 }}>
          <span style={{ fontWeight:700, color:'#1d4ed8' }}>{entry.entrada||'—'}</span>
          <span style={{ color:'#6b7280' }}>{entry.intervalo||'—'}</span>
          <span style={{ color:'#6b7280' }}>{entry.retorno_intervalo||'—'}</span>
          <span style={{ fontWeight:700, color:'#dc2626' }}>{entry.saida||'—'}</span>
        </div>
      </td>
    );
  }

  /* ── Cabeçalho de uma semana ── */
  function WeekHeader({ week }) {
    return (
      <tr>
        <th style={{ background:'#0e7490', color:'#fff', padding:'3px 5px', fontSize:9, fontWeight:700, border:'1px solid #0c6482', width:38 }}>Mat.</th>
        <th style={{ background:'#0e7490', color:'#fff', padding:'3px 8px', fontSize:10, fontWeight:700, border:'1px solid #0c6482', textAlign:'left', width:130 }}>Nome</th>
        {week.map((date, i) => {
          if (!date) return <th key={i} style={{ background:'#374151', border:'1px solid #374151' }}/>;
          const d    = parseInt(date.split('-')[2]);
          const isT  = date === today;
          const isD26= d === 26;
          const isSun= i === 0;
          return (
            <th key={date} style={{
              padding:'3px 2px', fontSize:10, fontWeight:700, textAlign:'center',
              border:'1px solid #1e3a8a',
              background: isT ? '#1d4ed8' : isD26 ? '#7c3aed' : isSun ? '#374151' : '#1e40af',
              color:'#fff',
            }}>
              <div style={{ fontWeight:800, fontSize:10 }}>{DAY_NAME[i]}</div>
              <div style={{ fontSize:9, opacity:.85 }}>{d}</div>
              {isD26 && <div style={{ fontSize:7, background:'#fbbf24', color:'#78350f', borderRadius:2, padding:'0 2px', marginTop:1 }}>Prazo</div>}
            </th>
          );
        })}
        {/* Assinatura e Data de Ciência: só aparecem no PDF */}
        <th className="print-only" style={{ background:'#c2410c', color:'#fff', padding:'3px 4px', fontSize:8, fontWeight:700, border:'1px solid #9a3412', width:70, textAlign:'center' }}>Assinatura</th>
        <th className="print-only" style={{ background:'#c2410c', color:'#fff', padding:'3px 4px', fontSize:8, fontWeight:700, border:'1px solid #9a3412', width:55, textAlign:'center' }}>Data Ciência</th>
      </tr>
    );
  }

  return (
    <>
      {/* Card — começa imediatamente, sem espaço morto */}
      <div id="schedule-print" style={{ background:'#fff', color:'#111', borderRadius:10, border:'1px solid #e5e7eb', boxShadow:'0 2px 12px rgba(0,0,0,.08)', overflow:'hidden' }}>

        {/* Barra única: tudo numa linha */}
        <div style={{
          padding:'5px 10px', borderBottom:'1px solid #e5e7eb',
          display:'flex', alignItems:'center', gap:10,
          background:'#f8fafc',
        }}>
          {/* Título */}
          <span style={{ fontWeight:800, fontSize:13, color:'#0f172a', whiteSpace:'nowrap' }}>Escala Mensal</span>
          <span style={{ color:'#e2e8f0' }}>|</span>

          {/* Seletor de setor (apenas supervisor/gerente) */}
          {isElevated ? (
            <select
              value={selectedUserId || ''}
              onChange={e => { setSelectedUserId(e.target.value || null); setMembers([]); setEntries([]); }}
              style={{ fontSize:10, padding:'2px 5px', borderRadius:4, border:'1px solid #cbd5e1', background:'#fff', color:'#0f172a', maxWidth:180, cursor:'pointer' }}
            >
              <option value="">Meu setor ({profile?.sector||'—'})</option>
              {allProfiles.filter(p => p.id !== userId && p.sector).map(p => (
                <option key={p.id} value={p.id}>{p.sector} · {p.full_name}</option>
              ))}
            </select>
          ) : (
            <span style={{ fontSize:10, color:'#475569', whiteSpace:'nowrap' }}><b>{viewedProfile?.sector||'—'}</b> · {viewedProfile?.full_name||'—'}</span>
          )}
          <span style={{ color:'#e2e8f0' }}>|</span>

          {/* Legenda de cores */}
          <span style={{ fontSize:9, color:'#1d4ed8', fontWeight:700, whiteSpace:'nowrap' }}>■E</span>
          <span style={{ fontSize:9, color:'#6b7280', whiteSpace:'nowrap' }}>■I/R</span>
          <span style={{ fontSize:9, color:'#dc2626', fontWeight:700, whiteSpace:'nowrap' }}>■S</span>
          <span style={{ fontSize:9, color:'#7c3aed', fontWeight:700, whiteSpace:'nowrap' }}>■26=Prazo</span>
          <span style={{ color:'#e2e8f0' }}>|</span>

          {/* Progresso */}
          {members.length > 0 && (<>
            <div style={{ width:60, height:4, background:'#e5e7eb', borderRadius:2, overflow:'hidden', flexShrink:0 }}>
              <div style={{ width:`${pct}%`, height:'100%', background: pct===100?'#16a34a':'#1d4ed8' }}/>
            </div>
            <span style={{ fontSize:10, fontWeight:700, color: pct===100?'#16a34a':'#1d4ed8', whiteSpace:'nowrap' }}>{pct}%</span>
            <span style={{ color:'#e2e8f0' }}>|</span>
          </>)}

          {/* Alertas inline */}
          {alertDay && (
            <span style={{ fontSize:10, fontWeight:700, color: alertUrgent?'#991b1b':'#92400e', whiteSpace:'nowrap' }}>
              {alertUrgent ? '🚨 HOJE prazo!' : `⏰ ${daysLeft}d p/ fechar`}
            </span>
          )}
          {submission && (<>
            <span style={{ fontSize:10, fontWeight:700, color:'#166534', whiteSpace:'nowrap' }}>
              ✅ Fechada {new Date(submission.submitted_at).toLocaleDateString('pt-BR')}
            </span>
            <button onClick={reopenSchedule} style={{ display:'flex', alignItems:'center', gap:3, padding:'2px 7px', borderRadius:4, border:'1px solid #fca5a5', background:'#fff7f7', cursor:'pointer', fontSize:10, color:'#b91c1c', whiteSpace:'nowrap', flexShrink:0 }}>
              🔓 Reabrir
            </button>
          </>)}

          {/* Espaço flexível */}
          <div style={{ flex:1 }}/>

          {/* Navegação mês */}
          <button onClick={prevMonth} style={{ background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:4, cursor:'pointer', padding:'2px 5px', display:'flex', flexShrink:0 }}>
            <ChevronLeft size={12}/>
          </button>
          <span style={{ fontWeight:800, fontSize:12, minWidth:100, textAlign:'center', whiteSpace:'nowrap' }}>{MONTHS_PT[month-1]} {year}</span>
          <button onClick={nextMonth} style={{ background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:4, cursor:'pointer', padding:'2px 5px', display:'flex', flexShrink:0 }}>
            <ChevronRight size={12}/>
          </button>
          <span style={{ color:'#e2e8f0' }}>|</span>

          {/* Ações */}
          <button onClick={() => setShowTeam(true)} style={{ display:'flex', alignItems:'center', gap:4, padding:'3px 8px', borderRadius:5, border:'1px solid #e2e8f0', background:'#fff', cursor:'pointer', fontSize:11, color:'#374151', whiteSpace:'nowrap', flexShrink:0 }}><Users size={11}/> Time</button>
          <button onClick={downloadPDF} disabled={generatingPdf} style={{ display:'flex', alignItems:'center', gap:4, padding:'3px 8px', borderRadius:5, border:'1px solid #e2e8f0', background:'#fff', cursor:'pointer', fontSize:11, color:'#374151', whiteSpace:'nowrap', flexShrink:0, opacity: generatingPdf ? .6 : 1 }}><Download size={11}/> {generatingPdf ? 'Gerando...' : 'Baixar PDF'}</button>
          {!submission && (
            <button onClick={submitSchedule} disabled={submitting} style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 10px', borderRadius:5, border:'none', background:'#16a34a', color:'#fff', cursor:'pointer', fontWeight:700, fontSize:11, whiteSpace:'nowrap', flexShrink:0 }}>
              <CheckCircle size={11}/> {submitting ? 'Fechando...' : 'Fechar Escala'}
            </button>
          )}
        </div>

        {/* Semanas empilhadas */}
        <div style={{ padding:'0 0 8px' }}>
          {members.length === 0 ? (
            <div style={{ textAlign:'center', padding:'40px', color:'#6b7280', fontSize:13 }}>
              Clique em <b>Time</b> para adicionar colaboradores.
            </div>
          ) : weeks.map((week, wi) => (
            <div key={wi} style={{ marginBottom: wi < weeks.length-1 ? 0 : 0, borderBottom: wi < weeks.length-1 ? '3px solid #e5e7eb' : 'none' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}>
                <thead><WeekHeader week={week}/></thead>
                <tbody>
                  {members.map((m, ri) => {
                    const rowBg = ri%2===0 ? '#fff' : '#f9fafb';
                    return (
                      <tr key={m.id} style={{ background:rowBg }}>
                        <td style={{ background:rowBg, padding:'2px 3px', textAlign:'center', fontSize:9,
                          color:'#6b7280', fontWeight:600, border:'1px solid #e5e7eb' }}>{m.matricula||'—'}</td>
                        <td style={{ background:rowBg, padding:'2px 8px', fontSize:10, fontWeight:700,
                          color:'#111', border:'1px solid #e5e7eb', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{m.name}</td>
                        {week.map((date, di) => <DayCell key={di} m={m} date={date}/>)}
                        <td className="print-only" style={{ background:rowBg, border:'1px solid #f97316' }}/>
                        <td className="print-only" style={{ background:rowBg, border:'1px solid #f97316' }}/>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        {/* Rodapé */}
        <div style={{ padding:'8px 18px', borderTop:'1px solid #e5e7eb', background:'#f9fafb', display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:8, alignItems:'center' }}>
          <p style={{ fontSize:10, color:'#6b7280', fontStyle:'italic', margin:0 }}>
            ** Escala deverá ser fechada até o dia <b>26</b> de cada mês.
          </p>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            {Object.entries(STATUS).map(([k, v]) => (
              <div key={k} style={{ display:'flex', alignItems:'center', gap:3, fontSize:10, color:'#555' }}>
                <span style={{ width:10, height:10, borderRadius:2, background:v.bg, border:`1px solid ${v.color}`, display:'inline-block' }}/>
                {v.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        .print-only { display: none; }
        .pdf-generating .print-only { display: table-cell !important; }
        @media print {
          .print-only { display: table-cell !important; }
          body * { visibility:hidden !important; }
          #schedule-print, #schedule-print * { visibility:visible !important; }
          #schedule-print { position:fixed; top:0; left:0; width:100%; }
        }
      `}</style>

      {openCell && (
        <CellEditor
          entry={getEntry(openCell.memberId, openCell.date)}
          memberName={members.find(m => m.id===openCell.memberId)?.name||''}
          dateStr={openCell.date}
          dayName={DAY_FULL[openCell.dow]}
          allDatesOfMonth={allDates}
          onSave={saveCell}
          onClose={() => setOpenCell(null)}
        />
      )}

      {showTeam && (
        <TeamModal userId={effectiveUserId} userSector={viewedProfile?.sector}
          onClose={() => { setShowTeam(false); load(); }}/>
      )}
    </>
  );
}
