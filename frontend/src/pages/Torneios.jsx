import React, { useEffect, useState } from 'react';
import { Trophy, Plus, X, Users, User, Medal } from 'lucide-react';
import api from '../api';
import Avatar from '../components/Avatar';
import { useToast } from '../components/Toast';
import { TEMAS, temaDe } from '../lib/temasTorneio';

// ─────────────────────────────────────────────────────────────
// Torneios entre setores e entre pessoas.
//
// O placar vem calculado do servidor a partir do que o app já registra —
// ninguém digita ponto em lugar nenhum. Aqui é só a leitura.
//
// Duas decisões de tela que não são estéticas:
//
//  · SETORES mostra a tabela inteira; INDIVIDUAL mostra só os três
//    primeiros e a sua posição. Ranking pessoal completo e público, numa
//    loja, vira exposição de quem está mal — e essa pessoa desengaja de
//    vez, que é o oposto do que a campanha quer.
//
//  · O setor é ordenado pela MÉDIA por pessoa, não pela soma. Com soma,
//    um setor de 20 ganharia de um de 3 antes de começar.
// ─────────────────────────────────────────────────────────────

const hoje = () => new Date().toISOString().slice(0, 10);
const formatarData = (d) => d ? d.split('-').reverse().join('/') : '—';

export default function Torneios({ userId, profile }) {
  const toast = useToast();
  const ehGestor = ['admin', 'master'].includes(profile?.access_level);

  const [campanhas, setCampanhas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [aberta, setAberta]   = useState(null);   // campanha aberta
  const [placar, setPlacar]   = useState(null);
  const [aba, setAba]         = useState('setores');
  const [verTodos, setVerTodos] = useState(false);

  const [criando, setCriando]   = useState(false);
  const [catalogo, setCatalogo] = useState([]);
  const [form, setForm] = useState({ nome: '', premio: '', inicio: hoje(), fim: '', metricas: {}, tema: 'classico' });
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    try {
      const r = await api.get(`/gamificacao/campanhas?requester_id=${userId}`);
      setCampanhas(r.data || []);
    } catch {
      toast('Não foi possível carregar os torneios.', 'error');
    }
    setCarregando(false);
  };

  useEffect(() => { if (userId) carregar(); }, [userId]);

  const abrir = async (c) => {
    setAberta(c); setPlacar(null); setVerTodos(false);
    try {
      const r = await api.get(`/gamificacao/campanhas/${c.id}/placar?requester_id=${userId}`);
      setPlacar(r.data);
    } catch {
      toast('Não foi possível carregar o placar.', 'error');
    }
  };

  const abrirCriacao = async () => {
    setCriando(true);
    if (!catalogo.length) {
      try {
        const r = await api.get('/gamificacao/metricas');
        setCatalogo(r.data || []);
      } catch { /* a tela avisa ao salvar */ }
    }
  };

  const criar = async () => {
    const metricas = Object.entries(form.metricas)
      .filter(([, peso]) => peso > 0)
      .map(([chave, peso]) => ({ chave, peso }));
    if (!form.nome.trim()) return toast('Dê um nome ao torneio.', 'error');
    if (!form.fim) return toast('Defina a data de encerramento.', 'error');
    if (!metricas.length) return toast('Escolha pelo menos uma métrica.', 'error');

    setSalvando(true);
    try {
      await api.post('/gamificacao/campanhas', {
        requester_id: userId, nome: form.nome, premio: form.premio,
        inicio: form.inicio, fim: form.fim, metricas, tema: form.tema,
      });
      toast('Torneio criado!');
      setCriando(false);
      setForm({ nome: '', premio: '', inicio: hoje(), fim: '', metricas: {}, tema: 'classico' });
      carregar();
    } catch (e) {
      toast(e?.response?.data?.error || 'Erro ao criar o torneio.', 'error');
    }
    setSalvando(false);
  };

  const encerrar = async (c) => {
    if (!confirm(`Encerrar "${c.nome}"? O placar continua visível, mas para de contar pontos novos.`)) return;
    try {
      await api.put(`/gamificacao/campanhas/${c.id}/encerrar`, { requester_id: userId });
      carregar();
      if (aberta?.id === c.id) setAberta({ ...aberta, ativa: false });
    } catch {
      toast('Não foi possível encerrar.', 'error');
    }
  };



  // ── Placar de uma campanha ──────────────────────────────────
  if (aberta) {
    const T = temaDe(aberta.tema);
    const MEDALHA = T.medalhas;
    const minhaPos = placar?.individual?.findIndex(p => p.id === userId) ?? -1;
    const eu = minhaPos >= 0 ? placar.individual[minhaPos] : null;
    const topo = placar?.individual?.slice(0, 3) || [];
    const lista = verTodos ? placar?.individual || [] : topo;

    return (
      <div>
        <div className="page-header">
          <div>
            <div className="page-title" style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:26 }}>{T.emblema}</span> {aberta.nome}
            </div>
            <div className="page-subtitle">
              {formatarData(aberta.inicio)} a {formatarData(aberta.fim)}
              {aberta.premio ? ` · Prêmio: ${aberta.premio}` : ''}
              {!aberta.ativa ? ' · Encerrado' : ''}
            </div>
          </div>
          <button className="btn btn-sm" onClick={() => setAberta(null)}>← Voltar</button>
        </div>

        {placar?.detalhe?.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--text)' }}>O que conta ponto:</strong>{' '}
              {placar.detalhe.map(d => `${d.nome} (${d.peso})`).join(' · ')}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 18 }}>
          {[['setores', T.grupos, Users], ['individual', 'Individual', User]].map(([k, r, Ic]) => (
            <button key={k} onClick={() => setAba(k)} style={{
              padding: '9px 16px', fontSize: 13, fontWeight: 700, background: 'none', border: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              color: aba === k ? T.cores.principal : 'var(--text-muted)',
              borderBottom: aba === k ? `2px solid ${T.cores.principal}` : '2px solid transparent',
            }}><Ic size={14}/> {r}</button>
          ))}
        </div>

        {!placar ? (
          <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            Calculando o placar...
          </div>
        ) : aba === 'setores' ? (
          <div className="card">
            {placar.setores.length === 0
              ? <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Ninguém pontuou ainda.</p>
              : placar.setores.map((s, i) => (
                <div key={s.setor} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0',
                  borderBottom: i < placar.setores.length - 1 ? '1px solid var(--border)' : 'none',
                }}>
                  <span style={{
                    width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 800,
                    background: i < 3 ? MEDALHA[i] : 'var(--surface-2)',
                    color: i < 3 ? '#1a1a1a' : 'var(--text-muted)',
                  }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{s.setor}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {s.pessoas} pessoa{s.pessoas !== 1 ? 's' : ''} · {s.pontos} {T.pontos} no total
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 18 }}>{s.media}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{T.pontos} por pessoa</div>
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <>
            <div className="card">
              {lista.length === 0
                ? <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Ninguém pontuou ainda.</p>
                : lista.map((p, i) => (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                    borderBottom: i < lista.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    <span style={{
                      width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11.5, fontWeight: 800,
                      background: i < 3 ? MEDALHA[i] : 'var(--surface-2)',
                      color: i < 3 ? '#1a1a1a' : 'var(--text-muted)',
                    }}>{i + 1}</span>
                    <Avatar avatarUrl={p.avatar_url} name={p.nome} size={30}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: p.id === userId ? 800 : 600, fontSize: 13.5,
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.nome}{p.id === userId ? ' (você)' : ''}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{p.setor || '—'}</div>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 16, flexShrink: 0 }}>{p.pontos}</div>
                  </div>
                ))}
            </div>

            {/* A sua posição aparece sempre, mesmo fora do pódio — é o que
                deixa a pessoa saber onde está sem expor os outros. */}
            {!verTodos && eu && minhaPos > 2 && (
              <div className="card" style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12,
                                             borderLeft: `4px solid ${T.cores.principal}`, borderRadius: '0 12px 12px 0' }}>
                <span style={{ fontWeight: 800, fontSize: 14, color: T.cores.principal }}>{minhaPos + 1}º</span>
                <Avatar avatarUrl={eu.avatar_url} name={eu.nome} size={30}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>Sua posição</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{eu.setor || '—'}</div>
                </div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{eu.pontos}</div>
              </div>
            )}

            {/* Lista completa só para quem administra: é informação de
                gestão, não de vitrine. */}
            {ehGestor && placar.individual.length > 3 && (
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }}
                onClick={() => setVerTodos(v => !v)}>
                {verTodos ? 'Mostrar só o pódio' : `Ver todos (${placar.individual.length})`}
              </button>
            )}
          </>
        )}
      </div>
    );
  }

  // ── Lista de campanhas ──────────────────────────────────────
  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Torneios</div>
          <div className="page-subtitle">Gestão do Tempo e Produtividade</div>
        </div>
        {ehGestor && (
          <button className="btn btn-primary btn-sm" onClick={abrirCriacao}>
            <Plus size={14}/> Novo torneio
          </button>
        )}
      </div>

      {carregando ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Carregando...</div>
      ) : campanhas.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <Trophy size={44} style={{ opacity: .15, marginBottom: 12 }}/>
          <h3 style={{ fontSize: 16, marginBottom: 6 }}>Nenhum torneio ainda</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 420, margin: '0 auto', lineHeight: 1.6 }}>
            Um torneio transforma o que a equipe já faz — enviar a escala no prazo, ler o
            comunicado, fechar a tarefa a tempo — numa disputa entre setores e entre pessoas.
            Ninguém precisa anotar nada: o placar sai sozinho.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {campanhas.map(c => (
            <div key={c.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 22, flexShrink: 0, opacity: c.ativa ? 1 : .45 }}>{temaDe(c.tema).emblema}</span>
              <div style={{ flex: 1, minWidth: 180, cursor: 'pointer' }} onClick={() => abrir(c)}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {c.nome}
                  {!c.ativa && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}> · encerrado</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {formatarData(c.inicio)} a {formatarData(c.fim)}
                  {c.premio ? ` · ${c.premio}` : ''}
                </div>
              </div>
              <button className="btn btn-sm" onClick={() => abrir(c)}>
                <Medal size={13}/> Ver placar
              </button>
              {ehGestor && c.ativa && (
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => encerrar(c)}>
                  Encerrar
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {criando && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setCriando(false)}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <span className="modal-title">Novo torneio</span>
              <button className="btn-icon" onClick={() => setCriando(false)}><X size={16}/></button>
            </div>
            <div className="modal-body">
              {/* O tema vem primeiro: escolhido antes do nome, ele sugere o
                  nome. "A Guerra das Casas" nasce do tema, não do contrário. */}
              <div className="form-group">
                <label className="form-label">Tema</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  {Object.entries(TEMAS).map(([chave, t]) => {
                    const escolhido = form.tema === chave;
                    return (
                      <button key={chave} type="button"
                        onClick={() => setForm(f => ({ ...f, tema: chave }))}
                        style={{
                          textAlign: 'left', cursor: 'pointer', padding: '10px 12px', borderRadius: 10,
                          background: escolhido ? t.cores.fundo : 'var(--surface-2)',
                          border: `1.5px solid ${escolhido ? t.cores.borda : 'var(--border)'}`,
                        }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
                          <span style={{ fontSize: 17 }}>{t.emblema}</span>
                          <span style={{ fontWeight: 700, fontSize: 13,
                                         color: escolhido ? t.cores.principal : 'var(--text)' }}>{t.nome}</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                          {t.descricao}
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 4 }}>
                          Setor vira <strong>{t.grupo}</strong> · ponto vira <strong>{t.pontos}</strong>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Nome</label>
                <input className="input" value={form.nome} maxLength={60}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Ex: Desafio de Setembro"/>
              </div>
              <div className="form-group">
                <label className="form-label">Prêmio (opcional)</label>
                <input className="input" value={form.premio} maxLength={80}
                  onChange={e => setForm(f => ({ ...f, premio: e.target.value }))}
                  placeholder="Ex: Folga extra para o setor campeão"/>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="form-group">
                  <label className="form-label">Início</label>
                  <input className="input" type="date" value={form.inicio}
                    onChange={e => setForm(f => ({ ...f, inicio: e.target.value }))}/>
                </div>
                <div className="form-group">
                  <label className="form-label">Fim</label>
                  <input className="input" type="date" value={form.fim}
                    onChange={e => setForm(f => ({ ...f, fim: e.target.value }))}/>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">O que conta ponto</label>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
                  Marque o que vale e quanto pesa. Comece com poucas — muitas métricas
                  ao mesmo tempo confundem, e ninguém sabe o que fazer para subir.
                </div>
                {catalogo.map(m => {
                  const peso = form.metricas[m.chave] || 0;
                  return (
                    <div key={m.chave} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <input type="checkbox" checked={peso > 0}
                        onChange={e => setForm(f => ({ ...f, metricas: { ...f.metricas, [m.chave]: e.target.checked ? 10 : 0 } }))}/>
                      <span style={{ flex: 1, fontSize: 13 }}>{m.nome}</span>
                      {peso > 0 && (
                        <input className="input" type="number" min={1} max={100} value={peso}
                          style={{ width: 74 }}
                          onChange={e => setForm(f => ({ ...f, metricas: { ...f.metricas, [m.chave]: Number(e.target.value) } }))}/>
                      )}
                    </div>
                  );
                })}
              </div>

              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
                onClick={criar} disabled={salvando}>
                {salvando ? 'Criando...' : 'Criar torneio'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
