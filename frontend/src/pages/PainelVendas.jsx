import React, { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, Minus, ChevronDown, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';

const TABS = ['Geral', 'Departamentos', 'Categorias', 'Itens', 'Atenção'];

function KpiCard({ label, value, sub, cor }) {
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12,
      padding:'16px 20px', flex:1, minWidth: 130 }}>
      <div style={{ fontSize:11, color:'var(--text-muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:.5 }}>{label}</div>
      <div style={{ fontSize:24, fontWeight:800, color: cor || 'var(--text)', marginTop:4 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>{sub}</div>}
    </div>
  );
}

function BarraProgresso({ pct }) {
  const cor = pct >= 100 ? '#22c55e' : pct >= 70 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ background:'var(--border)', borderRadius:4, height:6, overflow:'hidden', flex:1, minWidth:60 }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, background:cor, height:'100%', transition:'width .4s' }}/>
    </div>
  );
}

function IconeTendencia({ pct }) {
  if (pct >= 100) return <TrendingUp size={14} color="#22c55e"/>;
  if (pct >= 70) return <Minus size={14} color="#f59e0b"/>;
  return <TrendingDown size={14} color="#ef4444"/>;
}

function fmt(n) {
  if (n >= 1000000) return `R$ ${(n/1000000).toFixed(1)}M`;
  if (n >= 1000) return `R$ ${(n/1000).toFixed(0)}K`;
  return `R$ ${n.toFixed(0)}`;
}

