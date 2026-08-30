import React, { useEffect, useState } from 'react';
import { Plus, X, FileDown, PenTool, ClipboardList, Search } from 'lucide-react';
import Avatar from '../components/Avatar';
import jsPDF from 'jspdf';
import api from '../api';
import { useToast } from '../components/Toast';

function formatDateBR(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export default function AtaReuniao({ userId, profile }) {
  const toast = useToast();
  const [aba, setAba] = useState('lista'); // lista | nova | detalhe
  const [atas, setAtas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [equipe, setEquipe] = useState([]);
  const [detalhe, setDetalhe] = useState(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);

  const [form, setForm] = useState({
    titulo: '', data: new Date().toISOString().slice(0, 10),
    hora_inicio: '', hora_fim: '', local: '',
    participantes: [], pautas: [], decisoes: [], acoes: [], proxima_reuniao: '',
  });
  const [novaPautaTitulo, setNovaPautaTitulo] = useState('');
  const [novaDecisao, setNovaDecisao] = useState('');
  const [novaAcao, setNovaAcao] = useState({ desc: '', resp: '', prazo: '' });
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
    setForm(f => ({ ...f, pautas: [...f.pautas, { titulo: novaPautaTitulo.trim(), obs: '' }] }));
    setNovaPautaTitulo('');
  };
  const addDecisao = () => {
    if (!novaDecisao.trim()) return;
    setForm(f => ({ ...f, decisoes: [...f.decisoes, novaDecisao.trim()] }));
    setNovaDecisao('');
  };
  const addAcao = () => {
    if (!novaAcao.desc.trim()) return;
    setForm(f => ({ ...f, acoes: [...f.acoes, { ...novaAcao, prazo: novaAcao.prazo ? formatDateBR(novaAcao.prazo) : '' }] }));
    setNovaAcao({ desc: '', resp: '', prazo: '' });
  };

  const criarAta = async () => {
    if (!form.titulo.trim()) return toast('Digite o título da reunião', 'error');
    setSalvando(true);
    try {
      const r = await api.post('/atas', {
        requester_id: userId,
        titulo: form.titulo, data: form.data, hora_inicio: form.hora_inicio, hora_fim: form.hora_fim,
        local: form.local, participantes: form.participantes.map(p => p.id),
        pauta: form.pautas, decisoes: form.decisoes, acoes: form.acoes,
        proxima_reuniao: form.proxima_reuniao || null,
      });
      toast('Ata criada!');
      setForm({ titulo: '', data: new Date().toISOString().slice(0, 10), hora_inicio: '', hora_fim: '', local: '', participantes: [], pautas: [], decisoes: [], acoes: [], proxima_reuniao: '' });
      await loadAtas();
      abrirDetalhe(r.data.id);
    } catch (e) {
      toast(e.response?.data?.error || 'Erro ao criar ata', 'error');
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

  const enviarComentario = async () => {
    if (!novoComentario.trim()) return;
    try {
      const r = await api.post(`/atas/${detalhe.id}/comentarios`, { requester_id: userId, texto: novoComentario.trim() });
      setDetalhe(d => ({ ...d, comentarios: [...d.comentarios, r.data] }));
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

    doc.setFillColor(46, 26, 71);
    doc.rect(0, 0, 210, 26, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16); doc.setFont('helvetica', 'bold');
    doc.text('Rota Líder', 14, 12);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text('Ata de Reunião', 14, 19);

    y = 36;
    doc.setTextColor(...dark);
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text(detalhe.titulo, 14, y);
    y += 8;

    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 105);
    doc.text(`Data: ${formatDateBR(detalhe.data)}   ·   Horário: ${detalhe.hora_inicio || '—'} às ${detalhe.hora_fim || '—'}   ·   Local: ${detalhe.local || '—'}`, 14, y);
    y += 10;
    doc.setDrawColor(230, 230, 230);
    doc.line(14, y, 196, y);
    y += 8;

    function checkPage(min) { if (y > 270 - min) { doc.addPage(); y = 20; } }
    function sectionTitle(t) {
      checkPage(20);
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...orange);
      doc.text(t.toUpperCase(), 14, y); y += 7;
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...dark); doc.setFontSize(10);
    }

    sectionTitle('Participantes');
    const nomes = detalhe.participantes_detalhe.map(p => p.full_name).join(', ') || 'Nenhum participante';
    doc.text(nomes, 14, y, { maxWidth: 182 }); y += 12;

    sectionTitle('Pauta / Assuntos discutidos');
    if (!detalhe.pauta.length) { doc.text('Nenhum assunto registrado', 14, y); y += 8; }
    detalhe.pauta.forEach(p => {
      checkPage(15);
      doc.setFont('helvetica', 'bold'); doc.text(`• ${p.titulo}`, 14, y); y += 5;
      if (p.obs) {
        doc.setFont('helvetica', 'normal');
        const lines = doc.splitTextToSize(p.obs, 176);
        doc.text(lines, 18, y); y += lines.length * 5 + 3;
      } else { y += 3; }
    });
    y += 4;

    sectionTitle('Decisões tomadas');
    if (!detalhe.decisoes.length) { doc.text('Nenhuma decisão registrada', 14, y); y += 8; }
    detalhe.decisoes.forEach(d => {
      checkPage(10);
      const lines = doc.splitTextToSize(`✓ ${d}`, 178);
      doc.text(lines, 14, y); y += lines.length * 5 + 2;
    });
    y += 5;

    sectionTitle('Ações e responsáveis');
    if (!detalhe.acoes.length) { doc.text('Nenhuma ação registrada', 14, y); y += 8; }
    detalhe.acoes.forEach(a => {
      checkPage(15);
      doc.setFont('helvetica', 'bold'); doc.text(`• ${a.desc}`, 14, y); y += 5;
      doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 120, 125);
      doc.text(`Responsável: ${a.resp || '—'}   ·   Prazo: ${a.prazo || 'sem prazo'}`, 18, y);
      doc.setTextColor(...dark); y += 8;
    });

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

    doc.setFontSize(8); doc.setTextColor(150, 150, 155);
    doc.text('Rota Líder · Gestão, Liderança e Produtividade · rotalider.com.br', 14, 290);
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
          <button className="btn btn-primary btn-sm" onClick={() => setAba('nova')}>
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
        }}>Nova ata</button>
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
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--primary)', marginBottom: 12, textTransform: 'uppercase' }}>Pauta / Assuntos discutidos</div>
            {form.pautas.map((p, i) => (
              <div key={i} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 12px', marginBottom: 8, position: 'relative' }}>
                <X size={13} style={{ position: 'absolute', top: 10, right: 10, cursor: 'pointer', color: 'var(--text-muted)' }}
                  onClick={() => setForm(f => ({ ...f, pautas: f.pautas.filter((_, idx) => idx !== i) }))}/>
                <strong style={{ fontSize: 13 }}>{p.titulo}</strong>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" value={novaPautaTitulo} onChange={e => setNovaPautaTitulo(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addPauta()} placeholder="Assunto (ex: Meta de vendas do mês)"/>
              <button className="btn" onClick={addPauta}>+ Adicionar</button>
            </div>
          </div>

          <div className="card">
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--primary)', marginBottom: 12, textTransform: 'uppercase' }}>Decisões tomadas</div>
            {form.decisoes.map((d, i) => (
              <div key={i} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '9px 12px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13 }}>✓ {d}</span>
                <X size={13} style={{ cursor: 'pointer', color: 'var(--text-muted)' }}
                  onClick={() => setForm(f => ({ ...f, decisoes: f.decisoes.filter((_, idx) => idx !== i) }))}/>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" value={novaDecisao} onChange={e => setNovaDecisao(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addDecisao()} placeholder="Ex: Escala revisada até sexta-feira"/>
              <button className="btn" onClick={addDecisao}>+ Adicionar</button>
            </div>
          </div>

          <div className="card">
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--primary)', marginBottom: 12, textTransform: 'uppercase' }}>Ações e responsáveis</div>
            {form.acoes.map((a, i) => (
              <div key={i} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 12px', marginBottom: 8, position: 'relative' }}>
                <X size={13} style={{ position: 'absolute', top: 10, right: 10, cursor: 'pointer', color: 'var(--text-muted)' }}
                  onClick={() => setForm(f => ({ ...f, acoes: f.acoes.filter((_, idx) => idx !== i) }))}/>
                <strong style={{ fontSize: 13 }}>{a.desc}</strong>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>👤 {a.resp || '—'} · 📅 {a.prazo || 'sem prazo'}</div>
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
              <input className="input" value={novaAcao.desc} onChange={e => setNovaAcao(a => ({ ...a, desc: e.target.value }))} placeholder="O que precisa ser feito"/>
              <input className="input" value={novaAcao.resp} onChange={e => setNovaAcao(a => ({ ...a, resp: e.target.value }))} placeholder="Responsável"/>
              <input className="input" type="date" value={novaAcao.prazo} onChange={e => setNovaAcao(a => ({ ...a, prazo: e.target.value }))}/>
            </div>
            <button className="btn" style={{ marginTop: 8 }} onClick={addAcao}>+ Adicionar ação</button>
          </div>

          <div className="card">
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--primary)', marginBottom: 12, textTransform: 'uppercase' }}>Próxima reunião (opcional)</div>
            <input className="input" type="date" value={form.proxima_reuniao} onChange={e => setForm(f => ({ ...f, proxima_reuniao: e.target.value }))}/>
          </div>

          <button className="btn btn-primary" style={{ width: '100%', padding: 14, fontSize: 14 }} onClick={criarAta} disabled={salvando}>
            {salvando ? 'Criando...' : 'Criar ata'}
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
                <button className="btn btn-primary btn-sm" onClick={gerarPDF}>
                  <FileDown size={14}/> Gerar PDF
                </button>
              </div>
              <div style={{ marginTop: 12, fontSize: 13 }}>
                <strong>Participantes: </strong>
                {detalhe.participantes_detalhe.map(p => p.full_name).join(', ') || '—'}
              </div>
            </div>

            <div className="card">
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--primary)', marginBottom: 10, textTransform: 'uppercase' }}>Pauta</div>
              {detalhe.pauta.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nenhum assunto registrado</p>}
              {detalhe.pauta.map((p, i) => <div key={i} style={{ fontSize: 13, marginBottom: 6 }}>• {p.titulo}</div>)}
            </div>

            <div className="card">
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--primary)', marginBottom: 10, textTransform: 'uppercase' }}>Decisões</div>
              {detalhe.decisoes.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nenhuma decisão registrada</p>}
              {detalhe.decisoes.map((d, i) => <div key={i} style={{ fontSize: 13, marginBottom: 6 }}>✓ {d}</div>)}
            </div>

            <div className="card">
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--primary)', marginBottom: 10, textTransform: 'uppercase' }}>Ações</div>
              {detalhe.acoes.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nenhuma ação registrada</p>}
              {detalhe.acoes.map((a, i) => (
                <div key={i} style={{ fontSize: 13, marginBottom: 8 }}>
                  <strong>{a.desc}</strong>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>👤 {a.resp || '—'} · 📅 {a.prazo || 'sem prazo'}</div>
                </div>
              ))}
            </div>

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
