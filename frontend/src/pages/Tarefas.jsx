import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, CheckCircle, Circle, Clock, ClipboardList } from 'lucide-react';
import api from '../api';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';

const EMPTY = { title: '', description: '', assigned_to: '', due_date: '', priority: 'normal' };

const STATUS_LABEL = { pendente: 'Pendente', em_andamento: 'Em andamento', concluida: 'Concluída' };
const STATUS_COLOR = { pendente: '#f59e0b', em_andamento: '#6366f1', concluida: '#10b981' };
const PRIORITY_LABEL = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta' };
const PRIORITY_COLOR = { baixa: '#6b7280', normal: '#6366f1', alta: '#ef4444' };

function formatDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function isOverdue(due_date, status) {
  if (!due_date || status === 'concluida') return false;
  return new Date(due_date) < new Date(new Date().toDateString());
}

export default function Tarefas({ userId, profile }) {
  const toast = useToast();
  const isAdmin = ['admin', 'supervisor'].includes(profile?.access_level);
  const [list, setList]         = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(false);
  const [editing, setEditing]   = useState(null);
  const [form, setForm]         = useState(EMPTY);
  const [saving, setSaving]     = useState(false);
  const [filter, setFilter]     = useState('todas');

  const load = () => {
    setLoading(true);
    api.get(`/tarefas?requester_id=${userId}`)
      .then(r => setList(r.data))
      .catch(() => toast('Erro ao carregar tarefas'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [userId]);
  useEffect(() => {
    if (isAdmin && userId) {
      api.get(`/admin/users?requester_id=${userId}`).then(r => setProfiles(r.data || [])).catch(() => {});
    }
  }, [userId, isAdmin]);

  const openNew  = () => { setEditing(null); setForm(EMPTY); setModal(true); };
  const openEdit = (t) => {
    setEditing(t.id);
    setForm({ title: t.title, description: t.description, assigned_to: t.assigned_to, due_date: t.due_date || '', priority: t.priority });
    setModal(true);
  };

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
        const created = await api.post('/tarefas', { requester_id: userId, ...form });
        setList(l => [created.data, ...l]);
        toast('Tarefa criada!');
      }
      setModal(false);
    } catch { toast('Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    await api.delete(`/tarefas/${id}?requester_id=${userId}`).catch(() => toast('Erro ao remover'));
    setList(l => l.filter(t => t.id !== id));
    toast('Tarefa removida');
  };

  const updateStatus = async (t, status) => {
    const updated = await api.put(`/tarefas/${t.id}`, { requester_id: userId, status }).catch(() => null);
    if (updated) setList(l => l.map(x => x.id === t.id ? updated.data : x));
  };

  const nextStatus = (s) => s === 'pendente' ? 'em_andamento' : s === 'em_andamento' ? 'concluida' : 'pendente';

  const filtered = filter === 'todas' ? list : list.filter(t => t.status === filter);
  const counts = { todas: list.length, pendente: list.filter(t=>t.status==='pendente').length,
    em_andamento: list.filter(t=>t.status==='em_andamento').length, concluida: list.filter(t=>t.status==='concluida').length };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Tarefas</div>
          <div className="page-subtitle">{list.length} tarefa{list.length !== 1 ? 's' : ''}</div>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={openNew}>
            <Plus size={15}/> Nova tarefa
          </button>
        )}
      </div>

      {/* Filtros */}
      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
        {[['todas','Todas'],['pendente','Pendentes'],['em_andamento','Em andamento'],['concluida','Concluídas']].map(([key,label]) => (
          <button key={key} onClick={() => setFilter(key)}
            style={{
              padding:'6px 14px', borderRadius:20, fontSize:12, fontWeight:600, cursor:'pointer',
              background: filter === key ? STATUS_COLOR[key] || 'var(--primary)' : 'var(--surface)',
              color: filter === key ? '#fff' : 'var(--text-muted)',
              border: `1px solid ${filter === key ? 'transparent' : 'var(--border)'}`,
            }}>
            {label} ({counts[key]})
          </button>
        ))}
      </div>

      {loading && <div style={{ color:'var(--text-muted)', padding:32, textAlign:'center' }}>Carregando...</div>}

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign:'center', padding:60, color:'var(--text-muted)' }}>
          <ClipboardList size={40} style={{ opacity:.3, marginBottom:12 }}/>
          <p>Nenhuma tarefa {filter !== 'todas' ? 'nesta categoria' : 'criada ainda'}.</p>
        </div>
      )}

      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {filtered.map(t => (
          <div key={t.id} style={{
            background:'var(--surface)', borderRadius:12, padding:'16px 18px',
            border:`1px solid ${isOverdue(t.due_date, t.status) ? '#ef444460' : 'var(--border)'}`,
            borderLeft:`4px solid ${STATUS_COLOR[t.status]}`,
          }}>
            <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
              {/* Status toggle */}
              <button onClick={() => updateStatus(t, nextStatus(t.status))}
                style={{ background:'none', border:'none', cursor:'pointer', padding:0, marginTop:2, flexShrink:0 }}>
                {t.status === 'concluida'
                  ? <CheckCircle size={20} style={{ color:'#10b981' }}/>
                  : t.status === 'em_andamento'
                  ? <Clock size={20} style={{ color:'#6366f1' }}/>
                  : <Circle size={20} style={{ color:'#f59e0b' }}/>}
              </button>

              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
                  <span style={{
                    fontWeight:700, fontSize:14,
                    textDecoration: t.status === 'concluida' ? 'line-through' : 'none',
                    color: t.status === 'concluida' ? 'var(--text-muted)' : 'var(--text)',
                  }}>{t.title}</span>
                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:6,
                    background: PRIORITY_COLOR[t.priority] + '20', color: PRIORITY_COLOR[t.priority] }}>
                    {PRIORITY_LABEL[t.priority]}
                  </span>
                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:6,
                    background: STATUS_COLOR[t.status] + '20', color: STATUS_COLOR[t.status] }}>
                    {STATUS_LABEL[t.status]}
                  </span>
                  {isOverdue(t.due_date, t.status) && (
                    <span style={{ fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:6,
                      background:'#ef444420', color:'#ef4444' }}>⚠ Atrasada</span>
                  )}
                </div>
                {t.description && (
                  <div style={{ fontSize:13, color:'var(--text-muted)', marginBottom:6 }}>{t.description}</div>
                )}
                <div style={{ display:'flex', gap:12, flexWrap:'wrap', fontSize:12, color:'var(--text-muted)' }}>
                  <span>👤 {t.assigned?.full_name || '—'}</span>
                  {t.due_date && (
                    <span style={{ color: isOverdue(t.due_date, t.status) ? '#ef4444' : 'var(--text-muted)' }}>
                      📅 {formatDate(t.due_date)}
                    </span>
                  )}
                  <span>Por {t.creator?.full_name || '—'}</span>
                </div>
              </div>

              {isAdmin && (
                <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                  <button className="btn-icon" onClick={() => openEdit(t)}><Pencil size={14}/></button>
                  <button className="btn-icon" onClick={() => remove(t.id)} style={{ color:'#ef4444' }}><Trash2 size={14}/></button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar tarefa' : 'Nova tarefa'}>
        <div className="form-group">
          <label className="form-label">Título *</label>
          <input className="input" value={form.title} onChange={e => setForm(f=>({...f,title:e.target.value}))} placeholder="O que precisa ser feito?"/>
        </div>
        <div className="form-group">
          <label className="form-label">Descrição</label>
          <textarea className="input" rows={3} value={form.description} onChange={e => setForm(f=>({...f,description:e.target.value}))} placeholder="Detalhes opcionais..." style={{ resize:'vertical' }}/>
        </div>
        {isAdmin && (
          <div className="form-group">
            <label className="form-label">Responsável *</label>
            <select className="select" value={form.assigned_to} onChange={e => setForm(f=>({...f,assigned_to:e.target.value}))}>
              <option value="">Selecionar...</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}{p.sector ? ` (${p.sector})` : ''}</option>)}
            </select>
          </div>
        )}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div className="form-group" style={{ margin:0 }}>
            <label className="form-label">Prazo</label>
            <input className="input" type="date" value={form.due_date} onChange={e => setForm(f=>({...f,due_date:e.target.value}))}/>
          </div>
          <div className="form-group" style={{ margin:0 }}>
            <label className="form-label">Prioridade</label>
            <select className="select" value={form.priority} onChange={e => setForm(f=>({...f,priority:e.target.value}))}>
              <option value="baixa">Baixa</option>
              <option value="normal">Normal</option>
              <option value="alta">Alta</option>
            </select>
          </div>
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
