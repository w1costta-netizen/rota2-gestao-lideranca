import React, { useState, useEffect, useRef } from 'react';
import { Plus, Camera, ChevronRight, Trash2, FileText, Check, X, Upload, Image, Edit3, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import api from '../api';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';
import FotoEditor from '../components/FotoEditor';

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
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

// ─── Tela de lista ────────────────────────────────────────────────────────────
function RelatorioLista({ userId, profile, onOpen, onCreate }) {
  const [list, setList]     = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const isAdmin = ['admin', 'supervisor'].includes(profile?.access_level);

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
          <div className="page-title">Relatórios Fotográficos</div>
          <div className="page-subtitle">{list.length} relatório{list.length !== 1 ? 's' : ''}</div>
        </div>
        <button className="btn btn-primary" onClick={onCreate}>
          <Plus size={15}/> Novo relatório
        </button>
      </div>

      {loading && <div style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>Carregando...</div>}

      {!loading && list.length === 0 && (
        <div style={{ textAlign:'center', padding:60, color:'var(--text-muted)' }}>
          <Camera size={40} style={{ opacity:.3, marginBottom:12 }}/>
          <p>Nenhum relatório criado ainda.</p>
          <button className="btn btn-primary" style={{ marginTop:16 }} onClick={onCreate}>
            <Plus size={14}/> Criar primeiro relatório
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
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20,
                    background: r.status === 'finalizado' ? '#10b98120' : '#f59e0b20',
                    color: r.status === 'finalizado' ? '#10b981' : '#f59e0b' }}>
                    {r.status === 'finalizado' ? '✓ Finalizado' : '● Rascunho'}
                  </span>
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
function RelatorioDetalhe({ relatorio: initialRel, userId, profile, onBack, onFinalizar }) {
  const toast = useToast();
  const fileRef = useRef();
  const [rel, setRel]           = useState(initialRel);
  const [fotos, setFotos]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editandoFoto, setEditandoFoto] = useState(null); // { foto, photoUrl }
  const [editandoCaption, setEditandoCaption] = useState(null);
  const [captionText, setCaptionText]         = useState('');

  const loadFotos = () => {
    api.get(`/relatorios/${rel.id}?requester_id=${userId}`)
      .then(r => { setFotos(r.data.fotos?.sort((a,b) => a.order_index - b.order_index) || []); })
      .catch(() => toast('Erro ao carregar fotos', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadFotos(); }, [rel.id]);

  const handleFilesSelected = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const blob    = await resizeImage(file);
        const path    = `relatorios/${rel.id}/${Date.now()}_${i}.jpg`;
        const { error: upErr } = await supabase.storage.from('evidencias').upload(path, blob, { contentType:'image/jpeg' });
        if (upErr) throw upErr;
        const { data: { publicUrl } } = supabase.storage.from('evidencias').getPublicUrl(path);
        const { data: nova } = await api.post(`/relatorios/${rel.id}/fotos`, {
          requester_id: userId, photo_url: publicUrl, order_index: fotos.length + i,
        });
        setFotos(f => [...f, nova.data]);
      } catch (e) {
        toast(`Erro ao enviar foto ${i+1}: ${e.message}`, 'error');
      }
    }
    loadFotos();
    setUploading(false);
    toast('Fotos adicionadas!');
  };

  const removeFoto = async (fotoId) => {
    if (!window.confirm('Remover esta foto?')) return;
    await api.delete(`/relatorios/fotos/${fotoId}`).catch(() => toast('Erro ao remover', 'error'));
    setFotos(f => f.filter(x => x.id !== fotoId));
    toast('Foto removida');
  };

  const saveAnnotations = async ({ dataUrl, shapes }) => {
    const foto = editandoFoto;
    // Salva imagem anotada no Storage
    const blob = await (await fetch(dataUrl)).blob();
    const path = `relatorios/${rel.id}/annotated_${foto.id}.jpg`;
    const { error: upErr } = await supabase.storage.from('evidencias').upload(path, blob, { contentType:'image/jpeg', upsert:true });
    if (upErr) { toast('Erro ao salvar anotações', 'error'); return; }
    const { data: { publicUrl } } = supabase.storage.from('evidencias').getPublicUrl(path);
    await api.put(`/relatorios/fotos/${foto.id}`, { photo_url: publicUrl, annotations: { shapes } });
    setFotos(f => f.map(x => x.id === foto.id ? { ...x, photo_url: publicUrl, annotations: { shapes } } : x));
    setEditandoFoto(null);
    toast('Anotações salvas!');
  };

  const saveCaption = async () => {
    await api.put(`/relatorios/fotos/${editandoCaption}`, { caption: captionText });
    setFotos(f => f.map(x => x.id === editandoCaption ? { ...x, caption: captionText } : x));
    setEditandoCaption(null);
    toast('Descrição salva!');
  };

  const finalizarRelatorio = async () => {
    if (fotos.length === 0) { toast('Adicione ao menos uma foto antes de finalizar', 'error'); return; }
    await api.put(`/relatorios/${rel.id}`, { requester_id: userId, status: 'finalizado' });
    setRel(r => ({ ...r, status: 'finalizado' }));
    toast('Relatório finalizado!');
    onFinalizar?.({ ...rel, status: 'finalizado', fotos });
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
          photoUrl={editandoFoto.originalUrl || editandoFoto.photo_url}
          initialAnnotations={editandoFoto.annotations}
          onSave={saveAnnotations}
          onCancel={() => setEditandoFoto(null)}
        />
      </div>
    );
  }

  return (
    <div>
      {/* Cabeçalho */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
        <button onClick={onBack}
          style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:0 }}>
          <ArrowLeft size={20}/>
        </button>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, fontSize:16 }}>{rel.title}</div>
          <div style={{ fontSize:12, color:'var(--text-muted)' }}>
            {rel.creator?.full_name} · {formatDate(rel.created_at)}
          </div>
        </div>
        <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20,
          background: rel.status === 'finalizado' ? '#10b98120' : '#f59e0b20',
          color: rel.status === 'finalizado' ? '#10b981' : '#f59e0b' }}>
          {rel.status === 'finalizado' ? '✓ Finalizado' : '● Rascunho'}
        </span>
      </div>

      {rel.description && (
        <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:16, lineHeight:1.5 }}>{rel.description}</p>
      )}

      {/* Fotos */}
      {loading
        ? <div style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}>Carregando fotos...</div>
        : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', gap:12, marginBottom:20 }}>
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
                {editandoCaption === foto.id
                  ? (
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
                  )
                }
              </div>
            </div>
          ))}

          {/* Botão adicionar foto */}
          <div onClick={() => fileRef.current?.click()}
            style={{ minHeight:140, background:'var(--bg)', borderRadius:10,
              border:'2px dashed var(--border)', cursor: uploading ? 'wait' : 'pointer',
              display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8,
              color:'var(--text-muted)', opacity: uploading ? 0.5 : 1 }}>
            {uploading ? <Upload size={24}/> : <Camera size={24}/>}
            <span style={{ fontSize:12 }}>{uploading ? 'Enviando...' : 'Adicionar foto'}</span>
          </div>
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" multiple capture="environment"
        style={{ display:'none' }} onChange={e => handleFilesSelected(Array.from(e.target.files))}/>

      {/* Ações finais */}
      {rel.status !== 'finalizado' && (
        <div style={{ display:'flex', gap:10, marginTop:8 }}>
          <button className="btn btn-ghost" style={{ flex:1, justifyContent:'center' }} onClick={onBack}>
            Salvar rascunho
          </button>
          <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={finalizarRelatorio}>
            <Check size={15}/> Finalizar relatório
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Modal de criação ─────────────────────────────────────────────────────────
function ModalCriar({ open, onClose, onCreated, userId }) {
  const toast = useToast();
  const [title, setTitle]       = useState('');
  const [desc, setDesc]         = useState('');
  const [saving, setSaving]     = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) return toast('Digite um título para o relatório', 'error');
    setSaving(true);
    try {
      const { data } = await api.post('/relatorios', { requester_id: userId, title, description: desc });
      toast('Relatório criado!');
      setTitle(''); setDesc('');
      onCreated(data);
    } catch { toast('Erro ao criar relatório', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Novo Relatório Fotográfico">
      <div className="form-group">
        <label className="form-label">Título *</label>
        <input className="input" placeholder="Ex.: Inspeção corredor de laticínios" value={title}
          onChange={e => setTitle(e.target.value)} autoFocus/>
      </div>
      <div className="form-group">
        <label className="form-label">Descrição (opcional)</label>
        <textarea className="input" rows={3} placeholder="Contexto ou observações gerais..."
          value={desc} onChange={e => setDesc(e.target.value)} style={{ resize:'vertical' }}/>
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
  const [tela, setTela]             = useState('lista'); // 'lista' | 'detalhe'
  const [relAtual, setRelAtual]     = useState(null);
  const [modalCriar, setModalCriar] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const abrirRelatorio = (rel) => { setRelAtual(rel); setTela('detalhe'); };

  const aoFinalizar = (rel) => {
    setRelAtual(rel);
    // mantém na tela de detalhe para PDF/share na Etapa 2
  };

  return (
    <div>
      <RelatorioLista
        userId={userId} profile={profile}
        onOpen={abrirRelatorio}
        onCreate={() => setModalCriar(true)}
        key={refreshKey}
        style={{ display: tela === 'lista' ? 'block' : 'none' }}
      />

      {tela === 'detalhe' && relAtual && (
        <RelatorioDetalhe
          relatorio={relAtual} userId={userId} profile={profile}
          onBack={() => { setTela('lista'); setRefreshKey(k => k + 1); }}
          onFinalizar={aoFinalizar}
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
