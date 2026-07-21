import React, { useState, useEffect, useRef } from 'react';
import { Plus, Camera, ChevronRight, Trash2, FileText, Check, X, Upload,
         Image, Edit3, ArrowLeft, Download, Share2, Mail, MessageCircle, Loader } from 'lucide-react';
import { supabase } from '../lib/supabase';
import api from '../api';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';
import FotoEditor from '../components/FotoEditor';

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
}

// Serializa/desserializa campos extras dentro do campo description
function encodeDesc({ texto, clube, destinatario, departamento, prazo }) {
  return JSON.stringify({ texto, clube, destinatario, departamento, prazo });
}
function decodeDesc(raw) {
  try { return JSON.parse(raw || '{}'); } catch { return { texto: raw || '' }; }
}

function resizeImage(file, maxWidth = 1600, quality = 0.8) {
  return new Promise((resolve) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const ratio = img.height / img.width;
      const w = Math.min(img.width, maxWidth);
      const h = w * ratio;
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => resolve(blob), 'image/jpeg', quality);
    };
    img.src = url;
  });
}

// Converte URL de imagem → base64 (via fetch, sem problemas de CORS com Supabase)
async function imageUrlToBase64(url) {
  const resp = await fetch(url);
  const blob = await resp.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Gera o PDF no formato de tabela: foto pequena à esquerda + descrição à direita
async function gerarPDF(rel, fotos, creatorName) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const W = 210, H = 297, M = 12;
  const ORANGE = [232, 104, 26];
  const GRAY1  = [230, 230, 230]; // borda da tabela
  const GRAY2  = [245, 245, 245]; // cabeçalho da tabela

  const meta = decodeDesc(rel.description);

  // ── Cabeçalho do relatório ─────────────────────────────────────────────────
  // Faixa laranja com título
  pdf.setFillColor(...ORANGE);
  pdf.rect(0, 0, W, 18, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Tour 4x4', M, 8);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text(rel.title, M, 15);

  // Bloco de dados do Tour
  let infoY = 24;
  const LABEL_W = 38;
  const infoRows = [
    ['Clube',            meta.clube        || '—'],
    ['Elaborado por',    creatorName],
    ['Destinado a',      meta.destinatario || '—'],
    ['Departamento',     meta.departamento || '—'],
    ['Prazo',            meta.prazo        || '—'],
    ['Data',             formatDate(rel.created_at)],
  ];

  pdf.setDrawColor(...GRAY1);
  pdf.setLineWidth(0.3);

  for (const [label, valor] of infoRows) {
    // fundo da label
    pdf.setFillColor(245, 245, 245);
    pdf.rect(M, infoY, LABEL_W, 7, 'F');
    pdf.rect(M, infoY, W - M * 2, 7); // borda linha

    pdf.setTextColor(100, 100, 100);
    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'bold');
    pdf.text(label, M + 2, infoY + 4.8);

    pdf.setTextColor(30, 30, 30);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.text(String(valor), M + LABEL_W + 3, infoY + 4.8);

    infoY += 7;
  }

  if (meta.texto) {
    infoY += 3;
    pdf.setTextColor(80, 80, 80);
    pdf.setFontSize(8.5);
    pdf.setFont('helvetica', 'italic');
    const obs = pdf.splitTextToSize(`Observações: ${meta.texto}`, W - M * 2);
    pdf.text(obs, M, infoY);
    infoY += obs.length * 5 + 3;
  }

  infoY += 4;

  // ── Tabela de fotos ────────────────────────────────────────────────────────
  const COL_FOTO = 80;
  const COL_DESC = W - M * 2 - COL_FOTO - 2;
  const ROW_H    = 58;
  const IMG_PAD  = 3;
  const DESC_X   = M + COL_FOTO + 2;

  let tableY = infoY;

  // Cabeçalho da tabela
  pdf.setFillColor(...GRAY2);
  pdf.rect(M, tableY, COL_FOTO, 8, 'F');
  pdf.rect(DESC_X, tableY, COL_DESC, 8, 'F');

  pdf.setDrawColor(...GRAY1);
  pdf.setLineWidth(0.3);
  pdf.rect(M, tableY, COL_FOTO + 2 + COL_DESC, 8); // borda externa header

  pdf.setTextColor(80, 80, 80);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Foto', M + COL_FOTO / 2, tableY + 5.2, { align: 'center' });
  pdf.text('Descrição', DESC_X + COL_DESC / 2, tableY + 5.2, { align: 'center' });

  tableY += 8;

  for (let i = 0; i < fotos.length; i++) {
    const foto = fotos[i];

    // Quebra de página se necessário
    if (tableY + ROW_H > H - 12) {
      pdf.addPage();
      tableY = 14;
      // Repete mini-header
      pdf.setFillColor(...GRAY2);
      pdf.rect(M, tableY, COL_FOTO, 8, 'F');
      pdf.rect(DESC_X, tableY, COL_DESC, 8, 'F');
      pdf.setDrawColor(...GRAY1);
      pdf.rect(M, tableY, COL_FOTO + 2 + COL_DESC, 8);
      pdf.setTextColor(80, 80, 80);
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Foto', M + COL_FOTO / 2, tableY + 5.2, { align: 'center' });
      pdf.text('Descrição', DESC_X + COL_DESC / 2, tableY + 5.2, { align: 'center' });
      tableY += 8;
    }

    // Borda da linha
    pdf.setDrawColor(...GRAY1);
    pdf.setLineWidth(0.3);
    pdf.rect(M, tableY, COL_FOTO, ROW_H);
    pdf.rect(DESC_X, tableY, COL_DESC, ROW_H);
    // linha divisória vertical
    pdf.line(M + COL_FOTO, tableY, M + COL_FOTO, tableY + ROW_H);

    // Imagem
    let imgData;
    try {
      imgData = await imageUrlToBase64(foto.photo_url);
    } catch { /* sem imagem */ }

    if (imgData) {
      const tmpImg = new window.Image();
      tmpImg.src = imgData;
      await new Promise(r => { tmpImg.onload = r; tmpImg.onerror = r; });
      const ratio = tmpImg.height / tmpImg.width;
      const maxW = COL_FOTO - IMG_PAD * 2;
      const maxH = ROW_H - IMG_PAD * 2;
      let iw = maxW, ih = maxW * ratio;
      if (ih > maxH) { ih = maxH; iw = maxH / ratio; }
      const ix = M + IMG_PAD + (maxW - iw) / 2;
      const iy = tableY + IMG_PAD + (maxH - ih) / 2;
      pdf.addImage(imgData, 'JPEG', ix, iy, iw, ih);
    } else {
      pdf.setTextColor(180, 180, 180);
      pdf.setFontSize(7);
      pdf.text('[sem imagem]', M + COL_FOTO / 2, tableY + ROW_H / 2, { align: 'center' });
    }

    // Número da foto (badge laranja)
    pdf.setFillColor(...ORANGE);
    pdf.circle(M + 5, tableY + 5, 3.5, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(6.5);
    pdf.setFont('helvetica', 'bold');
    pdf.text(String(i + 1), M + 5, tableY + 6.3, { align: 'center' });

    // Descrição
    const captText = foto.caption || '';
    pdf.setTextColor(50, 50, 50);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    const captLines = pdf.splitTextToSize(captText, COL_DESC - 6);
    pdf.text(captLines, DESC_X + 3, tableY + 6);

    tableY += ROW_H;
  }

  // Rodapé
  pdf.setTextColor(160, 160, 160);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Gerado pelo Rota 2.0 — Gestão de Liderança', W / 2, H - 5, { align: 'center' });

  return pdf;
}

// ─── Painel de compartilhamento ───────────────────────────────────────────────
function PainelCompartilhar({ rel, fotos, creatorName, userId }) {
  const toast   = useToast();
  const [gerando, setGerando]   = useState(false);
  const [pdfUrl, setPdfUrl]     = useState(rel.pdf_url || null);
  const [pdfBlob, setPdfBlob]   = useState(null);

  const gerarEFazerUpload = async () => {
    if (fotos.length === 0) { toast('Adicione ao menos uma foto', 'error'); return; }
    setGerando(true);
    try {
      const pdf  = await gerarPDF(rel, fotos, creatorName);
      const blob = pdf.output('blob');
      setPdfBlob(blob);

      // Upload para Supabase Storage
      const path = `relatorios/pdfs/${rel.id}.pdf`;
      const { error: upErr } = await supabase.storage.from('evidencias')
        .upload(path, blob, { contentType: 'application/pdf', upsert: true });
      if (upErr) throw upErr;

      const { data: { publicUrl } } = supabase.storage.from('evidencias').getPublicUrl(path);
      await api.put(`/relatorios/${rel.id}`, { requester_id: userId, pdf_url: publicUrl, status: 'finalizado' });
      setPdfUrl(publicUrl);
      toast('PDF gerado com sucesso!');
    } catch (e) {
      toast('Erro ao gerar PDF: ' + e.message, 'error');
    } finally {
      setGerando(false);
    }
  };

  const baixarPDF = async () => {
    if (pdfBlob) {
      // Já temos o blob em memória
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url; a.download = `${rel.title.replace(/\s+/g,'_')}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } else if (pdfUrl) {
      window.open(pdfUrl, '_blank');
    }
  };

  const compartilharWhatsApp = async () => {
    if (!pdfUrl) { toast('Gere o PDF primeiro', 'error'); return; }
    const texto = `📋 *${rel.title}*\nCriado por: ${creatorName}\nData: ${formatDate(rel.created_at)}\n\n📄 Acesse o PDF:\n${pdfUrl}`;

    // Tenta Web Share API com arquivo (iOS 15+ / Android)
    if (pdfBlob && navigator.share && navigator.canShare) {
      const file = new File([pdfBlob], `${rel.title}.pdf`, { type: 'application/pdf' });
      if (navigator.canShare({ files: [file] })) {
        try { await navigator.share({ title: rel.title, files: [file] }); return; } catch {}
      }
    }
    // Fallback: abre WhatsApp com link
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
  };

  const compartilharEmail = () => {
    if (!pdfUrl) { toast('Gere o PDF primeiro', 'error'); return; }
    const subject = encodeURIComponent(`Relatório Fotográfico: ${rel.title}`);
    const body = encodeURIComponent(
      `Olá,\n\nSegue o relatório fotográfico "${rel.title}".\n` +
      `Criado por: ${creatorName}\nData: ${formatDate(rel.created_at)}\n\n` +
      `📄 Download do PDF:\n${pdfUrl}\n\nGerado via Rota 2.0 — Gestão de Liderança`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
  };

  return (
    <div style={{ background:'var(--surface)', borderRadius:12, padding:20,
      border:'1px solid var(--border)', marginTop:16 }}>
      <div style={{ fontWeight:700, fontSize:13, marginBottom:14, color:'var(--text)', display:'flex', alignItems:'center', gap:8 }}>
        <FileText size={16} style={{ color:'var(--primary)' }}/> Exportar e Compartilhar
      </div>

      {!pdfUrl ? (
        <button className="btn btn-primary" style={{ width:'100%', justifyContent:'center' }}
          onClick={gerarEFazerUpload} disabled={gerando}>
          {gerando
            ? <><Loader size={15} style={{ animation:'spin 1s linear infinite' }}/> Gerando PDF...</>
            : <><FileText size={15}/> Gerar PDF</>}
        </button>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {/* Status + regenerar */}
          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <span style={{ fontSize:12, color:'#10b981', fontWeight:600 }}>✓ PDF disponível</span>
            <button onClick={gerarEFazerUpload} disabled={gerando}
              style={{ background:'none', border:'none', cursor:'pointer', fontSize:11,
                color:'var(--text-muted)', textDecoration:'underline', padding:0 }}>
              {gerando ? 'Atualizando...' : 'Atualizar PDF'}
            </button>
          </div>

          {/* Botões de ação */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
            <button className="btn btn-ghost" onClick={baixarPDF}
              style={{ flexDirection:'column', gap:4, padding:'10px 8px', fontSize:11 }}>
              <Download size={18}/>
              Baixar PDF
            </button>
            <button onClick={compartilharWhatsApp}
              style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, padding:'10px 8px',
                borderRadius:10, fontSize:11, fontWeight:600, cursor:'pointer',
                background:'#25D36620', border:'1px solid #25D366', color:'#25D366' }}>
              <MessageCircle size={18}/>
              WhatsApp
            </button>
            <button onClick={compartilharEmail}
              style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, padding:'10px 8px',
                borderRadius:10, fontSize:11, fontWeight:600, cursor:'pointer',
                background:'#6366f120', border:'1px solid #6366f1', color:'#6366f1' }}>
              <Mail size={18}/>
              E-mail
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tela de lista ────────────────────────────────────────────────────────────
function RelatorioLista({ userId, profile, onOpen, onCreate }) {
  const [list, setList]       = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const load = () => {
    setLoading(true);
    api.get(`/relatorios?requester_id=${userId}`)
      .then(r => setList(r.data))
      .catch(() => toast('Erro ao carregar relatórios', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [userId]);

  const remove = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Remover este relatório?')) return;
    await api.delete(`/relatorios/${id}?requester_id=${userId}`).catch(() => toast('Erro ao remover', 'error'));
    setList(l => l.filter(r => r.id !== id));
    toast('Relatório removido');
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Tour 4x4</div>
          <div className="page-subtitle">{list.length} tour{list.length !== 1 ? 's' : ''}</div>
        </div>
        <button className="btn btn-primary" onClick={onCreate}>
          <Plus size={15}/> Novo Tour
        </button>
      </div>

      {loading && <div style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>Carregando...</div>}

      {!loading && list.length === 0 && (
        <div style={{ textAlign:'center', padding:60, color:'var(--text-muted)' }}>
          <Camera size={40} style={{ opacity:.3, marginBottom:12 }}/>
          <p>Nenhum Tour 4x4 criado ainda.</p>
          <button className="btn btn-primary" style={{ marginTop:16 }} onClick={onCreate}>
            <Plus size={14}/> Criar primeiro Tour
          </button>
        </div>
      )}

      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {list.map(r => {
          const thumb = r.fotos?.sort((a,b) => a.order_index - b.order_index)[0]?.photo_url;
          return (
            <div key={r.id} onClick={() => onOpen(r)}
              style={{ background:'var(--surface)', borderRadius:12, padding:'14px 16px',
                border:'1px solid var(--border)', cursor:'pointer', display:'flex', gap:14, alignItems:'center' }}>
              <div style={{ width:64, height:64, borderRadius:8, overflow:'hidden', flexShrink:0,
                background:'var(--bg)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                {thumb
                  ? <img src={thumb} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                  : <Image size={22} style={{ opacity:.3 }}/>}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:14, color:'var(--text)', marginBottom:2,
                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.title}</div>
                <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:4 }}>
                  {r.creator?.full_name} · {formatDate(r.created_at)}
                </div>
                <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
                  <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20,
                    background: r.status === 'finalizado' ? '#10b98120' : '#f59e0b20',
                    color: r.status === 'finalizado' ? '#10b981' : '#f59e0b' }}>
                    {r.status === 'finalizado' ? '✓ Finalizado' : '● Rascunho'}
                  </span>
                  {r.pdf_url && (
                    <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20,
                      background:'#6366f120', color:'#6366f1' }}>
                      📄 PDF
                    </span>
                  )}
                  <span style={{ fontSize:11, color:'var(--text-muted)' }}>
                    {r.fotos?.length || 0} foto{(r.fotos?.length || 0) !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
              <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                <button onClick={e => remove(r.id, e)}
                  style={{ background:'none', border:'none', cursor:'pointer', color:'#ef4444', padding:4 }}>
                  <Trash2 size={15}/>
                </button>
                <ChevronRight size={18} style={{ color:'var(--text-muted)' }}/>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tela de detalhe/edição ───────────────────────────────────────────────────
function RelatorioDetalhe({ relatorio: initialRel, userId, profile, onBack }) {
  const toast = useToast();
  const fileRef = useRef();
  const [rel, setRel]             = useState(initialRel);
  const [fotos, setFotos]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editandoFoto, setEditandoFoto]       = useState(null);
  const [editandoCaption, setEditandoCaption] = useState(null);
  const [captionText, setCaptionText]         = useState('');

  const loadFotos = () => {
    api.get(`/relatorios/${rel.id}?requester_id=${userId}`)
      .then(r => {
        const sorted = (r.data.fotos || []).sort((a,b) => a.order_index - b.order_index);
        setFotos(sorted);
        setRel(prev => ({ ...prev, ...r.data, fotos: sorted }));
      })
      .catch(() => toast('Erro ao carregar fotos', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadFotos(); }, [rel.id]);

  const handleFilesSelected = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    const novos = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const blob = await resizeImage(file);
        const path = `relatorios/${rel.id}/${Date.now()}_${i}.jpg`;
        const { error: upErr } = await supabase.storage.from('evidencias').upload(path, blob, { contentType:'image/jpeg' });
        if (upErr) throw upErr;
        const { data: { publicUrl } } = supabase.storage.from('evidencias').getPublicUrl(path);
        const res = await api.post(`/relatorios/${rel.id}/fotos`, {
          requester_id: userId, photo_url: publicUrl, order_index: fotos.length + i,
        });
        novos.push(res.data);
      } catch (e) {
        toast(`Erro na foto ${i+1}: ${e.message}`, 'error');
      }
    }
    setFotos(f => [...f, ...novos]);
    setUploading(false);
    if (novos.length) toast(`${novos.length} foto${novos.length > 1 ? 's' : ''} adicionada${novos.length > 1 ? 's' : ''}!`);
  };

  const removeFoto = async (fotoId) => {
    if (!window.confirm('Remover esta foto?')) return;
    await api.delete(`/relatorios/fotos/${fotoId}`).catch(() => toast('Erro ao remover', 'error'));
    setFotos(f => f.filter(x => x.id !== fotoId));
  };

  const saveAnnotations = async ({ dataUrl, shapes }) => {
    const foto = editandoFoto;
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const path = `relatorios/${rel.id}/annotated_${foto.id}.jpg`;
      const { error: upErr } = await supabase.storage.from('evidencias')
        .upload(path, blob, { contentType:'image/jpeg', upsert:true });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('evidencias').getPublicUrl(path);
      await api.put(`/relatorios/fotos/${foto.id}`, { photo_url: publicUrl, annotations: { shapes } });
      setFotos(f => f.map(x => x.id === foto.id ? { ...x, photo_url: publicUrl, annotations: { shapes } } : x));
      setEditandoFoto(null);
      toast('Anotações salvas!');
    } catch (e) {
      toast('Erro ao salvar anotações: ' + e.message, 'error');
    }
  };

  const saveCaption = async () => {
    await api.put(`/relatorios/fotos/${editandoCaption}`, { caption: captionText });
    setFotos(f => f.map(x => x.id === editandoCaption ? { ...x, caption: captionText } : x));
    setEditandoCaption(null);
  };

  const finalizarRelatorio = async () => {
    if (fotos.length === 0) { toast('Adicione ao menos uma foto antes de finalizar', 'error'); return; }
    await api.put(`/relatorios/${rel.id}`, { requester_id: userId, status: 'finalizado' });
    setRel(r => ({ ...r, status: 'finalizado' }));
    toast('Relatório finalizado!');
  };

  // Editor de anotações aberto
  if (editandoFoto) {
    return (
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
          <button onClick={() => setEditandoFoto(null)}
            style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:0 }}>
            <ArrowLeft size={20}/>
          </button>
          <span style={{ fontWeight:700, fontSize:15 }}>Editar anotações</span>
        </div>
        <FotoEditor
          photoUrl={editandoFoto.photo_url}
          initialAnnotations={editandoFoto.annotations}
          onSave={saveAnnotations}
          onCancel={() => setEditandoFoto(null)}
        />
      </div>
    );
  }

  const meta = decodeDesc(rel.description);

  return (
    <div>
      {/* Cabeçalho */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
        <button onClick={onBack}
          style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:0 }}>
          <ArrowLeft size={20}/>
        </button>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, fontWeight:600, color:'var(--primary)', textTransform:'uppercase', letterSpacing:.5 }}>Tour 4x4</div>
          <div style={{ fontWeight:700, fontSize:16 }}>{rel.title}</div>
        </div>
        <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, flexShrink:0,
          background: rel.status === 'finalizado' ? '#10b98120' : '#f59e0b20',
          color: rel.status === 'finalizado' ? '#10b981' : '#f59e0b' }}>
          {rel.status === 'finalizado' ? '✓ Finalizado' : '● Rascunho'}
        </span>
      </div>

      {/* Ficha do Tour */}
      <div style={{ background:'var(--surface)', borderRadius:10, padding:'12px 14px',
        border:'1px solid var(--border)', marginBottom:16, display:'grid',
        gridTemplateColumns:'1fr 1fr', gap:'6px 16px', fontSize:12 }}>
        {[
          ['Clube',        meta.clube],
          ['Elaborado por',rel.creator?.full_name],
          ['Destinado a',  meta.destinatario],
          ['Departamento', meta.departamento],
          ['Prazo',        meta.prazo],
          ['Data',         formatDate(rel.created_at)],
        ].map(([label, valor]) => valor ? (
          <div key={label}>
            <span style={{ color:'var(--text-muted)', fontSize:11 }}>{label}: </span>
            <span style={{ fontWeight:600, color:'var(--text)' }}>{valor}</span>
          </div>
        ) : null)}
        {meta.texto && (
          <div style={{ gridColumn:'1/-1', color:'var(--text-muted)', fontStyle:'italic', marginTop:4 }}>
            {meta.texto}
          </div>
        )}
      </div>

      {/* Fotos */}
      {loading
        ? <div style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}>Carregando fotos...</div>
        : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', gap:12, marginBottom:16 }}>
          {fotos.map(foto => (
            <div key={foto.id} style={{ background:'var(--surface)', borderRadius:10, overflow:'hidden',
              border:'1px solid var(--border)', display:'flex', flexDirection:'column' }}>
              <div style={{ position:'relative', paddingTop:'75%', background:'#111' }}>
                <img src={foto.photo_url} alt="" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }}/>
                <div style={{ position:'absolute', top:6, right:6, display:'flex', gap:4 }}>
                  <button title="Anotar" onClick={() => setEditandoFoto(foto)}
                    style={{ background:'rgba(0,0,0,.65)', border:'none', borderRadius:6, padding:'4px 6px', cursor:'pointer', color:'#fff' }}>
                    <Edit3 size={13}/>
                  </button>
                  <button title="Remover" onClick={() => removeFoto(foto.id)}
                    style={{ background:'rgba(239,68,68,.8)', border:'none', borderRadius:6, padding:'4px 6px', cursor:'pointer', color:'#fff' }}>
                    <Trash2 size={13}/>
                  </button>
                </div>
                {foto.annotations?.shapes?.length > 0 && (
                  <div style={{ position:'absolute', bottom:6, left:6, background:'rgba(0,0,0,.65)',
                    borderRadius:4, padding:'2px 6px', fontSize:10, color:'#fff' }}>
                    ✏ {foto.annotations.shapes.length} anotaç{foto.annotations.shapes.length === 1 ? 'ão' : 'ões'}
                  </div>
                )}
              </div>
              <div style={{ padding:'8px 10px' }}>
                {editandoCaption === foto.id ? (
                  <div style={{ display:'flex', gap:6 }}>
                    <input autoFocus className="input" style={{ fontSize:12, padding:'4px 8px', flex:1 }}
                      value={captionText} onChange={e => setCaptionText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveCaption(); if (e.key === 'Escape') setEditandoCaption(null); }}/>
                    <button onClick={saveCaption} style={{ background:'none', border:'none', cursor:'pointer', color:'#10b981' }}><Check size={14}/></button>
                    <button onClick={() => setEditandoCaption(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)' }}><X size={14}/></button>
                  </div>
                ) : (
                  <div onClick={() => { setEditandoCaption(foto.id); setCaptionText(foto.caption || ''); }}
                    style={{ fontSize:12, color: foto.caption ? 'var(--text)' : 'var(--text-muted)',
                      cursor:'pointer', minHeight:20, fontStyle: foto.caption ? 'normal' : 'italic' }}>
                    {foto.caption || 'Adicionar descrição...'}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Botão adicionar foto */}
          <div onClick={() => !uploading && fileRef.current?.click()}
            style={{ minHeight:140, background:'var(--bg)', borderRadius:10,
              border:'2px dashed var(--border)', cursor: uploading ? 'wait' : 'pointer',
              display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8,
              color:'var(--text-muted)', opacity: uploading ? 0.5 : 1 }}>
            {uploading ? <Loader size={24} style={{ animation:'spin 1s linear infinite' }}/> : <Camera size={24}/>}
            <span style={{ fontSize:12 }}>{uploading ? 'Enviando...' : 'Adicionar foto'}</span>
          </div>
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" multiple capture="environment"
        style={{ display:'none' }} onChange={e => handleFilesSelected(Array.from(e.target.files))}/>

      {/* Botão finalizar (só se rascunho) */}
      {rel.status !== 'finalizado' && fotos.length > 0 && (
        <button className="btn btn-primary" style={{ width:'100%', justifyContent:'center', marginBottom:8 }}
          onClick={finalizarRelatorio}>
          <Check size={15}/> Finalizar Tour
        </button>
      )}

      {/* Painel de exportação/compartilhamento (sempre visível se tiver fotos) */}
      {fotos.length > 0 && (
        <PainelCompartilhar
          rel={rel} fotos={fotos}
          creatorName={rel.creator?.full_name || 'Usuário'}
          userId={userId}
        />
      )}
    </div>
  );
}

// Campo reutilizável — definido FORA do ModalCriar para não ser remontado a cada render
function CampoTexto({ label, value, onChange, placeholder, type = 'text', required }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}{required && ' *'}</label>
      <input className="input" type={type} placeholder={placeholder}
        value={value} onChange={e => onChange(e.target.value)}/>
    </div>
  );
}

// ─── Modal de criação ─────────────────────────────────────────────────────────
function ModalCriar({ open, onClose, onCreated, userId }) {
  const toast = useToast();
  const [title,        setTitle]        = useState('');
  const [clube,        setClube]        = useState('');
  const [destinatario, setDestinatario] = useState('');
  const [departamento, setDepartamento] = useState('');
  const [prazo,        setPrazo]        = useState('');
  const [texto,        setTexto]        = useState('');
  const [saving,       setSaving]       = useState(false);

  const reset = () => { setTitle(''); setClube(''); setDestinatario(''); setDepartamento(''); setPrazo(''); setTexto(''); };

  const handleCreate = async () => {
    if (!title.trim()) return toast('Digite um título para o Tour', 'error');
    setSaving(true);
    try {
      const description = encodeDesc({ texto, clube, destinatario, departamento, prazo });
      const { data } = await api.post('/relatorios', { requester_id: userId, title, description });
      toast('Tour 4x4 criado!');
      reset();
      onCreated(data);
    } catch { toast('Erro ao criar Tour 4x4', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Novo Tour 4x4">
      <CampoTexto label="Título do Tour" value={title} onChange={setTitle}
        placeholder="Ex.: Tour Setor de Padaria" required/>
      <CampoTexto label="Nome do Clube" value={clube} onChange={setClube}
        placeholder="Ex.: Clube Rota Norte"/>
      <CampoTexto label="A quem se destina" value={destinatario} onChange={setDestinatario}
        placeholder="Ex.: Gerente de Loja / Equipe de Gondola"/>
      <CampoTexto label="Departamento" value={departamento} onChange={setDepartamento}
        placeholder="Ex.: Mercearia, Perecíveis..."/>
      <CampoTexto label="Prazo para realização" value={prazo} onChange={setPrazo}
        placeholder="Ex.: 15/08/2025 ou Até sexta-feira"/>
      <div className="form-group">
        <label className="form-label">Observações gerais (opcional)</label>
        <textarea className="input" rows={2} placeholder="Contexto ou instruções adicionais..."
          value={texto} onChange={e => setTexto(e.target.value)} style={{ resize:'vertical' }}/>
      </div>
      <div style={{ display:'flex', gap:10, marginTop:8 }}>
        <button className="btn btn-ghost" style={{ flex:1, justifyContent:'center' }} onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={handleCreate} disabled={saving}>
          {saving ? 'Criando...' : 'Criar e adicionar fotos'}
        </button>
      </div>
    </Modal>
  );
}

// ─── Componente raiz ──────────────────────────────────────────────────────────
export default function RelatoriosFotograficos({ userId, profile }) {
  const [tela, setTela]             = useState('lista');
  const [relAtual, setRelAtual]     = useState(null);
  const [modalCriar, setModalCriar] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const abrirRelatorio = (rel) => { setRelAtual(rel); setTela('detalhe'); };

  return (
    <div>
      {tela === 'lista' && (
        <RelatorioLista
          key={refreshKey}
          userId={userId} profile={profile}
          onOpen={abrirRelatorio}
          onCreate={() => setModalCriar(true)}
        />
      )}

      {tela === 'detalhe' && relAtual && (
        <RelatorioDetalhe
          relatorio={relAtual} userId={userId} profile={profile}
          onBack={() => { setTela('lista'); setRefreshKey(k => k + 1); }}
        />
      )}

      <ModalCriar
        open={modalCriar}
        onClose={() => setModalCriar(false)}
        userId={userId}
        onCreated={(rel) => { setModalCriar(false); abrirRelatorio(rel); }}
      />
    </div>
  );
}
