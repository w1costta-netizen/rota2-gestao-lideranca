import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AlertTriangle, Package } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ExportMenu from '../components/ExportMenu';
import { gerarPDF, gerarExcel, compartilharWhatsApp, compartilharEmail } from '../lib/exportUtils';

const brl = v => v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const n0  = v => v == null ? '—' : Math.round(v).toLocaleString('pt-BR');
const n1  = v => v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const TABS = [
  { id: 'acervo',     label: 'Acervo Ativo', cor: '#0ea5e9' },
  { id: 'ruptura',    label: 'Ruptura',      cor: '#ef4444' },
  { id: 'urgente',    label: 'Urgente',      cor: '#f59e0b' },
  { id: 'aging',      label: 'Aging +365d',  cor: '#6366f1' },
  { id: 'sem4s',      label: 'Sem venda 5s', cor: '#8b5cf6' },
  { id: 'giro_lento', label: 'Giro Lento',   cor: '#f59e0b' },
  { id: 'negativo',   label: 'Negativo',     cor: '#ef4444' },
  { id: 'suspensos',  label: 'Suspensos',    cor: '#e8681a' },
];

function KpiCard({ label, value, sub, cor }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
      padding: '14px 16px', flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: cor || 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function SecaoTable({ rows, colunas }) {
  if (!rows?.length) return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sem dados.</p>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {colunas.map(c => (
              <th key={c.key} style={{ textAlign: c.right ? 'right' : 'left', padding: '8px 8px',
                color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
              {colunas.map(c => (
                <td key={c.key} style={{ padding: '9px 8px', textAlign: c.right ? 'right' : 'left',
                  color: c.cor ? c.cor(r) : 'var(--text)', whiteSpace: c.wrap ? 'normal' : 'nowrap',
                  maxWidth: c.maxW || undefined, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.fmt ? c.fmt(r[c.key], r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PctBar({ value, total, cor = '#0ea5e9' }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: cor, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 32, textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}

function TabAcervo({ d }) {
  const t = d.totais;
  const [visao, setVisao] = useState('divisao');

  const SUB_TABS = [
    { id: 'divisao', label: 'Por Divisão' },
    { id: 'depto',   label: 'Por Departamento' },
  ];

  function handlePDF() {
    gerarPDF({
      titulo: 'Acervo Ativo — Relatório',
      subtitulo: `Total: ${n0(t.ativos_total)} itens ativos`,
      secoes: [
        {
          titulo: 'Resumo',
          colunas: [
            { header: 'Indicador', dataKey: 'ind' },
            { header: 'Qtd', dataKey: 'qtd' },
            { header: '%', dataKey: 'pct' },
          ],
          rows: [
            { ind: 'Total ativos',       qtd: n0(t.ativos_total),         pct: '100%' },
            { ind: 'Com estoque',        qtd: n0(t.ativos_com_estoque),    pct: `${t.ativos_total > 0 ? Math.round(t.ativos_com_estoque / t.ativos_total * 100) : 0}%` },
            { ind: 'Zero estoque',       qtd: n0(t.ativos_zero_count),     pct: `${t.ativos_total > 0 ? Math.round(t.ativos_zero_count / t.ativos_total * 100) : 0}%` },
            { ind: 'Zero c/ venda 5s',  qtd: n0(t.ativos_zero_venda_5s),  pct: '' },
            { ind: 'Zero c/ venda mês', qtd: n0(t.ativos_zero_venda_mes), pct: '' },
          ],
        },
        {
          titulo: 'Por Divisão',
          colunas: [
            { header: 'Divisão',            dataKey: 'DESCRICAO_SETOR' },
            { header: 'Total Ativos',        dataKey: 'itens' },
            { header: 'Zero estoque',        dataKey: 'zero_estoque' },
            { header: 'Zero c/ venda 5s',   dataKey: 'zero_venda_5s' },
            { header: 'Zero c/ venda mês',  dataKey: 'zero_venda_mes' },
          ],
          rows: d.divisao_ativos || [],
        },
        {
          titulo: 'Por Departamento',
          colunas: [
            { header: 'Departamento',        dataKey: 'DESCRICAO_DEPARTAMENTO' },
            { header: 'Divisão',             dataKey: 'DESCRICAO_SETOR' },
            { header: 'Total Ativos',        dataKey: 'itens' },
            { header: 'Zero estoque',        dataKey: 'zero_estoque' },
            { header: 'Zero c/ venda 5s',   dataKey: 'zero_venda_5s' },
            { header: 'Zero c/ venda mês',  dataKey: 'zero_venda_mes' },
          ],
          rows: d.depto_ativos || [],
        },
      ],
    });
  }

  function handleExcel() {
    gerarExcel({
      nomeArquivo: 'AcervoAtivo',
      abas: [
        {
          nome: 'Por Divisão',
          colunas: ['Divisão', 'Total Ativos', 'Com estoque', 'Zero estoque', 'Zero c/ venda 5s', 'Zero c/ venda mês'],
          rows: (d.divisao_ativos || []).map(r => [
            r.DESCRICAO_SETOR, r.itens, r.itens - r.zero_estoque,
            r.zero_estoque, r.zero_venda_5s, r.zero_venda_mes,
          ]),
        },
        {
          nome: 'Por Departamento',
          colunas: ['Departamento', 'Divisão', 'Total Ativos', 'Zero estoque', 'Zero c/ venda 5s', 'Zero c/ venda mês'],
          rows: (d.depto_ativos || []).map(r => [
            r.DESCRICAO_DEPARTAMENTO, r.DESCRICAO_SETOR, r.itens,
            r.zero_estoque, r.zero_venda_5s, r.zero_venda_mes,
          ]),
        },
      ],
    });
  }

  function handleWhatsApp() {
    compartilharWhatsApp([
      `🏪 *Acervo Ativo no Clube*`,
      ``,
      `📦 Total ativos: ${n0(t.ativos_total)} itens`,
      `✅ Com estoque: ${n0(t.ativos_com_estoque)} (${t.ativos_total > 0 ? Math.round(t.ativos_com_estoque / t.ativos_total * 100) : 0}%)`,
      `⚪ Zero estoque: ${n0(t.ativos_zero_count)} (${t.ativos_total > 0 ? Math.round(t.ativos_zero_count / t.ativos_total * 100) : 0}%)`,
      `🟡 Zero c/ venda 5s: ${n0(t.ativos_zero_venda_5s)} itens`,
      `🔴 Zero c/ venda mês: ${n0(t.ativos_zero_venda_mes)} itens`,
    ].join('\n'));
  }

  function handleEmail() {
    compartilharEmail({
      assunto: `Acervo Ativo — ${n0(t.ativos_total)} itens`,
      corpo: [
        `Acervo Ativo no Clube`,
        ``,
        `Total ativos: ${n0(t.ativos_total)} itens`,
        `Com estoque: ${n0(t.ativos_com_estoque)}`,
        `Zero estoque: ${n0(t.ativos_zero_count)}`,
        `Zero c/ venda 5s: ${n0(t.ativos_zero_venda_5s)} itens`,
        `Zero c/ venda mês: ${n0(t.ativos_zero_venda_mes)} itens`,
      ].join('\n'),
    });
  }

  return (
    <>
      {/* KPIs */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <KpiCard label="Total ativos"        value={n0(t.ativos_total)}         cor="#0ea5e9" sub="itens ativos no clube" />
        <KpiCard label="Com estoque"         value={n0(t.ativos_com_estoque)}    cor="#10b981" sub={`${t.ativos_total > 0 ? Math.round(t.ativos_com_estoque / t.ativos_total * 100) : 0}% do acervo`} />
        <KpiCard label="Zero estoque"        value={n0(t.ativos_zero_count)}     cor="#6b7280" sub={`${t.ativos_total > 0 ? Math.round(t.ativos_zero_count / t.ativos_total * 100) : 0}% do acervo`} />
        <KpiCard label="Zero c/ venda 5s"   value={n0(t.ativos_zero_venda_5s)}  cor="#f59e0b" sub="vendeu mas sem estoque" />
        <KpiCard label="Zero c/ venda mês"  value={n0(t.ativos_zero_venda_mes)} cor="#ef4444" sub="risco de ruptura real" />
      </div>

      {/* Sub-tabs + botão exportar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid var(--border)', marginBottom: 16, gap: 8 }}>
        <div style={{ display: 'flex', gap: 2, overflowX: 'auto' }}>
          {SUB_TABS.map(s => (
            <button key={s.id} onClick={() => setVisao(s.id)}
              style={{ background: 'none', border: 'none',
                borderBottom: visao === s.id ? '2px solid #0ea5e9' : '2px solid transparent',
                color: visao === s.id ? '#0ea5e9' : 'var(--text-muted)',
                fontWeight: visao === s.id ? 700 : 400, fontSize: 12,
                padding: '7px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {s.label}
            </button>
          ))}
        </div>
        <div style={{ flexShrink: 0, paddingBottom: 4 }}>
          <ExportMenu
            onPDF={handlePDF}
            onExcel={handleExcel}
            onWhatsApp={handleWhatsApp}
            onEmail={handleEmail}
            label="Exportar acervo"
          />
        </div>
      </div>

      {/* Por Divisão */}
      {visao === 'divisao' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Divisão','Total Ativos','Com estoque','Zero estoque','Zero c/ venda 5s','Zero c/ venda mês','% zero'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Divisão' ? 'left' : 'right',
                    color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(d.divisao_ativos || []).map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 10px', color: 'var(--text)', fontWeight: 500, maxWidth: 220, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.DESCRICAO_SETOR}</td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 700, color: '#0ea5e9' }}>{n0(r.itens)}</td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', color: '#10b981' }}>{n0(r.itens - r.zero_estoque)}</td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', color: 'var(--text-muted)' }}>{n0(r.zero_estoque)}</td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', color: '#f59e0b' }}>{n0(r.zero_venda_5s)}</td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', color: '#ef4444' }}>{n0(r.zero_venda_mes)}</td>
                  <td style={{ padding: '10px 10px', minWidth: 100 }}>
                    <PctBar value={r.zero_estoque} total={r.itens} cor="#6b7280" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Por Departamento */}
      {visao === 'depto' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Departamento','Divisão','Total Ativos','Zero estoque','Zero c/ venda 5s','Zero c/ venda mês'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Departamento' || h === 'Divisão' ? 'left' : 'right',
                    color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(d.depto_ativos || []).map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '9px 10px', color: 'var(--text)', fontWeight: 500, maxWidth: 200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.DESCRICAO_DEPARTAMENTO}</td>
                  <td style={{ padding: '9px 10px', color: 'var(--text-muted)', fontSize: 11, maxWidth: 160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.DESCRICAO_SETOR}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: '#0ea5e9' }}>{n0(r.itens)}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', color: 'var(--text-muted)' }}>{n0(r.zero_estoque)}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', color: '#f59e0b' }}>{n0(r.zero_venda_5s)}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', color: '#ef4444' }}>{n0(r.zero_venda_mes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </>
  );
}

function TabRuptura({ d }) {
  const [visao, setVisao] = useState('ruptura');

  const SUB_TABS = [
    { id: 'ruptura', label: 'Ruptura' },
    { id: 'zero5s',  label: 'Zero c/ venda 5s' },
    { id: 'zeromes', label: 'Zero c/ venda mês' },
  ];

  const COLS_RUPTURA = [
    { key: 'CD_PRODUTO',               label: 'Cód.' },
    { key: 'DESCRICAO_PRODUTO',         label: 'Produto', maxW: 220, wrap: true },
    { key: 'DESCRICAO_SECAO',           label: 'Seção' },
    { key: 'DESCRICAO_DEPARTAMENTO',    label: 'Depto' },
    { key: 'sum_QTD_VENDAS_MES_ATUAL',  label: 'Sinal de venda', right: false,
      fmt: (v, r) => (v || 0) > 0 ? '🔴 Vendeu no mês' : (r.total_5s || 0) > 0 ? '🟡 Vendeu nas 5 sem.' : '⚪ Sem venda',
      cor: r => (r.sum_QTD_VENDAS_MES_ATUAL || 0) > 0 ? '#ef4444' : (r.total_5s || 0) > 0 ? '#f59e0b' : '#6b7280' },
    { key: 'venda_mes_vlr',             label: 'Venda mês R$', right: true, fmt: v => brl(v), cor: () => '#ef4444' },
    { key: 'estoque_cd_cxs',            label: 'CD (cx)', right: true, fmt: v => v > 0 ? n0(v) : '—', cor: r => r.estoque_cd_cxs > 0 ? '#10b981' : '#6b7280' },
    { key: 'estoque_separado_cd',       label: 'Separ. CD', right: true, fmt: v => v > 0 ? n0(v) : '—', cor: r => r.estoque_separado_cd > 0 ? '#10b981' : '#6b7280' },
    { key: 'estoque_transito_loja',     label: 'Trânsito Loja', right: true, fmt: v => v > 0 ? n0(v) : '—', cor: r => r.estoque_transito_loja > 0 ? '#0ea5e9' : '#6b7280' },
  ];

  const COLS_ZERO = [
    { key: 'CD_PRODUTO',                   label: 'Cód.' },
    { key: 'DESCRICAO_PRODUTO',             label: 'Produto', maxW: 220, wrap: true },
    { key: 'DESCRICAO_SECAO',               label: 'Seção' },
    { key: 'DESCRICAO_DEPARTAMENTO',        label: 'Depto' },
    { key: 'sum_ESTOQUE_ON_HAND_LOJA_QTD',  label: 'Estoque', right: true, fmt: v => n1(v), cor: () => '#6b7280' },
    { key: 'estoque_cd_cxs',                label: 'CD (cx)', right: true, fmt: v => v > 0 ? n0(v) : '—', cor: r => r.estoque_cd_cxs > 0 ? '#10b981' : '#6b7280' },
    { key: 'estoque_separado_cd',           label: 'Separ. CD', right: true, fmt: v => v > 0 ? n0(v) : '—', cor: r => r.estoque_separado_cd > 0 ? '#10b981' : '#6b7280' },
    { key: 'estoque_transito_loja',         label: 'Trânsito Loja', right: true, fmt: v => v > 0 ? n0(v) : '—', cor: r => r.estoque_transito_loja > 0 ? '#0ea5e9' : '#6b7280' },
    { key: 'total_5s',                      label: 'Venda 5s', right: true, fmt: v => n0(v), cor: () => '#f59e0b' },
    { key: 'sum_QTD_VENDAS_MES_ATUAL',      label: 'Venda mês', right: true, fmt: v => n0(v), cor: () => '#ef4444' },
    { key: 'sum_QTD_VENDAS_MES_ANTERIOR',   label: 'Mês ant.', right: true, fmt: v => n0(v) },
  ];

  return (
    <>
      {/* KPIs */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <KpiCard label="Total em ruptura"    value={n0(d.totais.ruptura_count)}          cor="#ef4444" sub="todos os ativos com estoque zero" />
        <KpiCard label="Venda perdida/mês"   value={n0(d.totais.ruptura_venda_mes)}       cor="#ef4444" sub="unidades no mês atual" />
        <KpiCard label="Zero c/ venda 5s"   value={n0(d.totais.ativos_zero_venda_5s)}   cor="#f59e0b" sub="vendeu nas 5 semanas" />
        <KpiCard label="Zero c/ venda mês"  value={n0(d.totais.ativos_zero_venda_mes)}  cor="#f97316" sub="vendeu no mês atual" />
        {d.totais.ruptura_com_cd_count > 0 && (
          <KpiCard label="Com estoque no CD" value={n0(d.totais.ruptura_com_cd_count)} cor="#10b981" sub="reposição disponível no CD" />
        )}
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        {SUB_TABS.map(s => (
          <button key={s.id} onClick={() => setVisao(s.id)}
            style={{ background: 'none', border: 'none',
              borderBottom: visao === s.id ? '2px solid #ef4444' : '2px solid transparent',
              color: visao === s.id ? '#ef4444' : 'var(--text-muted)',
              fontWeight: visao === s.id ? 700 : 400, fontSize: 12,
              padding: '7px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Ruptura clássica */}
      {visao === 'ruptura' && (
        <>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10 }}>Por seção</h4>
          <SecaoTable rows={d.secao_ruptura} colunas={[
            { key: 'DESCRICAO_SECAO',        label: 'Seção', maxW: 180, wrap: true },
            { key: 'DESCRICAO_DEPARTAMENTO', label: 'Departamento' },
            { key: 'itens',                  label: 'Itens', right: true },
            { key: 'venda_mes',              label: 'Venda mês', right: true, fmt: v => n0(v) },
          ]} />
          <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', margin: '20px 0 10px' }}>
            Top itens — todos os ativos com estoque zero (sinal de venda indica prioridade)
          </h4>
          <SecaoTable rows={d.ruptura_top} colunas={COLS_RUPTURA} />
        </>
      )}

      {/* Zero c/ venda 5 semanas */}
      {visao === 'zero5s' && (
        <>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
            Itens ativos com <strong>estoque zero</strong> que tiveram venda nas últimas 5 semanas — risco real de ruptura.
          </p>
          <SecaoTable rows={d.zero_venda_5s_top || []} colunas={COLS_ZERO} />
        </>
      )}

      {/* Zero c/ venda mês */}
      {visao === 'zeromes' && (
        <>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
            Itens ativos com <strong>estoque zero</strong> que tiveram venda no último mês — prioridade máxima de reposição.
          </p>
          <SecaoTable rows={d.zero_venda_mes_top || []} colunas={COLS_ZERO} />
        </>
      )}
    </>
  );
}

function TabUrgente({ d }) {
  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <KpiCard label="Crítico (< 15d)" value={n0(d.totais.urgente_count)} cor="#ef4444" sub="cobertura abaixo de 15 dias" />
        <KpiCard label="Monitoramento (< 30d)" value={n0(d.totais.urgente_30_count)} cor="#f59e0b" sub="cobertura abaixo de 30 dias" />
        {d.totais.urgente_com_cd_count > 0 && (
          <KpiCard label="Com estoque no CD" value={n0(d.totais.urgente_com_cd_count)} cor="#10b981" sub="reposição disponível no CD" />
        )}
      </div>
      <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10 }}>Top itens (menor cobertura — até 30 dias)</h4>
      <SecaoTable rows={d.urgente_top} colunas={[
        { key: 'CD_PRODUTO', label: 'Cód.' },
        { key: 'DESCRICAO_PRODUTO', label: 'Produto', maxW: 200, wrap: true },
        { key: 'DESCRICAO_SECAO', label: 'Seção' },
        { key: 'sum_ESTOQUE_ON_HAND_LOJA_QTD', label: 'Estoque', right: true, fmt: v => n1(v) },
        { key: 'dias_cobertura', label: 'Cobertura', right: true,
          fmt: v => v != null ? `${n1(v)}d` : '—',
          cor: r => r.dias_cobertura < 7 ? '#ef4444' : r.dias_cobertura < 15 ? '#f59e0b' : '#f97316' },
        { key: 'criticidade', label: 'Status', right: false,
          fmt: v => v === 'critico' ? '🔴 Crítico' : v === 'urgente' ? '🟡 Urgente' : '🟠 Atenção' },
        { key: 'estoque_cd_cxs', label: 'CD (cx)', right: true,
          fmt: v => v > 0 ? n0(v) : '—',
          cor: r => r.estoque_cd_cxs > 0 ? '#10b981' : '#6b7280' },
        { key: 'estoque_separado_cd', label: 'Separ. CD', right: true,
          fmt: v => v > 0 ? n0(v) : '—',
          cor: r => r.estoque_separado_cd > 0 ? '#10b981' : '#6b7280' },
        { key: 'estoque_transito_loja', label: 'Trânsito Loja', right: true,
          fmt: v => v > 0 ? n0(v) : '—',
          cor: r => r.estoque_transito_loja > 0 ? '#0ea5e9' : '#6b7280' },
      ]} />
    </>
  );
}

function TabAging({ d }) {
  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <KpiCard label="Itens aging +365d" value={n0(d.totais.aging_count)} cor="#6366f1" />
        <KpiCard label="Custo parado" value={brl(d.totais.aging_custo)} cor="#6366f1" />
      </div>
      <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10 }}>Por seção</h4>
      <SecaoTable rows={d.secao_aging} colunas={[
        { key: 'DESCRICAO_SECAO', label: 'Seção', maxW: 180, wrap: true },
        { key: 'itens', label: 'Itens', right: true },
        { key: 'custo_total', label: 'Custo total', right: true, fmt: v => brl(v) },
      ]} />
      <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', margin: '20px 0 10px' }}>Top itens</h4>
      <SecaoTable rows={d.aging_top} colunas={[
        { key: 'CD_PRODUTO', label: 'Cód.' },
        { key: 'DESCRICAO_PRODUTO', label: 'Produto', maxW: 200, wrap: true },
        { key: 'DESCRICAO_SECAO', label: 'Seção' },
        { key: 'IDADE_ULTIMA_NF', label: 'Dias NF', right: true, fmt: v => n0(v), cor: () => '#6366f1' },
        { key: 'sum_ESTOQUE_ON_HAND_LOJA_QTD', label: 'Qtd estoque', right: true, fmt: v => n1(v) },
        { key: 'sum_VALOR_ESTOQUE_LOJA_A_CUSTO', label: 'Custo', right: true, fmt: v => brl(v) },
      ]} />
    </>
  );
}

function TabSem4s({ d }) {
  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <KpiCard label="Sem venda nas 5 semanas" value={n0(d.totais.sem4s_count)} cor="#8b5cf6" />
        <KpiCard label="Custo parado" value={brl(d.totais.sem4s_custo)} cor="#8b5cf6" />
      </div>
      <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10 }}>Por seção</h4>
      <SecaoTable rows={d.secao_sem4s} colunas={[
        { key: 'DESCRICAO_SECAO', label: 'Seção', maxW: 180, wrap: true },
        { key: 'itens', label: 'Itens', right: true },
        { key: 'custo_total', label: 'Custo total', right: true, fmt: v => brl(v) },
      ]} />
      <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', margin: '20px 0 10px' }}>Top itens</h4>
      <SecaoTable rows={d.sem4s_top} colunas={[
        { key: 'CD_PRODUTO', label: 'Cód.' },
        { key: 'DESCRICAO_PRODUTO', label: 'Produto', maxW: 200, wrap: true },
        { key: 'DESCRICAO_SECAO', label: 'Seção' },
        { key: 'sum_ESTOQUE_ON_HAND_LOJA_QTD', label: 'Qtd estoque', right: true, fmt: v => n1(v) },
        { key: 'IDADE_ULTIMA_NF', label: 'Última entrada', right: true, fmt: v => v != null ? `${n0(v)}d atrás` : '—', cor: () => '#8b5cf6' },
        { key: 'sum_VALOR_ESTOQUE_LOJA_A_CUSTO', label: 'Custo', right: true, fmt: v => brl(v) },
      ]} />
    </>
  );
}

function TabGiroLento({ d }) {
  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <KpiCard label="Giro lento (≥45d cobertura)" value={n0(d.totais.giro_lento_count)} cor="#f59e0b" />
        <KpiCard label="Custo imobilizado" value={brl(d.totais.giro_lento_custo)} cor="#f59e0b" />
      </div>
      <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10 }}>Por seção</h4>
      <SecaoTable rows={d.secao_giro_lento} colunas={[
        { key: 'DESCRICAO_SECAO', label: 'Seção', maxW: 180, wrap: true },
        { key: 'itens', label: 'Itens', right: true },
        { key: 'custo_total', label: 'Custo total', right: true, fmt: v => brl(v) },
      ]} />
      <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', margin: '20px 0 10px' }}>Top itens</h4>
      <SecaoTable rows={d.giro_lento_top} colunas={[
        { key: 'CD_PRODUTO', label: 'Cód.' },
        { key: 'DESCRICAO_PRODUTO', label: 'Produto', maxW: 200, wrap: true },
        { key: 'DESCRICAO_SECAO', label: 'Seção' },
        { key: 'sum_ESTOQUE_ON_HAND_LOJA_QTD', label: 'Qtd estoque', right: true, fmt: v => n1(v) },
        { key: 'dias_cobertura', label: 'Cobertura', right: true, fmt: v => v != null ? `${n1(v)}d` : '—', cor: () => '#f59e0b' },
        { key: 'sum_VALOR_ESTOQUE_LOJA_A_CUSTO', label: 'Custo', right: true, fmt: v => brl(v) },
      ]} />
    </>
  );
}

function TabNegativo({ d }) {
  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <KpiCard label="Estoque negativo" value={n0(d.totais.estq_neg_count)} cor="#ef4444" sub="itens com qtd < 0" />
      </div>
      <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10 }}>Top itens</h4>
      <SecaoTable rows={d.estq_neg_top} colunas={[
        { key: 'CD_PRODUTO', label: 'Cód.' },
        { key: 'DESCRICAO_PRODUTO', label: 'Produto', maxW: 200, wrap: true },
        { key: 'DESCRICAO_SECAO', label: 'Seção' },
        { key: 'sum_ESTOQUE_ON_HAND_LOJA_QTD', label: 'Qtd', right: true,
          fmt: v => n1(v), cor: () => '#ef4444' },
        { key: 'IDADE_ULTIMA_NF', label: 'Dias sem NF', right: true, fmt: v => v != null ? `${n0(v)}d` : '—', cor: () => '#6b7280' },
      ]} />
    </>
  );
}

