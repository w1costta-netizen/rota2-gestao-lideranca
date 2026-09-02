import React, { useEffect, useState } from 'react';
import { Trophy, Plus, X, Users, User, Medal, HelpCircle, CalendarCheck, Lightbulb, UserPlus, Pencil, Trash2, AlertTriangle, FileSearch } from 'lucide-react';
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

// Fica FORA do componente porque a tela tem DOIS retornos — um para o
// placar e outro para a lista de torneios. Definido dentro de um deles, o
// modal só existia naquele: clicar em "Como pontuar" de dentro do placar
// não abria nada, que foi exatamente o defeito relatado.
// Extrato de pontos — o contraditório do torneio.
//
// Alguém VAI dizer "eu fiz e não contou". Sem esta tela a conversa termina
// no "acho que sim", que é a forma mais rápida de um placar perder a
// credibilidade. Aqui a pessoa vê o que registrou, o que virou ponto, o que
// não virou e a razão — e a discussão vira conferência.
function ModalExtrato({ userId, campanhaId, pessoaId, aoFechar, toast }) {
  const [dados, setDados] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get(
          `/gamificacao/campanhas/${campanhaId}/extrato?requester_id=${userId}&user_id=${pessoaId}`);
        setDados(r.data);
      } catch (e) {
        toast(e?.response?.data?.error || 'Não foi possível carregar o extrato.', 'error');
        aoFechar();
      }
    })();
  }, []);

  const Linha = ({ titulo, detalhe, pontos, aviso }) => (
    <div style={{ padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>{titulo}</span>
        <span style={{ fontWeight: 800, fontSize: 14, flexShrink: 0,
                       color: pontos ? 'var(--text)' : 'var(--text-muted)' }}>{pontos}</span>
      </div>
      {detalhe && (
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>{detalhe}</div>
      )}
      {aviso && (
        <div style={{ fontSize: 11.5, color: '#f59e0b', marginTop: 3 }}>{aviso}</div>
      )}
    </div>
  );

  return (
    <div className="modal-overlay" onClick={ev => ev.target === ev.currentTarget && aoFechar()}>
      <div className="modal" style={{ maxWidth: 580 }}>
        <div className="modal-header">
          <span className="modal-title">Extrato de pontos</span>
          <button className="btn-icon" onClick={aoFechar}><X size={16}/></button>
        </div>
        <div className="modal-body">
          {!dados ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Carregando o extrato...</p>
          ) : (
            <>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{dados.pessoa.nome}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {dados.pessoa.setor || '—'} · {formatarData(dados.periodo.inicio)} a {formatarData(dados.periodo.fim)}
                </div>
              </div>

              {dados.pontosConstancia > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>Constância</div>
                  <Linha
                    titulo={`${dados.diasAtivos} dia(s) com atividade`}
                    detalhe={`${dados.pontosPorDiaAtivo} pontos por dia, multiplicados pelo peso`}
                    pontos={dados.pontosConstancia}/>
                </div>
              )}

              {dados.qualidade.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>Qualidade</div>
                  {dados.qualidade.map(q => (
                    <Linha key={q.nome} titulo={q.nome}
                      detalhe={`${q.qtd}× · ${q.base} pontos cada`}
                      pontos={q.pontos}
                      aviso={q.qtd === 0 ? 'Nada aqui no período — esta conta só cumprindo o prazo.' : null}/>
                  ))}
                </div>
              )}

              {dados.linhas.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6 }}>
                  Nenhuma ação que pontua foi registrada neste período. Ações como editar
                  ou apagar não pontuam — só criar, concluir, conferir e participar.
                </p>
              ) : (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>Ações registradas</div>
                  {dados.linhas.map(l => (
                    <Linha key={l.acao} titulo={l.nome}
                      detalhe={`${l.vezes}× em ${l.dias} dia(s) · ${l.contadas} contaram · ${l.base} pontos × peso ${l.peso || 0} (${l.familiaNome})`}
                      pontos={l.pontos}
                      aviso={l.observacao}/>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            paddingTop: 12, borderTop: '2px solid var(--border)' }}>
                <span style={{ fontWeight: 800, fontSize: 14 }}>Total</span>
                <span style={{ fontWeight: 800, fontSize: 20 }}>{dados.total}</span>
              </div>

              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 12, lineHeight: 1.6 }}>
                Só entram ações registradas dentro do período do torneio, e só das famílias
                que este torneio usa. Editar e apagar não pontuam.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Montagem das equipes.
