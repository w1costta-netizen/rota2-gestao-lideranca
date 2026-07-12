import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, LayoutList } from 'lucide-react';
import api from '../api';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';

const CATEGORIES = [
  { key: 'meta',     label: '🎯 Metas',      color: '#6366f1' },
  { key: 'regra',    label: '📌 Regras',      color: '#f59e0b' },
  { key: 'lembrete', label: '🔔 Lembretes',   color: '#E8681A' },
  { key: 'geral',    label: '📋 Geral',       color: '#10b981' },
];

const EMPTY = { title: '', content: '', category: 'geral' };

function getCat(key) { return CATEGORIES.find(c => c.key === key) || CATEGORIES[3]; }

export default function Mural({ userId, profile }) {
  const toast = useToast();
  const isAdmin = ['admin', 'supervisor'].includes(profile?.access_level);
  const [list, setList]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm]       = useState(EMPTY);
  const [saving, setSaving]   = useState(false);
  const [filter, setFilter]   = useState('todas');

  const load = () => {
    setLoading(true);
    api.get(`/mural?requester_id=${userId}`)
      .then(r => setList(r.data))
      .catch(() => toast('Erro ao carregar mural'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [userId]);

  const openNew  = () => { setEditing(null); setForm(EMPTY); setModal(true); };
  const openEdit = (m) => { setEditing(m.id); setForm({ title:m.title, content:m.content, category:m.category }); setModal(true); };

  const save = async () => {
    if (!form.title.trim() || !form.content.trim()) return toast('Preencha título e conteúdo');
    setSaving(true);
    try {
      if (editing) {
        const r = await api.put(`/mural/${editing}`, { requester_id: userId, ...form });
        setList(l => l.map(m => m.id === editing ? r.data : m));
        toast('Card atualizado!');
      } else {
        const r = await api.post('/mural', { requester_id: userId, ...form });
        setList(l => [r.data, ...l]);
        toast('Card adicionado ao mural!');
      }
      setModal(false);
    } catch { toast('Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    await api.delete(`/mural/${id}?requester_id=${userId}`).catch(() => toast('Erro'));
    setList(l => l.filter(m => m.id !== id));
    toast('Card removido');
  };

  const filtered = filter === 'todas' ? list : list.filter(m => m.category === filter);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Mural do Time</div>
          <div className="page-subtitle">Metas, regras e lembretes permanentes</div>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={openNew}>
            <Plus size={15}/> Novo card
          </button>
        )}
      </div>

      {/* Filtro por categoria */}
      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
        <button onClick={() => setFilter('todas')} style={{
          padding:'6px 14px', borderRadius:20, fontSize:12, fontWeight:600, cursor:'pointer',
          background: filter === 'todas' ? 'var(--primary)' : 'var(--surface)',
          color: filter === 'todas' ? '#fff' : 'var(--text-muted)',
          border: `1px solid ${filter === 'todas' ? 'transparent' : 'var(--border)'}`,
        }}>Todas ({list.length})</button>
        {CATEGORIES.map(c => {
          const count = list.filter(m => m.category === c.key).length;
          if (count === 0) return null;
          return (
            <button key={c.key} onClick={() => setFilter(c.key)} style={{
              padding:'6px 14px', borderRadius:20, fontSize:12, fontWeight:600, cursor:'pointer',
              background: filter === c.key ? c.color : 'var(--surface)',
              color: filter === c.key ? '#fff' : 'var(--text-muted)',
              border: `1px solid ${filter === c.key ? 'transparent' : 'var(--border)'}`,
            }}>{c.label} ({count})</button>
          );
        })}
      </div>

      {loading && <div style={{ color:'var(--text-muted)', padding:32, textAlign:'center' }}>Carregando...</div>}

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign:'center', padding:60, color:'var(--text-muted)' }}>
          <LayoutList size={40} style={{ opacity:.3, marginBottom:12 }}/>
          <p>{isAdmin ? 'Adicione o primeiro card ao mural.' : 'Nenhum conteúdo no mural ainda.'}</p>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:16 }}>
        {filtered.map(m => {
          const cat = getCat(m.category);
          return (
            <div key={m.id} style={{
              background:'var(--surface)', borderRadius:14, padding:'20px',
              border:`1px solid var(--border)`,
              borderTop:`4px solid ${cat.color}`,
              display:'flex', flexDirection:'column', gap:10,
            }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div>
                  <span style={{ fontSize:11, fontWeight:700, color:cat.color, marginBottom:4, display:'block' }}>
                    {cat.label}
                  </span>
                  <div style={{ fontWeight:700, fontSize:15 }}>{m.title}</div>
                </div>
                {isAdmin && (
                  <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                    <button className="btn-icon" onClick={() => openEdit(m)}><Pencil size={13}/></button>
                    <button className="btn-icon" onClick={() => remove(m.id)} style={{ color:'#ef4444' }}><Trash2 size={13}/></button>
                  </div>
                )}
              </div>
              <div style={{ fontSize:13, color:'var(--text-muted)', lineHeight:1.7, whiteSpace:'pre-wrap' }}>
                {m.content}
              </div>
              <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:'auto', paddingTop:8,
                borderTop:'1px solid var(--border)' }}>
                {m.creator?.full_name || 'Gestor'}
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar card' : 'Novo card'}>
        <div className="form-group">
          <label className="form-label">Categoria</label>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {CATEGORIES.map(c => (
              <button key={c.key} onClick={() => setForm(f=>({...f,category:c.key}))}
                style={{
                  padding:'10px', borderRadius:8, fontWeight:600, fontSize:13, cursor:'pointer',
                  border:`2px solid ${form.category === c.key ? c.color : 'var(--border)'}`,
                  background: form.category === c.key ? c.color + '15' : 'transparent',
                  color: form.category === c.key ? c.color : 'var(--text-muted)',
                }}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Título *</label>
          <input className="input" value={form.title} onChange={e => setForm(f=>({...f,title:e.target.value}))} placeholder="Ex: Meta de vendas da semana"/>
        </div>
        <div className="form-group">
          <label className="form-label">Conteúdo *</label>
          <textarea className="input" rows={5} value={form.content} onChange={e => setForm(f=>({...f,content:e.target.value}))}
            placeholder="Descreva a meta, regra ou lembrete..." style={{ resize:'vertical' }}/>
        </div>
        <div style={{ display:'flex', gap:10, marginTop:8 }}>
          <button className="btn btn-ghost" style={{ flex:1, justifyContent:'center' }} onClick={() => setModal(false)}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={save} disabled={saving}>
            {saving ? 'Salvando...' : editing ? 'Salvar' : 'Adicionar'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
