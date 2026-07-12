import React, { useEffect, useState } from 'react';
import {
  Megaphone, CheckSquare, LayoutList, Tag, CalendarDays,
  AlertTriangle, Clock, CheckCircle, TrendingUp, Users
} from 'lucide-react';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';
import { getWeekStart, formatDate } from '../utils';

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

export default function Dashboard({ setPage }) {
  const { session, profile } = useAuth();
  const userId   = session?.user?.id;
  const isAdmin  = ['admin','supervisor'].includes(profile?.access_level);
  const week     = getWeekStart();

  const [stats, setStats]         = useState({});
  const [tarefas, setTarefas]     = useState([]);
  const [comunicados, setComunicados] = useState([]);
  const [campanhas, setCampanhas] = useState([]);
  const [agenda, setAgenda]       = useState([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    if (!userId) return;
    Promise.all([
      api.get(`/tarefas?requester_id=${userId}`).catch(() => ({ data: [] })),
      api.get(`/comunicados?requester_id=${userId}`).catch(() => ({ data: [] })),
      api.get(`/campanhas?requester_id=${userId}`).catch(() => ({ data: [] })),
      api.get(`/agenda/${week}?requester_id=${userId}`).catch(() => ({ data: [] })),
      isAdmin ? api.get(`/admin/users?requester_id=${userId}`).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
    ]).then(([t, c, camp, ag, users]) => {
      setTarefas(t.data || []);
      setComunicados(c.data || []);
      setCampanhas(camp.data || []);
      setAgenda(ag.data || []);
      setStats({ totalUsers: (users.data || []).length });
    }).finally(() => setLoading(false));
  }, [userId]);

  const todayIdx = new Date().getDay(); // 0=dom
  const dayNames = ['domingo','segunda','terca','quarta','quinta','sexta','sabado'];
  const todayKey = dayNames[todayIdx];

  // Tarefas
  const tarefasPendentes  = tarefas.filter(t => t.status === 'pendente');
  const tarefasEmAndamento = tarefas.filter(t => t.status === 'em_andamento');
  const tarefasAtrasadas  = tarefas.filter(t => {
    if (!t.due_date || t.status === 'concluida') return false;
    return t.due_date < new Date().toISOString().split('T')[0];
  });

  // Comunicados não lidos
  const naoLidos = comunicados.filter(c => !c.lido);
  const urgentes  = comunicados.filter(c => c.prioridade === 'urgente' && !c.lido);

  // Campanhas ativas (não arquivadas, com itens)
  const campAtivasSemConcluir = campanhas.filter(c => {
    const total   = c.campanha_itens?.length || 0;
    const itensIds = c.campanha_itens?.map(i => i.id) || [];
    const feitos  = c.campanha_evidencias?.filter(e => itensIds.includes(e.item_id)).length || 0;
    return total > 0 && feitos < total;
  });

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
          : <StatCard icon={Tag} color="#10b981" bg="#10b98115"
              value={campAtivasSemConcluir.length} label="Flyers em conferência"
              onClick={() => setPage('campanhas')}/>
        }
      </div>

      {/* Grade de conteúdo */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>

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
                            {t.titulo}
                          </div>
                          {t.due_date && (
                            <div style={{ fontSize:11, color: atrasada ? '#ef4444' : 'var(--text-muted)', marginTop:1 }}>
                              {atrasada ? '⚠ ' : ''}Prazo: {new Date(t.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                            </div>
                          )}
                        </div>
                        <span style={{
                          fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:6,
                          background: t.prioridade === 'alta' ? '#ef444420' : t.prioridade === 'media' ? '#f59e0b20' : '#6366f120',
                          color: t.prioridade === 'alta' ? '#ef4444' : t.prioridade === 'media' ? '#f59e0b' : '#6366f1',
                        }}>
                          {t.prioridade === 'alta' ? 'Alta' : t.prioridade === 'media' ? 'Média' : 'Baixa'}
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
                    padding:'10px 12px', borderRadius:8,
                    background: !c.lido ? 'var(--primary)10' : 'var(--bg)',
                    border:`1px solid ${!c.lido ? 'var(--primary)40' : 'var(--border)'}`,
                  }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                      {c.prioridade === 'urgente' && <AlertTriangle size={12} color="#ef4444"/>}
                      <span style={{ fontWeight:600, fontSize:13 }}>{c.titulo}</span>
                      {!c.lido && <span style={{ marginLeft:'auto', fontSize:10, fontWeight:700,
                        color:'var(--primary)', background:'var(--primary)20',
                        padding:'1px 6px', borderRadius:99 }}>NOVO</span>}
                    </div>
                    <div style={{ fontSize:11, color:'var(--text-muted)', overflow:'hidden',
                      display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
                      {c.mensagem}
                    </div>
                  </div>
                ))}
              </div>
          }
        </div>

        {/* Campanhas em andamento */}
        <div className="card">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <div style={{ fontWeight:700, fontSize:14, display:'flex', alignItems:'center', gap:8 }}>
              <Tag size={15} color="#10b981"/> Conferência de Flyers
            </div>
            <button className="btn-icon" style={{ fontSize:12, color:'var(--primary)' }} onClick={() => setPage('campanhas')}>
              Ver tudo
            </button>
          </div>
          {campanhas.length === 0
            ? <p style={{ color:'var(--text-muted)', fontSize:13 }}>Nenhuma campanha ativa.</p>
            : <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {campanhas.slice(0,4).map(c => {
                  const total    = c.campanha_itens?.length || 0;
                  const itensIds = c.campanha_itens?.map(i => i.id) || [];
                  const feitos   = c.campanha_evidencias?.filter(e => itensIds.includes(e.item_id)).length || 0;
                  const pct      = total ? Math.round((feitos/total)*100) : 0;
                  const ok       = total > 0 && feitos === total;
                  return (
                    <div key={c.id}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, fontWeight:600, marginBottom:4 }}>
                        <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'70%' }}>{c.titulo}</span>
                        <span style={{ fontWeight:700, color: ok ? '#10b981' : 'var(--primary)', flexShrink:0 }}>
                          {ok ? '✅ 100%' : `${feitos}/${total}`}
                        </span>
                      </div>
                      <div style={{ background:'var(--border)', borderRadius:6, height:7, overflow:'hidden' }}>
                        <div style={{ height:'100%', borderRadius:6, width:`${pct}%`,
                          background: ok ? '#10b981' : 'linear-gradient(90deg, var(--primary), #f59e0b)',
                          transition:'width .4s' }}/>
                      </div>
                    </div>
                  );
                })}
              </div>
          }
        </div>

      </div>
    </div>
  );
}