//
// Equipe pertence à LOJA, não à campanha: monta uma vez e vale para todos os
// torneios. Amarrar à campanha obrigaria a redistribuir a loja inteira a cada
// torneio, e essa fricção mataria o recurso no segundo mês.
function ModalEquipes({ userId, aoFechar, toast }) {
  const [dados, setDados] = useState(null);
  const [editando, setEditando] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    try {
      const r = await api.get(`/gamificacao/equipes?requester_id=${userId}`);
      setDados(r.data);
    } catch {
      toast('Não foi possível carregar as equipes.', 'error');
    }
  };
  useEffect(() => { carregar(); }, []);

  // Quem já está em OUTRA equipe não aparece na lista: cada pessoa em uma
  // equipe só, senão os pontos dela contariam duas vezes e o placar mentiria.
  const disponiveis = () => {
    if (!dados) return [];
    const emOutras = new Set(
      dados.equipes.filter(e => e.id !== editando?.id).flatMap(e => e.membros || [])
    );
    const todos = [...dados.semEquipe, ...dados.equipes.flatMap(e => e.membros_detalhe || [])];
    const unicos = Object.values(Object.fromEntries(todos.map(x => [x.id, x])));
    return unicos.filter(x => !emOutras.has(x.id))
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
  };

  const salvar = async () => {
    if (!editando.nome.trim()) return toast('Dê um nome à equipe.', 'error');
    setSalvando(true);
    try {
      const corpo = { requester_id: userId, nome: editando.nome, membros: editando.membros };
      if (editando.id) await api.put(`/gamificacao/equipes/${editando.id}`, corpo);
      else             await api.post('/gamificacao/equipes', corpo);
      setEditando(null);
      carregar();
    } catch (e) {
      toast(e?.response?.data?.error || 'Não foi possível salvar.', 'error');
    }
    setSalvando(false);
  };

  const excluir = async (e) => {
    if (!confirm(`Excluir a equipe "${e.nome}"? As pessoas voltam a ficar sem equipe.`)) return;
    try {
      await api.delete(`/gamificacao/equipes/${e.id}?requester_id=${userId}`);
      carregar();
    } catch {
      toast('Não foi possível excluir.', 'error');
    }
  };

  return (
    <div className="modal-overlay" onClick={ev => ev.target === ev.currentTarget && aoFechar()}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <span className="modal-title">
            {editando ? (editando.id ? 'Editar equipe' : 'Nova equipe') : 'Equipes'}
          </span>
          <button className="btn-icon" onClick={() => editando ? setEditando(null) : aoFechar()}>
            <X size={16}/>
          </button>
        </div>
        <div className="modal-body">
          {!dados ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Carregando...</p>
          ) : editando ? (
            <>
              <div className="form-group">
                <label className="form-label">Nome da equipe</label>
                <input className="input" value={editando.nome} maxLength={40} autoFocus
                  onChange={ev => setEditando(x => ({ ...x, nome: ev.target.value }))}
                  placeholder="Ex: Casa do Norte"/>
              </div>
              <div className="form-group">
                <label className="form-label">Quem faz parte ({editando.membros.length})</label>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.5 }}>
                  Quem já está em outra equipe não aparece aqui — cada pessoa pode
                  estar em uma equipe só.
                </div>
                <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
                  {disponiveis().map(pessoa => {
                    const dentro = editando.membros.includes(pessoa.id);
                    return (
                      <label key={pessoa.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                        borderBottom: '1px solid var(--border)', cursor: 'pointer',
                      }}>
                        <input type="checkbox" checked={dentro}
                          onChange={() => setEditando(x => ({
                            ...x,
                            membros: dentro
                              ? x.membros.filter(i => i !== pessoa.id)
                              : [...x.membros, pessoa.id],
                          }))}/>
                        <Avatar avatarUrl={pessoa.avatar_url} name={pessoa.full_name} size={26}/>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{pessoa.full_name}</span>
                          <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>{pessoa.sector || '—'}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
                onClick={salvar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar equipe'}
              </button>
            </>
          ) : (
            <>
              {dados.semEquipe.length > 0 && (
                <div className="card" style={{ marginBottom: 14, display: 'flex', gap: 10, alignItems: 'flex-start',
                                               borderLeft: '4px solid #f59e0b', borderRadius: '0 12px 12px 0' }}>
                  <AlertTriangle size={17} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }}/>
                  <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                    <strong>{dados.semEquipe.length} pessoa(s) sem equipe.</strong> Elas continuam
                    no ranking individual, mas não entram no de equipes.
                  </div>
                </div>
              )}

              {dados.equipes.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6 }}>
                  Nenhuma equipe montada. Enquanto não houver, o torneio disputa por
                  setor — o que já funciona, mas não deixa você equilibrar os times.
                </p>
              ) : dados.equipes.map(e => (
                <div key={e.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0',
                  borderBottom: '1px solid var(--border)',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{e.nome}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', overflow: 'hidden',
                                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {(e.membros_detalhe || []).length} pessoa(s)
                      {e.membros_detalhe?.length
                        ? ' · ' + e.membros_detalhe.map(m => (m.full_name || '').split(' ')[0]).join(', ')
                        : ''}
                    </div>
                  </div>
                  <button className="btn-icon" title="Editar"
                    onClick={() => setEditando({ id: e.id, nome: e.nome, membros: [...(e.membros || [])] })}>
                    <Pencil size={15}/>
                  </button>
                  <button className="btn-icon" title="Excluir" style={{ color: 'var(--danger)' }}
                    onClick={() => excluir(e)}>
                    <Trash2 size={15}/>
                  </button>
                </div>
              ))}

              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 14 }}
                onClick={() => setEditando({ nome: '', membros: [] })}>
                <UserPlus size={15}/> Nova equipe
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Como pontuar — a tela mais importante depois do placar. Quem não sabe
// como subir não muda de comportamento, e o torneio vira decoração. As
// regras vêm do servidor, geradas pelo mesmo código que calcula os pontos:
// não há como a explicação divergir do que o sistema realmente faz.
function ModalRegras({ regras, aoFechar }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && aoFechar()}>
          <div className="modal" style={{ maxWidth: 620 }}>
            <div className="modal-header">
              <span className="modal-title">Como funciona a pontuação</span>
              <button className="btn-icon" onClick={() => aoFechar()}><X size={16}/></button>
            </div>
            <div className="modal-body">
              {!regras ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Carregando as regras...</p>
              ) : (
                <>
                  <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid var(--primary)', borderRadius: '0 12px 12px 0' }}>
                    <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                      <Lightbulb size={17} color="var(--primary)" style={{ flexShrink: 0, marginTop: 1 }}/>
                      <div style={{ fontSize: 13, lineHeight: 1.65 }}>
                        <strong>A regra mais importante:</strong> vale mais aparecer todo dia
                        do que fazer muita coisa num dia só. Quem faz três coisas por dia
                        durante o mês passa com folga de quem faz cinquenta numa tarde.
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 14, color: 'var(--text-muted)' }}>
                    Cada ação vale um <strong style={{ color: 'var(--text)' }}>valor base</strong>, e o{' '}
                    <strong style={{ color: 'var(--text)' }}>peso da família</strong> multiplica esse valor.
                    O peso de cada torneio aparece no topo do placar.
                  </div>

                  {/* O limite diário precisa de exemplo. Explicado só com a
                      regra ("repetir além do limite não soma"), nem quem
                      desenhou o recurso entendeu de primeira — e quem trabalha
                      na loja teria menos chance ainda. */}
                  <div className="card" style={{ marginBottom: 18, background: 'var(--surface-2)' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                      O que significa "no máximo 3 por dia"
                    </div>
                    <div style={{ fontSize: 12.5, lineHeight: 1.7, color: 'var(--text-muted)' }}>
                      É quantas vezes aquela ação pode dar ponto no mesmo dia.<br/>
                      Se criar tarefa vale 4 pontos, com limite de 3 por dia:<br/>
                      · criou 2 tarefas hoje → 8 pontos<br/>
                      · criou 30 tarefas hoje → contam 3 → 12 pontos<br/>
                      Amanhã o limite zera e valem mais 3.
                      <br/><br/>
                      <strong style={{ color: 'var(--text)' }}>Por que existe:</strong> assim ninguém
                      ganha o torneio numa tarde só. Para pontuar, é preciso voltar amanhã.
                    </div>
                  </div>

                  <div className="card" style={{ marginBottom: 18, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <CalendarCheck size={17} color="var(--primary)" style={{ flexShrink: 0, marginTop: 1 }}/>
                    <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                      <strong>Constância:</strong> cada dia em que você fizer qualquer coisa desta
                      lista vale <strong>{regras.pontosPorDiaAtivo} pontos</strong>, multiplicados pelo peso.
                      É o que mais rende ao longo de um mês.
                    </div>
                  </div>

                  {regras.familias.map(f => (
                    <div key={f.chave} style={{ marginBottom: 20 }}>
                      <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 2 }}>{f.nome}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
                        {f.descricao}
                      </div>
                      {f.acoes.length === 0 ? (
                        <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                          Pontua por dia usado, não por ação.
                        </div>
                      ) : f.acoes.map(a => (
                        <div key={a.chave} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0',
                          borderBottom: '1px solid var(--border)', fontSize: 13,
                        }}>
                          <span style={{ flex: 1, minWidth: 0 }}>{a.nome}</span>
                          {a.tetoDia && (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                              no máximo {a.tetoDia} por dia
                            </span>
                          )}
                          <span style={{ fontWeight: 800, minWidth: 26, textAlign: 'right', flexShrink: 0 }}>
                            {a.base}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}

                  <div className="card" style={{ background: 'var(--surface-2)' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Três coisas que valem saber</div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.75, color: 'var(--text-muted)' }}>
                      <li><strong style={{ color: 'var(--text)' }}>Tarefa sem prazo não pontua</strong> na
                        família Qualidade — só conta quem cumpre um prazo que existia.</li>
                      <li><strong style={{ color: 'var(--text)' }}>Só abrir telas não pontua.</strong> O que
                        conta é o que você faz e registra, não o que você olha.</li>
                      <li><strong style={{ color: 'var(--text)' }}>Setor é comparado por média</strong>, não
                        por soma — setor pequeno disputa de igual para igual com setor grande.</li>
                    </ul>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
  );
}

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
  const FORM_VAZIO = {
    nome: '', inicio: hoje(), fim: '', metricas: {}, tema: 'classico',
    premiosIndividual: ['', '', ''], premiosEquipes: ['', '', ''],
  };
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [regras, setRegras] = useState(null);
  const [verRegras, setVerRegras] = useState(false);
  const [verEquipes, setVerEquipes] = useState(false);
  const [extratoDe, setExtratoDe] = useState(null);

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
        const r = await api.get('/gamificacao/familias');
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
    if (!metricas.length) return toast('Escolha pelo menos uma família de pontos.', 'error');

    setSalvando(true);
    try {
      await api.post('/gamificacao/campanhas', {
        requester_id: userId, nome: form.nome,
        inicio: form.inicio, fim: form.fim, metricas, tema: form.tema,
        premios: { individual: form.premiosIndividual, equipes: form.premiosEquipes },
      });
      toast('Torneio criado!');
      setCriando(false);
      setForm(FORM_VAZIO);
      carregar();
    } catch (e) {
      toast(e?.response?.data?.error || 'Erro ao criar o torneio.', 'error');
    }
    setSalvando(false);
  };

  const abrirRegras = async () => {
    setVerRegras(true);
    if (regras) return;
    try {
      const r = await api.get('/gamificacao/regras');
      setRegras(r.data);
    } catch {
      toast('Não foi possível carregar as regras.', 'error');
    }
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
    // Prêmio da colocação, quando houver. Aparecer ao lado do lugar é o
    // que transforma o placar em disputa: número sozinho não motiva.
    const premioDe = (lista, i) => (aberta.premios?.[lista] || [])[i] || null;
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
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button className="btn btn-sm" onClick={abrirRegras}>
              <HelpCircle size={14}/> Como pontuar
            </button>
            <button className="btn btn-sm" onClick={() => setAberta(null)}>← Voltar</button>
          </div>
        </div>

        {placar?.foraDeEquipe > 0 && (
          <div className="card" style={{ marginBottom: 12, display: 'flex', gap: 10, alignItems: 'flex-start',
                                         borderLeft: '4px solid #f59e0b', borderRadius: '0 12px 12px 0' }}>
            <AlertTriangle size={17} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }}/>
            <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>
              <strong>{placar.foraDeEquipe} pessoa(s) fora de qualquer equipe.</strong> Elas
              contam no ranking individual, mas não no de equipes.
            </div>
          </div>
        )}

        {placar?.familias?.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--text)' }}>Famílias que contam:</strong>{' '}
              {(placar.familias || []).map(d => `${d.nome} (peso ${d.peso})`).join(' · ')}
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
                    {premioDe('equipes', i) && (
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: T.cores.principal, marginTop: 3 }}>
                        🎁 {premioDe('equipes', i)}
                      </div>
                    )}
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
                  <div key={p.id}
                    onClick={() => (ehGestor || p.id === userId) && setExtratoDe(p.id)}
                    title={(ehGestor || p.id === userId) ? 'Ver de onde vieram estes pontos' : undefined}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                      cursor: (ehGestor || p.id === userId) ? 'pointer' : 'default',
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
                      {premioDe('individual', i) && (
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: T.cores.principal, marginTop: 2 }}>
                          🎁 {premioDe('individual', i)}
                        </div>
                      )}
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
                <button className="btn btn-sm" onClick={() => setExtratoDe(userId)}>
                  <FileSearch size={13}/> Extrato
                </button>
              </div>
            )}

            {/* De onde vieram os seus pontos. Sem isto a pessoa vê o número
                e não sabe o que fazer para melhorar — e placar que não se
                explica não muda comportamento. */}
            {eu && eu.pontos > 0 && (
              <div className="card" style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Seus pontos vieram de</div>
                {(placar.familias || []).map(f => {
                  const v = eu.porFamilia?.[f.chave] || 0;
                  const pct = eu.pontos ? Math.round((v / eu.pontos) * 100) : 0;
                  return (
                    <div key={f.chave} style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
                        <span>{f.nome}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{v} pts</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 99, background: 'var(--surface-2)', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: T.cores.principal }}/>
                      </div>
                    </div>
                  );
                })}
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

        {verRegras && <ModalRegras regras={regras} aoFechar={() => setVerRegras(false)}/>}
        {extratoDe && (
          <ModalExtrato userId={userId} campanhaId={aberta.id} pessoaId={extratoDe}
            toast={toast} aoFechar={() => setExtratoDe(null)}/>
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
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" onClick={abrirRegras}>
            <HelpCircle size={14}/> Como pontuar
          </button>
          {ehGestor && (
            <button className="btn btn-sm" onClick={() => setVerEquipes(true)}>
              <Users size={14}/> Equipes
            </button>
          )}
          {ehGestor && (
            <button className="btn btn-primary btn-sm" onClick={abrirCriacao}>
              <Plus size={14}/> Novo torneio
            </button>
          )}
        </div>
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

      {verRegras && <ModalRegras regras={regras} aoFechar={() => setVerRegras(false)}/>}

      {verEquipes && <ModalEquipes userId={userId} toast={toast} aoFechar={() => setVerEquipes(false)}/>}

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
              {/* Três colocações para cada disputa. O app anuncia e registra;
                  quem entrega o prêmio é a loja — o sistema não toca em
                  dinheiro, o que traria obrigação fiscal que você não quer. */}
              <div className="form-group">
                <label className="form-label">Prêmios — Individual</label>
                {[0, 1, 2].map(i => (
                  <input key={i} className="input" style={{ marginBottom: 6 }} maxLength={80}
                    value={form.premiosIndividual[i]}
                    onChange={e => setForm(f => {
                      const v = [...f.premiosIndividual]; v[i] = e.target.value;
                      return { ...f, premiosIndividual: v };
                    })}
                    placeholder={`${i + 1}º lugar${i === 0 ? ' — ex: folga extra' : ''}`}/>
                ))}
              </div>

              <div className="form-group">
                <label className="form-label">Prêmios — Equipes</label>
                {[0, 1, 2].map(i => (
                  <input key={i} className="input" style={{ marginBottom: 6 }} maxLength={80}
                    value={form.premiosEquipes[i]}
                    onChange={e => setForm(f => {
                      const v = [...f.premiosEquipes]; v[i] = e.target.value;
                      return { ...f, premiosEquipes: v };
                    })}
                    placeholder={`${i + 1}º lugar${i === 0 ? ' — ex: café da manhã para o time' : ''}`}/>
                ))}
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
                  Marque as famílias que valem e o peso de cada uma (1 a 5). O peso
                  multiplica: Operação com peso 2 faz cada ação dela valer o dobro.
                </div>
                {catalogo.map(m => {
                  const peso = form.metricas[m.chave] || 0;
                  return (
                    <div key={m.chave} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <input type="checkbox" checked={peso > 0}
                        onChange={e => setForm(f => ({ ...f, metricas: { ...f.metricas, [m.chave]: e.target.checked ? 2 : 0 } }))}/>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display:'block', fontSize: 13, fontWeight: 600 }}>{m.nome}</span>
                        <span style={{ display:'block', fontSize: 11, color:'var(--text-muted)', lineHeight:1.4 }}>{m.descricao}</span>
                      </span>
                      {peso > 0 && (
                        <input className="input" type="number" min={1} max={5} value={peso}
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
