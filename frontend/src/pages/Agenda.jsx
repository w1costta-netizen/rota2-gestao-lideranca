import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, FileDown, Send, CalendarDays, Printer } from 'lucide-react';
import { agendaAPI, leadersAPI, pdfAPI } from '../api';
import api from '../api';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import { getWeekStart, addDays, formatDate } from '../utils';
import { registerPush } from '../lib/push';

const DAYS = ['segunda','terca','quarta','quinta','sexta','sabado','domingo'];
const DAY_LABELS = { segunda:'Segunda', terca:'Terça', quarta:'Quarta', quinta:'Quinta', sexta:'Sexta', sabado:'Sábado', domingo:'Domingo' };
const EMPTY_ITEM = { title: '', description: '', target_type: 'geral', target_value: '', day_of_week: 'segunda', time: '', lembrete_minutos: null };

const WA_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

export default function Agenda({ userId, profile }) {
  const toast = useToast();
  // canManage: pode criar/editar/deletar itens de agenda
  // seeAll: vê todos os itens da empresa (só admin/master — master já vira admin via effectiveProfile)
  const canManage = ['admin', 'supervisor', 'lider', 'master'].includes(profile?.access_level);
  const seeAll    = profile?.access_level === 'admin';
  const isAdmin   = canManage;
  const [week, setWeek]         = useState(getWeekStart());
  const [items, setItems]       = useState([]);
  const [leaders, setLeaders]   = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [sectors, setSectors]   = useState([]);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [selectedDay, setSelectedDay] = useState(() => {
    // Começa no dia atual da semana (ou segunda se fim de semana)
    const jsDay = new Date().getDay(); // 0=Dom
    const map = [6, 0, 1, 2, 3, 4, 5]; // Dom→índice6, Seg→0, ...
    const idx = map[jsDay];
    return DAYS[idx < 6 ? idx : 0]; // Se sábado/domingo, cai na segunda
  });
  const [modal, setModal]     = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm]       = useState(EMPTY_ITEM);
  const [saving, setSaving]   = useState(false);
  const [sendModal, setSendModal]   = useState(false);
  const [sendLeader, setSendLeader] = useState(null);
  const [notify, setNotify]         = useState(null); // { item, affectedLeaders }
  const [sendAllModal, setSendAllModal] = useState(false);
  const [selectedLeaders, setSelectedLeaders] = useState([]);
  const [sendQueue, setSendQueue] = useState([]); // modal sequencial
  const [sendQueueIdx, setSendQueueIdx] = useState(0);
  const [viewUserId, setViewUserId] = useState('all'); // 'all' | userId

  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);

  useEffect(() => {
    if (userId && Notification.permission !== 'denied') registerPush(userId);
  }, [userId]);

  const company = profile?.company || '';

  const load = () => {
    // Admin vê tudo; líderes/colaboradores veem apenas os seus
    if (seeAll) {
      agendaAPI.list(week, company).then(r => setItems(r.data));
    } else {
      api.get('/agenda', { params: { week_start: week, user_id: userId, sector: profile?.sector || '' } })
        .then(r => setItems(r.data));
    }
  };

  useEffect(() => { if (userId) load(); }, [week, company, userId, seeAll]);
  useEffect(() => {
    leadersAPI.list().then(r => {
      setLeaders(r.data);
    });
    // Carrega usuários do novo sistema para o modal de envio e para montar setores
    if (userId) {
      const company = profile?.company || '';
      const cq = company ? `&company=${encodeURIComponent(company)}` : '';
      api.get(`/admin/users?requester_id=${userId}${cq}`)
        .then(r => {
          const users = r.data || [];
          setProfiles(users);
          const setoresUnicos = [...new Set(users.map(u => u.sector).filter(Boolean))].sort();
          setSectors(setoresUnicos);
        })
        .catch(() => {});
    }
  }, [userId, profile?.company]);

  const prevWeek = () => setWeek(addDays(week, -7));
  const nextWeek = () => setWeek(addDays(week, 7));

  const openNew  = (day) => { setEditing(null); setForm({ ...EMPTY_ITEM, day_of_week: day || 'segunda' }); setModal(true); };
  const openEdit = (item) => { setEditing(item.id); setForm({ ...item }); setModal(true); };

  // Determina líderes afetados pelo item (para WhatsApp rápido)
  const getAffectedLeaders = (item) => {
    if (item.target_type === 'geral') return leaders;
    if (item.target_type === 'setor') return leaders.filter(l => l.sector === item.target_value);
    const ids = item.target_value ? item.target_value.split(',') : [];
    return leaders.filter(l => ids.includes(String(l.id)));
  };

  const save = async () => {
    if (!form.title || !form.day_of_week) { toast('Título e dia são obrigatórios', 'error'); return; }
    if (form.target_type === 'setor' && !form.target_value) { toast('Selecione o setor', 'error'); return; }
    if (form.target_type === 'lider' && !form.target_value.split(',').filter(Boolean).length) { toast('Selecione ao menos um líder', 'error'); return; }
    setSaving(true);
    try {
      let saved;
      if (editing) {
        const r = await agendaAPI.update(editing, { ...form, week_start: week, updated_by: userId });
        saved = r.data;
      } else {
        const r = await agendaAPI.create({ ...form, week_start: week, created_by: userId, company: company || undefined });
        saved = r.data;
      }
      setModal(false);
      load();
      // Mostra modal de notificações
      setNotify({ item: saved || form, affectedLeaders: getAffectedLeaders(form) });
    } catch { toast('Erro ao salvar', 'error'); }
    setSaving(false);
  };

  const remove = async (id) => {
    if (!confirm('Remover este item?')) return;
    await agendaAPI.remove(id);
    toast('Item removido');
    load();
  };

  const openSend = (leader) => { setSendLeader(leader); setSendModal(true); };

  const buildWhatsAppMessage = async (leader) => {
    const r = await agendaAPI.forLeader(leader.id, week);
    const { items: li } = r.data;
    if (li.length === 0) return `Olá ${leader.name}! Não há itens de agenda para você esta semana.`;
    const grouped = {};
    li.forEach(i => { if (!grouped[i.day_of_week]) grouped[i.day_of_week] = []; grouped[i.day_of_week].push(i); });
    let msg = `📋 *Agenda da semana*\nOlá, ${leader.name}! Segue sua agenda:\n\n`;
    const [wy1, wm1, wd1] = week.split('-').map(Number);
    DAYS.forEach((day, idx) => {
      if (!grouped[day]) return;
      const dt1 = new Date(Date.UTC(wy1, wm1 - 1, wd1 + idx));
      const d = String(dt1.getUTCDate()).padStart(2, '0');
      const m = String(dt1.getUTCMonth() + 1).padStart(2, '0');
      msg += `*${DAY_LABELS[day]}, ${d}/${m}*\n`;
      grouped[day].forEach(i => { const desc = i.description?.trim(); msg += `• ${i.time ? i.time + ' — ' : ''}${i.title}${desc ? '\n  _' + desc + '_' : ''}\n`; });
      msg += '\n';
    });
    msg += '_Enviado via Rota 2.0_';
    return msg;
  };

  const openWA = async (leader) => {
    const msg = await buildWhatsAppMessage(leader);
    const clean = leader.whatsapp.replace(/\D/g, '');
    window.open(`https://wa.me/${clean}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const sendWhatsApp = async () => {
    if (!sendLeader) return;
    await openWA(sendLeader);
    setSendModal(false);
    toast(`Abrindo WhatsApp para ${sendLeader.name}`);
  };

  const openSendAllModal = () => {
    setSelectedLeaders(profiles.map(p => p.id)); // todos selecionados por padrão
    setSendAllModal(true);
  };

  const toggleLeader = (id) => {
    setSelectedLeaders(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    setSelectedLeaders(prev => prev.length === profiles.length ? [] : profiles.map(p => p.id));
  };

  // Constrói mensagem de WhatsApp para um perfil com base nos itens da semana
  const buildMessageForProfile = (profile) => {
    const userItems = items.filter(item => {
      if (item.target_type === 'geral') return true;
      if (item.target_type === 'setor') return item.target_value === profile.sector;
      if (item.target_type === 'lider') return item.target_value.split(',').includes(profile.id);
      return false;
    });
    const firstName = profile.full_name?.split(' ')[0] || profile.full_name;
    if (userItems.length === 0)
      return `Olá ${firstName}! Não há itens de agenda para você esta semana.`;
    const grouped = {};
    userItems.forEach(i => {
      if (!grouped[i.day_of_week]) grouped[i.day_of_week] = [];
      grouped[i.day_of_week].push(i);
    });
    let msg = `📋 *Agenda da semana*\nOlá, ${firstName}! Segue sua agenda:\n\n`;
    const [wy2, wm2, wd2] = week.split('-').map(Number);
    DAYS.forEach((day, idx) => {
      if (!grouped[day]) return;
      const dt2 = new Date(Date.UTC(wy2, wm2 - 1, wd2 + idx));
      const d = String(dt2.getUTCDate()).padStart(2, '0');
      const m = String(dt2.getUTCMonth() + 1).padStart(2, '0');
      msg += `*${DAY_LABELS[day]}, ${d}/${m}*\n`;
      grouped[day].forEach(i => {
        const desc = i.description?.trim();
        msg += `• ${i.time ? i.time + ' — ' : ''}${i.title}${desc ? '\n  _' + desc + '_' : ''}\n`;
      });
      msg += '\n';
    });
    msg += '_Enviado via Rota 2.0_';
    return msg;
  };

  const sendSelected = () => {
    const toSend = profiles.filter(p => selectedLeaders.includes(p.id));
    setSendAllModal(false);
    setSendQueue(toSend);
    setSendQueueIdx(0);
  };

  const sendQueueCurrent = sendQueue[sendQueueIdx] || null;
  const sendQueueMsg = sendQueueCurrent ? (() => {
    const msg = buildMessageForProfile(sendQueueCurrent);
    const digits = sendQueueCurrent.phone ? sendQueueCurrent.phone.replace(/\D/g, '') : '';
    const phone = digits ? (digits.startsWith('55') ? digits : `55${digits}`) : '';
    return { url: `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, msg };
  })() : null;

  const sendQueueNext = () => {
    if (sendQueueIdx < sendQueue.length - 1) setSendQueueIdx(i => i + 1);
    else { setSendQueue([]); toast(`WhatsApp enviado para ${sendQueue.length} pessoa${sendQueue.length > 1 ? 's' : ''}!`); }
  };

  // Filtra itens pelo usuário selecionado no seletor
  const displayItems = viewUserId === 'all' ? items : items.filter(item => {
    const targetProfile = profiles.find(p => p.id === viewUserId);
    if (item.target_type === 'geral') return true;
    if (item.target_type === 'setor') return targetProfile?.sector === item.target_value;
    if (item.target_type === 'lider') {
      const ids = item.target_value ? item.target_value.split(',') : [];
      return ids.includes(viewUserId);
    }
    return false;
  });

  const byDay = {};
  DAYS.forEach(d => { byDay[d] = displayItems.filter(i => i.day_of_week === d); });

  const printWeekPDF = () => {
    const [wy, wm, wd] = week.split('-').map(Number);
    const weekLabel = formatDate(week);
    const companyName = profile?.company || '';
    const viewPerson = viewUserId === 'all' ? null : profiles.find(p => p.id === viewUserId);
    const personLabel = viewPerson ? viewPerson.full_name : 'Todos';

    const dayRows = DAYS.map((day, idx) => {
      const date = new Date(Date.UTC(wy, wm - 1, wd + idx));
      const dd = String(date.getUTCDate()).padStart(2, '0');
      const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
      const dayItems = displayItems.filter(i => i.day_of_week === day);
      const itemsHtml = dayItems.length === 0
        ? '<tr><td colspan="3" style="color:#999;font-style:italic;padding:6px 8px;">Nenhum item</td></tr>'
        : dayItems.map(i => {
            const tl = i.target_type === 'geral' ? 'Geral'
              : i.target_type === 'setor' ? `Setor: ${i.target_value}`
              : i.target_value ? i.target_value.split(',').map(id => {
                  const p = profiles.find(x => x.id === id);
                  return p ? p.full_name.split(' ')[0] : '';
                }).filter(Boolean).join(', ') : 'Individual';
            return `<tr>
              <td style="padding:6px 8px;width:70px;font-weight:600;color:#333;">${i.time || '—'}</td>
              <td style="padding:6px 8px;">
                <div style="font-weight:600;font-size:13px;">${i.title}</div>
                ${i.description ? `<div style="font-size:11px;color:#666;margin-top:2px;">${i.description}</div>` : ''}
              </td>
              <td style="padding:6px 8px;font-size:11px;color:#555;white-space:nowrap;">${tl}</td>
            </tr>`;
          }).join('');

      return `
        <div style="margin-bottom:14px;break-inside:avoid;">
          <div style="background:#e8621a;color:#fff;padding:6px 12px;font-weight:700;font-size:13px;border-radius:4px 4px 0 0;">
            ${DAY_LABELS[day]} &nbsp;·&nbsp; ${dd}/${mm}
          </div>
          <table style="width:100%;border-collapse:collapse;border:1px solid #ddd;border-top:none;border-radius:0 0 4px 4px;">
            ${itemsHtml}
          </table>
        </div>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Agenda ${weekLabel} — ${companyName}</title>
  <style>
    @page { size: A4 portrait; margin: 15mm 12mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #222; }
    h1 { font-size: 18px; font-weight: 800; margin-bottom: 2px; }
    .subtitle { font-size: 12px; color: #666; margin-bottom: 16px; }
    table tr:nth-child(even) { background: #f9f9f9; }
    table tr td { border-bottom: 1px solid #eee; vertical-align: top; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <h1>Agenda Semanal — ${companyName}</h1>
  <div class="subtitle">${weekLabel}${viewPerson ? ` &nbsp;·&nbsp; ${personLabel}` : ''}</div>
  ${dayRows}
  <div style="margin-top:20px;font-size:10px;color:#aaa;text-align:right;">Gerado em ${new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}</div>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
  };

  const targetLabel = (item) => {
    if (item.target_type === 'geral') return { label: 'Geral', cls: 'badge-green' };
    if (item.target_type === 'setor') return { label: `Setor: ${item.target_value}`, cls: 'badge-amber' };
    const ids = item.target_value ? item.target_value.split(',') : [];
    const nomes = ids.map(id => {
      const p = profiles.find(x => x.id === id);
      return p ? p.full_name.split(' ')[0] : null;
    }).filter(Boolean);
    return { label: nomes.length ? nomes.join(', ') : 'Individual', cls: 'badge-purple' };
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Agenda Semanal</div>
          <div className="page-subtitle">{displayItems.length} itens esta semana</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn btn-ghost btn-sm" onClick={prevWeek}><ChevronLeft size={15} /></button>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{formatDate(week)}</span>
          <button className="btn btn-ghost btn-sm" onClick={nextWeek}><ChevronRight size={15} /></button>
          <button className="btn btn-ghost btn-sm" onClick={printWeekPDF} title="Imprimir / Baixar PDF da semana">
            <Printer size={15} />{!isMobile && ' PDF'}
          </button>
          {isAdmin && <>
            <button className="btn btn-ghost btn-sm" onClick={openSendAllModal} title="Enviar para líderes"><Send size={15} /> Enviar</button>
            <button className="btn btn-primary btn-sm" onClick={() => openNew()}><Plus size={15} /> Novo item</button>
          </>}
        </div>
      </div>

      {/* Seletor de pessoa — admin vê todos; outros só veem a si mesmos */}
      {seeAll && profiles.length > 0 && (
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, flexWrap:'wrap' }}>
          <span style={{ fontSize:13, color:'var(--text-muted)', fontWeight:600 }}>Visualizando:</span>
          <select
            value={viewUserId}
            onChange={e => setViewUserId(e.target.value)}
            style={{
              padding:'7px 14px', borderRadius:10, border:'1px solid var(--border)',
              background: viewUserId !== 'all' ? 'var(--primary)' : 'var(--surface)',
              color: viewUserId !== 'all' ? '#fff' : 'var(--text)',
              fontSize:13, fontWeight:600, cursor:'pointer', outline:'none',
            }}
          >
            <option value="all">👥 Todos os itens</option>
            {profiles.map(p => (
              <option key={p.id} value={p.id}>
                {p.id === userId ? `👤 Minha agenda (${p.full_name.split(' ')[0]})` : p.full_name}
              </option>
            ))}
          </select>
          {viewUserId !== 'all' && (
            <button className="btn btn-ghost btn-sm" onClick={() => setViewUserId('all')} style={{ fontSize:12 }}>
              ✕ Limpar filtro
            </button>
          )}
        </div>
      )}

      {/* Botões por líder — só admin */}
      {isAdmin && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {leaders.map(l => (
            <div key={l.id} style={{ display: 'flex', gap: 4 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => openSend(l)} title="Enviar WhatsApp">
                <Send size={13} /> {l.name}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => pdfAPI.download(l.id, week)} title="Baixar PDF">
                <FileDown size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Aviso para não-admins */}
      {!seeAll && (
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', borderRadius:8,
          background:'rgba(232,98,42,.08)', border:'1px solid rgba(232,98,42,.2)', marginBottom:20, fontSize:13 }}>
          📅 Você está vendo apenas os itens destinados a você ou ao seu setor.
        </div>
      )}

      {/* ── Seletor de dia (só mobile) ──────────────────── */}
      {isMobile && (
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)',
          borderRadius:14, padding:'12px 10px', marginBottom:16 }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4 }}>
            {DAYS.map(day => {
              const hasItems = byDay[day]?.length > 0;
              const isActive = selectedDay === day;
              return (
                <button key={day} onClick={() => setSelectedDay(day)} style={{
                  display:'flex', flexDirection:'column', alignItems:'center', gap:3,
                  padding:'8px 2px', borderRadius:10, border:'none', cursor:'pointer',
                  background: isActive ? 'var(--primary)' : 'transparent',
                  transition:'background .15s',
                }}>
                  <span style={{ fontSize:9, fontWeight:600, color: isActive ? '#fff' : 'var(--text-muted)' }}>
                    {DAY_LABELS[day].slice(0,3).toUpperCase()}
                  </span>
                  <div style={{ width:6, height:6, borderRadius:'50%',
                    background: hasItems ? (isActive ? '#fff' : 'var(--primary)') : 'transparent' }}/>
                </button>
              );
            })}
          </div>
          <div style={{ textAlign:'center', marginTop:8, fontSize:13, fontWeight:700, color:'var(--text)' }}>
            {DAY_LABELS[selectedDay]}
            <span style={{ fontSize:12, fontWeight:400, color:'var(--text-muted)', marginLeft:6 }}>
              {byDay[selectedDay]?.length || 0} item{byDay[selectedDay]?.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      )}

      {/* ── Grade de dias ────────────────────────────────── */}
      <div className="agenda-grid">
        {DAYS.filter(day => !isMobile || day === selectedDay).map(day => (
          <div className="agenda-day-col" key={day}>
            <div className="agenda-day-title">
              <span>{DAY_LABELS[day]}</span>
              {canManage && (
                <button
                  style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 6, padding: '2px 8px', color: 'white', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
                  onClick={() => openNew(day)} title="Adicionar item"
                >+</button>
              )}
            </div>
            {byDay[day].length === 0 ? (
              <div style={{ padding: '20px 16px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>Nenhum item</div>
            ) : (
              byDay[day].map(item => {
                const { label, cls } = targetLabel(item);
                return (
                  <div className="agenda-item" key={item.id}>
                    <div className={`agenda-item-bar ${item.target_type}`} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                        <div className="agenda-item-title">{item.title}</div>
                        {canManage && (
                          <div className="agenda-item-actions">
                            <button className="btn-icon" style={{ padding: 4 }} onClick={() => openEdit(item)}><Pencil size={12} /></button>
                            <button className="btn-icon danger" style={{ padding: 4 }} onClick={() => remove(item.id)}><Trash2 size={12} /></button>
                          </div>
                        )}
                      </div>
                      {item.description && <div className="agenda-item-desc">{item.description}</div>}
                      <div style={{ display: 'flex', gap: 6, marginTop: 5, alignItems: 'center' }}>
                        {item.time && <span className="agenda-item-time">⏰ {item.time}</span>}
                        <span className={`badge ${cls}`}>{label}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ))}
      </div>

      {/* FAB mobile */}
      {canManage && (
        <button onClick={() => openNew(isMobile ? selectedDay : 'segunda')} style={{
          position:'fixed', bottom:24, right:20, zIndex:500,
          width:52, height:52, borderRadius:'50%',
          background:'var(--primary)', color:'#fff', border:'none',
          display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:'0 4px 16px rgba(232,98,42,.5)', cursor:'pointer',
        }} aria-label="Novo item">
          <Plus size={24}/>
        </button>
      )}

      {/* Modal — Selecionar líderes para envio */}
      {sendAllModal && (
        <Modal open={sendAllModal} onClose={() => setSendAllModal(false)}
          title="Enviar agenda via WhatsApp"
          footer={<>
            <button className="btn btn-ghost" onClick={() => setSendAllModal(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={sendSelected} disabled={selectedLeaders.length === 0}>
              <Send size={14}/> Enviar para {selectedLeaders.length} pessoa{selectedLeaders.length !== 1 ? 's' : ''}
            </button>
          </>}
        >
          {/* Toggle selecionar todos */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12,
            paddingBottom:12, borderBottom:'1px solid var(--border)' }}>
            <span style={{ fontSize:13, fontWeight:600 }}>
              {selectedLeaders.length === profiles.length ? 'Todos selecionados' : `${selectedLeaders.length} de ${profiles.length} selecionados`}
            </span>
            <button type="button" onClick={toggleAll}
              style={{ fontSize:12, color:'var(--primary)', background:'none', border:'none',
                cursor:'pointer', fontWeight:600 }}>
              {selectedLeaders.length === profiles.length ? 'Desmarcar todos' : 'Selecionar todos'}
            </button>
          </div>

          {/* Lista de usuários */}
          <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:320, overflowY:'auto' }}>
            {profiles.length === 0 && (
              <p style={{ fontSize:13, color:'var(--text-muted)', textAlign:'center', padding:'20px 0' }}>
                Nenhum usuário cadastrado ainda.
              </p>
            )}
            {profiles.map(p => {
              const selected = selectedLeaders.includes(p.id);
              return (
                <label key={p.id} style={{
                  display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderRadius:8,
                  cursor:'pointer', border:`1px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
                  background: selected ? 'rgba(232,98,42,.06)' : 'var(--surface-2)',
                  transition:'all .15s',
                }}>
                  <input type="checkbox" checked={selected} onChange={() => toggleLeader(p.id)}
                    style={{ accentColor:'var(--primary)', width:16, height:16, flexShrink:0 }}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:600, fontSize:13 }}>{p.full_name}</div>
                    <div style={{ fontSize:11, color:'var(--text-muted)' }}>{p.sector || p.role || '—'}</div>
                  </div>
                  {p.phone
                    ? <span style={{ fontSize:11, color:'var(--text-muted)' }}>{p.phone}</span>
                    : <span style={{ fontSize:10, color:'#f59e0b', fontWeight:600 }}>Sem número</span>
                  }
                </label>
              );
            })}
          </div>
        </Modal>
      )}

      {/* Modal envio individual por líder */}
      <Modal open={sendModal} onClose={() => setSendModal(false)}
        title={`Enviar agenda — ${sendLeader?.name}`}
        footer={<>
          <button className="btn btn-ghost" onClick={() => setSendModal(false)}>Cancelar</button>
          <button className="btn btn-accent" onClick={sendWhatsApp}><Send size={14} /> Abrir WhatsApp</button>
        </>}
      >
        <p style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          Vai abrir o WhatsApp Web com a mensagem já preenchida para <strong>{sendLeader?.name}</strong>.
        </p>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 10 }}>
          📱 Número: {sendLeader?.whatsapp}
        </p>
      </Modal>

      {/* Modal criar/editar item */}
      <Modal open={modal} onClose={() => setModal(false)}
        title={editing ? 'Editar item' : 'Novo item de agenda'}
        footer={<>
          <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
        </>}
      >
        <div className="form-group">
          <label className="form-label">Título *</label>
          <input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex: Reunião de equipe" />
        </div>
        <div className="form-group">
          <label className="form-label">Descrição</label>
          <textarea className="input" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Detalhes opcionais..." style={{ resize: 'vertical' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Dia *</label>
            <select className="select" value={form.day_of_week} onChange={e => setForm(f => ({ ...f, day_of_week: e.target.value }))}>
              {DAYS.map(d => <option key={d} value={d}>{DAY_LABELS[d]}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Horário</label>
            <input className="input" type="time" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">🔔 Lembrete</label>
          <select className="select" value={form.lembrete_minutos ?? ''}
            onChange={e => setForm(f => ({ ...f, lembrete_minutos: e.target.value === '' ? null : Number(e.target.value) }))}>
            <option value="">Sem lembrete</option>
            <option value="0">Na hora</option>
            <option value="5">5 minutos antes</option>
            <option value="10">10 minutos antes</option>
            <option value="15">15 minutos antes</option>
            <option value="30">30 minutos antes</option>
            <option value="60">1 hora antes</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Destino *</label>
          <select className="select" value={form.target_type} onChange={e => setForm(f => ({ ...f, target_type: e.target.value, target_value: '' }))}>
            <option value="geral">Geral (todos os líderes)</option>
            <option value="setor">Por setor</option>
            <option value="lider">Líder específico</option>
          </select>
        </div>
        {form.target_type === 'setor' && (
          <div className="form-group">
            <label className="form-label">Setor</label>
            <select className="select" value={form.target_value} onChange={e => setForm(f => ({ ...f, target_value: e.target.value }))}>
              <option value="">Selecionar setor...</option>
              {sectors.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}
        {form.target_type === 'lider' && (
          <div className="form-group">
            <label className="form-label">
              Líderes
              {form.target_value && (
                <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>
                  {form.target_value.split(',').filter(Boolean).length} selecionado(s)
                </span>
              )}
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto',
              border: '1px solid var(--border)', borderRadius: 8, padding: '8px 4px' }}>
              {profiles.length === 0 && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
                  Nenhum usuário cadastrado.
                </p>
              )}
              {profiles.map(p => {
                const selected = form.target_value.split(',').includes(p.id);
                return (
                  <label key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 6,
                    cursor: 'pointer', background: selected ? 'rgba(232,98,42,.08)' : 'transparent',
                    transition: 'background .15s',
                  }}>
                    <input type="checkbox" checked={selected} onChange={() => {
                      const ids = form.target_value.split(',').filter(Boolean);
                      const next = selected ? ids.filter(x => x !== p.id) : [...ids, p.id];
                      setForm(f => ({ ...f, target_value: next.join(',') }));
                    }} style={{ accentColor: 'var(--primary)', width: 15, height: 15, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{p.full_name}</div>
                      {p.sector && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.sector}</div>}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de notificações pós-salvar */}
      {notify && (
        <Modal open={!!notify} onClose={() => setNotify(null)} title="✅ Item salvo — Notificar líderes">
          <div style={{ marginBottom:16 }}>
            <p style={{ fontWeight:700, marginBottom:4 }}>{notify.item?.title}</p>
            <p style={{ fontSize:12, color:'var(--text-muted)' }}>
              {DAY_LABELS[notify.item?.day_of_week]}{notify.item?.time ? ' às ' + notify.item.time : ''}
            </p>
          </div>

          {/* Status push */}
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:8,
            background:'rgba(99,102,241,.08)', border:'1px solid rgba(99,102,241,.2)', marginBottom:16 }}>
            <span style={{ fontSize:18 }}>🔔</span>
            <div>
              <p style={{ fontSize:13, fontWeight:600 }}>Push notification disparado</p>
              <p style={{ fontSize:11, color:'var(--text-muted)' }}>
                Os líderes com o app salvo no celular receberão uma notificação automaticamente.
              </p>
            </div>
          </div>

          {/* WhatsApp rápido por líder afetado */}
          {notify.affectedLeaders?.length > 0 && (
            <>
              <p style={{ fontSize:12, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:.5, marginBottom:8 }}>
                Enviar via WhatsApp ({notify.affectedLeaders.length} líder{notify.affectedLeaders.length > 1 ? 'es' : ''})
              </p>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {notify.affectedLeaders.map(l => (
                  <button key={l.id} onClick={() => openWA(l)}
                    style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:8,
                      background:'#25d36610', border:'1px solid #25d36630', color:'#25d366',
                      cursor:'pointer', fontWeight:600, fontSize:13, textAlign:'left' }}>
                    {WA_ICON}
                    <span>{l.name}</span>
                    <span style={{ fontSize:11, color:'var(--text-muted)', marginLeft:'auto', fontWeight:400 }}>{l.sector}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          <button className="btn btn-ghost" style={{ width:'100%', justifyContent:'center', marginTop:16 }}
            onClick={() => setNotify(null)}>
            Fechar
          </button>
        </Modal>
      )}

      {/* Modal sequencial de envio */}
      {sendQueue.length > 0 && sendQueueCurrent && (
        <Modal open title={`Enviar WhatsApp — ${sendQueueIdx + 1} de ${sendQueue.length}`}
          onClose={() => setSendQueue([])}>
          <div style={{ textAlign:'center', padding:'8px 0 20px' }}>
            <div style={{ fontSize:40, marginBottom:8 }}>👤</div>
            <div style={{ fontWeight:700, fontSize:17 }}>{sendQueueCurrent.full_name}</div>
            <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:4 }}>{sendQueueCurrent.role} — {sendQueueCurrent.sector}</div>
            {sendQueueCurrent.phone
              ? <div style={{ fontSize:13, color:'#25d366', fontWeight:600 }}>{sendQueueCurrent.phone}</div>
              : <div style={{ fontSize:12, color:'#f59e0b' }}>⚠ Sem número cadastrado</div>}
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <a href={sendQueueMsg.url} target="_blank" rel="noreferrer"
              className="btn btn-primary" style={{ flex:1, justifyContent:'center', textDecoration:'none' }}
              onClick={() => setTimeout(sendQueueNext, 600)}>
              {WA_ICON}&nbsp; Abrir WhatsApp
            </a>
            <button className="btn btn-ghost" style={{ flex:1, justifyContent:'center' }} onClick={sendQueueNext}>
              {sendQueueIdx < sendQueue.length - 1 ? 'Pular →' : 'Concluir'}
            </button>
          </div>
          <div style={{ display:'flex', gap:4, justifyContent:'center', marginTop:14 }}>
            {sendQueue.map((_, i) => (
              <div key={i} style={{ width:8, height:8, borderRadius:'50%',
                background: i === sendQueueIdx ? 'var(--primary)' : 'var(--border)' }} />
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
