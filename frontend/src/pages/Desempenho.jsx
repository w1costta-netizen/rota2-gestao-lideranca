import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Users, User, Sparkles, AlertTriangle, Lightbulb, ChevronRight } from 'lucide-react';
import api from '../api';
import { useToast } from '../components/Toast';
import Avatar from '../components/Avatar';
import ExportMenu from '../components/ExportMenu';
import { gerarPDF, gerarExcel } from '../lib/exportUtils';

// ─────────────────────────────────────────────────────────────
// Análise de Desempenho — da pessoa e da equipe.
//
// A tela NÃO calcula nada: o servidor (lib/desempenho.js) devolve as notas,
// os indicadores que as geraram e as sugestões. Aqui é só leitura, com
// dois cuidados de desenho:
//  - toda nota vem acompanhada dos números que a explicam;
//  - a lista de insights começa pelos pontos fortes. Quem abre e só vê
//    problema não abre de novo.
// ─────────────────────────────────────────────────────────────

const PERIODOS = [
  { id: '7',   rotulo: '7 dias' },
  { id: '30',  rotulo: '30 dias' },
  { id: '90',  rotulo: '90 dias' },
  { id: 'mes', rotulo: 'Este mês' },
  { id: 'mes_ant', rotulo: 'Mês anterior' },
];

const TIPO = {
  forte:    { rotulo: 'Pontos fortes', cor: '#16a34a', Icone: Sparkles },
  atencao:  { rotulo: 'Atenção',       cor: '#dc2626', Icone: AlertTriangle },
  sugestao: { rotulo: 'Sugestões',     cor: '#2563eb', Icone: Lightbulb },
};

const hojeBR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const curta = iso => (iso ? iso.split('-').reverse().join('/') : '');

