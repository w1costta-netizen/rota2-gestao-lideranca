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
// Cores fortes, com o texto sempre em branco ou quase-preto — o que der
// mais contraste contra aquele fundo. Sem isso a letra se perde na cor.
//
// Cada combinação foi conferida pela régua da WCAG (mínimo 4.5 para texto
// normal). A mais apertada da paleta é o vermelho, com 4.6. Ao trocar
// qualquer cor daqui, refaça essa conta — a olho é fácil errar.
const CORES = {
  padrao:   { fundo: 'var(--surface-1)', texto: 'var(--text)', apoio: 'var(--text-muted)', nome: 'Sem cor' },
  preto:    { fundo: '#262626', texto: '#FFFFFF', apoio: '#DCDCDC', nome: 'Preto' },
  cinza:    { fundo: '#616161', texto: '#FFFFFF', apoio: '#EAEAEA', nome: 'Cinza' },
  vermelho: { fundo: '#C62828', texto: '#FFFFFF', apoio: '#FBE3E3', nome: 'Vermelho' },
  laranja:  { fundo: '#E8681A', texto: '#1A1A1A', apoio: '#2E1B0C', nome: 'Laranja' },
  amarelo:  { fundo: '#F5C518', texto: '#1A1A1A', apoio: '#3D3308', nome: 'Amarelo' },
  verde:    { fundo: '#2E7D32', texto: '#FFFFFF', apoio: '#F0F9F1', nome: 'Verde' },
  azul:     { fundo: '#1565C0', texto: '#FFFFFF', apoio: '#E3EEFA', nome: 'Azul' },
  roxo:     { fundo: '#5E35B1', texto: '#FFFFFF', apoio: '#EAE3F7', nome: 'Roxo' },
  rosa:     { fundo: '#C2185B', texto: '#FFFFFF', apoio: '#FBE3ED', nome: 'Rosa' },
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

  // Cor da anotação aberta na janela de edição. Cai no padrão quando a cor
  // gravada não existe mais — evita tela quebrada se a paleta mudar.
  const corAtual = (editando && CORES[editando.cor]) || CORES.padrao;

  if (carregando) {
    return <div className="card" style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>Carregando...</div>;
  }

  const Cartao = ({ a }) => {
    const c = CORES[a.cor] || CORES.padrao;
    // Os ícones usam a cor do título, não a do texto de apoio, e sem
    // transparência: apagados, eles somem no cartão colorido. O padding
    // existe para o dedo — o ícone tem 16px, mas a área de toque fica com
    // ~30px, que é o mínimo para acertar no celular sem errar o vizinho.
    const botaoIcone = {
      background:'none', border:'none', cursor:'pointer', color:c.texto,
      padding:7, margin:-7, borderRadius:8, display:'flex', alignItems:'center',
    };
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
            aria-label={a.fixada ? 'Desafixar anotação' : 'Fixar anotação no topo'}
            style={{ ...botaoIcone, flexShrink:0 }}>
            {a.fixada ? <Pin size={17}/> : <PinOff size={17}/>}
          </button>
        </div>
        {a.texto && (
          <div style={{ fontSize:13, color:c.apoio, lineHeight:1.55, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
            {a.texto}
          </div>
        )}
        <div style={{ display:'flex', gap:16, marginTop:12 }}>
          <button
            onClick={(e) => { e.stopPropagation(); alternar(a, 'arquivada'); }}
            title={a.arquivada ? 'Tirar do arquivo' : 'Arquivar'}
            aria-label={a.arquivada ? 'Tirar do arquivo' : 'Arquivar anotação'}
            style={botaoIcone}>
            {a.arquivada ? <ArchiveRestore size={17}/> : <Archive size={17}/>}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); excluir(a); }}
            title="Excluir"
            aria-label="Excluir anotação"
            style={botaoIcone}>
            <Trash2 size={17}/>
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
          placeholder="Buscar nas anotações" spellCheck={false}
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
            style={{ background:corAtual.fundo, borderRadius:14,
                     width:'100%', maxWidth:460, padding:'18px 18px 14px', maxHeight:'90vh', overflowY:'auto' }}>
            <input
              value={editando.titulo}
              onChange={e => setEditando({ ...editando, titulo:e.target.value })}
              placeholder="Título"
              style={{ border:'none', background:'none', outline:'none', width:'100%',
                       fontSize:16, fontWeight:600, marginBottom:8,
                       color:corAtual.texto }}/>
            <textarea
              value={editando.texto}
              onChange={e => setEditando({ ...editando, texto:e.target.value })}
              placeholder="Escreva aqui..."
              rows={8}
              style={{ border:'none', background:'none', outline:'none', width:'100%', resize:'vertical',
                       fontSize:14, lineHeight:1.6, fontFamily:'inherit',
                       color:corAtual.apoio }}/>

            <div style={{ display:'flex', gap:7, margin:'12px 0 14px', flexWrap:'wrap' }}>
              {Object.entries(CORES).map(([chave, c]) => (
                <button
                  key={chave} title={c.nome}
                  onClick={() => setEditando({ ...editando, cor:chave })}
                  style={{ width:24, height:24, borderRadius:'50%', cursor:'pointer', background:c.fundo,
                           border: editando.cor === chave ? '2px solid var(--accent)' : '0.5px solid var(--border)' }}/>
              ))}
            </div>

            {/* Os botões não podem usar a cor do tema: num cartão preto ou
                vermelho eles sumiriam. Aqui a cor vem do próprio cartão —
                o texto usa a cor do título, e o "Salvar" inverte fundo e
                texto, o que garante contraste em qualquer cor da paleta. */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10 }}>
              <button
                onClick={ouvindo ? pararDitado : ditar}
                title={vozDisponivel() ? 'Ditar o texto' : 'Ditado não disponível neste navegador'}
                style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:12.5,
                         background:'none', border:'none', padding:'6px 4px',
                         color: ouvindo ? '#FF5252' : corAtual.texto }}>
                <Mic size={14}/> {ouvindo ? 'Parar' : 'Ditar'}
              </button>
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                {editando.id && (
                  <button
                    onClick={() => excluir(editando)}
                    style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:12.5,
                             background:'none', border:'none', padding:'6px 8px', color: corAtual.texto }}>
                    <Trash2 size={14}/> Excluir
                  </button>
                )}
                <button
                  onClick={salvar}
                  style={{ cursor:'pointer', fontSize:13, fontWeight:600, padding:'8px 18px',
                           borderRadius:'var(--radius)', border:'none',
                           background: corAtual.texto, color: corAtual.fundo }}>
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
