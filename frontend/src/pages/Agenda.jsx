import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, FileDown, Send } from 'lucide-react';
import { agendaAPI, leadersAPI, pdfAPI } from '../api';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import { getWeekStart, addDays, formatDate } from '../utils';

const DAYS = ['segunda','terca','quarta','quinta','sexta','sabado','domingo'];
const DAY_LABELS = { segunda:'Segunda', terca:'Terça', quarta:'Quarta', quinta:'Quinta', sexta:'Sexta', sabado:'Sábado', domingo:'Domingo' };
const EMPTY_ITEM = { title: '', description: '', target_type: 'geral', target_value: '', day_of_week: 'segunda', time: '' };

export default function Agenda() {
  const toast = useToast();
  const [week, setWeek] = useState(getWeekStart());
  const [items, setItems] = useState([]);
  const [leaders, setLeaders] = useState([]);
  const [sectors, setSectors] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_ITEM);
  const [saving, setSaving] = useState(false);
  const [sendModal, setSendModal] = useState(false);
  const [sendLeader, setSendLeader] = useState(null);

  const load = () => agendaAPI.list(week).then(r => setItems(r.data));

  useEffect(() => { load(); }, [week]);
  useEffect(() => {
    leadersAPI.list().then(r => {
      setLeaders(r.data);
      setSectors([...new Set(r.data.map(l => l.sector))]);
    });
  }, []);

  const prevWeek = () => setWeek(addDays(week, -7));
  const nextWeek = () => setWeek(addDays(week, 7));

  const openNew = (day) => { setEditing(null); setForm({ ...EMPTY_ITEM, day_of_week: day || 'segunda' }); setModal(true); };
  const openEdit = (item) => { setEditing(item.id); setForm({ ...item }); setModal(true); };

  const save = async () => {
    if (!form.title || !form.day_of_week) { toast('Título e dia são obrigatórios', 'error'); return; }
    if (form.target_type !== 'geral' && !form.target_value) { toast('Selecione o destino', 'error'); return; }
    setSaving(true);
    try {
      if (editing) await agendaAPI.update(editing, { ...form, week_start: week });
      else await agendaAPI.create({ ...form, week_start: week });
      toast(editing ? 'Item atualizado!' : 'Item adicionado!');
      setModal(false);
      load();
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
    let msg = `📋 *Agenda da semana — ${formatDate(week)}*\nOlá, ${leader.name}! Segue sua agenda:\n\n`;
    DAYS.forEach(day => {
      if (!grouped[day]) return;
      msg += `*${DAY_LABELS[day]}*\n`;
      grouped[day].forEach(i => { msg += `• ${i.time ? i.time + ' — ' : ''}${i.title}${i.description ? '\n  _' + i.description + '_' : ''}\n`; });
      msg += '\n';
    });
    msg += '_Enviado via GestãoLiderança_';
    return msg;
  };

  const sendWhatsApp = async () => {
    if (!sendLeader) return;
    const msg = await buildWhatsAppMessage(sendLeader);
    const clean = sendLeader.whatsapp.replace(/\D/g, '');
    const url = `https://wa.me/${clean}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
    setSendModal(false);
    toast(`Abrindo WhatsApp para ${sendLeader.name}`);
  };

  const sendAll = async () => {
    if (!confirm(`Enviar agenda via WhatsApp para todos os ${leaders.length} líderes?`)) return;
    for (const l of leaders) {
      const msg = await buildWhatsAppMessage(l);
      const clean = l.whatsapp.replace(/\D/g, '');
      window.open(`https://wa.me/${clean}?text=${encodeURIComponent(msg)}`, '_blank');
      await new Promise(r => setTimeout(r, 600));
    }
    toast('Links do WhatsApp abertos para todos os líderes!');
  };

  const byDay = {};
  DAYS.forEach(d => { byDay[d] = items.filter(i => i.day_of_week === d); });

  const targetLabel = (item) => {
    if (item.target_type === 'geral') return { label: 'Geral', cls: 'badge-green' };
    if (item.target_type === 'setor') return { label: `Setor: ${item.target_value}`, cls: 'badge-amber' };
    const l = leaders.find(x => String(x.id) === String(item.target_value));
    return { label: l ? l.name : 'Individual', cls: 'badge-purple' };
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Agenda Semanal</div>
          <div className="page-subtitle">{items.length} itens esta semana</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn btn-ghost btn-sm" onClick={prevWeek}><ChevronLeft size={15} /></button>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{formatDate(week)}</span>
          <button className="btn btn-ghost btn-sm" onClick={nextWeek}><ChevronRight size={15} /></button>
          <button className="btn btn-ghost btn-sm" onClick={sendAll} title="Enviar para todos"><Send size={15} /> Enviar tudo</button>
          <button className="btn btn-primary btn-sm" onClick={() => openNew()}><Plus size={15} /> Novo item</button>
        </div>
      </div>

      {/* Per-leader send buttons */}
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

      <div className="agenda-grid">
        {DAYS.map(day => (
          <div className="agenda-day-col" key={day}>
            <div className="agenda-day-title">
              <span>{DAY_LABELS[day]}</span>
              <button
                style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 6, padding: '2px 8px', color: 'white', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
                onClick={() => openNew(day)} title="Adicionar item"
              >+</button>
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
                        <div className="agenda-item-actions">
                          <button className="btn-icon" style={{ padding: 4 }} onClick={() => openEdit(item)}><Pencil size={12} /></button>
                          <button className="btn-icon danger" style={{ padding: 4 }} onClick={() => remove(item.id)}><Trash2 size={12} /></button>
                        </div>
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

      {/* Send WhatsApp modal */}
      <Modal
        open={sendModal}
        onClose={() => setSendModal(false)}
        title={`Enviar agenda — ${sendLeader?.name}`}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setSendModal(false)}>Cancelar</button>
            <button className="btn btn-accent" onClick={sendWhatsApp}><Send size={14} /> Abrir WhatsApp</button>
          </>
        }
      >
        <p style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          Vai abrir o WhatsApp Web com a mensagem já preenchida para <strong>{sendLeader?.name}</strong>.
          A mensagem incluirá apenas os itens dos dias em que {sendLeader?.name} trabalha.
        </p>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 10 }}>
          📱 Número: {sendLeader?.whatsapp}
        </p>
      </Modal>

      {/* Add/Edit modal */}
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editing ? 'Editar item' : 'Novo item de agenda'}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
          </>
        }
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
            <label className="form-label">Líder</label>
            <select className="select" value={form.target_value} onChange={e => setForm(f => ({ ...f, target_value: e.target.value }))}>
              <option value="">Selecionar líder...</option>
              {leaders.map(l => <option key={l.id} value={l.id}>{l.name} ({l.sector})</option>)}
            </select>
          </div>
        )}
      </Modal>
    </div>
  );
}