function TabSuspensos({ d }) {
  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <KpiCard label="Suspensos c/ estoque" value={n0(d.totais.suspensos_count)} cor="#e8681a" />
        <KpiCard label="Custo imobilizado"     value={brl(d.totais.suspensos_custo)} cor="#e8681a" />
        <KpiCard label="Deletados c/ estoque"  value={n0(d.totais.deletados_com_estoque)} cor="#6b7280" />
      </div>
      <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10 }}>Por seção — Suspensos</h4>
      <SecaoTable rows={d.dep_suspensos} colunas={[
        { key: 'DESCRICAO_SECAO', label: 'Seção', maxW: 180, wrap: true },
        { key: 'itens', label: 'Itens', right: true },
        { key: 'custo_total', label: 'Custo total', right: true, fmt: v => brl(v) },
      ]} />
      <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', margin: '20px 0 10px' }}>Top suspensos</h4>
      <SecaoTable rows={d.suspensos_top} colunas={[
        { key: 'CD_PRODUTO', label: 'Cód.' },
        { key: 'DESCRICAO_PRODUTO', label: 'Produto', maxW: 200, wrap: true },
        { key: 'DESC_MOTIVO_SUSPENCAO', label: 'Motivo' },
        { key: 'sum_VALOR_ESTOQUE_LOJA_A_CUSTO', label: 'Custo', right: true, fmt: v => brl(v) },
      ]} />
    </>
  );
}

