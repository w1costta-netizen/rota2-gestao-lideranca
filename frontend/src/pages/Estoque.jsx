import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Package } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ExportMenu from '../components/ExportMenu';
import { gerarPDF, gerarExcel, compartilharWhatsApp, compartilharEmail } from '../lib/exportUtils';

const brl = v => v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const n0  = v => v == null ? '—' : Math.round(v).toLocaleString('pt-BR');
const n1  = v => v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const TABS = [
  { id: 'ruptura',    label: 'Ruptura',      cor: '#ef4444' },
  { id: 'urgente',    label: 'Urgente',      cor: '#f59e0b' },
  { id: 'aging',      label: 'Aging +365d',  cor: '#6366f1' },
  { id: 'sem4s',      label: 'Sem venda 4s', cor: '#8b5cf6' },
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

function TabRuptura({ d }) {
  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <KpiCard label="Total em ruptura" value={n0(d.totais.ruptura_count)} cor="#ef4444" sub="itens ativos sem estoque com venda" />
        <KpiCard label="Venda perdida/mês" value={n0(d.totais.ruptura_venda_mes)} cor="#ef4444" sub="unidades no mês atual" />
      </div>
      <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10 }}>Por seção</h4>
      <SecaoTable rows={d.secao_ruptura} colunas={[
        { key: 'DESCRICAO_SECAO', label: 'Seção', maxW: 180, wrap: true },
        { key: 'DESCRICAO_DEPARTAMENTO', label: 'Departamento' },
        { key: 'itens', label: 'Itens', right: true },
        { key: 'venda_mes', label: 'Venda mês', right: true, fmt: v => n0(v) },
      ]} />
      <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', margin: '20px 0 10px' }}>Top itens</h4>
      <SecaoTable rows={d.ruptura_top} colunas={[
        { key: 'CD_PRODUTO', label: 'Cód.' },
        { key: 'DESCRICAO_PRODUTO', label: 'Produto', maxW: 220, wrap: true },
        { key: 'DESCRICAO_SECAO', label: 'Seção' },
        { key: 'sum_QTD_VENDAS_MES_ATUAL', label: 'Venda mês', right: true, fmt: v => n0(v) },
      ]} />
    </>
  );
}

function TabUrgente({ d }) {
  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <KpiCard label="Itens urgentes" value={n0(d.totais.urgente_count)} cor="#f59e0b" sub="cobertura < 15 dias" />
      </div>
      <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10 }}>Top itens (menor cobertura)</h4>
      <SecaoTable rows={d.urgente_top} colunas={[
        { key: 'CD_PRODUTO', label: 'Cód.' },
        { key: 'DESCRICAO_PRODUTO', label: 'Produto', maxW: 200, wrap: true },
        { key: 'DESCRICAO_SECAO', label: 'Seção' },
        { key: 'sum_ESTOQUE_ON_HAND_LOJA_QTD', label: 'Estoque', right: true, fmt: v => n1(v) },
        { key: 'dias_cobertura', label: 'Cobertura', right: true,
          fmt: v => v != null ? `${n1(v)}d` : '—',
          cor: r => r.dias_cobertura < 7 ? '#ef4444' : '#f59e0b' },
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
        { key: 'sum_VALOR_ESTOQUE_LOJA_A_CUSTO', label: 'Custo', right: true, fmt: v => brl(v) },
      ]} />
    </>
  );
}

