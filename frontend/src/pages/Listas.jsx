import React, { useEffect, useState, useRef } from 'react';
import { Plus, Mic, Trash2, X, ListChecks } from 'lucide-react';
import api from '../api';
import { useToast } from '../components/Toast';

const EMOJIS = ['📝', '🛒', '📌', '✈️', '🏠', '💼', '🎯', '📚', '🎁', '⭐'];

function SpeechSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export default function Listas({ userId }) {
  const toast = useToast();
  const [listas, setListas]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [ativa, setAtiva]     = useState(null);
  const [novoItem, setNovoItem] = useState('');
  const [novaLista, setNovaLista] = useState(false);
  const [nomeLista, setNomeLista] = useState('');
  const [emojiLista, setEmojiLista] = useState('📝');
  const [salvando, setSalvando] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const recRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/listas?requester_id=${userId}`);
      setListas(r.data);
      setAtiva(prev => prev && r.data.some(l => l.id === prev) ? prev : (r.data[0]?.id || null));
    } catch {
      toast('Erro ao carregar listas', 'error');
    }
    setLoading(false);
  };

  useEffect(() => { if (userId) load(); }, [userId]);

  const listaAtiva = listas.find(l => l.id === ativa);

  const criarLista = async () => {
    if (!nomeLista.trim()) return;
    setSalvando(true);
    try {
      const r = await api.post('/listas', { requester_id: userId, nome: nomeLista.trim(), emoji: emojiLista });
      setListas(ls => [...ls, r.data]);
      setAtiva(r.data.id);
      setNovaLista(false);
      setNomeLista('');
      setEmojiLista('📝');
    } catch {
      toast('Erro ao criar lista', 'error');
    }
    setSalvando(false);
  };

  const apagarLista = async (lista) => {
    if (!confirm(`Apagar a lista "${lista.nome}"? Isso remove todos os itens dela.`)) return;
    try {
      await api.delete(`/listas/${lista.id}?requester_id=${userId}`);
      setListas(ls => ls.filter(l => l.id !== lista.id));
      if (ativa === lista.id) setAtiva(null);
    } catch {
      toast('Erro ao apagar lista', 'error');
    }
  };

  const adicionarItem = async (texto) => {
    const t = (texto ?? novoItem).trim();
    if (!t || !ativa) return;
    try {
      const r = await api.post(`/listas/${ativa}/itens`, { requester_id: userId, texto: t });
      setListas(ls => ls.map(l => l.id === ativa ? { ...l, itens: [...l.itens, r.data] } : l));
      setNovoItem('');
    } catch {
      toast('Erro ao adicionar item', 'error');
    }
  };

  const toggleItem = async (item) => {
    setListas(ls => ls.map(l => l.id === ativa
      ? { ...l, itens: l.itens.map(i => i.id === item.id ? { ...i, concluido: !i.concluido } : i) }
      : l));
    try {
      await api.put(`/listas/itens/${item.id}`, { requester_id: userId, concluido: !item.concluido });
    } catch {
      toast('Erro ao atualizar item', 'error');
      load();
    }
  };

  const apagarItem = async (item) => {
    setListas(ls => ls.map(l => l.id === ativa ? { ...l, itens: l.itens.filter(i => i.id !== item.id) } : l));
    try {
      await api.delete(`/listas/itens/${item.id}?requester_id=${userId}`);
    } catch {
      toast('Erro ao apagar item', 'error');
      load();
    }
  };

  const iniciarVoz = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      toast('Reconhecimento de voz não é suportado neste navegador (comum no iPhone). Digite o item normalmente.', 'error');
      return;
    }
    const rec = new SR();
    rec.lang = 'pt-BR';
    rec.onstart = () => setOuvindo(true);
    rec.onend = () => setOuvindo(false);
    rec.onerror = () => setOuvindo(false);
    rec.onresult = (e) => {
      const texto = e.results[0][0].transcript;
      adicionarItem(texto);
    };
    recRef.current = rec;
    rec.start();
  };

  if (loading) {
    return <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Carregando...</div>;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Listas</h1>
          <p className="page-subtitle">Suas listas pessoais — só você vê</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setNovaLista(true)}>
          <Plus size={14}/> Nova lista
        </button>
      </div>

      {listas.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <ListChecks size={48} style={{ opacity: .15, marginBottom: 12 }}/>
          <h3>Nenhuma lista ainda</h3>
          <p style={{ color: 'var(--text-muted)', marginTop: 6, fontSize: 13 }}>
            Crie sua primeira lista — mercado, lembretes, o que precisar.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* Lista de listas */}
          <div className="card" style={{ width: 220, flexShrink: 0, padding: 10 }}>
            {listas.map(l => (
              <div key={l.id}
                onClick={() => setAtiva(l.id)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '9px 10px', borderRadius: 8, cursor: 'pointer', marginBottom: 2,
                  background: ativa === l.id ? 'var(--primary)15' : 'transparent',
                  color: ativa === l.id ? 'var(--primary)' : 'var(--text)',
                  fontWeight: ativa === l.id ? 700 : 500, fontSize: 14,
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {l.emoji} {l.nome}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, marginLeft: 6 }}>
                  {l.itens.filter(i => !i.concluido).length}
                </span>
              </div>
            ))}
          </div>

          {/* Conteúdo da lista ativa */}
          {listaAtiva && (
            <div className="card" style={{ flex: 1, minWidth: 280 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 800 }}>{listaAtiva.emoji} {listaAtiva.nome}</h2>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {listaAtiva.itens.length} {listaAtiva.itens.length === 1 ? 'item' : 'itens'} · {listaAtiva.itens.filter(i => i.concluido).length} concluído{listaAtiva.itens.filter(i => i.concluido).length !== 1 ? 's' : ''}
                  </p>
                </div>
                <button className="btn-icon" onClick={() => apagarLista(listaAtiva)} title="Apagar lista" style={{ color: 'var(--danger)' }}>
                  <Trash2 size={16}/>
                </button>
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <input className="input" style={{ flex: 1 }} value={novoItem}
                  onChange={e => setNovoItem(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && adicionarItem()}
                  placeholder="Adicionar item..."/>
                <button
                  className="btn-icon"
                  onClick={iniciarVoz}
                  title={SpeechSupported() ? 'Adicionar por voz' : 'Voz não disponível neste navegador'}
                  style={{
                    background: ouvindo ? 'var(--primary)' : 'var(--surface-2)',
                    color: ouvindo ? '#fff' : 'var(--text-muted)',
                    width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                  }}
                >
                  <Mic size={16}/>
                </button>
              </div>

              {listaAtiva.itens.length === 0 ? (
                <p style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                  Nenhum item ainda. Adicione o primeiro acima.
                </p>
              ) : (
                <div>
                  {listaAtiva.itens.map(item => (
                    <div key={item.id} style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 2px',
                      borderBottom: '1px solid var(--border)',
                    }}>
                      <div onClick={() => toggleItem(item)} style={{
                        width: 20, height: 20, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
                        border: `2px solid ${item.concluido ? 'var(--primary)' : 'var(--text-muted)'}`,
                        background: item.concluido ? 'var(--primary)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {item.concluido && <span style={{ color: '#fff', fontSize: 11 }}>✓</span>}
                      </div>
                      <span style={{
                        flex: 1, fontSize: 14,
                        color: item.concluido ? 'var(--text-muted)' : 'var(--text)',
                        textDecoration: item.concluido ? 'line-through' : 'none',
                      }}>
                        {item.texto}
                      </span>
                      <button className="btn-icon" onClick={() => apagarItem(item)} style={{ color: 'var(--text-muted)' }}>
                        <X size={14}/>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {novaLista && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setNovaLista(false)}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-header">
              <span className="modal-title">Nova lista</span>
              <button className="btn-icon" onClick={() => setNovaLista(false)}><X size={16}/></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Ícone</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {EMOJIS.map(e => (
                    <button key={e} onClick={() => setEmojiLista(e)} style={{
                      width: 36, height: 36, borderRadius: 8, fontSize: 18, cursor: 'pointer',
                      border: `2px solid ${emojiLista === e ? 'var(--primary)' : 'var(--border)'}`,
                      background: emojiLista === e ? 'var(--primary)15' : 'var(--surface-2)',
                    }}>{e}</button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Nome da lista</label>
                <input className="input" autoFocus value={nomeLista}
                  onChange={e => setNomeLista(e.target.value)}
                  placeholder="Ex: Mercado, Pra lembrar..."
                  onKeyDown={e => e.key === 'Enter' && criarLista()}/>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                <button className="btn btn-ghost" onClick={() => setNovaLista(false)}>Cancelar</button>
                <button className="btn btn-primary" onClick={criarLista} disabled={salvando}>
                  {salvando ? 'Criando...' : 'Criar lista'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
