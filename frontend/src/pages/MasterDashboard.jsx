import { useState, useEffect } from 'react';
import { Store, Users, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, X, Plus, Save } from 'lucide-react';
import api from '../api';

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="btn-icon" onClick={onClose}><X size={16}/></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export default function MasterDashboard({ userId }) {
  const [stores,       setStores]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [expanded,     setExpanded]     = useState(null);
  const [storeUsers,   setStoreUsers]   = useState({});
  const [loadingUsers, setLoadingUsers] = useState(null);
  const [toast,        setToast]        = useState(null);
  const [showNew,      setShowNew]      = useState(false);
  const [newForm,      setNewForm]      = useState({ name: '', city: '' });
  const [savingNew,    setSavingNew]    = useState(false);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/stores?requester_id=${userId}`);
      setStores(res.data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const createStore = async () => {
    if (!newForm.name.trim()) return;
    setSavingNew(true);
    try {
      // Cria já ativa (master cria direto sem aprovação)
      await api.post('/stores/master', { requester_id: userId, name: newForm.name.trim(), city: newForm.city.trim() });
      setShowNew(false);
      setNewForm({ name: '', city: '' });
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Erro ao criar loja.');
    }
    setSavingNew(false);
  };

  const approve = async (store) => {
    try {
      await api.put(`/stores/${store.id}/approve`, { requester_id: userId });
      showToast(`Loja "${store.name}" aprovada!`);
      load();
    } catch (e) {
      showToast(e.response?.data?.error || 'Erro ao aprovar', 'error');
    }
  };

  const disable = async (store) => {
    if (!confirm(`Desativar a loja "${store.name}"? Os usuários perderão acesso.`)) return;
    try {
      await api.put(`/stores/${store.id}/disable`, { requester_id: userId });
      showToast(`Loja "${store.name}" desativada.`);
      load();
    } catch (e) {
      showToast(e.response?.data?.error || 'Erro ao desativar', 'error');
    }
  };

  const toggleExpand = async (store) => {
    if (expanded === store.id) { setExpanded(null); return; }
    setExpanded(store.id);
    if (storeUsers[store.id]) return;
    setLoadingUsers(store.id);
    try {
      const res = await api.get(`/stores/users?requester_id=${userId}&company=${encodeURIComponent(store.name)}`);
      setStoreUsers(u => ({ ...u, [store.id]: res.data }));
    } catch {}
    setLoadingUsers(null);
  };

  const pending = stores.filter(s => !s.active);
  const active  = stores.filter(s =>  s.active);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Gestão de Lojas</h1>
          <p className="page-subtitle">{active.length} ativas · {pending.length} aguardando aprovação</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>
          <Plus size={14}/> Nova Loja
        </button>
      </div>

      {/* KPIs */}
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-icon"><Store size={22} color="var(--primary)"/></div>
          <div>
            <div className="stat-value">{stores.length}</div>
            <div className="stat-label">Total de lojas</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><CheckCircle size={22} color="#10B981"/></div>
          <div>
            <div className="stat-value">{active.length}</div>
            <div className="stat-label">Ativas</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Clock size={22} color="#F59E0B"/></div>
          <div>
            <div className="stat-value">{pending.length}</div>
            <div className="stat-label">Aguardando aprovação</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Users size={22} color="#6366F1"/></div>
          <div>
            <div className="stat-value">{stores.reduce((s, l) => s + (l.active_count || 0), 0)}</div>
            <div className="stat-label">Usuários ativos</div>
          </div>
        </div>
      </div>

      {/* Pendentes */}
      {pending.length > 0 && (
        <div className="card" style={{ marginBottom: 20, borderColor: '#F59E0B50' }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, color: '#F59E0B', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={16}/> Aguardando aprovação ({pending.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pending.map(s => (
              <div key={s.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 16px', borderRadius: 10,
                background: 'var(--surface-2)', border: '1px solid #F59E0B30',
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {s.city || 'Cidade não informada'} · Solicitado em {new Date(s.created_at).toLocaleDateString('pt-BR')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => approve(s)}>
                    <CheckCircle size={13}/> Aprovar
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => disable(s)}
                    style={{ color: 'var(--danger)' }}>
                    <XCircle size={13}/> Recusar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lojas ativas */}
      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Carregando...</div>
      ) : active.length === 0 && pending.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <Store size={48} style={{ opacity: .15, marginBottom: 12 }}/>
          <h3>Nenhuma loja cadastrada</h3>
          <p style={{ color: 'var(--text-muted)', marginTop: 6, fontSize: 13 }}>
            Os gerentes gerais precisam acessar o app e cadastrar a loja deles.
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>
            Lojas ativas ({active.length})
          </div>
          {active.map(s => (
            <div key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <div
                onClick={() => toggleExpand(s)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '16px 20px', cursor: 'pointer',
                  background: expanded === s.id ? 'var(--surface-2)' : 'transparent',
                  transition: 'background .15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: 'var(--primary)20', border: '1px solid var(--primary)30',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Store size={18} color="var(--primary)"/>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {s.city || '—'} · {s.active_count} usuário{s.active_count !== 1 ? 's' : ''} ativo{s.active_count !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); disable(s); }}
                    style={{ color: 'var(--danger)', fontSize: 11 }}>
                    Desativar
                  </button>
                  {expanded === s.id ? <ChevronUp size={16} color="var(--text-muted)"/> : <ChevronDown size={16} color="var(--text-muted)"/>}
                </div>
              </div>

              {/* Usuários da loja expandida */}
              {expanded === s.id && (
                <div style={{ padding: '0 20px 16px', background: 'var(--surface-2)' }}>
                  {loadingUsers === s.id ? (
                    <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Carregando usuários...</div>
                  ) : (storeUsers[s.id] || []).length === 0 ? (
                    <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Nenhum usuário cadastrado nesta loja.</div>
                  ) : (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Nome</th>
                            <th>Cargo</th>
                            <th>Setor</th>
                            <th>Acesso</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(storeUsers[s.id] || []).map(u => (
                            <tr key={u.id} style={{ opacity: u.active ? 1 : .5 }}>
                              <td style={{ fontWeight: 600 }}>{u.full_name}</td>
                              <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{u.role || '—'}</td>
                              <td style={{ fontSize: 12 }}>{u.sector || '—'}</td>
                              <td>
                                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                                  background: u.access_level === 'admin' ? '#6366f115' : '#10b98115',
                                  color: u.access_level === 'admin' ? '#818cf8' : '#34d399',
                                  border: `1px solid ${u.access_level === 'admin' ? '#6366f130' : '#10b98130'}` }}>
                                  {u.access_level}
                                </span>
                              </td>
                              <td>
                                <span style={{ fontSize: 11, fontWeight: 600, color: u.active ? '#34d399' : 'var(--text-muted)' }}>
                                  {u.active ? '● Ativo' : '○ Inativo'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <Modal title="Nova Loja" onClose={() => setShowNew(false)}>
          <div className="form-group">
            <label className="form-label">Nome da loja *</label>
            <input className="input" autoFocus value={newForm.name}
              onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Sam's Club Brasília Sul"
              onKeyDown={e => e.key === 'Enter' && createStore()}/>
          </div>
          <div className="form-group">
            <label className="form-label">Cidade</label>
            <input className="input" value={newForm.city}
              onChange={e => setNewForm(f => ({ ...f, city: e.target.value }))}
              placeholder="Ex: Brasília - DF"
              onKeyDown={e => e.key === 'Enter' && createStore()}/>
          </div>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:8 }}>
            <button className="btn btn-ghost" onClick={() => setShowNew(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={createStore} disabled={savingNew}>
              <Save size={14}/> {savingNew ? 'Criando...' : 'Criar Loja'}
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