function TabSem4s({ d }) {
  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <KpiCard label="Sem venda nas 4 semanas" value={n0(d.totais.sem4s_count)} cor="#8b5cf6" />
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

export default function Estoque({ profile }) {
  const [dados, setDados]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]       = useState(0);
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

  const t = dados?.totais;

  function handlePDF() {
    if (!dados) return;
    gerarPDF({
      titulo: 'Painel de Estoque',
      subtitulo: `Extração: ${dados.gerado_em} · ${dados.arquivo}`,
      secoes: [
        {
          titulo: 'Resumo de Indicadores',
          colunas: [
            { header: 'Indicador', dataKey: 'indicador' },
            { header: 'Qtd', dataKey: 'qtd' },
            { header: 'Valor (R$)', dataKey: 'valor' },
          ],
          rows: [
            { indicador: 'Ruptura',          qtd: n0(t.ruptura_count),    valor: '—' },
            { indicador: 'Urgente <15d',     qtd: n0(t.urgente_count),    valor: '—' },
            { indicador: 'Aging +365d',      qtd: n0(t.aging_count),      valor: brl(t.aging_custo) },
            { indicador: 'Sem venda 4 sem.', qtd: n0(t.sem4s_count),      valor: brl(t.sem4s_custo) },
            { indicador: 'Giro lento',       qtd: n0(t.giro_lento_count), valor: brl(t.giro_lento_custo) },
            { indicador: 'Est. negativo',    qtd: n0(t.estq_neg_count),   valor: '—' },
            { indicador: 'Suspensos',        qtd: n0(t.suspensos_count),  valor: brl(t.suspensos_custo) },
          ],
        },
        {
          titulo: 'Top Rupturas',
          colunas: [
            { header: 'Cód.', dataKey: 'CD_PRODUTO' },
            { header: 'Produto', dataKey: 'DESCRICAO_PRODUTO' },
            { header: 'Seção', dataKey: 'DESCRICAO_SECAO' },
            { header: 'Venda mês', dataKey: 'sum_QTD_VENDAS_MES_ATUAL' },
          ],
          rows: (dados.ruptura_top || []).slice(0, 20),
        },
        {
          titulo: 'Top Aging',
          colunas: [
            { header: 'Cód.', dataKey: 'CD_PRODUTO' },
            { header: 'Produto', dataKey: 'DESCRICAO_PRODUTO' },
            { header: 'Dias NF', dataKey: 'IDADE_ULTIMA_NF' },
            { header: 'Custo', dataKey: 'sum_VALOR_ESTOQUE_LOJA_A_CUSTO' },
          ],
          rows: (dados.aging_top || []).slice(0, 20),
        },
      ],
    });
  }

  function handleExcel() {
    if (!dados) return;
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
            ['Sem venda 4 sem.', t.sem4s_count,      t.sem4s_custo],
            ['Giro lento',       t.giro_lento_count, t.giro_lento_custo],
            ['Est. negativo',    t.estq_neg_count,   ''],
            ['Suspensos',        t.suspensos_count,  t.suspensos_custo],
          ],
        },
        {
          nome: 'Ruptura',
          colunas: ['Cód.', 'Produto', 'Seção', 'Departamento', 'Venda mês'],
          rows: (dados.ruptura_top || []).map(r => [
            r.CD_PRODUTO, r.DESCRICAO_PRODUTO, r.DESCRICAO_SECAO,
            r.DESCRICAO_DEPARTAMENTO, r.sum_QTD_VENDAS_MES_ATUAL,
          ]),
        },
        {
          nome: 'Urgente',
          colunas: ['Cód.', 'Produto', 'Seção', 'Estoque', 'Cobertura (dias)'],
          rows: (dados.urgente_top || []).map(r => [
            r.CD_PRODUTO, r.DESCRICAO_PRODUTO, r.DESCRICAO_SECAO,
            r.sum_ESTOQUE_ON_HAND_LOJA_QTD, r.dias_cobertura,
          ]),
        },
        {
          nome: 'Aging',
          colunas: ['Cód.', 'Produto', 'Seção', 'Dias NF', 'Custo R$'],
          rows: (dados.aging_top || []).map(r => [
            r.CD_PRODUTO, r.DESCRICAO_PRODUTO, r.DESCRICAO_SECAO,
            r.IDADE_ULTIMA_NF, r.sum_VALOR_ESTOQUE_LOJA_A_CUSTO,
          ]),
        },
        {
          nome: 'Sem venda 4s',
          colunas: ['Cód.', 'Produto', 'Seção', 'Custo R$'],
          rows: (dados.sem4s_top || []).map(r => [
            r.CD_PRODUTO, r.DESCRICAO_PRODUTO, r.DESCRICAO_SECAO,
            r.sum_VALOR_ESTOQUE_LOJA_A_CUSTO,
          ]),
        },
        {
          nome: 'Giro Lento',
          colunas: ['Cód.', 'Produto', 'Seção', 'Cobertura (dias)', 'Custo R$'],
          rows: (dados.giro_lento_top || []).map(r => [
            r.CD_PRODUTO, r.DESCRICAO_PRODUTO, r.DESCRICAO_SECAO,
            r.dias_cobertura, r.sum_VALOR_ESTOQUE_LOJA_A_CUSTO,
          ]),
        },
        {
          nome: 'Suspensos',
          colunas: ['Cód.', 'Produto', 'Seção', 'Motivo', 'Custo R$'],
          rows: (dados.suspensos_top || []).map(r => [
            r.CD_PRODUTO, r.DESCRICAO_PRODUTO, r.DESCRICAO_SECAO,
            r.DESC_MOTIVO_SUSPENCAO, r.sum_VALOR_ESTOQUE_LOJA_A_CUSTO,
          ]),
        },
      ],
    });
  }

  function handleWhatsApp() {
    if (!dados) return;
    const txt = [
      `📦 *Painel de Estoque*`,
      `📅 Extração: ${dados.gerado_em}`,
      ``,
      `🔴 Ruptura: ${n0(t.ruptura_count)} itens`,
      `🟡 Urgente <15d: ${n0(t.urgente_count)} itens`,
      `🟣 Aging +365d: ${n0(t.aging_count)} itens — ${brl(t.aging_custo)}`,
      `🟣 Sem venda 4s: ${n0(t.sem4s_count)} itens — ${brl(t.sem4s_custo)}`,
      `🟡 Giro lento: ${n0(t.giro_lento_count)} itens — ${brl(t.giro_lento_custo)}`,
      `🔴 Est. negativo: ${n0(t.estq_neg_count)} itens`,
      `🟠 Suspensos c/ estoque: ${n0(t.suspensos_count)} itens — ${brl(t.suspensos_custo)}`,
    ].join('\n');
    compartilharWhatsApp(txt);
  }

  function handleEmail() {
    if (!dados) return;
    compartilharEmail({
      assunto: `Painel de Estoque — ${dados.gerado_em}`,
      corpo: [
        `Painel de Estoque`,
        `Extração: ${dados.gerado_em} | Arquivo: ${dados.arquivo}`,
        ``,
        `Ruptura: ${n0(t.ruptura_count)} itens`,
        `Urgente <15d: ${n0(t.urgente_count)} itens`,
        `Aging +365d: ${n0(t.aging_count)} itens — ${brl(t.aging_custo)}`,
        `Sem venda 4s: ${n0(t.sem4s_count)} itens — ${brl(t.sem4s_custo)}`,
        `Giro lento: ${n0(t.giro_lento_count)} itens — ${brl(t.giro_lento_custo)}`,
        `Estoque negativo: ${n0(t.estq_neg_count)} itens`,
        `Suspensos c/ estoque: ${n0(t.suspensos_count)} itens — ${brl(t.suspensos_custo)}`,
      ].join('\n'),
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
            </p>
          )}
        </div>
        <ExportMenu
          disabled={!dados}
          onPDF={handlePDF}
          onExcel={handleExcel}
          onWhatsApp={handleWhatsApp}
          onEmail={handleEmail}
        />
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

      {!loading && dados && (
        <>
          {/* KPIs resumo */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
            <KpiCard label="Ruptura"       value={n0(t.ruptura_count)}    cor="#ef4444" sub="itens sem estoque" />
            <KpiCard label="Urgente <15d"  value={n0(t.urgente_count)}    cor="#f59e0b" sub="risco de ruptura" />
            <KpiCard label="Aging +365d"   value={n0(t.aging_count)}      cor="#6366f1" sub={brl(t.aging_custo)} />
            <KpiCard label="Sem venda 4s"  value={n0(t.sem4s_count)}      cor="#8b5cf6" sub={brl(t.sem4s_custo)} />
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
            {tab === 0 && <TabRuptura    d={dados} />}
            {tab === 1 && <TabUrgente    d={dados} />}
            {tab === 2 && <TabAging      d={dados} />}
            {tab === 3 && <TabSem4s      d={dados} />}
            {tab === 4 && <TabGiroLento  d={dados} />}
            {tab === 5 && <TabNegativo   d={dados} />}
            {tab === 6 && <TabSuspensos  d={dados} />}
          </div>
        </>
      )}
    </div>
  );
}
