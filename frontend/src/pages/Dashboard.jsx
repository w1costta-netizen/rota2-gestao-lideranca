import React, { useEffect, useState } from 'react';
import {
  Megaphone, CheckSquare, CalendarDays, ListChecks, StickyNote, Pin,
  AlertTriangle, Clock, Users
} from 'lucide-react';

// As mesmas cores da tela de Anotações. Repetidas aqui de propósito: o
// Dashboard só precisa do fundo para a bolinha, não do jogo completo de
// contraste — importar a paleta inteira criaria uma dependência entre as
// duas telas por causa de nove valores.
const COR_ANOTACAO = {
  preto:'#262626', cinza:'#616161', vermelho:'#C62828', laranja:'#E8681A',
  amarelo:'#F5C518', verde:'#2E7D32', azul:'#1565C0', roxo:'#5E35B1', rosa:'#C2185B',
};
import api from '../api';
import { useAuth } from '../contexts/AuthContext';
import { formatDate } from '../utils';

// Uma tarefa só "cobra" como pendente depois que o dia e horário do prazo passarem
function isOverdue(due_date, due_time, status) {
  if (!due_date || status === 'concluida') return false;
  const now = new Date();
  const [y, mo, d] = due_date.split('-').map(Number);
  if (due_time) {
    const [h, min] = due_time.split(':').map(Number);
    return now > new Date(y, mo - 1, d, h, min, 0);
  }
  return now > new Date(y, mo - 1, d, 23, 59, 59);
}

