import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Printer, Plus, Users, X, Save, Trash2, Calendar } from 'lucide-react';
import api from '../api';

/* ── Helpers ─────────────────────────────────────────────────────────────── */
const DAYS_PT  = ['domingo','segunda','terca','quarta','quinta','sexta','sabado'];
const DAY_NAME = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];

const STATUS = {
  trabalha: { label: 'Trabalha',  bg:'#e0f2fe', color:'#0369a1' },
  dsr:      { label: 'DSR',       bg:'#dbeafe', color:'#1d4ed8' },
  ferias:   { label: 'FÉRIAS',    bg:'#fef9c3', color:'#92400e' },
  feriado:  { label: 'FERIADO',   bg:'#f0fdf4', color:'#166534' },
  falta:    { label: 'FALTA',     bg:'#fee2e2', color:'#991b1b' },
  folga:    { label: 'FOLGA',     bg:'#f3e8ff', color:'#6b21a8' },
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

/* ── Editor de célula ────────────────────────────────────────────────────── */
function CellEditor({ entry, memberName, dateStr, onSave, onClose }) {
  const [status, setStatus] = useState(entry?.status || 'trabalha');
  const [entrada,  setEntrada]  = useState(entry?.entrada  || '');
  const [intervalo,setIntervalo]= useState(entry?.intervalo|| '');
  const [retorno,  setRetorno]  = useState(entry?.retorno_intervalo || '');
  const [saida,    setSaida]    = useState(entry?.saida    || '');
  const ref = useRef();

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  const handleSave = () => {
    onSave({ status, entrada, intervalo, retorno_intervalo: retorno, saida });
  };

  return (
    <div ref={ref} style={{
      position:'absolute', zIndex:400, top:'calc(100% + 2px)', left:'50%', transform:'translateX(-50%)',
      background:'#fff', border:'1px solid #cbd5e1', borderRadius:10, padding:16, minWidth:280,
      boxShadow:'0 12px 40px rgba(0,0,0,.2)', color:'#111',
    }}>
      <div style={{ fontSize:11, fontWeight:700, color:'#64748b', marginBottom:10 }}>
        {memberName} · {fmtBR(dateStr)}
      </div>

      {/* Status */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:12 }}>
        {Object.entries(STATUS).map(([k,v]) => (
          <button key={k} onClick={() => setStatus(k)} style={{
            padding:'4px 10px', borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer',
            background: status===k ? v.color : '#f1f5f9',
            color: status===k ? '#fff' : '#475569',
            border:`1.5px solid ${status===k ? v.color : '#e2e8f0'}`,
          }}>{v.label}</button>
        ))}
      </div>

      {/* Horários — só quando "trabalha" */}
      {status === 'trabalha' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12 }}>
          {[
            { label:'Entrada',              val: entrada,   set: setEntrada },
            { label:'Intervalo (saída)',    val: intervalo, set: setIntervalo },
            { label:'Retorno intervalo',   val: retorno,   set: setRetorno },
            { label:'Saída',               val: saida,     set: setSaida },
          ].map(f => (
            <div key={f.label}>
              <div style={{ fontSize:10, color:'#64748b', marginBottom:3, fontWeight:600 }}>{f.label.toUpperCase()}</div>
              <input type="time" value={f.val} onChange={e => f.set(e.target.value)}
                style={{ width:'100%', padding:'6px 8px', border:'1px solid #cbd5e1', borderRadius:6, fontSize:13, color:'#111' }}/>
            </div>
          ))}
        </div>
      )}

      <div style={{ display:'flex', gap:6 }}>
        <button onClick={onClose} style={{
          flex:1, padding:'7px', borderRadius:6, border:'1px solid #e2e8f0',
          background:'#f8fafc', cursor:'pointer', fontSize:12, color:'#475569'
        }}>Cancelar</button>
        <button onClick={handleSave} style={{
          flex:1, padding:'7px', borderRadius:6, border:'none',
          background:'#1d4ed8', color:'#fff', cursor:'pointer', fontSize:12, fontWeight:700
        }}>✓ Salvar</button>
      </div>
    </div>
  );
}