function paramsDoPeriodo(id) {
  const hoje = hojeBR();
  const [a, m] = hoje.split('-').map(Number);
  const iso = (y, mo, d) => `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  if (id === 'mes') return { de: iso(a, m, 1), ate: hoje };
  if (id === 'mes_ant') {
    const y = m === 1 ? a - 1 : a, mo = m === 1 ? 12 : m - 1;
    return { de: iso(y, mo, 1), ate: iso(y, mo, new Date(Date.UTC(y, mo, 0)).getUTCDate()) };
  }
  return { dias: id };
}

function Nota({ valor, nivel, tamanho = 44 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
      <span style={{ fontSize: tamanho, fontWeight: 800, lineHeight: 1, color: nivel?.cor || 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
        {valor ?? '—'}
      </span>
      {valor != null && <span style={{ fontSize: tamanho * 0.3, color: 'var(--text-muted)' }}>/100</span>}
    </div>
  );
}

function Selo({ nivel }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: nivel.cor, background: `${nivel.cor}18`, borderRadius: 99, padding: '3px 10px', whiteSpace: 'nowrap' }}>
      {nivel.nome}
    </span>
  );
}

function Barra({ nota, cor }) {
  return (
    <div style={{ height: 8, borderRadius: 99, background: 'var(--surface-2)', overflow: 'hidden' }}>
      <div style={{ width: `${nota ?? 0}%`, height: '100%', background: cor, borderRadius: 99, transition: 'width .4s' }}/>
    </div>
  );
}

function CardDimensao({ d }) {
  return (
    <div className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{d.icone} {d.nome}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>{d.desc}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <Nota valor={d.nota} nivel={d.nivel} tamanho={26}/>
          <div style={{ marginTop: 4 }}><Selo nivel={d.nivel}/></div>
        </div>
      </div>
      <Barra nota={d.nota} cor={d.nivel.cor}/>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '6px 12px' }}>
        {d.indicadores.map(i => (
          <div key={i.rotulo} style={{ fontSize: 12 }}>
            <span style={{ color: 'var(--text-muted)' }}>{i.rotulo}: </span>
            <b style={{ color: i.alerta ? '#dc2626' : 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
              {i.valor}{i.de != null ? <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>/{i.de}</span> : null}
            </b>
          </div>
        ))}
      </div>
    </div>
  );
}

function Insights({ lista, dimensoes, titulo = 'Leitura e sugestões' }) {
  const grupos = ['forte', 'atencao', 'sugestao'].map(t => ({ t, itens: lista.filter(i => i.tipo === t) })).filter(g => g.itens.length);
  if (!grupos.length) return null;
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>{titulo}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
        {grupos.map(({ t, itens }) => {
          const { rotulo, cor, Icone } = TIPO[t];
          return (
            <div key={t}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: cor, textTransform: 'uppercase', letterSpacing: .3, marginBottom: 8 }}>
                <Icone size={14}/> {rotulo} ({itens.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {itens.map((i, idx) => (
                  <div key={idx} style={{ borderLeft: `3px solid ${cor}`, padding: '6px 10px', background: 'var(--surface-2)', borderRadius: '0 8px 8px 0', fontSize: 13, lineHeight: 1.55 }}>
                    {dimensoes?.[i.dimensao] && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>{dimensoes[i.dimensao].icone} {dimensoes[i.dimensao].nome} · </span>}
                    {i.texto}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Desempenho({ userId, profile }) {
  const toast = useToast();
  const [pessoas, setPessoas] = useState([]);
  const [veEquipe, setVeEquipe] = useState(false);
  const [aba, setAba] = useState('pessoa');          // pessoa | equipe
  const [alvo, setAlvo] = useState(userId);
  const [periodo, setPeriodo] = useState('30');
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!userId) return;
    api.get(`/desempenho/pessoas?requester_id=${userId}${profile?.company ? `&company=${encodeURIComponent(profile.company)}` : ''}`)
      .then(r => { setPessoas(r.data.pessoas || []); setVeEquipe(!!r.data.veEquipe); })
      .catch(() => {});
  }, [userId, profile?.company]);

  useEffect(() => {
    if (!userId) return;
    let vivo = true;
    setCarregando(true); setErro(''); setDados(null);
    const p = new URLSearchParams({ requester_id: userId, ...paramsDoPeriodo(periodo) });
    if (profile?.company) p.set('company', profile.company);
    const rota = aba === 'equipe' ? `/desempenho/equipe?${p}` : `/desempenho/pessoa?${p}&user_id=${alvo}`;
    api.get(rota)
      .then(r => { if (vivo) setDados(r.data); })
      .catch(e => { if (vivo) { setDados(null); setErro(e?.response?.data?.error || 'Não foi possível carregar a análise.'); } })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [userId, aba, alvo, periodo, profile?.company]);

  const dimensoes = dados?.dimensoes || {};
  const periodoTexto = dados?.periodo ? `${curta(dados.periodo.de)} a ${curta(dados.periodo.ate)}` : '';
  const listaDims = useMemo(() => (aba === 'pessoa' && dados?.pessoa ? Object.entries(dados.dimensoes || {}) : []), [dados, aba]);

  // ── Exportação ────────────────────────────────────────────────
  const exportarPDF = () => {
    if (!dados) return;
    if (aba === 'pessoa') {
      gerarPDF({
        titulo: `Análise de Desempenho — ${dados.pessoa.nome}`,
        subtitulo: `${profile?.company || ''} · ${periodoTexto} · Nota geral ${dados.geral ?? '—'} (${dados.nivel.nome})`,
        orientacao: 'portrait',
        secoes: [
          { titulo: 'Dimensões', colunas: [{ header: 'Dimensão', dataKey: 'd' }, { header: 'Nota', dataKey: 'n' }, { header: 'Nível', dataKey: 'v' }, { header: 'Indicadores', dataKey: 'i' }],
            rows: listaDims.map(([, d]) => ({ d: d.nome, n: d.nota ?? '—', v: d.nivel.nome, i: d.indicadores.map(x => `${x.rotulo}: ${x.valor}${x.de != null ? '/' + x.de : ''}`).join(' · ') })) },
          { titulo: 'Leitura e sugestões', colunas: [{ header: 'Tipo', dataKey: 't' }, { header: 'Dimensão', dataKey: 'd' }, { header: 'Texto', dataKey: 'x' }],
            rows: [{ t: 'Resumo', d: '', x: dados.mensagem }, ...dados.insights.map(i => ({ t: TIPO[i.tipo].rotulo, d: dimensoes[i.dimensao]?.nome || '', x: i.texto }))] },
        ],
      });
    } else {
      const chaves = Object.keys(dimensoes);
      gerarPDF({
        titulo: `Análise de Desempenho — Equipe`,
        subtitulo: `${dados.loja} · ${periodoTexto} · ${dados.pessoas} pessoas · média ${dados.geral ?? '—'}`,
        secoes: [
          { titulo: 'Por pessoa', colunas: [{ header: 'Pessoa', dataKey: 'p' }, { header: 'Setor', dataKey: 's' }, { header: 'Geral', dataKey: 'g' }, ...chaves.map(k => ({ header: dimensoes[k].nome, dataKey: k }))],
            rows: dados.ranking.map(r => ({ p: r.pessoa.nome, s: r.pessoa.setor || '', g: r.geral ?? '—', ...Object.fromEntries(chaves.map(k => [k, r.notas[k] ?? '—'])) })) },
          { titulo: 'Leitura da equipe', colunas: [{ header: 'Tipo', dataKey: 't' }, { header: 'Texto', dataKey: 'x' }],
            rows: dados.insights.map(i => ({ t: TIPO[i.tipo].rotulo, x: i.texto })) },
        ],
      });
    }
  };
  const exportarExcel = () => {
    if (!dados) return;
    const nome = `desempenho-${aba === 'pessoa' ? dados.pessoa.nome.split(' ')[0].toLowerCase() : 'equipe'}-${(dados.periodo?.de || '').replace(/-/g, '')}`;
    if (aba === 'pessoa') {
      gerarExcel({ nomeArquivo: nome, abas: [
        { nome: 'Dimensões', colunas: ['Dimensão', 'Nota', 'Nível', 'Indicadores'], rows: listaDims.map(([, d]) => [d.nome, d.nota ?? '', d.nivel.nome, d.indicadores.map(x => `${x.rotulo}: ${x.valor}${x.de != null ? '/' + x.de : ''}`).join(' · ')]) },
        { nome: 'Sugestões', colunas: ['Tipo', 'Dimensão', 'Texto'], rows: dados.insights.map(i => [TIPO[i.tipo].rotulo, dimensoes[i.dimensao]?.nome || '', i.texto]) },
      ] });
    } else {
      const chaves = Object.keys(dimensoes);
      gerarExcel({ nomeArquivo: nome, abas: [
        { nome: 'Equipe', colunas: ['Pessoa', 'Setor', 'Geral', ...chaves.map(k => dimensoes[k].nome)], rows: dados.ranking.map(r => [r.pessoa.nome, r.pessoa.setor || '', r.geral ?? '', ...chaves.map(k => r.notas[k] ?? '')]) },
        { nome: 'Leitura', colunas: ['Tipo', 'Texto'], rows: dados.insights.map(i => [TIPO[i.tipo].rotulo, i.texto]) },
      ] });
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 9 }}>
            <Activity size={20} style={{ color: 'var(--primary)' }}/> Análise de Desempenho
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 2 }}>
            O que você registra no app, lido como jornada: onde está forte, onde há ganho e o próximo passo.
          </p>
        </div>
        <ExportMenu disabled={!dados} onPDF={exportarPDF} onExcel={exportarExcel}/>
      </div>

      {/* Controles */}
      <div className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: '10px 12px', marginBottom: 16 }}>
        {veEquipe && (
          <div style={{ display: 'flex', borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--border)' }}>
            {[['pessoa', 'Individual', User], ['equipe', 'Equipe', Users]].map(([id, rotulo, Icone]) => (
              <button key={id} onClick={() => setAba(id)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', border: 'none',
                         background: aba === id ? 'var(--primary)' : 'transparent', color: aba === id ? '#fff' : 'var(--text-muted)' }}>
                <Icone size={14}/> {rotulo}
              </button>
            ))}
          </div>
        )}
        {aba === 'pessoa' && veEquipe && (
          <select className="select" value={alvo} onChange={e => setAlvo(e.target.value)} style={{ fontSize: 12.5, minWidth: 180 }}>
            {pessoas.map(p => <option key={p.id} value={p.id}>{p.id === userId ? `${p.nome} (você)` : p.nome}</option>)}
          </select>
        )}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginLeft: 'auto' }}>
          {PERIODOS.map(p => (
            <button key={p.id} onClick={() => setPeriodo(p.id)}
              style={{ padding: '5px 11px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                       border: `1px solid ${periodo === p.id ? 'var(--primary)' : 'var(--border)'}`,
                       background: periodo === p.id ? 'var(--primary)' : 'transparent',
                       color: periodo === p.id ? '#fff' : 'var(--text-muted)' }}>
              {p.rotulo}
            </button>
          ))}
        </div>
      </div>

      {carregando && <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Analisando o período…</div>}
      {!carregando && erro && <div className="card" style={{ textAlign: 'center', padding: 40, color: '#dc2626' }}>{erro}</div>}

      {/* ── Individual ─────────────────────────────────────────── */}
      {!carregando && dados?.pessoa && aba === 'pessoa' && (
        <>
          <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
            <Avatar avatarUrl={dados.pessoa.avatar_url} name={dados.pessoa.nome} size={56}/>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 800, fontSize: 17 }}>{dados.pessoa.nome}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                {[dados.pessoa.cargo, dados.pessoa.setor].filter(Boolean).join(' · ')}{periodoTexto ? ` · ${periodoTexto}` : ''} · {dados.periodo.diasUteis} dias úteis
              </div>
              <p style={{ fontSize: 13.5, lineHeight: 1.6, marginTop: 8 }}>{dados.mensagem}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: .3 }}>Nota geral</div>
              <Nota valor={dados.geral} nivel={dados.nivel}/>
              <div style={{ marginTop: 6 }}><Selo nivel={dados.nivel}/></div>
            </div>
          </div>

          <Insights lista={dados.insights} dimensoes={dimensoes}/>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, marginBottom: 16 }}>
            {listaDims.map(([k, d]) => <CardDimensao key={k} d={d}/>)}
          </div>

          <div className="card" style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
            <b style={{ color: 'var(--text)' }}>Como é calculado.</b> Nada é digitado: as notas saem do que o app registra quando o trabalho acontece
            (tarefas, agenda, plano de ação, atas, treinamentos, comunicados lidos, diário, conferências, estoque e escala).
            Cada dimensão vale de 0 a 100 e mostra os números que geraram a nota. Dimensão sem registro no período fica "sem dados"
            e não entra na média — ninguém perde nota por não ter recebido tarefa. Níveis: Em construção (&lt;40), No caminho (40–69),
            Consistente (70–84), Referência (85+). Dias úteis = segunda a sábado.
          </div>
        </>
      )}

      {/* ── Equipe ─────────────────────────────────────────────── */}
      {!carregando && dados?.medias && aba === 'equipe' && (
        <>
          <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 800, fontSize: 17 }}>{dados.loja}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{dados.pessoas} pessoas · {periodoTexto}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: .3 }}>Média da equipe</div>
              <Nota valor={dados.geral} nivel={dados.nivel}/>
              <div style={{ marginTop: 6 }}><Selo nivel={dados.nivel}/></div>
            </div>
          </div>

          <Insights lista={dados.insights} dimensoes={dimensoes} titulo="Leitura para o líder"/>

          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Média por dimensão</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px 18px' }}>
              {Object.entries(dados.medias).map(([k, m]) => (
                <div key={k}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                    <span>{m.icone} {m.nome}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}><b style={{ color: m.nivel.cor }}>{m.nota ?? '—'}</b> <span style={{ color: 'var(--text-muted)' }}>· {m.pessoas} {m.pessoas === 1 ? 'pessoa' : 'pessoas'}</span></span>
                  </div>
                  <Barra nota={m.nota} cor={m.nivel.cor}/>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Por pessoa</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Clique numa pessoa para abrir a análise individual com as sugestões dela.</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead><tr>
                  {['Pessoa', 'Geral', ...Object.values(dimensoes).map(d => d.icone + ' ' + d.nome)].map((h, i) => (
                    <th key={i} style={{ textAlign: i === 0 ? 'left' : 'center', padding: '8px 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: .3, whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {dados.ranking.map(r => (
                    <tr key={r.pessoa.id} onClick={() => { setAlvo(r.pessoa.id); setAba('pessoa'); }} style={{ cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                      <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Avatar avatarUrl={r.pessoa.avatar_url} name={r.pessoa.nome} size={26}/>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{r.pessoa.nome}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{[r.pessoa.cargo, r.pessoa.setor].filter(Boolean).join(' · ')}</div>
                          </div>
                          <ChevronRight size={14} style={{ color: 'var(--text-muted)', marginLeft: 4 }}/>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center', padding: 8, borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontWeight: 800, fontSize: 15, color: r.nivel.cor, fontVariantNumeric: 'tabular-nums' }}>{r.geral ?? '—'}</span>
                        <div><Selo nivel={r.nivel}/></div>
                      </td>
                      {Object.keys(dimensoes).map(k => {
                        const n = r.notas[k];
                        const cor = n == null ? 'var(--text-muted)' : n >= 85 ? '#16a34a' : n >= 70 ? '#2563eb' : n >= 40 ? '#d97706' : '#dc2626';
                        return (
                          <td key={k} style={{ textAlign: 'center', padding: 8, borderBottom: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums' }}>
                            <span style={{ fontWeight: 700, color: cor, background: n == null ? 'transparent' : `${cor}14`, borderRadius: 6, padding: '2px 8px', fontSize: 12.5 }}>{n ?? '—'}</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
