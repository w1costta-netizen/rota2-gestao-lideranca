import React, { useEffect, useState, useRef } from 'react';
import { Plus, Pencil, Trash2, Camera, CheckCircle, Circle, FileText, ChevronRight, X, ArrowLeft } from 'lucide-react';
import api from '../api';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';
import { supabase } from '../lib/supabase';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

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
  const [bulkText, setBulkText]   = useState('');
  const [bulkModal, setBulkModal] = useState(false);
  const [fotoModal, setFotoModal] = useState(null); // item selecionado para foto
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
