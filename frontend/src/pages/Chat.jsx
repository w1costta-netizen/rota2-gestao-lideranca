import React, { useEffect, useRef, useState } from 'react';
import { Send, Plus, Search, X, ArrowLeft, MessageCircle, Paperclip, Mic, Trash2, CornerUpLeft, Share2, Copy } from 'lucide-react';
import api from '../api';
import { useToast } from '../components/Toast';
import Avatar from '../components/Avatar';
import { comprimirImagem } from '../lib/imagem';

// ─────────────────────────────────────────────────────────────
// Conversas — chat entre duas pessoas da mesma loja.
//
// A tela busca mensagens novas a cada poucos segundos enquanto está aberta,
// em vez de manter conexão permanente. Conexão permanente exigiria abrir o
// banco direto para o navegador, que é o tipo de mudança que já causou
// vazamento entre lojas neste app. Alguns segundos ninguém percebe numa
// conversa de trabalho; o risco, sim.
// ─────────────────────────────────────────────────────────────
const INTERVALO_MENSAGENS = 4000;   // conversa aberta
const INTERVALO_LISTA     = 15000;  // lista de conversas

function tamanhoLegivel(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function horaCurta(iso) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function diaCurto(iso) {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(); ontem.setDate(hoje.getDate() - 1);
  const mesmoDia = (a, b) => a.toDateString() === b.toDateString();
  if (mesmoDia(d, hoje))  return 'Hoje';
  if (mesmoDia(d, ontem)) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function Chat({ userId }) {
  const toast = useToast();
  const [conversas, setConversas] = useState([]);
  const [aberta, setAberta] = useState(null);
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [escolhendo, setEscolhendo] = useState(false);
  const [contatos, setContatos] = useState([]);
  const [buscaContato, setBuscaContato] = useState('');

  const fimRef = useRef(null);
  const abertaRef = useRef(null);
  abertaRef.current = aberta;

  const arquivoRef = useRef(null);
  const textoRef = useRef(null);

  // Ações sobre uma mensagem: o menu aberto, a que está sendo respondida e
  // a que está sendo encaminhada. Três estados separados porque as três
  // coisas podem acontecer em sequência sem se atrapalhar.
  const [menuMsg, setMenuMsg]       = useState(null);
  const [respondendo, setRespondendo] = useState(null);
  const [encaminhando, setEncaminhando] = useState(null);

  const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

  const reagir = async (m, emoji) => {
    setMenuMsg(null);
    try {
      const r = await api.post(`/chat/mensagens/${m.id}/reacao`, { requester_id: userId, emoji });
      // Atualiza na tela sem esperar a próxima busca: reação precisa
      // responder na hora, senão a pessoa toca de novo achando que falhou.
      setMensagens(lista => lista.map(x => {
        if (x.id !== m.id) return x;
        const semAMinha = (x.reacoes || []).filter(re => re.user_id !== userId);
        return { ...x, reacoes: r.data.emoji ? [...semAMinha, { user_id: userId, emoji: r.data.emoji }] : semAMinha };
      }));
    } catch {
      toast('Não foi possível reagir.', 'error');
    }
  };

  const copiar = async (m) => {
    setMenuMsg(null);
    try {
      await navigator.clipboard.writeText(m.texto || m.arquivo_nome || '');
      toast('Copiado.');
    } catch {
      toast('Seu navegador não deixou copiar.', 'error');
    }
  };

  const encaminharPara = async (conversaDestino) => {
    const m = encaminhando;
    setEncaminhando(null);
    try {
      await api.post('/chat/encaminhar', {
        requester_id: userId, mensagem_id: m.id, conversa_id: conversaDestino.id,
      });
      toast(`Encaminhada para ${conversaDestino.outro?.full_name || 'a conversa'}.`);
      carregarConversas();
    } catch (e) {
      toast(e?.response?.data?.error || 'Não foi possível encaminhar.', 'error');
    }
  };

  const [enviandoAnexo, setEnviandoAnexo] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const gravadorRef = useRef(null);
  const relogioRef = useRef(null);

  // O arquivo sobe DIRETO do aparelho para o armazenamento, com uma
  // autorização temporária que o servidor emite. Não passa pelo servidor,
  // que no plano gratuito tem banda limitada.
  const enviarArquivo = async (blob, nome, tipo, duracao) => {
    if (!aberta) return;
    setEnviandoAnexo(true);
    try {
      const permissao = await api.post('/chat/anexo', {
        requester_id: userId, conversa_id: aberta.id, nome, tamanho: blob.size,
      });
      const { path, url, token } = permissao.data;

      const envio = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': blob.type || 'application/octet-stream', 'x-upsert': 'true', Authorization: `Bearer ${token}` },
        body: blob,
      });
      if (!envio.ok) throw new Error('falha no envio do arquivo');

      const r = await api.post('/chat/mensagens', {
        requester_id: userId, conversa_id: aberta.id, tipo,
        arquivo_path: path, arquivo_nome: nome, arquivo_tamanho: blob.size, duracao,
      });
      setMensagens(m => [...m, r.data]);
      carregarConversas();
    } catch (e) {
      toast(e?.response?.data?.error || 'Não foi possível enviar o arquivo.', 'error');
    }
    setEnviandoAnexo(false);
  };

  // Foto vai reduzida; qualquer outro arquivo vai como está.
  //
  // Antes a foto subia no tamanho original — 4 a 8 MB vindos da galeria de
  // um celular. Isso deixava o envio lento, gastava dado de quem está na
  // rua e podia estourar o limite de 20 MB. Reduzir também tira o pico de
  // memória que derrubava o app em aparelho simples.
  const prepararEEnviar = async (f, nome) => {
    if (!f.type?.startsWith('image/')) {
      return enviarArquivo(f, nome, 'arquivo');
    }
    try {
      const menor = await comprimirImagem(f, 1600, 1600, 0.8);
      return enviarArquivo(menor, nome.replace(/\.[^.]+$/, '') + '.jpg', 'imagem');
    } catch {
      // Formato que este aparelho não decodifica: manda como veio, que é
      // melhor do que não mandar. O servidor ainda barra acima de 20 MB.
      return enviarArquivo(f, nome, 'imagem');
    }
  };

  const escolherArquivo = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    prepararEEnviar(f, f.name);
  };

  // Colar imagem direto na caixa de mensagem: print de tela, foto copiada
  // de outro aplicativo. No computador é como as pessoas já esperam
  // trabalhar, e sem isto a única saída era salvar o arquivo antes.
  const colarNaMensagem = (e) => {
    const itens = Array.from(e.clipboardData?.items || []);
    const imagem = itens.find(i => i.type?.startsWith('image/'));
    if (!imagem) return;              // texto normal segue o caminho de sempre
    const f = imagem.getAsFile();
    if (!f) return;
    e.preventDefault();
    const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
    prepararEEnviar(f, f.name || `imagem-colada.${ext}`);
  };

  const gravar = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast('Este navegador não grava áudio. Escreva a mensagem.', 'error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Cada navegador grava num formato: o Safari em mp4, o Chrome em webm.
      // Deixar o navegador escolher evita gravação que não toca depois.
      const formatos = ['audio/mp4', 'audio/webm'];
      const suportado = formatos.find(f => MediaRecorder.isTypeSupported?.(f));
      const rec = new MediaRecorder(stream, suportado ? { mimeType: suportado } : undefined);
      const pedacos = [];

      rec.ondataavailable = ev => { if (ev.data.size) pedacos.push(ev.data); };
      rec.onstop = () => {
        // Desliga o microfone. Sem isto o indicador de gravação fica aceso
        // no aparelho mesmo depois de terminar.
        stream.getTracks().forEach(t => t.stop());
        clearInterval(relogioRef.current);
        const total = segundosRef.current;
        setGravando(false);
        setSegundos(0);
        if (!pedacos.length || total < 1) return; // toque sem querer
        const blob = new Blob(pedacos, { type: rec.mimeType || 'audio/mp4' });
        const ext = (rec.mimeType || '').includes('webm') ? 'webm' : 'm4a';
        enviarArquivo(blob, `audio-${Date.now()}.${ext}`, 'audio', total);
      };

      gravadorRef.current = rec;
      rec.start();
      setGravando(true);
      setSegundos(0);
      segundosRef.current = 0;
      relogioRef.current = setInterval(() => {
        segundosRef.current += 1;
        setSegundos(segundosRef.current);
        if (segundosRef.current >= 300) pararGravacao(); // teto de 5 min
      }, 1000);
    } catch {
      toast('Não foi possível usar o microfone. Verifique a permissão nos ajustes.', 'error');
    }
  };

  const segundosRef = useRef(0);
  const pararGravacao = () => { try { gravadorRef.current?.stop(); } catch { /* já parou */ } };
  const cancelarGravacao = () => {
    // Marca como descartado antes de parar: o `onstop` só envia se passou de
    // 1 segundo, então zerar aqui faz a gravação ser jogada fora.
    segundosRef.current = 0;
    pararGravacao();
  };

  // Ao sair da tela, garante que o microfone não fique ligado.
  useEffect(() => () => {
    clearInterval(relogioRef.current);
    try { gravadorRef.current?.stream?.getTracks().forEach(t => t.stop()); } catch { /* nada */ }
  }, []);

  const carregarConversas = async () => {
    try {
      const r = await api.get(`/chat/conversas?requester_id=${userId}`);
      setConversas(r.data || []);
    } catch { /* silencioso: é atualização de fundo */ }
    setCarregando(false);
  };

  useEffect(() => {
    if (!userId) return;
    carregarConversas();
    const t = setInterval(carregarConversas, INTERVALO_LISTA);
    return () => clearInterval(t);
  }, [userId]);

  // Marca de tempo da última busca. O servidor devolve o que é novo E o que
  // mudou desde então — é assim que uma mensagem apagada pelo outro lado
  // some daqui sem precisar recarregar.
  const ultimaBuscaRef = useRef(null);

  const buscarNovas = async (conversaId) => {
    try {
      const p = new URLSearchParams({ requester_id: userId });
      if (ultimaBuscaRef.current) p.set('depois', ultimaBuscaRef.current);
      const agora = new Date().toISOString();
      const r = await api.get(`/chat/conversas/${conversaId}/mensagens?${p.toString()}`);
      ultimaBuscaRef.current = agora;

      const vindas = r.data || [];
      if (!vindas.length) return;
      setMensagens(atuais => {
        // Substitui a que já existe (caso de mensagem apagada) e acrescenta
        // as novas, mantendo a ordem por horário.
        const porId = new Map(atuais.map(m => [m.id, m]));
        vindas.forEach(m => porId.set(m.id, m));
        return [...porId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
      });
    } catch { /* silencioso */ }
  };

  const apagar = async (m) => {
    if (!window.confirm('Apagar esta mensagem para todos?')) return;
    try {
      await api.delete(`/chat/mensagens/${m.id}?requester_id=${userId}`);
      setMensagens(lista => lista.map(x => x.id === m.id
        ? { ...x, apagada: true, texto: '', tipo: 'texto', arquivo_url: null }
        : x));
      carregarConversas();
    } catch (e) {
      toast(e?.response?.data?.error || 'Não foi possível apagar.', 'error');
    }
  };

  const abrir = async (conversa) => {
    setAberta(conversa);
    setMensagens([]);
    try {
      // Abrir traz tudo; daqui em diante a busca é só do que mudar.
      const agora = new Date().toISOString();
      const r = await api.get(`/chat/conversas/${conversa.id}/mensagens?requester_id=${userId}`);
      ultimaBuscaRef.current = agora;
      setMensagens(r.data || []);
      await api.post(`/chat/conversas/${conversa.id}/lida`, { requester_id: userId });
      // Zera na tela sem esperar o próximo ciclo da lista.
      setConversas(lista => lista.map(c => c.id === conversa.id ? { ...c, nao_lidas: 0 } : c));
    } catch {
      toast('Não foi possível abrir a conversa.', 'error');
    }
  };

  useEffect(() => {
    if (!aberta) return;
    const t = setInterval(() => {
      const atual = abertaRef.current;
      if (atual) buscarNovas(atual.id);
    }, INTERVALO_MENSAGENS);
    return () => clearInterval(t);
  }, [aberta?.id]);

  // Sempre que chega mensagem, desce para o fim — senão a nova fica
  // escondida abaixo e a pessoa acha que nada aconteceu.
  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [mensagens.length]);

  const enviar = async () => {
    const conteudo = texto.trim();
    if (!conteudo || !aberta || enviando) return;
    setEnviando(true);
    setTexto('');
    // A altura é ajustada por código enquanto se digita; sem devolvê-la ao
    // normal, a caixa ficaria alta e vazia depois de enviar.
    if (textoRef.current) textoRef.current.style.height = 'auto';
    try {
      const r = await api.post('/chat/mensagens', {
        requester_id: userId, conversa_id: aberta.id, texto: conteudo,
        responde_a: respondendo?.id || null,
      });
      // A citação só é montada na próxima busca (o servidor a resolve na
      // listagem); até lá a mensagem aparece sem ela, o que é preferível a
      // montar na tela algo que pode não bater com o que ficou gravado.
      setRespondendo(null);
      setMensagens(m => [...m, r.data]);
      setConversas(lista => lista.map(c => c.id === aberta.id
        ? { ...c, ultima_texto: conteudo.slice(0, 140), ultima_em: r.data.created_at, ultima_minha: true }
        : c));
    } catch (e) {
      setTexto(conteudo); // devolve o que a pessoa escreveu, para não perder
      toast(e?.response?.data?.error || 'Não foi possível enviar.', 'error');
    }
    setEnviando(false);
  };

  const abrirEscolha = async () => {
    setEscolhendo(true);
    setBuscaContato('');
    try {
      const r = await api.get(`/chat/contatos?requester_id=${userId}`);
      setContatos(r.data || []);
    } catch {
      toast('Não foi possível carregar os contatos.', 'error');
    }
  };

  const conversarCom = async (pessoa) => {
    try {
      const r = await api.post('/chat/conversas', { requester_id: userId, com_id: pessoa.id });
      setEscolhendo(false);
      await carregarConversas();
      abrir({ ...r.data, outro: r.data.outro || pessoa });
    } catch (e) {
      toast(e?.response?.data?.error || 'Não foi possível abrir a conversa.', 'error');
    }
  };

  const termoContato = buscaContato.trim().toLowerCase();
  const contatosVisiveis = termoContato
    ? contatos.filter(c => (`${c.full_name || ''} ${c.company || ''}`).toLowerCase().includes(termoContato))
    : contatos;

  // No celular a tela mostra uma coisa de cada vez: lista OU conversa.
  const noCelular = typeof window !== 'undefined' && window.innerWidth < 768;
  const mostrarLista = !noCelular || !aberta;
  const mostrarConversa = !noCelular || !!aberta;

  return (
    <div>
      <div style={{ marginBottom:14 }}>
        <h1 style={{ fontSize:22, fontWeight:700, display:'flex', alignItems:'center', gap:9 }}>
          <MessageCircle size={20} style={{ color:'var(--primary)' }}/> Conversas
        </h1>
        <p style={{ color:'var(--text-muted)', fontSize:13, marginTop:2 }}>
          Converse com quem é da sua loja, sem sair do app.
        </p>
      </div>

      <div style={{ display:'grid', gridTemplateColumns: noCelular ? '1fr' : '300px 1fr', gap:16, alignItems:'start' }}>

        {mostrarLista && (
          <div className="card" style={{ padding:0, overflow:'hidden' }}>
            <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)' }}>
              <button className="btn btn-primary" style={{ width:'100%' }} onClick={abrirEscolha}>
                <Plus size={15}/> Nova conversa
              </button>
            </div>
            {carregando ? (
              <div style={{ padding:28, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>Carregando...</div>
            ) : conversas.length === 0 ? (
              <div style={{ padding:28, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>
                Nenhuma conversa ainda.
              </div>
            ) : (
              <div style={{ maxHeight:'62vh', overflowY:'auto' }}>
                {conversas.map(c => (
                  <button key={c.id} onClick={() => abrir(c)}
                    style={{ width:'100%', textAlign:'left', display:'flex', gap:10, alignItems:'center',
                             padding:'11px 14px', cursor:'pointer', border:'none',
                             borderBottom:'1px solid var(--border)',
                             background: aberta?.id === c.id ? 'var(--surface-2)' : 'transparent' }}>
                    <Avatar avatarUrl={c.outro?.avatar_url} name={c.outro?.full_name} size={36}/>
                    <div style={{ minWidth:0, flex:1 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
                        <span style={{ fontSize:13.5, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {c.outro?.full_name || 'Alguém'}
                        </span>
                        {c.ultima_em && (
                          <span style={{ fontSize:11, color:'var(--text-muted)', flexShrink:0 }}>{diaCurto(c.ultima_em)}</span>
                        )}
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between', gap:8, alignItems:'center', marginTop:2 }}>
                        <span style={{ fontSize:12, color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {c.ultima_texto ? `${c.ultima_minha ? 'Você: ' : ''}${c.ultima_texto}` : 'Sem mensagens'}
                        </span>
                        {c.nao_lidas > 0 && (
                          <span style={{ background:'var(--primary)', color:'#fff', borderRadius:99,
                                         fontSize:10.5, fontWeight:700, padding:'2px 7px', flexShrink:0 }}>
                            {c.nao_lidas}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {mostrarConversa && (
          <div className="card" style={{ padding:0, display:'flex', flexDirection:'column', height:'70vh' }}>
            {!aberta ? (
              <div style={{ margin:'auto', textAlign:'center', color:'var(--text-muted)', padding:24 }}>
                <MessageCircle size={30} style={{ opacity:.4, marginBottom:10 }}/>
                <div style={{ fontSize:13.5 }}>Escolha uma conversa ou comece uma nova.</div>
              </div>
            ) : (
              <>
                <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px',
                              borderBottom:'1px solid var(--border)', flexShrink:0 }}>
                  {noCelular && (
                    <button onClick={() => setAberta(null)} aria-label="Voltar para a lista"
                      style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text)', padding:6, margin:-6 }}>
                      <ArrowLeft size={18}/>
                    </button>
                  )}
                  <Avatar avatarUrl={aberta.outro?.avatar_url} name={aberta.outro?.full_name} size={34}/>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:600 }}>{aberta.outro?.full_name || 'Alguém'}</div>
                    {aberta.outro?.role && (
                      <div style={{ fontSize:11.5, color:'var(--text-muted)' }}>{aberta.outro.role}</div>
                    )}
                  </div>
                </div>

                <div style={{ flex:1, overflowY:'auto', padding:'14px', display:'flex', flexDirection:'column', gap:8 }}>
                  {mensagens.length === 0 && (
                    <div style={{ margin:'auto', color:'var(--text-muted)', fontSize:13 }}>
                      Nenhuma mensagem ainda. Escreva a primeira.
                    </div>
                  )}
                  {mensagens.map((m, i) => {
                    const minha = m.de_id === userId;
                    const anterior = mensagens[i - 1];
                    const novoDia = !anterior || diaCurto(anterior.created_at) !== diaCurto(m.created_at);
                    return (
                      <React.Fragment key={m.id}>
                        {novoDia && (
                          <div style={{ textAlign:'center', fontSize:11, color:'var(--text-muted)', margin:'6px 0' }}>
                            {diaCurto(m.created_at)}
                          </div>
                        )}
                        <div style={{ display:'flex', justifyContent: minha ? 'flex-end' : 'flex-start' }}>
                          <div
                            onClick={() => !m.apagada && setMenuMsg(m)}
                            style={{ maxWidth:'78%', padding:'8px 12px', borderRadius:14,
                                        cursor: m.apagada ? 'default' : 'pointer',
                                        background: minha ? 'var(--primary)' : 'var(--surface-2)',
                                        color: minha ? '#fff' : 'var(--text)',
                                        borderBottomRightRadius: minha ? 4 : 14,
                                        borderBottomLeftRadius: minha ? 14 : 4 }}>
                            {/* Citação: mostra de quem é e um trecho. Se a
                                original foi apagada, some o texto — devolver
                                aqui o que a pessoa removeu seria pior que
                                não ter citação. */}
                            {m.citada && (
                              <div style={{ borderLeft:'3px solid currentColor', opacity:.75,
                                            paddingLeft:8, marginBottom:6, fontSize:12.5 }}>
                                <div style={{ fontWeight:700, marginBottom:1 }}>
                                  {m.citada.de_id === userId ? 'Você' : (aberta?.outro?.full_name || 'Mensagem')}
                                </div>
                                <div style={{ overflow:'hidden', textOverflow:'ellipsis',
                                              whiteSpace:'nowrap', maxWidth:220 }}>
                                  {m.citada.apagada ? 'Mensagem apagada'
                                    : (m.citada.texto || 'Anexo')}
                                </div>
                              </div>
                            )}
                            {m.apagada ? (
                              // Vira aviso em vez de sumir: sumir sem
                              // rastro deixaria a conversa confusa para
                              // quem estava do outro lado.
                              <div style={{ fontSize:13, fontStyle:'italic',
                                            color: minha ? 'rgba(255,255,255,.8)' : 'var(--text-muted)' }}>
                                Mensagem apagada
                              </div>
                            ) : (<>
                            {m.tipo === 'imagem' && m.arquivo_url && (
                              <img src={m.arquivo_url} alt={m.arquivo_nome || 'Foto'}
                                onClick={e => { e.stopPropagation(); window.open(m.arquivo_url, '_blank'); }}
                                style={{ maxWidth:'100%', borderRadius:10, display:'block', cursor:'pointer', marginBottom: m.texto ? 6 : 0 }}/>
                            )}

                            {m.tipo === 'audio' && m.arquivo_url && (
                              // O player do próprio navegador: no iPhone é o
                              // que garante que o áudio toque sem plugin.
                              <audio controls src={m.arquivo_url} onClick={e => e.stopPropagation()}
                                style={{ width:'100%', minWidth:200, marginBottom: m.texto ? 6 : 0 }}/>
                            )}

                            {m.tipo === 'arquivo' && m.arquivo_url && (
                              <a href={m.arquivo_url} target="_blank" rel="noreferrer"
                                onClick={e => e.stopPropagation()}
                                style={{ display:'flex', alignItems:'center', gap:8, textDecoration:'none',
                                         color:'inherit', marginBottom: m.texto ? 6 : 0 }}>
                                <Paperclip size={16} style={{ flexShrink:0 }}/>
                                <span style={{ minWidth:0 }}>
                                  <span style={{ display:'block', fontSize:13, fontWeight:600, overflow:'hidden',
                                                 textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                    {m.arquivo_nome || 'Arquivo'}
                                  </span>
                                  {m.arquivo_tamanho && (
                                    <span style={{ fontSize:11, opacity:.8 }}>{tamanhoLegivel(m.arquivo_tamanho)}</span>
                                  )}
                                </span>
                              </a>
                            )}

                            {/* Anexo que não abre: o link vale 1 hora, então
                                mensagem antiga carregada há muito tempo pode
                                cair aqui. Recarregar a tela resolve. */}
                            {m.tipo !== 'texto' && !m.arquivo_url && (
                              <div style={{ fontSize:12, opacity:.85, marginBottom: m.texto ? 6 : 0 }}>
                                Anexo indisponível — recarregue a tela.
                              </div>
                            )}

                            {m.texto && (
                              <div style={{ fontSize:13.5, lineHeight:1.5, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
                                {m.texto}
                              </div>
                            )}
                            </>)}

                            <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end',
                                          gap:8, fontSize:10, marginTop:3,
                                          color: minha ? 'rgba(255,255,255,.75)' : 'var(--text-muted)' }}>
                              {/* Só quem escreveu apaga, e só o que ainda
                                  não foi apagado. */}
                              {minha && !m.apagada && (
                                <button onClick={e => { e.stopPropagation(); apagar(m); }} aria-label="Apagar mensagem" title="Apagar mensagem"
                                  style={{ background:'none', border:'none', cursor:'pointer', padding:2, margin:-2,
                                           color:'inherit', opacity:.85, display:'flex' }}>
                                  <Trash2 size={12}/>
                                </button>
                              )}
                              <span>{horaCurta(m.created_at)}</span>
                            </div>

                            {/* Reações agrupadas: o mesmo emoji some numa
                                bolinha com a contagem, como no WhatsApp. */}
                            {m.reacoes?.length > 0 && (
                              <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginTop:4 }}>
                                {[...new Set(m.reacoes.map(r => r.emoji))].map(e => {
                                  const qtd = m.reacoes.filter(r => r.emoji === e).length;
                                  return (
                                    <span key={e} style={{
                                      background: minha ? 'rgba(255,255,255,.18)' : 'var(--surface-2)',
                                      borderRadius:99, padding:'1px 7px', fontSize:12, lineHeight:1.6,
                                    }}>
                                      {e}{qtd > 1 ? ` ${qtd}` : ''}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                  <div ref={fimRef}/>
                </div>

                {/* Respondendo a uma mensagem: a barra fica em cima do
                    campo, como no WhatsApp, e some ao enviar ou no X. */}
                {respondendo && (
                  <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 14px',
                                borderTop:'1px solid var(--border)', background:'var(--surface-2)', flexShrink:0 }}>
                    <div style={{ borderLeft:'3px solid var(--primary)', paddingLeft:8, minWidth:0, flex:1 }}>
                      <div style={{ fontSize:11.5, fontWeight:700, color:'var(--primary)' }}>
                        Respondendo {respondendo.de_id === userId ? 'você mesmo' : aberta?.outro?.full_name || ''}
                      </div>
                      <div style={{ fontSize:12.5, color:'var(--text-muted)', overflow:'hidden',
                                    textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {respondendo.texto || 'Anexo'}
                      </div>
                    </div>
                    <button onClick={() => setRespondendo(null)} aria-label="Cancelar resposta"
                      style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:4 }}>
                      <X size={16}/>
                    </button>
                  </div>
                )}

                {gravando ? (
                  <div style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 14px',
                                borderTop:'1px solid var(--border)', flexShrink:0 }}>
                    <span style={{ width:10, height:10, borderRadius:'50%', background:'#ef4444', flexShrink:0 }}/>
                    <span style={{ fontSize:13.5, fontWeight:600, flex:1 }}>
                      Gravando · {String(Math.floor(segundos / 60)).padStart(2,'0')}:{String(segundos % 60).padStart(2,'0')}
                    </span>
                    <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={cancelarGravacao}>
                      Descartar
                    </button>
                    <button className="btn btn-primary" onClick={pararGravacao} aria-label="Enviar áudio">
                      <Send size={16}/>
                    </button>
                  </div>
                ) : (
                <div style={{ display:'flex', gap:8, padding:'11px 14px', borderTop:'1px solid var(--border)', flexShrink:0, alignItems:'flex-end' }}>
                  <input ref={arquivoRef} type="file" onChange={escolherArquivo} style={{ display:'none' }}/>
                  <button onClick={() => arquivoRef.current?.click()} disabled={enviandoAnexo}
                    aria-label="Anexar foto ou arquivo" title="Anexar foto ou arquivo"
                    style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)',
                             padding:9, flexShrink:0 }}>
                    <Paperclip size={19}/>
                  </button>
                  {/* Enter NÃO envia: quebra linha.
                      A mensagem sai só pelo botão. Enviar no Enter fazia
                      recado sair pela metade — corretor do teclado, toque
                      errado, ou a pessoa organizando o texto em linhas. Numa
                      conversa de trabalho, mensagem incompleta enviada por
                      acidente não tem como voltar atrás.
                      Como agora o texto cresce em linhas, o campo acompanha
                      até um limite e depois rola por dentro. */}
                  <textarea
                    ref={textoRef}
                    value={texto} rows={1}
                    onChange={e => {
                      setTexto(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
                    }}
                    onPaste={colarNaMensagem}
                    placeholder="Escreva uma mensagem"
                    style={{ flex:1, resize:'none', padding:'9px 12px', borderRadius:'var(--radius)',
                             border:'1px solid var(--border)', background:'var(--surface)',
                             color:'var(--text)', fontSize:13.5, fontFamily:'inherit',
                             maxHeight:100, overflowY:'auto' }}/>
                  {/* Sem texto escrito, o botão grava áudio — como no
                      WhatsApp. Com texto, ele envia. */}
                  {texto.trim() ? (
                    <button className="btn btn-primary" onClick={enviar} disabled={enviando}
                      aria-label="Enviar mensagem" style={{ flexShrink:0 }}>
                      <Send size={16}/>
                    </button>
                  ) : (
                    <button className="btn btn-primary" onClick={gravar} disabled={enviandoAnexo}
                      aria-label="Gravar áudio" title="Gravar áudio" style={{ flexShrink:0 }}>
                      <Mic size={16}/>
                    </button>
                  )}
                </div>
                )}
                {enviandoAnexo && (
                  <div style={{ fontSize:12, color:'var(--text-muted)', padding:'0 14px 10px' }}>Enviando anexo...</div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {escolhendo && (
        <div onClick={() => setEscolhendo(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000,
                   display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={e => e.stopPropagation()} className="card" style={{ width:'100%', maxWidth:420, padding:0, overflow:'hidden' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 16px 10px' }}>
              <h2 style={{ fontSize:16, fontWeight:700 }}>Nova conversa</h2>
              <button onClick={() => setEscolhendo(false)} aria-label="Fechar"
                style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:6, margin:-6 }}>
                <X size={18}/>
              </button>
            </div>
            <div style={{ padding:'0 16px 12px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, background:'var(--surface-2)',
                            borderRadius:'var(--radius)', padding:'8px 11px' }}>
                <Search size={14} style={{ color:'var(--text-muted)', flexShrink:0 }}/>
                <input value={buscaContato} onChange={e => setBuscaContato(e.target.value)} autoFocus
                  placeholder="Buscar pessoa" spellCheck={false}
                  style={{ border:'none', background:'none', outline:'none', width:'100%', fontSize:13, color:'var(--text)' }}/>
              </div>
            </div>
            <div style={{ maxHeight:'46vh', overflowY:'auto', borderTop:'1px solid var(--border)' }}>
              {contatosVisiveis.length === 0 ? (
                <div style={{ padding:26, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>
                  Ninguém encontrado.
                </div>
              ) : contatosVisiveis.map(p => (
                <button key={p.id} onClick={() => conversarCom(p)}
                  style={{ width:'100%', textAlign:'left', display:'flex', gap:10, alignItems:'center',
                           padding:'10px 16px', cursor:'pointer', border:'none', background:'transparent',
                           borderBottom:'1px solid var(--border)' }}>
                  <Avatar avatarUrl={p.avatar_url} name={p.full_name} size={32}/>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:13.5, fontWeight:600 }}>{p.full_name}</div>
                    {/* Quem é de outra loja aparece com o nome dela. Sem isso
                        seria fácil escrever para a pessoa errada achando que
                        é alguém da própria equipe. */}
                    {p.de_outra_loja ? (
                      <div style={{ fontSize:11.5, color:'var(--primary)', fontWeight:600 }}>
                        {p.company}{p.role ? ` · ${p.role}` : ''}
                      </div>
                    ) : (p.role || p.sector) && (
                      <div style={{ fontSize:11.5, color:'var(--text-muted)' }}>
                        {[p.role, p.sector].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Menu da mensagem — sobe de baixo, como no celular. Os emojis ficam
          em cima e em linha: reagir é a ação mais usada e a que precisa de
          menos toques. */}
      {menuMsg && (
        <div onClick={() => setMenuMsg(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:60,
                   display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background:'var(--surface)', borderRadius:'18px 18px 0 0', width:'100%',
                     maxWidth:460, padding:'14px 12px 18px',
                     borderTop:'1px solid var(--border)' }}>
            <div style={{ display:'flex', justifyContent:'space-around', paddingBottom:12,
                          borderBottom:'1px solid var(--border)', marginBottom:8 }}>
              {EMOJIS.map(e => (
                <button key={e} onClick={() => reagir(menuMsg, e)}
                  style={{ background:'none', border:'none', fontSize:26, cursor:'pointer',
                           padding:'4px 6px', lineHeight:1 }}>
                  {e}
                </button>
              ))}
            </div>

            {[
              { icone: CornerUpLeft, texto: 'Responder',  fn: () => { setRespondendo(menuMsg); setMenuMsg(null); } },
              { icone: Share2,       texto: 'Encaminhar', fn: () => { setEncaminhando(menuMsg); setMenuMsg(null); } },
              { icone: Copy,         texto: 'Copiar',     fn: () => copiar(menuMsg) },
            ].map(({ icone: Ic, texto, fn }) => (
              <button key={texto} onClick={fn}
                style={{ display:'flex', alignItems:'center', gap:12, width:'100%', background:'none',
                         border:'none', cursor:'pointer', padding:'12px 10px', fontSize:14,
                         color:'var(--text)', textAlign:'left' }}>
                <Ic size={17} color="var(--text-muted)"/> {texto}
              </button>
            ))}

            {/* Apagar continua só para quem escreveu — a mesma regra da
                lixeira que já existia na bolha. */}
            {menuMsg.de_id === userId && (
              <button onClick={() => { const m = menuMsg; setMenuMsg(null); apagar(m); }}
                style={{ display:'flex', alignItems:'center', gap:12, width:'100%', background:'none',
                         border:'none', cursor:'pointer', padding:'12px 10px', fontSize:14,
                         color:'var(--danger)', textAlign:'left' }}>
                <Trash2 size={17}/> Apagar
              </button>
            )}
          </div>
        </div>
      )}

      {/* Encaminhar: escolhe para qual conversa. Só as que já existem —
          abrir conversa nova daqui misturaria duas decisões diferentes. */}
      {encaminhando && (
        <div onClick={() => setEncaminhando(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:60,
                   display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background:'var(--surface)', borderRadius:16, width:'100%', maxWidth:420,
                     maxHeight:'70vh', overflow:'auto', border:'1px solid var(--border)' }}>
            <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)',
                          fontWeight:700, fontSize:14 }}>
              Encaminhar para
            </div>
            {conversas.filter(c => c.id !== aberta?.id).length === 0 ? (
              <div style={{ padding:24, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>
                Você ainda não tem outra conversa aberta.
              </div>
            ) : conversas.filter(c => c.id !== aberta?.id).map(c => (
              <button key={c.id} onClick={() => encaminharPara(c)}
                style={{ width:'100%', textAlign:'left', display:'flex', gap:10, alignItems:'center',
                         padding:'10px 16px', cursor:'pointer', border:'none', background:'transparent',
                         borderBottom:'1px solid var(--border)' }}>
                <Avatar avatarUrl={c.outro?.avatar_url} name={c.outro?.full_name} size={32}/>
                <span style={{ fontSize:13.5, fontWeight:600 }}>{c.outro?.full_name || 'Conversa'}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
