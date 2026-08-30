import React, { useEffect, useState } from 'react';
import { Plus, X, FileDown, PenTool, ClipboardList, Search, Pencil } from 'lucide-react';
import Avatar from '../components/Avatar';
import jsPDF from 'jspdf';
import api from '../api';
import { useToast } from '../components/Toast';

function formatDateBR(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// ─────────────────────────────────────────────────────────────
// Rascunho guardado no aparelho.
//
// A ata é preenchida DURANTE a reunião, aos poucos. Se a pessoa sai do app
// para conferir alguma coisa, o celular pode descarregar a página da
// memória — e sem isto tudo o que ela digitou some. Numa reunião de uma
// hora, isso é inaceitável.
//
// Fica por usuário: em aparelho compartilhado (comum na loja), o rascunho
// de um não pode aparecer para o próximo que entrar.
// ─────────────────────────────────────────────────────────────
const chaveRascunho = userId => `ata_rascunho_${userId}`;

function lerRascunho(userId) {
  try {
    const bruto = localStorage.getItem(chaveRascunho(userId));
    if (!bruto) return null;
    const d = JSON.parse(bruto);
    // Só vale a pena recuperar se tem conteúdo de verdade — senão a pessoa
    // veria um aviso de "rascunho recuperado" por causa de um campo vazio.
    const temAlgo = d.titulo?.trim() || d.local?.trim() || d.participantes?.length
      || d.pautas?.length || d.decisoes?.length || d.acoes?.length;
    return temAlgo ? d : null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Um assunto da reunião, com tudo o que pertence a ele: os subtemas
// discutidos, o que foi decidido e o que ficou para fazer.
//
// Antes eram três listas soltas no fim do formulário, sem ligação entre si
// — na hora de ler a ata, ninguém sabia qual decisão pertencia a qual
// assunto. Agora cada pauta carrega o que é dela.
//
// Fica FORA do componente principal de propósito: definido dentro, ele
// seria recriado a cada tecla e o campo perderia o foco no meio da
// digitação.
// ─────────────────────────────────────────────────────────────
function BlocoPauta({ pauta, indice, aoMudar, aoRemover }) {
  const [subtema, setSubtema] = useState('');
  const [decisao, setDecisao] = useState('');
  const [acao, setAcao] = useState({ desc: '', resp: '', prazo: '' });

  const muda = (campo, valor) => aoMudar(indice, { ...pauta, [campo]: valor });

  const addSubtema = () => {
    if (!subtema.trim()) return;
    muda('subtemas', [...(pauta.subtemas || []), subtema.trim()]);
    setSubtema('');
  };
  const addDecisao = () => {
    if (!decisao.trim()) return;
    muda('decisoes', [...(pauta.decisoes || []), decisao.trim()]);
    setDecisao('');
  };
  const addAcao = () => {
    if (!acao.desc.trim()) return;
    muda('acoes', [...(pauta.acoes || []), { ...acao, prazo: acao.prazo ? formatDateBR(acao.prazo) : '' }]);
    setAcao({ desc: '', resp: '', prazo: '' });
  };
  const tira = (campo, i) => muda(campo, (pauta[campo] || []).filter((_, idx) => idx !== i));

  const rotulo = { fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: .3 };
  const itemLista = {
    background: 'var(--surface-2)', borderRadius: 8, padding: '8px 11px', marginBottom: 6,
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 13,
  };

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
          <span style={{ background: 'var(--primary)', color: '#fff', borderRadius: 8, minWidth: 24, height: 24,
                         display: 'flex', alignItems: 'center', justifyContent: 'center',
                         fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
            {indice + 1}
          </span>
          <strong style={{ fontSize: 14.5, wordBreak: 'break-word' }}>{pauta.titulo}</strong>
        </div>
        <button onClick={() => aoRemover(indice)} aria-label="Remover esta pauta" title="Remover esta pauta"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6, margin: -6, flexShrink: 0 }}>
          <X size={15} />
        </button>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={rotulo}>SUBTEMAS DISCUTIDOS</div>
        {(pauta.subtemas || []).map((s, i) => (
          <div key={i} style={itemLista}>
            <span style={{ minWidth: 0, wordBreak: 'break-word' }}>• {s}</span>
            <X size={13} style={{ cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0 }} onClick={() => tira('subtemas', i)} />
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Guarda também ao sair do campo. Sem isso, quem digitava e ia
              direto salvar perdia o texto em silêncio — foi o que aconteceu
              numa reunião real, e o subtema simplesmente não saiu na ata. */}
          <input className="input" value={subtema} onChange={e => setSubtema(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addSubtema()}
            onBlur={addSubtema}
            placeholder="Ex: Avarias no recebimento" />
          <button className="btn" onClick={addSubtema}>+</button>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={rotulo}>DECISÕES DESTE ASSUNTO</div>
        {(pauta.decisoes || []).map((d, i) => (
          <div key={i} style={itemLista}>
            <span style={{ minWidth: 0, wordBreak: 'break-word' }}>✓ {d}</span>
            <X size={13} style={{ cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0 }} onClick={() => tira('decisoes', i)} />
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" value={decisao} onChange={e => setDecisao(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addDecisao()}
            onBlur={addDecisao}
            placeholder="Ex: Conferir avaria antes de assinar o canhoto" />
          <button className="btn" onClick={addDecisao}>+</button>
        </div>
      </div>

      <div>
        <div style={rotulo}>AÇÕES DESTE ASSUNTO</div>
        {(pauta.acoes || []).map((a, i) => (
          <div key={i} style={{ ...itemLista, alignItems: 'flex-start' }}>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 600, wordBreak: 'break-word' }}>{a.desc}</span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                👤 {a.resp || '—'} · 📅 {a.prazo || 'sem prazo'}
              </span>
            </span>
            <X size={13} style={{ cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0 }} onClick={() => tira('acoes', i)} />
          </div>
        ))}
        {/* A ação tem três campos, então só é guardada quando o foco deixa o
            bloco INTEIRO — guardar ao sair do primeiro campo criaria uma
            ação sem responsável e sem prazo, no meio da digitação. */}
        <div
          onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) addAcao(); }}
          style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
          <input className="input" value={acao.desc} onChange={e => setAcao(a => ({ ...a, desc: e.target.value }))} placeholder="O que precisa ser feito" />
          <input className="input" value={acao.resp} onChange={e => setAcao(a => ({ ...a, resp: e.target.value }))} placeholder="Responsável" />
          <input className="input" type="date" value={acao.prazo} onChange={e => setAcao(a => ({ ...a, prazo: e.target.value }))} />
        </div>
        <button className="btn" style={{ marginTop: 8 }} onClick={addAcao}>+ Adicionar ação</button>
      </div>
    </div>
  );
}

const formVazio = () => ({
  // id vazio = ata nova. Preenchido = está editando uma que já existe.
  id: null,
  titulo: '', data: new Date().toISOString().slice(0, 10),
  hora_inicio: '', hora_fim: '', local: '',
  participantes: [], pautas: [], decisoes: [], acoes: [], proxima_reuniao: '',
});

export default function AtaReuniao({ userId, profile }) {
  const toast = useToast();
  const [aba, setAba] = useState('lista'); // lista | nova | detalhe
  const [atas, setAtas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [equipe, setEquipe] = useState([]);
  const [detalhe, setDetalhe] = useState(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);

  // Começa do rascunho, se houver: a recuperação precisa acontecer já na
  // primeira renderização, senão a tela pisca vazia antes de preencher.
  const [form, setForm] = useState(() => lerRascunho(userId) || formVazio());
  const [rascunhoRecuperado, setRascunhoRecuperado] = useState(() => !!lerRascunho(userId));
  const [novaPautaTitulo, setNovaPautaTitulo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [novoComentario, setNovoComentario] = useState('');

  const loadAtas = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/atas?requester_id=${userId}`);
      setAtas(r.data);
    } catch {
      toast('Erro ao carregar atas', 'error');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (userId) loadAtas();
    if (profile?.company) {
      api.get(`/profile/all?company=${encodeURIComponent(profile.company)}`)
        // Fora eu mesmo (quem cria já é participante) e quem está
        // desligado: convidar alguém inativo para uma reunião não faz
        // sentido, e ele nunca chegaria para assinar.
        .then(r => setEquipe((r.data || []).filter(p => p.id !== userId && p.active !== false)))
        .catch(() => {});
    }
  }, [userId, profile?.company]);

  // Guarda o rascunho a cada mudança. É barato (texto curto) e é o que
  // garante que nada se perca se o celular descarregar a página.
  useEffect(() => {
    if (!userId) return;
    // Editando uma ata que já existe, o rascunho não é guardado: ele serve
    // para não perder o que ainda não foi salvo em lugar nenhum. Guardar
    // aqui faria a edição reaparecer depois como se fosse uma ata nova.
    if (form.id) return;
    try {
      const temAlgo = form.titulo?.trim() || form.local?.trim() || form.participantes.length
        || form.pautas.length || form.decisoes.length || form.acoes.length;
      if (temAlgo) localStorage.setItem(chaveRascunho(userId), JSON.stringify(form));
      else localStorage.removeItem(chaveRascunho(userId));
    } catch { /* aba anônima ou armazenamento cheio */ }
  }, [form, userId]);

  const descartarRascunho = () => {
    if (!window.confirm('Descartar o que já foi preenchido?')) return;
    try { localStorage.removeItem(chaveRascunho(userId)); } catch { /* nada */ }
    setForm(formVazio());
    setRascunhoRecuperado(false);
  };

  // Avisa antes de fechar a aba com coisa não salva. No celular o navegador
  // costuma ignorar, e é por isso que o rascunho acima existe — este aviso
  // é a segunda camada, não a principal.
  useEffect(() => {
    const aoSair = (e) => {
      const temAlgo = form.titulo?.trim() || form.pautas.length || form.decisoes.length || form.acoes.length;
      if (!temAlgo) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', aoSair);
    return () => window.removeEventListener('beforeunload', aoSair);
  }, [form]);

  const removeParticipante = (id) => setForm(f => ({ ...f, participantes: f.participantes.filter(p => p.id !== id) }));

  // ─── Escolha dos participantes ───────────────────────────────
  // Antes era uma lista suspensa que adicionava um por vez. Para reunião
  // de equipe inteira isso significava dezenas de cliques, então virou
  // lista com marcação, busca e seleção em massa.
  const [buscaPessoa, setBuscaPessoa] = useState('');
  const [setorFiltro, setSetorFiltro] = useState('');

  const setores = [...new Set(equipe.map(p => p.sector).filter(Boolean))].sort();

  const termoPessoa = buscaPessoa.trim().toLowerCase();
  const equipeVisivel = equipe.filter(p => {
    if (setorFiltro && p.sector !== setorFiltro) return false;
    if (!termoPessoa) return true;
    return `${p.full_name || ''} ${p.role || ''} ${p.sector || ''}`.toLowerCase().includes(termoPessoa);
  });

  const estaSelecionado = id => form.participantes.some(p => p.id === id);

  const alternarPessoa = (pessoa) => setForm(f => ({
    ...f,
    participantes: f.participantes.some(p => p.id === pessoa.id)
      ? f.participantes.filter(p => p.id !== pessoa.id)
      : [...f.participantes, pessoa],
  }));

  // Agem sobre quem está VISÍVEL. Combinado com o filtro de setor, é assim
  // que se convida "todo o setor de Caixa" em dois toques.
  const marcarVisiveis = () => setForm(f => {
    const jaTem = new Set(f.participantes.map(p => p.id));
    return { ...f, participantes: [...f.participantes, ...equipeVisivel.filter(p => !jaTem.has(p.id))] };
  });
  const desmarcarVisiveis = () => setForm(f => {
    const visiveis = new Set(equipeVisivel.map(p => p.id));
    return { ...f, participantes: f.participantes.filter(p => !visiveis.has(p.id)) };
  });

  const todosVisiveisMarcados = equipeVisivel.length > 0 && equipeVisivel.every(p => estaSelecionado(p.id));

  const addPauta = () => {
    if (!novaPautaTitulo.trim()) return;
    setForm(f => ({ ...f, pautas: [...f.pautas, { titulo: novaPautaTitulo.trim(), subtemas: [], decisoes: [], acoes: [] }] }));
    setNovaPautaTitulo('');
  };
  // Editar: só quem criou a ata ou um gestor. Mesma regra de quem pode
  // apagar — quem pode remover o documento inteiro também pode corrigi-lo.
  const podeEditarAta = !!detalhe && (
    detalhe.criado_por === userId || ['admin', 'master'].includes(profile?.access_level)
  );

  const editarAta = () => {
    const assinadas = detalhe.assinaturas?.length || 0;
    if (assinadas && !window.confirm(
      `${assinadas} pessoa(s) já assinaram esta ata.\n\n` +
      'Editar apaga essas assinaturas e todos precisarão assinar de novo — ' +
      'uma assinatura vale para o texto que a pessoa leu.\n\nContinuar?'
    )) return;

    // Carrega a ata no formulário, com os participantes no formato que a
    // tela usa (objeto com nome), não só os identificadores.
    setForm({
      id: detalhe.id,
      titulo: detalhe.titulo || '',
      data: detalhe.data || new Date().toISOString().slice(0, 10),
      hora_inicio: detalhe.hora_inicio || '',
      hora_fim: detalhe.hora_fim || '',
      local: detalhe.local || '',
      participantes: (detalhe.participantes_detalhe || []).map(p => ({ id: p.id, full_name: p.full_name })),
      pautas: (detalhe.pauta || []).map(p => ({
        titulo: p.titulo,
        subtemas: p.subtemas || [],
        decisoes: p.decisoes || [],
        acoes: p.acoes || [],
      })),
      decisoes: detalhe.decisoes || [],
      acoes: detalhe.acoes || [],
      proxima_reuniao: detalhe.proxima_reuniao || '',
    });
    setRascunhoRecuperado(false);
    setAba('nova');
  };

  const cancelarEdicao = () => {
    const id = form.id;
    setForm(formVazio());
    setRascunhoRecuperado(false);
    if (id) abrirDetalhe(id); else setAba('lista');
  };

  const criarAta = async () => {
    if (!form.titulo.trim()) return toast('Digite o título da reunião', 'error');
    setSalvando(true);
    try {
      const corpo = {
        requester_id: userId,
        titulo: form.titulo, data: form.data, hora_inicio: form.hora_inicio, hora_fim: form.hora_fim,
        local: form.local, participantes: form.participantes.map(p => p.id),
        pauta: form.pautas,
        // Decisões e ações vivem dentro de cada assunto. Na edição, o que a
        // ata antiga tinha solto é preservado — apagar seria perder parte do
        // registro só porque o formato mudou.
        decisoes: form.decisoes || [], acoes: form.acoes || [],
        proxima_reuniao: form.proxima_reuniao || null,
      };

      const editando = !!form.id;
      const r = editando
        ? await api.put(`/atas/${form.id}`, corpo)
        : await api.post('/atas', corpo);

      const invalidadas = r.data?.assinaturas_invalidadas || 0;
      toast(editando
        ? (invalidadas ? `Ata atualizada. ${invalidadas} assinatura(s) precisam ser refeitas.` : 'Ata atualizada!')
        : 'Ata criada!');

      // O rascunho só sai DEPOIS de a ata ser gravada com sucesso. Limpar
      // antes significaria perder tudo se o envio falhasse.
      try { localStorage.removeItem(chaveRascunho(userId)); } catch { /* nada */ }
      setRascunhoRecuperado(false);
      setForm(formVazio());
      await loadAtas();
      abrirDetalhe(editando ? form.id : r.data.id);
    } catch (e) {
      toast(e.response?.data?.error || 'Erro ao salvar a ata', 'error');
    }
    setSalvando(false);
  };

  const abrirDetalhe = async (id) => {
    setAba('detalhe');
    setCarregandoDetalhe(true);
    try {
      const r = await api.get(`/atas/${id}?requester_id=${userId}`);
      setDetalhe(r.data);
    } catch {
      toast('Erro ao carregar ata', 'error');
      setAba('lista');
    }
    setCarregandoDetalhe(false);
  };

  // O comentário sendo digitado também é guardado, por ata. Numa reunião a
  // pessoa escreve um parágrafo, é interrompida, sai do app — e voltava
  // para um campo em branco.
  const chaveComentario = id => `ata_comentario_${userId}_${id}`;

  useEffect(() => {
    if (!detalhe?.id) return;
    try {
      const guardado = localStorage.getItem(chaveComentario(detalhe.id));
      if (guardado) setNovoComentario(guardado);
    } catch { /* aba anônima */ }
  }, [detalhe?.id]);

  useEffect(() => {
    if (!detalhe?.id) return;
    try {
      if (novoComentario.trim()) localStorage.setItem(chaveComentario(detalhe.id), novoComentario);
      else localStorage.removeItem(chaveComentario(detalhe.id));
    } catch { /* aba anônima */ }
  }, [novoComentario, detalhe?.id]);

  const enviarComentario = async () => {
    if (!novoComentario.trim()) return;
    try {
      const r = await api.post(`/atas/${detalhe.id}/comentarios`, { requester_id: userId, texto: novoComentario.trim() });
      setDetalhe(d => ({ ...d, comentarios: [...d.comentarios, r.data] }));
      // Só limpa depois de o comentário ser aceito pelo servidor.
      try { localStorage.removeItem(chaveComentario(detalhe.id)); } catch { /* nada */ }
      setNovoComentario('');
    } catch {
      toast('Erro ao adicionar comentário', 'error');
    }
  };

  const assinar = async () => {
    try {
      const r = await api.post(`/atas/${detalhe.id}/assinar`, { requester_id: userId });
      setDetalhe(d => ({ ...d, assinaturas: [...d.assinaturas.filter(a => a.user_id !== userId), r.data] }));
    } catch (e) {
      toast(e.response?.data?.error || 'Erro ao assinar', 'error');
    }
  };

  const desfazerAssinatura = async () => {
    try {
      await api.delete(`/atas/${detalhe.id}/assinar?requester_id=${userId}`);
      setDetalhe(d => ({ ...d, assinaturas: d.assinaturas.filter(a => a.user_id !== userId) }));
    } catch {
      toast('Erro ao desfazer assinatura', 'error');
    }
  };

  const gerarPDF = () => {
    const doc = new jsPDF();
    const orange = [232, 104, 26];
    const dark = [40, 40, 45];
    let y = 20;

    // O cabeçalho leva o nome da LOJA, não o do app: o documento é dela, e
    // é ela que aparece quando a ata circula impressa ou por e-mail. O nome
    // do app fica no rodapé.
    doc.setFillColor(46, 26, 71);
    doc.rect(0, 0, 210, 26, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16); doc.setFont('helvetica', 'bold');
    doc.text(profile?.company || 'Ata de Reunião', 14, 12, { maxWidth: 182 });
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text('Ata de Reunião', 14, 19);

    function checkPage(min) { if (y > 270 - min) { doc.addPage(); y = 20; } }

    // Escreve respeitando a largura e avança pelo NÚMERO REAL de linhas.
    // Antes o avanço era fixo: com muitos participantes o texto ocupava três
    // linhas e o título seguinte caía por cima.
    function escreve(texto, x = 14, largura = 182, alturaLinha = 5, folgaDepois = 0) {
      const linhas = doc.splitTextToSize(String(texto ?? ''), largura);
      checkPage(linhas.length * alturaLinha + 6);
      doc.text(linhas, x, y);
      y += linhas.length * alturaLinha + folgaDepois;
    }

    function sectionTitle(t) {
      checkPage(22);
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...orange);
      doc.text(t.toUpperCase(), 14, y); y += 8;
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...dark); doc.setFontSize(10);
    }

    y = 38;
    doc.setTextColor(...dark);
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    escreve(detalhe.titulo, 14, 182, 7, 3);

    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 105);
    escreve(
      `Data: ${formatDateBR(detalhe.data)}   ·   Horário: ${detalhe.hora_inicio || '—'} às ${detalhe.hora_fim || '—'}   ·   Local: ${detalhe.local || '—'}`,
      14, 182, 5, 6,
    );

    doc.setDrawColor(230, 230, 230);
    doc.line(14, y, 196, y);
    y += 10;

    sectionTitle('Participantes');
    doc.setTextColor(...dark);
    const nomes = detalhe.participantes_detalhe.map(p => p.full_name).join(', ') || 'Nenhum participante';
    escreve(nomes, 14, 182, 5, 10);

    // Cada assunto sai com o que pertence a ele. No papel isso é ainda mais
    // importante que na tela: quem lê a ata depois precisa saber a qual
    // assunto cada decisão se refere.
    sectionTitle('Assuntos da reunião');
    const pautas = detalhe.pauta || [];
    if (!pautas.length) { doc.text('Nenhum assunto registrado', 14, y); y += 8; }

    pautas.forEach((p, i) => {
      checkPage(22);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
      const tituloLinhas = doc.splitTextToSize(`${i + 1}. ${p.titulo}`, 178);
      doc.text(tituloLinhas, 14, y); y += tituloLinhas.length * 5 + 3;
      doc.setFontSize(10);

      const subLista = (rotulo, itens, prefixo) => {
        if (!itens?.length) return;
        checkPage(12);
        doc.setFont('helvetica', 'bold'); doc.setTextColor(120, 120, 125);
        doc.setFontSize(8); doc.text(rotulo, 20, y); y += 4;
        doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(...dark);
        itens.forEach(t => {
          checkPage(9);
          const linhas = doc.splitTextToSize(`${prefixo} ${t}`, 170);
          doc.text(linhas, 22, y); y += linhas.length * 5;
        });
        y += 3;
      };

      subLista('SUBTEMAS', p.subtemas, '•');
      subLista('DECISÕES', p.decisoes, '✓');

      if (p.acoes?.length) {
        checkPage(12);
        doc.setFont('helvetica', 'bold'); doc.setTextColor(120, 120, 125);
        doc.setFontSize(8); doc.text('AÇÕES', 20, y); y += 4;
        doc.setFontSize(10); doc.setTextColor(...dark);
        p.acoes.forEach(a => {
          checkPage(14);
          doc.setFont('helvetica', 'bold');
          const linhas = doc.splitTextToSize(`• ${a.desc}`, 170);
          doc.text(linhas, 22, y); y += linhas.length * 5;
          doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 120, 125);
          doc.text(`Responsável: ${a.resp || '—'}   ·   Prazo: ${a.prazo || 'sem prazo'}`, 26, y);
          doc.setTextColor(...dark); y += 6;
        });
        y += 2;
      }

      // Assunto sem detalhamento não fica com um vazio inexplicável.
      if (!p.subtemas?.length && !p.decisoes?.length && !p.acoes?.length) {
        doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 120, 125);
        doc.text('Sem detalhamento.', 22, y); doc.setTextColor(...dark); y += 6;
      }
      y += 3;
    });

    // Atas antigas guardavam decisões e ações fora dos assuntos. Só saem no
    // PDF se existirem, para o histórico não ficar incompleto.
    if (detalhe.decisoes?.length) {
      y += 2;
      sectionTitle('Decisões gerais');
      detalhe.decisoes.forEach(d => {
        checkPage(10);
        const linhas = doc.splitTextToSize(`✓ ${d}`, 178);
        doc.text(linhas, 14, y); y += linhas.length * 5 + 2;
      });
    }

    if (detalhe.acoes?.length) {
      y += 3;
      sectionTitle('Ações gerais');
      detalhe.acoes.forEach(a => {
        checkPage(15);
        doc.setFont('helvetica', 'bold'); doc.text(`• ${a.desc}`, 14, y); y += 5;
        doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 120, 125);
        doc.text(`Responsável: ${a.resp || '—'}   ·   Prazo: ${a.prazo || 'sem prazo'}`, 18, y);
        doc.setTextColor(...dark); y += 8;
      });
    }

    if (detalhe.comentarios.length) {
      y += 2;
      sectionTitle('Comentários dos participantes');
      detalhe.comentarios.forEach(c => {
        checkPage(15);
        doc.setFont('helvetica', 'bold'); doc.text(`${c.autor_nome}:`, 14, y); y += 5;
        doc.setFont('helvetica', 'normal');
        const lines = doc.splitTextToSize(c.texto, 176);
        doc.text(lines, 18, y); y += lines.length * 5 + 4;
      });
    }

    if (detalhe.proxima_reuniao) {
      y += 2;
      sectionTitle('Próxima reunião');
      doc.text(formatDateBR(detalhe.proxima_reuniao), 14, y); y += 8;
    }

    if (detalhe.assinaturas.length) {
      y += 4;
      sectionTitle('Assinaturas');
      detalhe.assinaturas.forEach(a => {
        checkPage(22);
        const nome = detalhe.participantes_detalhe.find(p => p.id === a.user_id)?.full_name || '';
        doc.setFont('times', 'italic'); doc.setFontSize(16); doc.setTextColor(...dark);
        doc.text(a.texto_assinatura, 14, y); y += 6;
        doc.setDrawColor(200, 200, 200); doc.line(14, y, 84, y); y += 5;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(120, 120, 125);
        doc.text(`Assinado digitalmente por ${nome} · ${new Date(a.assinado_em).toLocaleString('pt-BR')}`, 14, y);
        doc.setTextColor(...dark); doc.setFontSize(10); y += 12;
      });
    }

    // Rodapé em TODAS as páginas. Antes era escrito uma vez só, no fim, e
    // numa ata de várias páginas ele aparecia apenas na última — as outras
    // saíam sem identificação nenhuma e sem número de página.
    const totalPaginas = doc.internal.getNumberOfPages();
    for (let pagina = 1; pagina <= totalPaginas; pagina++) {
      doc.setPage(pagina);
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(150, 150, 155);
      doc.text('Rota Líder · rotalider.com.br', 14, 290);
      doc.text(`Página ${pagina} de ${totalPaginas}`, 196, 290, { align: 'right' });
    }

    doc.save(`ata-${detalhe.titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`);
  };

  const jaAssinei = detalhe?.assinaturas?.some(a => a.user_id === userId);
  const souParticipante = detalhe?.participantes_detalhe?.some(p => p.id === userId);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Ata de Reunião</h1>
          <p className="page-subtitle">Gestão do Tempo e Produtividade</p>
        </div>
        {aba !== 'nova' && (
          <button className="btn btn-primary btn-sm" onClick={() => {
            // Se havia uma edição aberta, "Nova ata" começa de fato do zero —
            // senão a pessoa editaria a ata antiga achando que criava outra.
            if (form.id) setForm(formVazio());
            setAba('nova');
          }}>
            <Plus size={14}/> Nova ata
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        <button onClick={() => setAba('lista')} style={{
          padding: '9px 16px', fontSize: 13, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer',
          color: aba === 'lista' || aba === 'detalhe' ? 'var(--primary)' : 'var(--text-muted)',
          borderBottom: aba === 'lista' || aba === 'detalhe' ? '2px solid var(--primary)' : '2px solid transparent',
        }}>Atas ({atas.length})</button>
        <button onClick={() => setAba('nova')} style={{
          padding: '9px 16px', fontSize: 13, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer',
          color: aba === 'nova' ? 'var(--primary)' : 'var(--text-muted)',
          borderBottom: aba === 'nova' ? '2px solid var(--primary)' : '2px solid transparent',
        }}>{form.id ? 'Editando ata' : 'Nova ata'}</button>
      </div>

      {aba === 'lista' && (
        loading ? <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Carregando...</div>
        : atas.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <ClipboardList size={48} style={{ opacity: .15, marginBottom: 12 }}/>
            <h3>Nenhuma ata registrada</h3>
            <p style={{ color: 'var(--text-muted)', marginTop: 6, fontSize: 13 }}>Crie a primeira ata de reunião da equipe.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {atas.map(a => (
              <div key={a.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => abrirDetalhe(a.id)}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{a.titulo}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                    {formatDateBR(a.data)} · {a.participantes_nomes.length} participante{a.participantes_nomes.length !== 1 ? 's' : ''} · {a.assinaturas_count} assinatura{a.assinaturas_count !== 1 ? 's' : ''}
                  </div>
                </div>
                <PenTool size={16} color="var(--text-muted)"/>
              </div>
            ))}
          </div>
        )
      )}

      {aba === 'nova' && (
        <div>
          {form.id && (
            <div className="card" style={{ marginBottom: 12, borderLeft: '4px solid #f59e0b', borderRadius: '0 12px 12px 0' }}>
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                <strong>Editando uma ata já registrada.</strong> Ao salvar, as assinaturas
                existentes são apagadas e os participantes precisam assinar de novo — uma
                assinatura vale para o texto que a pessoa leu.
              </div>
            </div>
          )}

          {rascunhoRecuperado && (
            <div className="card" style={{ marginBottom: 12, display:'flex', alignItems:'center',
                                           justifyContent:'space-between', gap:12, flexWrap:'wrap',
                                           borderLeft:'4px solid var(--primary)', borderRadius:'0 12px 12px 0' }}>
              <div style={{ fontSize:13, lineHeight:1.5 }}>
                <strong>Rascunho recuperado.</strong> O que você tinha preenchido está aqui —
                nada se perdeu quando o app fechou.
              </div>
              <button className="btn btn-ghost" style={{ fontSize:12, flexShrink:0 }} onClick={descartarRascunho}>
                Começar do zero
              </button>
            </div>
          )}

          <div className="card">
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--primary)', marginBottom: 12, textTransform: 'uppercase' }}>Cabeçalho</div>
            <div className="form-group">
              <label className="form-label">Título da reunião</label>
              <input className="input" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ex: Alinhamento semanal de metas"/>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
              <div className="form-group">
                <label className="form-label">Data</label>
                <input className="input" type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))}/>
              </div>
              <div className="form-group">
                <label className="form-label">Início</label>
                <input className="input" type="time" value={form.hora_inicio} onChange={e => setForm(f => ({ ...f, hora_inicio: e.target.value }))}/>
              </div>
              <div className="form-group">
                <label className="form-label">Fim</label>
                <input className="input" type="time" value={form.hora_fim} onChange={e => setForm(f => ({ ...f, hora_fim: e.target.value }))}/>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Local</label>
              <input className="input" value={form.local} onChange={e => setForm(f => ({ ...f, local: e.target.value }))} placeholder="Ex: Sala de treinamento / Google Meet"/>
            </div>
          </div>

          <div className="card">
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--primary)', marginBottom: 12, textTransform: 'uppercase' }}>Participantes</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {form.participantes.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Nenhum participante ainda</span>}
              {form.participantes.map(p => (
                <span key={p.id} style={{ background: 'var(--primary)', color: '#fff', fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {p.full_name}
                  <X size={12} style={{ cursor: 'pointer' }} onClick={() => removeParticipante(p.id)}/>
                </span>
              ))}
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom:10 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, flex:'1 1 200px',
                            background:'var(--surface-1)', borderRadius:'var(--radius)', padding:'7px 11px' }}>
                <Search size={14} style={{ color:'var(--text-muted)', flexShrink:0 }}/>
                <input value={buscaPessoa} onChange={e => setBuscaPessoa(e.target.value)}
                  placeholder="Buscar por nome, cargo ou setor"
                  style={{ border:'none', background:'none', outline:'none', width:'100%', fontSize:13, color:'var(--text)' }}/>
                {buscaPessoa && (
                  <X size={14} style={{ cursor:'pointer', color:'var(--text-muted)' }} onClick={() => setBuscaPessoa('')}/>
                )}
              </div>
              <button className="btn btn-ghost" style={{ fontSize:12 }}
                onClick={todosVisiveisMarcados ? desmarcarVisiveis : marcarVisiveis}
                disabled={equipeVisivel.length === 0}>
                {todosVisiveisMarcados ? 'Desmarcar todos' : 'Selecionar todos'}
              </button>
            </div>

            {setores.length > 1 && (
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
                <button onClick={() => setSetorFiltro('')}
                  style={{ padding:'4px 11px', borderRadius:99, fontSize:12, cursor:'pointer', fontWeight:600,
                           border:'1px solid var(--border)',
                           background: setorFiltro === '' ? 'var(--text)' : 'transparent',
                           color: setorFiltro === '' ? 'var(--surface)' : 'var(--text-muted)' }}>
                  Todos os setores
                </button>
                {setores.map(s => (
                  <button key={s} onClick={() => setSetorFiltro(f => f === s ? '' : s)}
                    style={{ padding:'4px 11px', borderRadius:99, fontSize:12, cursor:'pointer', fontWeight:600,
                             border:'1px solid var(--border)',
                             background: setorFiltro === s ? 'var(--primary)' : 'transparent',
                             color: setorFiltro === s ? '#fff' : 'var(--text-muted)' }}>
                    {s}
                  </button>
                ))}
              </div>
            )}

            <div style={{ border:'1px solid var(--border)', borderRadius:'var(--radius)',
                          maxHeight:280, overflowY:'auto' }}>
              {equipeVisivel.length === 0 ? (
                <div style={{ padding:22, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>
                  {equipe.length === 0 ? 'Nenhuma outra pessoa cadastrada na loja.' : 'Ninguém encontrado com esse filtro.'}
                </div>
              ) : equipeVisivel.map(p => {
                const marcado = estaSelecionado(p.id);
                return (
                  <label key={p.id}
                    style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', cursor:'pointer',
                             borderBottom:'1px solid var(--border)',
                             background: marcado ? 'var(--surface-1)' : 'transparent' }}>
                    <input type="checkbox" checked={marcado} onChange={() => alternarPessoa(p)}
                      style={{ width:16, height:16, flexShrink:0, cursor:'pointer', accentColor:'var(--primary)' }}/>
                    <Avatar avatarUrl={p.avatar_url} name={p.full_name} size={28}/>
                    <span style={{ minWidth:0 }}>
                      <span style={{ display:'block', fontSize:13.5, fontWeight:600, overflow:'hidden',
                                     textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {p.full_name}
                      </span>
                      {(p.role || p.sector) && (
                        <span style={{ display:'block', fontSize:11.5, color:'var(--text-muted)' }}>
                          {[p.role, p.sector].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>

            <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:8 }}>
              {form.participantes.length} de {equipe.length} selecionado{form.participantes.length !== 1 ? 's' : ''}
              {setorFiltro || termoPessoa ? ` · mostrando ${equipeVisivel.length}` : ''}
            </div>
          </div>

          <div className="card">
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--primary)', marginBottom: 4, textTransform: 'uppercase' }}>
              Assuntos da reunião
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
              Cada assunto guarda os próprios subtemas, decisões e ações — assim,
              ao reler a ata, dá para ver o que foi decidido sobre o quê.
            </p>

            {form.pautas.map((p, i) => (
              <BlocoPauta
                key={i} pauta={p} indice={i}
                aoMudar={(idx, nova) => setForm(f => ({ ...f, pautas: f.pautas.map((x, j) => j === idx ? nova : x) }))}
                aoRemover={(idx) => setForm(f => ({ ...f, pautas: f.pautas.filter((_, j) => j !== idx) }))}
              />
            ))}

            {form.pautas.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                Comece pelo primeiro assunto. Ex: <strong>Quebras</strong>.
              </p>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" value={novaPautaTitulo} onChange={e => setNovaPautaTitulo(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addPauta()} onBlur={addPauta} placeholder="Novo assunto (ex: Quebras)"/>
              <button className="btn btn-primary" onClick={addPauta} style={{ flexShrink: 0 }}>
                <Plus size={14}/> Assunto
              </button>
            </div>
          </div>

          <div className="card">
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--primary)', marginBottom: 12, textTransform: 'uppercase' }}>Próxima reunião (opcional)</div>
            <input className="input" type="date" value={form.proxima_reuniao} onChange={e => setForm(f => ({ ...f, proxima_reuniao: e.target.value }))}/>
          </div>

          {form.id && (
            <button className="btn btn-ghost" style={{ width: '100%', padding: 12, fontSize: 13 }} onClick={cancelarEdicao} disabled={salvando}>
              Cancelar edição
            </button>
          )}

          <button className="btn btn-primary" style={{ width: '100%', padding: 14, fontSize: 14 }} onClick={criarAta} disabled={salvando}>
            {salvando ? 'Salvando...' : (form.id ? 'Salvar alterações' : 'Criar ata')}
          </button>
        </div>
      )}

      {aba === 'detalhe' && (
        carregandoDetalhe || !detalhe ? (
          <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Carregando...</div>
        ) : (
          <div>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 800 }}>{detalhe.titulo}</h2>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    {formatDateBR(detalhe.data)} · {detalhe.hora_inicio || '—'} às {detalhe.hora_fim || '—'} · {detalhe.local || '—'}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  {podeEditarAta && (
                    <button className="btn btn-sm" onClick={editarAta}>
                      <Pencil size={14}/> Editar
                    </button>
                  )}
                  <button className="btn btn-primary btn-sm" onClick={gerarPDF}>
                    <FileDown size={14}/> Gerar PDF
                  </button>
                </div>
              </div>

              {detalhe.editado_em && (
                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                  ✏️ Editada em {new Date(detalhe.editado_em).toLocaleString('pt-BR')} — as assinaturas
                  anteriores foram invalidadas e precisam ser refeitas.
                </div>
              )}

              <div style={{ marginTop: 12, fontSize: 13 }}>
                <strong>Participantes: </strong>
                {detalhe.participantes_detalhe.map(p => p.full_name).join(', ') || '—'}
              </div>
            </div>

            <div className="card">
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--primary)', marginBottom: 12, textTransform: 'uppercase' }}>Assuntos da reunião</div>
              {(detalhe.pauta || []).length === 0 && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nenhum assunto registrado</p>}
              {(detalhe.pauta || []).map((p, i) => (
                <div key={i} style={{ borderLeft: '3px solid var(--primary)', paddingLeft: 12, marginBottom: 18 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 8 }}>{i + 1}. {p.titulo}</div>

                  {(p.subtemas || []).length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>SUBTEMAS</div>
                      {p.subtemas.map((s, j) => <div key={j} style={{ fontSize: 13, marginBottom: 3 }}>• {s}</div>)}
                    </div>
                  )}

                  {(p.decisoes || []).length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>DECISÕES</div>
                      {p.decisoes.map((d, j) => <div key={j} style={{ fontSize: 13, marginBottom: 3 }}>✓ {d}</div>)}
                    </div>
                  )}

                  {(p.acoes || []).length > 0 && (
                    <div>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>AÇÕES</div>
                      {p.acoes.map((a, j) => (
                        <div key={j} style={{ fontSize: 13, marginBottom: 6 }}>
                          <strong>{a.desc}</strong>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>👤 {a.resp || '—'} · 📅 {a.prazo || 'sem prazo'}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {!(p.subtemas || []).length && !(p.decisoes || []).length && !(p.acoes || []).length && (
                    <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Sem detalhamento.</div>
                  )}
                </div>
              ))}
            </div>

            {/* Atas criadas antes desta organização guardavam decisões e ações
                soltas, fora dos assuntos. Continuam aparecendo, senão o
                histórico ficaria incompleto. */}
            {(detalhe.decisoes || []).length > 0 && (
              <div className="card">
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--primary)', marginBottom: 10, textTransform: 'uppercase' }}>Decisões gerais</div>
                {detalhe.decisoes.map((d, i) => <div key={i} style={{ fontSize: 13, marginBottom: 6 }}>✓ {d}</div>)}
              </div>
            )}

            {(detalhe.acoes || []).length > 0 && (
              <div className="card">
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--primary)', marginBottom: 10, textTransform: 'uppercase' }}>Ações gerais</div>
                {detalhe.acoes.map((a, i) => (
                  <div key={i} style={{ fontSize: 13, marginBottom: 8 }}>
                    <strong>{a.desc}</strong>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>👤 {a.resp || '—'} · 📅 {a.prazo || 'sem prazo'}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="card">
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--primary)', marginBottom: 10, textTransform: 'uppercase' }}>Comentários</div>
              {detalhe.comentarios.map(c => (
                <div key={c.id} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
                  <strong style={{ fontSize: 13 }}>{c.autor_nome}</strong>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{c.texto}</div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input" value={novoComentario} onChange={e => setNovoComentario(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && enviarComentario()} placeholder="Escreva um comentário..."/>
                <button className="btn" onClick={enviarComentario}>+ Comentar</button>
              </div>
            </div>

            <div className="card">
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--primary)', marginBottom: 10, textTransform: 'uppercase' }}>Assinaturas</div>
              {detalhe.participantes_detalhe.map(p => {
                const assinatura = detalhe.assinaturas.find(a => a.user_id === p.id);
                const souEu = p.id === userId;
                return (
                  <div key={p.id} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '12px 14px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {assinatura ? (
                      <>
                        <div>
                          <div style={{ fontFamily: "'Dancing Script', cursive", fontSize: 24 }}>{assinatura.texto_assinatura}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Assinado digitalmente por {p.full_name} · {new Date(assinatura.assinado_em).toLocaleString('pt-BR')}</div>
                        </div>
                        {souEu ? <button className="btn" onClick={desfazerAssinatura}>Desfazer</button> : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>✓ Assinado</span>}
                      </>
                    ) : (
                      <>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{p.full_name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{souEu ? 'Use sua assinatura salva no perfil' : 'Aguardando assinatura'}</div>
                        </div>
                        {souEu
                          ? <button className="btn btn-primary" onClick={assinar}><PenTool size={13}/> Usar minha assinatura</button>
                          : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Pendente</span>}
                      </>
                    )}
                  </div>
                );
              })}
              {!souParticipante && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>Você não é participante desta ata.</p>
              )}
            </div>

            <button className="btn" onClick={() => setAba('lista')}>← Voltar para a lista</button>
          </div>
        )
      )}
    </div>
  );
}
