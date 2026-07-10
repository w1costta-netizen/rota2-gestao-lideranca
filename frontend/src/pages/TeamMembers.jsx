import { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Pencil, Trash2, X, Save, UserCheck, UserX } from 'lucide-react';
import api from '../api';

const ROLES = ['Operador(a) de Caixa','Atendente','Repositor(a)','Supervisor(a)','Coordenador(a)','Auxiliar','Outro'];

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="btn-icon" onClick={onClose}><X size={16}/></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

const EMPTY = { matricula: '', name: '', role: '', sector: '', active: true };

export default function TeamMembers({ userId, userSector }) {
  const [members, setMembers]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(null); // null | 'add' | 'edit'
  const [form, setForm]         = useState(EMPTY);
  const [saving, setSaving]     = useState(false);
  const [toast, setToast]       = useState(null);
  const [filter, setFilter]     = useState('');

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/team?user_id=${userId}`);
      setMembers(res.data);
    } catch { showToast('Erro ao carregar colaboradores', 'error'); }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setForm({ ...EMPTY, sector: userSector || '' });
    setModal('add');
  };

  const openEdit = (m) => {
    setForm({ matricula: m.matricula||'', name: m.name||'', role: m.role||'', sector: m.sector||'', active: m.active, _id: m.id });
    setModal('edit');
  };

  const save = async () => {
    if (!form.name.trim()) return showToast('Nome é obrigatório', 'error');
    setSaving(true);
    try {
      if (modal === 'add') {
        await api.post('/team', { user_id: userId, ...form });
        showToast('Colaborador adicionado!');
      } else {
        await api.put(`/team/${form._id}`, form);
        showToast('Colaborador atualizado!');
      }
      setModal(null);
      load();
    } catch (e) {
      showToast(e.response?.data?.error || 'Erro ao salvar', 'error');
    }
    setSaving(false);
  };

  const remove = async (id, name) => {
    if (!confirm(`Excluir ${name}? As entradas de escala também serão removidas.`)) return;
    await api.delete(`/team/${id}`);
    showToast('Colaborador removido');
    load();
  };

  const toggleActive = async (m) => {
    await api.put(`/team/${m.id}`, { ...m, active: !m.active });
    load();
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const filtered = members.filter(m =>
    m.name.toLowerCase().includes(filter.toLowerCase()) ||
    (m.matricula||'').includes(filter)
  );

  const ativos   = filtered.filter(m => m.active);
  const inativos = filtered.filter(m => !m.active);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Meu Time</h1>
          <p className="page-subtitle">Colaboradores do setor <strong style={{ color:'var(--primary)' }}>{userSector || '—'}</strong></p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>
          <Plus size={15}/> Adicionar colaborador
        </button>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-icon"><Users size={22} color="var(--primary)"/></div>
          <div>
            <div className="stat-value">{members.length}</div>
            <div className="stat-label">Total cadastrados</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><UserCheck size={22} color="#10B981"/></div>
          <div>
            <div className="stat-value">{members.filter(m=>m.active).length}</div>
            <div className="stat-label">Ativos</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><UserX size={22} color="#888"/></div>
          <div>
            <div className="stat-value">{members.filter(m=>!m.active).length}</div>
            <div className="stat-label">Inativos</div>
          </div>
        </div>
      </div>

      {/* Busca */}
      <div className="card" style={{ marginBottom: 16 }}>
        <input className="input" placeholder="Buscar por nome ou matrícula..."
          value={filter} onChange={e => setFilter(e.target.value)} />
      </div>

      {loading ? (
        <div className="card" style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>Carregando...</div>
      ) : members.length === 0 ? (
        <div className="empty-state card">
          <Users size={48} style={{ opacity:.15, marginBottom:12 }}/>
          <h3>Nenhum colaborador cadastrado</h3>
          <p style={{ marginTop:6, color:'var(--text-muted)' }}>Adicione os membros do seu time para montar escalas.</p>
          <button className="btn btn-primary" style={{ marginTop:16 }} onClick={openAdd}>
            <Plus size={14}/> Adicionar primeiro colaborador
          </button>
        </div>
      ) : (
        <>
          {/* Ativos */}
          {ativos.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ fontWeight:700, fontSize:14, marginBottom:12, color:'#10B981' }}>
                Ativos ({ativos.length})
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Matrícula</th>
                      <th>Nome</th>
                      <th>Função</th>
                      <th>Setor</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {ativos.map(m => (
                      <tr key={m.id}>
                        <td style={{ color:'var(--text-muted)', fontSize:12 }}>{m.matricula || '—'}</td>
                        <td style={{ fontWeight:600 }}>{m.name}</td>
                        <td style={{ color:'var(--text-muted)' }}>{m.role || '—'}</td>
                        <td><span className="badge badge-orange">{m.sector || '—'}</span></td>
                        <td>
                          <div style={{ display:'flex', gap:4, justifyContent:'flex-end' }}>
                            <button className="btn-icon" title="Editar" onClick={() => openEdit(m)}><Pencil size={14}/></button>
                            <button className="btn-icon" title="Desativar" onClick={() => toggleActive(m)}><UserX size={14}/></button>
                            <button className="btn-icon danger" title="Excluir" onClick={() => remove(m.id, m.name)}><Trash2 size={14}/></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Inativos */}
          {inativos.length > 0 && (
            <div className="card">
              <div style={{ fontWeight:700, fontSize:14, marginBottom:12, color:'var(--text-muted)' }}>
                Inativos ({inativos.length})
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Matrícula</th><th>Nome</th><th>Função</th><th></th></tr></thead>
                  <tbody>
                    {inativos.map(m => (
                      <tr key={m.id} style={{ opacity:.5 }}>
                        <td style={{ fontSize:12 }}>{m.matricula || '—'}</td>
                        <td>{m.name}</td>
                        <td>{m.role || '—'}</td>
                        <td>
                          <div style={{ display:'flex', gap:4, justifyContent:'flex-end' }}>
                            <button className="btn-icon" title="Reativar" onClick={() => toggleActive(m)}><UserCheck size={14}/></button>
                            <button className="btn-icon danger" title="Excluir" onClick={() => remove(m.id, m.name)}><Trash2 size={14}/></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal add/edit */}
      {modal && (
        <Modal title={modal === 'add' ? 'Adicionar colaborador' : 'Editar colaborador'} onClose={() => setModal(null)}>
          <div className="form-group">
            <label className="form-label">Nome completo *</label>
            <input className="input" value={form.name} onChange={e => set('name', e.target.value.toUpperCase())}
              placeholder="NOME DO COLABORADOR" style={{ textTransform:'uppercase' }}/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="form-group" style={{ margin:0 }}>
              <label className="form-label">Matrícula</label>
              <input className="input" value={form.matricula} onChange={e => set('matricula', e.target.value)} placeholder="Ex: 477524"/>
            </div>
            <div className="form-group" style={{ margin:0 }}>
              <label className="form-label">Setor</label>
              <input className="input" value={form.sector} onChange={e => set('sector', e.target.value)} placeholder="Ex: Frente de Caixa"/>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Função</label>
            <select className="select" value={form.role} onChange={e => set('role', e.target.value)}>
              <option value="">Selecione...</option>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:8 }}>
            <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              <Save size={14}/> {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </Modal>
      )}

      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type}`}>
            {toast.type === 'success' ? '✅' : '❌'} {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}
