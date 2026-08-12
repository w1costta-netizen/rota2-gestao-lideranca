import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Plus, Pencil, Trash2, CheckCircle, Circle, Clock, ClipboardList, MessageSquare, Send, ChevronDown, ChevronUp, RefreshCw, Tag, CalendarDays, List, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../api';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';
import Avatar from '../components/Avatar';

const EMPTY = { title: '', description: '', assigned_to: '', due_date: '', due_time: '', priority: 'normal', recorrencia: 'nenhuma', tags: [], lembrete_minutos: null };

const STATUS_LABEL = { pendente: 'Pendente', em_andamento: 'Em andamento', concluida: 'Concluída' };
const STATUS_COLOR = { pendente: '#f59e0b', em_andamento: '#6366f1', concluida: '#10b981' };
const PRIORITY_LABEL = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta' };
const PRIORITY_COLOR = { baixa: '#6b7280', normal: '#6366f1', alta: '#ef4444' };
const RECORRENCIA_LABEL = { nenhuma: 'Não repete', diaria: 'Diária', semanal: 'Semanal', quinzenal: 'Quinzenal', mensal: 'Mensal' };

const TAGS_DISPONIVEIS = ['urgente','estoque','cliente','reunião','treinamento','operação','limpeza','segurança','financeiro','fornecedor'];
const TAG_COLOR = { urgente:'#ef4444', estoque:'#f59e0b', cliente:'#10b981', reunião:'#6366f1', treinamento:'#8b5cf6',
  operação:'#06b6d4', limpeza:'#14b8a6', segurança:'#f97316', financeiro:'#84cc16', fornecedor:'#ec4899' };

// ─── Helpers de data ─────────────────────────────────
function toYMD(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function addDaysTo(d, n) { const r = new Date(d); r.setDate(r.getDate()+n); return r; }
function getMonday(d) {
  const date = new Date(d); date.setHours(0,0,0,0);
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  return date;
}
function dayLabel(ymd) {
  const t = toYMD(new Date());
  const am = toYMD(addDaysTo(new Date(), 1));
  if (ymd === t)  return 'Hoje';
  if (ymd === am) return 'Amanhã';
  const [y,m,d] = ymd.split('-').map(Number);
  const dt = new Date(y, m-1, d);
  const MONTHS = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  return `${d} ${MONTHS[dt.getMonth()]}.`;
}

function formatDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}
function isOverdue(due_date, due_time, status) {
  if (!due_date || status === 'concluida') return false;
  const now = new Date();
  const [y, mo, d] = due_date.split('-').map(Number);
  if (due_time) {
    const [h, min] = due_time.split(':').map(Number);
    return now > new Date(y, mo-1, d, h, min, 0);
  }
  return now > new Date(y, mo-1, d, 23, 59, 59);
}

// ─── Componentes utilitários ─────────────────────────
function TagChip({ tag, onRemove, small }) {
  const color = TAG_COLOR[tag] || '#6b7280';
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:3,
      fontSize: small ? 10 : 11, fontWeight:700,
      padding: small ? '2px 7px' : '3px 9px',
      borderRadius:999, background: color+'22', color, border:`1px solid ${color}44`,
    }}>
      {tag}
      {onRemove && (
        <button onClick={onRemove} style={{ background:'none', border:'none', cursor:'pointer', color, padding:0, lineHeight:1, fontSize:12 }}>×</button>
      )}
    </span>
  );
}

