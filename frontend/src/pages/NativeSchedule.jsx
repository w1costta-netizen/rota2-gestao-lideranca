import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Printer, Plus, Users, X, Save, Pencil, Trash2 } from 'lucide-react';
import api from '../api';

/* ── Constantes ──────────────────────────────────────────────────────────── */
const DAYS_PT = ['domingo','segunda','terca','quarta','quinta','sexta','sabado'];
const DAY_SHORT = ['DOM','SEG','TER','QUA','QUI','SEX','SÁB'];

const STATUS = {
  trabalha: { label: null,      bg: 'transparent', color: '#111' },
  dsr:      { label: 'DSR',     bg: '#e8f0fe',     color: '#1a56db' },
  ferias:   { label: 'FÉRIAS',  bg: '#fef9c3',     color: '#854d0e' },
  falta:    { label: 'FALTA',   bg: '#fee2e2',     color: '#991b1b' },
  folga:    { label: 'FOLGA',   bg: '#dcfce7',     color: '#166534' },
};

const ROLES = ['Operador(a) de Caixa','Atendente','Repositor(a)','Supervisor(a)','Coordenador(a)','Auxiliar','Outro'];

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function getWeekStart(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split('T')[0];
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
}
function fmtBR(dateStr) {
  const [y,m,d] = dateStr.split('-');
  return `${d}/${m}/${String(y).slice(-2)}`;
}
function todayStr() { return new Date().toISOString().split('T')[0]; }

/* ── CellPopover — editor inline ─────────────────────────────────────────── */
function CellPopover({ entry, onSave, onClose }) {
  const [status, setStatus] = useState(entry?.status || 'trabalha');
  const [start,  setStart]  = useState(entry?.start_time || '08:00');
  const [end,    setEnd]    = useState(entry?.end_time   || '16:20');
  const ref = useRef();

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div ref={ref} style={{
      position:'absolute', zIndex:300, top:'calc(100% + 4px)', left:'50%', transform:'translateX(-50%)',
      background:'#fff', border:'1px solid #d1d5db', borderRadius:10, padding:14, minWidth:210,
      boxShadow:'0 8px 32px rgba(0,0,0,.18)', color:'#111',
    }}>
      <div style={{ fontSize:11, fontWeight:700, color:'#6b7280', marginBottom:8 }}>TIPO DE DIA</div>
      <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:10 }}>
        {Object.entries(STATUS).map(([k,v]) => (
          <button key={k} onClick={() => setStatus(k)} style={{
            padding:'3px 9px', borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer',
            background: status===k ? (k==='trabalha'?'#1a56db':v.bg) : '#f3f4f6',
            color: status===k ? (k==='trabalha'?'#fff':v.color) : '#374151',
            border:`1.5px solid ${status===k?(k==='trabalha'?'#1a56db':v.color):'#e5e7eb'}`,
          }}>{k==='trabalha'?'Trabalha':v.label}</button>
        ))}
      </div>
      {status==='trabalha' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
          <div>
            <div style={{ fontSize:10, color:'#6b7280', marginBottom:3 }}>ENTRADA</div>
            <input type="time" value={start} onChange={e=>setStart(e.target.value)}
              style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:6, fontSize:13 }}/>
          </div>
          <div>
            <div style={{ fontSize:10, color:'#6b7280', marginBottom:3 }}>SAÍDA</div>
            <input type="time" value={end} onChange={e=>setEnd(e.target.value)}
              style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:6, fontSize:13 }}/>
          </div>
        </div>
      )}
      <div style={{ display:'flex', gap:6 }}>
        <button onClick={onClose} style={{ flex:1, padding:'6px', borderRadius:6, border:'1px solid #d1d5db', background:'#f9fafb', cursor:'pointer', fontSize:12 }}>Cancelar</button>
        <button onClick={() => onSave({ status, start_time: status==='trabalha'?start:null, end_time: status==='trabalha'?end:null })}
          style={{ flex:1, padding:'6px', borderRadius:6, border:'none', background:'#1a56db', color:'#fff', cursor:'pointer', fontSize:12, fontWeight:700 }}>
          Salvar
        </button>
      </div>
    </div>
  );
}

