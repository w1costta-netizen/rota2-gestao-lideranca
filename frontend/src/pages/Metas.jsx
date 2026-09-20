import React, { useEffect, useMemo, useState } from 'react';
import { Target, Plus, Trash2, X, ChevronLeft, LayoutGrid } from 'lucide-react';
import api from '../api';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';

// ─────────────────────────────────────────────────────────────
// Metas com número — da loja ou de um plano de ação.
//
// Portado do protótipo aprovado (prototipos/monitoramento-metas.html).
// Uma meta tem até três medidas (quantidade, R$, %) lado a lado; o
// lançamento traz os números juntos, por data; o gráfico é escolhido
// sozinho (mensal ou poucos pontos → barras; senão → linha com tendência).
// O servidor guarda; o cálculo é todo aqui, em analisar().
// ─────────────────────────────────────────────────────────────

const MEDIDAS = {
  quantidade: { nome: 'Quantidade', curto: 'Qtd', ex: 'Ex.: 1.200 unidades, 14 faltas, 300 itens', fmt: v => Math.round(v).toLocaleString('pt-BR'), passo: 1, ph: ['ex.: 9800', 'ex.: 12000'] },
  reais:      { nome: 'Valor em R$', curto: 'R$', ex: 'Ex.: R$ 450.000 de venda, R$ 8.000 de perda', fmt: v => 'R$ ' + Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 }), passo: 0.01, ph: ['ex.: 380000', 'ex.: 450000'] },
  percentual: { nome: 'Percentual (%)', curto: '%', ex: 'Ex.: 5% de ruptura, 100% da meta', fmt: v => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%', passo: 0.1, ph: ['ex.: 12', 'ex.: 5'] },
};
const ORDEM = ['quantidade', 'reais', 'percentual'];
const FREQ = { diario: 'todo dia', semanal: 'toda semana', mensal: 'todo mês' };
const COR = { verde: '#16a34a', amarelo: '#d97706', vermelho: '#dc2626', azul: '#2563eb' };

const hoje = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const br = iso => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');
const dias = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 864e5);
const medidasDe = m => ORDEM.filter(k => m.medidas?.[k]);

// ── Cálculo de uma medida ────────────────────────────────────
function analisar(m, k) {
  const T = MEDIDAS[k], cfg = m.medidas[k];
  const ms = (m.lancamentos || []).filter(l => l.valores?.[k] != null).map(l => [String(l.data).slice(0, 10), Number(l.valores[k])]).sort((a, b) => a[0].localeCompare(b[0]));
  const atual = ms.length ? ms[ms.length - 1][1] : cfg.inicial;
  const dataAtual = ms.length ? ms[ms.length - 1][0] : null;
  const percurso = cfg.meta - cfg.inicial, andado = atual - cfg.inicial;
  const pct = percurso === 0 ? 100 : Math.max(0, Math.min(120, andado / percurso * 100));
  const atingiu = m.direcao === 'reduzir' ? atual <= cfg.meta : atual >= cfg.meta;
  const restam = dias(hoje(), m.prazo);
  // Tendência: reta pelos pontos, projetada até o prazo.
  let projecao = null, chega = null;
  if (ms.length >= 2) {
    const x = ms.map(p => dias(ms[0][0], p[0])), y = ms.map(p => p[1]);
    const n = x.length, mx = x.reduce((a, b) => a + b) / n, my = y.reduce((a, b) => a + b) / n;
    const b = x.reduce((s, xi, j) => s + (xi - mx) * (y[j] - my), 0) / (x.reduce((s, xi) => s + (xi - mx) ** 2, 0) || 1);
    projecao = my + b * (dias(ms[0][0], m.prazo) - mx);
    chega = m.direcao === 'reduzir' ? projecao <= cfg.meta : projecao >= cfg.meta;
  }
  const cor = atingiu ? COR.verde : pct >= 60 ? COR.azul : pct >= 30 ? COR.amarelo : COR.vermelho;
  const frase = atingiu ? `Meta atingida: ${T.fmt(atual)} contra ${T.fmt(cfg.meta)}.`
    : ms.length < 2 ? 'Ainda sem tendência — lance pelo menos 2 vezes.'
    : restam < 0 ? `Prazo vencido há ${-restam} dias; ficou em ${T.fmt(atual)} (${Math.round(pct)}% do caminho).`
    : chega ? `No ritmo atual chega em ${T.fmt(projecao)} no prazo — a meta é ${T.fmt(cfg.meta)}. Continue.`
    : `No ritmo atual chegaria em ${T.fmt(projecao)}, e a meta é ${T.fmt(cfg.meta)}. Precisa acelerar: faltam ${restam} dias.`;
  return { k, T, cfg, ms, atual, dataAtual, pct, atingiu, restam, projecao, chega, cor, frase };
}
// A medida de menor progresso é a que segura o resultado; a meta só é
// "atingida" quando todas batem.
function resumo(m) {
  const as = medidasDe(m).map(k => analisar(m, k));
  const pior = as.reduce((p, a) => (a.pct < p.pct ? a : p), as[0]);
  return { as, pct: as.length ? Math.round(as.reduce((s, a) => s + a.pct, 0) / as.length) : 0, atingiu: as.length > 0 && as.every(a => a.atingiu), cor: pior?.cor || COR.vermelho, pior };
}
const graficoAutomatico = (m, a) => (m.frequencia === 'mensal' || a.ms.length <= 3 ? 'barras' : 'linha');

