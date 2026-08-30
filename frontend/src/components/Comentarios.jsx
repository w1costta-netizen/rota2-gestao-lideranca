import React, { useState, useCallback } from 'react';
import { MessageSquare, ChevronDown, ChevronUp, Send, Pencil, Trash2 } from 'lucide-react';
import api from '../api';
import { useToast } from './Toast';

// Comentários reutilizáveis. Usado no Mural e nos Comunicados — as duas rotas
// do backend têm o mesmo formato, então basta trocar o "recurso":
//   /mural/:id/comentarios        e  /mural/comentarios/:cid
//   /comunicados/:id/comentarios  e  /comunicados/comentarios/:cid
//
// Os comentários só são buscados quando a pessoa abre a seção: numa lista com
// muitos cards, carregar tudo de uma vez deixaria a tela lenta à toa.
export default function Comentarios({ recurso, itemId, userId, podeModerar = false }) {
  const toast = useToast();
  const [comentarios, setComentarios] = useState([]);
  const [carregando, setCarregando]   = useState(false);
  const [carregou, setCarregou]       = useState(false);
  const [aberto, setAberto]           = useState(false);
  const [texto, setTexto]             = useState('');
  const [enviando, setEnviando]       = useState(false);
  const [editandoId, setEditandoId]   = useState(null);
  const [textoEdicao, setTextoEdicao] = useState('');

  const carregar = useCallback(async () => {
    if (carregou) return;
    setCarregando(true);
    try {
      const r = await api.get(`/${recurso}/${itemId}/comentarios?requester_id=${userId}`);
      setComentarios(Array.isArray(r.data) ? r.data : []);
      setCarregou(true);
    } catch { toast('Erro ao carregar comentários', 'error'); }
    finally { setCarregando(false); }
  }, [recurso, itemId, userId, carregou, toast]);

  const alternar = () => { if (!aberto) carregar(); setAberto(a => !a); };

  const enviar = async () => {
    if (!texto.trim()) return;
    setEnviando(true);
    try {
      const r = await api.post(`/${recurso}/${itemId}/comentarios`, { requester_id: userId, text: texto.trim() });
      setComentarios(c => [...c, r.data]);
      setTexto('');
    } catch (e) { toast(e.response?.data?.error || 'Erro ao comentar', 'error'); }
    finally { setEnviando(false); }
  };

  const salvarEdicao = async (id) => {
    if (!textoEdicao.trim()) return;
    try {
      const r = await api.put(`/${recurso}/comentarios/${id}`, { requester_id: userId, text: textoEdicao.trim() });
      setComentarios(cs => cs.map(c => c.id === id ? r.data : c));
      setEditandoId(null);
    } catch (e) { toast(e.response?.data?.error || 'Erro ao editar', 'error'); }
  };

  const apagar = async (id) => {
    if (!window.confirm('Apagar este comentário?')) return;
    try {
      await api.delete(`/${recurso}/comentarios/${id}?requester_id=${userId}`);
      setComentarios(cs => cs.filter(c => c.id !== id));
    } catch (e) { toast(e.response?.data?.error || 'Erro ao apagar', 'error'); }
  };

  return (
    <div style={{ marginTop:10, borderTop:'1px solid var(--border)', paddingTop:8 }}>
      <button onClick={alternar} style={{ background:'none', border:'none', cursor:'pointer',
        display:'flex', alignItems:'center', gap:5, fontSize:12, color:'var(--text-muted)', padding:0 }}>
        <MessageSquare size={13}/>
        {aberto ? 'Ocultar comentários' : `Comentários${carregou && comentarios.length ? ` (${comentarios.length})` : ''}`}
        {aberto ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
      </button>

      {aberto && (
        <div style={{ marginTop:8 }}>
          {carregando && <div style={{ fontSize:12, color:'var(--text-muted)' }}>Carregando...</div>}
          {!carregando && comentarios.length === 0 && (
            <div style={{ fontSize:12, color:'var(--text-muted)', fontStyle:'italic' }}>
              Nenhum comentário ainda. Seja o primeiro.
            </div>
          )}

          <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:8 }}>
            {comentarios.map(c => {
              const souAutor = c.user_id === userId;
              return (
                <div key={c.id} style={{ background:'var(--bg)', borderRadius:8, padding:'8px 10px', border:'1px solid var(--border)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:2 }}>
                    <span style={{ fontSize:11, fontWeight:700, color:'var(--primary)' }}>
                      {c.author?.full_name || 'Usuário'}
                    </span>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ fontSize:10, color:'var(--text-muted)' }}>
                        {c.created_at ? new Date(c.created_at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : ''}
                        {c.updated_at ? ' · editado' : ''}
                      </span>
                      {souAutor && editandoId !== c.id && (
                        <button onClick={() => { setEditandoId(c.id); setTextoEdicao(c.text); }} title="Editar"
                          style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:0, lineHeight:1 }}>
                          <Pencil size={11}/>
                        </button>
                      )}
                      {(souAutor || podeModerar) && editandoId !== c.id && (
                        <button onClick={() => apagar(c.id)} title={souAutor ? 'Apagar' : 'Apagar (moderação)'}
                          style={{ background:'none', border:'none', cursor:'pointer', color:'#ef4444', padding:0, lineHeight:1 }}>
                          <Trash2 size={11}/>
                        </button>
                      )}
                    </div>
                  </div>

                  {editandoId === c.id ? (
                    <div style={{ display:'flex', gap:6, marginTop:4 }}>
                      <textarea value={textoEdicao} onChange={e => setTextoEdicao(e.target.value)}
                        rows={2} autoFocus
                        style={{ flex:1, padding:'6px 8px', borderRadius:6, border:'1px solid var(--primary)',
                          background:'var(--bg)', color:'var(--text)', fontSize:12,
                          resize:'none', fontFamily:'inherit', lineHeight:'1.4' }}/>
                      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                        <button onClick={() => salvarEdicao(c.id)}
                          style={{ background:'var(--primary)', border:'none', borderRadius:6, padding:'5px 8px',
                            cursor:'pointer', color:'#fff', fontSize:11, fontWeight:700 }}>✓</button>
                        <button onClick={() => setEditandoId(null)}
                          style={{ background:'none', border:'1px solid var(--border)', borderRadius:6, padding:'5px 8px',
                            cursor:'pointer', color:'var(--text-muted)', fontSize:11 }}>✕</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize:12, color:'var(--text)', lineHeight:1.4, whiteSpace:'pre-wrap' }}>{c.text}</div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ display:'flex', gap:6 }}>
            <textarea value={texto} onChange={e => setTexto(e.target.value)}
              placeholder="Escrever um comentário..."
              rows={1}
              style={{ flex:1, padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)',
                background:'var(--bg)', color:'var(--text)', fontSize:12,
                resize:'none', overflowY:'hidden', lineHeight:'1.4', fontFamily:'inherit' }}
              onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}/>
            <button onClick={enviar} disabled={enviando || !texto.trim()} style={{
              background:'var(--primary)', border:'none', borderRadius:8, padding:'7px 10px',
              cursor:'pointer', color:'#fff', display:'flex', alignItems:'center',
              opacity: enviando || !texto.trim() ? 0.5 : 1 }}>
              <Send size={13}/>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