/* ── Modal de colaboradores ──────────────────────────────────────────────── */
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

  const remove = async (id) => {
    if (!confirm('Excluir colaborador?')) return;
    await api.delete(`/team/${id}`);
    load();
  };

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:500, background:'rgba(0,0,0,.7)',
      display:'flex', alignItems:'center', justifyContent:'center',
    }} onClick={onClose}>
      <div style={{ background:'#1a1a1a', borderRadius:12, padding:24, width:560, maxHeight:'80vh', overflowY:'auto', border:'1px solid #2a2a2a' }}
        onClick={e=>e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <h3 style={{ fontWeight:700, fontSize:16 }}>Colaboradores do Time</h3>
          <button className="btn-icon" onClick={onClose}><X size={16}/></button>
        </div>

        {/* Adicionar */}
        {adding ? (
          <div style={{ background:'#111', borderRadius:8, padding:14, marginBottom:14, border:'1px solid #2a2a2a' }}>
            <div style={{ display:'grid', gridTemplateColumns:'100px 1fr', gap:8, marginBottom:8 }}>
              <input className="input" placeholder="Matrícula" value={form.matricula} onChange={e=>setForm(f=>({...f,matricula:e.target.value}))} style={{ fontSize:12 }}/>
              <input className="input" placeholder="NOME COMPLETO" value={form.name}
                onChange={e=>setForm(f=>({...f,name:e.target.value.toUpperCase()}))} style={{ fontSize:12, textTransform:'uppercase' }}/>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
              <select className="select" value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))} style={{ fontSize:12 }}>
                <option value="">Função...</option>
                {ROLES.map(r=><option key={r} value={r}>{r}</option>)}
              </select>
              <input className="input" placeholder="Setor" value={form.sector} onChange={e=>setForm(f=>({...f,sector:e.target.value}))} style={{ fontSize:12 }}/>
            </div>
            <div style={{ display:'flex', gap:6 }}>
              <button className="btn btn-ghost btn-sm" onClick={()=>setAdding(false)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
                <Save size={12}/> {saving?'Salvando...':'Salvar'}
              </button>
            </div>
          </div>
        ) : (
          <button className="btn btn-primary btn-sm" style={{ marginBottom:14 }} onClick={()=>setAdding(true)}>
            <Plus size={13}/> Adicionar colaborador
          </button>
        )}

        {/* Lista */}
        {members.length === 0
          ? <p style={{ color:'var(--text-muted)', fontSize:13, textAlign:'center', padding:'20px 0' }}>Nenhum colaborador cadastrado.</p>
          : <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ background:'#111', borderBottom:'1px solid #2a2a2a' }}>
                  <th style={{ padding:'6px 10px', textAlign:'left', color:'var(--text-muted)', fontWeight:600 }}>Matrícula</th>
                  <th style={{ padding:'6px 10px', textAlign:'left', color:'var(--text-muted)', fontWeight:600 }}>Nome</th>
                  <th style={{ padding:'6px 10px', textAlign:'left', color:'var(--text-muted)', fontWeight:600 }}>Função</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.id} style={{ borderBottom:'1px solid #2a2a2a' }}>
                    <td style={{ padding:'7px 10px', color:'var(--text-muted)' }}>{m.matricula||'—'}</td>
                    <td style={{ padding:'7px 10px', fontWeight:600 }}>{m.name}</td>
                    <td style={{ padding:'7px 10px', color:'var(--text-muted)' }}>{m.role||'—'}</td>
                    <td style={{ padding:'7px 10px', textAlign:'right' }}>
                      <button className="btn-icon danger" onClick={()=>remove(m.id)}><Trash2 size={13}/></button>
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