// ── Gráficos em SVG (sem biblioteca, como o resto do app) ────
function Linha({ m, a, mini }) {
  const W = 640, H = mini ? 120 : 220, P = mini ? { l: 44, r: 8, t: 8, b: 18 } : { l: 56, r: 16, t: 14, b: 30 };
  const pts = a.ms; if (!pts.length) return <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Sem lançamentos.</div>;
  const ys = [...pts.map(p => p[1]), a.cfg.meta, a.cfg.inicial];
  let y0 = Math.min(...ys), y1 = Math.max(...ys); const pad = (y1 - y0 || 1) * .15; y0 -= pad; y1 += pad;
  const x0 = pts[0][0], x1 = pts[pts.length - 1][0] > m.prazo ? pts[pts.length - 1][0] : m.prazo;
  const sx = d => P.l + dias(x0, d) / (dias(x0, x1) || 1) * (W - P.l - P.r);
  const sy = v => P.t + (1 - (v - y0) / (y1 - y0)) * (H - P.t - P.b);
  const cam = pts.map((p, i) => (i ? 'L' : 'M') + sx(p[0]).toFixed(1) + ' ' + sy(p[1]).toFixed(1)).join(' ');
  const grade = mini ? [0, 1] : [0, .25, .5, .75, 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxHeight: mini ? 140 : 260, display: 'block' }}>
      {grade.map(f => { const v = y0 + f * (y1 - y0); return <g key={f}><line x1={P.l} x2={W - P.r} y1={sy(v)} y2={sy(v)} stroke="var(--border)"/><text x={P.l - 5} y={sy(v) + 4} fontSize={mini ? 9 : 10} fill="var(--text-muted)" textAnchor="end">{a.T.fmt(v)}</text></g>; })}
      <line x1={P.l} x2={W - P.r} y1={sy(a.cfg.meta)} y2={sy(a.cfg.meta)} stroke={COR.verde} strokeWidth="1.5" strokeDasharray="6 3"/>
      <text x={W - P.r} y={sy(a.cfg.meta) - 4} fontSize="10" fill={COR.verde} textAnchor="end">meta {a.T.fmt(a.cfg.meta)}</text>
      {a.projecao != null && a.restam > 0 && (
        <line x1={sx(pts[pts.length - 1][0])} y1={sy(pts[pts.length - 1][1])} x2={sx(m.prazo)} y2={sy(Math.max(y0, Math.min(y1, a.projecao)))} stroke={a.chega ? COR.verde : COR.vermelho} strokeDasharray="4 4" strokeWidth="1.5"/>
      )}
      <path d={cam} fill="none" stroke="var(--primary)" strokeWidth="2.5"/>
      {pts.map(p => <circle key={p[0]} cx={sx(p[0])} cy={sy(p[1])} r={mini ? 3 : 4} fill="var(--primary)"><title>{br(p[0])}: {a.T.fmt(p[1])}</title></circle>)}
      <text x={sx(x0)} y={H - 6} fontSize="10" fill="var(--text-muted)">{br(x0)}</text>
      <text x={sx(m.prazo)} y={H - 6} fontSize="10" fill="var(--text-muted)" textAnchor="end">prazo {br(m.prazo)}</text>
    </svg>
  );
}
function Barras({ m, a, mini }) {
  const W = 640, H = mini ? 120 : 220, P = mini ? { l: 44, r: 8, t: 14, b: 18 } : { l: 56, r: 16, t: 18, b: 30 };
  const pts = a.ms.slice(-12); if (!pts.length) return <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Sem lançamentos.</div>;
  const y1 = Math.max(...pts.map(p => p[1]), a.cfg.meta, 0) * 1.12 || 1, y0 = 0;
  const sy = v => P.t + (1 - (v - y0) / (y1 - y0)) * (H - P.t - P.b);
  const bw = (W - P.l - P.r) / pts.length;
  const rot = d => (m.frequencia === 'mensal' ? new Date(d + 'T12:00:00Z').toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }) : br(d).slice(0, 5));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxHeight: mini ? 140 : 260, display: 'block' }}>
      {[0, 1].map(f => { const v = y0 + f * (y1 - y0); return <g key={f}><line x1={P.l} x2={W - P.r} y1={sy(v)} y2={sy(v)} stroke="var(--border)"/><text x={P.l - 5} y={sy(v) + 4} fontSize={mini ? 9 : 10} fill="var(--text-muted)" textAnchor="end">{a.T.fmt(v)}</text></g>; })}
      {pts.map((p, i) => { const ok = m.direcao === 'reduzir' ? p[1] <= a.cfg.meta : p[1] >= a.cfg.meta; const x = P.l + i * bw + bw * .18; return (
        <g key={p[0]}>
          <rect x={x} y={sy(Math.max(0, p[1]))} width={bw * .64} height={Math.max(0, sy(0) - sy(Math.max(0, p[1])))} rx="4" fill={ok ? COR.verde : 'var(--primary)'}><title>{br(p[0])}: {a.T.fmt(p[1])}</title></rect>
          {!mini && <text x={x + bw * .32} y={sy(Math.max(0, p[1])) - 4} fontSize="10" textAnchor="middle" fill="var(--text)">{a.T.fmt(p[1])}</text>}
          <text x={x + bw * .32} y={H - 6} fontSize="10" textAnchor="middle" fill="var(--text-muted)">{rot(p[0])}</text>
        </g>); })}
      <line x1={P.l} x2={W - P.r} y1={sy(a.cfg.meta)} y2={sy(a.cfg.meta)} stroke={COR.verde} strokeWidth="1.5" strokeDasharray="6 3"/>
      <text x={W - P.r} y={sy(a.cfg.meta) - 4} fontSize="10" fill={COR.verde} textAnchor="end">meta {a.T.fmt(a.cfg.meta)}</text>
    </svg>
  );
}
function Progresso({ a, compacto }) {
  return (
    <div>
      {!compacto && (
        <div style={{ margin: '6px 0 2px', display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--text-muted)' }}>
          <span>Começou em <b style={{ color: 'var(--text)' }}>{a.T.fmt(a.cfg.inicial)}</b></span><span>Quer chegar em <b style={{ color: 'var(--text)' }}>{a.T.fmt(a.cfg.meta)}</b></span>
        </div>
      )}
      <div style={{ height: compacto ? 7 : 10, borderRadius: 99, background: 'var(--surface-2)', overflow: 'hidden', marginTop: compacto ? 4 : 0 }}>
        <div style={{ width: `${Math.min(100, a.pct)}%`, height: '100%', background: a.cor, borderRadius: 99, transition: 'width .4s' }}/>
      </div>
      {!compacto && <div style={{ fontSize: 12, marginTop: 5 }}>Hoje está em <b>{a.T.fmt(a.atual)}</b> — já andou <b style={{ color: a.cor }}>{Math.round(a.pct)}%</b> do caminho até a meta</div>}
    </div>
  );
}
function Grafico({ m, a, mini }) {
  const t = m.grafico === 'auto' ? graficoAutomatico(m, a) : m.grafico;
  if (t === 'linha') return <Linha m={m} a={a} mini={mini}/>;
  if (t === 'barras') return <Barras m={m} a={a} mini={mini}/>;
  return <Progresso a={a}/>;
}
const Selo = ({ cor, children }) => <span style={{ fontSize: 11, fontWeight: 700, color: cor, background: `${cor}1f`, borderRadius: 99, padding: '3px 9px', whiteSpace: 'nowrap' }}>{children}</span>;
const Rotulo = ({ children }) => <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: .3, margin: '10px 0 4px' }}>{children}</label>;
const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13.5 };

