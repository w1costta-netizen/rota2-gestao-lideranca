import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Printer, Users, X, Save, Trash2, Plus, CheckCircle, AlertCircle, Calendar } from 'lucide-react';
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
function fmtDate(y, m, d) {
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function daysInMonth(year, month) { return new Date(year, month, 0).getDate(); }
function dayOfWeek(year, month, day) { return new Date(year, month-1, day).getDay(); }

/* ── Editor de célula ── */
function CellEditor({ entry, memberName, dateStr, dayName, currentDayIdx, allDatesOfMonth, onSave, onClose }) {
  const [status,    setStatus]    = useState(entry?.status || 'trabalha');
  const [entrada,   setEntrada]   = useState(entry?.entrada || '');
  const [intervalo, setIntervalo] = useState(entry?.intervalo || '');
  const [retorno,   setRetorno]   = useState(entry?.retorno_intervalo || '');
  const [saida,     setSaida]     = useState(entry?.saida || '');
  const [copyDays,  setCopyDays]  = useState([]);
  const [showCopy,  setShowCopy]  = useState(false);

  const otherDates = allDatesOfMonth.filter(d => d !== dateStr);
  const toggleDay  = (d) => setCopyDays(p => p.includes(d) ? p.filter(x=>x!==d) : [...p,d]);
  const selectAll  = () => setCopyDays(p => p.length===otherDates.length ? [] : [...otherDates]);

  const handleSave = () => onSave({ status, entrada, intervalo, retorno_intervalo:retorno, saida, copyToDays:copyDays });

  const [,mStr,dStr] = dateStr.split('-');
  const label = `${dStr}/${mStr}`;

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
            <div style={{ fontSize:11, color:'#64748b' }}>{dayName} · {label}</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8', fontSize:22, lineHeight:1 }}>×</button>
        </div>

        <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:14 }}>
          {Object.entries(STATUS).map(([k,v]) => (
            <button key={k} onClick={() => setStatus(k)} style={{
              padding:'5px 12px', borderRadius:7, fontSize:11, fontWeight:700, cursor:'pointer',
              background: status===k ? v.color : '#f1f5f9',
              color:      status===k ? '#fff'   : '#475569',
              border:`1.5px solid ${status===k ? v.color : '#e2e8f0'}`,
            }}>{v.label}</button>
          ))}
        </div>

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
          <button onClick={() => setShowCopy(s=>!s)} style={{
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
                <span style={{ fontSize:11, fontWeight:700, color:'#0369a1' }}>Selecione os dias do mês:</span>
                <button onClick={selectAll} style={{
                  fontSize:10, padding:'3px 8px', borderRadius:5, border:'1px solid #93c5fd',
                  background:'#dbeafe', color:'#1d4ed8', cursor:'pointer', fontWeight:700,
                }}>{copyDays.length===otherDates.length ? 'Desmarcar' : 'Todos'}</button>
              </div>
              <div style={{ display:'flex', gap:4, flexWrap:'wrap', maxHeight:120, overflowY:'auto' }}>
                {otherDates.map(d => {
                  const [,mm,dd] = d.split('-');
                  const dow = new Date(d+'T12:00:00Z').getUTCDay();
                  const sel = copyDays.includes(d);
                  return (
                    <button key={d} onClick={() => toggleDay(d)} style={{
                      padding:'4px 7px', borderRadius:5, fontSize:11, fontWeight:700, cursor:'pointer',
                      background: sel ? '#1d4ed8' : '#fff',
                      color:      sel ? '#fff'    : '#374151',
                      border:`1.5px solid ${sel ? '#1d4ed8' : '#d1d5db'}`,
                    }}>{dd}/{mm} <span style={{ fontWeight:400, fontSize:9 }}>{DAY_NAME[dow]}</span></button>
                  );
                })}
              </div>
              {copyDays.length > 0 && (
                <div style={{ marginTop:8, fontSize:11, color:'#0369a1', fontWeight:600 }}>
                  ✓ Será copiado para {copyDays.length} dia{copyDays.length>1?'s':''}
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
          <button onClick={handleSave} style={{
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
  useEffect(() => { setForm(f => ({ ...f, sector: userSector||'' })); }, [userSector]);

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
export default function NativeSchedule({ userId, profile }) {
  const now = new Date();
  const [year,     setYear]     = useState(now.getFullYear());
  const [month,    setMonth]    = useState(now.getMonth() + 1);
  const [members,  setMembers]  = useState([]);
  const [entries,  setEntries]  = useState([]);
  const [openCell, setOpenCell] = useState(null);
  const [showTeam, setShowTeam] = useState(false);
  const [submission, setSubmission] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const scrollRef = useRef();
  const today = todayISO();
  const todayDay = parseInt(today.split('-')[2]);
  const todayMonth = parseInt(today.split('-')[1]);
  const todayYear  = parseInt(today.split('-')[0]);

  const totalDays = daysInMonth(year, month);
  const allDates  = Array.from({ length:totalDays }, (_,i) => fmtDate(year, month, i+1));

  // Alerta: está no mês atual e está entre dia 24-26?
  const isCurrentMonth = year===todayYear && month===todayMonth;
  const alertDay = isCurrentMonth && todayDay >= 24 && todayDay <= 26;
  const alertUrgent = isCurrentMonth && todayDay === 26;
  const daysLeft = 26 - todayDay;

  const load = useCallback(async () => {
    if (!userId) return;
    const [mRes, eRes, sRes] = await Promise.all([
      api.get(`/team?user_id=${userId}&active=true`),
      api.get(`/schedule/month?user_id=${userId}&year=${year}&month=${month}`),
      api.get(`/schedule/submission?user_id=${userId}&year=${year}&month=${month}`).catch(() => ({ data: null })),
    ]);
    setMembers(mRes.data);
    setEntries(eRes.data);
    setSubmission(sRes.data);
  }, [userId, year, month]);

  useEffect(() => { load(); }, [load]);

  const prevMonth = () => { if (month===1) { setMonth(12); setYear(y=>y-1); } else setMonth(m=>m-1); };
  const nextMonth = () => { if (month===12) { setMonth(1); setYear(y=>y+1); } else setMonth(m=>m+1); };

  const getEntry = (memberId, date) =>
    entries.find(e => e.team_member_id === memberId && e.work_date === date);

  const saveCell = async ({ copyToDays=[], ...payload }) => {
    if (!openCell) return;
    const dates = [openCell.date, ...copyToDays];
    const results = await Promise.all(
      dates.map(date => api.post('/schedule/save', { user_id:userId, team_member_id:openCell.memberId, work_date:date, ...payload }))
    );
    setEntries(prev => {
      let next = [...prev];
      results.forEach(res => {
        const idx = next.findIndex(e => e.team_member_id===openCell.memberId && e.work_date===res.data.work_date);
        if (idx >= 0) next[idx] = res.data; else next.push(res.data);
      });
      return next;
    });
    setOpenCell(null);
  };

  const submitSchedule = async () => {
    setSubmitting(true);
    try {
      const res = await api.post('/schedule/submit', { user_id:userId, year, month });
      setSubmission(res.data);
    } catch {}
    setSubmitting(false);
  };

  // % de preenchimento do mês
  const workDays = allDates.filter(d => dayOfWeek(year, month, parseInt(d.split('-')[2])) !== 0).length;
  const filled   = members.length > 0
    ? entries.filter(e => e.work_date >= allDates[0] && e.work_date <= allDates[allDates.length-1]).length
    : 0;
  const total    = members.length * workDays;
  const pct      = total > 0 ? Math.round(filled/total*100) : 0;

  function DayCell({ m, date }) {
    const entry  = getEntry(m.id, date);
    const isOpen = openCell?.memberId===m.id && openCell?.date===date;
    const isToday= date===today;
    const dow    = new Date(date+'T12:00:00Z').getUTCDay();
    const isSun  = dow===0;
    const rowBg  = isSun ? '#fafafa' : '#fff';
    const bg     = isToday ? '#eff6ff' : rowBg;

    const open = () => setOpenCell(isOpen ? null : { memberId:m.id, date, dow });

    if (!entry) {
      return (
        <td onClick={open} style={{ background:bg, cursor:'pointer', textAlign:'center',
          verticalAlign:'middle', padding:'3px 2px', border:'1px solid #e5e7eb',
          opacity: isSun ? .4 : 1 }}>
          <span style={{ color:'#9ca3af', fontSize:16, fontWeight:700 }}>+</span>
        </td>
      );
    }
    if (entry.status !== 'trabalha') {
      const st = STATUS[entry.status] || STATUS.dsr;
      return (
        <td onClick={open} style={{ background:st.bg, cursor:'pointer', textAlign:'center',
          verticalAlign:'middle', padding:'3px 2px', border:'1px solid #e5e7eb' }}>
          <span style={{ fontWeight:800, fontSize:9, color:st.color }}>{st.label}</span>
        </td>
      );
    }
    return (
      <td onClick={open} style={{ background:bg, cursor:'pointer', textAlign:'center',
        verticalAlign:'middle', padding:'2px', border:'1px solid #e5e7eb' }}>
        <div style={{ fontSize:9, lineHeight:1.4 }}>
          <div style={{ fontWeight:700, color:'#1d4ed8' }}>{entry.entrada||'—'}</div>
          <div style={{ color:'#dc2626', fontWeight:700 }}>{entry.saida||'—'}</div>
        </div>
      </td>
    );
  }

  return (
    <>
      {/* Alerta prazo */}
      {alertDay && !submission && (
        <div style={{
          background: alertUrgent ? '#fee2e2' : '#fef9c3',
          border:`1.5px solid ${alertUrgent ? '#fca5a5' : '#fde68a'}`,
          borderRadius:10, padding:'12px 16px', marginBottom:14,
          display:'flex', alignItems:'center', gap:12,
        }}>
          <AlertCircle size={20} color={alertUrgent ? '#dc2626' : '#92400e'}/>
          <div>
            <div style={{ fontWeight:800, fontSize:13, color: alertUrgent ? '#991b1b' : '#92400e' }}>
              {alertUrgent ? '🚨 HOJE é o prazo! Escala de ' : `⏰ Faltam ${daysLeft} dia${daysLeft!==1?'s':''} para o prazo! Escala de `}
              {MONTHS_PT[month-1]}/{year} ainda não foi fechada.
            </div>
            <div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>
              Preencha e clique em <b>"Fechar Escala"</b> até o dia 26.
            </div>
          </div>
        </div>
      )}

      {/* Confirmação de escala fechada */}
      {submission && (
        <div style={{ background:'#f0fdf4', border:'1.5px solid #86efac', borderRadius:10, padding:'12px 16px', marginBottom:14, display:'flex', alignItems:'center', gap:10 }}>
          <CheckCircle size={18} color="#166534"/>
          <span style={{ fontSize:13, color:'#166534', fontWeight:700 }}>
            ✅ Escala de {MONTHS_PT[month-1]}/{year} fechada em {new Date(submission.submitted_at).toLocaleDateString('pt-BR')}
          </span>
        </div>
      )}

      {/* Barra de ações */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, flexWrap:'wrap', gap:8 }}>
        <h1 className="page-title" style={{ margin:0 }}>Escala Mensal</h1>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button className="btn btn-ghost" onClick={() => setShowTeam(true)}><Users size={14}/> Time</button>
          <button className="btn btn-ghost" onClick={() => window.print()}><Printer size={14}/> Imprimir</button>
          {!submission && (
            <button onClick={submitSchedule} disabled={submitting} style={{
              display:'flex', alignItems:'center', gap:6, padding:'8px 16px', borderRadius:8,
              background:'#16a34a', color:'#fff', border:'none', cursor:'pointer', fontWeight:700, fontSize:13,
            }}>
              <CheckCircle size={15}/> {submitting ? 'Fechando...' : 'Fechar Escala'}
            </button>
          )}
        </div>
      </div>

      {/* Card principal */}
      <div id="schedule-print" style={{ background:'#fff', color:'#111', borderRadius:12, border:'1px solid #e5e7eb', boxShadow:'0 2px 16px rgba(0,0,0,.08)', overflow:'hidden' }}>

        {/* Cabeçalho */}
        <div style={{ padding:'12px 18px', borderBottom:'1px solid #e5e7eb', display:'flex', flexWrap:'wrap', gap:12, alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', gap:20, flexWrap:'wrap' }}>
            <span style={{ fontSize:13 }}><b>Departamento:</b> {profile?.sector||'—'}</span>
            <span style={{ fontSize:13 }}><b>Gestor:</b> {profile?.full_name||'—'}</span>
          </div>

          {/* Seletor mês */}
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <button onClick={prevMonth} style={{ background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:6, cursor:'pointer', padding:'5px 8px', display:'flex' }}>
              <ChevronLeft size={16}/>
            </button>
            <span style={{ fontWeight:800, fontSize:15, minWidth:150, textAlign:'center' }}>
              {MONTHS_PT[month-1]} {year}
            </span>
            <button onClick={nextMonth} style={{ background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:6, cursor:'pointer', padding:'5px 8px', display:'flex' }}>
              <ChevronRight size={16}/>
            </button>
          </div>

          {/* Progresso */}
          {members.length > 0 && (
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ fontSize:11, color:'#6b7280' }}>Preenchimento:</div>
              <div style={{ width:120, height:8, background:'#e5e7eb', borderRadius:4, overflow:'hidden' }}>
                <div style={{ width:`${pct}%`, height:'100%', background: pct===100?'#16a34a':'#1d4ed8', borderRadius:4, transition:'width .3s' }}/>
              </div>
              <div style={{ fontSize:11, fontWeight:700, color: pct===100?'#16a34a':'#1d4ed8' }}>{pct}%</div>
            </div>
          )}
        </div>

        {/* Legenda */}
        <div style={{ padding:'5px 18px', background:'#f0f9ff', borderBottom:'1px solid #bae6fd', display:'flex', gap:16, fontSize:11, color:'#0369a1', flexWrap:'wrap', alignItems:'center' }}>
          <span><b style={{ color:'#1d4ed8' }}>Azul</b> = Entrada &nbsp;|&nbsp; <b style={{ color:'#dc2626' }}>Vermelho</b> = Saída</span>
          <span style={{ marginLeft:'auto', color:'#64748b' }}>Clique em qualquer célula para editar · Dom = domingo (cinza)</span>
        </div>

        {/* Tabela mensal */}
        <div ref={scrollRef} style={{ overflowX:'auto', scrollbarWidth:'thick', scrollbarColor:'#1d4ed8 #e2e8f0' }}>
          <table style={{ borderCollapse:'collapse', minWidth:'max-content', width:'100%' }}>
            <thead>
              <tr>
                {/* Cabeçalho fixo */}
                <th style={{ background:'#0e7490', color:'#fff', padding:'6px 8px', fontSize:10, fontWeight:700,
                  border:'1px solid #0c6482', position:'sticky', left:0, zIndex:10, minWidth:60 }}>Matr.</th>
                <th style={{ background:'#0e7490', color:'#fff', padding:'6px 10px', fontSize:11, fontWeight:700,
                  border:'1px solid #0c6482', textAlign:'left', position:'sticky', left:60, zIndex:10, minWidth:150 }}>Nome</th>
                {/* Dias do mês */}
                {allDates.map(date => {
                  const d   = parseInt(date.split('-')[2]);
                  const dow = new Date(date+'T12:00:00Z').getUTCDay();
                  const isSun = dow===0;
                  const isTod = date===today;
                  const isD26 = d===26;
                  return (
                    <th key={date} style={{
                      padding:'4px 2px', fontSize:10, fontWeight:700, textAlign:'center',
                      border:'1px solid #1e3a8a', minWidth:44,
                      background: isTod ? '#1d4ed8' : isD26 ? '#7c3aed' : isSun ? '#374151' : '#1e40af',
                      color:'#fff',
                    }}>
                      <div style={{ fontWeight:800 }}>{d}</div>
                      <div style={{ fontSize:9, opacity:.8 }}>{DAY_NAME[dow]}</div>
                      {isD26 && <div style={{ fontSize:8, background:'#fbbf24', color:'#78350f', borderRadius:3, padding:'1px 2px', marginTop:1 }}>Prazo</div>}
                    </th>
                  );
                })}
                <th style={{ background:'#c2410c', color:'#fff', padding:'6px 4px', fontSize:9, fontWeight:700,
                  border:'1px solid #9a3412', minWidth:60, textAlign:'center' }}>Assinatura</th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td colSpan={allDates.length+3} style={{ textAlign:'center', padding:'36px', color:'#6b7280', fontSize:13 }}>
                    Clique em <b>Time</b> para adicionar colaboradores.
                  </td>
                </tr>
              ) : members.map((m, ri) => {
                const rowBg = ri%2===0 ? '#fff' : '#f9fafb';
                return (
                  <tr key={m.id}>
                    <td style={{ background:rowBg, padding:'4px 6px', textAlign:'center', fontSize:10,
                      color:'#6b7280', fontWeight:600, border:'1px solid #e5e7eb',
                      position:'sticky', left:0, zIndex:5 }}>{m.matricula||'—'}</td>
                    <td style={{ background:rowBg, padding:'4px 10px', fontSize:11, fontWeight:700,
                      color:'#111', border:'1px solid #e5e7eb', whiteSpace:'nowrap',
                      position:'sticky', left:60, zIndex:5 }}>{m.name}</td>
                    {allDates.map(date => (
                      <DayCell key={date} m={m} date={date}/>
                    ))}
                    <td style={{ background:rowBg, border:'2px solid #f97316' }}></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Rodapé */}
        <div style={{ padding:'8px 18px', borderTop:'1px solid #e5e7eb', background:'#f9fafb', display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:8, alignItems:'center' }}>
          <p style={{ fontSize:10, color:'#6b7280', fontStyle:'italic', margin:0 }}>
            ** Escala deverá ser fechada até o dia <b>26</b> de cada mês. Prazo marcado em roxo na tabela.
          </p>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            {Object.entries(STATUS).map(([k,v]) => (
              <div key={k} style={{ display:'flex', alignItems:'center', gap:3, fontSize:10, color:'#555' }}>
                <span style={{ width:10, height:10, borderRadius:2, background:v.bg, border:`1px solid ${v.color}`, display:'inline-block' }}/>
                {v.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility:hidden !important; }
          #schedule-print, #schedule-print * { visibility:visible !important; }
          #schedule-print { position:fixed; top:0; left:0; width:100%; }
        }
        div[ref]::-webkit-scrollbar { height:12px; }
        div::-webkit-scrollbar { height:12px; }
        div::-webkit-scrollbar-track { background:#e2e8f0; border-radius:6px; }
        div::-webkit-scrollbar-thumb { background:#1d4ed8; border-radius:6px; }
      `}</style>

      {openCell && (
        <CellEditor
          entry={getEntry(openCell.memberId, openCell.date)}
          memberName={members.find(m => m.id===openCell.memberId)?.name||''}
          dateStr={openCell.date}
          dayName={DAY_FULL[openCell.dow]}
          currentDayIdx={openCell.dow}
          allDatesOfMonth={allDates}
          onSave={saveCell}
          onClose={() => setOpenCell(null)}
        />
      )}

      {showTeam && (
        <TeamModal userId={userId} userSector={profile?.sector}
          onClose={() => { setShowTeam(false); load(); }}/>
      )}
    </>
  );
}
