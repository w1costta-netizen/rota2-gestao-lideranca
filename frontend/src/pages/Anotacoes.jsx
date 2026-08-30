import React, { useEffect, useState, useRef } from 'react';
import { Plus, Mic, Trash2, X, Pin, PinOff, Search, Archive, ArchiveRestore, StickyNote } from 'lucide-react';
import api from '../api';
import { useToast } from '../components/Toast';

// ─────────────────────────────────────────────────────────────
// Anotações pessoais — modelo Google Keep: cartão colorido, fixar no topo,
// busca e voz. Só o próprio usuário vê as suas.
//
// A cor é guardada por nome e traduzida aqui, para o mesmo cartão funcionar
// no tema claro e no escuro sem precisar migrar dado.
// ─────────────────────────────────────────────────────────────
const CORES = {
  padrao:  { fundo: 'var(--surface-1)', texto: 'var(--text)',    apoio: 'var(--text-muted)', nome: 'Sem cor' },
  amarelo: { fundo: '#FAEEDA',          texto: '#412402',        apoio: '#854F0B',           nome: 'Amarelo' },
  verde:   { fundo: '#E1F5EE',          texto: '#04342C',        apoio: '#0F6E56',           nome: 'Verde' },
  roxo:    { fundo: '#EEEDFE',          texto: '#26215C',        apoio: '#534AB7',           nome: 'Roxo' },
  coral:   { fundo: '#FAECE7',          texto: '#4A1B0C',        apoio: '#993C1D',           nome: 'Coral' },
  azul:    { fundo: '#E6F1FB',          texto: '#042C53',        apoio: '#185FA5',           nome: 'Azul' },
};

