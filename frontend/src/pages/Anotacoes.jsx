import React, { useEffect, useState, useRef } from 'react';
import { Plus, Mic, Trash2, X, Pin, PinOff, Search, Archive, ArchiveRestore, StickyNote, Share2, MessageCircle, FileText, LayoutGrid, List, Paperclip, ScanText, Loader2 } from 'lucide-react';
import api, { cabecalhoSessao } from '../api';
import { comprimirImagem } from '../lib/imagem';
import { useToast } from '../components/Toast';
import ExportMenu from '../components/ExportMenu';
import { gerarPDF, gerarPDFTexto, compartilharWhatsApp, compartilharArquivo } from '../lib/exportUtils';

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
  padrao:   { fundo: 'var(--surface-2)', texto: 'var(--text)', apoio: 'var(--text-muted)', nome: 'Sem cor' },
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

// Galeria (como era) ou lista. Guardado no aparelho, como o tema: é jeito
// de olhar, não dado da empresa. Em aba anônima o acesso LANÇA, então
// tudo aqui é protegido — preferência não pode derrubar a tela.
const lerModo = () => {
  try { return localStorage.getItem('rl-anotacoes-modo') === 'lista' ? 'lista' : 'galeria'; }
  catch { return 'galeria'; }
};
const gravarModo = (m) => {
  try { localStorage.setItem('rl-anotacoes-modo', m); } catch { /* aba anônima */ }
};