function TabelaLinhas({ linhas, semMeta }) {
  if (!linhas.length) return <p style={{ color:'var(--text-muted)', fontSize:13 }}>Sem dados.</p>;
  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
        <thead>
          <tr style={{ borderBottom:'1px solid var(--border)' }}>
            <th style={{ textAlign:'left', padding:'8px 4px', color:'var(--text-muted)', fontWeight:600, fontSize:11 }}>Nome</th>
            <th style={{ textAlign:'right', padding:'8px 4px', color:'var(--text-muted)', fontWeight:600, fontSize:11 }}>Meta</th>
            <th style={{ textAlign:'right', padding:'8px 4px', color:'var(--text-muted)', fontWeight:600, fontSize:11 }}>Realizado</th>
            <th style={{ textAlign:'right', padding:'8px 4px', color:'var(--text-muted)', fontWeight:600, fontSize:11 }}>%</th>
            <th style={{ width:100, padding:'8px 4px' }}></th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => {
            const cor = l.percentual >= 100 ? '#22c55e' : l.percentual >= 70 ? '#f59e0b' : '#ef4444';
            return (
              <tr key={i} style={{ borderBottom:'1px solid var(--border)' }}>
                <td style={{ padding:'10px 4px', color:'var(--text)', fontWeight:500 }}>{l.nome}</td>
                <td style={{ padding:'10px 4px', textAlign:'right', color:'var(--text-muted)' }}>{fmt(l.meta)}</td>
                <td style={{ padding:'10px 4px', textAlign:'right', color:'var(--text)' }}>{fmt(l.realizado)}</td>
                <td style={{ padding:'10px 4px', textAlign:'right', color:cor, fontWeight:700 }}>{l.percentual}%</td>
                <td style={{ padding:'10px 4px' }}><BarraProgresso pct={l.percentual}/></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function PainelVendas({ profile }) {
  const [tab, setTab] = useState(0);
  const [periodo, setPeriodo] = useState('atual');
  const [periodos, setPeriodos] = useState([]);
  const [dados, setDados] = useState([]);
  const [loading, setLoading] = useState(true);

  const company = profile?.company;

  const carregarPeriodos = useCallback(async () => {
    const { data } = await supabase.from('vendas_historico').select('periodo')
      .eq('company', company).order('periodo', { ascending: false });
    const uniq = [...new Set((data || []).map(d => d.periodo))];
    setPeriodos(uniq);
  }, [company]);

  const carregarDados = useCallback(async () => {
    setLoading(true);
    let rows;
    if (periodo === 'atual') {
      const { data } = await supabase.from('vendas_atual').select('*').eq('company', company);
      rows = data || [];
    } else {
      const { data } = await supabase.from('vendas_historico').select('*')
        .eq('company', company).eq('periodo', periodo);
      rows = data || [];
    }
    setDados(rows);
    setLoading(false);
  }, [company, periodo]);

  useEffect(() => { carregarPeriodos(); }, [carregarPeriodos]);
  useEffect(() => { carregarDados(); }, [carregarDados]);

  // Agrupa por tipo
  const canais = dados.filter(d => d.canal).map(d => ({ nome: d.canal, meta: d.meta, realizado: d.realizado, percentual: d.percentual }));
  const deptos = dados.filter(d => d.departamento).map(d => ({ nome: d.departamento, meta: d.meta, realizado: d.realizado, percentual: d.percentual }));
  const cats = dados.filter(d => d.categoria).map(d => ({ nome: d.categoria, meta: d.meta, realizado: d.realizado, percentual: d.percentual }));
  const itens = dados.filter(d => d.item).map(d => ({ nome: d.item, meta: d.meta, realizado: d.realizado, percentual: d.percentual }));

  // KPIs globais (soma de canais ou todos se não tiver canal)
  const base = canais.length ? canais : dados.map(d => ({ meta: d.meta, realizado: d.realizado, percentual: d.percentual }));
  const totalMeta = base.reduce((s, l) => s + (l.meta || 0), 0);
  const totalReal = base.reduce((s, l) => s + (l.realizado || 0), 0);
  const pctGeral = totalMeta > 0 ? Math.round((totalReal / totalMeta) * 100) : 0;
  const corGeral = pctGeral >= 100 ? '#22c55e' : pctGeral >= 70 ? '#f59e0b' : '#ef4444';

  // Atenção: abaixo de 70%
  const atencao = [
    ...canais.filter(l => l.percentual < 70),
    ...deptos.filter(l => l.percentual < 70),
    ...cats.filter(l => l.percentual < 70),
    ...itens.filter(l => l.percentual < 70),
  ].sort((a, b) => a.percentual - b.percentual);

  const periodoLabel = (p) => {
    if (p === 'atual') return 'Mês Atual';
    const [ano, mes] = p.split('-');
    const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return `${nomes[parseInt(mes)-1]}/${ano}`;
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12, marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700, color:'var(--text)', margin:0 }}>Painel de Vendas</h1>
          <p style={{ fontSize:13, color:'var(--text-muted)', margin:'4px 0 0' }}>Acompanhamento de metas e resultados</p>
        </div>
        <div style={{ position:'relative' }}>
          <select
            value={periodo}
            onChange={e => setPeriodo(e.target.value)}
            style={{ appearance:'none', background:'var(--surface)', border:'1px solid var(--border)',
              color:'var(--text)', borderRadius:8, padding:'8px 32px 8px 12px', fontSize:13, cursor:'pointer' }}
          >
            <option value="atual">Mês Atual</option>
            {periodos.map(p => <option key={p} value={p}>{periodoLabel(p)}</option>)}
          </select>
          <ChevronDown size={14} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', pointerEvents:'none' }}/>
        </div>
      </div>

      {loading ? (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'40vh', color:'var(--text-muted)' }}>Carregando...</div>
      ) : !dados.length ? (
        <div style={{ textAlign:'center', padding:60, color:'var(--text-muted)' }}>
          <AlertTriangle size={32} style={{ marginBottom:12, opacity:.4 }}/>
          <p>Nenhum dado para o período selecionado.<br/>Importe um arquivo na tela de Gestão de Vendas.</p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:24 }}>
            <KpiCard label="Meta Total" value={fmt(totalMeta)} />
            <KpiCard label="Realizado" value={fmt(totalReal)} />
            <KpiCard label="Atingimento" value={`${pctGeral}%`} cor={corGeral}
              sub={pctGeral >= 100 ? 'Meta atingida!' : `Faltam ${fmt(totalMeta - totalReal)}`} />
            <KpiCard label="Itens em Alerta" value={atencao.length} cor={atencao.length > 0 ? '#ef4444' : '#22c55e'}
              sub="abaixo de 70%" />
          </div>

          {/* Barra de progresso geral */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'16px 20px', marginBottom:24 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
              <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>Progresso Geral</span>
              <span style={{ fontSize:13, fontWeight:700, color:corGeral }}>{pctGeral}%</span>
            </div>
            <BarraProgresso pct={pctGeral}/>
          </div>

          {/* Tabs */}
          <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'1px solid var(--border)', paddingBottom:0 }}>
            {TABS.map((t, i) => (
              <button key={t} onClick={() => setTab(i)}
                style={{ background:'none', border:'none', borderBottom: tab===i ? '2px solid var(--primary)' : '2px solid transparent',
                  color: tab===i ? 'var(--primary)' : 'var(--text-muted)', fontWeight: tab===i ? 700 : 400,
                  fontSize:13, padding:'8px 14px', cursor:'pointer', transition:'all .15s',
                  display:'flex', alignItems:'center', gap:6 }}>
                {t}
                {t === 'Atenção' && atencao.length > 0 && (
                  <span style={{ background:'#ef4444', color:'#fff', borderRadius:10, padding:'1px 6px', fontSize:10, fontWeight:700 }}>
                    {atencao.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {tab === 0 && (
            <div>
              <h3 style={{ fontSize:14, fontWeight:600, color:'var(--text)', marginBottom:12 }}>Por Canal</h3>
              <TabelaLinhas linhas={canais}/>
            </div>
          )}
          {tab === 1 && (
            <div>
              <h3 style={{ fontSize:14, fontWeight:600, color:'var(--text)', marginBottom:12 }}>Por Departamento</h3>
              <TabelaLinhas linhas={deptos}/>
            </div>
          )}
          {tab === 2 && (
            <div>
              <h3 style={{ fontSize:14, fontWeight:600, color:'var(--text)', marginBottom:12 }}>Por Categoria</h3>
              <TabelaLinhas linhas={cats}/>
            </div>
          )}
          {tab === 3 && (
            <div>
              <h3 style={{ fontSize:14, fontWeight:600, color:'var(--text)', marginBottom:12 }}>Por Item/Produto</h3>
              <TabelaLinhas linhas={itens}/>
            </div>
          )}
          {tab === 4 && (
            <div>
              <h3 style={{ fontSize:14, fontWeight:600, color:'#ef4444', marginBottom:4, display:'flex', alignItems:'center', gap:6 }}>
                <AlertTriangle size={16}/> Itens em Atenção
              </h3>
              <p style={{ fontSize:12, color:'var(--text-muted)', marginBottom:12 }}>Todos os itens abaixo de 70% de atingimento, do pior para o melhor.</p>
              <TabelaLinhas linhas={atencao}/>
            </div>
          )}
        </>
      )}
    </div>
  );
}