function CommentSection({ taskId, userId }) {
  const toast = useToast();
  const [comments, setComments]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [loaded, setLoaded]       = useState(false);
  const [open, setOpen]           = useState(false);
  const [text, setText]           = useState('');
  const [sending, setSending]     = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText]   = useState('');

  const load = useCallback(async () => {
    if (loaded) return;
    setLoading(true);
    try {
      const r = await api.get(`/tarefas/${taskId}/comentarios?requester_id=${userId}`);
      setComments(Array.isArray(r.data) ? r.data : []);
      setLoaded(true);
    } catch { toast('Erro ao carregar comentários', 'error'); }
    finally { setLoading(false); }
  }, [taskId, userId, loaded]);

  const toggle = () => { if (!open) load(); setOpen(o => !o); };

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      const r = await api.post(`/tarefas/${taskId}/comentarios`, { requester_id: userId, text: text.trim() });
      setComments(c => [...c, r.data]);
      setText('');
    } catch { toast('Erro ao enviar', 'error'); }
    finally { setSending(false); }
  };

  const startEdit = (c) => { setEditingId(c.id); setEditText(c.text); };

  const saveEdit = async (id) => {
    if (!editText.trim()) return;
    try {
      const r = await api.put(`/tarefas/comentarios/${id}`, { requester_id: userId, text: editText.trim() });
      setComments(cs => cs.map(c => c.id === id ? r.data : c));
      setEditingId(null);
      toast('Atualização editada');
    } catch { toast('Erro ao editar', 'error'); }
  };

  const remove = async (id) => {
    if (!window.confirm('Apagar esta atualização?')) return;
    try {
      await api.delete(`/tarefas/comentarios/${id}?requester_id=${userId}`);
      setComments(cs => cs.filter(c => c.id !== id));
      toast('Atualização apagada');
    } catch { toast('Erro ao apagar', 'error'); }
  };

  return (
    <div style={{ marginTop:10, borderTop:'1px solid var(--border)', paddingTop:8 }}>
      <button onClick={toggle} style={{ background:'none', border:'none', cursor:'pointer',
        display:'flex', alignItems:'center', gap:5, fontSize:12, color:'var(--text-muted)', padding:0 }}>
        <MessageSquare size={13}/>
        {open ? 'Ocultar atualizações' : `Atualizações${loaded && comments.length ? ` (${comments.length})` : ''}`}
        {open ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
      </button>
      {open && (
        <div style={{ marginTop:8 }}>
          {loading && <div style={{ fontSize:12, color:'var(--text-muted)' }}>Carregando...</div>}
          {!loading && comments.length === 0 && (
            <div style={{ fontSize:12, color:'var(--text-muted)', fontStyle:'italic' }}>Nenhuma atualização ainda.</div>
          )}
          <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:8 }}>
            {comments.map(c => (
              <div key={c.id} style={{ background:'var(--bg)', borderRadius:8, padding:'8px 10px', border:'1px solid var(--border)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:2 }}>
                  <span style={{ fontSize:11, fontWeight:700, color:'var(--primary)' }}>{c.author?.full_name || 'Usuário'}</span>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ fontSize:10, color:'var(--text-muted)' }}>
                      {c.created_at ? new Date(c.created_at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : ''}
                    </span>
                    {c.user_id === userId && editingId !== c.id && (
                      <>
                        <button onClick={() => startEdit(c)} title="Editar"
                          style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:0, lineHeight:1 }}>
                          <Pencil size={11}/>
                        </button>
                        <button onClick={() => remove(c.id)} title="Apagar"
                          style={{ background:'none', border:'none', cursor:'pointer', color:'#ef4444', padding:0, lineHeight:1 }}>
                          <Trash2 size={11}/>
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {editingId === c.id ? (
                  <div style={{ display:'flex', gap:6, marginTop:4 }}>
                    <textarea value={editText} onChange={e => setEditText(e.target.value)}
                      rows={2} autoFocus
                      style={{ flex:1, padding:'6px 8px', borderRadius:6, border:'1px solid var(--primary)',
                        background:'var(--bg)', color:'var(--text)', fontSize:12,
                        resize:'none', fontFamily:'inherit', lineHeight:'1.4' }}/>
                    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                      <button onClick={() => saveEdit(c.id)}
                        style={{ background:'var(--primary)', border:'none', borderRadius:6, padding:'5px 8px',
                          cursor:'pointer', color:'#fff', fontSize:11, fontWeight:700 }}>✓</button>
                      <button onClick={() => setEditingId(null)}
                        style={{ background:'none', border:'1px solid var(--border)', borderRadius:6, padding:'5px 8px',
                          cursor:'pointer', color:'var(--text-muted)', fontSize:11 }}>✕</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize:12, color:'var(--text)', lineHeight:1.4, whiteSpace:'pre-wrap' }}>{c.text}</div>
                )}
              </div>
            ))}
          </div>
          <div style={{ display:'flex', gap:6 }}>
            <textarea value={text} onChange={e => setText(e.target.value)}
              placeholder="Adicionar atualização..."
              rows={1}
              style={{ flex:1, padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)',
                background:'var(--bg)', color:'var(--text)', fontSize:12,
                resize:'none', overflowY:'hidden', lineHeight:'1.4',
                fontFamily:'inherit' }}
              onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}/>
            <button onClick={send} disabled={sending || !text.trim()} style={{
              background:'var(--primary)', border:'none', borderRadius:8, padding:'7px 10px',
              cursor:'pointer', color:'#fff', display:'flex', alignItems:'center',
              opacity: sending || !text.trim() ? 0.5 : 1 }}>
              <Send size={13}/>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────
