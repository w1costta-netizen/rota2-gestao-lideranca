import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Megaphone } from 'lucide-react';
import api from '../api';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';

const EMPTY = { title: '', body: '', priority: 'normal' };

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60)   return 'agora mesmo';
  if (diff < 3600) return `${Math.floor(diff/60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h atrás`;
  return `${Math.floor(diff/86400)}d atrás`;
}

export default function Comunicados({ userId, profile }) {
  const toast = useToast();
  const isAdmin = ['admin', 'supervisor'].includes(profile?.access_level);
  const [list, setList]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm]       = useState(EMPTY);
  const [saving, setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(null);

  const load = () => {
    setLoading(true);
    api.get(`/comunicados?requester_id=${userId}`)
      .then(r => setList(r.data))
      .catch(() => toast('Erro ao carregar comunicados'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [userId]);

  const openNew  = () => { setEditing(null); setForm(EMPTY); setModal(true); };
  const openEdit = (c) => { setEditing(c.id); setForm({ title: c.title, body: c.body, priority: c.priority }); setModal(true); };

  const save = async () => {
    if (!form.title.trim() || !form.body.trim()) return toast('Preencha título e texto');
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/comunicados/${editing}`, { requester_id: userId, ...form });
        toast('Comunicado atualizado!');
      } else {
        await api.post('/comunicados', { requester_id: userId, ...form });
        toast('Comunicado publicado! Notificação enviada.');
      }
      setModal(false);
      load();
    } catch { toast('Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    setDeleting(id);
    try {
      await api.delete(`/comunicados/${id}?requester_id=${userId}`);
      toast('Comunicado removido');
      setList(l => l.filter(c => c.id !== id));
    } catch { toast('Erro ao remover'); }
    finally { setDeleting(null); }
  };

  const marcarLido = async (id) => {
    await api.post(`/comunicados/${id}/lido`, { user_id: userId }).catch(() => {});
    setList(l => l.map(c => c.id === id ? { ...c, lido: true } : c));
  };

  const naoLidos = list.filter(c => !c.lido).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title" style={{ display:'flex', alignItems:'center', gap:10 }}>
            Comunicados
            {naoLidos > 0 && (
              <span style={{ background:'#ef4444', color:'#fff', borderRadius:20,
                fontSize:11, fontWeight:700, padding:'2px 8px' }}>
                {naoLidos} novo{naoLidos > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="page-subtitle">{list.length} comunicado{list.length !== 1 ? 's' : ''}</div>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={openNew}>
            <Plus size={15}/> Novo comunicado
          </button>
        )}
      </div>

      {loading && <div style={{ color:'var(--text-muted)', padding:32, textAlign:'center' }}>Carregando...</div>}

      {!loading && list.length === 0 && (
        <div style={{ textAlign:'center', padding:60, color:'var(--text-muted)' }}>
          <Megaphone size={40} style={{ opacity:.3, marginBottom:12 }}/>
          <p>Nenhum comunicado publicado.</p>
        </div>
      )}

      <div style={{ display:'flex', flexDirection:'column', gap:12, marginTop:8 }}>
        {list.map(c => (
          <div key={c.id}
            onClick={() => !c.lido && marcarLido(c.id)}
            style={{
              background: 'var(--surface)',
              border: `1px solid ${c.lido ? 'var(--border)' : c.priority === 'urgente' ? '#ef444460' : 'var(--primary)'}`,
              borderLeft: `4px solid ${c.priority === 'urgente' ? '#ef4444' : 'var(--primary)'}`,
              borderRadius: 12, padding: '16px 20px',
              cursor: c.lido ? 'default' : 'pointer',
              transition: 'opacity .2s',
            }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                  {c.priority === 'urgente' && (
                    <span style={{ background:'#ef4444', color:'#fff', fontSize:10,
                      fontWeight:700, padding:'2px 7px', borderRadius:6 }}>URGENTE</span>
                  )}
                  {!c.lido && (
                    <span style={{ background:'var(--primary)', color:'#fff', fontSize:10,
                      fontWeight:700, padding:'2px 7px', borderRadius:6 }}>NOVO</span>
                  )}
                  <span style={{ fontSize:11, color:'var(--text-muted)' }}>{timeAgo(c.created_at)}</span>
                </div>
                <div style={{ fontWeight:700, fontSize:15, marginBottom:6 }}>{c.title}</div>
                <div style={{ fontSize:13, color:'var(--text-muted)', lineHeight:1.6, whiteSpace:'pre-wrap' }}>{c.body}</div>
                <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:8 }}>
                  Publicado por {c.profiles?.full_name || 'Gestor'}
                </div>
              </div>
              {isAdmin && (
                <div style={{ display:'flex', gap:6, flexShrink:0 }} onClick={e => e.stopPropagation()}>
                  <button className="btn-icon" onClick={() => openEdit(c)} title="Editar">
                    <Pencil size={14}/>
                  </button>
                  <button className="btn-icon" onClick={() => remove(c.id)}
                    disabled={deleting === c.id}
                    style={{ color:'#ef4444' }} title="Remover">
                    <Trash2 size={14}/>
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <Modal open={modal} onClose={() => setModal(false)}
        title={editing ? 'Editar comunicado' : 'Novo comunicado'}>
        <div className="form-group">
          <label className="form-label">Título *</label>
          <input className="input" value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Ex: Reunião obrigatória segunda-feira"/>
        </div>
        <div className="form-group">
          <label className="form-label">Texto *</label>
          <textarea className="input" rows={5} value={form.body}
            onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
            placeholder="Escreva a mensagem completa..."
            style={{ resize:'vertical' }}/>
        </div>
        <div className="form-group">
          <label className="form-label">Prioridade</label>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            {['normal','urgente'].map(p => (
              <button key={p} onClick={() => setForm(f => ({ ...f, priority: p }))}
                style={{
                  padding:'10px 0', borderRadius:8, fontWeight:600, fontSize:13,
                  border: `2px solid ${form.priority === p ? (p === 'urgente' ? '#ef4444' : 'var(--primary)') : 'var(--border)'}`,
                  background: form.priority === p ? (p === 'urgente' ? '#ef444415' : 'var(--primary-subtle)') : 'transparent',
                  color: form.priority === p ? (p === 'urgente' ? '#ef4444' : 'var(--primary)') : 'var(--text-muted)',
                  cursor:'pointer',
                }}>
                {p === 'urgente' ? '🚨 Urgente' : '📢 Normal'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display:'flex', gap:10, marginTop:8 }}>
          <button className="btn btn-ghost" style={{ flex:1, justifyContent:'center' }}
            onClick={() => setModal(false)}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }}
            onClick={save} disabled={saving}>
            {saving ? 'Publicando...' : editing ? 'Salvar' : 'Publicar'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
