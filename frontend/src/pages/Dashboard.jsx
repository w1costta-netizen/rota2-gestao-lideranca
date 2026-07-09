import React, { useEffect, useState } from 'react';
import { Users, CalendarDays, ClipboardList, TrendingUp } from 'lucide-react';
import { leadersAPI, agendaAPI } from '../api';
import { getWeekStart, formatDate } from '../utils';

export default function Dashboard({ setPage }) {
  const [leaders, setLeaders] = useState([]);
  const [items, setItems] = useState([]);
  const week = getWeekStart();

  useEffect(() => {
    leadersAPI.list().then(r => setLeaders(r.data));
    agendaAPI.list(week).then(r => setItems(r.data));
  }, []);

  const sectors = [...new Set(leaders.map(l => l.sector))];
  const todayDay = ['domingo','segunda','terca','quarta','quinta','sexta','sabado'][new Date().getDay()];
  const workingToday = leaders.filter(l => l.work_days.includes(todayDay));

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-subtitle">Semana de {formatDate(week)}</div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#dbeafe' }}>
            <Users size={22} color="#1d4ed8" />
          </div>
          <div>
            <div className="stat-value">{leaders.length}</div>
            <div className="stat-label">Líderes cadastrados</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#d1fae5' }}>
            <TrendingUp size={22} color="#065f46" />
          </div>
          <div>
            <div className="stat-value">{workingToday.length}</div>
            <div className="stat-label">Trabalhando hoje</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#fef3c7' }}>
            <CalendarDays size={22} color="#92400e" />
          </div>
          <div>
            <div className="stat-value">{items.length}</div>
            <div className="stat-label">Itens na agenda da semana</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#ede9fe' }}>
            <ClipboardList size={22} color="#4c1d95" />
          </div>
          <div>
            <div className="stat-value">{sectors.length}</div>
            <div className="stat-label">Setores</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Trabalhando hoje</div>
          {workingToday.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>Nenhum líder trabalha hoje.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {workingToday.map(l => (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: 'var(--primary)', color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: 14, flexShrink: 0
                  }}>
                    {l.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{l.name}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{l.sector} · {l.start_time}–{l.end_time}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Itens de hoje na agenda</div>
          {items.filter(i => i.day_of_week === todayDay).length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>Nenhum item para hoje.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {items.filter(i => i.day_of_week === todayDay).map(item => (
                <div key={item.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 3, alignSelf: 'stretch', borderRadius: 99,
                    background: item.target_type === 'geral' ? 'var(--accent)' : item.target_type === 'setor' ? 'var(--warning)' : '#6366f1',
                    flexShrink: 0
                  }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {item.time && <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>{item.time}</span>}
                      {item.title}
                    </div>
                    {item.description && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{item.description}</div>}
                    <span className={`badge ${item.target_type === 'geral' ? 'badge-green' : item.target_type === 'setor' ? 'badge-amber' : 'badge-purple'}`}
                      style={{ marginTop: 4 }}>
                      {item.target_type === 'geral' ? 'Geral' : item.target_type === 'setor' ? `Setor: ${item.target_value}` : 'Individual'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
