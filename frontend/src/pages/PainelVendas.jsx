import React, { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, ChevronDown, AlertTriangle, Users, ShoppingCart, DollarSign, BarChart2, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ExportMenu from '../components/ExportMenu';
import { gerarPDF, gerarExcel, compartilharWhatsApp, compartilharEmail } from '../lib/exportUtils';

const TABS = ['Geral', 'Departamentos', 'Categorias', 'Itens', 'Atenção'];

// ─── Formatação ───────────────────────────────────────────
function fmtR(n) {
  if (!n && n !== 0) return '—';
  const abs = Math.abs(n);
  const sinal = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sinal}R$ ${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${sinal}R$ ${(abs / 1_000).toFixed(0)}K`;
  return `${sinal}R$ ${abs.toFixed(0)}`;
}
function fmtN(n) {
  if (!n && n !== 0) return '—';
  return Math.abs(n) >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(Math.round(n));
}
function fmtPct(n) {
  if (!n && n !== 0) return '—';
  return `${n > 0 ? '+' : ''}${n}%`;
}

// ─── Componentes base ────────────────────────────────────
function KpiCard({ label, value, sub, cor, icon: Icon }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
      padding: '16px 18px', flex: 1, minWidth: 130 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        {Icon && <Icon size={14} color="var(--text-muted)" />}
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: .5 }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: cor || 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function BadgeYoY({ yoy }) {
  if (yoy === undefined || yoy === null) return null;
  const cor = yoy > 0 ? '#22c55e' : yoy < 0 ? '#ef4444' : '#94a3b8';
  const Icon = yoy > 0 ? TrendingUp : yoy < 0 ? TrendingDown : null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3,
      background: cor + '22', color: cor, borderRadius: 6, padding: '2px 7px', fontSize: 11, fontWeight: 700 }}>
      {Icon && <Icon size={10} />}{fmtPct(yoy)}
    </span>
  );
}

function CardItem({ l, isTotal }) {
  const e = l.extras || {};
  const saldo = e.saldo_receita ?? (l.realizado - l.meta);
  const corSaldo = saldo >= 0 ? '#22c55e' : '#ef4444';
  const yoy = e.yoy_receita ?? l.percentual;
  return (
    <div style={{
      background: isTotal ? 'rgba(var(--primary-rgb,255,112,0),.08)' : 'var(--surface)',
      border: `1px solid ${isTotal ? 'var(--primary)' : 'var(--border)'}`,
      borderRadius: 10, padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: isTotal ? 800 : 600, color: 'var(--text)' }}>
          {l.nome}
          {isTotal && <span style={{ fontSize: 10, color: 'var(--primary)', marginLeft: 6, fontWeight: 700 }}>TOTAL</span>}
        </span>
        <BadgeYoY yoy={yoy} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px 4px' }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>RECEITA</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{fmtR(l.realizado)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>SALDO</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: corSaldo }}>{fmtR(saldo)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>MARGEM</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{fmtR(e.margem)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>% MARGEM</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{e.pct_margem !== undefined ? `${e.pct_margem}%` : '—'}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>SÓCIOS</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{fmtN(e.socios)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>VOLUME</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{fmtN(e.volume)}</div>
        </div>
      </div>
    </div>
  );
}

const COLUNAS_TABELA = [
  { label: 'Nome',    key: 'nome',       left: true,  fn: l => l.nome },
  { label: 'Receita', key: 'realizado',  left: false, fn: l => l.realizado || 0 },
  { label: 'YoY',     key: 'yoy',        left: false, fn: l => l.extras?.yoy_receita ?? l.percentual ?? 0 },
  { label: 'Saldo',   key: 'saldo',      left: false, fn: l => { const e = l.extras || {}; return e.saldo_receita ?? (l.realizado - l.meta); } },
  { label: 'Margem',  key: 'margem',     left: false, fn: l => l.extras?.margem || 0 },
  { label: '% Marg.', key: 'pct_margem', left: false, fn: l => l.extras?.pct_margem || 0 },
  { label: 'Sócios',  key: 'socios',     left: false, fn: l => l.extras?.socios || 0 },
  { label: 'Volume',  key: 'volume',     left: false, fn: l => l.extras?.volume || 0 },
];

function TabelaVendas({ linhas, marcarTotal }) {
  const [isMobile, setIsMobile] = React.useState(() => window.innerWidth < 640);
  const [sortKey, setSortKey]   = React.useState(null);
  const [sortAsc, setSortAsc]   = React.useState(false);

  React.useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);

  if (!linhas.length) return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sem dados.</p>;
  const { totalRow, subRows } = marcarTotal ? detectarTotal(linhas) : { totalRow: null, subRows: linhas };

  const handleSort = (key) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
  };

  const col = COLUNAS_TABELA.find(c => c.key === sortKey);
  const sorted = col
    ? [...subRows].sort((a, b) => {
        const va = col.fn(a), vb = col.fn(b);
        if (typeof va === 'string') return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
        return sortAsc ? va - vb : vb - va;
      })
    : subRows;
  const linhasFinais = totalRow ? [...sorted, totalRow] : sorted;

  if (isMobile) {
    return (
      <div>
        {/* Ordenação mobile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Ordenar por:</span>
          <select
            value={sortKey || ''}
            onChange={e => { setSortKey(e.target.value || null); setSortAsc(false); }}
            style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)',
              color: 'var(--text)', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}>
            <option value="">Padrão</option>
            {COLUNAS_TABELA.filter(c => c.key !== 'nome').map(c => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
          {sortKey && (
            <button
              onClick={() => setSortAsc(a => !a)}
              style={{ background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '6px 10px', fontSize: 12, color: 'var(--text)', cursor: 'pointer' }}>
              {sortAsc ? '▲' : '▼'}
            </button>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {linhasFinais.map((l, i) => {
            const isTotal = totalRow && l.nome === totalRow.nome;
            return <CardItem key={i} l={l} isTotal={isTotal} />;
          })}
        </div>
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {COLUNAS_TABELA.map(c => (
              <th key={c.key}
                onClick={() => handleSort(c.key)}
                style={{ textAlign: c.left ? 'left' : 'right', padding: '8px 6px',
                  color: sortKey === c.key ? 'var(--primary)' : 'var(--text-muted)',
                  fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap',
                  cursor: 'pointer', userSelect: 'none' }}>
                {c.label}{sortKey === c.key ? (sortAsc ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhasFinais.map((l, i) => {
            const e = l.extras || {};
            const saldo = e.saldo_receita ?? (l.realizado - l.meta);
            const corSaldo = saldo >= 0 ? '#22c55e' : '#ef4444';
            const isTotal = totalRow && l.nome === totalRow.nome;
            return (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)',
                background: isTotal ? 'rgba(255,112,0,.06)' : undefined }}>
                <td style={{ padding: '10px 6px', color: 'var(--text)', fontWeight: isTotal ? 800 : 500, whiteSpace: 'nowrap' }}>
                  {l.nome}{isTotal && <span style={{ fontSize: 10, color: 'var(--primary)', marginLeft: 6 }}>TOTAL</span>}
                </td>
                <td style={{ padding: '10px 6px', textAlign: 'right', color: 'var(--text)', fontWeight: isTotal ? 800 : 600 }}>{fmtR(l.realizado)}</td>
                <td style={{ padding: '10px 6px', textAlign: 'right' }}><BadgeYoY yoy={e.yoy_receita ?? l.percentual} /></td>
                <td style={{ padding: '10px 6px', textAlign: 'right', color: corSaldo, fontWeight: 600 }}>{fmtR(saldo)}</td>
                <td style={{ padding: '10px 6px', textAlign: 'right', color: 'var(--text-muted)' }}>{fmtR(e.margem)}</td>
                <td style={{ padding: '10px 6px', textAlign: 'right', color: 'var(--text-muted)' }}>{e.pct_margem !== undefined ? `${e.pct_margem}%` : '—'}</td>
                <td style={{ padding: '10px 6px', textAlign: 'right', color: 'var(--text-muted)' }}>{fmtN(e.socios)}</td>
                <td style={{ padding: '10px 6px', textAlign: 'right', color: 'var(--text-muted)' }}>{fmtN(e.volume)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Detecta linha de total: o valor da última linha ≈ soma das anteriores.
 * Retorna { totalRow, subRows } — se não detectar total, totalRow = null.
 */
function detectarTotal(linhas) {
  if (linhas.length < 2) return { totalRow: null, subRows: linhas };
  const sub = linhas.slice(0, -1);
  const last = linhas[linhas.length - 1];
  const somaAnts = sub.reduce((s, l) => s + (l.realizado || 0), 0);
  const ratio = somaAnts > 0 ? Math.abs(last.realizado - somaAnts) / somaAnts : 1;
  if (ratio < 0.02) return { totalRow: last, subRows: sub };
  return { totalRow: null, subRows: linhas };
}

// ─── Filtro de departamento (multi-seleção com "Selecionar todos") ────────
function DeptoFilter({ opcoes, selecionados, onChange, carregando }) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef();

  useEffect(() => {
    if (!open) return;
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (carregando) {
    return <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Carregando departamentos…</span>;
  }
  if (!opcoes.length) {
    return <span style={{ fontSize: 12, color: 'var(--text-muted)' }} title="Importe o Estoque para habilitar o filtro por departamento">
      Filtro por departamento indisponível (importe o Estoque)
    </span>;
  }

  const todosSelecionados = selecionados.length === 0;
  const resumo = todosSelecionados ? 'Todos os departamentos'
    : selecionados.length === 1 ? selecionados[0]
    : `${selecionados.length} departamentos`;

  const toggle = (op) => onChange(sel => sel.includes(op) ? sel.filter(x => x !== op) : [...sel, op]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 8, padding: '7px 12px', fontSize: 12,
          color: 'var(--text)', cursor: 'pointer' }}>
        {resumo} <ChevronDown size={13} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 20,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,.15)', padding: 6, minWidth: 240, maxHeight: 280, overflowY: 'auto' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6,
            cursor: 'pointer', fontSize: 13, fontWeight: 700, borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
            <input type="checkbox" checked={todosSelecionados} onChange={() => onChange([])}
              style={{ accentColor: 'var(--primary)', width: 15, height: 15 }} />
            Todos os departamentos
          </label>
          {opcoes.map(op => {
            const sel = selecionados.includes(op);
            return (
              <label key={op} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                borderRadius: 6, cursor: 'pointer', fontSize: 13,
                background: sel ? 'rgba(255,112,0,.08)' : 'transparent' }}>
                <input type="checkbox" checked={sel} onChange={() => toggle(op)}
                  style={{ accentColor: 'var(--primary)', width: 15, height: 15 }} />
                {op}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Tela principal ──────────────────────────────────────
export default function PainelVendas({ profile }) {
  const [tab, setTab] = useState(0);
  const [periodo, setPeriodo] = useState('');
  const [periodos, setPeriodos] = useState([]);
  const [dados, setDados] = useState([]);
  const [loading, setLoading] = useState(false);
  const company = profile?.company;

  const [refreshKey, setRefreshKey] = useState(0);

  // Mapa código do produto → departamento, vindo do Estoque (a planilha de
  // vendas não traz departamento junto do item, só o Estoque tem essa ligação)
  const [mapaDepto, setMapaDepto] = useState(null); // Map | null (null = ainda não carregou)
  const [deptosSelecionados, setDeptosSelecionados] = useState([]); // vazio = todos

  const carregarPeriodos = useCallback(async () => {
    if (!company) return;
    const { data } = await supabase.rpc('get_vendas_periodos', { company_param: company });
    setPeriodos((data || []).map(d => d.periodo));
  }, [company]);

  const carregarDados = useCallback(async () => {
    if (!periodo || !company) { setDados([]); return; }
    setLoading(true);
    const tabela = periodo === 'atual' ? 'vendas_atual' : 'vendas_historico';
    let q = supabase.from(tabela).select('*').eq('company', company);
    if (periodo !== 'atual') q = q.eq('periodo', periodo);
    const { data } = await q;
    setDados(data || []);
    setLoading(false);
  }, [company, periodo]);

  const carregarMapaDepto = useCallback(async () => {
    if (!company) return;
    const { data } = await supabase.from('estoque_payloads').select('payload').eq('company', company).single();
    const lista = data?.payload?.mapa_departamentos || [];
    setMapaDepto(new Map(lista));
  }, [company]);

  useEffect(() => { carregarPeriodos(); }, [carregarPeriodos, refreshKey]);
  useEffect(() => { carregarDados(); }, [carregarDados]);
  useEffect(() => { carregarMapaDepto(); }, [carregarMapaDepto]);

  // Agrupa por tipo de bloco
  const canais  = dados.filter(d => d.canal);
  const deptos  = dados.filter(d => d.departamento).map(d => ({ ...d, nome: d.departamento }));
  const cats    = dados.filter(d => d.categoria).map(d => ({ ...d, nome: d.categoria }));
  // Descobre o departamento de cada item cruzando o código no início do nome
  // (ex: "259183 - SACOLA SAMS...") com o mapa vindo do Estoque
  const itens   = dados.filter(d => d.item).map(d => {
    const cod = parseInt(String(d.item).match(/^\d+/)?.[0], 10);
    const depto = mapaDepto?.get(cod) || null;
    return { ...d, nome: d.item, departamentoItem: depto };
  });
  const deptosDisponiveis = [...new Set(itens.map(i => i.departamentoItem).filter(Boolean))].sort();
  const filtrarPorDepto = (lista) => deptosSelecionados.length
    ? lista.filter(i => deptosSelecionados.includes(i.departamentoItem))
    : lista;

  // KPIs globais — usa linha de total do bloco CANAL se detectada, senão soma tudo
  const baseCanais = canais.length ? canais : dados;
  const { totalRow: canalTotal, subRows: canalSubs } = detectarTotal(baseCanais);
  const kpiBase = canalTotal ? [canalTotal] : baseCanais;
  const totalReceita = kpiBase.reduce((s, d) => s + (d.realizado || 0), 0);
  const totalSaldo   = kpiBase.reduce((s, d) => s + (d.extras?.saldo_receita ?? (d.realizado - d.meta) ?? 0), 0);
  const totalMargem  = kpiBase.reduce((s, d) => s + (d.extras?.margem || 0), 0);
  const totalSocios  = kpiBase.reduce((s, d) => s + (d.extras?.socios || 0), 0);
  const crescimento  = (totalReceita - totalSaldo) > 0
    ? Math.round((totalSaldo / (totalReceita - totalSaldo)) * 100 * 10) / 10
    : 0;

  // Atenção: YoY receita negativo — apenas itens individuais (produtos)
  const atencao = itens
    .filter(d => {
      const yoy = d.extras?.yoy_receita ?? d.percentual ?? 0;
      return yoy < 0;
    })
    .sort((a, b) => (a.extras?.yoy_receita ?? a.percentual) - (b.extras?.yoy_receita ?? b.percentual));

  const periodoLabel = (p) => {
    if (p === 'atual') return 'Período Atual';
    if (p.startsWith('ANUAL-')) return `Acumulado ${p.split('-')[1]}`;
    const [ano, mes] = p.split('-');
    const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return `${nomes[parseInt(mes) - 1]}/${ano}`;
  };

  const corCrescimento = crescimento > 0 ? '#22c55e' : crescimento < 0 ? '#ef4444' : 'var(--text-muted)';

  const plabel = periodoLabel(periodo);

  function handlePDF() {
    gerarPDF({
      titulo: 'Painel de Vendas',
      subtitulo: `Período: ${plabel}`,
      secoes: [
        {
          titulo: 'Resumo Geral',
          colunas: [
            { header: 'Indicador', dataKey: 'ind' },
            { header: 'Valor', dataKey: 'val' },
          ],
          rows: [
            { ind: 'Receita Total',   val: fmtR(totalReceita) },
            { ind: 'Saldo vs Meta',   val: fmtR(totalSaldo) },
            { ind: 'Margem Total',    val: fmtR(totalMargem) },
            { ind: 'Sócios',          val: fmtN(totalSocios) },
            { ind: 'Crescimento YoY', val: `${crescimento > 0 ? '+' : ''}${crescimento}%` },
          ],
        },
        {
          titulo: 'Por Departamento',
          colunas: [
            { header: 'Departamento', dataKey: 'nome' },
            { header: 'Realizado', dataKey: 'realizado' },
            { header: 'Meta', dataKey: 'meta' },
            { header: '%', dataKey: 'percentual' },
          ],
          rows: deptos.map(d => ({
            nome: d.nome,
            realizado: fmtR(d.realizado),
            meta: fmtR(d.meta),
            percentual: `${d.percentual ?? 0}%`,
          })),
        },
      ],
    });
  }

  function handleExcel() {
    gerarExcel({
      nomeArquivo: 'PainelVendas',
      abas: [
        {
          nome: 'Departamentos',
          colunas: ['Departamento', 'Realizado', 'Meta', 'Saldo', '% vs Meta', 'Margem', 'YoY%'],
          rows: deptos.map(d => [
            d.nome, d.realizado, d.meta,
            d.extras?.saldo_receita ?? (d.realizado - d.meta),
            d.percentual,
            d.extras?.margem,
            d.extras?.yoy_receita ?? d.percentual,
          ]),
        },
        {
          nome: 'Categorias',
          colunas: ['Categoria', 'Realizado', 'Meta', '% vs Meta'],
          rows: cats.map(d => [d.nome, d.realizado, d.meta, d.percentual]),
        },
        {
          nome: 'Atenção',
          colunas: ['Item', 'YoY%'],
          rows: atencao.map(d => [d.nome || d.item || d.categoria || d.departamento, d.extras?.yoy_receita ?? d.percentual]),
        },
      ],
    });
  }

  function handleWhatsApp() {
    const sinal = crescimento >= 0 ? '📈' : '📉';
    compartilharWhatsApp([
      `📊 *Painel de Vendas — ${plabel}*`,
      ``,
      `💰 Receita: ${fmtR(totalReceita)}`,
      `📊 Saldo vs Meta: ${fmtR(totalSaldo)}`,
      `🏷️ Margem: ${fmtR(totalMargem)}`,
      `👥 Sócios: ${fmtN(totalSocios)}`,
      `${sinal} Crescimento YoY: ${crescimento > 0 ? '+' : ''}${crescimento}%`,
      atencao.length ? `⚠️ ${atencao.length} itens em atenção` : '',
    ].filter(Boolean).join('\n'));
  }

  function handleEmail() {
    compartilharEmail({
      assunto: `Painel de Vendas — ${plabel}`,
      corpo: [
        `Painel de Vendas — ${plabel}`,
        ``,
        `Receita Total: ${fmtR(totalReceita)}`,
        `Saldo vs Meta: ${fmtR(totalSaldo)}`,
        `Margem Total: ${fmtR(totalMargem)}`,
        `Sócios: ${fmtN(totalSocios)}`,
        `Crescimento YoY: ${crescimento > 0 ? '+' : ''}${crescimento}%`,
        atencao.length ? `\nAtenção: ${atencao.length} itens com performance negativa` : '',
      ].join('\n'),
    });
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Painel de Vendas</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>Receita, margem e crescimento por canal</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ position: 'relative' }}>
              <select value={periodo} onChange={e => setPeriodo(e.target.value)}
                style={{ appearance: 'none', background: 'var(--surface)', border: '1px solid var(--border)',
                  color: 'var(--text)', borderRadius: 8, padding: '8px 32px 8px 12px', fontSize: 13, cursor: 'pointer' }}>
                <option value="" disabled>Selecione o período</option>
                <option value="atual">Período Atual</option>
                {periodos.map(p => <option key={p} value={p}>{periodoLabel(p)}</option>)}
              </select>
              <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--text-muted)', pointerEvents: 'none' }} />
            </div>
            <button onClick={() => setRefreshKey(k => k + 1)} title="Atualizar períodos"
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8,
                padding: '8px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
              <RefreshCw size={14} />
            </button>
          </div>
          <ExportMenu
            disabled={!dados.length}
            onPDF={handlePDF}
            onExcel={handleExcel}
            onWhatsApp={handleWhatsApp}
            onEmail={handleEmail}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', color: 'var(--text-muted)' }}>
          Carregando...
        </div>
      ) : !dados.length ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <p style={{ fontSize: 15 }}>
            <span style={{ color: '#22c55e', fontWeight: 700 }}>Selecione o período</span> acima e comece a sua análise.
          </p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
            <KpiCard label="Receita Total" value={fmtR(totalReceita)} icon={DollarSign}
              sub={`Saldo: ${fmtR(totalSaldo)}`} />
            <KpiCard label="Crescimento YoY" value={fmtPct(crescimento)}
              cor={corCrescimento} icon={TrendingUp}
              sub={crescimento > 0 ? 'Acima do período anterior' : crescimento < 0 ? 'Abaixo do período anterior' : ''} />
            <KpiCard label="Margem Total" value={fmtR(totalMargem)} icon={BarChart2}
              sub="Resultado bruto" />
            <KpiCard label="Total Sócios" value={fmtN(totalSocios)} icon={Users}
              sub="Clientes ativos" />
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 20, flexWrap: 'wrap' }}>
            {TABS.map((t, i) => (
              <button key={t} onClick={() => setTab(i)}
                style={{ background: 'none', border: 'none',
                  borderBottom: tab === i ? '2px solid var(--primary)' : '2px solid transparent',
                  color: tab === i ? 'var(--primary)' : 'var(--text-muted)',
                  fontWeight: tab === i ? 700 : 400, fontSize: 13,
                  padding: '8px 14px', cursor: 'pointer', transition: 'all .15s',
                  display: 'flex', alignItems: 'center', gap: 5 }}>
                {t}
                {t === 'Atenção' && atencao.length > 0 && (
                  <span style={{ background: '#ef4444', color: '#fff', borderRadius: 10,
                    padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>
                    {atencao.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {tab === 0 && (
            <>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Por Canal de Venda</h3>
              <TabelaVendas linhas={canais.map(d => ({ ...d, nome: d.canal }))} marcarTotal />
            </>
          )}
          {tab === 1 && (
            <>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Por Departamento</h3>
              <TabelaVendas linhas={deptos} />
            </>
          )}
          {tab === 2 && (
            <>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Por Categoria</h3>
              <TabelaVendas linhas={cats} />
            </>
          )}
          {tab === 3 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Por Item / Produto</h3>
                <DeptoFilter opcoes={deptosDisponiveis} selecionados={deptosSelecionados} onChange={setDeptosSelecionados} carregando={mapaDepto === null} />
              </div>
              <TabelaVendas linhas={filtrarPorDepto(itens)} />
            </>
          )}
          {tab === 4 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 4 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#ef4444', margin: 0,
                  display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={16} /> Itens em Queda
                </h3>
                <DeptoFilter opcoes={deptosDisponiveis} selecionados={deptosSelecionados} onChange={setDeptosSelecionados} carregando={mapaDepto === null} />
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                Todos os itens com receita abaixo do período anterior (YoY negativo), do pior para o melhor.
              </p>
              <TabelaVendas linhas={filtrarPorDepto(atencao).map(d => ({
                ...d,
                nome: d.canal || d.departamento || d.categoria || d.item || d.nome,
              }))} />
            </>
          )}
        </>
      )}
    </div>
  );
}
