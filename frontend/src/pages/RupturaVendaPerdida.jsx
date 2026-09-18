import React, { useMemo, useState } from 'react';
import { Search, Download } from 'lucide-react';
import { calcularRuptura, JANELAS } from '../lib/ruptura';
import { gerarExcel } from '../lib/exportUtils';

// ─────────────────────────────────────────────────────────────
// Ruptura e Venda Perdida.
//
// Esta tela NÃO calcula nada: chama calcularRuptura() do módulo único e só
// desenha. Toda regra de negócio está em lib/ruptura.js, provada contra a
// extração real de 17/09 pelo scripts/testar-ruptura.mjs. Mudança de regra
// é lá, e passa pelo teste.
// ─────────────────────────────────────────────────────────────

const brl = v => 'R$ ' + Math.round(v || 0).toLocaleString('pt-BR');
const n0  = v => Math.round(v || 0).toLocaleString('pt-BR');
const pct = v => (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
const dataBR = iso => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—';
const TAB = { fontVariantNumeric: 'tabular-nums' };

// Cores semânticas do pedido: vermelho ruptura/perda, amarelo atenção
// (tem CD), azul neutro, verde tem estoque no CD.
const COR = { vermelho: '#dc2626', amarelo: '#d97706', azul: '#2563eb', verde: '#16a34a', cinza: '#6b7280' };

function KPI({ valor, rotulo, sub, cor }) {
  return (
    <div className="card" style={{ padding: '14px 16px', borderTop: `3px solid ${cor || 'var(--border)'}` }}>
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: .3 }}>{rotulo}</div>
      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.15, marginTop: 4, color: cor || 'var(--text)', ...TAB }}>{valor}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Barras({ titulo, linhas, cor, valor = x => x.vendaPerdida, rotuloValor = brl, extra }) {
  const max = Math.max(...linhas.map(valor), 1);
  return (
    <div className="card">
      <h3 style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>{titulo}</h3>
      {linhas.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Nada nesta seleção.</div>}
      {linhas.map(l => (
        <div key={l.nome ?? l.faixa} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5, marginBottom: 3 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{l.nome ?? l.faixa}</span>
            <span style={{ flexShrink: 0, ...TAB }}>
              <b>{rotuloValor(valor(l))}</b>
              <span style={{ color: 'var(--text-muted)' }}> {extra ? extra(l) : `(${n0(l.itens)} ${l.itens === 1 ? 'item' : 'itens'})`}</span>
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 99, background: 'var(--surface-2)', overflow: 'hidden' }}>
            <div style={{ width: `${(valor(l) / max) * 100}%`, height: '100%', background: cor, borderRadius: 99 }}/>
          </div>
        </div>
      ))}
    </div>
  );
}

function BadgeDias({ dias }) {
  if (dias == null) return <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>sem data</span>;
  const cor = dias <= 7 ? COR.vermelho : dias <= 30 ? COR.amarelo : COR.cinza;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: cor, background: `${cor}18`, borderRadius: 99, padding: '2px 8px', ...TAB }}>
      {dias} {dias === 1 ? 'dia' : 'dias'}
    </span>
  );
}

function BadgeCd({ cd }) {
  return cd > 0
    ? <span style={{ fontSize: 11, fontWeight: 700, color: COR.verde, background: `${COR.verde}18`, borderRadius: 99, padding: '2px 8px', ...TAB }}>{n0(cd)} cxs</span>
    : <span style={{ fontSize: 11, fontWeight: 700, color: COR.vermelho, background: `${COR.vermelho}14`, borderRadius: 99, padding: '2px 8px' }}>sem CD</span>;
}