export default function Tarefas({ userId, profile, setPage }) {
  const toast   = useToast();
  const isAdmin = ['admin','supervisor','master'].includes(profile?.access_level);
  const [list, setList]         = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(false);
  const [editing, setEditing]   = useState(null);
  const [form, setForm]         = useState(EMPTY);
  const [lideresSel, setLideresSel]     = useState([]);
  const [saving, setSaving]     = useState(false);
  const [filter, setFilter]     = useState('hoje');
  const [filterResp, setFilterResp] = useState('');
  const [filterTag,  setFilterTag]  = useState('');
  const [viewMode, setViewMode] = useState('lista');       // 'lista' | 'calendario'
  const [calWeekOffset, setCalWeekOffset] = useState(0);  // semanas a partir da atual
  const [selectedCalDay, setSelectedCalDay] = useState(() =>
    new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }));
  const loadingRef = useRef(false);
  const company = profile?.company || '';

  const load = useCallback(() => {
    if (!userId) return;
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    const q = company ? `&company=${encodeURIComponent(company)}` : '';
    api.get(`/tarefas?requester_id=${userId}${q}`)
      .then(r => setList(Array.isArray(r.data) ? r.data : []))
      .catch(() => toast('Erro ao carregar tarefas', 'error'))
      .finally(() => { setLoading(false); loadingRef.current = false; });
  }, [userId, company]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (isAdmin && userId) {
      const q = company ? `&company=${encodeURIComponent(company)}` : '';
      api.get(`/admin/users?requester_id=${userId}${q}`).then(r => setProfiles(r.data || [])).catch(() => {});
    }
  }, [userId, isAdmin, company]);

  const openNew  = () => { setEditing(null); setForm({ ...EMPTY, assigned_to: userId }); setLideresSel([userId]); setModal(true); };
  const openEdit = (t) => {
    setEditing(t.id);
    setForm({
      title: t.title, description: t.description, assigned_to: t.assigned_to,
      due_date: t.due_date || '', due_time: t.due_time || '',
      priority: t.priority, recorrencia: t.recorrencia || 'nenhuma',
      tags: t.tags || [], lembrete_minutos: t.lembrete_minutos ?? null,
    });
    setLideresSel([]);
    setModal(true);
  };

  const toggleLider = (id) => setLideresSel(l => l.includes(id) ? l.filter(x => x !== id) : [...l, id]);

  const canEdit = (t) => isAdmin || (t.created_by === userId && t.assigned_to === userId);

  const save = async () => {
    if (!form.title.trim()) return toast('Preencha o título');
    if (!editing && isAdmin && lideresSel.length === 0) return toast('Selecione ao menos um responsável');
    if (editing && isAdmin && !form.assigned_to) return toast('Selecione o responsável');
    setSaving(true);
    try {
      if (editing) {
        const updated = await api.put(`/tarefas/${editing}`, { requester_id: userId, ...form });
        setList(l => l.map(t => t.id === editing ? updated.data : t));
        toast('Tarefa atualizada!');
      } else if (isAdmin) {
        const criadas = await Promise.all(lideresSel.map(id =>
          api.post('/tarefas', { requester_id: userId, ...form, assigned_to: id, company: company || undefined })
        ));
        setList(l => [...criadas.map(r => r.data), ...l]);
        toast(criadas.length > 1 ? `Tarefa criada para ${criadas.length} pessoas!` : 'Tarefa criada!');
      } else {
        const created = await api.post('/tarefas', { requester_id: userId, ...form, company: company || undefined });
        setList(l => [created.data, ...l]);
        toast('Tarefa criada!');
      }
      setModal(false);
    } catch { toast('Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm('Excluir esta tarefa?')) return;
    await api.delete(`/tarefas/${id}?requester_id=${userId}`).catch(() => toast('Erro ao remover'));
    setList(l => l.filter(t => t.id !== id));
    toast('Tarefa removida');
  };

  const updateStatus = async (t, status) => {
    const updated = await api.put(`/tarefas/${t.id}`, { requester_id: userId, status }).catch(() => null);
    if (updated) {
      if (status === 'concluida' && t.recorrencia && t.recorrencia !== 'nenhuma') {
        setTimeout(() => load(), 800);
      }
      setList(l => l.map(x => x.id === t.id ? updated.data : x));
    }
  };

  const nextStatus = (s) => s === 'pendente' ? 'em_andamento' : s === 'em_andamento' ? 'concluida' : 'pendente';

  const toggleTag = (tag) => setForm(f => ({
    ...f, tags: f.tags.includes(tag) ? f.tags.filter(t => t !== tag) : [...f.tags, tag],
  }));

  const tagsEmUso = [...new Set(list.flatMap(t => t.tags || []))];
  const responsaveis = [...new Map(list.map(t => [t.assigned_to, t.assigned?.full_name]).filter(([id,n]) => id && n)).entries()]
    .map(([id, name]) => ({ id, name }));

  // ── Visão Lista ──────────────────────────────────────
  const todayYMDList = toYMD(new Date());
  let filtered = list.filter(t => {
    if (filter === 'hoje')        return t.due_date === todayYMDList;
    if (filter === 'pendente')    return t.status === 'pendente';
    if (filter === 'em_andamento') return t.status === 'em_andamento';
    if (filter === 'concluida')   return t.status === 'concluida';
    return true;
  });
  if (filterResp) filtered = filtered.filter(t => t.assigned_to === filterResp);
  if (filterTag)  filtered = filtered.filter(t => (t.tags || []).includes(filterTag));
  filtered = [...filtered].sort((a, b) => {
    const oA = isOverdue(a.due_date, a.due_time, a.status) ? 0 : 1;
    const oB = isOverdue(b.due_date, b.due_time, b.status) ? 0 : 1;
    if (oA !== oB) return oA - oB;
    const ord = { pendente:0, em_andamento:1, concluida:2 };
    return (ord[a.status]??1) - (ord[b.status]??1);
  });

  const counts = {
    hoje: list.filter(t => t.due_date === todayYMDList).length,
    pendente: list.filter(t => t.status === 'pendente').length,
    em_andamento: list.filter(t => t.status === 'em_andamento').length,
    concluida: list.filter(t => t.status === 'concluida').length,
  };

  // ── Visão Calendário ─────────────────────────────────
  // Usa fuso de Brasília explícito para evitar bug de meia-noite em UTC
  const todayYMD = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const calMonday = (() => { const m = getMonday(new Date()); m.setDate(m.getDate() + calWeekOffset * 7); return m; })();
  const calWeekDays = Array.from({length:7}, (_,i) => addDaysTo(calMonday, i));
  const WEEK_LETTERS = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
  const MONTHS_PT = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

  // Mês/ano exibido no strip
  const midWeek = calWeekDays[3];
  const calMonthLabel = `${MONTHS_PT[midWeek.getMonth()]}. ${midWeek.getFullYear()}`;

  // Agrupamento para a visão calendário (aplica filtros de resp e tag, ignora filtro de status)
  let calList = [...list];
  if (filterResp) calList = calList.filter(t => t.assigned_to === filterResp);
  if (filterTag)  calList = calList.filter(t => (t.tags||[]).includes(filterTag));

  const todayDate = new Date(); todayDate.setHours(0,0,0,0);
  const overdueList  = calList.filter(t => isOverdue(t.due_date, t.due_time, t.status));
  const noDueList    = calList.filter(t => !t.due_date && t.status !== 'concluida');
  const byDate = {};
  calList.filter(t => t.due_date && new Date(t.due_date) >= todayDate).forEach(t => {
    if (!byDate[t.due_date]) byDate[t.due_date] = [];
    byDate[t.due_date].push(t);
  });
  const futureDates = Object.keys(byDate).sort();

  // Dots no strip semanal
  const hasTasksOn = (ymd) => (byDate[ymd]?.length > 0) || (ymd === todayYMD && overdueList.length > 0);

  // Scroll para seção de data
  const scrollToDate = (ymd) => {
    const el = document.getElementById(`cal-section-${ymd}`);
    if (el) el.scrollIntoView({ behavior:'smooth', block:'start' });
  };

  // ── Card de tarefa ────────────────────────────────────
  const renderTask = (t, hideDate = false, asRecurring = false) => {
    const overdue   = isOverdue(t.due_date, t.due_time, t.status);
    const concluida = t.status === 'concluida';
    const borderColor = asRecurring ? '#6366f1' : PRIORITY_COLOR[t.priority] || 'var(--border)';
    const recorre   = t.recorrencia && t.recorrencia !== 'nenhuma';
    return (
      <div key={t.id} style={{
        background:'var(--surface)', borderRadius:12, padding:'14px 16px',
        border:`1px solid ${overdue ? '#ef444450' : 'var(--border)'}`,
        borderLeft:`4px solid ${borderColor}`,
        opacity: concluida && !asRecurring ? 0.65 : 1, transition:'opacity .2s',
      }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
          <button onClick={() => updateStatus(t, nextStatus(t.status))}
            title={`${STATUS_LABEL[t.status]} — clique para avançar`}
            style={{ background:'none', border:'none', cursor:'pointer', padding:0, marginTop:2, flexShrink:0 }}>
            {t.status==='concluida' ? <CheckCircle size={20} style={{ color:'#10b981' }}/>
              : t.status==='em_andamento' ? <Clock size={20} style={{ color:'#6366f1' }}/>
              : <Circle size={20} style={{ color:'#f59e0b' }}/>}
          </button>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', marginBottom:4 }}>
              {asRecurring && <RefreshCw size={14} style={{ color:'#6366f1', flexShrink:0 }}/>}
              <span style={{ fontWeight:700, fontSize:14,
                textDecoration: 'none',
                color: 'var(--text)' }}>
                {t.title}
              </span>
              <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:6,
                background:PRIORITY_COLOR[t.priority]+'22', color:PRIORITY_COLOR[t.priority] }}>
                {PRIORITY_LABEL[t.priority]}
              </span>
              {!asRecurring && (
                <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:6,
                  background:STATUS_COLOR[t.status]+'22', color:STATUS_COLOR[t.status] }}>
                  {STATUS_LABEL[t.status]}
                </span>
              )}
              {!asRecurring && overdue && (
                <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:6,
                  background:'#ef444422', color:'#ef4444' }}>⚠ Atrasada</span>
              )}
              {recorre && (
                <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:6,
                  background:'#6366f122', color:'#6366f1', display:'flex', alignItems:'center', gap:3 }}>
                  <RefreshCw size={9}/> {RECORRENCIA_LABEL[t.recorrencia]}
                </span>
              )}
              {t.pdca_context && (
                <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:6,
                  background:'#E8681A22', color:'#E8681A' }}>
                  🎯 Plano de ação
                </span>
              )}
            </div>
            {t.description && (
              <div style={{ fontSize:13, color:'var(--text-muted)', marginBottom:6, lineHeight:1.4 }}>
                {t.description}
              </div>
            )}
            {t.pdca_context && (
              <div style={{ background:'#E8681A0D', border:'1px solid #E8681A33', borderRadius:8,
                padding:'8px 12px', marginBottom:8, fontSize:12 }}>
                <div style={{ fontWeight:700, color:'#E8681A', marginBottom:4 }}>📋 {t.pdca_context.plano_titulo}</div>
                {t.pdca_context.quadrante_label && (
                  <div style={{ color:'var(--text-muted)', marginBottom:2 }}>Etapa: {t.pdca_context.quadrante_label}</div>
                )}
                {t.pdca_context.meta && (
                  <div style={{ color:'var(--text-muted)', marginBottom:4 }}>Meta: {t.pdca_context.meta}</div>
                )}
                {setPage && (
                  <button onClick={(e) => { e.stopPropagation(); localStorage.setItem('pdca_open_plan', t.pdca_context.plano_id); setPage('pdca'); }}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'#E8681A', fontWeight:700,
                      fontSize:11, padding:0, textDecoration:'underline' }}>
                    Ver plano completo →
                  </button>
                )}
              </div>
            )}
            {(t.tags||[]).filter(tag => tag !== 'plano_acao').length > 0 && (
              <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:6 }}>
                {t.tags.map(tag => <TagChip key={tag} tag={tag} small/>)}
              </div>
            )}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, flexWrap:'wrap' }}>
              <div style={{ display:'flex', gap:12, flexWrap:'wrap', fontSize:12, color:'var(--text-muted)', alignItems:'center' }}>
                {t.due_date && (
                  <span style={{ color: overdue && !asRecurring ? '#ef4444' : 'var(--text-muted)', fontWeight: overdue && !asRecurring ? 700 : 400 }}>
                    📅 {formatDate(t.due_date)}{t.due_time ? ` às ${t.due_time}` : ''}{overdue && !asRecurring ? ' · vencida' : ''}
                  </span>
                )}
                {!t.due_date && t.due_time && <span>🕐 {t.due_time}</span>}
                <span>Por {t.creator?.full_name || '—'}</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ fontSize:11, color:'var(--text-muted)' }}>{t.assigned?.full_name || '—'}</span>
                <Avatar name={t.assigned?.full_name} avatarUrl={t.assigned?.avatar_url} size={28}/>
              </div>
            </div>
            <CommentSection taskId={t.id} userId={userId}/>
          </div>
          {canEdit(t) && (
            <div style={{ display:'flex', gap:6, flexShrink:0 }}>
              <button className="btn-icon" onClick={() => openEdit(t)} title="Editar"><Pencil size={14}/></button>
              <button className="btn-icon" onClick={() => remove(t.id)} style={{ color:'#ef4444' }} title="Excluir"><Trash2 size={14}/></button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Seção de data (calendário) ────────────────────────
  const CalSection = ({ id, label, labelColor, tasks, icon, emptyMsg, renderFn }) => (
    <div id={id} style={{ marginBottom:24 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10,
        paddingBottom:8, borderBottom:`2px solid ${labelColor||'var(--border)'}` }}>
        {icon && <span style={{ fontSize:16 }}>{icon}</span>}
        <span style={{ fontSize:14, fontWeight:800, color: labelColor||'var(--text)' }}>{label}</span>
        <span style={{ fontSize:12, color:'var(--text-muted)', fontWeight:500 }}>
          {tasks.length} tarefa{tasks.length !== 1 ? 's' : ''}
        </span>
      </div>
      {tasks.length === 0
        ? <p style={{ fontSize:13, color:'var(--text-muted)', paddingLeft:4 }}>{emptyMsg || 'Nenhuma tarefa.'}</p>
        : <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {tasks.map(t => (renderFn ? renderFn(t) : renderTask(t, true)))}
          </div>
      }
    </div>
  );

  return (
    <div>
      {/* ── Header ─────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <div className="page-title">Tarefas</div>
          <div className="page-subtitle">{list.length} tarefa{list.length !== 1 ? 's' : ''}</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {/* Toggle de visão */}
          <div style={{ display:'flex', background:'var(--surface)', border:'1px solid var(--border)',
            borderRadius:8, padding:3, gap:2 }}>
            <button onClick={() => setViewMode('lista')} style={{
              display:'flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:6,
              border:'none', cursor:'pointer', fontSize:12, fontWeight:600,
              background: viewMode==='lista' ? 'var(--primary)' : 'transparent',
              color: viewMode==='lista' ? '#fff' : 'var(--text-muted)',
            }}>
              <List size={13}/> Lista
            </button>
            <button onClick={() => setViewMode('calendario')} style={{
              display:'flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:6,
              border:'none', cursor:'pointer', fontSize:12, fontWeight:600,
              background: viewMode==='calendario' ? 'var(--primary)' : 'transparent',
              color: viewMode==='calendario' ? '#fff' : 'var(--text-muted)',
            }}>
              <CalendarDays size={13}/> Calendário
            </button>
          </div>
          <button className="btn btn-primary" onClick={openNew} style={{ display:'flex', alignItems:'center', gap:6 }}>
            <Plus size={15}/> Nova tarefa
          </button>
        </div>
      </div>

      {/* ── Filtros por responsável e tag (ambas as visões) ── */}
      {(responsaveis.length > 1 || tagsEmUso.length > 0) && (
        <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
          {responsaveis.length > 1 && (
            <select value={filterResp} onChange={e => setFilterResp(e.target.value)} style={{
              padding:'6px 12px', borderRadius:10, border:'1px solid var(--border)',
              background: filterResp ? 'var(--primary)' : 'var(--surface)',
              color: filterResp ? '#fff' : 'var(--text-muted)',
              fontSize:12, fontWeight:600, cursor:'pointer', outline:'none',
            }}>
              <option value="">👤 Todos os responsáveis</option>
              {responsaveis.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          )}
          {tagsEmUso.length > 0 && (
            <select value={filterTag} onChange={e => setFilterTag(e.target.value)} style={{
              padding:'6px 12px', borderRadius:10, border:'1px solid var(--border)',
              background: filterTag ? 'var(--primary)' : 'var(--surface)',
              color: filterTag ? '#fff' : 'var(--text-muted)',
              fontSize:12, fontWeight:600, cursor:'pointer', outline:'none',
            }}>
              <option value="">🏷 Todas as tags</option>
              {tagsEmUso.map(tag => <option key={tag} value={tag}>{tag}</option>)}
            </select>
          )}
        </div>
      )}

      {loading && <div style={{ color:'var(--text-muted)', padding:32, textAlign:'center' }}>Carregando...</div>}

      {/* ══════════════════════════════════════════════════
          VISÃO LISTA
      ══════════════════════════════════════════════════ */}
      {!loading && viewMode === 'lista' && (
        <>
          {/* Filtros de status */}
          <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
            {[['hoje','Hoje','var(--primary)'],['pendente','Pendentes','#f59e0b'],['em_andamento','Em andamento','#6366f1'],['concluida','Concluídas','#10b981']].map(([key,label,color]) => (
              <button key={key} onClick={() => setFilter(key)} style={{
                padding:'6px 14px', borderRadius:20, fontSize:12, fontWeight:600, cursor:'pointer',
                background: filter===key ? color : 'var(--surface)',
                color: filter===key ? '#fff' : 'var(--text-muted)',
                border:`1px solid ${filter===key ? 'transparent' : 'var(--border)'}`,
              }}>{label} ({counts[key]})</button>
            ))}
          </div>

          {filtered.length === 0 && (
            <div style={{ textAlign:'center', padding:60, color:'var(--text-muted)' }}>
              <ClipboardList size={40} style={{ opacity:.3, marginBottom:12 }}/>
              <p>Nenhuma tarefa {filter !== 'todas' ? 'nesta categoria' : 'criada ainda'}.</p>
            </div>
          )}

          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {filtered.map(t => renderTask(t))}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════
          VISÃO CALENDÁRIO
      ══════════════════════════════════════════════════ */}
      {!loading && viewMode === 'calendario' && (
        <div>
          {/* Strip semanal */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)',
            borderRadius:14, padding:'14px 16px', marginBottom:24 }}>

            {/* Navegação mês */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <button onClick={() => { setCalWeekOffset(o => o - 1); setSelectedCalDay(toYMD(addDaysTo(calMonday, -7))); }} style={{
                background:'none', border:'1px solid var(--border)', borderRadius:8,
                padding:'4px 10px', cursor:'pointer', color:'var(--text-muted)',
                display:'flex', alignItems:'center' }}>
                <ChevronLeft size={16}/>
              </button>
              <span style={{ fontSize:14, fontWeight:700, color:'var(--text)', textTransform:'capitalize' }}>
                {calMonthLabel}
              </span>
              <button onClick={() => { setCalWeekOffset(o => o + 1); setSelectedCalDay(toYMD(addDaysTo(calMonday, 7))); }} style={{
                background:'none', border:'1px solid var(--border)', borderRadius:8,
                padding:'4px 10px', cursor:'pointer', color:'var(--text-muted)',
                display:'flex', alignItems:'center' }}>
                <ChevronRight size={16}/>
              </button>
            </div>

            {/* Dias da semana */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4 }}>
              {calWeekDays.map((day, i) => {
                const ymd = toYMD(day);
                const isToday = ymd === todayYMD;
                const isSelected = ymd === selectedCalDay;
                const hasTasks = hasTasksOn(ymd);
                const isPast = day < todayDate;
                return (
                  <button key={ymd} onClick={() => setSelectedCalDay(ymd)}
                    style={{
                      display:'flex', flexDirection:'column', alignItems:'center', gap:4,
                      padding:'8px 4px', borderRadius:10, border: isSelected && !isToday ? '2px solid var(--primary)' : '2px solid transparent',
                      cursor:'pointer',
                      background: isToday ? 'var(--primary)' : isSelected ? 'rgba(232,98,42,.12)' : 'transparent',
                      transition:'background .15s',
                    }}>
                    <span style={{ fontSize:10, fontWeight:600,
                      color: isToday ? '#fff' : 'var(--text-muted)',
                      opacity: isPast && !isToday ? 0.5 : 1 }}>
                      {WEEK_LETTERS[i]}
                    </span>
                    <span style={{ fontSize:16, fontWeight:800,
                      color: isToday ? '#fff' : isPast ? 'var(--text-muted)' : 'var(--text)',
                      opacity: isPast && !isToday ? 0.5 : 1 }}>
                      {day.getDate()}
                    </span>
                    <div style={{
                      width:6, height:6, borderRadius:'50%',
                      background: hasTasks ? (isToday ? '#fff' : 'var(--primary)') : 'transparent',
                    }}/>
                  </button>
                );
              })}
            </div>

            {/* Botão voltar para hoje */}
            {calWeekOffset !== 0 && (
              <div style={{ textAlign:'center', marginTop:10 }}>
                <button onClick={() => { setCalWeekOffset(0); setSelectedCalDay(todayYMD); }} style={{
                  fontSize:12, color:'var(--primary)', background:'none', border:'none',
                  cursor:'pointer', fontWeight:600, textDecoration:'underline',
                }}>
                  Voltar para hoje
                </button>
              </div>
            )}
          </div>

          {/* Atrasadas — sempre visíveis se existirem */}
          {overdueList.length > 0 && (
            <CalSection
              id="cal-section-atrasadas"
              label="Atrasadas"
              labelColor="#ef4444"
              tasks={overdueList}
              icon="⚠"
            />
          )}

          {/* Tarefas do dia selecionado */}
          {(() => {
            const [sy, sm, sd] = selectedCalDay.split('-').map(Number);
            const selDate = new Date(sy, sm-1, sd);
            const WEEKDAY = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
            const isToday = selectedCalDay === todayYMD;
            const isTomorrow = selectedCalDay === toYMD(addDaysTo(new Date(), 1));
            const isPast = selDate < todayDate && !isToday;

            const dayTasksRaw = calList.filter(t => {
              const rec = t.recorrencia && t.recorrencia !== 'nenhuma';
              // Normais: pendentes, em andamento e concluídas no dia exato
              if (!rec) return t.due_date === selectedCalDay;
              // Instância real no dia exato: sempre mostra
              if (t.due_date === selectedCalDay) return true;
              // Dias passados sem instância real: não mostra virtual
              if (selectedCalDay < todayYMD) return false;
              // Hoje e futuro: mostra pendente e em_andamento (concluída não, pois backend já criou próxima)
              if (t.status === 'concluida' || !t.due_date) return false;
              if (selectedCalDay < t.due_date) return false;
              // Checa padrão de recorrência
              if (t.recorrencia === 'diaria') return true;
              const [dy,dm,dd] = t.due_date.split('-').map(Number);
              const [sy2,sm2,sd2] = selectedCalDay.split('-').map(Number);
              if (t.recorrencia === 'semanal')
                return new Date(dy,dm-1,dd).getDay() === new Date(sy2,sm2-1,sd2).getDay();
              if (t.recorrencia === 'quinzenal') {
                const diff = Math.round((new Date(selectedCalDay) - new Date(t.due_date)) / 86400000);
                return diff % 14 === 0;
              }
              if (t.recorrencia === 'mensal') return t.due_date.split('-')[2] === selectedCalDay.split('-')[2];
              return false;
            });
            // Deduplica recorrentes: por título+responsável, mantém pendente > em_andamento > concluída
            const STATUS_RANK = { pendente: 0, em_andamento: 1, concluida: 2 };
            const recMap = new Map();
            const dayTasks = [];
            for (const t of dayTasksRaw) {
              const rec = t.recorrencia && t.recorrencia !== 'nenhuma';
              if (!rec) { dayTasks.push(t); continue; }
              const key = `${t.title}||${t.assigned_to}`;
              const existing = recMap.get(key);
              if (!existing) { recMap.set(key, t); }
              else {
                const er = STATUS_RANK[existing.status] ?? 2;
                const tr = STATUS_RANK[t.status] ?? 2;
                if (tr < er || (tr === er && t.due_date > existing.due_date)) recMap.set(key, t);
              }
            }
            for (const t of recMap.values()) dayTasks.push(t);

            const label = isToday
              ? `Hoje · ${sd} ${MONTHS_PT[sm-1]}.`
              : isTomorrow
              ? `Amanhã · ${WEEKDAY[selDate.getDay()]} · ${sd} ${MONTHS_PT[sm-1]}.`
              : `${WEEKDAY[selDate.getDay()]} · ${sd} ${MONTHS_PT[sm-1]}.`;
            const color = isToday ? 'var(--primary)' : isTomorrow ? '#f59e0b' : isPast ? 'var(--text-muted)' : 'var(--text)';
            const icon = isToday ? '📌' : isTomorrow ? '🔜' : isPast ? '📂' : '📅';
            return (
              <CalSection
                id={`cal-section-${selectedCalDay}`}
                label={label}
                labelColor={color}
                tasks={dayTasks}
                icon={icon}
                emptyMsg="Será que não está esquecendo de agendar uma tarefa? 🤔"
                renderFn={t => t.recorrencia && t.recorrencia !== 'nenhuma'
                  ? renderTask({ ...t, due_date: selectedCalDay }, false, true)
                  : renderTask(t, true)}
              />
            );
          })()}
        </div>
      )}

      {/* ── FAB mobile ─────────────────────────────────── */}
      <button onClick={openNew} style={{
        position:'fixed', bottom:24, right:20, zIndex:500,
        width:52, height:52, borderRadius:'50%',
        background:'var(--primary)', color:'#fff', border:'none',
        display:'flex', alignItems:'center', justifyContent:'center',
        boxShadow:'0 4px 16px rgba(232,98,42,.5)', cursor:'pointer',
      }} aria-label="Nova tarefa">
        <Plus size={24}/>
      </button>

      {/* ── Modal ──────────────────────────────────────── */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar tarefa' : 'Nova tarefa'}>
        <div className="form-group">
          <label className="form-label">Título *</label>
          <input className="input" value={form.title} onChange={e => setForm(f=>({...f,title:e.target.value}))} placeholder="O que precisa ser feito?"/>
        </div>
        <div className="form-group">
          <label className="form-label">Descrição</label>
          <textarea className="input" rows={3} value={form.description} onChange={e => setForm(f=>({...f,description:e.target.value}))} placeholder="Detalhes opcionais..." style={{ resize:'vertical' }}/>
        </div>

        {isAdmin ? (
          <div className="form-group">
            <label className="form-label">Responsável *</label>

            {editing ? (
              // Edição de tarefa existente: sempre um único responsável
              <select className="select" value={form.assigned_to} onChange={e => setForm(f=>({...f,assigned_to:e.target.value}))}>
                <option value="">Selecionar...</option>
                {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}{p.sector ? ` (${p.sector})` : ''}</option>)}
              </select>
            ) : (
              // Nova tarefa: marque quantas pessoas quiser (líderes ou não)
              <div style={{ display:'flex', flexDirection:'column', gap:6,
                maxHeight:220, overflowY:'auto', border:'1px solid var(--border)', borderRadius:8, padding:8 }}>
                {profiles.length === 0 && (
                  <div style={{ fontSize:12, color:'var(--text-muted)', padding:8, textAlign:'center' }}>
                    Nenhum usuário cadastrado.
                  </div>
                )}
                {profiles.map(p => (
                  <label key={p.id} style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer',
                    padding:'6px 8px', borderRadius:6, background: lideresSel.includes(p.id) ? 'rgba(232,104,26,0.08)' : 'transparent' }}>
                    <input type="checkbox" checked={lideresSel.includes(p.id)} onChange={() => toggleLider(p.id)}/>
                    <span style={{ fontSize:13 }}>{p.full_name}{p.sector ? ` (${p.sector})` : ''}</span>
                  </label>
                ))}
                {lideresSel.length > 1 && (
                  <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>
                    {lideresSel.length} pessoas selecionadas — será criada 1 tarefa para cada
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:12, padding:'8px 12px',
            background:'var(--bg)', borderRadius:8, border:'1px solid var(--border)' }}>
            📌 Esta tarefa será criada para você mesmo.
          </div>
        )}

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div className="form-group" style={{ margin:0 }}>
            <label className="form-label">Prazo</label>
            <input className="input" type="date" value={form.due_date} onChange={e => setForm(f=>({...f,due_date:e.target.value}))}/>
          </div>
          <div className="form-group" style={{ margin:0 }}>
            <label className="form-label">Horário</label>
            <input className="input" type="time" value={form.due_time} onChange={e => setForm(f=>({...f,due_time:e.target.value}))}/>
          </div>
        </div>

        <div className="form-group" style={{ marginTop:12 }}>
          <label className="form-label">🔔 Lembrete</label>
          <select className="select" value={form.lembrete_minutos ?? ''}
            onChange={e => setForm(f => ({ ...f, lembrete_minutos: e.target.value === '' ? null : Number(e.target.value) }))}
            disabled={!form.due_date || !form.due_time}>
            <option value="">Sem lembrete</option>
            <option value="0">Na hora</option>
            <option value="5">5 minutos antes</option>
            <option value="10">10 minutos antes</option>
            <option value="15">15 minutos antes</option>
            <option value="30">30 minutos antes</option>
            <option value="60">1 hora antes</option>
            <option value="1440">1 dia antes</option>
          </select>
          {(!form.due_date || !form.due_time) && (
            <span style={{ fontSize:11, color:'var(--text-muted)', marginTop:4, display:'block' }}>
              Defina prazo e horário para ativar o lembrete
            </span>
          )}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:12 }}>
          <div className="form-group" style={{ margin:0 }}>
            <label className="form-label">Prioridade</label>
            <select className="select" value={form.priority} onChange={e => setForm(f=>({...f,priority:e.target.value}))}>
              <option value="baixa">🟢 Baixa</option>
              <option value="normal">🔵 Normal</option>
              <option value="alta">🔴 Alta</option>
            </select>
          </div>
          <div className="form-group" style={{ margin:0 }}>
            <label className="form-label">Recorrência</label>
            <select className="select" value={form.recorrencia} onChange={e => setForm(f=>({...f,recorrencia:e.target.value}))}>
              <option value="nenhuma">Não repete</option>
              <option value="diaria">📅 Diária</option>
              <option value="semanal">🗓 Semanal</option>
              <option value="quinzenal">🗓 Quinzenal</option>
              <option value="mensal">📆 Mensal</option>
            </select>
          </div>
        </div>

        <div className="form-group" style={{ marginTop:12 }}>
          <label className="form-label" style={{ display:'flex', alignItems:'center', gap:5 }}>
            <Tag size={13}/> Tags
          </label>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {TAGS_DISPONIVEIS.map(tag => (
              <button key={tag} type="button" onClick={() => toggleTag(tag)} style={{
                padding:'4px 10px', borderRadius:999, fontSize:11, fontWeight:700, cursor:'pointer',
                background: form.tags.includes(tag) ? (TAG_COLOR[tag]||'#6b7280')+'33' : 'var(--bg)',
                color: form.tags.includes(tag) ? (TAG_COLOR[tag]||'#6b7280') : 'var(--text-muted)',
                border:`1px solid ${form.tags.includes(tag) ? (TAG_COLOR[tag]||'#6b7280')+'66' : 'var(--border)'}`,
                transition:'.12s',
              }}>{tag}</button>
            ))}
          </div>
          {form.tags.length > 0 && (
            <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginTop:8 }}>
              {form.tags.map(tag => <TagChip key={tag} tag={tag} onRemove={() => toggleTag(tag)}/>)}
            </div>
          )}
        </div>

        <div style={{ display:'flex', gap:10, marginTop:8 }}>
          <button className="btn btn-ghost" style={{ flex:1, justifyContent:'center' }} onClick={() => setModal(false)}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={save} disabled={saving}>
            {saving ? 'Salvando...' : editing ? 'Salvar' : 'Criar tarefa'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
