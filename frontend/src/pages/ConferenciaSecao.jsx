import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Trash2, Camera, Hash, Barcode, ChevronRight, ChevronUp, ChevronDown, CheckCircle2,
         AlertCircle, Clock, Package, FileText, ArrowLeft, Upload, X, Search } from 'lucide-react';
import api from '../api';
import { useToast } from '../components/Toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const MOTIVO_LABEL = { 0: '—', 1: 'Ruptura', 2: 'Sazonal', 3: 'Substituído', 4: 'Descontinuado' };

// Linha e Fine Line agora são multi-seleção (array) — formata pra exibição em texto
const fmtList = v => Array.isArray(v) ? v.filter(Boolean).join(', ') : (v || '');
const csvList = v => Array.isArray(v) ? v.filter(Boolean).join(',') : (v || '');

// ── Tela: lista de sessões ──────────────────────────────────────────────────
function ListaSessoes({ userId, profile, onNova, onAbrir }) {
  const toast = useToast();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ultimaImportacao, setUltimaImportacao] = useState(null);

  const companyQS = profile?.company ? `&company=${encodeURIComponent(profile.company)}` : '';

  const carregarUltimaImportacao = useCallback(() => {
    api.get(`/conferencia/ultima-importacao?requester_id=${userId}${companyQS}`)
      .then(r => setUltimaImportacao(r.data.importado_at))
      .catch(() => {});
  }, [userId, companyQS]);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/conferencia/sessoes?requester_id=${userId}${companyQS}`)
      .then(r => setList(r.data))
      .catch(() => toast('Erro ao carregar conferências', 'error'))
      .finally(() => setLoading(false));
  }, [userId, companyQS]);

  useEffect(() => { load(); carregarUltimaImportacao(); }, [load, carregarUltimaImportacao]);

  const remover = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Remover esta conferência?')) return;
    try {
      await api.delete(`/conferencia/sessoes/${id}?requester_id=${userId}`);
      setList(l => l.filter(s => s.id !== id));
      toast('Conferência removida');
    } catch { toast('Erro ao remover', 'error'); }
  };

  const canImport = ['admin', 'master'].includes(profile?.access_level);

  const fmtData = (iso) => {
    if (!iso) return null;
    return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Conferência de Seção</div>
          <div className="page-subtitle">{list.length} conferência{list.length !== 1 ? 's' : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {canImport && (
            <ImportarBtn userId={userId} profile={profile} onDone={() => { toast('Base atualizada!'); carregarUltimaImportacao(); }} />
          )}
          <button className="btn btn-primary" onClick={onNova}>
            <Plus size={15} /> Nova
          </button>
        </div>
      </div>

      {/* Aviso de última importação */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: ultimaImportacao ? '#10b98115' : '#f59e0b15',
        border: `1px solid ${ultimaImportacao ? '#10b98140' : '#f59e0b40'}`,
        borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13,
      }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: ultimaImportacao ? '#10b981' : '#f59e0b' }} />
        {ultimaImportacao
          ? <span><strong>Base de produtos atualizada</strong> — última importação em {fmtData(ultimaImportacao)}</span>
          : <span style={{ color: '#f59e0b' }}><strong>Base não importada.</strong> Clique em "Importar base" para carregar os produtos.</span>
        }
      </div>

      {loading && <div style={{ color: 'var(--text-muted)', padding: 32, textAlign: 'center' }}>Carregando...</div>}

      {!loading && list.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <FileText size={40} style={{ opacity: .3, marginBottom: 12 }} />
          <p>Nenhuma conferência ainda. Clique em "Nova" para começar.</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {list.map(s => (
          <div key={s.id} onClick={() => onAbrir(s)}
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
              padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
            }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              background: s.status === 'finalizada' ? '#10b98120' : 'var(--primary-subtle)',
            }}>
              {s.status === 'finalizada'
                ? <CheckCircle2 size={20} color="#10b981" />
                : <Clock size={20} color="var(--primary)" />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{fmtList(s.sulinha) || fmtList(s.linha) || s.secao || 'Conferência'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {[s.setor, s.departamento, s.secao, fmtList(s.linha)].filter(Boolean).join(' › ')}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                {s.creator?.full_name} · {new Date(s.created_at).toLocaleDateString('pt-BR')}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                background: s.status === 'finalizada' ? '#10b98120' : '#f59e0b20',
                color: s.status === 'finalizada' ? '#10b981' : '#f59e0b',
              }}>
                {s.status === 'finalizada' ? 'Finalizada' : 'Em andamento'}
              </span>
              <button className="btn-icon" onClick={e => remover(s.id, e)} style={{ color: '#ef4444' }}>
                <Trash2 size={14} />
              </button>
              <ChevronRight size={16} color="var(--text-muted)" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Botão de importar xlsx ──────────────────────────────────────────────────
function ImportarBtn({ userId, profile, onDone }) {
  const toast = useToast();
  const ref = useRef();
  const [loading, setLoading] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('requester_id', userId);
      if (profile?.company) fd.append('company', profile.company);
      await api.post('/conferencia/importar', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300000 });
      onDone();
    } catch (err) {
      toast(err.response?.data?.error || 'Erro ao importar', 'error');
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  return (
    <>
      <input ref={ref} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFile} />
      <button className="btn btn-ghost" onClick={() => !loading && ref.current.click()} disabled={loading}
        title={loading ? 'Aguarde, importando produtos...' : 'Atualizar base de produtos'}>
        <Upload size={15} /> {loading ? 'Importando... aguarde' : 'Importar base'}
      </button>
      {loading && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 4 }}>
          Processando ~34.000 produtos. Pode levar 1–2 min.
        </div>
      )}
    </>
  );
}

// ── Tela: nova conferência (seletores em cascata) ──────────────────────────
function NovaSessao({ userId, profile, onCriar, onVoltar }) {
  const toast = useToast();
  const [opts, setOpts] = useState({ setores: [], departamentos: [], secoes: [], linhas: [], sulinhas: [] });
  const [sel, setSel] = useState({ setor: '', departamento: '', secao: '', linha: [], sulinha: [] });
  const [saving, setSaving] = useState(false);

  const loadFiltros = useCallback(async (params = {}) => {
    const base = { requester_id: userId, ...params };
    if (profile?.company) base.company = profile.company;
    const q = new URLSearchParams(base).toString();
    try {
      const r = await api.get(`/conferencia/filtros?${q}`);
      setOpts(o => ({ ...o, ...r.data }));
    } catch { toast('Erro ao carregar filtros', 'error'); }
  }, [userId, profile?.company]);

  useEffect(() => { loadFiltros(); }, [loadFiltros]);

  const refetchOpts = async (next) => {
    const params = { requester_id: userId };
    if (profile?.company)  params.company      = profile.company;
    if (next.setor)        params.setor        = next.setor;
    if (next.departamento) params.departamento = next.departamento;
    if (next.secao)        params.secao        = next.secao;
    if (next.linha?.length) params.linha       = next.linha.join(',');
    try {
      const r = await api.get(`/conferencia/filtros?${new URLSearchParams(params).toString()}`);
      setOpts(o => ({ ...o, ...r.data }));
    } catch { toast('Erro ao carregar opções', 'error'); }
  };

  // Setor/Departamento/Seção continuam de escolha única — cada troca reseta os níveis abaixo
  const change = async (field, value) => {
    let next;
    if (field === 'setor')             next = { setor: value, departamento: '', secao: '', linha: [], sulinha: [] };
    else if (field === 'departamento') next = { setor: sel.setor, departamento: value, secao: '', linha: [], sulinha: [] };
    else                                next = { setor: sel.setor, departamento: sel.departamento, secao: value, linha: [], sulinha: [] };
    setSel(next);
    await refetchOpts(next);
  };

  // Linha e Fine Line são multi-seleção — dá pra conferir várias linhas/fine lines na mesma sessão
  const toggleLinha = async (value) => {
    const atuais = sel.linha;
    const novasLinhas = atuais.includes(value) ? atuais.filter(v => v !== value) : [...atuais, value];
    const next = { ...sel, linha: novasLinhas, sulinha: [] };
    setSel(next);
    await refetchOpts(next);
  };

  const toggleSulinha = (value) => {
    setSel(s => {
      const atuais = s.sulinha;
      return { ...s, sulinha: atuais.includes(value) ? atuais.filter(v => v !== value) : [...atuais, value] };
    });
  };

  const criar = async () => {
    if (!sel.setor || !sel.departamento || !sel.secao || !sel.linha.length || !sel.sulinha.length) {
      return toast('Selecione todos os níveis (pelo menos 1 linha e 1 fine line)');
    }
    setSaving(true);
    try {
      const r = await api.post('/conferencia/sessoes', { requester_id: userId, company: profile?.company, ...sel });
      onCriar(r.data);
    } catch { toast('Erro ao criar conferência', 'error'); }
    finally { setSaving(false); }
  };

  const Select = ({ label, field, options, disabled }) => (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <select className="input" value={sel[field]} onChange={e => change(field, e.target.value)} disabled={disabled}>
        <option value="">Selecione...</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <button className="btn btn-ghost" onClick={onVoltar}><ArrowLeft size={15} /> Voltar</button>
        <div className="page-title" style={{ marginTop: 8 }}>Nova conferência</div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, maxWidth: 480 }}>
        <Select label="1. Setor" field="setor" options={opts.setores} />
        <Select label="2. Departamento" field="departamento" options={opts.departamentos} disabled={!sel.setor} />
        <Select label="3. Seção" field="secao" options={opts.secoes} disabled={!sel.departamento} />
        <MultiSelect label="4. Linha" options={opts.linhas} selected={sel.linha} onToggle={toggleLinha} disabled={!sel.secao} />
        <MultiSelect label="5. Fine Line" options={opts.sulinhas} selected={sel.sulinha} onToggle={toggleSulinha} disabled={!sel.linha.length} />

        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={onVoltar}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={criar} disabled={saving}>
            {saving ? 'Criando...' : 'Iniciar conferência'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Multi-seleção em formato de dropdown — fecha ao clicar fora, mostra um
// resumo ("N selecionadas") quando fechado. Fica fora de NovaSessao pra não
// perder o estado de aberto/fechado a cada re-render do formulário.
function MultiSelect({ label, options, selected, onToggle, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  const resumo = selected.length === 0 ? 'Selecione...'
    : selected.length <= 2 ? selected.join(', ')
    : `${selected.length} selecionadas`;

  return (
    <div className="form-group" ref={ref} style={{ position: 'relative' }}>
      <label className="form-label">{label}</label>
      <button type="button" onClick={() => !disabled && setOpen(o => !o)} disabled={disabled}
        className="input" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', textAlign: 'left', cursor: disabled ? 'default' : 'pointer',
          color: selected.length ? 'var(--text)' : 'var(--text-muted)',
          opacity: disabled ? 0.5 : 1,
        }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resumo}</span>
        {open ? <ChevronUp size={15} style={{ flexShrink: 0 }}/> : <ChevronDown size={15} style={{ flexShrink: 0 }}/>}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 20,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,.15)', maxHeight: 240, overflowY: 'auto', padding: '6px 4px',
        }}>
          {options.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>
              Nenhuma opção disponível
            </p>
          )}
          {options.map(o => {
            const isSel = selected.includes(o);
            return (
              <label key={o} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6,
                cursor: 'pointer', background: isSel ? 'rgba(232,98,42,.08)' : 'transparent', fontSize: 13,
              }}>
                <input type="checkbox" checked={isSel} onChange={() => onToggle(o)}
                  style={{ accentColor: '#E8681A', width: 15, height: 15, flexShrink: 0 }}/>
                <span style={{ color: 'var(--text)' }}>{o}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Tela: coleta de itens ───────────────────────────────────────────────────
function Coleta({ userId, profile, sessao, onFinalizar, onVoltar }) {
  const toast = useToast();
  const [itens, setItens] = useState([]);
  const [input, setInput] = useState('');
  const [modo, setModo] = useState('cd'); // 'cd' | 'ean' | 'camera'
  const [scannerAtivo, setScannerAtivo] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const scannerRef = useRef(null);
  const html5QrRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    api.get(`/conferencia/sessoes/${sessao.id}/itens`)
      .then(r => setItens(r.data))
      .catch(() => {});
  }, [sessao.id]);

  const buscarEAdicionar = useCallback(async (codigo) => {
    if (!codigo?.trim()) return;
    const cod = codigo.trim();
    if (itens.some(i => i.cd_produto === cod || i.ean === cod)) {
      toast('Item já coletado');
      setInput('');
      return;
    }
    setBuscando(true);
    try {
      const companyQS = profile?.company ? `&company=${encodeURIComponent(profile.company)}` : '';
      const r = await api.get(`/conferencia/buscar?requester_id=${userId}&q=${encodeURIComponent(cod)}${companyQS}`);
      const prod = r.data;
      const resp = await api.post(`/conferencia/sessoes/${sessao.id}/itens`, {
        cd_produto: prod.cd_produto,
        ean: prod.ean,
        descricao_produto: prod.descricao_produto,
      });
      setItens(l => [resp.data, ...l]);
      toast(`✓ ${prod.descricao_produto}`);
    } catch (err) {
      if (err.response?.status === 404) toast('Produto não encontrado', 'error');
      else toast('Erro ao buscar produto', 'error');
    } finally {
      setBuscando(false);
      setInput('');
      inputRef.current?.focus();
    }
  }, [itens, sessao.id, userId, profile?.company]);

  const iniciarCamera = async () => {
    setScannerAtivo(true);
    setTimeout(async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        html5QrRef.current = new Html5Qrcode('qr-reader');
        await html5QrRef.current.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 150 } },
          (decodedText) => {
            html5QrRef.current.stop().catch(() => {});
            setScannerAtivo(false);
            buscarEAdicionar(decodedText);
          },
          () => {}
        );
      } catch (e) {
        toast('Câmera não disponível', 'error');
        setScannerAtivo(false);
      }
    }, 100);
  };

  const pararCamera = () => {
    html5QrRef.current?.stop().catch(() => {});
    setScannerAtivo(false);
  };

  const removerItem = async (id) => {
    await api.delete(`/conferencia/sessoes/${sessao.id}/itens/${id}`).catch(() => {});
    setItens(l => l.filter(i => i.id !== id));
  };

  const finalizar = async () => {
    if (itens.length === 0) return toast('Colete ao menos 1 item antes de finalizar');
    if (!window.confirm('Finalizar coleta e gerar relatório?')) return;
    setFinalizando(true);
    try {
      await api.put(`/conferencia/sessoes/${sessao.id}/finalizar`, { requester_id: userId });
      onFinalizar(itens);
    } catch { toast('Erro ao finalizar', 'error'); }
    finally { setFinalizando(false); }
  };

  const isReadonly = sessao.status === 'finalizada';

  return (
    <div>
      <div className="page-header" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-ghost" onClick={onVoltar}><ArrowLeft size={15} /></button>
          <div>
            <div className="page-title" style={{ fontSize: 16 }}>{fmtList(sessao.sulinha) || fmtList(sessao.linha)}</div>
            <div className="page-subtitle">{fmtList(sessao.linha)} · {sessao.secao} · {sessao.departamento}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{itens.length} item{itens.length !== 1 ? 's' : ''}</span>
          {!isReadonly && (
            <button className="btn btn-primary" onClick={finalizar} disabled={finalizando}>
              <CheckCircle2 size={15} /> {finalizando ? 'Finalizando...' : 'Finalizar'}
            </button>
          )}
        </div>
      </div>

      {!isReadonly && (
        <>
          {/* Seletor de modo */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {[
              { id: 'cd', icon: Hash, label: 'Código' },
              { id: 'ean', icon: Barcode, label: 'EAN' },
              { id: 'camera', icon: Camera, label: 'Câmera' },
            ].map(m => (
              <button key={m.id} onClick={() => { setModo(m.id); if (scannerAtivo) pararCamera(); }}
                style={{
                  flex: 1, padding: '8px 4px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  border: `1px solid ${modo === m.id ? 'var(--primary)' : 'var(--border)'}`,
                  background: modo === m.id ? 'var(--primary-subtle)' : 'var(--surface)',
                  color: modo === m.id ? 'var(--primary)' : 'var(--text-muted)',
                }}>
                <m.icon size={14} /> {m.label}
              </button>
            ))}
          </div>

          {/* Input manual */}
          {modo !== 'camera' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input
                ref={inputRef}
                className="input"
                placeholder={modo === 'cd' ? 'Digite o código de 6 dígitos...' : 'Digite o código de barras (EAN)...'}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') buscarEAdicionar(input); }}
                inputMode="numeric"
                style={{ flex: 1 }}
                autoFocus
              />
              <button className="btn btn-primary" onClick={() => buscarEAdicionar(input)} disabled={buscando || !input.trim()}>
                {buscando ? '...' : <Search size={16} />}
              </button>
            </div>
          )}

          {/* Scanner câmera */}
          {modo === 'camera' && (
            <div style={{ marginBottom: 16 }}>
              {!scannerAtivo ? (
                <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px' }} onClick={iniciarCamera}>
                  <Camera size={18} /> Abrir câmera para bipar
                </button>
              ) : (
                <div style={{ position: 'relative' }}>
                  <div id="qr-reader" ref={scannerRef} style={{ borderRadius: 12, overflow: 'hidden' }} />
                  <button onClick={pararCamera}
                    style={{ position: 'absolute', top: 8, right: 8, background: '#00000080', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <X size={16} color="#fff" />
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Lista de itens coletados */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {itens.map(item => (
          <div key={item.id} style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
            padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#10b98120', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <CheckCircle2 size={16} color="#10b981" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.descricao_produto || item.cd_produto}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                CD: {item.cd_produto} {item.ean ? `· EAN: ${item.ean}` : ''}
              </div>
            </div>
            {!isReadonly && (
              <button className="btn-icon" onClick={() => removerItem(item.id)} style={{ color: '#ef4444' }}>
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
        {itens.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
            Nenhum item coletado ainda.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tela: relatório de não expostos ────────────────────────────────────────
function Relatorio({ userId, profile, sessao, itensColetados, onVoltar }) {
  const toast = useToast();
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = new URLSearchParams({
      requester_id: userId,
      ...(profile?.company ? { company: profile.company } : {}),
      setor:        sessao.setor        || '',
      departamento: sessao.departamento || '',
      secao:        sessao.secao        || '',
      linha:        csvList(sessao.linha),
      sulinha:      csvList(sessao.sulinha),
    }).toString();
    api.get(`/conferencia/linha?${q}`)
      .then(r => setTodos(r.data))
      .catch(() => toast('Erro ao carregar produtos da linha', 'error'))
      .finally(() => setLoading(false));
  }, [sessao, userId, profile?.company]);

  const coletadosCDs = new Set(itensColetados.map(i => i.cd_produto));
  const coletadosEANs = new Set(itensColetados.map(i => i.ean).filter(Boolean));
  // Suspensos primeiro, depois ativos — agrupados pra facilitar a análise visual
  const porStatus = (a, b) => (a.produto_status === 'Suspenso' ? 0 : 1) - (b.produto_status === 'Suspenso' ? 0 : 1);
  const naoExpostos = todos.filter(p => !coletadosCDs.has(p.cd_produto) && !coletadosEANs.has(p.ean)).sort(porStatus);
  const expostos = todos.filter(p => coletadosCDs.has(p.cd_produto) || coletadosEANs.has(p.ean)).sort(porStatus);

  const gerarPDF = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    doc.setFontSize(14); doc.setFont(undefined, 'bold');
    doc.text('Relatório de Conferência de Seção', 14, 18);
    doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(100);
    doc.text(`Gerado em: ${agora}`, 14, 25);
    doc.text(`Fine Line: ${fmtList(sessao.sulinha) || '—'}  ·  Linha: ${fmtList(sessao.linha)}  ·  Seção: ${sessao.secao}  ·  Dept: ${sessao.departamento}`, 14, 30);

    // Resumo
    doc.setFontSize(10); doc.setFont(undefined, 'bold'); doc.setTextColor(0);
    doc.text(`Total na linha: ${todos.length}   Expostos: ${expostos.length}   Não expostos: ${naoExpostos.length}`, 14, 38);
    doc.setFontSize(9); doc.setFont(undefined, 'normal');
    doc.text(
      `Susp. c/ estoque: ${suspComEstoque.length}   Susp. s/ estoque: ${suspSemEstoque.length}   `
      + `Ativos c/ estoque: ${ativComEstoque.length}   Ativos s/ estoque: ${ativSemEstoque.length}   `
      + `% Ruptura (ativos): ${pctRuptura}%`, 14, 44);

    // Tabela não expostos
    if (naoExpostos.length > 0) {
      doc.setFontSize(11); doc.setFont(undefined, 'bold'); doc.setTextColor(0);
      doc.text('Itens NÃO expostos', 14, 53);
      autoTable(doc, {
        startY: 57,
        head: [['Código', 'Descrição', 'Status', 'Estoque', 'Última NF', 'Motivo Susp.']],
        body: naoExpostos.map(p => [
          p.cd_produto,
          p.descricao_produto || '',
          p.produto_status || '',
          p.estoque_qty ?? '',
          p.data_ultima_nf ? new Date(p.data_ultima_nf).toLocaleDateString('pt-BR') : '—',
          MOTIVO_LABEL[p.motivo_suspencao] || '—',
        ]),
        headStyles: { fillColor: [239, 68, 68] },
        styles: { fontSize: 8 },
        columnStyles: { 1: { cellWidth: 70 } },
      });
    }

    // Tabela expostos — no mesmo relatório, logo abaixo da de não expostos
    if (expostos.length > 0) {
      let y = naoExpostos.length > 0 ? doc.lastAutoTable.finalY + 10 : 53;
      if (y > 260) { doc.addPage(); y = 20; }
      doc.setFontSize(11); doc.setFont(undefined, 'bold'); doc.setTextColor(0);
      doc.text('Itens expostos', 14, y);
      autoTable(doc, {
        startY: y + 4,
        head: [['Código', 'Descrição', 'Status', 'Estoque', 'Última NF', 'Motivo Susp.']],
        body: expostos.map(p => [
          p.cd_produto,
          p.descricao_produto || '',
          p.produto_status || '',
          p.estoque_qty ?? '',
          p.data_ultima_nf ? new Date(p.data_ultima_nf).toLocaleDateString('pt-BR') : '—',
          MOTIVO_LABEL[p.motivo_suspencao] || '—',
        ]),
        headStyles: { fillColor: [16, 185, 129] },
        styles: { fontSize: 8 },
        columnStyles: { 1: { cellWidth: 70 } },
      });
    }

    // Rodapé com a marca do app em todas as páginas
    const totalPages = doc.internal.getNumberOfPages();
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setDrawColor(220); doc.setLineWidth(0.2);
      doc.line(14, pageH - 14, pageW - 14, pageH - 14);
      doc.setFontSize(8); doc.setFont(undefined, 'bold'); doc.setTextColor(120);
      doc.text('Rota Líder', 14, pageH - 9);
      doc.setFont(undefined, 'normal');
      doc.text('rotalider.com.br', pageW - 14, pageH - 9, { align: 'right' });
      doc.text(`Página ${i} de ${totalPages}`, pageW / 2, pageH - 9, { align: 'center' });
    }

    doc.save(`conferencia_${(fmtList(sessao.sulinha) || fmtList(sessao.linha) || 'itens').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const pct = todos.length ? Math.round((expostos.length / todos.length) * 100) : 0;

  // Resumo por status x estoque + % de ruptura (só considera itens ativos)
  const temEstoque = p => (p.estoque_qty || 0) > 0;
  const suspComEstoque = todos.filter(p => p.produto_status === 'Suspenso' && temEstoque(p));
  const suspSemEstoque = todos.filter(p => p.produto_status === 'Suspenso' && !temEstoque(p));
  const ativComEstoque = todos.filter(p => p.produto_status === 'Ativo' && temEstoque(p));
  const ativSemEstoque = todos.filter(p => p.produto_status === 'Ativo' && !temEstoque(p));
  const totalAtivos = ativComEstoque.length + ativSemEstoque.length;
  const pctRuptura = totalAtivos ? Math.round((ativSemEstoque.length / totalAtivos) * 100) : 0;

  return (
    <div>
      <div className="page-header">
        <button className="btn btn-ghost" onClick={onVoltar}><ArrowLeft size={15} /> Voltar</button>
        <div className="page-title" style={{ marginTop: 8 }}>Relatório — {fmtList(sessao.sulinha) || fmtList(sessao.linha)}</div>
        <button className="btn btn-primary" onClick={gerarPDF}>
          <FileText size={15} /> Exportar PDF
        </button>
      </div>

      {loading && <div style={{ color: 'var(--text-muted)', padding: 32, textAlign: 'center' }}>Carregando...</div>}

      {!loading && (
        <>
          {/* Resumo status x estoque + % de ruptura */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 14 }}>
            {[
              { label: 'Susp. c/ estoque', value: suspComEstoque.length, color: '#f59e0b' },
              { label: 'Susp. s/ estoque', value: suspSemEstoque.length, color: '#f59e0b' },
              { label: 'Ativos c/ estoque', value: ativComEstoque.length, color: '#10b981' },
              { label: 'Ativos s/ estoque', value: ativSemEstoque.length, color: '#ef4444' },
              { label: '% Ruptura (ativos)', value: `${pctRuptura}%`, color: '#ef4444' },
            ].map(c => (
              <div key={c.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: c.color }}>{c.value}</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>{c.label}</div>
              </div>
            ))}
          </div>

          {/* Cards de resumo */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
            {[
              { label: 'Total na linha', value: todos.length, color: 'var(--primary)' },
              { label: 'Expostos', value: expostos.length, color: '#10b981' },
              { label: 'Não expostos', value: naoExpostos.length, color: '#ef4444' },
            ].map(c => (
              <div key={c.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: c.color }}>{c.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{c.label}</div>
              </div>
            ))}
          </div>

          {/* Barra de cobertura */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: 'var(--text-muted)' }}>Cobertura da gôndola</span>
              <span style={{ fontWeight: 600 }}>{pct}%</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 4, width: `${pct}%`, background: pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444', transition: 'width .5s' }} />
            </div>
          </div>

          {/* Lista de não expostos */}
          {naoExpostos.length > 0 && (
            <>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={16} /> Não expostos ({naoExpostos.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
                {naoExpostos.map(p => (
                  <div key={p.cd_produto} style={{ background: 'var(--surface)', border: '1px solid #ef444430', borderLeft: '3px solid #ef4444', borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{p.descricao_produto}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>CD: {p.cd_produto}</span>
                      {p.ean && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>EAN: {p.ean}</span>}
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Estoque: <strong>{p.estoque_qty ?? '—'}</strong></span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Última NF: {p.data_ultima_nf ? new Date(p.data_ultima_nf).toLocaleDateString('pt-BR') : '—'}</span>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
                        background: p.produto_status === 'Ativo' ? '#10b98120' : '#f59e0b20',
                        color: p.produto_status === 'Ativo' ? '#10b981' : '#f59e0b',
                      }}>{p.produto_status}</span>
                      {p.motivo_suspencao > 0 && (
                        <span style={{ fontSize: 11, color: '#f59e0b' }}>Susp: {MOTIVO_LABEL[p.motivo_suspencao]}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Lista de expostos */}
          {expostos.length > 0 && (
            <>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10, color: '#10b981', display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={16} /> Expostos ({expostos.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {expostos.map(p => (
                  <div key={p.cd_produto} style={{ background: 'var(--surface)', border: '1px solid #10b98130', borderLeft: '3px solid #10b981', borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{p.descricao_produto}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>CD: {p.cd_produto}</span>
                      {p.ean && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>EAN: {p.ean}</span>}
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Estoque: <strong>{p.estoque_qty ?? '—'}</strong></span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Última NF: {p.data_ultima_nf ? new Date(p.data_ultima_nf).toLocaleDateString('pt-BR') : '—'}</span>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
                        background: p.produto_status === 'Ativo' ? '#10b98120' : '#f59e0b20',
                        color: p.produto_status === 'Ativo' ? '#10b981' : '#f59e0b',
                      }}>{p.produto_status}</span>
                      {p.motivo_suspencao > 0 && (
                        <span style={{ fontSize: 11, color: '#f59e0b' }}>Susp: {MOTIVO_LABEL[p.motivo_suspencao]}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── Componente raiz ────────────────────────────────────────────────────────
export default function ConferenciaSecao({ userId, profile }) {
  const [tela, setTela] = useState('lista'); // lista | nova | coleta | relatorio
  const [sessaoAtual, setSessaoAtual] = useState(null);
  const [itensFinalizados, setItensFinalizados] = useState([]);

  const abrirColeta = (sessao) => {
    setSessaoAtual(sessao);
    setTela(sessao.status === 'finalizada' ? 'relatorio_view' : 'coleta');
  };

  const abrirRelatorio = (itens) => {
    setItensFinalizados(itens);
    setTela('relatorio');
  };

  if (tela === 'nova') return (
    <NovaSessao
      userId={userId}
      profile={profile}
      onCriar={(s) => { setSessaoAtual(s); setTela('coleta'); }}
      onVoltar={() => setTela('lista')}
    />
  );

  if (tela === 'coleta' && sessaoAtual) return (
    <Coleta
      userId={userId}
      profile={profile}
      sessao={sessaoAtual}
      onFinalizar={abrirRelatorio}
      onVoltar={() => setTela('lista')}
    />
  );

  if (tela === 'relatorio' && sessaoAtual) return (
    <Relatorio
      userId={userId}
      profile={profile}
      sessao={sessaoAtual}
      itensColetados={itensFinalizados}
      onVoltar={() => setTela('lista')}
    />
  );

  if (tela === 'relatorio_view' && sessaoAtual) return (
    <RelatorioView
      userId={userId}
      profile={profile}
      sessao={sessaoAtual}
      onVoltar={() => setTela('lista')}
    />
  );

  return (
    <ListaSessoes
      userId={userId}
      profile={profile}
      onNova={() => setTela('nova')}
      onAbrir={abrirColeta}
    />
  );
}

// ── Tela: visualizar relatório de sessão já finalizada ─────────────────────
function RelatorioView({ userId, profile, sessao, onVoltar }) {
  const toast = useToast();
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/conferencia/sessoes/${sessao.id}/itens`)
      .then(r => setItens(r.data))
      .catch(() => toast('Erro ao carregar itens', 'error'))
      .finally(() => setLoading(false));
  }, [sessao.id]);

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Carregando...</div>;

  return <Relatorio userId={userId} profile={profile} sessao={sessao} itensColetados={itens} onVoltar={onVoltar} />;
}