// Cinco semanas de venda. Na extração, SEMANA_1 é a mais recente e SEMANA_5 a
// mais antiga (provado: nos itens com 14+ dias sem venda, SEMANA_1 é sempre
// zero). Desenha invertido, da mais antiga à mais recente, para ler como
// linha do tempo. Semana zerada vira uma barra vermelha de 2px.
function Semanas({ sw }) {
  const semanas = [...(sw || [])].reverse();
  const max = Math.max(...semanas, 1);
  return (
    <div title={'5 semanas (antiga → recente): ' + semanas.map(v => brl(v)).join(' · ')}
      style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 18 }}>
      {semanas.map((v, idx) => (
        <span key={idx} style={{ width: 6, borderRadius: 1,
          height: v > 0 ? Math.max(3, Math.round((v / max) * 18)) : 2,
          background: v > 0 ? COR.azul : COR.vermelho }}/>
      ))}
    </div>
  );
}

const TH = ({ children, alinha = 'left' }) => (
  <th style={{ textAlign: alinha, padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
               textTransform: 'uppercase', letterSpacing: .3, whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>{children}</th>
);
const TD = ({ children, alinha = 'left', style }) => (
  <td style={{ textAlign: alinha, padding: '8px 10px', fontSize: 12.5, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', ...TAB, ...style }}>{children}</td>
);

function Tabela({ linhas, comBadgeCd, pagina, porPagina }) {
  const inicio = pagina * porPagina;
  const visiveis = porPagina ? linhas.slice(inicio, inicio + porPagina) : linhas;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1500 }}>
        <thead><tr>
          <TH>Código</TH><TH>Descrição</TH><TH>Portfólio</TH><TH>Seção</TH><TH>Fornecedor</TH>
          <TH alinha="right">{comBadgeCd ? 'CD' : 'CD (cxs)'}</TH>
          <TH alinha="right">Venda média/dia</TH><TH alinha="right">Preço</TH>
          <TH>Última venda</TH><TH>Dias s/ venda</TH><TH>Últ. recebimento</TH>
          <TH alinha="right">Perda/dia</TH><TH alinha="right">Venda perdida</TH>
          <TH alinha="right">Mês ant.</TH><TH alinha="right">Mês atual</TH><TH>5 semanas</TH><TH alinha="right">Queda no mês</TH>
        </tr></thead>
        <tbody>
          {visiveis.map(i => (
            <tr key={i.c}>
              <TD>{i.c}</TD>
              <TD style={{ whiteSpace: 'normal', minWidth: 220 }}>{i.d}</TD>
              <TD>{i.portfolio}</TD><TD>{i.secao}</TD>
              <TD style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }} title={i.fornecedor}>{i.fornecedor}</TD>
              <TD alinha="right">{comBadgeCd ? <BadgeCd cd={i.cd}/> : n0(i.cd)}</TD>
              <TD alinha="right">{i.vm.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</TD>
              <TD alinha="right">{brl(i.pr)}</TD>
              <TD>{dataBR(i.uv)}</TD>
              <TD><BadgeDias dias={i.dias}/></TD>
              <TD>{dataBR(i.rc)}</TD>
              <TD alinha="right">{brl(i.vpDia)}</TD>
              <TD alinha="right" style={{ fontWeight: 700, color: COR.vermelho }}>{brl(i.vp)}</TD>
              <TD alinha="right">{brl(i.va)}</TD>
              <TD alinha="right">{brl(i.vendidoMes)}</TD>
              <TD><Semanas sw={i.sw}/></TD>
              <TD alinha="right" style={{ fontWeight: 700, color: i.queda > 0 ? COR.vermelho : 'var(--text-muted)' }}
                  title={`esperado até o dia da extração: ${brl(i.esperadoMes)} · vendido: ${brl(i.vendidoMes)}`}>{brl(i.queda)}</TD>
            </tr>
          ))}
          {visiveis.length === 0 && (
            <tr><td colSpan={17} style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Nenhum item nesta seleção.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function RupturaVendaPerdida({ bloco }) {
  const [janela, setJanela] = useState(30);
  const [filtros, setFiltros] = useState({ portfolio: '', departamento: '', secao: '', fornecedor: '', busca: '' });
  const [abaTabela, setAbaTabela] = useState('cd');
  const [pagina, setPagina] = useState(0);
  const POR_PAGINA = 40;

  const r = useMemo(() => bloco ? calcularRuptura(bloco, { janela, filtros }) : null, [bloco, janela, filtros]);

  if (!bloco) return (
    <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
      <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Este painel precisa de uma importação nova</div>
      <div style={{ fontSize: 13, lineHeight: 1.6 }}>
        A extração que está salva foi importada antes deste painel existir. Importe a extração
        DASH259 de novo em <b>Importador de Estoque</b> — os outros relatórios continuam iguais.
      </div>
    </div>
  );

  const k = r.kpis;
  const mudar = (campo, valor) => { setFiltros(f => ({ ...f, [campo]: valor })); setPagina(0); };
  const rotuloJanela = janela === 'todos' ? 'todos os dias' : `até ${janela} dias sem venda`;

  const exportar = () => {
    const linha = i => [i.c, i.d, i.portfolio, i.departamento, i.secao, i.fornecedor, i.cd, i.vm, i.pr,
                        dataBR(i.uv), i.dias ?? '', dataBR(i.rc), Math.round(i.vpDia), Math.round(i.vp),
                        Math.round(i.va), Math.round(i.vendidoMes), Math.round(i.esperadoMes), Math.round(i.queda),
                        ...[...(i.sw || [])].reverse().map(v => Math.round(v))];
    const colunas = ['Código', 'Descrição', 'Portfólio', 'Departamento', 'Seção', 'Fornecedor', 'Estoque CD (cxs)',
                     'Venda média/dia', 'Preço', 'Última venda', 'Dias sem venda', 'Último recebimento', 'Venda perdida/dia', 'Venda perdida',
                     'Venda mês anterior', 'Venda mês atual', `Esperado até dia ${k.diaDoMes}`, 'Queda no mês',
                     'Semana -5', 'Semana -4', 'Semana -3', 'Semana -2', 'Semana -1'];
    gerarExcel({
      nomeArquivo: `Ruptura_${r.dataExtracao}`,
      abas: [
        { nome: 'Ruptura_Ativos', colunas, rows: r.tabelaVp.map(linha) },
        { nome: 'Ruptura_com_CD', colunas, rows: r.tabelaCd.map(linha) },
      ],
    });
  };

  const sel = (campo, rotulo) => (
    <select className="select" value={filtros[campo]} onChange={e => mudar(campo, e.target.value)} style={{ fontSize: 12.5, minWidth: 150 }}>
      <option value="">{rotulo}: todos</option>
      {r.opcoes[campo].map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  const funil = [
    { nome: 'Suspensos', valor: k.suspensos, cor: COR.cinza },
    { nome: 'Ativos sem venda média', valor: k.semVenda, cor: '#94a3b8' },
    { nome: 'Com venda, abastecidos', valor: k.abastecidos, cor: COR.azul },
    { nome: 'Em ruptura', valor: k.ruptura, cor: COR.vermelho },
  ];
  const totalFunil = funil.reduce((s, f) => s + f.valor, 0) || 1;

  const tabela = abaTabela === 'cd' ? r.tabelaCd : r.tabelaVp;
  const totalTabela = tabela.reduce((s, i) => s + i.vp, 0);
  const paginas = Math.max(1, Math.ceil(tabela.length / POR_PAGINA));

  return (
    <div>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17 }}>
            {bloco.loja || 'Loja'}{bloco.uf ? ` · ${bloco.uf}` : ''}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
            Extração de <b>{bloco.extraido_em || dataBR(bloco.data_extracao)}</b>
            {bloco.origem_data === 'data de hoje' && ' (data não lida do arquivo; usando hoje)'}
            {' · '}{n0(bloco.linhas_total)} linhas · {n0(bloco.suspensos_total)} suspensos
          </div>
        </div>
        <button className="btn btn-sm" onClick={exportar} disabled={!r.tabelaVp.length}>
          <Download size={13}/> Exportar ruptura (xlsx)
        </button>
      </div>

      {/* Filtros */}
      <div className="card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '10px 12px', marginBottom: 16 }}>
        {sel('portfolio', 'Portfólio')}
        {sel('departamento', 'Departamento')}
        {sel('secao', 'Seção')}
        {sel('fornecedor', 'Fornecedor')}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Janela:</span>
          {JANELAS.map(j => (
            <button key={j} onClick={() => { setJanela(j); setPagina(0); }}
              style={{ padding: '4px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                       background: janela === j ? 'var(--primary)' : 'var(--surface-2)',
                       color: janela === j ? '#fff' : 'var(--text-muted)',
                       border: `1px solid ${janela === j ? 'var(--primary)' : 'var(--border)'}` }}>
              {j === 'todos' ? 'Todos' : `${j}d`}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 180 }}>
          <Search size={14} style={{ color: 'var(--text-muted)' }}/>
          <input className="input" placeholder="Código ou descrição" value={filtros.busca}
            onChange={e => mudar('busca', e.target.value)} style={{ fontSize: 12.5, flex: 1 }}/>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 16 }}>
        <KPI valor={n0(k.ativos)} rotulo="Itens ativos" sub={`${n0(k.ativosComVenda)} com venda média > 0`} cor={COR.azul}/>
        <KPI valor={n0(k.ruptura)} rotulo="Em ruptura" sub={`${pct(k.pctRuptura)} dos ativos com venda · ${pct(k.pctRupturaSobreAtivos)} dos ativos`} cor={COR.vermelho}/>
        <KPI valor={n0(k.rupturaCd)} rotulo="Ruptura com estoque no CD" sub={`reposição imediata · ${pct(k.pctRupturaCd)} da ruptura`} cor={COR.amarelo}/>
        <KPI valor={brl(k.vendaPerdida)} rotulo={`Venda perdida (${janela === 'todos' ? 'todos' : janela + 'd'})`} sub={`${n0(k.rupturaJanela)} itens, ${rotuloJanela}`} cor={COR.vermelho}/>
        <KPI valor={brl(k.vendaPerdidaDia)} rotulo="Venda perdida por dia" sub="soma da venda média × preço" cor={COR.vermelho}/>
        <KPI valor={brl(k.quedaObservada)} rotulo="Queda observada no mês"
          sub={`vendeu ${brl(k.vendidoMes)} de ${brl(k.esperadoMes)} esperados até o dia ${k.diaDoMes}`} cor={COR.vermelho}/>
        <KPI valor={brl(k.vendaMesAntRisco)} rotulo="Venda mês anterior em risco" sub="dos itens em ruptura na janela" cor={COR.cinza}/>
      </div>

      {/* Funil */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>De todos os itens até a ruptura</h3>
        <div style={{ display: 'flex', height: 22, borderRadius: 6, overflow: 'hidden' }}>
          {funil.map(f => (
            <div key={f.nome} title={`${f.nome}: ${n0(f.valor)}`}
              style={{ width: `${(f.valor / totalFunil) * 100}%`, background: f.cor, minWidth: f.valor ? 2 : 0 }}/>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10 }}>
          {funil.map(f => (
            <div key={f.nome} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: f.cor, display: 'inline-block' }}/>
              {f.nome}: <b style={TAB}>{n0(f.valor)}</b>
            </div>
          ))}
        </div>
      </div>

      {/* Gráficos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12, marginBottom: 16 }}>
        <Barras titulo={`Venda perdida por portfólio (${rotuloJanela})`} linhas={r.porPortfolio} cor={COR.vermelho}/>
        <Barras titulo={`Itens em ruptura por dias sem venda (${n0(k.ruptura)} itens, sem janela)`} linhas={r.faixas.map(f => ({ ...f, nome: f.faixa }))}
          cor={COR.amarelo} valor={x => x.itens} rotuloValor={n0} extra={l => `· ${brl(l.vendaPerdida)} acumulada`}/>
        <Barras titulo={`Top 12 seções por venda perdida`} linhas={r.porSecao} cor={COR.vermelho}/>
        <Barras titulo={`Top 10 fornecedores por venda perdida`} linhas={r.porFornecedor} cor={COR.vermelho}/>
      </div>

      {/* Tabela */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
          {[['cd', `Com estoque no CD (${r.tabelaCd.length})`], ['vp', `Maior venda perdida (${r.tabelaVp.length})`]].map(([id, rot]) => (
            <button key={id} onClick={() => { setAbaTabela(id); setPagina(0); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px 14px', fontSize: 13,
                       fontWeight: abaTabela === id ? 700 : 400,
                       color: abaTabela === id ? (id === 'cd' ? COR.verde : COR.vermelho) : 'var(--text-muted)',
                       borderBottom: `2px solid ${abaTabela === id ? (id === 'cd' ? COR.verde : COR.vermelho) : 'transparent'}` }}>
              {rot}
            </button>
          ))}
        </div>
        <Tabela linhas={tabela} comBadgeCd={abaTabela === 'vp'} pagina={abaTabela === 'vp' ? pagina : 0} porPagina={abaTabela === 'vp' ? POR_PAGINA : 0}/>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, ...TAB }}>
            {n0(tabela.length)} itens · {brl(totalTabela)} de venda perdida
          </div>
          {abaTabela === 'vp' && paginas > 1 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5 }}>
              <button className="btn btn-sm" disabled={pagina === 0} onClick={() => setPagina(p => p - 1)}>‹</button>
              <span style={TAB}>{pagina + 1} / {paginas}</span>
              <button className="btn btn-sm" disabled={pagina >= paginas - 1} onClick={() => setPagina(p => p + 1)}>›</button>
            </div>
          )}
        </div>
      </div>

      {/* Como foi calculado */}
      <div className="card" style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
        <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Como foi calculado</div>
        <b>Ativo</b> = MOTIVO_SUSPENCAO igual a 0 (PRODUTO_STATUS não é usado). <b>Suspenso</b> = qualquer outro motivo.{' '}
        <b>Ativo com venda</b> = ativo com venda média maior que 0.{' '}
        <b>Ruptura</b> = ativo, estoque da loja menor ou igual a 0 e venda média maior que 0.{' '}
        <b>Ruptura com CD</b> = ruptura com estoque no CD maior que 0.{' '}
        <b>Data da extração</b> = lida do nome do arquivo ({bloco.extraido_em || dataBR(bloco.data_extracao)}).{' '}
        <b>Dias sem venda</b> = data da extração − última venda.{' '}
        <b>Venda perdida por dia</b> = venda média × preço médio; <b>venda perdida</b> = por dia × dias sem venda (mínimo 1).{' '}
        <b>Janela</b> = só itens com até N dias sem venda, para deixar de fora sazonais que seguem ativos no cadastro.{' '}
        <b>% ruptura</b> = ruptura ÷ ativos com venda; o percentual sobre todos os ativos aparece como secundário.{' '}
        <b>Queda observada</b> = fato contra fato: o ritmo do item é a média das semanas em que ele vendeu (entre as 5 últimas — as
        zeradas são a própria ruptura e ficam fora); esse ritmo projetado até o dia {k.diaDoMes} é o <b>esperado</b>, e a queda é o
        esperado menos o que o mês atual de fato registrou (nunca negativa). Sem semana com venda, usa o mês anterior proporcional aos dias.{' '}
        <b>5 semanas</b> = barras da mais antiga (esquerda) à mais recente (direita); barra vermelha = semana sem venda.
      </div>
    </div>
  );
}