/* ── Modal Gerenciar Time ────────────────────────────────────────────────── */
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
                onChange={e => setForm(f => ({...f, matricula: e.target.value}))} style={{ fontSize:12 }}/>
              <input className="input" placeholder="NOME COMPLETO" value={form.name}
                onChange={e => setForm(f => ({...f, name: e.target.value.toUpperCase()}))}
                style={{ fontSize:12, textTransform:'uppercase' }}/>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
              <select className="select" value={form.role} onChange={e => setForm(f => ({...f, role: e.target.value}))} style={{ fontSize:12 }}>
                <option value="">Função...</option>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <input className="input" placeholder="Setor" value={form.sector}
                onChange={e => setForm(f => ({...f, sector: e.target.value}))} style={{ fontSize:12 }}/>
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
                  <th style={{ padding:'7px 10px', textAlign:'left', color:'var(--text-muted)', fontWeight:600 }}>Matrícula</th>
                  <th style={{ padding:'7px 10px', textAlign:'left', color:'var(--text-muted)', fontWeight:600 }}>Nome</th>
                  <th style={{ padding:'7px 10px', textAlign:'left', color:'var(--text-muted)', fontWeight:600 }}>Função</th>
                  <th></th>
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

/* ── Página principal ────────────────────────────────────────────────────── */
export default function NativeSchedule({ userId, profile }) {
  const [weekStart, setWeekStart] = useState(() => getWeekStartFromDate(todayISO()));
  const [members,   setMembers]   = useState([]);
  const [entries,   setEntries]   = useState([]);
  const [openCell,  setOpenCell]  = useState(null);
  const [showTeam,  setShowTeam]  = useState(false);
  const today = todayISO();

  // 7 datas da semana
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

  // Navegar semana pelo calendário
  const handleCalendar = (e) => {
    const picked = e.target.value; // YYYY-MM-DD
    if (picked) setWeekStart(getWeekStartFromDate(picked));
  };

  /* ── Estilos da tabela — fundo branco (impressão) ── */
  const TH = (extra={}) => ({
    border:'1px solid #999', padding:'4px 6px', fontSize:11, fontWeight:700,
    textAlign:'center', whiteSpace:'nowrap', ...extra
  });
  const TD = (extra={}) => ({
    border:'1px solid #ccc', padding:'3px 4px', fontSize:11,
    textAlign:'center', verticalAlign:'middle', position:'relative', ...extra
  });

  function renderCell(m, date) {
    const entry  = getEntry(m.id, date);
    const isOpen = openCell?.memberId===m.id && openCell?.date===date;
    const isToday= date===today;

    const cellBg = isToday ? '#fffbeb' : 'transparent';

    const content = () => {
      if (!entry) return <span style={{ color:'#ccc', fontSize:16 }}>+</span>;
      if (entry.status !== 'trabalha') {
        const st = STATUS[entry.status] || STATUS.dsr;
        return (
          <span style={{ fontWeight:800, fontSize:10, color:st.color, background:st.bg, padding:'2px 6px', borderRadius:4 }}>
            {st.label}
          </span>
        );
      }
      return (
        <div style={{ lineHeight:1.4, fontSize:10 }}>
          {entry.entrada   && <div style={{ fontWeight:700 }}>{entry.entrada}</div>}
          {entry.intervalo && <div style={{ color:'#555' }}>{entry.intervalo}</div>}
          {entry.retorno_intervalo && <div style={{ color:'#555' }}>{entry.retorno_intervalo}</div>}
          {entry.saida     && <div style={{ fontWeight:700 }}>{entry.saida}</div>}
        </div>
      );
    };

    return (
      <td key={date} style={{ ...TD(), background: cellBg, cursor:'pointer', minWidth:88, padding:0 }}>
        <div onClick={() => setOpenCell(isOpen ? null : { memberId:m.id, date })}
          style={{ padding:'4px 6px', minHeight:44, display:'flex', alignItems:'center', justifyContent:'center' }}>
          {content()}
        </div>
        {isOpen && (
          <CellEditor
            entry={entry}
            memberName={m.name}
            dateStr={date}
            onSave={saveCell}
            onClose={() => setOpenCell(null)}
          />
        )}
      </td>
    );
  }

  return (
    <>
      {/* Botões de ação */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <h1 className="page-title">Escala de Trabalho Semanal</h1>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-ghost" onClick={() => setShowTeam(true)}>
            <Users size={15}/> Gerenciar time
          </button>
          <button className="btn btn-ghost" onClick={() => window.print()}>
            <Printer size={15}/> Imprimir
          </button>
        </div>
      </div>

      {/* ── TABELA — fundo branco estilo planilha ── */}
      <div id="schedule-print" style={{ background:'#fff', color:'#111', borderRadius:10, overflow:'hidden', border:'1px solid #d1d5db', boxShadow:'0 2px 12px rgba(0,0,0,.08)' }}>

        {/* Cabeçalho */}
        <div style={{ padding:'16px 20px 12px', borderBottom:'2px solid #bbb' }}>
          <h2 style={{ textAlign:'center', fontWeight:800, fontSize:18, marginBottom:14, letterSpacing:.5 }}>
            ESCALA DE TRABALHO SEMANAL
          </h2>
          <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:16, alignItems:'start' }}>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <div style={{ fontSize:13 }}>
                <span style={{ fontWeight:600 }}>Departamento: </span>
                <strong>{profile?.sector || '—'}</strong>
              </div>
              <div style={{ fontSize:13 }}>
                <span style={{ fontWeight:600 }}>Gestor: </span>
                <strong>{profile?.full_name || '—'}</strong>
              </div>
              <div style={{ fontSize:13 }}>
                <span style={{ fontWeight:600 }}>Unidade: </span>
                <strong>{profile?.company || '—'}</strong>
              </div>
            </div>

            {/* Seletor de período */}
            <div style={{ border:'1px solid #999', borderRadius:6, padding:'8px 14px', textAlign:'center', minWidth:240 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#555', marginBottom:6 }}>Período (Domingo a Sábado)</div>
              <div style={{ display:'flex', alignItems:'center', gap:8, justifyContent:'center' }}>
                <button onClick={() => setWeekStart(addDaysUTC(weekStart,-7))}
                  style={{ background:'none', border:'1px solid #ccc', borderRadius:4, cursor:'pointer', padding:'2px 6px', lineHeight:1 }}>
                  <ChevronLeft size={14} color="#444"/>
                </button>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <label style={{ position:'relative', cursor:'pointer' }} title="Escolher data">
                    <Calendar size={14} color="#1d4ed8" style={{ verticalAlign:'middle', marginRight:4 }}/>
                    <input type="date" value={weekStart} onChange={handleCalendar}
                      style={{ position:'absolute', opacity:0, width:0, height:0, pointerEvents:'none' }}/>
                  </label>
                  <span style={{ fontWeight:800, fontSize:14 }}>{fmtBR(weekStart)}</span>
                  <span style={{ fontWeight:600, color:'#555' }}>À</span>
                  <span style={{ fontWeight:800, fontSize:14 }}>{fmtBR(weekEnd)}</span>
                </div>
                <button onClick={() => setWeekStart(addDaysUTC(weekStart,7))}
                  style={{ background:'none', border:'1px solid #ccc', borderRadius:4, cursor:'pointer', padding:'2px 6px', lineHeight:1 }}>
                  <ChevronRight size={14} color="#444"/>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Tabela */}
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'auto' }}>
            <thead>
              {/* Linha 1: grupos de dia */}
              <tr>
                <th rowSpan={3} style={{ ...TH(), background:'#0e7490', color:'#fff', width:80 }}>Matrícula</th>
                <th rowSpan={3} style={{ ...TH(), background:'#0e7490', color:'#fff', minWidth:170, textAlign:'left', paddingLeft:10 }}>Nome do Associado</th>
                {weekDates.map((d, i) => (
                  <th key={d} colSpan={4} style={{ ...TH(), background: d===today ? '#1d4ed8' : '#1e40af', color:'#fff', minWidth:200 }}>
                    {DAY_NAME[i]}
                  </th>
                ))}
                <th rowSpan={3} style={{ ...TH(), background:'#c2410c', color:'#fff', width:72 }}>Assinatura</th>
                <th rowSpan={3} style={{ ...TH(), background:'#c2410c', color:'#fff', width:72 }}>Data ciência</th>
              </tr>
              {/* Linha 2: datas */}
              <tr>
                {weekDates.map(d => (
                  <th key={d} colSpan={4} style={{ ...TH(), background: d===today ? '#2563eb' : '#2563eb99', color:'#fff', fontSize:10 }}>
                    {fmtBR(d)}
                  </th>
                ))}
              </tr>
              {/* Linha 3: sub-colunas */}
              <tr>
                {weekDates.map(d => (
                  ['Entrada','Intervalo','Ret. Intervalo','Saída'].map(sub => (
                    <th key={d+sub} style={{ ...TH(), background:'#dbeafe', color:'#1e3a8a', fontSize:9, minWidth:48 }}>
                      {sub}
                    </th>
                  ))
                ))}
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td colSpan={30} style={{ textAlign:'center', padding:'32px', color:'#888', fontSize:13 }}>
                    Clique em <strong>Gerenciar time</strong> para adicionar colaboradores.
                  </td>
                </tr>
              ) : members.map((m, ri) => {
                const rowBg = ri%2===0 ? '#fff' : '#f8fafc';
                return (
                  <tr key={m.id} style={{ background: rowBg }}>
                    <td style={{ ...TD(), color:'#555', fontWeight:500 }}>{m.matricula||'—'}</td>
                    <td style={{ ...TD(), textAlign:'left', paddingLeft:10, fontWeight:600, fontSize:12 }}>{m.name}</td>
                    {weekDates.map(date => {
                      const entry  = getEntry(m.id, date);
                      const isOpen = openCell?.memberId===m.id && openCell?.date===date;
                      const isToday= date===today;
                      const cellBg = isToday ? '#fffbeb' : rowBg;

                      if (entry && entry.status !== 'trabalha') {
                        const st = STATUS[entry.status] || STATUS.dsr;
                        return (
                          <td key={date} colSpan={4} style={{ ...TD(), background: cellBg, cursor:'pointer', position:'relative' }}
                            onClick={() => setOpenCell(isOpen ? null : { memberId:m.id, date })}>
                            <span style={{ fontWeight:800, fontSize:11, color:st.color, background:st.bg, padding:'3px 8px', borderRadius:4 }}>
                              {st.label}
                            </span>
                            {isOpen && (
                              <CellEditor entry={entry} memberName={m.name} dateStr={date}
                                onSave={saveCell} onClose={() => setOpenCell(null)}/>
                            )}
                          </td>
                        );
                      }

                      const fields = [
                        entry?.entrada, entry?.intervalo, entry?.retorno_intervalo, entry?.saida
                      ];
                      return fields.map((val, fi) => {
                        const isFirst = fi === 0;
                        return (
                          <td key={date+fi} style={{ ...TD(), background: cellBg, cursor:'pointer', minWidth:50, position: isFirst ? 'relative' : undefined }}
                            onClick={() => setOpenCell(isOpen ? null : { memberId:m.id, date })}>
                            {val
                              ? <span style={{ fontWeight: (fi===0||fi===3) ? 700 : 400, fontSize:11 }}>{val}</span>
                              : <span style={{ color:'#ddd', fontSize:14 }}>+</span>
                            }
                            {isFirst && isOpen && (
                              <CellEditor entry={entry} memberName={m.name} dateStr={date}
                                onSave={saveCell} onClose={() => setOpenCell(null)}/>
                            )}
                          </td>
                        );
                      });
                    })}
                    <td style={{ ...TD(), borderLeft:'2px solid #f97316' }}></td>
                    <td style={{ ...TD() }}></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Rodapé / nota */}
        <div style={{ padding:'10px 16px', borderTop:'1px solid #e5e7eb', background:'#f9fafb', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
          <p style={{ fontSize:11, color:'#555', fontStyle:'italic', margin:0 }}>
            ** Escala deverá contemplar horário de entrega ao trabalho, início e retorno do descanso e saída do trabalho (Ex.: 8h/12h–13h/16h20)
          </p>
          <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
            {Object.entries(STATUS).map(([k,v]) => (
              <div key={k} style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, color:'#555' }}>
                <span style={{ width:10, height:10, borderRadius:2, background:v.bg, border:`1px solid ${v.color}`, display:'inline-block' }}/>
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
        }
      `}</style>

      {showTeam && (
        <TeamModal userId={userId} userSector={profile?.sector}
          onClose={() => { setShowTeam(false); load(); }} />
      )}
    </>
  );
}
