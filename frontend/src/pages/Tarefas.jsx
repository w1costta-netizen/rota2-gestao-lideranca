import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Plus, Pencil, Trash2, CheckCircle, Circle, Clock, ClipboardList, MessageSquare, Send, ChevronDown, ChevronUp, RefreshCw, Tag } from 'lucide-react';
import api from '../api';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';

const EMPTY = { title: '', description: '', assigned_to: '', due_date: '', due_time: '', priority: 'normal', recorrencia: 'nenhuma', tags: [] };

const STATUS_LABEL = { pendente: 'Pendente', em_andamento: 'Em andamento', concluida: 'Concluída' };
const STATUS_COLOR = { pendente: '#f59e0b', em_andamento: '#6366f1', concluida: '#10b981' };
const PRIORITY_LABEL = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta' };
const PRIORITY_COLOR = { baixa: '#6b7280', normal: '#6366f1', alta: '#ef4444' };
const RECORRENCIA_LABEL = { nenhuma: 'Não repete', diaria: 'Diária', semanal: 'Semanal', quinzenal: 'Quinzenal', mensal: 'Mensal' };
const RECORRENCIA_ICON  = { diaria: '📅', semanal: '🗓', quinzenal: '🗓', mensal: '📆' };

const TAGS_DISPONIVEIS = ['urgente','estoque','cliente','reunião','treinamento','operação','limpeza','segurança','financeiro','fornecedor'];
const TAG_COLOR = { urgente:'#ef4444', estoque:'#f59e0b', cliente:'#10b981', reunião:'#6366f1', treinamento:'#8b5cf6',
  operação:'#06b6d4', limpeza:'#14b8a6', segurança:'#f97316', financeiro:'#84cc16', fornecedor:'#ec4899' };

function formatDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function isOverdue(due_date, status) {
  if (!due_date || status === 'concluida') return false;
  const today = new Date(); today.setHours(0,0,0,0);
  return new Date(due_date) < today;
}

