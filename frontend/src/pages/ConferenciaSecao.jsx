import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Trash2, Camera, Hash, Barcode, ChevronRight, CheckCircle2,
         AlertCircle, Clock, Package, FileText, ArrowLeft, Upload, X, Search } from 'lucide-react';
import api from '../api';
import { useToast } from '../components/Toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const MOTIVO_LABEL = { 0: '—', 1: 'Ruptura', 2: 'Sazonal', 3: 'Substituído', 4: 'Descontinuado' };

// ── Tela: lista de sessões ──────────────────────────────────────────────────
function ListaSessoes({ userId, profile, onNova, onAbrir }) {
  const toast = useToast();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/conferencia/sessoes?requester_id=${userId}`)
      .then(r => setList(r.data))
      .catch(() => toast('Erro ao carregar conferências', 'error'))
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => { load(); }, [load]);

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

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Conferência de Seção</div>
          <div className="page-subtitle">{list.length} conferência{list.length !== 1 ? 's' : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {canImport && <ImportarBtn userId={userId} onDone={() => toast('Base atualizada!')} />}
          <button className="btn btn-primary" onClick={onNova}>
            <Plus size={15} /> Nova
          </button>
        </div>
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
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{s.linha || s.secao || 'Conferência'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {[s.setor, s.departamento, s.secao].filter(Boolean).join(' › ')}
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
function ImportarBtn({ userId, onDone }) {
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
      await api.post('/conferencia/importar', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 });
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
      <button className="btn btn-ghost" onClick={() => ref.current.click()} disabled={loading}>
        <Upload size={15} /> {loading ? 'Importando...' : 'Importar base'}
      </button>
    </>
  );
}

// ── Tela: nova conferência (seletores em cascata) ──────────────────────────
function NovaSessao({ userId, onCriar, onVoltar }) {
  const toast = useToast();
  const [opts, setOpts] = useState({ setores: [], departamentos: [], secoes: [], linhas: [] });
  const [sel, setSel] = useState({ setor: '', departamento: '', secao: '', linha: '' });
  const [saving, setSaving] = useState(false);

  const loadFiltros = useCallback(async (params = {}) => {
    const q = new URLSearchParams({ requester_id: userId, ...params }).toString();
    try {
      const r = await api.get(`/conferencia/filtros?${q}`);
      setOpts(o => ({ ...o, ...r.data }));
    } catch { toast('Erro ao carregar filtros', 'error'); }
  }, [userId]);

  useEffect(() => { loadFiltros(); }, [loadFiltros]);

  const change = async (field, value) => {
    let next = { ...sel, [field]: value };
    if (field === 'setor')        next = { setor: value, departamento: '', secao: '', linha: '' };
    if (field === 'departamento') next = { ...next, departamento: value, secao: '', linha: '' };
    if (field === 'secao')        next = { ...next, secao: value, linha: '' };
    if (field === 'linha')        next = { ...next, linha: value };
    setSel(next);
    const params = { requester_id: userId };
    if (next.setor)        params.setor        = next.setor;
    if (next.departamento) params.departamento = next.departamento;
    if (next.secao)        params.secao        = next.secao;
    const r = await api.get(`/conferencia/filtros?${new URLSearchParams(params).toString()}`);
    setOpts(o => ({ ...o, ...r.data }));
  };

  const criar = async () => {
    if (!sel.setor || !sel.departamento || !sel.secao || !sel.linha) {
      return toast('Selecione todos os 4 níveis');
    }
    setSaving(true);
    try {
      const r = await api.post('/conferencia/sessoes', { requester_id: userId, ...sel });
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
        <Select label="4. Linha (Fine Line)" field="linha" options={opts.linhas} disabled={!sel.secao} />

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

// ── Tela: coleta de itens ───────────────────────────────────────────────────
function Coleta({ userId, sessao, onFinalizar, onVoltar }) {
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
      const r = await api.get(`/conferencia/buscar?requester_id=${userId}&q=${encodeURIComponent(cod)}`);
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
  }, [itens, sessao.id, userId]);

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
            <div className="page-title" style={{ fontSize: 16 }}>{sessao.linha}</div>
            <div className="page-subtitle">{sessao.secao} · {sessao.departamento}</div>
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
function Relatorio({ userId, sessao, itensColetados, onVoltar }) {
  const toast = useToast();
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = new URLSearchParams({
      requester_id: userId,
      setor:        sessao.setor        || '',
      departamento: sessao.departamento || '',
      secao:        sessao.secao        || '',
      linha:        sessao.linha        || '',
    }).toString();
    api.get(`/conferencia/linha?${q}`)
      .then(r => setTodos(r.data))
      .catch(() => toast('Erro ao carregar produtos da linha', 'error'))
      .finally(() => setLoading(false));
  }, [sessao, userId]);

  const coletadosCDs = new Set(itensColetados.map(i => i.cd_produto));
  const coletadosEANs = new Set(itensColetados.map(i => i.ean).filter(Boolean));
  const naoExpostos = todos.filter(p => !coletadosCDs.has(p.cd_produto) && !coletadosEANs.has(p.ean));
  const expostos = todos.filter(p => coletadosCDs.has(p.cd_produto) || coletadosEANs.has(p.ean));

  const gerarPDF = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    doc.setFontSize(14); doc.setFont(undefined, 'bold');
    doc.text('Relatório de Conferência de Seção', 14, 18);
    doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(100);
    doc.text(`Gerado em: ${agora}`, 14, 25);
    doc.text(`Linha: ${sessao.linha}  ·  Seção: ${sessao.secao}  ·  Dept: ${sessao.departamento}`, 14, 30);

    // Resumo
    doc.setFontSize(10); doc.setFont(undefined, 'bold'); doc.setTextColor(0);
    doc.text(`Total na linha: ${todos.length}   Coletados: ${expostos.length}   Não expostos: ${naoExpostos.length}`, 14, 38);

    // Tabela não expostos
    if (naoExpostos.length > 0) {
      doc.setFontSize(11); doc.setFont(undefined, 'bold'); doc.setTextColor(0);
      doc.text('Itens NÃO expostos', 14, 47);
      autoTable(doc, {
        startY: 51,
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

    doc.save(`conferencia_${sessao.linha?.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const pct = todos.length ? Math.round((expostos.length / todos.length) * 100) : 0;

  return (
    <div>
      <div className="page-header">
        <button className="btn btn-ghost" onClick={onVoltar}><ArrowLeft size={15} /> Voltar</button>
        <div className="page-title" style={{ marginTop: 8 }}>Relatório — {sessao.linha}</div>
        <button className="btn btn-primary" onClick={gerarPDF}>
          <FileText size={15} /> Exportar PDF
        </button>
      </div>

      {loading && <div style={{ color: 'var(--text-muted)', padding: 32, textAlign: 'center' }}>Carregando...</div>}

      {!loading && (
        <>
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
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Estoque: <strong>{p.estoque_qty ?? '—'}</strong></span>
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
      onCriar={(s) => { setSessaoAtual(s); setTela('coleta'); }}
      onVoltar={() => setTela('lista')}
    />
  );

  if (tela === 'coleta' && sessaoAtual) return (
    <Coleta
      userId={userId}
      sessao={sessaoAtual}
      onFinalizar={abrirRelatorio}
      onVoltar={() => setTela('lista')}
    />
  );

  if (tela === 'relatorio' && sessaoAtual) return (
    <Relatorio
      userId={userId}
      sessao={sessaoAtual}
      itensColetados={itensFinalizados}
      onVoltar={() => setTela('lista')}
    />
  );

  if (tela === 'relatorio_view' && sessaoAtual) return (
    <RelatorioView
      userId={userId}
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
function RelatorioView({ userId, sessao, onVoltar }) {
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

  return <Relatorio userId={userId} sessao={sessao} itensColetados={itens} onVoltar={onVoltar} />;
}