/* ── filtro helper ──────────────────────────────────────────────── */
function filtrarPorSecao(dados, secoesSel) {
  if (!secoesSel.length) return dados;
  const ok = s => secoesSel.includes(s);
  const fArr = arr => (arr || []).filter(r => ok(r.DESCRICAO_SECAO));
  const fSecao = arr => (arr || []).filter(r => ok(r.DESCRICAO_SECAO));

  const ruptura_top     = fArr(dados.ruptura_top);
  const urgente_top     = fArr(dados.urgente_top);
  const aging_top       = fArr(dados.aging_top);
  const sem4s_top       = fArr(dados.sem4s_top);
  const giro_lento_top  = fArr(dados.giro_lento_top);
  const estq_neg_top    = fArr(dados.estq_neg_top);
  const suspensos_top   = fArr(dados.suspensos_top);
  const zero_v5s        = fArr(dados.zero_venda_5s_top);
  const zero_vmes       = fArr(dados.zero_venda_mes_top);

  const sumF = (arr, k) => arr.reduce((a, r) => a + (r[k] || 0), 0);

  return {
    ...dados,
    ruptura_top,  urgente_top, aging_top, sem4s_top,
    giro_lento_top, estq_neg_top, suspensos_top,
    zero_venda_5s_top: zero_v5s,
    zero_venda_mes_top: zero_vmes,
    secao_ruptura:    fSecao(dados.secao_ruptura),
    secao_urgente:    fSecao(dados.secao_urgente),
    secao_aging:      fSecao(dados.secao_aging),
    secao_sem4s:      fSecao(dados.secao_sem4s),
    secao_giro_lento: fSecao(dados.secao_giro_lento),
    dep_suspensos:    fSecao(dados.dep_suspensos),
    totais: {
      ...dados.totais,
      ruptura_count:    ruptura_top.length,
      ruptura_venda_mes: sumF(ruptura_top, 'sum_QTD_VENDAS_MES_ATUAL'),
      urgente_count:    urgente_top.length,
      aging_count:      aging_top.length,
      aging_custo:      sumF(aging_top, 'sum_VALOR_ESTOQUE_LOJA_A_CUSTO'),
      sem4s_count:      sem4s_top.length,
      sem4s_custo:      sumF(sem4s_top, 'sum_VALOR_ESTOQUE_LOJA_A_CUSTO'),
      giro_lento_count: giro_lento_top.length,
      giro_lento_custo: sumF(giro_lento_top, 'sum_VALOR_ESTOQUE_LOJA_A_CUSTO'),
      estq_neg_count:   estq_neg_top.length,
      suspensos_count:  suspensos_top.length,
      suspensos_custo:  sumF(suspensos_top, 'sum_VALOR_ESTOQUE_LOJA_A_CUSTO'),
    },
  };
}

