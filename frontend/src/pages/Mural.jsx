import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, LayoutList } from 'lucide-react';
import api from '../api';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';
import ReacaoBar from '../components/ReacaoBar';
import Comentarios from '../components/Comentarios';

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
  const isAdmin = true; // todos podem criar cards no mural
  const canManage = ['admin', 'supervisor', 'master'].includes(profile?.access_level);
  const [list, setList]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm]       = useState(EMPTY);
  const [saving, setSaving]   = useState(false);
  const [filter, setFilter]   = useState('todas');
  const [reacoes, setReacoes] = useState({});
  const [leituras, setLeituras]           = useState({});
  const [leiturasOpen, setLeiturasOpen]   = useState({});
  const [leiturasLoading, setLeiturasLoading] = useState({});

  const company = profile?.company || '';

  const load = useCallback(() => {
    setLoading(true);
    const q = company ? `&company=${encodeURIComponent(company)}` : '';
    api.get(`/mural?requester_id=${userId}${q}`)
      .then(r => {
        setList(r.data);
        if (r.data.length > 0) {
          const ids = r.data.map(m => m.id).join(',');
          api.get(`/reacoes?tipo=mural&item_ids=${ids}&user_id=${userId}`)
            .then(rr => setReacoes(rr.data))
            .catch(() => {});
        }
      })
      .catch(() => toast('Erro ao carregar mural'))
      .finally(() => setLoading(false));
  }, [userId, company]);

  useEffect(() => { load(); }, [load]);

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
        const r = await api.post('/mural', { requester_id: userId, ...form, company: company || undefined });
        setList(l => [r.data, ...l]);
        toast('Card adicionado ao mural!');
      }
      setModal(false);
    } catch { toast('Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/mural/${id}?requester_id=${userId}`);
      setList(l => l.filter(m => m.id !== id));
      toast('Card removido');
    } catch (e) {
      toast('Erro ao remover card: ' + (e?.response?.data?.error || e.message || 'tente novamente'));
    }
  };

  const marcarLido = async (id) => {
    await api.post(`/mural/${id}/lido`, { user_id: userId }).catch(() => {});
    setList(l => l.map(m => m.id === id ? { ...m, lido: true } : m));
  };

  const toggleLeituras = async (id) => {
    const isOpen = leiturasOpen[id];
    setLeiturasOpen(s => ({ ...s, [id]: !isOpen }));
    if (!isOpen) {
      setLeiturasLoading(s => ({ ...s, [id]: true }));
      try {
        const r = await api.get(`/mural/${id}/leituras?requester_id=${userId}`);
        setLeituras(s => ({ ...s, [id]: r.data }));
      } catch { /* silencioso */ }
      finally { setLeiturasLoading(s => ({ ...s, [id]: false })); }
    }
  };

  const toggleReacao = async (itemId, emoji) => {
    // Reagir implica ter visualizado — marca como lido automaticamente
    const item = list.find(m => m.id === itemId);
    if (item && !item.lido) marcarLido(itemId);
    try {
      const { data } = await api.post('/reacoes/toggle', { tipo: 'mural', item_id: itemId, user_id: userId, emoji });
      setReacoes(prev => {
        const item = { ...(prev[itemId] || {}) };
        // Remove reação anterior (se trocou de emoji)
        if (data.old_emoji && data.old_emoji !== emoji) {
          const old = item[data.old_emoji] || { count: 0, mine: false };
          item[data.old_emoji] = { count: Math.max(0, old.count - 1), mine: false };
        }
        if (!item[emoji]) item[emoji] = { count: 0, mine: false };
        if (data.action === 'added' || data.action === 'changed') {
          item[emoji] = { count: item[emoji].count + 1, mine: true };
        } else {
          item[emoji] = { count: Math.max(0, item[emoji].count - 1), mine: false };
        }
        return { ...prev, [itemId]: item };
      });
    } catch { toast('Erro ao reagir'); }
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
            <div key={m.id} onClick={() => !m.lido && marcarLido(m.id)} style={{
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
                {(canManage || m.created_by === userId) && (
                  <div style={{ display:'flex', gap:4, flexShrink:0 }} onClick={e => e.stopPropagation()}>
                    <button className="btn-icon" onClick={() => openEdit(m)}><Pencil size={13}/></button>
                    <button className="btn-icon" onClick={() => remove(m.id)} style={{ color:'#ef4444' }}><Trash2 size={13}/></button>
                  </div>
                )}
              </div>
              <div style={{ fontSize:13, color:'var(--text-muted)', lineHeight:1.7, whiteSpace:'pre-wrap' }}>
                {m.content}
              </div>
              <div style={{ fontSize:11, color:'var(--text-muted)', paddingBottom:4 }}>
                {m.creator?.full_name || 'Gestor'}
              </div>
              <ReacaoBar
                itemId={m.id}
                userId={userId}
                tipo="mural"
                reacoes={reacoes[m.id]}
                onToggle={toggleReacao}
                stopPropagation
              />

              {/* Comentários — o clique não pode abrir/fechar o card */}
              <div onClick={e => e.stopPropagation()}>
                <Comentarios recurso="mural" itemId={m.id} userId={userId} podeModerar={canManage} />
              </div>

              {/* Painel de visualizações — só quem gerencia */}
              {canManage && (
                <div onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => toggleLeituras(m.id)}
                    style={{ background:'none', border:'none', cursor:'pointer',
                      color:'var(--text-muted)', fontSize:12, fontWeight:600,
                      padding:0, display:'flex', alignItems:'center', gap:4 }}>
                    {leiturasOpen[m.id] ? '▲' : '▼'} Visualizações
                  </button>

                  {leiturasOpen[m.id] && (
                    <div style={{ marginTop:10, borderTop:'1px solid var(--border)', paddingTop:10 }}>
                      {leiturasLoading[m.id] ? (
                        <span style={{ fontSize:12, color:'var(--text-muted)' }}>Carregando...</span>
                      ) : (() => {
                        const d = leituras[m.id];
                        if (!d) return null;
                        return (
                          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                            <div>
                              <div style={{ fontSize:11, fontWeight:700, color:'#10b981', marginBottom:6 }}>
                                ✓ Visualizaram ({d.leram.length})
                              </div>
                              {d.leram.length === 0
                                ? <span style={{ fontSize:12, color:'var(--text-muted)' }}>Ninguém ainda</span>
                                : <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                                    {d.leram.map(u => (
                                      <div key={u.id} style={{ display:'flex', alignItems:'center', gap:6 }}
                                        title={`${u.full_name}${u.read_at ? ' · ' + new Date(u.read_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : ''}`}>
                                        <div style={{
                                          width:28, height:28, borderRadius:'50%',
                                          border:'2px solid #10b981',
                                          overflow:'hidden', flexShrink:0,
                                          background:'#E8681A', display:'flex',
                                          alignItems:'center', justifyContent:'center',
                                          fontSize:11, fontWeight:700, color:'#fff',
                                        }}>
                                          {u.avatar_url
                                            ? <img src={u.avatar_url} alt={u.full_name} style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                                            : (u.full_name||'?')[0].toUpperCase()}
                                        </div>
                                        <span style={{ fontSize:11, color:'var(--text-muted)', maxWidth:80,
                                          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                          {u.full_name.split(' ')[0]}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                              }
                            </div>

                            {d.nao_leram.length > 0 && (
                              <div>
                                <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', marginBottom:6 }}>
                                  ○ Não visualizaram ({d.nao_leram.length})
                                </div>
                                <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                                  {d.nao_leram.map(u => (
                                    <div key={u.id} style={{ display:'flex', alignItems:'center', gap:6 }}
                                      title={u.full_name}>
                                      <div style={{
                                        width:28, height:28, borderRadius:'50%',
                                        border:'2px solid var(--border)',
                                        overflow:'hidden', flexShrink:0,
                                        background:'var(--surface-2)', display:'flex',
                                        alignItems:'center', justifyContent:'center',
                                        fontSize:11, fontWeight:700, color:'var(--text-muted)',
                                        opacity: 0.6,
                                      }}>
                                        {u.avatar_url
                                          ? <img src={u.avatar_url} alt={u.full_name} style={{ width:'100%', height:'100%', objectFit:'cover', opacity:0.5 }}/>
                                          : (u.full_name||'?')[0].toUpperCase()}
                                      </div>
                                      <span style={{ fontSize:11, color:'var(--text-muted)', opacity:0.6,
                                        maxWidth:80, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                        {u.full_name.split(' ')[0]}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* FAB mobile */}
      {isAdmin && (
        <button onClick={openNew} style={{
          position: 'fixed', bottom: 24, right: 20, zIndex: 500,
          width: 52, height: 52, borderRadius: '50%',
          background: 'var(--primary)', color: '#fff', border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(232,98,42,.5)', cursor: 'pointer',
          fontSize: 28, fontWeight: 300,
        }} aria-label="Novo card">
          <Plus size={24} />
        </button>
      )}

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