function vozDisponivel() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export default function Anotacoes({ userId }) {
  const toast = useToast();
  const [anotacoes, setAnotacoes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [vendoArquivadas, setVendoArquivadas] = useState(false);
  const [editando, setEditando] = useState(null); // null = fechado
  const [ouvindo, setOuvindo] = useState(false);
  const recRef = useRef(null);

  const carregar = async (arquivadas = vendoArquivadas) => {
    try {
      const r = await api.get(`/anotacoes?requester_id=${userId}&arquivadas=${arquivadas ? 1 : 0}`);
      setAnotacoes(r.data || []);
    } catch {
      toast('Não foi possível carregar as anotações.', 'error');
    }
    setCarregando(false);
  };

  useEffect(() => { if (userId) carregar(); }, [userId, vendoArquivadas]);

  const abrirNova = () => setEditando({ id: null, titulo: '', texto: '', cor: 'padrao' });

  const salvar = async () => {
    const { id, titulo, texto, cor } = editando;
    if (!titulo.trim() && !texto.trim()) { setEditando(null); return; }
    try {
      if (id) await api.put(`/anotacoes/${id}`, { requester_id: userId, titulo, texto, cor });
      else    await api.post('/anotacoes', { requester_id: userId, titulo, texto, cor });
      setEditando(null);
      carregar();
    } catch (e) {
      toast(e?.response?.data?.error || 'Erro ao salvar.', 'error');
    }
  };

  // Alterações de um toque (fixar, arquivar) atualizam a tela na hora e só
  // depois vão ao servidor — esperando a resposta, o toque parece travado.
  const alternar = async (a, campo) => {
    setAnotacoes(lista => lista.map(x => x.id === a.id ? { ...x, [campo]: !x[campo] } : x));
    try {
      await api.put(`/anotacoes/${a.id}`, { requester_id: userId, [campo]: !a[campo] });
      carregar();
    } catch {
      toast('Não foi possível salvar.', 'error');
      carregar();
    }
  };

  const excluir = async (a) => {
    if (!window.confirm('Excluir esta anotação?')) return;
    try {
      await api.delete(`/anotacoes/${a.id}?requester_id=${userId}`);
      setEditando(null);
      carregar();
    } catch {
      toast('Não foi possível excluir.', 'error');
    }
  };

  const ditar = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      toast('Ditado não é suportado neste navegador (comum no iPhone). Escreva normalmente.', 'error');
      return;
    }
    const rec = new SR();
    rec.lang = 'pt-BR';
    rec.continuous = true;      // anotação costuma ser mais longa que um item de lista
    rec.interimResults = false;
    rec.onstart = () => setOuvindo(true);
    rec.onend   = () => setOuvindo(false);
    rec.onerror = () => setOuvindo(false);
    rec.onresult = (e) => {
      const trecho = e.results[e.results.length - 1][0].transcript.trim();
      setEditando(ed => ({ ...ed, texto: ed.texto ? `${ed.texto} ${trecho}` : trecho }));
    };
    recRef.current = rec;
    rec.start();
  };

  const pararDitado = () => { try { recRef.current?.stop(); } catch { /* já parou */ } };

  const termo = busca.trim().toLowerCase();
  const visiveis = termo
    ? anotacoes.filter(a => `${a.titulo} ${a.texto}`.toLowerCase().includes(termo))
    : anotacoes;
  const fixadas = visiveis.filter(a => a.fixada);
  const demais  = visiveis.filter(a => !a.fixada);

  if (carregando) {
    return <div className="card" style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>Carregando...</div>;
  }

  const Cartao = ({ a }) => {
    const c = CORES[a.cor] || CORES.padrao;
    return (
      <div
        onClick={() => setEditando({ id:a.id, titulo:a.titulo, texto:a.texto, cor:a.cor })}
        style={{
          background:c.fundo, borderRadius:12, padding:'12px 14px', cursor:'pointer',
          border: a.cor === 'padrao' ? '0.5px solid var(--border)' : 'none',
          breakInside:'avoid', marginBottom:10,
        }}>
        <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
          {a.titulo && (
            <div style={{ fontWeight:600, fontSize:14, color:c.texto, marginBottom:4, wordBreak:'break-word' }}>{a.titulo}</div>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); alternar(a, 'fixada'); }}
            title={a.fixada ? 'Desafixar' : 'Fixar no topo'}
            style={{ background:'none', border:'none', cursor:'pointer', color:c.apoio, padding:0, flexShrink:0 }}>
            {a.fixada ? <Pin size={15}/> : <PinOff size={15} style={{ opacity:.45 }}/>}
          </button>
        </div>
        {a.texto && (
          <div style={{ fontSize:13, color:c.apoio, lineHeight:1.55, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
            {a.texto}
          </div>
        )}
        <div style={{ display:'flex', gap:10, marginTop:10 }}>
          <button
            onClick={(e) => { e.stopPropagation(); alternar(a, 'arquivada'); }}
            title={a.arquivada ? 'Tirar do arquivo' : 'Arquivar'}
            style={{ background:'none', border:'none', cursor:'pointer', color:c.apoio, padding:0, opacity:.6 }}>
            {a.arquivada ? <ArchiveRestore size={14}/> : <Archive size={14}/>}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); excluir(a); }}
            title="Excluir"
            style={{ background:'none', border:'none', cursor:'pointer', color:c.apoio, padding:0, opacity:.6 }}>
            <Trash2 size={14}/>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap', marginBottom:6 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700 }}>Anotações</h1>
          <p style={{ color:'var(--text-muted)', fontSize:13, marginTop:2 }}>
            Suas anotações pessoais — ninguém mais vê o que você escreve aqui.
          </p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={() => setVendoArquivadas(v => !v)}>
            <Archive size={14}/> {vendoArquivadas ? 'Ver ativas' : 'Arquivadas'}
          </button>
          {!vendoArquivadas && (
            <button className="btn btn-primary" onClick={abrirNova}><Plus size={15}/> Nova</button>
          )}
        </div>
      </div>

      <div className="card" style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', marginBottom:16 }}>
        <Search size={15} style={{ color:'var(--text-muted)', flexShrink:0 }}/>
        <input
          value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar nas anotações"
          style={{ border:'none', background:'none', outline:'none', width:'100%', fontSize:13, color:'var(--text)' }}/>
        {busca && (
          <button onClick={() => setBusca('')} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:0 }}>
            <X size={15}/>
          </button>
        )}
      </div>

      {visiveis.length === 0 && (
        <div className="card" style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>
          <StickyNote size={30} style={{ opacity:.4, marginBottom:10 }}/>
          <div style={{ fontSize:14 }}>
            {termo ? 'Nenhuma anotação encontrada.'
              : vendoArquivadas ? 'Nada arquivado por aqui.'
              : 'Sua primeira anotação começa no botão "Nova".'}
          </div>
        </div>
      )}

      {fixadas.length > 0 && (
        <>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:8, display:'flex', alignItems:'center', gap:5 }}>
            <Pin size={12}/> FIXADAS
          </div>
          {/* Colunas de altura variável, como um mural de post-its: o cartão
              ocupa só a altura do que tem dentro, em vez de esticar todos. */}
          <div style={{ columns:'240px', columnGap:10, marginBottom:18 }}>
            {fixadas.map(a => <Cartao key={a.id} a={a}/>)}
          </div>
        </>
      )}

      {demais.length > 0 && (
        <>
          {fixadas.length > 0 && (
            <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:8 }}>OUTRAS</div>
          )}
          <div style={{ columns:'240px', columnGap:10 }}>
            {demais.map(a => <Cartao key={a.id} a={a}/>)}
          </div>
        </>
      )}

      {editando && (
        <div
          onClick={() => salvar()}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000,
                   display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{ background:(CORES[editando.cor] || CORES.padrao).fundo, borderRadius:14,
                     width:'100%', maxWidth:460, padding:'18px 18px 14px', maxHeight:'90vh', overflowY:'auto' }}>
            <input
              value={editando.titulo}
              onChange={e => setEditando({ ...editando, titulo:e.target.value })}
              placeholder="Título"
              style={{ border:'none', background:'none', outline:'none', width:'100%',
                       fontSize:16, fontWeight:600, marginBottom:8,
                       color:(CORES[editando.cor] || CORES.padrao).texto }}/>
            <textarea
              value={editando.texto}
              onChange={e => setEditando({ ...editando, texto:e.target.value })}
              placeholder="Escreva aqui..."
              rows={8}
              style={{ border:'none', background:'none', outline:'none', width:'100%', resize:'vertical',
                       fontSize:14, lineHeight:1.6, fontFamily:'inherit',
                       color:(CORES[editando.cor] || CORES.padrao).apoio }}/>

            <div style={{ display:'flex', gap:7, margin:'12px 0 14px', flexWrap:'wrap' }}>
              {Object.entries(CORES).map(([chave, c]) => (
                <button
                  key={chave} title={c.nome}
                  onClick={() => setEditando({ ...editando, cor:chave })}
                  style={{ width:24, height:24, borderRadius:'50%', cursor:'pointer', background:c.fundo,
                           border: editando.cor === chave ? '2px solid var(--accent)' : '0.5px solid var(--border)' }}/>
              ))}
            </div>

            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10 }}>
              <button
                className="btn btn-ghost" style={{ fontSize:12 }}
                onClick={ouvindo ? pararDitado : ditar}
                title={vozDisponivel() ? 'Ditar o texto' : 'Ditado não disponível neste navegador'}>
                <Mic size={14} style={{ color: ouvindo ? 'var(--danger)' : undefined }}/>
                {ouvindo ? 'Parar' : 'Ditar'}
              </button>
              <div style={{ display:'flex', gap:8 }}>
                {editando.id && (
                  <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={() => excluir(editando)}>
                    <Trash2 size={14}/> Excluir
                  </button>
                )}
                <button className="btn btn-primary" onClick={salvar}>Salvar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