function TagChip({ tag, onRemove, small }) {
  const color = TAG_COLOR[tag] || '#6b7280';
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:3,
      fontSize: small ? 10 : 11, fontWeight:700,
      padding: small ? '2px 7px' : '3px 9px',
      borderRadius:999, background: color+'22', color,
      border:`1px solid ${color}44`,
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
  const [comments, setComments] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [loaded, setLoaded]     = useState(false);
  const [open, setOpen]         = useState(false);
  const [text, setText]         = useState('');
  const [sending, setSending]   = useState(false);

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
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}>
                  <span style={{ fontSize:11, fontWeight:700, color:'var(--primary)' }}>{c.author?.full_name || 'Usuário'}</span>
                  <span style={{ fontSize:10, color:'var(--text-muted)' }}>
                    {c.created_at ? new Date(c.created_at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : ''}
                  </span>
                </div>
                <div style={{ fontSize:12, color:'var(--text)', lineHeight:1.4 }}>{c.text}</div>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', gap:6 }}>
            <input value={text} onChange={e => setText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder="Adicionar atualização..."
              style={{ flex:1, padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)',
                background:'var(--bg)', color:'var(--text)', fontSize:12 }}/>
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

export default function Tarefas({ userId, profile }) {
  const toast   = useToast();
  const isAdmin = ['admin','supervisor','master'].includes(profile?.access_level);
  const [list, setList]         = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(false);
  const [editing, setEditing]   = useState(null);
  const [form, setForm]         = useState(EMPTY);
  const [saving, setSaving]     = useState(false);
  const [filter, setFilter]     = useState('todas');
  const [filterResp, setFilterResp] = useState('');
  const [filterTag,  setFilterTag]  = useState('');
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

  const openNew  = () => { setEditing(null); setForm({ ...EMPTY, assigned_to: userId }); setModal(true); };
  const openEdit = (t) => {
    setEditing(t.id);
    setForm({
      title: t.title, description: t.description, assigned_to: t.assigned_to,
      due_date: t.due_date || '', due_time: t.due_time || '',
      priority: t.priority, recorrencia: t.recorrencia || 'nenhuma',
      tags: t.tags || [],
    });
    setModal(true);
  };

  const canEdit = (t) => isAdmin || (t.created_by === userId && t.assigned_to === userId);

  const save = async () => {
    if (!form.title.trim()) return toast('Preencha o título');
    if (isAdmin && !form.assigned_to) return toast('Selecione o responsável');
    setSaving(true);
    try {
      if (editing) {
        const updated = await api.put(`/tarefas/${editing}`, { requester_id: userId, ...form });
        setList(l => l.map(t => t.id === editing ? updated.data : t));
        toast('Tarefa atualizada!');
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
      // Se recorrente e concluída, recarrega para pegar nova instância
      if (status === 'concluida' && t.recorrencia && t.recorrencia !== 'nenhuma') {
        setTimeout(() => load(), 800);
      }
      setList(l => l.map(x => x.id === t.id ? updated.data : x));
    }
  };

  const nextStatus = (s) => s === 'pendente' ? 'em_andamento' : s === 'em_andamento' ? 'concluida' : 'pendente';

  const toggleTag = (tag) => setForm(f => ({
    ...f,
    tags: f.tags.includes(tag) ? f.tags.filter(t => t !== tag) : [...f.tags, tag],
  }));

  // Todas as tags únicas em uso
  const tagsEmUso = [...new Set(list.flatMap(t => t.tags || []))];
  const responsaveis = [...new Map(list.map(t => [t.assigned_to, t.assigned?.full_name]).filter(([id,n]) => id && n)).entries()]
    .map(([id, name]) => ({ id, name }));

  let filtered = filter === 'todas' ? list : list.filter(t => t.status === filter);
  if (filterResp) filtered = filtered.filter(t => t.assigned_to === filterResp);
  if (filterTag)  filtered = filtered.filter(t => (t.tags || []).includes(filterTag));

  filtered = [...filtered].sort((a, b) => {
    const oA = isOverdue(a.due_date, a.status) ? 0 : 1;
    const oB = isOverdue(b.due_date, b.status) ? 0 : 1;
    if (oA !== oB) return oA - oB;
    const ord = { pendente:0, em_andamento:1, concluida:2 };
    return (ord[a.status]??1) - (ord[b.status]??1);
  });

  const counts = {
    todas: list.length,
    pendente: list.filter(t => t.status === 'pendente').length,
    em_andamento: list.filter(t => t.status === 'em_andamento').length,
    concluida: list.filter(t => t.status === 'concluida').length,
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Tarefas</div>
          <div className="page-subtitle">{list.length} tarefa{list.length !== 1 ? 's' : ''}</div>
        </div>
        <button className="btn btn-primary" onClick={openNew}><Plus size={15}/> Nova tarefa</button>
      </div>

      {/* Filtros de status */}
      <div style={{ display:'flex', gap:8, marginBottom:10, flexWrap:'wrap' }}>
        {[['todas','Todas'],['pendente','Pendentes'],['em_andamento','Em andamento'],['concluida','Concluídas']].map(([key,label]) => (
          <button key={key} onClick={() => setFilter(key)} style={{
            padding:'6px 14px', borderRadius:20, fontSize:12, fontWeight:600, cursor:'pointer',
            background: filter===key ? (STATUS_COLOR[key]||'var(--primary)') : 'var(--surface)',
            color: filter===key ? '#fff' : 'var(--text-muted)',
            border:`1px solid ${filter===key ? 'transparent' : 'var(--border)'}`,
          }}>{label} ({counts[key]})</button>
        ))}
      </div>

      {/* Filtros por responsável e tag */}
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
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign:'center', padding:60, color:'var(--text-muted)' }}>
          <ClipboardList size={40} style={{ opacity:.3, marginBottom:12 }}/>
          <p>Nenhuma tarefa {filter !== 'todas' ? 'nesta categoria' : 'criada ainda'}.</p>
        </div>
      )}

      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {filtered.map(t => {
          const overdue   = isOverdue(t.due_date, t.status);
          const concluida = t.status === 'concluida';
          const recorre   = t.recorrencia && t.recorrencia !== 'nenhuma';
          return (
            <div key={t.id} style={{
              background:'var(--surface)', borderRadius:12, padding:'14px 16px',
              border:`1px solid ${overdue ? '#ef444450' : 'var(--border)'}`,
              borderLeft:`4px solid ${PRIORITY_COLOR[t.priority]||'var(--border)'}`,
              opacity: concluida ? 0.65 : 1, transition:'opacity .2s',
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
                    <span style={{ fontWeight:700, fontSize:14,
                      textDecoration: concluida ? 'line-through' : 'none',
                      color: concluida ? 'var(--text-muted)' : 'var(--text)' }}>
                      {t.title}
                    </span>
                    <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:6,
                      background:PRIORITY_COLOR[t.priority]+'22', color:PRIORITY_COLOR[t.priority] }}>
                      {PRIORITY_LABEL[t.priority]}
                    </span>
                    <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:6,
                      background:STATUS_COLOR[t.status]+'22', color:STATUS_COLOR[t.status] }}>
                      {STATUS_LABEL[t.status]}
                    </span>
                    {overdue && (
                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:6,
                        background:'#ef444422', color:'#ef4444' }}>⚠ Atrasada</span>
                    )}
                    {recorre && (
                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:6,
                        background:'#06b6d422', color:'#06b6d4', display:'flex', alignItems:'center', gap:3 }}>
                        <RefreshCw size={9}/> {RECORRENCIA_LABEL[t.recorrencia]}
                      </span>
                    )}
                  </div>

                  {t.description && (
                    <div style={{ fontSize:13, color:'var(--text-muted)', marginBottom:6, lineHeight:1.4 }}>
                      {t.description}
                    </div>
                  )}

                  {/* Tags */}
                  {(t.tags||[]).length > 0 && (
                    <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:6 }}>
                      {t.tags.map(tag => <TagChip key={tag} tag={tag} small/>)}
                    </div>
                  )}

                  <div style={{ display:'flex', gap:12, flexWrap:'wrap', fontSize:12, color:'var(--text-muted)' }}>
                    <span>👤 {t.assigned?.full_name || '—'}</span>
                    {t.due_date && (
                      <span style={{ color: overdue ? '#ef4444' : 'var(--text-muted)', fontWeight: overdue ? 700 : 400 }}>
                        📅 {formatDate(t.due_date)}{t.due_time ? ` às ${t.due_time}` : ''}{overdue ? ' · vencida' : ''}
                      </span>
                    )}
                    <span>Por {t.creator?.full_name || '—'}</span>
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
        })}
      </div>

      {/* Modal */}
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
            <select className="select" value={form.assigned_to} onChange={e => setForm(f=>({...f,assigned_to:e.target.value}))}>
              <option value="">Selecionar...</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}{p.sector ? ` (${p.sector})` : ''}</option>)}
            </select>
          </div>
        ) : (
          <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:12, padding:'8px 12px',
            background:'var(--bg)', borderRadius:8, border:'1px solid var(--border)' }}>
            📌 Esta tarefa será criada para você mesmo.
          </div>
        )}

        {/* Prazo + Horário */}
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

        {/* Prioridade + Recorrência */}
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

        {/* Tags */}
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