/* ── filtro UI ──────────────────────────────────────────────────── */
function FiltroSecoes({ secoes, selecionadas, onChange }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const toggle = s => onChange(selecionadas.includes(s) ? selecionadas.filter(x => x !== s) : [...selecionadas, s]);
  const limpar = e => { e.stopPropagation(); onChange([]); };

  const label = selecionadas.length === 0
    ? 'Todas as seções'
    : selecionadas.length === 1
    ? selecionadas[0]
    : `${selecionadas.length} seções selecionadas`;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setAberto(v => !v)} style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: selecionadas.length > 0 ? '#e8681a15' : 'var(--surface)',
        border: `1px solid ${selecionadas.length > 0 ? '#e8681a' : 'var(--border)'}`,
        borderRadius: 20, padding: '7px 14px', fontSize: 13, cursor: 'pointer',
        color: selecionadas.length > 0 ? '#e8681a' : 'var(--text-muted)',
        fontWeight: selecionadas.length > 0 ? 700 : 400,
        whiteSpace: 'nowrap', maxWidth: 240,
      }}>
        <span>🏷️</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        {selecionadas.length > 0 && (
          <span onClick={limpar} style={{ marginLeft: 4, fontWeight: 900, fontSize: 15, opacity: .7 }}>×</span>
        )}
      </button>

      {aberto && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 300,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,.15)',
          minWidth: 240, maxWidth: 320, maxHeight: 360, overflowY: 'auto',
        }}>
          <div style={{ padding: '10px 14px 6px', borderBottom: '1px solid var(--border)',
            fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: .5 }}>
            Filtrar por seção
          </div>
          {secoes.map(s => {
            const sel = selecionadas.includes(s);
            return (
              <button key={s} onClick={() => toggle(s)} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', background: sel ? '#e8681a10' : 'none',
                border: 'none', padding: '10px 14px', cursor: 'pointer',
                fontSize: 12, color: sel ? '#e8681a' : 'var(--text)', textAlign: 'left',
              }}
              onMouseEnter={e => { if (!sel) e.currentTarget.style.background = 'var(--background)'; }}
              onMouseLeave={e => { if (!sel) e.currentTarget.style.background = sel ? '#e8681a10' : 'none'; }}>
                <span style={{
                  width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                  border: `2px solid ${sel ? '#e8681a' : 'var(--border)'}`,
                  background: sel ? '#e8681a' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {sel && <span style={{ color: '#fff', fontSize: 10, fontWeight: 900 }}>✓</span>}
                </span>
                {s}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Estoque({ profile }) {
  const [dados, setDados]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState(0);
  const [secoesSel, setSecoesSel] = useState([]);
  const company = profile?.company;

  const carregar = useCallback(async () => {
    if (!company) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('estoque_payloads')
      .select('payload, updated_at')
      .eq('company', company)
      .maybeSingle();
    if (!error && data?.payload) setDados(data.payload);
    setLoading(false);
  }, [company]);

  useEffect(() => { carregar(); }, [carregar]);

  // Seções únicas disponíveis (de todos os arrays de itens)
  const secoesDisponiveis = dados ? [...new Set([
    ...(dados.ruptura_top    || []).map(r => r.DESCRICAO_SECAO),
    ...(dados.urgente_top    || []).map(r => r.DESCRICAO_SECAO),
    ...(dados.aging_top      || []).map(r => r.DESCRICAO_SECAO),
    ...(dados.sem4s_top      || []).map(r => r.DESCRICAO_SECAO),
    ...(dados.giro_lento_top || []).map(r => r.DESCRICAO_SECAO),
    ...(dados.suspensos_top  || []).map(r => r.DESCRICAO_SECAO),
  ].filter(Boolean))].sort() : [];

  // Dados com filtro aplicado
  const d = dados ? filtrarPorSecao(dados, secoesSel) : null;
  const t = d?.totais;

  const filtroLabel = secoesSel.length
    ? ` · ${secoesSel.length} seção${secoesSel.length > 1 ? 'ões' : ''} filtrada${secoesSel.length > 1 ? 's' : ''}`
    : '';

  function handlePDF() {
    if (!d) return;
    gerarPDF({
      titulo: 'Painel de Estoque' + filtroLabel,
      subtitulo: `Extração: ${d.gerado_em} · ${d.arquivo}`,
      secoes: [
        {
          titulo: 'Resumo de Indicadores',
          colunas: [
            { header: 'Indicador', dataKey: 'indicador' },
            { header: 'Qtd', dataKey: 'qtd' },
            { header: 'Valor (R$)', dataKey: 'valor' },
          ],
          rows: [
            { indicador: 'Ruptura',                   qtd: n0(t.ruptura_count),       valor: t.ruptura_com_cd_count > 0 ? `${n0(t.ruptura_com_cd_count)} c/ CD` : '—' },
            { indicador: 'Urgente <15d / <30d',       qtd: `${n0(t.urgente_count)} / ${n0(t.urgente_30_count)}`, valor: t.urgente_com_cd_count > 0 ? `${n0(t.urgente_com_cd_count)} c/ CD` : '—' },
            { indicador: 'Aging +365d',      qtd: n0(t.aging_count),      valor: brl(t.aging_custo) },
            { indicador: 'Sem venda 5 sem.', qtd: n0(t.sem4s_count),      valor: brl(t.sem4s_custo) },
            { indicador: 'Giro lento',       qtd: n0(t.giro_lento_count), valor: brl(t.giro_lento_custo) },
            { indicador: 'Est. negativo',    qtd: n0(t.estq_neg_count),   valor: '—' },
            { indicador: 'Suspensos',        qtd: n0(t.suspensos_count),  valor: brl(t.suspensos_custo) },
          ],
        },
        {
          titulo: 'Ruptura — Top itens',
          colunas: [
            { header: 'Cód.', dataKey: 'CD_PRODUTO' },
            { header: 'Produto', dataKey: 'DESCRICAO_PRODUTO' },
            { header: 'Seção', dataKey: 'DESCRICAO_SECAO' },
            { header: 'Departamento', dataKey: 'DESCRICAO_DEPARTAMENTO' },
            { header: 'Venda mês (un)', dataKey: 'sum_QTD_VENDAS_MES_ATUAL' },
            { header: 'Venda mês R$', dataKey: 'venda_mes_vlr' },
            { header: 'CD (cx)', dataKey: 'estoque_cd_cxs' },
            { header: 'Separ. CD', dataKey: 'estoque_separado_cd' },
            { header: 'Trânsito Loja', dataKey: 'estoque_transito_loja' },
          ],
          rows: (d.ruptura_top || []).slice(0, 30),
        },
        {
          titulo: 'Urgente — Top itens (cobertura até 30 dias)',
          colunas: [
            { header: 'Cód.', dataKey: 'CD_PRODUTO' },
            { header: 'Produto', dataKey: 'DESCRICAO_PRODUTO' },
            { header: 'Seção', dataKey: 'DESCRICAO_SECAO' },
            { header: 'Estoque', dataKey: 'sum_ESTOQUE_ON_HAND_LOJA_QTD' },
            { header: 'Cobertura (d)', dataKey: 'dias_cobertura' },
            { header: 'Status', dataKey: 'criticidade_label' },
            { header: 'CD (cx)', dataKey: 'estoque_cd_cxs' },
            { header: 'Separ. CD', dataKey: 'estoque_separado_cd' },
            { header: 'Trânsito Loja', dataKey: 'estoque_transito_loja' },
          ],
          rows: (d.urgente_top || []).slice(0, 30).map(r => ({
            ...r,
            criticidade_label: r.criticidade === 'critico' ? 'Crítico' : r.criticidade === 'urgente' ? 'Urgente' : 'Atenção',
          })),
        },
        {
          titulo: 'Aging +365 dias — Top itens',
          colunas: [
            { header: 'Cód.', dataKey: 'CD_PRODUTO' },
            { header: 'Produto', dataKey: 'DESCRICAO_PRODUTO' },
            { header: 'Seção', dataKey: 'DESCRICAO_SECAO' },
            { header: 'Dias NF', dataKey: 'IDADE_ULTIMA_NF' },
            { header: 'Qtd estoque', dataKey: 'sum_ESTOQUE_ON_HAND_LOJA_QTD' },
            { header: 'Custo R$', dataKey: 'sum_VALOR_ESTOQUE_LOJA_A_CUSTO' },
          ],
          rows: (d.aging_top || []).slice(0, 30),
        },
        {
          titulo: 'Sem venda 5 semanas — Top itens',
          colunas: [
            { header: 'Cód.', dataKey: 'CD_PRODUTO' },
            { header: 'Produto', dataKey: 'DESCRICAO_PRODUTO' },
            { header: 'Seção', dataKey: 'DESCRICAO_SECAO' },
            { header: 'Qtd estoque', dataKey: 'sum_ESTOQUE_ON_HAND_LOJA_QTD' },
            { header: 'Custo R$', dataKey: 'sum_VALOR_ESTOQUE_LOJA_A_CUSTO' },
          ],
          rows: (d.sem4s_top || []).slice(0, 30),
        },
        {
          titulo: 'Giro Lento — Top itens',
          colunas: [
            { header: 'Cód.', dataKey: 'CD_PRODUTO' },
            { header: 'Produto', dataKey: 'DESCRICAO_PRODUTO' },
            { header: 'Seção', dataKey: 'DESCRICAO_SECAO' },
            { header: 'Qtd estoque', dataKey: 'sum_ESTOQUE_ON_HAND_LOJA_QTD' },
            { header: 'Cobertura (d)', dataKey: 'dias_cobertura' },
            { header: 'Custo R$', dataKey: 'sum_VALOR_ESTOQUE_LOJA_A_CUSTO' },
          ],
          rows: (d.giro_lento_top || []).slice(0, 30),
        },
        {
          titulo: 'Suspensos com estoque — Top itens',
          colunas: [
            { header: 'Cód.', dataKey: 'CD_PRODUTO' },
            { header: 'Produto', dataKey: 'DESCRICAO_PRODUTO' },
            { header: 'Seção', dataKey: 'DESCRICAO_SECAO' },
            { header: 'Motivo', dataKey: 'DESC_MOTIVO_SUSPENCAO' },
            { header: 'Custo R$', dataKey: 'sum_VALOR_ESTOQUE_LOJA_A_CUSTO' },
          ],
          rows: (d.suspensos_top || []).slice(0, 30),
        },
      ],
    });
  }

  function handleExcel() {
    if (!d) return;
    gerarExcel({
      nomeArquivo: 'Estoque',
      abas: [
        {
          nome: 'Resumo',
          colunas: ['Indicador', 'Quantidade', 'Valor R$'],
          rows: [
            ['Ruptura',          t.ruptura_count,    ''],
            ['Urgente <15d',     t.urgente_count,    ''],
            ['Aging +365d',      t.aging_count,      t.aging_custo],
            ['Sem venda 5 sem.', t.sem4s_count,      t.sem4s_custo],
            ['Giro lento',       t.giro_lento_count, t.giro_lento_custo],
            ['Est. negativo',    t.estq_neg_count,   ''],
            ['Suspensos',        t.suspensos_count,  t.suspensos_custo],
          ],
        },
        {
          nome: 'Ruptura',
          colunas: ['Cód.', 'Produto', 'Seção', 'Departamento', 'Venda mês (un)', 'Venda mês R$', 'CD (cx)', 'Separ. CD', 'Trânsito Loja'],
          rows: (d.ruptura_top || []).map(r => [
            r.CD_PRODUTO, r.DESCRICAO_PRODUTO, r.DESCRICAO_SECAO,
            r.DESCRICAO_DEPARTAMENTO, r.sum_QTD_VENDAS_MES_ATUAL,
            r.venda_mes_vlr, r.estoque_cd_cxs || 0,
            r.estoque_separado_cd || 0, r.estoque_transito_loja || 0,
          ]),
        },
        {
          nome: 'Urgente',
          colunas: ['Cód.', 'Produto', 'Seção', 'Estoque', 'Cobertura (dias)', 'Status', 'CD (cx)', 'Separ. CD', 'Trânsito Loja'],
          rows: (d.urgente_top || []).map(r => [
            r.CD_PRODUTO, r.DESCRICAO_PRODUTO, r.DESCRICAO_SECAO,
            r.sum_ESTOQUE_ON_HAND_LOJA_QTD, r.dias_cobertura,
            r.criticidade === 'critico' ? 'Crítico' : r.criticidade === 'urgente' ? 'Urgente' : 'Atenção',
            r.estoque_cd_cxs || 0,
            r.estoque_separado_cd || 0, r.estoque_transito_loja || 0,
          ]),
        },
        {
          nome: 'Aging',
          colunas: ['Cód.', 'Produto', 'Seção', 'Dias NF', 'Qtd estoque', 'Custo R$'],
          rows: (d.aging_top || []).map(r => [
            r.CD_PRODUTO, r.DESCRICAO_PRODUTO, r.DESCRICAO_SECAO,
            r.IDADE_ULTIMA_NF, r.sum_ESTOQUE_ON_HAND_LOJA_QTD, r.sum_VALOR_ESTOQUE_LOJA_A_CUSTO,
          ]),
        },
        {
          nome: 'Sem venda 5s',
          colunas: ['Cód.', 'Produto', 'Seção', 'Qtd estoque', 'Custo R$'],
          rows: (d.sem4s_top || []).map(r => [
            r.CD_PRODUTO, r.DESCRICAO_PRODUTO, r.DESCRICAO_SECAO,
            r.sum_ESTOQUE_ON_HAND_LOJA_QTD, r.sum_VALOR_ESTOQUE_LOJA_A_CUSTO,
          ]),
        },
        {
          nome: 'Giro Lento',
          colunas: ['Cód.', 'Produto', 'Seção', 'Qtd estoque', 'Cobertura (dias)', 'Custo R$'],
          rows: (d.giro_lento_top || []).map(r => [
            r.CD_PRODUTO, r.DESCRICAO_PRODUTO, r.DESCRICAO_SECAO,
            r.sum_ESTOQUE_ON_HAND_LOJA_QTD, r.dias_cobertura, r.sum_VALOR_ESTOQUE_LOJA_A_CUSTO,
          ]),
        },
        {
          nome: 'Est. Negativo',
          colunas: ['Cód.', 'Produto', 'Seção', 'Qtd', 'Dias sem NF'],
          rows: (d.estq_neg_top || []).map(r => [
            r.CD_PRODUTO, r.DESCRICAO_PRODUTO, r.DESCRICAO_SECAO,
            r.sum_ESTOQUE_ON_HAND_LOJA_QTD, r.IDADE_ULTIMA_NF,
          ]),
        },
        {
          nome: 'Suspensos',
          colunas: ['Cód.', 'Produto', 'Seção', 'Motivo', 'Custo R$'],
          rows: (d.suspensos_top || []).map(r => [
            r.CD_PRODUTO, r.DESCRICAO_PRODUTO, r.DESCRICAO_SECAO,
            r.DESC_MOTIVO_SUSPENCAO, r.sum_VALOR_ESTOQUE_LOJA_A_CUSTO,
          ]),
        },
      ],
    });
  }

  function handleWhatsApp() {
    if (!d) return;
    const filtroTxt = secoesSel.length ? `\n🏷️ Seções: ${secoesSel.join(', ')}` : '';
    compartilharWhatsApp([
      `📦 *Painel de Estoque*${filtroTxt}`,
      `📅 Extração: ${d.gerado_em}`,
      ``,
      `🔴 Ruptura: ${n0(t.ruptura_count)} itens${t.ruptura_com_cd_count > 0 ? ` (${n0(t.ruptura_com_cd_count)} c/ CD disponível)` : ''}`,
      `🟡 Urgente <15d: ${n0(t.urgente_count)} itens | <30d: ${n0(t.urgente_30_count)} itens${t.urgente_com_cd_count > 0 ? ` (${n0(t.urgente_com_cd_count)} c/ CD)` : ''}`,
      `🟣 Aging +365d: ${n0(t.aging_count)} itens — ${brl(t.aging_custo)}`,
      `🟣 Sem venda 5s: ${n0(t.sem4s_count)} itens — ${brl(t.sem4s_custo)}`,
      `🟡 Giro lento: ${n0(t.giro_lento_count)} itens — ${brl(t.giro_lento_custo)}`,
      `🔴 Est. negativo: ${n0(t.estq_neg_count)} itens`,
      `🟠 Suspensos c/ estoque: ${n0(t.suspensos_count)} itens — ${brl(t.suspensos_custo)}`,
    ].join('\n'));
  }

  function handleEmail() {
    if (!d) return;
    compartilharEmail({
      assunto: `Painel de Estoque — ${d.gerado_em}${filtroLabel}`,
      corpo: [
        `Painel de Estoque`,
        `Extração: ${d.gerado_em} | Arquivo: ${d.arquivo}`,
        secoesSel.length ? `Seções filtradas: ${secoesSel.join(', ')}` : '',
        ``,
        `Ruptura: ${n0(t.ruptura_count)} itens${t.ruptura_com_cd_count > 0 ? ` (${n0(t.ruptura_com_cd_count)} com CD disponível)` : ''}`,
        `Urgente <15d: ${n0(t.urgente_count)} itens | <30d: ${n0(t.urgente_30_count)} itens${t.urgente_com_cd_count > 0 ? ` (${n0(t.urgente_com_cd_count)} com CD)` : ''}`,
        `Aging +365d: ${n0(t.aging_count)} itens — ${brl(t.aging_custo)}`,
        `Sem venda 5s: ${n0(t.sem4s_count)} itens — ${brl(t.sem4s_custo)}`,
        `Giro lento: ${n0(t.giro_lento_count)} itens — ${brl(t.giro_lento_custo)}`,
        `Estoque negativo: ${n0(t.estq_neg_count)} itens`,
        `Suspensos c/ estoque: ${n0(t.suspensos_count)} itens — ${brl(t.suspensos_custo)}`,
      ].filter(l => l !== '').join('\n'),
    });
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Painel de Estoque</h1>
          {dados?.gerado_em && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>
              Extração: {dados.gerado_em} · {dados.arquivo}
              {filtroLabel && <span style={{ color: '#e8681a', fontWeight: 600 }}>{filtroLabel}</span>}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {secoesDisponiveis.length > 0 && (
            <FiltroSecoes
              secoes={secoesDisponiveis}
              selecionadas={secoesSel}
              onChange={setSecoesSel}
            />
          )}
          <ExportMenu
            disabled={!d}
            onPDF={handlePDF}
            onExcel={handleExcel}
            onWhatsApp={handleWhatsApp}
            onEmail={handleEmail}
          />
        </div>
      </div>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', color: 'var(--text-muted)' }}>
          Carregando...
        </div>
      )}

      {!loading && !dados && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <Package size={36} style={{ marginBottom: 12, opacity: .4 }} />
          <p>Nenhum dado importado ainda.<br />Use <strong>Importador de Estoque</strong> para enviar a planilha.</p>
        </div>
      )}

      {!loading && d && (
        <>
          {/* KPI destaque — acervo ativo (sempre total, sem filtro de seção) */}
          <div
            onClick={() => setTab(0)}
            style={{ cursor: 'pointer', background: 'linear-gradient(135deg,#0ea5e9 0%,#0284c7 100%)',
              borderRadius: 14, padding: '16px 20px', marginBottom: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.75)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: .5 }}>
                Acervo Ativo no Clube
              </div>
              <div style={{ fontSize: 32, fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>
                {n0(dados.totais.ativos_total)}
                <span style={{ fontSize: 13, fontWeight: 400, marginLeft: 8 }}>itens ativos</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{n0(dados.totais.ativos_zero_count)}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,.7)' }}>Zero estoque</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#fde68a' }}>{n0(dados.totais.ativos_zero_venda_5s)}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,.7)' }}>Zero c/ venda 5s</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#fca5a5' }}>{n0(dados.totais.ativos_zero_venda_mes)}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,.7)' }}>Zero c/ venda mês</div>
              </div>
              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,.6)', fontSize: 11, alignSelf: 'center' }}>
                Ver relatório →
              </div>
            </div>
          </div>

          {/* KPIs resumo */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
            <KpiCard label="Ruptura"       value={n0(t.ruptura_count)}    cor="#ef4444" sub="itens sem estoque" />
            <KpiCard label="Urgente <15d"  value={n0(t.urgente_count)}    cor="#f59e0b" sub="risco de ruptura" />
            <KpiCard label="Aging +365d"   value={n0(t.aging_count)}      cor="#6366f1" sub={brl(t.aging_custo)} />
            <KpiCard label="Sem venda 5s"  value={n0(t.sem4s_count)}      cor="#8b5cf6" sub={brl(t.sem4s_custo)} />
            <KpiCard label="Giro lento"    value={n0(t.giro_lento_count)} cor="#f59e0b" sub={brl(t.giro_lento_custo)} />
            <KpiCard label="Est. negativo" value={n0(t.estq_neg_count)}   cor="#ef4444" />
            <KpiCard label="Suspensos"     value={n0(t.suspensos_count)}  cor="#e8681a" sub={brl(t.suspensos_custo)} />
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 20, overflowX: 'auto' }}>
            {TABS.map((tb, i) => (
              <button key={tb.id} onClick={() => setTab(i)}
                style={{ background: 'none', border: 'none',
                  borderBottom: tab === i ? `2px solid ${tb.cor}` : '2px solid transparent',
                  color: tab === i ? tb.cor : 'var(--text-muted)',
                  fontWeight: tab === i ? 700 : 400, fontSize: 13,
                  padding: '8px 14px', cursor: 'pointer', whiteSpace: 'nowrap',
                  transition: 'all .15s' }}>
                {tb.label}
              </button>
            ))}
          </div>

          <div>
            {tab === 0 && <TabAcervo     d={d} />}
            {tab === 1 && <TabRuptura    d={d} />}
            {tab === 2 && <TabUrgente    d={d} />}
            {tab === 3 && <TabAging      d={d} />}
            {tab === 4 && <TabSem4s      d={d} />}
            {tab === 5 && <TabGiroLento  d={d} />}
            {tab === 6 && <TabNegativo   d={d} />}
            {tab === 7 && <TabSuspensos  d={d} />}
          </div>
        </>
      )}
    </div>
  );
}
