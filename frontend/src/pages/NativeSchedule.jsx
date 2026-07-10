import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Printer, Plus, Users, X, Save, Trash2, Calendar } from 'lucide-react';
import api from '../api';

const DAY_NAME  = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const DAY_FULL  = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];

const STATUS = {
  trabalha: { label:'Trabalha', bg:'#e0f2fe', color:'#0369a1' },
  dsr:      { label:'DSR',      bg:'#dbeafe', color:'#1d4ed8' },
  ferias:   { label:'FÉRIAS',   bg:'#fef9c3', color:'#92400e' },
  feriado:  { label:'FERIADO',  bg:'#dcfce7', color:'#166534' },
  falta:    { label:'FALTA',    bg:'#fee2e2', color:'#991b1b' },
  folga:    { label:'FOLGA',    bg:'#f3e8ff', color:'#6b21a8' },
};

const ROLES = ['Operador(a) de Caixa','Atendente','Repositor(a)','Supervisor(a)','Coordenador(a)','Auxiliar','Outro'];

function getWeekStartFromDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().split('T')[0];
}
function addDaysUTC(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
}
function fmtBR(dateStr) {
  if (!dateStr) return '';
  const [,m,d] = dateStr.split('-');
  return `${d}/${m}`;
}
function todayISO() { return new Date().toISOString().split('T')[0]; }

