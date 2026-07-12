import React, { useEffect, useState, useRef } from 'react';
import { Plus, Pencil, Trash2, Camera, CheckCircle, Circle, FileText, ChevronRight, X, ArrowLeft, Upload, Loader } from 'lucide-react';
import api from '../api';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';
import { supabase } from '../lib/supabase';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as pdfjsLib from 'pdfjs-dist';
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

// Extrai produtos + preço + dinâmica promocional de flyers de supermercado
function parseFlyerText(rawText) {
  let text = rawText;

  // ── 1. Normaliza preços com espaços tipográficos ─────────────────
  // "R$ 3.499 ,00" → "R$3.499,00"
  text = text.replace(/R\$\s*([\d.]+)\s*,(\d{2})/g, 'R$$1,$2');

  // ── 2. Remove blocos de parcelamento (antes do preço principal) ──
  text = text.replace(/à\s*vista\s*ou[\s\S]{0,120}?sem\s*juros[^\n]*/gi, ' ');
  text = text.replace(/\d+x\s*de\s*R\$[\d.,]+[^\n]*/gi, ' ');
  text = text.replace(/sem\s*juros[^\n]*/gi, ' ');
  text = text.replace(/nos\s*cart[õo]es[^\n]*/gi, ' ');
  text = text.replace(/sam['''''`]?s\s*club[^\n]*/gi, ' ');
  text = text.replace(/carrefour[^\n]*/gi, ' ');
  text = text.replace(/atacad[aã]o[^\n]*/gi, ' ');
  text = text.replace(/banco\s*csf[^\n]*/gi, ' ');

  // ── 3. Normaliza dinâmicas promocionais → tokens padronizados ────
  // "LEVE 2 PAGUE 1" ou "PAGUE1 LEVE2" → "__LP2P1__"
  text = text.replace(/leve\s*(\d+)\s*pague\s*(\d+)/gi, (_, l, p) => ` __LP${l}P${p}__ `);
  text = text.replace(/pague\s*(\d+)\s*leve\s*(\d+)/gi, (_, p, l) => ` __LP${l}P${p}__ `);
  // "20% de desconto na 2ª unidade" → "__DESC20%__"
  text = text.replace(/(\d+)\s*%\s*de\s*desconto\s*na\s*2[aª°]?\s*unidade/gi, (_, n) => ` __DESC${n}%__ `);
  // "50% DE DESCONTO NA 2ª UNIDADE" idem
  text = text.replace(/(\d+)\s*%\s*de\s*desconto/gi, (_, n) => ` __DESC${n}%__ `);

  // ── 4. Remove ruído legal/institucional ──────────────────────────
  const NOISE = [
    /cada\s*sai\s*por[:.]?/gi, /sai\s*por[:.]?/gi, /\bsai\b/gi,
    /economize\b/gi,
    /\bmuito\b/gi, /\bvale\b(?!\s*R\$)/gi,
    /\bleve\b(?!\s*\d)/gi, /\bpague\b(?!\s*\d)/gi,   // leve/pague soltos (sem número)
    /nesta\s*embalagem[^\n]*/gi,
    /[ao]\s*unidade\s*sai\s*por[:.]?/gi, /[ao]\s*litro\s*sai\s*por[:.]?/gi,
    /na\s*2[aª°]?\s*unidade[^\n]*/gi,
    /nesta\s*promo[cç][aã]o[^\n]*/gi,
    /\bde:\s*R\$[\d.,]+/gi, /\bpor:\s*R\$[\d.,]+/gi,
    /\bpor:\s*$/gim, /\bde:\s*$/gim,
    /as\s*ofertas?\s*(s[aã]o\s*)?v[aá]lidas?[^\n]*/gi,
    /ofertas?\s*v[aá]lidas?[^\n]*/gi,
    /ou\s*enquanto[^\n]*/gi, /prevalecendo[^\n]*/gi,
    /foto\(s\)[^\n]*/gi,
    /imagens?\s*(meramente\s*)?ilustrativas?[^\n]*/gi,
    /conforme\s*c[oó]digo[^\n]*/gi, /n[aã]o\s*vendemos[^\n]*/gi,
    /minist[eé]rio\s*da\s*sa[uú]de[^\n]*/gi,
    /aleitamento\s*materno[^\n]*/gi, /beba\s*com\s*modera[cç][aã]o/gi,
    /art\s*\d+[^\n]*/gi, /se\s*liga\s*no[^\n]*/gi,
    /samsclub[^\n]*/gi, /voc[eê]\s*pode\s*pagar[^\n]*/gi,
    /\bpix\b[^\n]*/gi, /banco\s*central[^\n]*/gi,
    /promo[cç][aã]o\s*n[aã]o\s*cumulativa[^\n]*/gi,
    /garantimos[^\n]*/gi, /cr[eé]dito\s*sujeito[^\n]*/gi,
    /consulte[^\n]*/gi, /limitad[ao]\s*a\s*\d+[^\n]*/gi,
    /por\s*s[oó]cio[^\n]*/gi, /ganhe\s*uma[^\n]*/gi,
    /exclusiva[^\n]*/gi, /assinada\s*por[^\n]*/gi,
    /hora\s*da\s*divers[^\n]*/gi, /carrinho\s*de\s*economia[^\n]*/gi,
    /ofertas\s*imperd[ií]veis[^\n]*/gi, /anivers[aá]rio[^\n]*/gi,
    /a\s*cada\s*R\$[\d.,]+[^\n]*/gi, /em\s*compras[^\n]*/gi,
    /\d{2}\/\d{2}\/\d{4}/g, /\*+/g,
    /^\s*(de|por|cada|tamanho\s*fam[ií]lia|nova\s*f[oó]rmula|pacot[eo]\s*econ[oô]mico)\s*$/gim,
  ];
  NOISE.forEach(re => { text = text.replace(re, ' '); });

  // ── 5. Preço com R$ obrigatório ──────────────────────────────────
  const PRICE_RE = /R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}/g;

  // Detecta token de dinâmica em uma linha
  const getDinamica = (line) => {
    const lp = line.match(/__LP(\d+)P(\d+)__/);
    if (lp) return `Leve ${lp[1]} Pague ${lp[2]}`;
    const dc = line.match(/__DESC(\d+)%__/);
    if (dc) return `${dc[1]}% desc 2ª un`;
    return null;
  };

  // ── 6. Linha de spec (não é nome de produto) ─────────────────────
  const IS_SPEC = /^(\d[\d.,]*\s*(ml|g|kg|l\b|un|unid|litros|peças|btus?|v\b)|kg\b|ml\b|litro[s]?|sem\s*cartucho|iqf|zip|neutro|folha\s*(dupla|tripla)|integral|extravirgem|congelado|resfriado|desfiado|fatiado|adulto|grande|azul|vermelha|bancada|220v|frio|externo|com\s*g[aá]s|sem\s*semente|porcionado|sach[eê]|inteiro|\d+\s*(peças|unidades)|ao\s*leite|c[oô]ngelado|iqf)/i;

  // Linhas que são cabeçalhos/categorias, não produtos individuais
  const IS_CATEGORY = /^(todos\s*os|todas\s*as|ofertas|aniversário|hora\s*da|vale\s*muito)/i;

  // ── 7. Varre linhas: monta pares [descrição → preço + dinâmica] ──
  const rawLines = text.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 1 && !/^[\d\s.,\-–—|•%*()\/__]+$/.test(l));

  const items = [];
  let descBuffer = [];
  let pendingDinamica = null; // dinâmica encontrada antes do preço

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    PRICE_RE.lastIndex = 0;
    const prices = line.match(PRICE_RE);

    // Detecta dinâmica em qualquer linha (pode aparecer antes ou depois do preço)
    const din = getDinamica(line);
    if (din && !prices) {
      pendingDinamica = din;
      continue;
    }

    if (prices) {
      // Maior preço da linha = preço de tabela
      const mainPrice = prices
        .map(p => ({ str: p, val: parseFloat(p.replace('R$','').replace(/\./g,'').replace(',','.')) }))
        .reduce((a, b) => b.val > a.val ? b : a);

      let preco = mainPrice.str.replace(/R\$\s*/, 'R$ ');

      // Verifica dinâmica na mesma linha de preço
      const dinNaLinha = getDinamica(line) || pendingDinamica;

      // Olha adiante: próxima(s) linha(s) podem ter dinâmica
      let lookahead = 1;
      let dinAdiante = null;
      while (lookahead <= 3 && i + lookahead < rawLines.length) {
        const next = rawLines[i + lookahead];
        PRICE_RE.lastIndex = 0;
        if (PRICE_RE.test(next)) break; // parou em outro preço
        dinAdiante = getDinamica(next);
        if (dinAdiante) { i += lookahead; break; }
        lookahead++;
      }

      const dinamicaFinal = dinNaLinha || dinAdiante;
      if (dinamicaFinal) preco += ` · ${dinamicaFinal}`;
      pendingDinamica = null;

      // Monta descrição: últimas linhas úteis do buffer
      const desc = descBuffer
        .filter(l => !IS_SPEC.test(l) && !IS_CATEGORY.test(l) && !/^\d/.test(l) && !/__/.test(l))
        .slice(-3)
        .join(' ')
        .replace(/\s{2,}/g, ' ')
        .trim();

      if (desc.length >= 4) {
        items.push({ descricao: desc, preco, categoria: '', ordem: items.length });
      }

      // Pula preços seguintes (promo, De/Por)
      PRICE_RE.lastIndex = 0;
      while (i + 1 < rawLines.length && PRICE_RE.test(rawLines[i + 1])) {
        PRICE_RE.lastIndex = 0; i++;
      }
      descBuffer = [];
    } else if (!/__/.test(line)) {
      // Só adiciona ao buffer se não for token interno
      descBuffer.push(line);
      if (descBuffer.length > 8) descBuffer.shift();
    }
  }

  // ── 8. Deduplica ─────────────────────────────────────────────────
  const seen = new Set();
  return items.filter(it => {
    const key = it.descricao.toLowerCase().slice(0, 28) + it.preco.slice(0, 10);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const TIPO_LABEL = { feira: '🛒 Feira', fds: '🏷️ Final de Semana' };
const TIPO_COLOR = { feira: '#6366f1', fds: '#E8681A' };

function fmt(d) {
  if (!d) return '';
  const [y,m,day] = d.split('-');
  return `${day}/${m}/${y}`;
}

// ── Tela de detalhes / conferência ────────────────────────────────
function CampanhaDetalhe({ campanha, userId, profile, onBack }) {
  const toast = useToast();
  const isAdmin = ['admin','supervisor'].includes(profile?.access_level);
  const fileRef = useRef();

  const [itens, setItens]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [itemModal, setItemModal] = useState(false);
  const [editItem, setEditItem]   = useState(null);
  const [itemForm, setItemForm]   = useState({ descricao:'', preco:'', categoria:'' });
  const [bulkText, setBulkText]         = useState('');
  const [bulkModal, setBulkModal]       = useState(false);
  const [pdfModal, setPdfModal]         = useState(false);
  const [pdfItems, setPdfItems]         = useState([]);   // itens extraídos do PDF
  const [pdfLoading, setPdfLoading]     = useState(false);
  const [pdfSaving, setPdfSaving]       = useState(false);
  const pdfInputRef                     = useRef();
  const [fotoModal, setFotoModal]       = useState(null); // item selecionado para foto
  const [obs, setObs]             = useState('');
  const [uploading, setUploading] = useState(false);
  const [gerandoPDF, setGerandoPDF] = useState(false);

  const load = () => {
    setLoading(true);
    api.get(`/campanhas/${campanha.id}/itens?requester_id=${userId}`)
      .then(r => setItens(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [campanha.id]);

  const totalItens    = itens.length;
  const validados     = itens.filter(i => i.campanha_evidencias?.length > 0).length;
  const progresso     = totalItens ? Math.round((validados / totalItens) * 100) : 0;
  const concluido     = totalItens > 0 && validados === totalItens;

  // ── Adicionar item único
  const saveItem = async () => {
    if (!itemForm.descricao.trim()) return toast('Preencha a descrição');
    try {
      if (editItem) {
        await api.put(`/campanhas/itens/${editItem.id}`, { requester_id: userId, ...itemForm });
        toast('Item atualizado');
      } else {
        await api.post(`/campanhas/${campanha.id}/itens`, {
          requester_id: userId,
          itens: [{ ...itemForm, ordem: itens.length }],
        });
        toast('Item adicionado');
      }
      setItemModal(false);
      setEditItem(null);
      setItemForm({ descricao:'', preco:'', categoria:'' });
      load();
    } catch { toast('Erro ao salvar item'); }
  };

  const openEditItem = (item) => {
    setEditItem(item);
    setItemForm({ descricao: item.descricao, preco: item.preco, categoria: item.categoria });
    setItemModal(true);
  };

  const deleteItem = async (id) => {
    await api.delete(`/campanhas/itens/${id}?requester_id=${userId}`).catch(() => {});
    setItens(l => l.filter(i => i.id !== id));
    toast('Item removido');
  };

  // ── Upload e extração automática do PDF do flyer
  const handlePdfUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfLoading(true);
    setPdfItems([]);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const viewport = page.getViewport({ scale: 1 });
        const pageWidth = viewport.width;
        const content = await page.getTextContent();

        // Ordena todos os itens por Y decrescente (topo→base), depois por X crescente (esq→dir)
        const sorted = [...content.items]
          .filter(it => it.str.trim())
          .sort((a, b) => {
            const dy = b.transform[5] - a.transform[5];
            if (Math.abs(dy) > 4) return dy;      // linhas diferentes
            return a.transform[4] - b.transform[4]; // mesma linha: da esquerda para direita
          });

        // Percorre item a item detectando quebras de linha e de coluna
        let prevY = null;
        let prevX = null;
        for (const item of sorted) {
          const x = item.transform[4];
          const y = item.transform[5];
          const txt = item.str.trim();
          if (!txt) continue;

          if (prevY === null) {
            fullText += txt;
          } else {
            const dy = Math.abs(y - prevY);
            const dx = x - prevX;

            if (dy > 4) {
              // Nova linha vertical
              fullText += '\n' + txt;
            } else if (dx > pageWidth * 0.22) {
              // Mesmo nível Y mas salto horizontal grande → coluna diferente → nova linha
              fullText += '\n' + txt;
            } else {
              // Mesmo bloco de texto
              fullText += ' ' + txt;
            }
          }
          prevY = y;
          prevX = x + (item.width || 0);
        }
        fullText += '\n';
      }

      const extracted = parseFlyerText(fullText);
      if (extracted.length === 0) {
        toast('Nenhum produto encontrado no PDF. Tente adicionar em lote.');
      } else {
        setPdfItems(extracted.map(it => ({ ...it, selected: true })));
        setPdfModal(true);
      }
    } catch (err) {
      toast('Erro ao ler o PDF: ' + err.message);
    } finally {
      setPdfLoading(false);
      e.target.value = '';
    }
  };

  const savePdfItems = async () => {
    const toSave = pdfItems
      .filter(it => it.selected)
      .map((it, i) => ({ descricao: it.descricao, preco: it.preco, categoria: it.categoria, ordem: itens.length + i }));
    if (!toSave.length) return toast('Selecione ao menos um item');
    setPdfSaving(true);
    try {
      await api.post(`/campanhas/${campanha.id}/itens`, { requester_id: userId, itens: toSave });
      toast(`✅ ${toSave.length} itens importados do flyer!`);
      setPdfModal(false);
      setPdfItems([]);
      load();
    } catch { toast('Erro ao salvar itens'); }
    finally { setPdfSaving(false); }
  };

  // ── Adicionar itens em lote (texto livre)
  const saveBulk = async () => {
    const linhas = bulkText.split('\n').map(l => l.trim()).filter(Boolean);
    if (!linhas.length) return toast('Digite ao menos um item');
    const itensNovos = linhas.map((l, i) => {
      // Tenta extrair preço no formato R$ 0,00 ou 0,00
      const precoMatch = l.match(/R?\$?\s*(\d+[.,]\d{2})/);
      const preco = precoMatch ? precoMatch[0].trim() : '';
      const descricao = l.replace(/R?\$?\s*\d+[.,]\d{2}/, '').trim().replace(/^[-•*]\s*/, '');
      return { descricao: descricao || l, preco, categoria: '', ordem: itens.length + i };
    });
    try {
      await api.post(`/campanhas/${campanha.id}/itens`, { requester_id: userId, itens: itensNovos });
      toast(`${itensNovos.length} itens adicionados!`);
      setBulkModal(false);
      setBulkText('');
      load();
    } catch { toast('Erro ao adicionar itens'); }
  };

  // ── Upload de foto
  const handleFoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !fotoModal) return;
    setUploading(true);
    try {
      const ext  = file.name.split('.').pop();
      const path = `${campanha.id}/${fotoModal.id}_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('evidencias').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('evidencias').getPublicUrl(path);
      await api.post('/campanhas/evidencias', {
        requester_id: userId,
        item_id: fotoModal.id,
        campanha_id: campanha.id,
        foto_url: urlData.publicUrl,
        obs,
      });
      toast('✅ Item validado!');
      setFotoModal(null);
      setObs('');
      load();
    } catch (err) { toast('Erro ao enviar foto: ' + err.message); }
    finally { setUploading(false); }
  };

  const removeEvidencia = async (evId) => {
    await api.delete(`/campanhas/evidencias/${evId}?requester_id=${userId}`).catch(() => {});
    toast('Evidência removida');
    load();
  };

  // ── Gerar PDF
  const gerarPDF = async () => {
    setGerandoPDF(true);
    try {
      const { data } = await api.get(`/campanhas/${campanha.id}/relatorio?requester_id=${userId}`);
      const { campanha: c, itens: its } = data;

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const W = doc.internal.pageSize.getWidth();

      // Cabeçalho
      doc.setFillColor(232, 104, 26);
      doc.rect(0, 0, W, 28, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16); doc.setFont('helvetica','bold');
      doc.text('ROTA 2.0 — Relatório de Sinalização', 14, 12);
      doc.setFontSize(10); doc.setFont('helvetica','normal');
      doc.text(`${c.titulo} | ${TIPO_LABEL[c.tipo]} | ${fmt(c.validade_ini)} a ${fmt(c.validade_fim)}`, 14, 20);
      doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, W - 14, 20, { align:'right' });

      // Resumo
      const total = its.length;
      const validadosPDF = its.filter(i => i.campanha_evidencias?.length > 0).length;
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(11); doc.setFont('helvetica','bold');
      doc.text('RESUMO', 14, 36);
      doc.setFont('helvetica','normal'); doc.setFontSize(10);
      doc.text(`Total de itens: ${total}`, 14, 43);
      doc.text(`Sinalizados: ${validadosPDF}`, 70, 43);
      doc.text(`Pendentes: ${total - validadosPDF}`, 130, 43);
      doc.text(`Progresso: ${Math.round((validadosPDF/total)*100)}%`, 14, 50);

      // Barra de progresso
      doc.setFillColor(220, 220, 220);
      doc.rect(14, 53, W - 28, 5, 'F');
      doc.setFillColor(232, 104, 26);
      doc.rect(14, 53, ((W - 28) * validadosPDF / total), 5, 'F');

      let y = 65;

      // Itens
      for (const item of its) {
        const ev = item.campanha_evidencias?.[0];
        const validado = !!ev;

        if (y > 260) { doc.addPage(); y = 15; }

        // Linha do item
        doc.setFillColor(validado ? 232 : 245, validado ? 248 : 245, validado ? 232 : 245);
        doc.rect(14, y - 4, W - 28, 14, 'F');
        doc.setDrawColor(200, 200, 200);
        doc.rect(14, y - 4, W - 28, 14, 'S');

        doc.setFontSize(10); doc.setFont('helvetica','bold');
        doc.setTextColor(validado ? 34 : 150, validado ? 139 : 150, validado ? 34 : 150);
        doc.text(validado ? '✓' : '○', 18, y + 4);
        doc.setTextColor(0, 0, 0);
        doc.text(item.descricao, 26, y + 2);
        if (item.preco) {
          doc.setFont('helvetica','bold'); doc.setTextColor(232, 104, 26);
          doc.text(item.preco, W - 16, y + 2, { align:'right' });
        }
        if (ev) {
          doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(100,100,100);
          doc.text(`Por: ${ev.user?.full_name || '—'} | ${new Date(ev.created_at).toLocaleString('pt-BR')}`, 26, y + 8);
        }

        y += 18;

        // Foto da evidência
        if (ev?.foto_url) {
          try {
            if (y > 230) { doc.addPage(); y = 15; }
            const img = await loadImage(ev.foto_url);
            const imgW = 60, imgH = 45;
            doc.addImage(img, 'JPEG', 14, y, imgW, imgH);
            if (ev.obs) {
              doc.setFontSize(9); doc.setFont('helvetica','italic'); doc.setTextColor(80,80,80);
              doc.text(`Obs: ${ev.obs}`, 80, y + 10);
            }
            y += imgH + 8;
          } catch { y += 4; }
        }
      }

      doc.save(`relatorio_${c.titulo.replace(/\s/g,'_')}_${new Date().toISOString().slice(0,10)}.pdf`);
      toast('PDF gerado com sucesso!');
    } catch (e) { toast('Erro ao gerar PDF: ' + e.message); }
    finally { setGerandoPDF(false); }
  };

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button className="btn-icon" onClick={onBack}><ArrowLeft size={18}/></button>
          <div>
            <div className="page-title">{campanha.titulo}</div>
            <div className="page-subtitle">
              <span style={{ color: TIPO_COLOR[campanha.tipo], fontWeight:600 }}>{TIPO_LABEL[campanha.tipo]}</span>
              {' · '}{fmt(campanha.validade_ini)} a {fmt(campanha.validade_fim)}
            </div>
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {isAdmin && (
            <>
              {/* Upload do PDF do flyer */}
              <input ref={pdfInputRef} type="file" accept="application/pdf"
                style={{ display:'none' }} onChange={handlePdfUpload}/>
              <button className="btn btn-primary" style={{ background:'#6366f1' }}
                onClick={() => pdfInputRef.current?.click()} disabled={pdfLoading}>
                {pdfLoading
                  ? <><Loader size={14} style={{ animation:'spin 1s linear infinite' }}/> Lendo PDF...</>
                  : <><Upload size={14}/> Upload Flyer PDF</>}
              </button>
              <button className="btn btn-ghost" onClick={() => setBulkModal(true)}>+ Lote</button>
              <button className="btn btn-ghost" onClick={() => { setEditItem(null); setItemForm({ descricao:'', preco:'', categoria:'' }); setItemModal(true); }}>
                <Plus size={14}/> Item
              </button>
            </>
          )}
          <button className="btn btn-primary" onClick={gerarPDF} disabled={gerandoPDF || validados === 0}>
            <FileText size={14}/> {gerandoPDF ? 'Gerando...' : 'Relatório PDF'}
          </button>
        </div>
      </div>

      {/* Progresso */}
      <div className="card" style={{ marginBottom:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
          <span style={{ fontWeight:700, fontSize:14 }}>Progresso da sinalização</span>
          <span style={{ fontWeight:800, fontSize:18, color: concluido ? '#10b981' : 'var(--primary)' }}>
            {validados}/{totalItens} — {progresso}%
          </span>
        </div>
        <div style={{ background:'var(--border)', borderRadius:8, height:12, overflow:'hidden' }}>
          <div style={{
            height:'100%', borderRadius:8, transition:'width .5s',
            width:`${progresso}%`,
            background: concluido ? '#10b981' : 'linear-gradient(90deg, var(--primary), #f59e0b)',
          }}/>
        </div>
        {concluido && (
          <div style={{ textAlign:'center', marginTop:10, color:'#10b981', fontWeight:700, fontSize:13 }}>
            ✅ Sinalização concluída! Gere o relatório PDF.
          </div>
        )}
      </div>

      {loading && <div style={{ textAlign:'center', color:'var(--text-muted)', padding:32 }}>Carregando...</div>}

      {/* Lista de itens */}
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {itens.map(item => {
          const ev = item.campanha_evidencias?.[0];
          const ok = !!ev;
          return (
            <div key={item.id} style={{
              background:'var(--surface)', borderRadius:12, padding:'14px 16px',
              border:`1px solid ${ok ? '#10b98140' : 'var(--border)'}`,
              borderLeft:`4px solid ${ok ? '#10b981' : '#f59e0b'}`,
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                {ok ? <CheckCircle size={22} style={{ color:'#10b981', flexShrink:0 }}/>
                     : <Circle size={22} style={{ color:'#f59e0b', flexShrink:0 }}/>}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:14 }}>{item.descricao}</div>
                  <div style={{ display:'flex', gap:10, fontSize:12, color:'var(--text-muted)', marginTop:2 }}>
                    {item.preco && <span style={{ color:'#E8681A', fontWeight:700 }}>{item.preco}</span>}
                    {item.categoria && <span>{item.categoria}</span>}
                    {ok && <span style={{ color:'#10b981' }}>✓ {ev.user?.full_name} · {new Date(ev.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span>}
                  </div>
                  {ok && ev.foto_url && (
                    <img src={ev.foto_url} alt="evidência"
                      style={{ marginTop:8, height:80, borderRadius:8, objectFit:'cover', cursor:'pointer' }}
                      onClick={() => window.open(ev.foto_url,'_blank')}/>
                  )}
                  {ok && ev.obs && <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:4, fontStyle:'italic' }}>"{ev.obs}"</div>}
                </div>
                <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                  {ok
                    ? <button className="btn-icon" style={{ color:'#ef4444' }} onClick={() => removeEvidencia(ev.id)} title="Remover evidência"><X size={14}/></button>
                    : <button className="btn btn-primary" style={{ fontSize:12, padding:'6px 12px' }}
                        onClick={() => { setFotoModal(item); setObs(''); fileRef.current?.click(); }}>
                        <Camera size={13}/> Foto
                      </button>
                  }
                  {isAdmin && (
                    <>
                      <button className="btn-icon" onClick={() => openEditItem(item)}><Pencil size={13}/></button>
                      <button className="btn-icon" style={{ color:'#ef4444' }} onClick={() => deleteItem(item.id)}><Trash2 size={13}/></button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input de arquivo oculto */}
      <input ref={fileRef} type="file" accept="image/*" capture="environment"
        style={{ display:'none' }} onChange={handleFoto}/>

      {/* Modal obs ao tirar foto */}
      {fotoModal && (
        <Modal open title={`Foto: ${fotoModal.descricao}`} onClose={() => setFotoModal(null)}>
          <div style={{ marginBottom:12, fontSize:13, color:'var(--text-muted)' }}>
            Selecione ou tire uma foto mostrando o item e a etiqueta de preço.
          </div>
          <div className="form-group">
            <label className="form-label">Observação (opcional)</label>
            <input className="input" value={obs} onChange={e => setObs(e.target.value)} placeholder="Ex: etiqueta dupla face, preço conferido"/>
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <button className="btn btn-ghost" style={{ flex:1, justifyContent:'center' }} onClick={() => setFotoModal(null)}>Cancelar</button>
            <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} disabled={uploading}
              onClick={() => fileRef.current?.click()}>
              <Camera size={14}/> {uploading ? 'Enviando...' : 'Tirar/Selecionar foto'}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal PDF — confirmar itens extraídos */}
      <Modal open={pdfModal} onClose={() => setPdfModal(false)} title={`📄 Itens extraídos do flyer (${pdfItems.filter(i=>i.selected).length}/${pdfItems.length} selecionados)`}>
        <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:10 }}>
          Revise os itens extraídos automaticamente. Desmarque os que não são produtos (títulos, rodapés etc) antes de importar.
        </div>
        <div style={{ maxHeight:360, overflowY:'auto', display:'flex', flexDirection:'column', gap:6, marginBottom:14 }}>
          {pdfItems.map((it, idx) => (
            <div key={idx} style={{
              display:'flex', alignItems:'center', gap:10, padding:'8px 10px',
              borderRadius:8, background: it.selected ? 'var(--primary)10' : 'var(--bg)',
              border:`1px solid ${it.selected ? 'var(--primary)40' : 'var(--border)'}`,
              cursor:'pointer',
            }} onClick={() => setPdfItems(l => l.map((x,i) => i===idx ? {...x, selected:!x.selected} : x))}>
              <input type="checkbox" checked={it.selected} readOnly
                style={{ accentColor:'var(--primary)', width:16, height:16, flexShrink:0 }}/>
              <div style={{ flex:1, minWidth:0 }}>
                <input className="input" style={{ padding:'4px 8px', fontSize:13, marginBottom:4 }}
                  value={it.descricao}
                  onClick={e => e.stopPropagation()}
                  onChange={e => setPdfItems(l => l.map((x,i) => i===idx ? {...x, descricao:e.target.value} : x))}/>
              </div>
              <input className="input" style={{ width:90, padding:'4px 8px', fontSize:13, flexShrink:0 }}
                value={it.preco}
                onClick={e => e.stopPropagation()}
                onChange={e => setPdfItems(l => l.map((x,i) => i===idx ? {...x, preco:e.target.value} : x))}/>
              <button className="btn-icon" style={{ color:'#ef4444', flexShrink:0 }}
                onClick={e => { e.stopPropagation(); setPdfItems(l => l.filter((_,i)=>i!==idx)); }}>
                <X size={14}/>
              </button>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <button style={{ fontSize:12, color:'var(--text-muted)', background:'none', border:'none', cursor:'pointer' }}
            onClick={() => setPdfItems(l => l.map(x=>({...x,selected:true})))}>Selecionar todos</button>
          <button style={{ fontSize:12, color:'var(--text-muted)', background:'none', border:'none', cursor:'pointer' }}
            onClick={() => setPdfItems(l => l.map(x=>({...x,selected:false})))}>Desmarcar todos</button>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button className="btn btn-ghost" style={{ flex:1, justifyContent:'center' }} onClick={() => setPdfModal(false)}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={savePdfItems} disabled={pdfSaving}>
            {pdfSaving ? 'Importando...' : `Importar ${pdfItems.filter(i=>i.selected).length} itens`}
          </button>
        </div>
      </Modal>

      {/* Modal item único */}
      <Modal open={itemModal} onClose={() => setItemModal(false)} title={editItem ? 'Editar item' : 'Novo item'}>
        <div className="form-group">
          <label className="form-label">Descrição *</label>
          <input className="input" value={itemForm.descricao} onChange={e => setItemForm(f=>({...f,descricao:e.target.value}))} placeholder="Ex: Arroz Tio João 5kg"/>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div className="form-group" style={{ margin:0 }}>
            <label className="form-label">Preço</label>
            <input className="input" value={itemForm.preco} onChange={e => setItemForm(f=>({...f,preco:e.target.value}))} placeholder="R$ 0,00"/>
          </div>
          <div className="form-group" style={{ margin:0 }}>
            <label className="form-label">Categoria</label>
            <input className="input" value={itemForm.categoria} onChange={e => setItemForm(f=>({...f,categoria:e.target.value}))} placeholder="Ex: Mercearia"/>
          </div>
        </div>
        <div style={{ display:'flex', gap:10, marginTop:8 }}>
          <button className="btn btn-ghost" style={{ flex:1, justifyContent:'center' }} onClick={() => setItemModal(false)}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={saveItem}>Salvar</button>
        </div>
      </Modal>

      {/* Modal lote */}
      <Modal open={bulkModal} onClose={() => setBulkModal(false)} title="Adicionar itens em lote">
        <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:12 }}>
          Cole os itens do flyer, um por linha. O sistema extrai o preço automaticamente se estiver na linha.
        </div>
        <textarea className="input" rows={12} value={bulkText}
          onChange={e => setBulkText(e.target.value)}
          placeholder={"Arroz Tio João 5kg R$ 18,90\nFeijão Camil 1kg 7,99\nAzeite Gallo 500ml"}
          style={{ resize:'vertical', fontFamily:'monospace', fontSize:12 }}/>
        <div style={{ display:'flex', gap:10, marginTop:8 }}>
          <button className="btn btn-ghost" style={{ flex:1, justifyContent:'center' }} onClick={() => setBulkModal(false)}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={saveBulk}>Adicionar itens</button>
        </div>
      </Modal>
    </div>
  );
}

// ── Tela principal (lista de campanhas) ───────────────────────────
export default function Campanhas({ userId, profile }) {
  const toast = useToast();
  const isAdmin = ['admin','supervisor'].includes(profile?.access_level);
  const [list, setList]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(false);
  const [form, setForm]         = useState({ titulo:'', tipo:'fds', validade_ini:'', validade_fim:'' });
  const [saving, setSaving]     = useState(false);
  const [detalhe, setDetalhe]   = useState(null);

  const load = () => {
    setLoading(true);
    api.get(`/campanhas?requester_id=${userId}`)
      .then(r => setList(r.data))
      .catch(() => toast('Erro ao carregar campanhas'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [userId]);

  const save = async () => {
    if (!form.titulo || !form.validade_ini || !form.validade_fim) return toast('Preencha todos os campos');
    setSaving(true);
    try {
      const r = await api.post('/campanhas', { requester_id: userId, ...form });
      toast('Campanha criada!');
      setModal(false);
      setForm({ titulo:'', tipo:'fds', validade_ini:'', validade_fim:'' });
      setDetalhe(r.data); // abre direto nos itens
      load();
    } catch { toast('Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const archive = async (id) => {
    await api.delete(`/campanhas/${id}?requester_id=${userId}`).catch(() => {});
    setList(l => l.filter(c => c.id !== id));
    toast('Campanha arquivada');
  };

  if (detalhe) {
    return <CampanhaDetalhe campanha={detalhe} userId={userId} profile={profile} onBack={() => { setDetalhe(null); load(); }}/>;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Conferência de Flyers</div>
          <div className="page-subtitle">Validação de sinalização promocional</div>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setModal(true)}>
            <Plus size={15}/> Nova campanha
          </button>
        )}
      </div>

      {loading && <div style={{ textAlign:'center', color:'var(--text-muted)', padding:32 }}>Carregando...</div>}

      {!loading && list.length === 0 && (
        <div style={{ textAlign:'center', padding:60, color:'var(--text-muted)' }}>
          <FileText size={40} style={{ opacity:.3, marginBottom:12 }}/>
          <p>{isAdmin ? 'Crie a primeira campanha de sinalização.' : 'Nenhuma campanha ativa no momento.'}</p>
        </div>
      )}

      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        {list.map(c => {
          const total    = c.campanha_itens?.length || 0;
          const itensIds = c.campanha_itens?.map(i => i.id) || [];
          const feitos   = c.campanha_evidencias?.filter(e => itensIds.includes(e.item_id)).length || 0;
          const pct      = total ? Math.round((feitos/total)*100) : 0;
          const ok       = total > 0 && feitos === total;

          return (
            <div key={c.id} style={{
              background:'var(--surface)', borderRadius:14, padding:'18px 20px',
              border:`1px solid ${ok ? '#10b98140' : 'var(--border)'}`,
              cursor:'pointer',
            }} onClick={() => setDetalhe(c)}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                    <span style={{ fontSize:11, fontWeight:700, color: TIPO_COLOR[c.tipo],
                      background: TIPO_COLOR[c.tipo]+'20', padding:'2px 8px', borderRadius:6 }}>
                      {TIPO_LABEL[c.tipo]}
                    </span>
                    {ok && <span style={{ fontSize:11, fontWeight:700, color:'#10b981',
                      background:'#10b98120', padding:'2px 8px', borderRadius:6 }}>✅ Concluído</span>}
                  </div>
                  <div style={{ fontWeight:700, fontSize:16, marginBottom:2 }}>{c.titulo}</div>
                  <div style={{ fontSize:12, color:'var(--text-muted)' }}>
                    {fmt(c.validade_ini)} a {fmt(c.validade_fim)}
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  {isAdmin && (
                    <button className="btn-icon" style={{ color:'#ef4444' }}
                      onClick={e => { e.stopPropagation(); archive(c.id); }}>
                      <Trash2 size={14}/>
                    </button>
                  )}
                  <ChevronRight size={18} style={{ color:'var(--text-muted)' }}/>
                </div>
              </div>
              {total > 0 && (
                <div style={{ marginTop:12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
                    <span style={{ color:'var(--text-muted)' }}>{feitos} de {total} itens sinalizados</span>
                    <span style={{ fontWeight:700, color: ok ? '#10b981' : 'var(--primary)' }}>{pct}%</span>
                  </div>
                  <div style={{ background:'var(--border)', borderRadius:6, height:8, overflow:'hidden' }}>
                    <div style={{ height:'100%', borderRadius:6, width:`${pct}%`,
                      background: ok ? '#10b981' : 'linear-gradient(90deg, var(--primary), #f59e0b)',
                      transition:'width .4s' }}/>
                  </div>
                </div>
              )}
              {total === 0 && isAdmin && (
                <div style={{ marginTop:8, fontSize:12, color:'#f59e0b' }}>⚠ Nenhum item cadastrado ainda</div>
              )}
            </div>
          );
        })}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Nova campanha">
        <div className="form-group">
          <label className="form-label">Título *</label>
          <input className="input" value={form.titulo} onChange={e => setForm(f=>({...f,titulo:e.target.value}))}
            placeholder="Ex: Flyer FDS 14/07 a 17/07"/>
        </div>
        <div className="form-group">
          <label className="form-label">Tipo</label>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            {[['feira','🛒 Feira (Ter/Qua)'],['fds','🏷️ Final de Semana (Qui–Seg)']].map(([k,l]) => (
              <button key={k} onClick={() => setForm(f=>({...f,tipo:k}))} style={{
                padding:'10px', borderRadius:8, cursor:'pointer', fontWeight:600, fontSize:13,
                border:`2px solid ${form.tipo===k ? TIPO_COLOR[k] : 'var(--border)'}`,
                background: form.tipo===k ? TIPO_COLOR[k]+'15' : 'transparent',
                color: form.tipo===k ? TIPO_COLOR[k] : 'var(--text-muted)',
              }}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div className="form-group" style={{ margin:0 }}>
            <label className="form-label">Início da validade *</label>
            <input className="input" type="date" value={form.validade_ini} onChange={e => setForm(f=>({...f,validade_ini:e.target.value}))}/>
          </div>
          <div className="form-group" style={{ margin:0 }}>
            <label className="form-label">Fim da validade *</label>
            <input className="input" type="date" value={form.validade_fim} onChange={e => setForm(f=>({...f,validade_fim:e.target.value}))}/>
          </div>
        </div>
        <div style={{ display:'flex', gap:10, marginTop:8 }}>
          <button className="btn btn-ghost" style={{ flex:1, justifyContent:'center' }} onClick={() => setModal(false)}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={save} disabled={saving}>
            {saving ? 'Criando...' : 'Criar campanha'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