export default function Metas({ userId, profile }) {
  const toast = useToast();
  const company = profile?.company || '';
  const q = `requester_id=${userId}${company ? `&company=${encodeURIComponent(company)}` : ''}`;

  const [dados, setDados] = useState({ metas: [], planos: [], podeGerir: false });
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState('todas');
  const [abertaId, setAbertaId] = useState(null);
  const [medida, setMedida] = useState(null);
  const [modal, setModal] = useState(null);        // 'nova' | 'lancar'
  const [nova, setNova] = useState(null);
  const [lanc, setLanc] = useState({ data: hoje(), valores: {} });
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    try { const r = await api.get(`/metas?${q}`); setDados(r.data); }
    catch { toast('Não foi possível carregar as metas.', 'error'); }
    setCarregando(false);
  };
  useEffect(() => { if (userId) carregar(); }, [userId, company]);

  const planoDe = id => dados.planos.find(p => p.id === id);
  const aberta = dados.metas.find(m => m.id === abertaId) || null;
  const lista = useMemo(() => dados.metas.filter(m => filtro === 'todas' ? true : filtro === 'livres' ? !m.plano_id : m.plano_id === filtro), [dados.metas, filtro]);

  // ── Ações ──────────────────────────────────────────────────
  const abrirNova = () => {
    setNova({ nome: '', direcao: 'aumentar', prazo: '', frequencia: 'mensal', plano_id: dados.planos.some(p => p.id === filtro) ? filtro : '',
              usa: { quantidade: false, reais: true, percentual: false }, val: { quantidade: { inicial: '', meta: '' }, reais: { inicial: '', meta: '' }, percentual: { inicial: '', meta: '' } } });
    setModal('nova');
  };
  const salvarNova = async () => {
    const ks = ORDEM.filter(k => nova.usa[k]);
    if (!nova.nome.trim()) return toast('Diga o que você quer acompanhar (passo 1).', 'error');
    if (!ks.length) return toast('Marque pelo menos uma forma de medir (passo 3).', 'error');
    if (ks.some(k => nova.val[k].inicial === '' || nova.val[k].meta === '')) return toast('Em cada medida marcada, preencha "hoje está em" e "quer chegar em".', 'error');
    if (!nova.prazo) return toast('Informe até quando (passo 4).', 'error');
    const medidas = {}; ks.forEach(k => { medidas[k] = { inicial: Number(nova.val[k].inicial), meta: Number(nova.val[k].meta) }; });
    setSalvando(true);
    try {
      await api.post('/metas', { requester_id: userId, company: company || undefined, nome: nova.nome, direcao: nova.direcao, prazo: nova.prazo, frequencia: nova.frequencia, medidas, plano_id: nova.plano_id || null });
      setModal(null); toast('Meta criada.'); carregar();
    } catch (e) { toast(e?.response?.data?.error || 'Não foi possível criar.', 'error'); }
    setSalvando(false);
  };
  const salvarLanc = async () => {
    const ks = medidasDe(aberta);
    const valores = {}; ks.forEach(k => { if (lanc.valores[k] !== '' && lanc.valores[k] != null) valores[k] = Number(lanc.valores[k]); });
    if (!lanc.data) return toast('Informe a data.', 'error');
    if (!Object.keys(valores).length) return toast('Informe pelo menos um número.', 'error');
    setSalvando(true);
    try {
      await api.post(`/metas/${aberta.id}/lancamentos`, { requester_id: userId, company: company || undefined, data: lanc.data, valores });
      setModal(null); setLanc({ data: hoje(), valores: {} }); toast('Lançado.'); carregar();
    } catch (e) { toast(e?.response?.data?.error || 'Não foi possível lançar.', 'error'); }
    setSalvando(false);
  };
  const apagarLanc = async (data) => {
    if (!window.confirm('Apagar este lançamento?')) return;
    try { await api.delete(`/metas/${aberta.id}/lancamentos/${data}?${q}`); carregar(); }
    catch (e) { toast(e?.response?.data?.error || 'Não foi possível apagar.', 'error'); }
  };
  const apagarMeta = async (m) => {
    if (!window.confirm(`Apagar a meta "${m.nome}"? Ela some da lista.`)) return;
    try { await api.delete(`/metas/${m.id}?${q}`); setAbertaId(null); toast('Meta apagada.'); carregar(); }
    catch (e) { toast(e?.response?.data?.error || 'Não foi possível apagar.', 'error'); }
  };
  const setGrafico = async (g) => {
    // Otimista: é preferência de leitura, não precisa esperar o servidor.
    setDados(d => ({ ...d, metas: d.metas.map(m => m.id === aberta.id ? { ...m, grafico: g } : m) }));
    try { await api.put(`/metas/${aberta.id}`, { requester_id: userId, company: company || undefined, grafico: g }); } catch { /* fica só na tela */ }
  };

  const cabecalho = (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 9 }}><Target size={20} style={{ color: 'var(--primary)' }}/> Metas</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 2 }}>Metas com número, da loja e dos planos de ação — lance o resultado e acompanhe no gráfico.</p>
      </div>
      {dados.podeGerir && !aberta && <button className="btn btn-primary" onClick={abrirNova}><Plus size={15}/> Nova meta</button>}
    </div>
  );

  // ── Tela da meta ────────────────────────────────────────────
  if (aberta) {
    const r = resumo(aberta); const pl = planoDe(aberta.plano_id);
    const foco = medida && aberta.medidas[medida] ? analisar(aberta, medida) : null;
    const tipoAtual = foco ? (aberta.grafico === 'auto' ? graficoAutomatico(aberta, foco) : aberta.grafico) : null;
    const ks = medidasDe(aberta);
    const lancs = [...(aberta.lancamentos || [])].sort((a, b) => String(b.data).localeCompare(String(a.data)));
    return (
      <div>
        {cabecalho}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}><button className="btn btn-sm" onClick={() => { setAbertaId(null); setMedida(null); }}><ChevronLeft size={14}/> Metas</button></div>

        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{aberta.nome}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                {aberta.direcao === 'reduzir' ? 'Reduzir' : 'Aumentar'} · prazo {br(aberta.prazo)} · lança {FREQ[aberta.frequencia]}{pl ? ` · 🎯 ${pl.titulo}` : ' · meta da loja (sem plano)'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Selo cor={r.cor}>{r.atingiu ? 'Meta atingida' : `${r.pct}% do caminho`}</Selo>
              <button className="btn btn-primary btn-sm" onClick={() => { setLanc({ data: hoje(), valores: {} }); setModal('lancar'); }}><Plus size={14}/> Lançar</button>
              {dados.podeGerir && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => apagarMeta(aberta)}><Trash2 size={14}/></button>}
            </div>
          </div>
          {r.pior && (
            <div style={{ marginTop: 10, background: 'rgba(232,98,42,.08)', border: '1px solid rgba(232,98,42,.2)', borderRadius: 10, padding: '8px 12px', fontSize: 12.5, lineHeight: 1.55 }}>
              {r.atingiu ? 'Todas as medidas bateram a meta. 🎉' : <><b>{r.pior.T.nome}</b> é o que mais segura o resultado: {r.pior.frase}</>}
            </div>
          )}
        </div>

        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <h3 style={{ fontWeight: 700, fontSize: 14, margin: 0 }}>{foco ? foco.T.nome : 'Painel — as medidas lado a lado'}</h3>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {foco && <button className="btn btn-sm" onClick={() => setMedida(null)}><LayoutGrid size={13}/> Ver painel</button>}
              {[['auto', 'Automático'], ['linha', 'Linha'], ['barras', 'Barras'], ['progresso', 'Progresso']].map(([g, t]) => (
                <button key={g} onClick={() => setGrafico(g)}
                  style={{ padding: '4px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                           border: `1px solid ${aberta.grafico === g ? 'var(--primary)' : 'var(--border)'}`,
                           background: aberta.grafico === g ? 'var(--primary)' : 'transparent',
                           color: aberta.grafico === g ? '#fff' : 'var(--text-muted)' }}>{t}</button>
              ))}
            </div>
          </div>
          {foco ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 8 }}>
                {[['Atual', foco.T.fmt(foco.atual), foco.dataAtual ? br(foco.dataAtual) : 'partida', foco.cor],
                  ['Meta', foco.T.fmt(foco.cfg.meta), `até ${br(aberta.prazo)}`, null],
                  ['Do caminho', `${Math.round(foco.pct)}%`, `saiu de ${foco.T.fmt(foco.cfg.inicial)}`, foco.cor],
                  ['Prazo', foco.restam >= 0 ? `${foco.restam}d` : 'vencido', foco.restam >= 0 ? 'restantes' : `${-foco.restam} dias atrás`, null]].map(([r1, v, s, c]) => (
                  <div key={r1} style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>{r1}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: c || 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{s}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.55 }}>{foco.frase}</div>
              <Grafico m={aberta} a={foco}/>
              {tipoAtual !== 'progresso' && <Progresso a={foco}/>}
            </>
          ) : (
            <>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 8 }}>Cada quadro é uma forma de medir a mesma meta. Toque num quadro para ver o gráfico grande e se, no ritmo atual, chega no prazo.</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
                {r.as.map(a => (
                  <div key={a.k} onClick={() => setMedida(a.k)} style={{ background: 'var(--surface-2)', borderRadius: 12, padding: 12, cursor: 'pointer', border: '1.5px solid transparent' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>{a.T.nome}</span>
                      <Selo cor={a.cor}>{Math.round(a.pct)}%</Selo>
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: a.cor, margin: '2px 0 4px', fontVariantNumeric: 'tabular-nums' }}>{a.T.fmt(a.atual)} <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>/ {a.T.fmt(a.cfg.meta)}</span></div>
                    <Grafico m={aberta} a={a} mini/>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="card">
          <h3 style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Lançamentos</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr>
                {['Data', ...ks.map(k => MEDIDAS[k].curto), 'Quem', ''].map((h, i) => <th key={i} style={{ textAlign: i > 0 && i <= ks.length ? 'right' : 'left', padding: '7px 8px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {lancs.map(l => (
                  <tr key={l.data}>
                    <td style={{ padding: '7px 8px', borderBottom: '1px solid var(--border)' }}>{br(l.data)}</td>
                    {ks.map(k => <td key={k} style={{ padding: '7px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{l.valores?.[k] != null ? MEDIDAS[k].fmt(l.valores[k]) : '—'}</td>)}
                    <td style={{ padding: '7px 8px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)' }}>{l.quem?.full_name?.split(' ')[0] || '—'}</td>
                    <td style={{ padding: '7px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>
                      {(dados.podeGerir || l.lancado_por === userId) && <button className="btn-icon" onClick={() => apagarLanc(String(l.data).slice(0, 10))} title="Apagar"><X size={13}/></button>}
                    </td>
                  </tr>
                ))}
                {!lancs.length && <tr><td colSpan={ks.length + 3} style={{ padding: 14, color: 'var(--text-muted)', fontSize: 12.5 }}>Nenhum lançamento. Clique em "Lançar".</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <Modal open={modal === 'lancar'} onClose={() => setModal(null)} title={`Lançar número — ${aberta.nome}`}
          footer={<><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancelar</button><button className="btn btn-primary" onClick={salvarLanc} disabled={salvando}>{salvando ? 'Lançando...' : 'Lançar'}</button></>}>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.55 }}>Informe a data e como ficou o número nesse dia/semana/mês. Se lançar duas vezes na mesma data, vale o último.</p>
          <Rotulo>Data do lançamento</Rotulo>
          <input type="date" style={inputStyle} value={lanc.data} onChange={e => setLanc(l => ({ ...l, data: e.target.value }))}/>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            {ks.map(k => (
              <div key={k}>
                <Rotulo>{MEDIDAS[k].nome} — como ficou</Rotulo>
                <input type="number" step={MEDIDAS[k].passo} style={inputStyle} value={lanc.valores[k] ?? ''} placeholder={`a meta é ${MEDIDAS[k].fmt(aberta.medidas[k].meta)}`}
                  onChange={e => setLanc(l => ({ ...l, valores: { ...l.valores, [k]: e.target.value } }))}/>
              </div>
            ))}
          </div>
        </Modal>
      </div>
    );
  }

  // ── Lista ───────────────────────────────────────────────────
  const atingidas = dados.metas.filter(m => resumo(m).atingiu).length;
  const planoFiltrado = dados.planos.find(p => p.id === filtro);
  return (
    <div>
      {cabecalho}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 8 }}>
          {dados.metas.length} meta(s) · {atingidas} atingida(s). Aqui ficam as metas com número: as da loja e as de cada plano de ação. Todo plano do PDCA aparece nos filtros.
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[['todas', `Todas (${dados.metas.length})`], ['livres', `Da loja (${dados.metas.filter(m => !m.plano_id).length})`],
            ...dados.planos.map(p => [p.id, `🎯 ${p.titulo} (${dados.metas.filter(m => m.plano_id === p.id).length})`])].map(([id, t]) => (
            <button key={id} onClick={() => setFiltro(id)}
              style={{ padding: '5px 11px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                       border: `1px solid ${filtro === id ? 'var(--primary)' : 'var(--border)'}`,
                       background: filtro === id ? 'var(--primary)' : 'transparent', color: filtro === id ? '#fff' : 'var(--text-muted)' }}>{t}</button>
          ))}
        </div>
      </div>

      {carregando ? <div className="card" style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>Carregando...</div>
      : lista.length === 0 ? (
        <div className="card">
          {planoFiltrado ? (
            <>
              <b>Este plano de ação ainda não tem meta com número.</b>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4 }}>A meta escrita no plano ("{planoFiltrado.meta || 'sem texto'}") é só texto. Crie a meta com número para acompanhar no gráfico.</div>
              {dados.podeGerir && <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={abrirNova}><Plus size={14}/> Criar a primeira meta deste plano</button>}
            </>
          ) : <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nenhuma meta aqui ainda.{dados.podeGerir ? ' Clique em "Nova meta".' : ''}</span>}
        </div>
      ) : lista.map(m => {
        const r = resumo(m); const p = planoDe(m.plano_id);
        return (
          <div key={m.id} className="card" onClick={() => { setAbertaId(m.id); setMedida(null); }}
            style={{ cursor: 'pointer', borderLeft: `4px solid ${r.cor}`, borderRadius: '0 12px 12px 0', marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <b style={{ fontSize: 14 }}>{m.nome}</b><Selo cor={r.cor}>{r.atingiu ? 'Meta atingida' : `${r.pct}% do caminho`}</Selo>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.direcao === 'reduzir' ? 'Reduzir' : 'Aumentar'} · até {br(m.prazo)} · lança {FREQ[m.frequencia]}{p ? ` · 🎯 ${p.titulo}` : ''}</div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${r.as.length || 1}, 1fr)`, gap: 10, marginTop: 8 }}>
              {r.as.map(a => (
                <div key={a.k}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>{a.T.curto} · <b style={{ color: a.cor }}>{a.T.fmt(a.atual)}</b> <span style={{ fontWeight: 400 }}>/ {a.T.fmt(a.cfg.meta)}</span></div>
                  <Progresso a={a} compacto/>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <Modal open={modal === 'nova'} onClose={() => setModal(null)} title="Nova meta"
        footer={<><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancelar</button><button className="btn btn-primary" onClick={salvarNova} disabled={salvando}>{salvando ? 'Criando...' : 'Criar meta'}</button></>}>
        {nova && (() => {
          const ks = ORDEM.filter(k => nova.usa[k]);
          const set = (patch) => setNova(n => ({ ...n, ...patch }));
          const setVal = (k, campo, v) => setNova(n => ({ ...n, val: { ...n.val, [k]: { ...n.val[k], [campo]: v } } }));
          const escolha = (on) => ({ padding: '7px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'left', border: `1px solid ${on ? 'var(--primary)' : 'var(--border)'}`, background: on ? 'rgba(232,98,42,.08)' : 'transparent', color: on ? 'var(--primary)' : 'var(--text-muted)' });
          return (
            <>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Em 4 passos: o que medir · como medir · de onde sai e onde quer chegar · até quando.</p>
              <Rotulo>1. O que você quer acompanhar?</Rotulo>
              <input style={inputStyle} value={nova.nome} maxLength={80} onChange={e => set({ nome: e.target.value })} placeholder="Ex.: Venda de Bazar · Ruptura de Perecíveis · Faltas no mês"/>
              <Rotulo>2. O número precisa subir ou descer?</Rotulo>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" style={escolha(nova.direcao === 'aumentar')} onClick={() => set({ direcao: 'aumentar' })}>⬆ Subir — quanto maior, melhor (venda, conversão)</button>
                <button type="button" style={escolha(nova.direcao === 'reduzir')} onClick={() => set({ direcao: 'reduzir' })}>⬇ Descer — quanto menor, melhor (ruptura, perda, faltas)</button>
              </div>
              <Rotulo>3. Como você mede? <span style={{ fontWeight: 400, textTransform: 'none' }}>Pode marcar mais de uma — elas aparecem lado a lado.</span></Rotulo>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {ORDEM.map(k => (
                  <button key={k} type="button" style={{ ...escolha(nova.usa[k]), flex: '1 1 150px' }} onClick={() => set({ usa: { ...nova.usa, [k]: !nova.usa[k] } })}>
                    <div>{nova.usa[k] ? '☑' : '☐'} {MEDIDAS[k].nome}</div><div style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>{MEDIDAS[k].ex}</div>
                  </button>
                ))}
              </div>
              {ks.length > 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>Para cada medida marcada: <b>hoje está em</b> (o número de partida) e <b>quer chegar em</b> (a meta).</div>}
              {ks.map(k => (
                <div key={k} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px', marginTop: 8 }}>
                  <b style={{ fontSize: 12.5 }}>{MEDIDAS[k].nome}</b>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div><Rotulo>Hoje está em</Rotulo><input type="number" step={MEDIDAS[k].passo} style={inputStyle} value={nova.val[k].inicial} placeholder={MEDIDAS[k].ph[0]} onChange={e => setVal(k, 'inicial', e.target.value)}/></div>
                    <div><Rotulo>Quer chegar em</Rotulo><input type="number" step={MEDIDAS[k].passo} style={inputStyle} value={nova.val[k].meta} placeholder={MEDIDAS[k].ph[1]} onChange={e => setVal(k, 'meta', e.target.value)}/></div>
                  </div>
                </div>
              ))}
              <Rotulo>4. Até quando, e de quanto em quanto tempo você lança o número?</Rotulo>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><input type="date" style={inputStyle} value={nova.prazo} onChange={e => set({ prazo: e.target.value })}/><div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Prazo final da meta</div></div>
                <div>
                  <select className="select" value={nova.frequencia} onChange={e => set({ frequencia: e.target.value })}>
                    {Object.entries(FREQ).map(([k, t]) => <option key={k} value={k}>Lanço {t}</option>)}
                  </select>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Mensal vira gráfico de barras; diário/semanal vira linha com tendência</div>
                </div>
              </div>
              <Rotulo>Essa meta faz parte de um plano de ação? <span style={{ fontWeight: 400, textTransform: 'none' }}>(opcional)</span></Rotulo>
              <select className="select" value={nova.plano_id} onChange={e => set({ plano_id: e.target.value })}>
                <option value="">Não — é uma meta da loja</option>
                {dados.planos.map(p => <option key={p.id} value={p.id}>🎯 {p.titulo}</option>)}
              </select>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Todos os planos do PDCA aparecem aqui. Ligando, a meta também fica visível dentro do plano.</div>
            </>
          );
        })()}
      </Modal>
    </div>
  );
}
