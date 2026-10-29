import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Plus, Pencil, Trash2, LayoutList, Tags } from 'lucide-react';
import api from '../api';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';
import ReacaoBar from '../components/ReacaoBar';
import Comentarios from '../components/Comentarios';
import { useVistoNaTela } from '../lib/vistoNaTela';
import GuiaNaoLidos, { lerPedidoGuia, idDoGuia } from '../components/GuiaNaoLidos';

const CATEGORIES = [
  { key: 'meta',     label: '🎯 Metas',      color: '#6366f1' },
  { key: 'regra',    label: '📌 Regras',      color: '#f59e0b' },
  { key: 'lembrete', label: '🔔 Lembretes',   color: '#E8681A' },
  { key: 'geral',    label: '📋 Geral',       color: '#10b981' },
];

// Cores para os tipos que a empresa cria. Tons médios: leem no claro e no escuro.
const CORES_TIPO = ['#534AB7', '#0F6E56', '#993556', '#185FA5', '#854F0B', '#5F5E5A'];

const EMPTY = { title: '', content: '', category: 'geral' };

// Criar e editar tipo. `inicial` presente = renomear (a chave não muda).
function FormTipo({ inicial, onSalvar, onCancelar }) {
  const [nome, setNome] = useState(inicial?.nome || '');
  const [cor, setCor]   = useState(inicial?.cor || CORES_TIPO[0]);
  const [salvando, setSalvando] = useState(false);
  const salvar = async () => {
    if (!nome.trim()) return;
    setSalvando(true);
    try { await onSalvar({ nome: nome.trim(), cor }); } finally { setSalvando(false); }
  };
  return (
    <div style={{ background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:10, padding:12, marginTop:8 }}>
      <label className="form-label">Nome do tipo</label>
      <input className="input" value={nome} maxLength={40} autoFocus
        onChange={e => setNome(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') salvar(); }}
        placeholder="Ex: Segurança, Qualidade, Campanha do mês"/>
      <label className="form-label" style={{ marginTop:10 }}>Cor</label>
      <div style={{ display:'flex', gap:8 }}>
        {CORES_TIPO.map(c => (
          <button key={c} type="button" onClick={() => setCor(c)} aria-label={`Cor ${c}`} style={{
            width:26, height:26, borderRadius:'50%', background:c, cursor:'pointer',
            border: cor === c ? '3px solid var(--text)' : '2px solid transparent',
          }}/>
        ))}
      </div>
      <div style={{ display:'flex', gap:8, marginTop:12 }}>
        <button className="btn btn-ghost" style={{ flex:1, justifyContent:'center' }} onClick={onCancelar}>Cancelar</button>
        <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={salvar} disabled={salvando || !nome.trim()}>
          {salvando ? 'Salvando...' : inicial ? 'Salvar' : 'Criar tipo'}
        </button>
      </div>
    </div>
  );
}

export default function Mural({ userId, profile }) {
  const toast = useToast();
  const isAdmin = true; // todos podem criar cards no mural
  const canManage = ['admin', 'supervisor', 'master'].includes(profile?.access_level);
  // Tipos próprios: só o administrador (quem comprou o acesso) e o master.
  const podeGerirTipos = ['admin', 'master'].includes(profile?.access_level);
  const [tipos, setTipos]           = useState([]);
  const [novoTipo, setNovoTipo]     = useState(false);
  const [modalTipos, setModalTipos] = useState(false);
  const [editandoTipo, setEditandoTipo] = useState(null);
  const cats = [...CATEGORIES, ...tipos.map(t => ({ key: t.chave, label: t.nome, color: t.cor, id: t.id, nome: t.nome, cor: t.cor }))];
  const getCat = key => cats.find(c => c.key === key) || CATEGORIES[3];
  const [list, setList]       = useState([]);
  const [loading, setLoading] = useState(true);
  // Veio do cartão do painel: abre na leitura guiada dos não lidos.
  const [guia] = useState(() => lerPedidoGuia('mural'));
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

  useEffect(() => {
    const q = company ? `&company=${encodeURIComponent(company)}` : '';
    api.get(`/mural/categorias?requester_id=${userId}${q}`)
      .then(r => setTipos(r.data || []))
      .catch(() => {}); // sem os tipos próprios, o mural segue com os 4 de sempre
  }, [userId, company]);

  const erroDe = (e, padrao) => e?.response?.data?.error || padrao;

  const criarTipo = async ({ nome, cor }) => {
    try {
      const r = await api.post('/mural/categorias', { requester_id: userId, nome, cor, company: company || undefined });
      setTipos(t => [...t, r.data].sort((a, b) => a.nome.localeCompare(b.nome)));
      setNovoTipo(false);
      return r.data;
    } catch (e) { toast(erroDe(e, 'Erro ao criar o tipo')); }
  };

  const renomearTipo = async (id, campos) => {
    try {
      const r = await api.put(`/mural/categorias/${id}`, { requester_id: userId, ...campos });
      setTipos(t => t.map(x => x.id === id ? r.data : x));
      setEditandoTipo(null);
      toast('Tipo atualizado');
    } catch (e) { toast(erroDe(e, 'Erro ao salvar o tipo')); }
  };

  const removerTipo = async (tipo) => {
    if (!window.confirm(`Remover o tipo "${tipo.nome}"?`)) return;
    try {
      await api.delete(`/mural/categorias/${tipo.id}?requester_id=${userId}`);
      setTipos(t => t.filter(x => x.id !== tipo.id));
      if (filter === tipo.chave) setFilter('todas');
      toast('Tipo removido');
    } catch (e) { toast(erroDe(e, 'Erro ao remover o tipo')); }
  };

  const openNew  = () => { setEditing(null); setForm(EMPTY); setNovoTipo(false); setModal(true); };
  const openEdit = (m) => { setEditing(m.id); setForm({ title:m.title, content:m.content, category:m.category }); setNovoTipo(false); setModal(true); };

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

  // O recado inteiro está no cartão: se ficou na tela, foi lido. Sem isto o
  // contador do painel só baixava para quem clicasse em cada um.
  const jaMarcados = useRef(new Set());
  const observar = useVistoNaTela((id) => {
    if (jaMarcados.current.has(id)) return;
    jaMarcados.current.add(id);
    const item = list.find(m => m.id === id);
    if (item && !item.lido) marcarLido(id);
  });

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
      <GuiaNaoLidos ativo={guia} pronto={!loading}
        naoLidos={filtered.filter(m => !m.lido).map(m => m.id)}
        marcar={marcarLido}/>
      <div className="page-header">
        <div>
          <div className="page-title">Mural do Time</div>
          <div className="page-subtitle">Metas, regras e lembretes permanentes</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {podeGerirTipos && (
            <button className="btn btn-ghost" onClick={() => { setEditandoTipo(null); setNovoTipo(false); setModalTipos(true); }}>
              <Tags size={15}/> Tipos
            </button>
          )}
          {isAdmin && (
            <button className="btn btn-primary" onClick={openNew}>
              <Plus size={15}/> Novo card
            </button>
          )}
        </div>
      </div>

      {/* Filtro por categoria */}
      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
        <button onClick={() => setFilter('todas')} style={{
          padding:'6px 14px', borderRadius:20, fontSize:12, fontWeight:600, cursor:'pointer',
          background: filter === 'todas' ? 'var(--primary)' : 'var(--surface)',
          color: filter === 'todas' ? '#fff' : 'var(--text-muted)',
          border: `1px solid ${filter === 'todas' ? 'transparent' : 'var(--border)'}`,
        }}>Todas ({list.length})</button>
        {cats.map(c => {
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
            <div key={m.id} id={idDoGuia(m.id)} ref={observar(m.id)} onClick={() => !m.lido && marcarLido(m.id)} style={{
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
                <Comentarios recurso="mural" itemId={m.id} userId={userId} podeModerar={canManage}
                  total={m.comentarios} novos={m.comentarios_novos}
                  aoVer={() => setList(l => l.map(x => x.id === m.id ? { ...x, comentarios_novos: 0 } : x))} />
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
            {cats.map(c => (
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
            {podeGerirTipos && !novoTipo && (
              <button onClick={() => setNovoTipo(true)} style={{
                gridColumn:'span 2', padding:'10px', borderRadius:8, fontWeight:600, fontSize:13, cursor:'pointer',
                border:'2px dashed var(--border)', background:'transparent', color:'var(--text-muted)',
                display:'flex', alignItems:'center', justifyContent:'center', gap:6,
              }}>
                <Plus size={14}/> Novo tipo
              </button>
            )}
          </div>
          {podeGerirTipos && novoTipo && (
            <FormTipo onCancelar={() => setNovoTipo(false)}
              onSalvar={async campos => {
                const t = await criarTipo(campos);
                if (t) setForm(f => ({ ...f, category: t.chave }));
              }}/>
          )}
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

      <Modal open={modalTipos} onClose={() => setModalTipos(false)} title="Tipos de informação">
        <p style={{ fontSize:13, color:'var(--text-muted)', marginTop:0, lineHeight:1.6 }}>
          Crie os tipos com os nomes que a sua empresa usa. Toda a equipe vê e escolhe entre eles ao publicar no mural.
        </p>
        <div style={{ fontSize:12, fontWeight:700, color:'var(--text-muted)', marginBottom:6 }}>Padrão do Rota</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:16 }}>
          {CATEGORIES.map(c => (
            <span key={c.key} style={{ fontSize:12, fontWeight:600, padding:'4px 10px', borderRadius:20, border:'1px solid var(--border)', color:c.color }}>{c.label}</span>
          ))}
        </div>
        <div style={{ fontSize:12, fontWeight:700, color:'var(--text-muted)', marginBottom:6 }}>Da sua empresa</div>
        {tipos.length === 0 && !novoTipo && (
          <div style={{ fontSize:13, color:'var(--text-muted)', marginBottom:8 }}>Nenhum ainda.</div>
        )}
        {tipos.map(t => editandoTipo === t.id ? (
          <FormTipo key={t.id} inicial={t} onCancelar={() => setEditandoTipo(null)}
            onSalvar={campos => renomearTipo(t.id, campos)}/>
        ) : (
          <div key={t.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
            <span style={{ width:12, height:12, borderRadius:'50%', background:t.cor, flexShrink:0 }}/>
            <span style={{ flex:1, fontSize:14, fontWeight:600 }}>{t.nome}</span>
            <span style={{ fontSize:12, color:'var(--text-muted)' }}>
              {list.filter(m => m.category === t.chave).length} card(s)
            </span>
            <button className="btn-icon" aria-label={`Renomear ${t.nome}`} onClick={() => { setNovoTipo(false); setEditandoTipo(t.id); }}><Pencil size={13}/></button>
            <button className="btn-icon" aria-label={`Remover ${t.nome}`} onClick={() => removerTipo(t)} style={{ color:'#ef4444' }}><Trash2 size={13}/></button>
          </div>
        ))}
        {novoTipo ? (
          <FormTipo onCancelar={() => setNovoTipo(false)} onSalvar={criarTipo}/>
        ) : (
          <button className="btn btn-ghost" style={{ marginTop:12, width:'100%', justifyContent:'center' }}
            onClick={() => { setEditandoTipo(null); setNovoTipo(true); }}>
            <Plus size={14}/> Novo tipo
          </button>
        )}
      </Modal>
    </div>
  );
}
