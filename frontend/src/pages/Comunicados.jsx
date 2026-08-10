import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Megaphone } from 'lucide-react';
import api from '../api';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';
import ReacaoBar from '../components/ReacaoBar';

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
  const isAdmin = true; // todos podem criar comunicados
  const canManage = ['admin', 'supervisor', 'master'].includes(profile?.access_level);
  const [list, setList]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [leituras, setLeituras] = useState({});   // { [id]: { leram, nao_leram } }
  const [leiturasOpen, setLeiturasOpen] = useState({});
  const [leiturasLoading, setLeiturasLoading] = useState({});
  const LIMIT = 150;

  const toggleLeituras = async (id) => {
    const isOpen = leiturasOpen[id];
    setLeiturasOpen(s => ({ ...s, [id]: !isOpen }));
    if (!isOpen && !leituras[id]) {
      setLeiturasLoading(s => ({ ...s, [id]: true }));
      try {
        const r = await api.get(`/comunicados/${id}/leituras?requester_id=${userId}`);
        setLeituras(s => ({ ...s, [id]: r.data }));
      } catch { /* silencioso */ }
      finally { setLeiturasLoading(s => ({ ...s, [id]: false })); }
    }
  };
  const [modal, setModal]     = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm]       = useState(EMPTY);
  const [saving, setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [reacoes, setReacoes] = useState({});

  const company = profile?.company || '';

  const load = useCallback(() => {
    setLoading(true);
    const q = company ? `&company=${encodeURIComponent(company)}` : '';
    api.get(`/comunicados?requester_id=${userId}${q}`)
      .then(r => {
        setList(r.data);
        if (r.data.length > 0) {
          const ids = r.data.map(c => c.id).join(',');
          api.get(`/reacoes?tipo=comunicado&item_ids=${ids}&user_id=${userId}`)
            .then(rr => setReacoes(rr.data))
            .catch(() => {});
        }
      })
      .catch(() => toast('Erro ao carregar comunicados'))
      .finally(() => setLoading(false));
  }, [userId, company]);

  useEffect(() => { load(); }, [load]);

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
        await api.post('/comunicados', { requester_id: userId, ...form, company: company || undefined });
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

  const toggleReacao = async (itemId, emoji) => {
    try {
      const { data } = await api.post('/reacoes/toggle', { tipo: 'comunicado', item_id: itemId, user_id: userId, emoji });
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
                {(() => {
                  const isLong = (c.body || '').length > LIMIT;
                  const isOpen = expanded[c.id];
                  return (
                    <>
                      <div style={{
                        fontSize:13, color:'var(--text-muted)', lineHeight:1.6, whiteSpace:'pre-wrap',
                        display: !isLong || isOpen ? 'block' : '-webkit-box',
                        WebkitLineClamp: !isLong || isOpen ? 'unset' : 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: !isLong || isOpen ? 'visible' : 'hidden',
                      }}>{c.body}</div>
                      {isLong && (
                        <button onClick={() => setExpanded(e => ({ ...e, [c.id]: !e[c.id] }))}
                          style={{ marginTop:4, background:'none', border:'none', cursor:'pointer',
                            color:'#E8681A', fontSize:12, fontWeight:600, padding:0 }}>
                          {isOpen ? 'Ver menos ↑' : 'Ver mais ↓'}
                        </button>
                      )}
                    </>
                  );
                })()}
                <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:8 }}>
                  Publicado por {c.profiles?.full_name || 'Gestor'}
                </div>
                <ReacaoBar
                  itemId={c.id}
                  userId={userId}
                  tipo="comunicado"
                  reacoes={reacoes[c.id]}
                  onToggle={toggleReacao}
                  stopPropagation
                />

                {/* Painel de leituras — só admin/supervisor */}
                {canManage && (
                  <div onClick={e => e.stopPropagation()} style={{ marginTop:10 }}>
                    <button
                      onClick={() => toggleLeituras(c.id)}
                      style={{ background:'none', border:'none', cursor:'pointer',
                        color:'var(--text-muted)', fontSize:12, fontWeight:600,
                        padding:0, display:'flex', alignItems:'center', gap:4 }}>
                      {leiturasOpen[c.id] ? '▲' : '▼'} Visualizações
                    </button>

                    {leiturasOpen[c.id] && (
                      <div style={{ marginTop:10, borderTop:'1px solid var(--border)', paddingTop:10 }}>
                        {leiturasLoading[c.id] ? (
                          <span style={{ fontSize:12, color:'var(--text-muted)' }}>Carregando...</span>
                        ) : (() => {
                          const d = leituras[c.id];
                          if (!d) return null;
                          return (
                            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                              {/* Leram */}
                              <div>
                                <div style={{ fontSize:11, fontWeight:700, color:'#10b981', marginBottom:6 }}>
                                  ✓ Leram ({d.leram.length})
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

                              {/* Não leram */}
                              {d.nao_leram.length > 0 && (
                                <div>
                                  <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', marginBottom:6 }}>
                                    ○ Não leram ({d.nao_leram.length})
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
              {canManage && (
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

      {/* FAB mobile */}
      {isAdmin && (
        <button onClick={openNew} style={{
          position: 'fixed', bottom: 24, right: 20, zIndex: 500,
          width: 52, height: 52, borderRadius: '50%',
          background: 'var(--primary)', color: '#fff', border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(232,98,42,.5)', cursor: 'pointer',
        }} aria-label="Novo comunicado">
          <Plus size={24} />
        </button>
      )}
    </div>
  );
}