/* ── Editor de célula (modal central) ── */
function CellEditor({ entry, memberName, dateStr, dayName, currentDayIdx, weekDates, onSave, onClose }) {
  const [status,    setStatus]    = useState(entry?.status || 'trabalha');
  const [entrada,   setEntrada]   = useState(entry?.entrada || '');
  const [intervalo, setIntervalo] = useState(entry?.intervalo || '');
  const [retorno,   setRetorno]   = useState(entry?.retorno_intervalo || '');
  const [saida,     setSaida]     = useState(entry?.saida || '');
  const [copyDays,  setCopyDays]  = useState([]);
  const [showCopy,  setShowCopy]  = useState(false);

  const toggleDay = (idx) =>
    setCopyDays(prev => prev.includes(idx) ? prev.filter(d => d!==idx) : [...prev, idx]);

  const selectAllOthers = () => {
    const others = weekDates.map((_,i) => i).filter(i => i !== currentDayIdx);
    setCopyDays(prev => prev.length === others.length ? [] : others);
  };

  const handleSave = () => {
    onSave({ status, entrada, intervalo, retorno_intervalo:retorno, saida, copyToDays: copyDays.map(i => weekDates[i]) });
  };

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:9998, background:'rgba(0,0,0,.4)' }}/>
      <div style={{
        position:'fixed', zIndex:9999,
        top:'50%', left:'50%', transform:'translate(-50%,-50%)',
        background:'#fff', borderRadius:14, padding:22, width:340,
        boxShadow:'0 24px 64px rgba(0,0,0,.3)', color:'#111',
        maxHeight:'90vh', overflowY:'auto',
      }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <div>
            <div style={{ fontWeight:800, fontSize:14 }}>{memberName}</div>
            <div style={{ fontSize:11, color:'#64748b' }}>{dayName} · {fmtBR(dateStr)}</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8', fontSize:22, lineHeight:1, padding:'0 4px' }}>×</button>
        </div>

        {/* Status */}
        <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:14 }}>
          {Object.entries(STATUS).map(([k,v]) => (
            <button key={k} onClick={() => setStatus(k)} style={{
              padding:'5px 12px', borderRadius:7, fontSize:11, fontWeight:700, cursor:'pointer',
              background: status===k ? v.color : '#f1f5f9',
              color:      status===k ? '#fff'   : '#475569',
              border:`1.5px solid ${status===k ? v.color : '#e2e8f0'}`,
              transition:'all .12s',
            }}>{v.label}</button>
          ))}
        </div>

        {/* Horários */}
        {status === 'trabalha' && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
            {[
              { label:'Entrada',           val:entrada,   set:setEntrada },
              { label:'Saída p/ intervalo',val:intervalo, set:setIntervalo },
              { label:'Retorno intervalo', val:retorno,   set:setRetorno },
              { label:'Saída',             val:saida,     set:setSaida },
            ].map(f => (
              <div key={f.label}>
                <div style={{ fontSize:10, color:'#64748b', marginBottom:4, fontWeight:700, textTransform:'uppercase', letterSpacing:.4 }}>{f.label}</div>
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
            <div style={{ marginTop:10, background:'#f0f9ff', borderRadius:8, padding:12, border:'1px solid #bae6fd' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <span style={{ fontSize:11, fontWeight:700, color:'#0369a1' }}>Selecione os dias:</span>
                <button onClick={selectAllOthers} style={{
                  fontSize:10, padding:'3px 8px', borderRadius:5, border:'1px solid #93c5fd',
                  background:'#dbeafe', color:'#1d4ed8', cursor:'pointer', fontWeight:700,
                }}>
                  {copyDays.length === weekDates.length - 1 ? 'Desmarcar todos' : 'Selecionar todos'}
                </button>
              </div>
              <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                {DAY_NAME.map((d, i) => {
                  if (i === currentDayIdx) return null;
                  const sel = copyDays.includes(i);
                  return (
                    <button key={i} onClick={() => toggleDay(i)} style={{
                      padding:'5px 10px', borderRadius:6, fontSize:12, fontWeight:700, cursor:'pointer',
                      background: sel ? '#1d4ed8' : '#fff',
                      color:      sel ? '#fff'    : '#374151',
                      border:`1.5px solid ${sel ? '#1d4ed8' : '#d1d5db'}`,
                      transition:'all .1s',
                    }}>{d}</button>
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
      setAdding(false);
      load();
    } catch {}
    setSaving(false);
  };

  const remove = async (id, name) => {
    if (!confirm(`Excluir ${name}?`)) return;
    await api.delete(`/team/${id}`);
    load();
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
                onChange={e => setForm(f => ({...f, name:e.target.value.toUpperCase()}))}
                style={{ fontSize:12, textTransform:'uppercase' }}/>
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
  const [weekStart, setWeekStart] = useState(() => getWeekStartFromDate(todayISO()));
  const [members,   setMembers]   = useState([]);
  const [entries,   setEntries]   = useState([]);
  const [openCell,  setOpenCell]  = useState(null);
  const [showTeam,  setShowTeam]  = useState(false);
  const today = todayISO();

  const weekDates = Array.from({ length:7 }, (_, i) => addDaysUTC(weekStart, i));
  const weekEnd   = weekDates[6];

  const load = useCallback(async () => {
    if (!userId) return;
    const [mRes, eRes] = await Promise.all([
      api.get(`/team?user_id=${userId}&active=true`),
      api.get(`/schedule?user_id=${userId}&week_start=${weekStart}`),
    ]);
    setMembers(mRes.data);
    setEntries(eRes.data);
  }, [userId, weekStart]);

  useEffect(() => { load(); }, [load]);

  const getEntry = (memberId, date) =>
    entries.find(e => e.team_member_id === memberId && e.work_date === date);

  const saveCell = async ({ copyToDays = [], ...payload }) => {
    if (!openCell) return;

    // salva o dia atual
    const saves = [
      api.post('/schedule/save', { user_id:userId, team_member_id:openCell.memberId, work_date:openCell.date, ...payload }),
      // copia para os dias selecionados
      ...copyToDays.map(date =>
        api.post('/schedule/save', { user_id:userId, team_member_id:openCell.memberId, work_date:date, ...payload })
      ),
    ];

    const results = await Promise.all(saves);
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

  /* ── Célula de dia: mostra 4 horários empilhados ── */
  function DayCell({ m, date, dayIdx, ri }) {
    const entry  = getEntry(m.id, date);
    const isOpen = openCell?.memberId===m.id && openCell?.date===date;
    const isToday= date===today;
    const rowBg  = ri%2===0 ? '#fff' : '#f9fafb';
    const bg     = isToday ? '#eff6ff' : rowBg;
    const border = isToday ? '1px solid #bfdbfe' : '1px solid #e5e7eb';

    const open = () => setOpenCell(isOpen ? null : { memberId:m.id, date, dayIdx });

    if (!entry) {
      return (
        <td onClick={open} style={{ border, background:bg, cursor:'pointer', textAlign:'center',
          verticalAlign:'middle', padding:'6px 4px', minWidth:0 }}>
          <span style={{ color:'#9ca3af', fontSize:18, fontWeight:700, lineHeight:1 }}>+</span>
        </td>
      );
    }

    if (entry.status !== 'trabalha') {
      const st = STATUS[entry.status] || STATUS.dsr;
      return (
        <td onClick={open} style={{ border, background:st.bg, cursor:'pointer', textAlign:'center',
          verticalAlign:'middle', padding:'6px 4px' }}>
          <span style={{ fontWeight:800, fontSize:11, color:st.color }}>{st.label}</span>
        </td>
      );
    }

    return (
      <td onClick={open} style={{ border, background:bg, cursor:'pointer',
        textAlign:'center', verticalAlign:'middle', padding:'4px 3px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1px 4px', fontSize:11 }}>
          <span style={{ fontWeight:700, color:'#1d4ed8' }}>{entry.entrada||'—'}</span>
          <span style={{ color:'#6b7280' }}>{entry.intervalo||'—'}</span>
          <span style={{ color:'#6b7280' }}>{entry.retorno_intervalo||'—'}</span>
          <span style={{ fontWeight:700, color:'#dc2626' }}>{entry.saida||'—'}</span>
        </div>
      </td>
    );
  }

  return (
    <>
      {/* Barra de ações */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, flexWrap:'wrap', gap:8 }}>
        <h1 className="page-title" style={{ margin:0 }}>Escala de Trabalho Semanal</h1>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-ghost" onClick={() => setShowTeam(true)}><Users size={14}/> Gerenciar time</button>
          <button className="btn btn-ghost" onClick={() => window.print()}><Printer size={14}/> Imprimir</button>
        </div>
      </div>

      {/* Card */}
      <div id="schedule-print" style={{ background:'#fff', color:'#111', borderRadius:12, border:'1px solid #e5e7eb', boxShadow:'0 2px 16px rgba(0,0,0,.08)', overflow:'hidden' }}>

        {/* Cabeçalho info + seletor */}
        <div style={{ padding:'12px 18px', borderBottom:'1px solid #e5e7eb', display:'flex', flexWrap:'wrap', gap:16, alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', gap:20, flexWrap:'wrap' }}>
            <span style={{ fontSize:13 }}><b>Departamento:</b> {profile?.sector||'—'}</span>
            <span style={{ fontSize:13 }}><b>Gestor:</b> {profile?.full_name||'—'}</span>
            <span style={{ fontSize:13 }}><b>Unidade:</b> {profile?.company||'—'}</span>
          </div>

          {/* Seletor semana */}
          <div style={{ display:'flex', alignItems:'center', gap:4, background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:'5px 10px' }}>
            <button onClick={() => setWeekStart(addDaysUTC(weekStart,-7))}
              style={{ background:'none', border:'none', cursor:'pointer', padding:'2px 4px', color:'#374151', display:'flex' }}>
              <ChevronLeft size={16}/>
            </button>
            <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer' }}>
              <Calendar size={13} color="#1d4ed8"/>
              <span style={{ fontSize:12, fontWeight:700 }}>
                {fmtBR(weekStart).replace('/','/20').slice(0,8)} à {fmtBR(weekEnd).replace('/','/20')}
              </span>
              <input type="date" value={weekStart}
                onChange={e => e.target.value && setWeekStart(getWeekStartFromDate(e.target.value))}
                style={{ position:'absolute', opacity:0, width:0, height:0 }}/>
            </label>
            <button onClick={() => setWeekStart(addDaysUTC(weekStart,7))}
              style={{ background:'none', border:'none', cursor:'pointer', padding:'2px 4px', color:'#374151', display:'flex' }}>
              <ChevronRight size={16}/>
            </button>
          </div>
        </div>

        {/* Legenda horários */}
        <div style={{ padding:'6px 18px', background:'#f0f9ff', borderBottom:'1px solid #bae6fd', display:'flex', gap:20, fontSize:11, color:'#0369a1', flexWrap:'wrap' }}>
          <span><b style={{ color:'#1d4ed8' }}>Azul</b> = Entrada</span>
          <span><b style={{ color:'#6b7280' }}>Cinza</b> = Int. / Retorno</span>
          <span><b style={{ color:'#dc2626' }}>Vermelho</b> = Saída</span>
          <span style={{ marginLeft:'auto', color:'#64748b' }}>Clique em qualquer célula para editar</span>
        </div>

        {/* Tabela */}
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                <th style={{ background:'#0e7490', color:'#fff', padding:'8px 10px', fontSize:11, fontWeight:700,
                  textAlign:'center', border:'1px solid #0c6482', width:'5%' }}>Matr.</th>
                <th style={{ background:'#0e7490', color:'#fff', padding:'8px 10px', fontSize:12, fontWeight:700,
                  textAlign:'left', border:'1px solid #0c6482', width:'16%' }}>Nome do Associado</th>
                {weekDates.map((d, i) => (
                  <th key={d} style={{
                    background: d===today ? '#1d4ed8' : '#1e40af',
                    color:'#fff', padding:'7px 4px', fontSize:11, fontWeight:700,
                    textAlign:'center', border:'1px solid #1e3a8a',
                    width:`${79/7}%`,
                  }}>
                    <div style={{ fontWeight:800 }}>{DAY_NAME[i]}</div>
                    <div style={{ fontSize:10, opacity:.85, fontWeight:400 }}>{fmtBR(d)}</div>
                    <div style={{ fontSize:9, opacity:.7, marginTop:2 }}>Ent · Int · Ret · Saí</div>
                  </th>
                ))}
                <th style={{ background:'#c2410c', color:'#fff', padding:'8px 4px', fontSize:10, fontWeight:700,
                  textAlign:'center', border:'1px solid #9a3412', width:'5%' }}>Assinatura</th>
                <th style={{ background:'#c2410c', color:'#fff', padding:'8px 4px', fontSize:10, fontWeight:700,
                  textAlign:'center', border:'1px solid #9a3412', width:'5%' }}>Data<br/>ciência</th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign:'center', padding:'36px', color:'#6b7280', fontSize:13 }}>
                    Clique em <b>Gerenciar time</b> para adicionar colaboradores.
                  </td>
                </tr>
              ) : members.map((m, ri) => {
                const rowBg = ri%2===0 ? '#fff' : '#f9fafb';
                return (
                  <tr key={m.id}>
                    <td style={{ background:rowBg, padding:'4px 6px', textAlign:'center', fontSize:11,
                      color:'#6b7280', fontWeight:600, border:'1px solid #e5e7eb' }}>{m.matricula||'—'}</td>
                    <td style={{ background:rowBg, padding:'4px 10px', fontSize:12, fontWeight:700,
                      color:'#111', border:'1px solid #e5e7eb', whiteSpace:'nowrap' }}>{m.name}</td>
                    {weekDates.map((date, dayIdx) => (
                      <DayCell key={date} m={m} date={date} dayIdx={dayIdx} ri={ri}/>
                    ))}
                    <td style={{ background:rowBg, border:'2px solid #f97316' }}></td>
                    <td style={{ background:rowBg, border:'1px solid #e5e7eb' }}></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Rodapé */}
        <div style={{ padding:'8px 18px', borderTop:'1px solid #e5e7eb', background:'#f9fafb', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
          <p style={{ fontSize:10, color:'#6b7280', fontStyle:'italic', margin:0 }}>
            ** Escala deverá contemplar horário de entrega ao trabalho, início e retorno do descanso e saída do trabalho (Ex.: 8h/12h–13h/16h20)
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

      {/* Impressão */}
      <style>{`
        @media print {
          body * { visibility:hidden !important; }
          #schedule-print, #schedule-print * { visibility:visible !important; }
          #schedule-print { position:fixed; top:0; left:0; width:100%; box-shadow:none !important; }
        }
      `}</style>

      {/* Editor modal */}
      {openCell && (
        <CellEditor
          entry={getEntry(openCell.memberId, openCell.date)}
          memberName={members.find(m => m.id===openCell.memberId)?.name || ''}
          dateStr={openCell.date}
          dayName={DAY_FULL[openCell.dayIdx]}
          currentDayIdx={openCell.dayIdx}
          weekDates={weekDates}
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
