import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Printer, Plus, Users, X, Save, Trash2, Calendar } from 'lucide-react';
import api from '../api';

const DAY_NAME = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];

const STATUS = {
  trabalha: { label: 'Trabalha', bg:'#e0f2fe', color:'#0369a1' },
  dsr:      { label: 'DSR',      bg:'#dbeafe', color:'#1d4ed8' },
  ferias:   { label: 'FÉRIAS',   bg:'#fef9c3', color:'#92400e' },
  feriado:  { label: 'FERIADO',  bg:'#f0fdf4', color:'#166534' },
  falta:    { label: 'FALTA',    bg:'#fee2e2', color:'#991b1b' },
  folga:    { label: 'FOLGA',    bg:'#f3e8ff', color:'#6b21a8' },
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
  const [y,m,d] = dateStr.split('-');
  return `${d}/${m}/${String(y).slice(-2)}`;
}
function todayISO() { return new Date().toISOString().split('T')[0]; }

/* ── Editor de célula ── */
function CellEditor({ entry, memberName, dateStr, onSave, onClose }) {
  const [status,    setStatus]    = useState(entry?.status || 'trabalha');
  const [entrada,   setEntrada]   = useState(entry?.entrada || '');
  const [intervalo, setIntervalo] = useState(entry?.intervalo || '');
  const [retorno,   setRetorno]   = useState(entry?.retorno_intervalo || '');
  const [saida,     setSaida]     = useState(entry?.saida || '');
  const ref = useRef();

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  return (
    <div ref={ref} style={{
      position:'fixed', zIndex:9999,
      background:'#fff', border:'1px solid #cbd5e1', borderRadius:12, padding:18, width:300,
      boxShadow:'0 20px 60px rgba(0,0,0,.25)', color:'#111',
      top:'50%', left:'50%', transform:'translate(-50%,-50%)',
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <span style={{ fontSize:12, fontWeight:700, color:'#64748b' }}>{memberName} · {fmtBR(dateStr)}</span>
        <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8', fontSize:18, lineHeight:1 }}>×</button>
      </div>

      <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:14 }}>
        {Object.entries(STATUS).map(([k,v]) => (
          <button key={k} onClick={() => setStatus(k)} style={{
            padding:'5px 11px', borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer',
            background: status===k ? v.color : '#f1f5f9',
            color: status===k ? '#fff' : '#475569',
            border:`1.5px solid ${status===k ? v.color : '#e2e8f0'}`,
            transition:'all .15s',
          }}>{v.label}</button>
        ))}
      </div>

      {status === 'trabalha' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14 }}>
          {[
            { label:'Entrada',           val:entrada,   set:setEntrada },
            { label:'Saída intervalo',   val:intervalo, set:setIntervalo },
            { label:'Retorno intervalo', val:retorno,   set:setRetorno },
            { label:'Saída',             val:saida,     set:setSaida },
          ].map(f => (
            <div key={f.label}>
              <div style={{ fontSize:10, color:'#64748b', marginBottom:3, fontWeight:600, textTransform:'uppercase' }}>{f.label}</div>
              <input type="time" value={f.val} onChange={e => f.set(e.target.value)}
                style={{ width:'100%', padding:'7px 8px', border:'1.5px solid #e2e8f0', borderRadius:7, fontSize:13, color:'#111', outline:'none' }}/>
            </div>
          ))}
        </div>
      )}

      <div style={{ display:'flex', gap:8 }}>
        <button onClick={onClose} style={{
          flex:1, padding:'9px', borderRadius:8, border:'1.5px solid #e2e8f0',
          background:'#f8fafc', cursor:'pointer', fontSize:13, color:'#475569', fontWeight:600,
        }}>Cancelar</button>
        <button onClick={() => onSave({ status, entrada, intervalo, retorno_intervalo:retorno, saida })} style={{
          flex:1, padding:'9px', borderRadius:8, border:'none',
          background:'#1d4ed8', color:'#fff', cursor:'pointer', fontSize:13, fontWeight:700,
        }}>✓ Salvar</button>
      </div>
    </div>
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
      await api.post('/team', { user_id: userId, ...form });
      setForm({ matricula:'', name:'', role:'', sector: userSector||'' });
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
      <div style={{ background:'#1a1a1a', borderRadius:12, padding:24, width:580, maxHeight:'80vh', overflowY:'auto', border:'1px solid #333' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <h3 style={{ fontWeight:700, fontSize:16 }}>Colaboradores do Time</h3>
          <button className="btn-icon" onClick={onClose}><X size={16}/></button>
        </div>

        {adding ? (
          <div style={{ background:'#111', borderRadius:8, padding:14, marginBottom:14, border:'1px solid #2a2a2a' }}>
            <div style={{ display:'grid', gridTemplateColumns:'110px 1fr', gap:8, marginBottom:8 }}>
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
  const scrollRef = useRef();
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

  const saveCell = async (payload) => {
    if (!openCell) return;
    const res = await api.post('/schedule/save', {
      user_id: userId,
      team_member_id: openCell.memberId,
      work_date: openCell.date,
      ...payload,
    });
    setEntries(prev => {
      const idx = prev.findIndex(e => e.team_member_id===openCell.memberId && e.work_date===openCell.date);
      if (idx >= 0) { const n=[...prev]; n[idx]=res.data; return n; }
      return [...prev, res.data];
    });
    setOpenCell(null);
  };

  /* scroll horizontal por botões */
  const scrollBy = (px) => scrollRef.current?.scrollBy({ left:px, behavior:'smooth' });

  const TH = (extra={}) => ({
    border:'1px solid #bbb', padding:'4px 3px', fontSize:10, fontWeight:700,
    textAlign:'center', whiteSpace:'nowrap', userSelect:'none', ...extra,
  });
  const TD = (extra={}) => ({
    border:'1px solid #ddd', padding:'2px 3px', fontSize:10,
    textAlign:'center', verticalAlign:'middle', ...extra,
  });

  const STICKY_MAT  = { position:'sticky', left:0,   zIndex:10, background:'#fff', boxShadow:'2px 0 4px rgba(0,0,0,.08)' };
  const STICKY_NAME = { position:'sticky', left:62,  zIndex:10, background:'#fff', boxShadow:'2px 0 4px rgba(0,0,0,.08)' };

  function renderDayCells(m, date, ri) {
    const entry  = getEntry(m.id, date);
    const isOpen = openCell?.memberId===m.id && openCell?.date===date;
    const rowBg  = ri%2===0 ? '#fff' : '#f8fafc';
    const isToday= date===today;
    const cellBg = isToday ? '#fffbeb' : rowBg;
    const openCell_ = () => setOpenCell(isOpen ? null : { memberId:m.id, date });

    if (entry && entry.status !== 'trabalha') {
      const st = STATUS[entry.status] || STATUS.dsr;
      return (
        <td key={date+'s'} colSpan={4} style={{ ...TD(), background:cellBg, cursor:'pointer' }} onClick={openCell_}>
          <span style={{ fontWeight:800, fontSize:10, color:st.color, background:st.bg, padding:'2px 7px', borderRadius:4 }}>
            {st.label}
          </span>
        </td>
      );
    }

    return ['entrada','intervalo','retorno_intervalo','saida'].map((field, fi) => {
      const val = entry?.[field];
      const bold = fi===0 || fi===3;
      return (
        <td key={date+fi} style={{ ...TD(), background:cellBg, cursor:'pointer', minWidth:52 }} onClick={openCell_}>
          {val
            ? <span style={{ fontWeight:bold?700:400, fontSize:10, color:bold?'#111':'#444' }}>{val}</span>
            : <span style={{ color:'#6b7280', fontSize:16, fontWeight:700 }}>+</span>
          }
        </td>
      );
    });
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

      {/* Card branco */}
      <div id="schedule-print" style={{ background:'#fff', color:'#111', borderRadius:10, border:'1px solid #d1d5db', boxShadow:'0 2px 12px rgba(0,0,0,.08)', overflow:'hidden' }}>

        {/* Cabeçalho info + seletor de semana */}
        <div style={{ padding:'12px 16px 10px', borderBottom:'2px solid #bbb', display:'flex', flexWrap:'wrap', gap:12, alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', gap:20, flexWrap:'wrap' }}>
            <span style={{ fontSize:12 }}><b>Departamento:</b> {profile?.sector||'—'}</span>
            <span style={{ fontSize:12 }}><b>Gestor:</b> {profile?.full_name||'—'}</span>
            <span style={{ fontSize:12 }}><b>Unidade:</b> {profile?.company||'—'}</span>
          </div>

          {/* Navegação de semana */}
          <div style={{ display:'flex', alignItems:'center', gap:6, background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 12px' }}>
            <button onClick={() => setWeekStart(addDaysUTC(weekStart,-7))}
              style={{ background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', padding:4, borderRadius:4, color:'#374151' }}>
              <ChevronLeft size={16}/>
            </button>
            <label style={{ display:'flex', alignItems:'center', gap:5, cursor:'pointer' }} title="Escolher semana">
              <Calendar size={13} color="#1d4ed8"/>
              <span style={{ fontSize:12, fontWeight:700, color:'#111' }}>{fmtBR(weekStart)}</span>
              <span style={{ fontSize:11, color:'#6b7280' }}>à</span>
              <span style={{ fontSize:12, fontWeight:700, color:'#111' }}>{fmtBR(weekEnd)}</span>
              <input type="date" value={weekStart} onChange={e => e.target.value && setWeekStart(getWeekStartFromDate(e.target.value))}
                style={{ position:'absolute', opacity:0, width:0, height:0, pointerEvents:'none' }}/>
            </label>
            <button onClick={() => setWeekStart(addDaysUTC(weekStart,7))}
              style={{ background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', padding:4, borderRadius:4, color:'#374151' }}>
              <ChevronRight size={16}/>
            </button>
          </div>
        </div>

        {/* Botões de scroll horizontal */}
        <div style={{ display:'flex', justifyContent:'flex-end', gap:6, padding:'6px 12px', background:'#f8fafc', borderBottom:'1px solid #e5e7eb' }}>
          <span style={{ fontSize:11, color:'#9ca3af', alignSelf:'center', marginRight:4 }}>Navegar:</span>
          <button onClick={() => scrollBy(-200)} style={{
            background:'#1d4ed8', color:'#fff', border:'none', borderRadius:6,
            padding:'5px 14px', cursor:'pointer', fontSize:12, fontWeight:700, display:'flex', alignItems:'center', gap:4,
          }}>
            <ChevronLeft size={14}/> Esquerda
          </button>
          <button onClick={() => scrollBy(200)} style={{
            background:'#1d4ed8', color:'#fff', border:'none', borderRadius:6,
            padding:'5px 14px', cursor:'pointer', fontSize:12, fontWeight:700, display:'flex', alignItems:'center', gap:4,
          }}>
            Direita <ChevronRight size={14}/>
          </button>
        </div>

        {/* Tabela com scroll */}
        <div id="schedule-scroll" ref={scrollRef} style={{
          overflowX:'auto', overflowY:'visible',
          scrollbarWidth:'thick', scrollbarColor:'#1d4ed8 #e2e8f0',
          paddingBottom:4,
        }}>
            <table style={{ borderCollapse:'collapse', minWidth:'max-content' }}>
              <thead>
                {/* Linha 1: dias */}
                <tr>
                  <th rowSpan={3} style={{ ...TH(), ...STICKY_MAT, background:'#0e7490', color:'#fff', fontSize:10, width:62 }}>Matr.</th>
                  <th rowSpan={3} style={{ ...TH(), ...STICKY_NAME, background:'#0e7490', color:'#fff', textAlign:'left', paddingLeft:8, fontSize:11, width:160 }}>Nome do Associado</th>
                  {weekDates.map((d,i) => (
                    <th key={d} colSpan={4} style={{ ...TH(), background: d===today?'#1d4ed8':'#1e40af', color:'#fff', fontSize:11 }}>
                      {DAY_NAME[i]}
                    </th>
                  ))}
                  <th rowSpan={3} style={{ ...TH(), background:'#c2410c', color:'#fff', fontSize:9 }}>Assinatura</th>
                  <th rowSpan={3} style={{ ...TH(), background:'#c2410c', color:'#fff', fontSize:9 }}>Data<br/>ciência</th>
                </tr>
                {/* Linha 2: datas */}
                <tr>
                  {weekDates.map(d => (
                    <th key={d} colSpan={4} style={{ ...TH(), background: d===today?'#2563eb':'#3b82f6', color:'#fff', fontSize:10 }}>
                      {fmtBR(d)}
                    </th>
                  ))}
                </tr>
                {/* Linha 3: sub-colunas */}
                <tr>
                  {weekDates.flatMap(d =>
                    ['Ent.','Int.','Ret.','Saí.'].map(sub => (
                      <th key={d+sub} style={{ ...TH(), background:'#dbeafe', color:'#1e3a8a', fontSize:9 }}>{sub}</th>
                    ))
                  )}
                </tr>
              </thead>

              <tbody>
                {members.length === 0 ? (
                  <tr>
                    <td colSpan={32} style={{ textAlign:'center', padding:'28px', color:'#888', fontSize:13 }}>
                      Clique em <b>Gerenciar time</b> para adicionar colaboradores.
                    </td>
                  </tr>
                ) : members.map((m, ri) => {
                  const rowBg = ri%2===0 ? '#fff' : '#f8fafc';
                  return (
                    <tr key={m.id} style={{ background:rowBg }}>
                      <td style={{ ...TD(), ...STICKY_MAT, background:rowBg, color:'#555', fontSize:10, fontWeight:500 }}>{m.matricula||'—'}</td>
                      <td style={{ ...TD(), ...STICKY_NAME, background:rowBg, textAlign:'left', paddingLeft:8, fontWeight:700, fontSize:11, color:'#111', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{m.name}</td>
                      {weekDates.flatMap(date => renderDayCells(m, date, ri))}
                      <td style={{ ...TD(), borderLeft:'2px solid #f97316' }}></td>
                      <td style={{ ...TD() }}></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
        </div>

        {/* Rodapé */}
        <div style={{ padding:'8px 14px', borderTop:'1px solid #e5e7eb', background:'#f9fafb', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
          <p style={{ fontSize:10, color:'#555', fontStyle:'italic', margin:0 }}>
            ** Escala deverá contemplar horário de entrega ao trabalho, início e retorno do descanso e saída do trabalho (Ex.: 8h/12h–13h/16h20)
          </p>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            {Object.entries(STATUS).map(([k,v]) => (
              <div key={k} style={{ display:'flex', alignItems:'center', gap:3, fontSize:10, color:'#555' }}>
                <span style={{ width:9, height:9, borderRadius:2, background:v.bg, border:`1px solid ${v.color}`, display:'inline-block' }}/>
                {v.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CSS impressão */}
      <style>{`
        @media print {
          body * { visibility:hidden !important; }
          #schedule-print, #schedule-print * { visibility:visible !important; }
          #schedule-print { position:fixed; top:0; left:0; width:100%; box-shadow:none !important; border:none !important; }
          #schedule-scroll { overflow:visible !important; }
        }
        #schedule-scroll::-webkit-scrollbar { height:14px; }
        #schedule-scroll::-webkit-scrollbar-track { background:#e2e8f0; border-radius:8px; }
        #schedule-scroll::-webkit-scrollbar-thumb { background:#1d4ed8; border-radius:8px; border:2px solid #e2e8f0; }
        #schedule-scroll::-webkit-scrollbar-thumb:hover { background:#1e40af; }
      `}</style>

      {openCell && (
        <>
          <div onClick={() => setOpenCell(null)}
            style={{ position:'fixed', inset:0, zIndex:9998, background:'rgba(0,0,0,.35)' }}/>
          <CellEditor
            entry={getEntry(openCell.memberId, openCell.date)}
            memberName={members.find(m => m.id===openCell.memberId)?.name || ''}
            dateStr={openCell.date}
            onSave={saveCell}
            onClose={() => setOpenCell(null)}
          />
        </>
      )}

      {showTeam && (
        <TeamModal userId={userId} userSector={profile?.sector}
          onClose={() => { setShowTeam(false); load(); }} />
      )}
    </>
  );
}