// "hoje", "ontem" ou a data. Na galeria o cartão não mostra data nenhuma;
// na lista ela é metade da informação — é por ela que a pessoa reconhece
// a anotação quando o título é curto.
function quando(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dia = (x) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  const hoje = new Date();
  const ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
  if (dia(d) === dia(hoje)) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (dia(d) === dia(ontem)) return 'ontem';
  const mesmoAno = d.getFullYear() === hoje.getFullYear();
  return d.toLocaleDateString('pt-BR', mesmoAno ? { day: '2-digit', month: '2-digit' } : { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Primeira linha com conteúdo, para a prévia de uma linha da lista.
const primeiraLinha = (txt) => String(txt || '').split('\n').find(l => l.trim()) || '';

export default function Anotacoes({ userId }) {
  const toast = useToast();
  const [anotacoes, setAnotacoes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [vendoArquivadas, setVendoArquivadas] = useState(false);
  const [editando, setEditando] = useState(null); // null = fechado
  const [modo, setModo] = useState(lerModo);
  const [ouvindo, setOuvindo] = useState(false);
  const [anexando, setAnexando] = useState(false);
  const [lendoTexto, setLendoTexto] = useState(false);
  const recRef = useRef(null);
  const inputAnexo = useRef(null);
  const inputLerTexto = useRef(null);
  const ultimaCarga = useRef(0);

  const carregar = async (arquivadas = vendoArquivadas) => {
    try {
      const r = await api.get(`/anotacoes?requester_id=${userId}&arquivadas=${arquivadas ? 1 : 0}`);
      setAnotacoes(r.data || []);
      ultimaCarga.current = Date.now();
    } catch {
      toast('Não foi possível carregar as anotações.', 'error');
    }
    setCarregando(false);
  };

  useEffect(() => { if (userId) carregar(); }, [userId, vendoArquivadas]);

  // Os links das fotos valem 1 hora (o balde é fechado). Quem deixa a tela
  // aberta mais que isso voltaria e veria as miniaturas quebradas. Ao
  // voltar para a aba depois de 50 minutos, recarrega — links novos.
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === 'visible' && Date.now() - ultimaCarga.current > 50 * 60 * 1000) carregar();
    };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, [userId, vendoArquivadas]);

  const abrirNova = () => setEditando({ id: null, titulo: '', texto: '', cor: 'padrao', anexos: [] });
  const abrir = (a) => setEditando({ id: a.id, titulo: a.titulo, texto: a.texto, cor: a.cor, anexos: a.anexos || [] });

  // O anexo precisa de uma anotação para morar. Quem abre uma nova e vai
  // direto anexar a foto ainda não tem uma — ela nasce aqui, como
  // rascunho, com o que já foi digitado.
  const garantirId = async () => {
    if (editando.id) return editando.id;
    const r = await api.post('/anotacoes', {
      requester_id: userId, titulo: editando.titulo, texto: editando.texto, cor: editando.cor, rascunho: true,
    });
    setEditando(ed => ({ ...ed, id: r.data.id }));
    return r.data.id;
  };

  // Anexar: autoriza UM envio no servidor, manda o arquivo direto para o
  // armazenamento e registra. Foto sai comprimida antes — foi foto pesada
  // que encheu o armazenamento e derrubou o app em out/2026.
  const anexar = async (arquivos) => {
    const lista = Array.from(arquivos || []);
    if (!lista.length) return;
    setAnexando(true);
    try {
      const id = await garantirId();
      for (const original of lista) {
        let arquivo = original;
        let tipo = original.type || 'application/octet-stream';
        let nome = original.name || 'arquivo';
        if (tipo.startsWith('image/') && tipo !== 'image/gif') {
          try {
            arquivo = await comprimirImagem(original, 1600, 1600, 0.8);
            tipo = 'image/jpeg';
            nome = nome.replace(/\.[^.]+$/, '') + '.jpg';
          } catch { /* não deu para comprimir (ex.: formato do iPhone): vai o original */ }
        }
        try {
          const perm = await api.post(`/anotacoes/${id}/anexos/autorizar`, {
            requester_id: userId, nome, tamanho: arquivo.size, tipo,
          });
          const envio = await fetch(perm.data.url, {
            method: 'PUT',
            headers: { 'Content-Type': tipo, 'x-upsert': 'true', Authorization: `Bearer ${perm.data.token}` },
            body: arquivo,
          });
          if (!envio.ok) throw new Error('O envio do arquivo falhou.');
          const reg = await api.post(`/anotacoes/${id}/anexos`, {
            requester_id: userId, caminho: perm.data.caminho, nome, tipo, tamanho: arquivo.size,
          });
          setEditando(ed => ed && ({ ...ed, anexos: [...(ed.anexos || []), reg.data] }));
        } catch (e) {
          toast(`${nome}: ${e?.response?.data?.error || e.message || 'não foi possível anexar.'}`, 'error');
        }
      }
    } catch (e) {
      toast(e?.response?.data?.error || 'Não foi possível anexar.', 'error');
    } finally {
      setAnexando(false);
      if (inputAnexo.current) inputAnexo.current.value = '';
    }
  };

  const removerAnexo = async (anexo) => {
    if (!window.confirm(`Remover "${anexo.nome}" desta anotação?`)) return;
    try {
      await api.delete(`/anotacoes/${editando.id}/anexos/${anexo.id}?requester_id=${userId}`);
      setEditando(ed => ed && ({ ...ed, anexos: ed.anexos.filter(x => x.id !== anexo.id) }));
    } catch (e) {
      toast(e?.response?.data?.error || 'Não foi possível remover.', 'error');
    }
  };

  // "Escanear texto" do iPhone: a foto vira texto digitado, que dá para
  // editar e pesquisar. A foto em si não é guardada — quem quiser, anexa.
  const lerTextoDaFoto = async (arquivo) => {
    if (!arquivo) return;
    setLendoTexto(true);
    try {
      let foto = arquivo;
      try { foto = await comprimirImagem(arquivo, 2000, 2000, 0.85); } catch { /* vai a original */ }
      const fd = new FormData();
      fd.append('foto', foto, 'foto.jpg');
      const base = import.meta.env.VITE_API_URL || '/api';
      const r = await fetch(`${base}/anotacoes/ler-texto`, { method: 'POST', body: fd, headers: await cabecalhoSessao() });
      const dados = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(dados.error || 'Não foi possível ler o texto.');
      if (dados.vazio || !dados.texto) { toast('Não encontrei texto nesta foto.', 'error'); return; }
      setEditando(ed => ed && ({ ...ed, texto: ed.texto ? `${ed.texto}\n\n${dados.texto}` : dados.texto }));
      toast(dados.cortado ? 'Texto lido — a foto tinha muito texto e parte ficou de fora.' : 'Texto lido. Confira e ajuste se precisar.');
    } catch (e) {
      toast(e.message || 'Não foi possível ler o texto.', 'error');
    } finally {
      setLendoTexto(false);
      if (inputLerTexto.current) inputLerTexto.current.value = '';
    }
  };

  const salvar = async () => {
    const { id, titulo, texto, cor } = editando;
    const temAnexo = (editando.anexos || []).length > 0;
    // Anotação sem nada — nem texto, nem anexo — não fica. Se ela nasceu
    // como rascunho para receber uma foto que depois foi removida, apaga.
    if (!titulo.trim() && !texto.trim() && !temAnexo) {
      if (id) { try { await api.delete(`/anotacoes/${id}?requester_id=${userId}`); } catch { /* fica para a próxima */ } carregar(); }
      setEditando(null);
      return;
    }
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

  // Ctrl+V logo depois de abrir a anotação.
  //
  // O editor abria sem nada focado: o cursor ficava no corpo da página, e
  // Ctrl+V não tinha onde colar — parecia que colar estava bloqueado, quando
  // na verdade não havia campo escutando. Quem abre uma anotação para colar
  // um texto faz exatamente isso: abre e cola, sem clicar antes.
  //
  // O ouvinte é no documento de propósito: quando o foco está fora dos
  // campos, o evento nasce no <body> e nunca desce até o cartão.
  useEffect(() => {
    if (!editando) return undefined;
    const aoColar = (ev) => {
      // Com o cursor dentro de um campo o navegador já cola sozinho, e
      // interferir aqui colaria duas vezes.
      const alvo = ev.target;
      if (alvo?.tagName === 'TEXTAREA' || alvo?.tagName === 'INPUT') return;
      const vindo = ev.clipboardData?.getData('text');
      if (!vindo) return;
      ev.preventDefault();
      setEditando(ed => ed && ({ ...ed, texto: ed.texto ? `${ed.texto}\n${vindo}` : vindo }));
    };
    document.addEventListener('paste', aoColar);
    return () => document.removeEventListener('paste', aoColar);
  }, [!!editando]);

  // Fechar só quando o toque COMEÇOU no fundo.
  //
  // Sem isto, selecionar o texto e arrastar um pouco além da borda do cartão
  // soltava o clique no fundo e fechava a anotação — no meio de um copiar,
  // que é justamente quando se arrasta até o limite. O clique nasce no
  // ancestral comum entre onde apertou e onde soltou, e esse ancestral é o
  // fundo.
  const comecouNoFundo = useRef(false);

  const termo = busca.trim().toLowerCase();
  const visiveis = termo
    ? anotacoes.filter(a => `${a.titulo} ${a.texto}`.toLowerCase().includes(termo))
    : anotacoes;
  const fixadas = visiveis.filter(a => a.fixada);
  const demais  = visiveis.filter(a => !a.fixada);

  // Cor da anotação aberta na janela de edição. Cai no padrão quando a cor
  // gravada não existe mais — evita tela quebrada se a paleta mudar.
  const corAtual = (editando && CORES[editando.cor]) || CORES.padrao;

  // PDF para imprimir.
  //
  // Sai o que está NA TELA: se houver busca, só o que ela filtrou; se estiver
  // vendo as arquivadas, são elas. Exportar coisa diferente do que a pessoa
  // está olhando é o tipo de surpresa que faz conferir tudo de novo.
  //
  // Retrato, e não paisagem como os outros relatórios: anotação é texto
  // corrido, e paisagem daria linhas largas demais para ler.
  const exportarPDF = (saida = 'download') => {
    if (!visiveis.length) { toast('Não há anotações para exportar.', 'error'); return; }
    const emLinha = a => ({
      titulo: a.titulo?.trim() || '(sem título)',
      texto:  a.texto?.trim()  || '—',
      data:   a.created_at ? new Date(a.created_at).toLocaleDateString('pt-BR') : '',
    });
    const colunas = [
      { header: 'Título',    dataKey: 'titulo' },
      { header: 'Anotação',  dataKey: 'texto'  },
      { header: 'Criada em', dataKey: 'data'   },
    ];
    // Fixadas em seção própria: elas estão no topo da tela por serem as que
    // importam, e o papel deve dizer a mesma coisa.
    const secoes = [];
    if (fixadas.length) secoes.push({ titulo: 'Fixadas', colunas, rows: fixadas.map(emLinha) });
    if (demais.length)  secoes.push({
      titulo: fixadas.length ? 'Demais anotações' : null,
      colunas, rows: demais.map(emLinha),
    });
    return gerarPDF({
      titulo: vendoArquivadas ? 'Anotações arquivadas' : 'Minhas anotações',
      subtitulo: `${visiveis.length} anotação(ões)`
        + (termo ? ` · busca por "${termo}"` : '')
        + ` · ${new Date().toLocaleDateString('pt-BR')}`,
      secoes,
      orientacao: 'portrait',
      saida,
    });
  };

  // ── Compartilhar ──────────────────────────────────────────────
  // WhatsApp em texto: a anotação vai como mensagem, pronta para ler.
  // PDF: no celular abre a folha de compartilhar (WhatsApp entre as
  // opções); no PC baixa o PDF e abre o WhatsApp para anexar.
  const textoDe = (a) => `${a.titulo?.trim() ? `*${a.titulo.trim()}*\n` : ''}${a.texto?.trim() || ''}`.trim();
  const textoDeTodas = () => {
    const cab = `*${vendoArquivadas ? 'Anotações arquivadas' : 'Minhas anotações'}* · ${visiveis.length}\n\n`;
    return cab + [...fixadas, ...demais].map(a => `📌 ${textoDe(a) || '(sem texto)'}`).join('\n\n');
  };
  const avisar = (resultado) => {
    if (resultado === 'baixado') toast('PDF baixado. No WhatsApp, anexe o arquivo que acabou de baixar.');
  };
  const [menuDe, setMenuDe] = useState(null);   // anotação com o menu de compartilhar aberto

  const whatsAnotacao = (a) => compartilharWhatsApp(textoDe(a) || '(sem texto)');
  const pdfAnotacao = (a, saida) => gerarPDFTexto({
    titulo: a.titulo?.trim() || 'Anotação',
    subtitulo: a.created_at ? `Criada em ${new Date(a.created_at).toLocaleDateString('pt-BR')}` : '',
    blocos: [{ texto: a.texto?.trim() || '—' }],
    saida,
  });
  const pdfAnotacaoWhats = async (a) => avisar(await compartilharArquivo({ ...pdfAnotacao(a, 'blob'), texto: a.titulo?.trim() || 'Anotação' }));
  const whatsTodas = () => { if (!visiveis.length) return toast('Não há anotações para enviar.', 'error'); compartilharWhatsApp(textoDeTodas()); };
  const pdfTodasWhats = async () => {
    if (!visiveis.length) return toast('Não há anotações para enviar.', 'error');
    avisar(await compartilharArquivo({ ...exportarPDF('blob'), texto: vendoArquivadas ? 'Anotações arquivadas' : 'Minhas anotações' }));
  };

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
    const capa = (a.anexos || []).find(x => x.imagem && x.url);
    const qtdAnexos = (a.anexos || []).length;
    return (
      <div
        onClick={() => abrir(a)}
        style={{
          background:c.fundo, borderRadius:12, padding:'12px 14px', cursor:'pointer',
          border: a.cor === 'padrao' ? '0.5px solid var(--border)' : 'none',
          breakInside:'avoid', marginBottom:10, overflow:'hidden',
        }}>
        {/* A primeira foto vira capa, como no Keep: é por ela que a pessoa
            reconhece a anotação de longe. Altura limitada para uma foto em
            pé não virar um cartão do tamanho da tela. */}
        {capa && (
          <img src={capa.url} alt="" loading="lazy"
            style={{ display:'block', width:'calc(100% + 28px)', margin:'-12px -14px 10px',
                     maxHeight:170, objectFit:'cover' }}/>
        )}
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
        <div style={{ display:'flex', gap:16, marginTop:12, position:'relative', alignItems:'center' }}>
          {qtdAnexos > 0 && (
            <span title={`${qtdAnexos} anexo${qtdAnexos > 1 ? 's' : ''}`}
              style={{ order:9, marginLeft:'auto', display:'flex', alignItems:'center', gap:3, fontSize:12, color:c.texto }}>
              <Paperclip size={14}/> {qtdAnexos}
            </span>
          )}
          {/* Compartilhar: menu pequeno com as três saídas. Fecha ao clicar
              fora (o overlay) ou ao escolher. */}
          <button
            onClick={(e) => { e.stopPropagation(); setMenuDe(menuDe === a.id ? null : a.id); }}
            title="Compartilhar"
            aria-label="Compartilhar anotação"
            style={botaoIcone}>
            <Share2 size={17}/>
          </button>
          {menuDe === a.id && (
            <>
              <div onClick={(e) => { e.stopPropagation(); setMenuDe(null); }} style={{ position:'fixed', inset:0, zIndex:40 }}/>
              <div onClick={(e) => e.stopPropagation()}
                style={{ position:'absolute', left:0, bottom:'calc(100% + 6px)', zIndex:41, background:'var(--surface)', color:'var(--text)',
                         border:'1px solid var(--border)', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,.18)', minWidth:210, overflow:'hidden' }}>
                {[
                  [<MessageCircle size={14} color="#25D366"/>, 'Enviar no WhatsApp', () => whatsAnotacao(a)],
                  [<FileText size={14} color="#ef4444"/>, 'Baixar PDF', () => pdfAnotacao(a)],
                  [<MessageCircle size={14} color="#25D366"/>, 'Enviar PDF no WhatsApp', () => pdfAnotacaoWhats(a)],
                ].map(([icone, rotulo, fn]) => (
                  <button key={rotulo} onClick={() => { setMenuDe(null); fn(); }}
                    style={{ display:'flex', alignItems:'center', gap:9, width:'100%', padding:'10px 14px', background:'none', border:'none',
                             cursor:'pointer', fontSize:13, color:'var(--text)', textAlign:'left' }}>
                    {icone} {rotulo}
                  </button>
                ))}
              </div>
            </>
          )}
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

  // ── Uma anotação na LISTA ──────────────────────────────────
  //
  // A lista existe para quem tem muita anotação: na galeria o cartão
  // cresce com o texto, e procurar vira rolagem. Aqui cada uma ocupa uma
  // linha de altura fixa, então cabe três vezes mais na tela.
  //
  // A COR NÃO SOME: ela vira uma faixa na lateral. Sem isso quem usa cor
  // para separar assunto perderia a separação ao trocar de modo — e
  // trocar de modo não pode custar informação.
  const Linha = ({ a }) => {
    const c = CORES[a.cor] || CORES.padrao;
    // Com título, a prévia é o começo do texto. Sem título, o título já
    // virou a primeira linha do texto — então a prévia pega da segunda em
    // diante, senão a mesma frase apareceria duas vezes na linha.
    const previa = primeiraLinha(a.titulo ? a.texto : String(a.texto || '').split('\n').slice(1).join(' '));
    const botaoIcone = {
      background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)',
      padding:7, margin:-3, borderRadius:8, display:'flex', alignItems:'center', flexShrink:0,
    };
    return (
      <div
        onClick={() => abrir(a)}
        style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 14px', cursor:'pointer',
                 borderBottom:'1px solid var(--border)', position:'relative' }}>
        <span style={{ position:'absolute', left:0, top:6, bottom:6, width:3, borderRadius:99,
                       background: a.cor === 'padrao' ? 'var(--border-strong)' : c.fundo }}/>
        <div style={{ flex:1, minWidth:0 }}>
          {/* `minWidth:0` NOS DOIS TEXTOS, e não só nos pais.
              Dentro de uma linha flexível, o padrão é o item não encolher
              abaixo do tamanho do próprio conteúdo. Um texto com
              `whiteSpace:nowrap` tem conteúdo do tamanho da frase inteira
              — então, em vez de cortar com reticências, ele ALARGA a
              página. Aconteceu de verdade: uma anotação de texto longo
              empurrou a largura e levou junto os botões do cabeçalho, que
              foram parar fora da tela. Quem viu achou que os botões
              tinham sumido. */}
          <div style={{ display:'flex', alignItems:'baseline', gap:8, minWidth:0 }}>
            {a.fixada && <Pin size={12} style={{ color:'var(--primary)', flexShrink:0 }}/>}
            <span style={{ fontWeight:600, fontSize:14, color:'var(--text)', minWidth:0,
                           overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {a.titulo || primeiraLinha(a.texto) || 'Sem título'}
            </span>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:2, fontSize:12, color:'var(--text-muted)', minWidth:0 }}>
            <span style={{ flexShrink:0, fontVariantNumeric:'tabular-nums' }}>{quando(a.updated_at)}</span>
            {previa && (
              <span style={{ minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{previa}</span>
            )}
          </div>
        </div>
        {(() => {
          const capa = (a.anexos || []).find(x => x.imagem && x.url);
          if (capa) return <img src={capa.url} alt="" loading="lazy"
            style={{ width:40, height:40, objectFit:'cover', borderRadius:6, flexShrink:0, border:'1px solid var(--border)' }}/>;
          if ((a.anexos || []).length) return <Paperclip size={15} style={{ color:'var(--text-muted)', flexShrink:0 }}/>;
          return null;
        })()}
        {/* As mesmas ações da galeria. Compartilhar fica de fora aqui: o
            menu dele abre para cima e, numa linha estreita, encostava na
            de baixo. Quem quer compartilhar abre a anotação. */}
        <button onClick={(e) => { e.stopPropagation(); alternar(a, 'fixada'); }}
          title={a.fixada ? 'Desafixar' : 'Fixar no topo'}
          aria-label={a.fixada ? 'Desafixar anotação' : 'Fixar anotação no topo'}
          style={{ ...botaoIcone, color: a.fixada ? 'var(--primary)' : 'var(--text-muted)' }}>
          {a.fixada ? <Pin size={16}/> : <PinOff size={16}/>}
        </button>
        <button onClick={(e) => { e.stopPropagation(); alternar(a, 'arquivada'); }}
          title={a.arquivada ? 'Tirar do arquivo' : 'Arquivar'}
          aria-label={a.arquivada ? 'Tirar do arquivo' : 'Arquivar anotação'}
          style={botaoIcone}>
          {a.arquivada ? <ArchiveRestore size={16}/> : <Archive size={16}/>}
        </button>
        <button onClick={(e) => { e.stopPropagation(); excluir(a); }}
          title="Excluir" aria-label="Excluir anotação" style={botaoIcone}>
          <Trash2 size={16}/>
        </button>
      </div>
    );
  };

  // Um grupo de anotações, no modo que estiver escolhido.
  const Grupo = ({ itens, estilo }) => (
    modo === 'lista'
      ? <div className="card" style={{ padding:0, overflow:'hidden', ...estilo }}>
          {itens.map(a => <Linha key={a.id} a={a}/>)}
        </div>
      : <div style={{ columns:'240px', columnGap:10, ...estilo }}>
          {itens.map(a => <Cartao key={a.id} a={a}/>)}
        </div>
  );

  const trocarModo = (m) => { setModo(m); gravarModo(m); };

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap', marginBottom:6 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700 }}>Anotações</h1>
          <p style={{ color:'var(--text-muted)', fontSize:13, marginTop:2 }}>
            Suas anotações pessoais — ninguém mais vê o que você escreve aqui.
          </p>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          {/* Galeria ou lista. Os dois ficam à vista, com o atual marcado —
              um botão só, que alterna, esconde o que existe do outro lado. */}
          <div style={{ display:'flex', border:'1px solid var(--border)', borderRadius:99, overflow:'hidden' }}>
            {[['galeria', LayoutGrid, 'Ver como galeria'], ['lista', List, 'Ver como lista']].map(([m, Icone, titulo]) => (
              <button key={m} type="button" onClick={() => trocarModo(m)}
                title={titulo} aria-label={titulo} aria-pressed={modo === m}
                style={{ display:'flex', alignItems:'center', padding:'6px 11px', border:'none', cursor:'pointer',
                         background: modo === m ? 'var(--primary)' : 'transparent',
                         color: modo === m ? '#fff' : 'var(--text-muted)' }}>
                <Icone size={15}/>
              </button>
            ))}
          </div>
          <ExportMenu onPDF={() => exportarPDF()} onWhatsApp={whatsTodas} onPDFWhatsApp={pdfTodasWhats} label="Exportar" disabled={!visiveis.length}/>
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
          {/* Na galeria, colunas de altura variável, como um mural de
              post-its: o cartão ocupa só a altura do que tem dentro. */}
          <Grupo itens={fixadas} estilo={{ marginBottom:18 }}/>
        </>
      )}

      {demais.length > 0 && (
        <>
          {fixadas.length > 0 && (
            <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:8 }}>OUTRAS</div>
          )}
          <Grupo itens={demais}/>
        </>
      )}

      {editando && (
        <div
          onMouseDown={e => { comecouNoFundo.current = e.target === e.currentTarget; }}
          onTouchStart={e => { comecouNoFundo.current = e.target === e.currentTarget; }}
          onClick={e => { if (e.target === e.currentTarget && comecouNoFundo.current) salvar(); }}
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
              // Anotação nova já abre com o cursor no campo, para dar para
              // digitar ou colar de imediato.
              key={editando.id || 'nova'}
              autoFocus={!editando.id}
              value={editando.texto}
              onChange={e => setEditando({ ...editando, texto:e.target.value })}
              placeholder="Escreva aqui..."
              rows={8}
              style={{ border:'none', background:'none', outline:'none', width:'100%', resize:'vertical',
                       fontSize:14, lineHeight:1.6, fontFamily:'inherit',
                       color:corAtual.apoio }}/>

            {/* Anexos da anotação. Foto aparece como miniatura; arquivo,
                como etiqueta com o nome. Tocar abre em outra aba (link de 1
                hora, assinado pelo servidor). */}
            {(editando.anexos || []).length > 0 && (
              <div style={{ display:'flex', flexWrap:'wrap', gap:8, margin:'10px 0 4px' }}>
                {editando.anexos.map(an => (
                  <div key={an.id} style={{ position:'relative' }}>
                    <a href={an.url || undefined} target="_blank" rel="noreferrer" title={an.nome}
                      style={{ display:'flex', alignItems:'center', gap:6, textDecoration:'none',
                               ...(an.imagem
                                 ? { width:72, height:72, borderRadius:8, overflow:'hidden', border:'1px solid var(--border)' }
                                 : { maxWidth:200, padding:'8px 10px', borderRadius:8, fontSize:12,
                                     background:'rgba(0,0,0,.12)', color:corAtual.texto }) }}>
                      {an.imagem
                        ? <img src={an.url} alt={an.nome} style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                        : <><FileText size={15} style={{ flexShrink:0 }}/>
                            <span style={{ minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{an.nome}</span></>}
                    </a>
                    <button type="button" onClick={() => removerAnexo(an)} title="Remover anexo" aria-label={`Remover ${an.nome}`}
                      style={{ position:'absolute', top:-7, right:-7, width:22, height:22, borderRadius:'50%',
                               border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
                               background:'#1A1026', color:'#fff', boxShadow:'0 1px 4px rgba(0,0,0,.35)' }}>
                      <X size={12}/>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Os dois campos de arquivo ficam escondidos: quem abre são os
                botões. "accept" sem "capture" — no celular a pessoa escolhe
                entre tirar a foto na hora ou pegar uma da galeria. */}
            <input ref={inputAnexo} type="file" multiple hidden
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
              onChange={e => anexar(e.target.files)}/>
            <input ref={inputLerTexto} type="file" hidden accept="image/*"
              onChange={e => lerTextoDaFoto(e.target.files?.[0])}/>
            <div style={{ display:'flex', gap:14, flexWrap:'wrap', marginTop:8 }}>
              {[
                [anexando, Paperclip, anexando ? 'Enviando…' : 'Anexar foto ou arquivo', () => inputAnexo.current?.click()],
                [lendoTexto, ScanText, lendoTexto ? 'Lendo o texto…' : 'Ler texto de uma foto', () => inputLerTexto.current?.click()],
              ].map(([ocupado, Icone, rotulo, fn]) => (
                <button key={rotulo} type="button" onClick={fn} disabled={anexando || lendoTexto}
                  style={{ display:'flex', alignItems:'center', gap:6, cursor: (anexando || lendoTexto) ? 'wait' : 'pointer',
                           fontSize:12.5, background:'none', border:'none', padding:'6px 0',
                           color:corAtual.texto, opacity: (anexando || lendoTexto) && !ocupado ? .5 : 1 }}>
                  {ocupado ? <Loader2 size={14} style={{ animation:'spin 1s linear infinite' }}/> : <Icone size={14}/>} {rotulo}
                </button>
              ))}
            </div>

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
