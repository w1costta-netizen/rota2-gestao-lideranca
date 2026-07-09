import React, { useEffect, useState, useRef } from 'react';
import { Plus, Pencil, Trash2, Upload, MessageCircle, Search } from 'lucide-react';
import { leadersAPI } from '../api';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import PhoneInput from '../components/PhoneInput';
import { formatPhone } from '../utils';
import DaysSelector from '../components/DaysSelector';

const DAY_LABELS = { segunda:'Seg', terca:'Ter', quarta:'Qua', quinta:'Qui', sexta:'Sex', sabado:'Sáb', domingo:'Dom' };

const EMPTY = { name: '', sector: '', whatsapp: '', work_days: [], start_time: '08:00', end_time: '17:00' };

export default function Leaders() {
  const toast = useToast();
  const [leaders, setLeaders] = useState([]);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();

  const load = () => leadersAPI.list().then(r => setLeaders(r.data));

  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm(EMPTY); setModal(true); };
  const openEdit = (l) => { setEditing(l.id); setForm({ ...l }); setModal(true); };

  const save = async () => {
    if (!form.name || !form.sector || !form.whatsapp || form.work_days.length === 0) {
      toast('Preencha todos os campos e selecione ao menos um dia', 'error'); return;
    }
    setSaving(true);
    try {
      if (editing) await leadersAPI.update(editing, form);
      else await leadersAPI.create(form);
      toast(editing ? 'Líder atualizado!' : 'Líder cadastrado!');
      setModal(false);
      load();
    } catch { toast('Erro ao salvar', 'error'); }
    setSaving(false);
  };

  const remove = async (id, name) => {
    if (!confirm(`Remover ${name}?`)) return;
    await leadersAPI.remove(id);
    toast('Líder removido');
    load();
  };

  const importCSV = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const r = await leadersAPI.importCSV(file);
      toast(`${r.data.imported} líderes importados!`);
      load();
    } catch (err) {
      toast(err.response?.data?.error || 'Erro na importação', 'error');
    }
    e.target.value = '';
  };

  const whatsappLink = (phone) => {
    const clean = phone.replace(/\D/g, '');
    return `https://wa.me/${clean}`;
  };

  const filtered = leaders.filter(l =>
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    l.sector.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Líderes</div>
          <div className="page-subtitle">{leaders.length} cadastrados</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current.click()}>
            <Upload size={15} /> Importar CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={importCSV} />
          <button className="btn btn-primary btn-sm" onClick={openNew}>
            <Plus size={15} /> Novo líder
          </button>
        </div>
      </div>

      <div className="card">
        <div style={{ marginBottom: 16, position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="input"
            style={{ paddingLeft: 34 }}
            placeholder="Buscar por nome ou setor..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Setor</th>
                <th>WhatsApp</th>
                <th>Dias de trabalho</th>
                <th>Horário</th>
                <th style={{ width: 100 }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  Nenhum líder encontrado.
                </td></tr>
              )}
              {filtered.map(l => (
                <tr key={l.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: 'var(--primary)', color: 'white',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: 13, flexShrink: 0
                      }}>{l.name.charAt(0).toUpperCase()}</div>
                      <span style={{ fontWeight: 600 }}>{l.name}</span>
                    </div>
                  </td>
                  <td><span className="badge badge-blue">{l.sector}</span></td>
                  <td style={{ color: 'var(--text-muted)' }}>{formatPhone(l.whatsapp)}</td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {l.work_days.map(d => (
                        <span key={d} className="badge badge-green">{DAY_LABELS[d] || d}</span>
                      ))}
                    </div>
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>{l.start_time}–{l.end_time}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <a href={whatsappLink(l.whatsapp)} target="_blank" rel="noreferrer">
                        <button className="btn-icon" title="WhatsApp">
                          <MessageCircle size={15} color="#25d366" />
                        </button>
                      </a>
                      <button className="btn-icon" onClick={() => openEdit(l)} title="Editar">
                        <Pencil size={15} />
                      </button>
                      <button className="btn-icon danger" onClick={() => remove(l.id, l.name)} title="Remover">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* CSV hint */}
      <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)', padding: '0 4px' }}>
        Formato CSV esperado: <code>nome, setor, whatsapp, dias (separados por ;), inicio, fim</code>
      </div>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editing ? 'Editar líder' : 'Novo líder'}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Nome *</label>
          <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome completo" />
        </div>
        <div className="form-group">
          <label className="form-label">Setor *</label>
          <input className="input" value={form.sector} onChange={e => setForm(f => ({ ...f, sector: e.target.value }))} placeholder="Ex: Operações, RH, TI..." />
        </div>
        <div className="form-group">
          <label className="form-label">WhatsApp *</label>
          <PhoneInput value={form.whatsapp} onChange={v => setForm(f => ({ ...f, whatsapp: v }))} />
          <span className="form-hint">Digite DDD + número. Ex: (98) 9 8220-9719</span>
        </div>
        <div className="form-group">
          <label className="form-label">Dias de trabalho *</label>
          <DaysSelector value={form.work_days} onChange={days => setForm(f => ({ ...f, work_days: days }))} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Início</label>
            <input className="input" type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Fim</label>
            <input className="input" type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