// Para o Dashboard, sempre usa a semana real do dia atual (não avança no fds)
function getCurrentWeekStart() {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // sempre vai para a segunda desta semana
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

function StatCard({ icon: Icon, color, bg, value, label, onClick }) {
  return (
    <div className="stat-card" style={{ cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      <div className="stat-icon" style={{ background: bg }}>
        <Icon size={20} color={color} />
      </div>
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}

export default function Dashboard({ setPage, profile: propProfile }) {
  const { session, profile: authProfile } = useAuth();
  const profile  = propProfile || authProfile;
  const userId   = session?.user?.id;
  const isAdmin  = ['admin','supervisor','master'].includes(profile?.access_level);
  const company  = profile?.company || '';
  const week     = getCurrentWeekStart();

  const [stats, setStats]         = useState({});
  const [tarefas, setTarefas]     = useState([]);
  const [comunicados, setComunicados] = useState([]);
  const [listas, setListas]       = useState([]);
  const [anotacoes, setAnotacoes] = useState([]);
  const [agenda, setAgenda]       = useState([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    if (!userId) return;
    const cq = company ? `&company=${encodeURIComponent(company)}` : '';
    Promise.all([
      api.get(`/tarefas?requester_id=${userId}${cq}`).catch(() => ({ data: [] })),
      api.get(`/comunicados?requester_id=${userId}${cq}`).catch(() => ({ data: [] })),
      // Listas e anotações são pessoais: não levam company, e cada pessoa
      // só recebe as suas.
      api.get(`/listas?requester_id=${userId}`).catch(() => ({ data: [] })),
      api.get(`/anotacoes?requester_id=${userId}&arquivadas=0`).catch(() => ({ data: [] })),
      api.get(`/agenda?week_start=${week}${company ? `&company=${encodeURIComponent(company)}` : ''}&user_id=${userId}&sector=${encodeURIComponent(profile?.sector || '')}`).catch(() => ({ data: [] })),
      isAdmin && company ? api.get(`/admin/users?requester_id=${userId}${cq}`).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
    ]).then(([t, c, li, an, ag, users]) => {
      setTarefas(t.data || []);
      setComunicados(c.data || []);
      setListas(li.data || []);
      setAnotacoes(an.data || []);
      setAgenda(ag.data || []);
      setStats({ totalUsers: (users.data || []).length });
    }).finally(() => setLoading(false));
  }, [userId, company]);

  const todayIdx = new Date().getDay(); // 0=dom
  const dayNames = ['domingo','segunda','terca','quarta','quinta','sexta','sabado'];
  const todayKey = dayNames[todayIdx];

  // Tarefas — "pendente" só conta depois que o prazo (dia + horário) passar
  const tarefasPendentes  = tarefas.filter(t => t.status === 'pendente' && isOverdue(t.due_date, t.due_time, t.status));
  const tarefasEmAndamento = tarefas.filter(t => t.status === 'em_andamento');
  const tarefasAtrasadas  = tarefas.filter(t => {
    if (!t.due_date || t.status === 'concluida') return false;
    return t.due_date < new Date().toISOString().split('T')[0];
  });

  // Comunicados não lidos
  const naoLidos = comunicados.filter(c => !c.lido);
  const urgentes  = comunicados.filter(c => c.prioridade === 'urgente' && !c.lido);

  // Itens ainda por fazer nas listas pessoais — é o número que diz se
  // sobrou alguma coisa, e não quantas listas a pessoa criou.
  const itensPendentes = listas.reduce(
    (soma, l) => soma + (l.itens || []).filter(i => !i.concluido).length, 0
  );

  // Agenda de hoje
  const agendaHoje = agenda.filter(i => i.day_of_week === todayKey);

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', color:'var(--text-muted)' }}>
      Carregando...
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-subtitle">
            {new Date().toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long' })}
            {' · '} Semana de {formatDate(week)}
          </div>
        </div>
      </div>

      {/* Alertas urgentes */}
      {urgentes.length > 0 && (
        <div style={{
          background:'#ef444415', border:'1px solid #ef444440', borderRadius:10,
          padding:'12px 16px', marginBottom:20, display:'flex', alignItems:'center', gap:10,
          cursor:'pointer',
        }} onClick={() => setPage('comunicados')}>
          <AlertTriangle size={18} color="#ef4444"/>
          <span style={{ fontWeight:700, fontSize:13, color:'#ef4444' }}>
            {urgentes.length} comunicado{urgentes.length > 1 ? 's' : ''} urgente{urgentes.length > 1 ? 's' : ''} não lido{urgentes.length > 1 ? 's' : ''}
          </span>
          <span style={{ fontSize:12, color:'var(--text-muted)', marginLeft:'auto' }}>Ver comunicados →</span>
        </div>
      )}

      {/* Tarefas atrasadas */}
      {tarefasAtrasadas.length > 0 && (
        <div style={{
          background:'#f59e0b15', border:'1px solid #f59e0b40', borderRadius:10,
          padding:'12px 16px', marginBottom:20, display:'flex', alignItems:'center', gap:10,
          cursor:'pointer',
        }} onClick={() => setPage('tarefas')}>
          <Clock size={18} color="#f59e0b"/>
          <span style={{ fontWeight:700, fontSize:13, color:'#f59e0b' }}>
            {tarefasAtrasadas.length} tarefa{tarefasAtrasadas.length > 1 ? 's' : ''} atrasada{tarefasAtrasadas.length > 1 ? 's' : ''}
          </span>
          <span style={{ fontSize:12, color:'var(--text-muted)', marginLeft:'auto' }}>Ver tarefas →</span>
        </div>
      )}

      {/* Stats */}
      <div className="stats-grid">
        <StatCard icon={CheckSquare} color="#6366f1" bg="#6366f115"
          value={tarefasPendentes.length} label="Tarefas pendentes"
          onClick={() => setPage('tarefas')}/>
        <StatCard icon={Clock} color="#f59e0b" bg="#f59e0b15"
          value={tarefasEmAndamento.length} label="Em andamento"
          onClick={() => setPage('tarefas')}/>
        <StatCard icon={Megaphone} color="#E8681A" bg="#E8681A15"
          value={naoLidos.length} label="Comunicados não lidos"
          onClick={() => setPage('comunicados')}/>
        {isAdmin
          ? <StatCard icon={Users} color="#10b981" bg="#10b98115"
              value={stats.totalUsers || 0} label="Usuários cadastrados"
              onClick={() => setPage('usersadmin')}/>
          : <StatCard icon={ListChecks} color="#10b981" bg="#10b98115"
              value={itensPendentes} label="Itens nas listas"
              onClick={() => setPage('listas')}/>
        }
      </div>

      {/* Grade de conteúdo */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }} className="dashboard-grid">

        {/* Agenda de hoje */}
        <div className="card">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <div style={{ fontWeight:700, fontSize:14, display:'flex', alignItems:'center', gap:8 }}>
              <CalendarDays size={15} color="var(--primary)"/> Agenda de hoje
            </div>
            <button className="btn-icon" style={{ fontSize:12, color:'var(--primary)' }} onClick={() => setPage('agenda')}>
              Ver tudo
            </button>
          </div>
          {agendaHoje.length === 0
            ? <p style={{ color:'var(--text-muted)', fontSize:13 }}>Nenhum item para hoje.</p>
            : <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {agendaHoje.slice(0,5).map(item => (
                  <div key={item.id} style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                    <div style={{ width:3, alignSelf:'stretch', borderRadius:99, flexShrink:0,
                      background: item.target_type === 'geral' ? '#10b981' : item.target_type === 'setor' ? '#f59e0b' : '#6366f1' }}/>
                    <div>
                      <div style={{ fontWeight:600, fontSize:13 }}>
                        {item.time && <span style={{ color:'var(--text-muted)', marginRight:6 }}>{item.time}</span>}
                        {item.title}
                      </div>
                      {item.description && <div style={{ color:'var(--text-muted)', fontSize:11, marginTop:1 }}>{item.description}</div>}
                    </div>
                  </div>
                ))}
              </div>
          }
        </div>

        {/* Minhas tarefas */}
        <div className="card">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <div style={{ fontWeight:700, fontSize:14, display:'flex', alignItems:'center', gap:8 }}>
              <CheckSquare size={15} color="#6366f1"/> Minhas tarefas
            </div>
            <button className="btn-icon" style={{ fontSize:12, color:'var(--primary)' }} onClick={() => setPage('tarefas')}>
              Ver tudo
            </button>
          </div>
          {tarefas.length === 0
            ? <p style={{ color:'var(--text-muted)', fontSize:13 }}>Nenhuma tarefa atribuída.</p>
            : <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {[...tarefas]
                  .filter(t => t.status !== 'concluida')
                  .sort((a,b) => {
                    if (a.status === 'em_andamento' && b.status !== 'em_andamento') return -1;
                    if (b.status === 'em_andamento' && a.status !== 'em_andamento') return 1;
                    return 0;
                  })
                  .slice(0,5)
                  .map(t => {
                    const atrasada = t.due_date && t.due_date < new Date().toISOString().split('T')[0];
                    return (
                      <div key={t.id} style={{
                        display:'flex', alignItems:'center', gap:8, padding:'8px 0',
                        borderBottom:'1px solid var(--border)',
                      }}>
                        {t.status === 'em_andamento'
                          ? <Clock size={14} style={{ color:'#f59e0b', flexShrink:0 }}/>
                          : <CheckSquare size={14} style={{ color:'var(--text-muted)', flexShrink:0 }}/>}
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                            {t.title || t.titulo}
                          </div>
                          <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:1, display:'flex', gap:8, flexWrap:'wrap' }}>
                            {t.assigned?.full_name && <span>👤 {t.assigned.full_name}</span>}
                            {t.due_date && (
                              <span style={{ color: atrasada ? '#ef4444' : 'var(--text-muted)', fontWeight: atrasada ? 700 : 400 }}>
                                {atrasada ? '⚠ vencida: ' : '📅 '}
                                {new Date(t.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                              </span>
                            )}
                          </div>
                        </div>
                        <span style={{
                          fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:6,
                          background: (t.priority||t.prioridade) === 'alta' ? '#ef444420' : (t.priority||t.prioridade) === 'normal' ? '#6366f120' : '#6b728020',
                          color: (t.priority||t.prioridade) === 'alta' ? '#ef4444' : (t.priority||t.prioridade) === 'normal' ? '#6366f1' : '#6b7280',
                        }}>
                          {(t.priority||t.prioridade) === 'alta' ? 'Alta' : (t.priority||t.prioridade) === 'normal' ? 'Normal' : 'Baixa'}
                        </span>
                      </div>
                    );
                  })}
              </div>
          }
        </div>

        {/* Últimos comunicados */}
        <div className="card">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <div style={{ fontWeight:700, fontSize:14, display:'flex', alignItems:'center', gap:8 }}>
              <Megaphone size={15} color="#E8681A"/> Comunicados
            </div>
            <button className="btn-icon" style={{ fontSize:12, color:'var(--primary)' }} onClick={() => setPage('comunicados')}>
              Ver tudo
            </button>
          </div>
          {comunicados.length === 0
            ? <p style={{ color:'var(--text-muted)', fontSize:13 }}>Nenhum comunicado.</p>
            : <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {comunicados.slice(0,4).map(c => (
                  <div key={c.id} style={{
                    padding:'10px 12px', borderRadius:10,
                    background: !c.lido ? 'rgba(232,104,26,0.07)' : 'var(--bg)',
                    border:`1px solid ${!c.lido ? 'rgba(232,104,26,0.3)' : 'var(--border)'}`,
                  }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4, flexWrap:'wrap' }}>
                      {(c.priority === 'urgente' || c.prioridade === 'urgente') && <AlertTriangle size={12} color="#ef4444" style={{ flexShrink:0 }}/>}
                      <span style={{ fontWeight:700, fontSize:13, flex:1, minWidth:0,
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.title || c.titulo}</span>
                      {!c.lido && <span style={{ fontSize:10, fontWeight:700, flexShrink:0,
                        color:'var(--primary)', background:'rgba(232,104,26,0.15)',
                        padding:'2px 8px', borderRadius:99 }}>NOVO</span>}
                    </div>
                    <div style={{ fontSize:12, color:'var(--text-muted)', lineHeight:1.4, overflow:'hidden',
                      display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
                      {c.body || c.mensagem}
                    </div>
                  </div>
                ))}
              </div>
          }
        </div>

        {/* Minhas listas */}
        <div className="card">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <div style={{ fontWeight:700, fontSize:14, display:'flex', alignItems:'center', gap:8 }}>
              <ListChecks size={15} color="#10b981"/> Minhas listas
            </div>
            <button className="btn-icon" style={{ fontSize:12, color:'var(--primary)' }} onClick={() => setPage('listas')}>
              Ver tudo
            </button>
          </div>
          {listas.length === 0
            ? <p style={{ color:'var(--text-muted)', fontSize:13 }}>Nenhuma lista criada.</p>
            : <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {listas.slice(0,4).map(l => {
                  const itens    = l.itens || [];
                  const feitos   = itens.filter(i => i.concluido).length;
                  const pct      = itens.length ? Math.round((feitos/itens.length)*100) : 0;
                  const completa = itens.length > 0 && feitos === itens.length;
                  return (
                    <div key={l.id} onClick={() => setPage('listas')} style={{ cursor:'pointer' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, fontWeight:600, marginBottom:4 }}>
                        <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'70%' }}>
                          {l.emoji} {l.nome}
                        </span>
                        <span style={{ fontWeight:700, color: completa ? '#10b981' : 'var(--primary)', flexShrink:0 }}>
                          {itens.length === 0 ? 'vazia' : completa ? '✅ 100%' : `${feitos}/${itens.length}`}
                        </span>
                      </div>
                      <div style={{ background:'var(--border)', borderRadius:6, height:7, overflow:'hidden' }}>
                        <div style={{ height:'100%', borderRadius:6, width:`${pct}%`,
                          background: completa ? '#10b981' : 'linear-gradient(90deg, var(--primary), #f59e0b)',
                          transition:'width .4s' }}/>
                      </div>
                    </div>
                  );
                })}
              </div>
          }
        </div>

        {/* Anotações */}
        <div className="card">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <div style={{ fontWeight:700, fontSize:14, display:'flex', alignItems:'center', gap:8 }}>
              <StickyNote size={15} color="#8b5cf6"/> Anotações
            </div>
            <button className="btn-icon" style={{ fontSize:12, color:'var(--primary)' }} onClick={() => setPage('anotacoes')}>
              Ver tudo
            </button>
          </div>
          {anotacoes.length === 0
            ? <p style={{ color:'var(--text-muted)', fontSize:13 }}>Nenhuma anotação ainda.</p>
            : <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {anotacoes.slice(0,4).map(a => (
                  <div key={a.id} onClick={() => setPage('anotacoes')}
                    style={{ cursor:'pointer', display:'flex', alignItems:'center', gap:9 }}>
                    {/* A bolinha repete a cor do cartão: é assim que a pessoa
                        reconhece a anotação sem precisar ler o título. */}
                    <span style={{ width:9, height:9, borderRadius:'50%', flexShrink:0,
                      background: COR_ANOTACAO[a.cor] || 'var(--border)' }}/>
                    <span style={{ fontSize:13, fontWeight:600, overflow:'hidden',
                      textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {a.titulo || a.texto || 'Sem título'}
                    </span>
                    {a.fixada && <Pin size={12} style={{ color:'var(--text-muted)', flexShrink:0 }}/>}
                  </div>
                ))}
              </div>
          }
        </div>

      </div>

      {/* Cliente que precisa de uma segunda loja não tinha como pedir.
          Quem administra uma loja não enxerga a tela de Lojas — ela é do
          dono do sistema e de quem já contratou para uma rede — então
          essa necessidade morria em silêncio, sem virar conversa.
          Aparece só para quem decide (admin) e só para quem AINDA não
          tem grupo: quem já tem cria as lojas dele sozinho. */}
      {/* authProfile, não profile: quando o dono do sistema entra numa loja
          ele é apresentado como admin dela, e cairia aqui — sendo convidado
          a mandar e-mail para si mesmo. O cargo real resolve. */}
      {authProfile?.access_level === 'admin' && !authProfile?.grupo && (
        <div className="card" style={{ marginTop: 18, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>
              Sua empresa tem mais de uma loja?
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Dá para administrar todas por aqui, cada uma com a sua equipe — e você
              acompanhando de um lugar só.
            </div>
          </div>
          <a href={`mailto:contato@rotalider.com.br?subject=${encodeURIComponent('Quero abrir mais lojas')}&body=${encodeURIComponent(`Loja: ${profile?.company || ''}
Quantas lojas: 
Cidades: 
`)}`}
            className="btn btn-primary btn-sm" style={{ textDecoration: 'none', flexShrink: 0 }}>
            Quero abrir mais lojas
          </a>
        </div>
      )}
    </div>
  );
}