/* ── Componente principal ─────────────────────────────────────────────────── */
export default function NativeSchedule({ userId, profile }) {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(todayStr()));
  const [members,   setMembers]   = useState([]);
  const [entries,   setEntries]   = useState([]);
  const [openCell,  setOpenCell]  = useState(null); // { memberId, date }
  const [showTeam,  setShowTeam]  = useState(false);
  const today = todayStr();

  const weekDates = Array.from({ length:7 }, (_, i) => addDays(weekStart, i));
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
      if (idx>=0) { const n=[...prev]; n[idx]=res.data; return n; }
      return [...prev, res.data];
    });
    setOpenCell(null);
  };

  // Cores do cabeçalho iguais ao modelo
  const thBase = { fontSize:11, fontWeight:700, padding:'6px 8px', border:'1px solid #bbb', textAlign:'center', whiteSpace:'nowrap' };
  const tdBase = { fontSize:11, padding:'4px 6px', border:'1px solid #ccc', textAlign:'center', verticalAlign:'middle', height:36, position:'relative' };

  return (
    <>
      {/* ── Cabeçalho da página ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div>
          <h1 className="page-title">Escala de Trabalho Semanal</h1>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-ghost" onClick={() => setShowTeam(true)}>
            <Users size={15}/> Gerenciar time
          </button>
          <button className="btn btn-ghost" onClick={() => window.print()}>
            <Printer size={15}/> Imprimir
          </button>
        </div>
      </div>

      {/* ── Painel de escala — fundo branco p/ impressão ── */}
      <div id="schedule-print" style={{ background:'#fff', color:'#111', borderRadius:10, overflow:'hidden', border:'1px solid #d1d5db', boxShadow:'0 2px 12px rgba(0,0,0,.08)' }}>

        {/* Cabeçalho estilo planilha */}
        <div style={{ padding:'16px 20px 12px', borderBottom:'2px solid #ccc' }}>
          <h2 style={{ textAlign:'center', fontWeight:800, fontSize:18, marginBottom:12, color:'#111', letterSpacing:.5 }}>
            ESCALA DE TRABALHO SEMANAL
          </h2>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4 }}>
            <div style={{ fontSize:13 }}>
              <span style={{ fontWeight:600 }}>Unidade:</span>{' '}
              <span style={{ fontWeight:700 }}>{profile?.company || '—'}</span>
            </div>
            <div style={{ fontSize:13, textAlign:'right', display:'flex', flexDirection:'column', alignItems:'flex-end', gap:2 }}>
              <div style={{ border:'1px solid #999', borderRadius:4, padding:'3px 12px', fontWeight:600, fontSize:12 }}>
                Período (Domingo a Sábado)
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                {/* Navegação de semana */}
                <button onClick={()=>setWeekStart(addDays(weekStart,-7))}
                  style={{ background:'none', border:'1px solid #ccc', borderRadius:4, cursor:'pointer', padding:'2px 6px' }}>
                  <ChevronLeft size={14} color="#444"/>
                </button>
                <span style={{ fontWeight:800, fontSize:15 }}>{fmtBR(weekStart)}</span>
                <span style={{ fontWeight:700 }}>À</span>
                <span style={{ fontWeight:800, fontSize:15 }}>{fmtBR(weekEnd)}</span>
                <button onClick={()=>setWeekStart(addDays(weekStart,7))}
                  style={{ background:'none', border:'1px solid #ccc', borderRadius:4, cursor:'pointer', padding:'2px 6px' }}>
                  <ChevronRight size={14} color="#444"/>
                </button>
              </div>
            </div>
            <div style={{ fontSize:13 }}>
              <span style={{ fontWeight:600 }}>Departamento:</span>{' '}
              <span style={{ fontWeight:700 }}>{profile?.sector || '—'}</span>
            </div>
            <div style={{ fontSize:13, textAlign:'right' }}>
              <span style={{ fontWeight:600 }}>Gestor:</span>{' '}
              <span style={{ fontWeight:700 }}>{profile?.full_name || '—'}</span>
            </div>
          </div>
        </div>

        {/* Tabela principal */}
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
            <thead>
              {/* Linha de datas */}
              <tr>
                <th style={{ ...thBase, background:'#0e7490', color:'#fff', width:80 }}>Matrícula</th>
                <th style={{ ...thBase, background:'#0e7490', color:'#fff', minWidth:180, textAlign:'left', paddingLeft:10 }}>Nome do Associado</th>
                {weekDates.map((d, i) => {
                  const isToday = d === today;
                  return (
                    <th key={d} style={{ ...thBase, background: isToday ? '#1d4ed8' : '#1e40af', color:'#fff', minWidth:88 }}>
                      <div style={{ fontWeight:800 }}>{fmtBR(d)}</div>
                      <div style={{ fontWeight:600, opacity:.9 }}>{DAY_SHORT[i]}</div>
                    </th>
                  );
                })}
                <th style={{ ...thBase, background:'#c2410c', color:'#fff', width:80 }}>Assinatura</th>
                <th style={{ ...thBase, background:'#c2410c', color:'#fff', width:72 }}>Data ciência</th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign:'center', padding:'32px', color:'#888', fontSize:13 }}>
                    Clique em <strong>Gerenciar time</strong> para adicionar colaboradores.
                  </td>
                </tr>
              ) : members.map((m, ri) => (
                <tr key={m.id} style={{ background: ri%2===0 ? '#fff' : '#f9fafb' }}>
                  <td style={{ ...tdBase, color:'#555', fontWeight:500 }}>{m.matricula||'—'}</td>
                  <td style={{ ...tdBase, textAlign:'left', paddingLeft:10, fontWeight:600, fontSize:12 }}>{m.name}</td>

                  {weekDates.map((d, i) => {
                    const entry   = getEntry(m.id, d);
                    const isOpen  = openCell?.memberId===m.id && openCell?.date===d;
                    const isToday = d === today;
                    const st      = entry ? (STATUS[entry.status] || STATUS.trabalha) : null;

                    return (
                      <td key={d} style={{ ...tdBase, background: isToday ? '#eff6ff' : (ri%2===0?'#fff':'#f9fafb'), cursor:'pointer', padding:0 }}>
                        <div
                          onClick={() => setOpenCell(isOpen ? null : { memberId:m.id, date:d })}
                          style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', padding:'4px', minHeight:36 }}
                        >
                          {entry ? (
                            entry.status==='trabalha' ? (
                              <div style={{ textAlign:'center', lineHeight:1.3 }}>
                                <div style={{ fontWeight:700, fontSize:11 }}>{entry.start_time}</div>
                                <div style={{ color:'#555', fontSize:10 }}>{entry.end_time}</div>
                              </div>
                            ) : (
                              <span style={{ fontWeight:800, fontSize:10, color:st.color, background:st.bg, padding:'2px 6px', borderRadius:4 }}>
                                {st.label}
                              </span>
                            )
                          ) : (
                            <span style={{ color:'#ddd', fontSize:16 }}>+</span>
                          )}
                        </div>
                        {isOpen && (
                          <CellPopover
                            entry={entry}
                            onSave={saveCell}
                            onClose={() => setOpenCell(null)}
                          />
                        )}
                      </td>
                    );
                  })}

                  {/* Assinatura e Data ciência — campos em branco para impressão */}
                  <td style={{ ...tdBase, borderLeft:'2px solid #f97316' }}></td>
                  <td style={{ ...tdBase }}></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legenda */}
        <div style={{ padding:'8px 16px', borderTop:'1px solid #e5e7eb', display:'flex', gap:16, flexWrap:'wrap', background:'#f9fafb' }}>
          {Object.entries(STATUS).map(([k,v]) => (
            <div key={k} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'#555' }}>
              <span style={{ width:10, height:10, borderRadius:2, background: k==='trabalha'?'#1a56db':v.bg, border:`1px solid ${k==='trabalha'?'#1a56db':v.color}`, display:'inline-block' }}/>
              {k==='trabalha'?'Horário':v.label}
            </div>
          ))}
          <span style={{ marginLeft:'auto', fontSize:11, color:'#999' }}>Clique em uma célula para preencher</span>
        </div>
      </div>

      {/* CSS de impressão */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #schedule-print, #schedule-print * { visibility: visible !important; }
          #schedule-print { position: fixed; top:0; left:0; width:100%; }
        }
      `}</style>

      {/* Modal time */}
      {showTeam && (
        <TeamModal userId={userId} userSector={profile?.sector} onClose={() => { setShowTeam(false); load(); }} />
      )}
    </>
  );
}
