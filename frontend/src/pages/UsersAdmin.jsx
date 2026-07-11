import { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Edit2, X, Save, Trash2, Shield, UserCheck, UserX, Settings } from 'lucide-react';
import api from '../api';

const ACCESS_LEVELS = [
  { value: 'admin',     label: 'Admin',      desc: 'Gerencia usuários e toda a empresa' },
  { value: 'supervisor',label: 'Supervisor',  desc: 'Vê escalas de todos os setores' },
  { value: 'lider',     label: 'Líder',       desc: 'Gerencia apenas seu setor' },
];

const BADGE = {
  admin:      { bg:'#6366f115', color:'#818cf8', border:'#6366f130', label:'Admin' },
  supervisor: { bg:'#f59e0b15', color:'#fbbf24', border:'#f59e0b30', label:'Supervisor' },
  lider:      { bg:'#10b98115', color:'#34d399', border:'#10b98130', label:'Líder' },
};

function Badge({ level }) {
  const b = BADGE[level] || BADGE.lider;
  return (
    <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:99,
      background:b.bg, color:b.color, border:`1px solid ${b.border}` }}>
      {b.label}
    </span>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth:480 }}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="btn-icon" onClick={onClose}><X size={16}/></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export default function UsersAdmin({ userId, profile }) {
  const [users,     setUsers]     = useState([]);
  const [roles,     setRoles]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showNew,   setShowNew]   = useState(false);
  const [showRoles, setShowRoles] = useState(false);
  const [editing,   setEditing]   = useState(null);
  const [newRole,   setNewRole]   = useState('');
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');

  const [form, setForm] = useState({
    full_name:'', email:'', password:'', role:'', sector:'', access_level:'lider'
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const company = profile?.company || '';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, rRes] = await Promise.all([
        api.get(`/admin/users?requester_id=${userId}`),
        api.get(`/admin/roles?company=${encodeURIComponent(company)}`),
      ]);
      setUsers(uRes.data);
      setRoles(rRes.data);
    } catch {}
    setLoading(false);
  }, [userId, company]);

  useEffect(() => { load(); }, [load]);

  const createUser = async () => {
    setError('');
    if (!form.full_name || !form.email || !form.password)
      return setError('Nome, e-mail e senha são obrigatórios.');
    if (form.password.length < 6)
      return setError('Senha precisa ter pelo menos 6 caracteres.');
    setSaving(true);
    try {
      await api.post('/admin/users', { requester_id: userId, ...form });
      setShowNew(false);
      setForm({ full_name:'', email:'', password:'', role:'', sector:'', access_level:'lider' });
      load();
    } catch (e) {
      setError(e.response?.data?.error || 'Erro ao criar usuário.');
    }
    setSaving(false);
  };

  const saveEdit = async () => {
    setError('');
    setSaving(true);
    try {
      await api.put(`/admin/users/${editing.id}`, {
        requester_id: userId,
        full_name:    editing.full_name,
        role:         editing.role,
        sector:       editing.sector,
        access_level: editing.access_level,
      });
      setEditing(null);
      load();
    } catch (e) {
      setError(e.response?.data?.error || 'Erro ao salvar.');
    }
    setSaving(false);
  };

  const toggleActive = async (u) => {
    if (u.active) {
      await api.delete(`/admin/users/${u.id}?requester_id=${userId}`);
    } else {
      await api.put(`/admin/users/${u.id}`, { requester_id: userId, active: true });
    }
    load();
  };

  const addRole = async () => {
    if (!newRole.trim()) return;
    await api.post('/admin/roles', { requester_id: userId, role_name: newRole.trim() });
    setNewRole('');
    load();
  };

  const deleteRole = async (id) => {
    await api.delete(`/admin/roles/${id}?requester_id=${userId}`);
    load();
  };

  const roleNames = roles.map(r => r.role_name);

  const SectorSelect = ({ value, onChange }) => (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid var(--border)',
        background:'var(--surface-2)', color:'var(--text)', fontSize:13 }}>
      <option value="">Selecione o setor</option>
      {['Frente Loja','Recebimento','Mercearia','Não Alimentar','Perecíveis','Liderança','Plantonistas'].map(s =>
        <option key={s} value={s}>{s}</option>
      )}
    </select>
  );

  const RoleSelect = ({ value, onChange }) => (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid var(--border)',
        background:'var(--surface-2)', color:'var(--text)', fontSize:13 }}>
      <option value="">Selecione o cargo</option>
      {roleNames.map(r => <option key={r} value={r}>{r}</option>)}
      {value && !roleNames.includes(value) && <option value={value}>{value}</option>}
    </select>
  );

  return (
    <div>
      {/* Cabeçalho */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Gestão de Usuários</h1>
          <p className="page-subtitle">{company} · {users.filter(u=>u.active).length} usuários ativos</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => setShowRoles(true)} className="btn btn-ghost btn-sm">
            <Settings size={14}/> Cargos
          </button>
          <button onClick={() => { setShowNew(true); setError(''); }} className="btn btn-primary btn-sm">
            <Plus size={14}/> Novo Usuário
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        {loading ? (
          <div style={{ padding:40, textAlign:'center', color:'var(--text-muted)' }}>Carregando...</div>
        ) : users.length === 0 ? (
          <div className="empty-state">
            <Users size={40}/>
            <h3>Nenhum usuário cadastrado</h3>
            <p>Clique em "Novo Usuário" para adicionar membros ao time.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>E-mail</th>
                  <th>Cargo</th>
                  <th>Setor</th>
                  <th>Acesso</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} style={{ opacity: u.active ? 1 : .45 }}>
                    <td style={{ fontWeight:600 }}>{u.full_name}</td>
                    <td style={{ color:'var(--text-muted)', fontSize:12 }}>{u.email}</td>
                    <td style={{ fontSize:12 }}>{u.role || '—'}</td>
                    <td style={{ fontSize:12 }}>{u.sector || '—'}</td>
                    <td><Badge level={u.access_level}/></td>
                    <td>
                      <span style={{ fontSize:11, fontWeight:600,
                        color: u.active ? '#34d399' : 'var(--text-muted)' }}>
                        {u.active ? '● Ativo' : '○ Inativo'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display:'flex', gap:4 }}>
                        <button className="btn-icon" title="Editar"
                          onClick={() => { setEditing({...u}); setError(''); }}>
                          <Edit2 size={14}/>
                        </button>
                        <button className="btn-icon" title={u.active ? 'Desativar' : 'Reativar'}
                          onClick={() => toggleActive(u)}
                          style={{ color: u.active ? 'var(--danger)' : 'var(--success)' }}>
                          {u.active ? <UserX size={14}/> : <UserCheck size={14}/>}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal — Novo Usuário */}
      {showNew && (
        <Modal title="Novo Usuário" onClose={() => setShowNew(false)}>
          {error && <div className="auth-error" style={{ marginBottom:14 }}>{error}</div>}
          <div className="form-group">
            <label className="form-label">Nome completo *</label>
            <input className="input" value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Nome do colaborador"/>
          </div>
          <div className="form-group">
            <label className="form-label">E-mail *</label>
            <input className="input" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@empresa.com"/>
          </div>
          <div className="form-group">
            <label className="form-label">Senha provisória *</label>
            <input className="input" type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="Mínimo 6 caracteres"/>
            <span className="form-hint">O usuário poderá alterar depois no perfil.</span>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="form-group">
              <label className="form-label">Cargo</label>
              <RoleSelect value={form.role} onChange={v => set('role', v)}/>
            </div>
            <div className="form-group">
              <label className="form-label">Setor</label>
              <SectorSelect value={form.sector} onChange={v => set('sector', v)}/>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Nível de acesso</label>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {ACCESS_LEVELS.map(a => (
                <label key={a.value} style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer',
                  padding:'10px 12px', borderRadius:8, border:`1px solid ${form.access_level===a.value?'var(--primary)':'var(--border)'}`,
                  background: form.access_level===a.value ? 'rgba(232,98,42,.08)' : 'var(--surface-2)' }}>
                  <input type="radio" name="access_level" value={a.value}
                    checked={form.access_level===a.value} onChange={() => set('access_level', a.value)}/>
                  <div>
                    <div style={{ fontWeight:600, fontSize:13 }}>{a.label}</div>
                    <div style={{ fontSize:11, color:'var(--text-muted)' }}>{a.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div className="modal-footer" style={{ padding:'16px 0 0', justifyContent:'flex-end', display:'flex', gap:8 }}>
            <button className="btn btn-ghost" onClick={() => setShowNew(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={createUser} disabled={saving}>
              <Save size={14}/> {saving ? 'Criando...' : 'Criar Usuário'}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal — Editar Usuário */}
      {editing && (
        <Modal title="Editar Usuário" onClose={() => setEditing(null)}>
          {error && <div className="auth-error" style={{ marginBottom:14 }}>{error}</div>}
          <div className="form-group">
            <label className="form-label">Nome completo</label>
            <input className="input" value={editing.full_name}
              onChange={e => setEditing(ed => ({ ...ed, full_name: e.target.value }))}/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="form-group">
              <label className="form-label">Cargo</label>
              <RoleSelect value={editing.role}
                onChange={v => setEditing(ed => ({ ...ed, role: v }))}/>
            </div>
            <div className="form-group">
              <label className="form-label">Setor</label>
              <SectorSelect value={editing.sector}
                onChange={v => setEditing(ed => ({ ...ed, sector: v }))}/>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Nível de acesso</label>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {ACCESS_LEVELS.map(a => (
                <label key={a.value} style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer',
                  padding:'10px 12px', borderRadius:8, border:`1px solid ${editing.access_level===a.value?'var(--primary)':'var(--border)'}`,
                  background: editing.access_level===a.value ? 'rgba(232,98,42,.08)' : 'var(--surface-2)' }}>
                  <input type="radio" name="edit_access" value={a.value}
                    checked={editing.access_level===a.value}
                    onChange={() => setEditing(ed => ({ ...ed, access_level: a.value }))}/>
                  <div>
                    <div style={{ fontWeight:600, fontSize:13 }}>{a.label}</div>
                    <div style={{ fontSize:11, color:'var(--text-muted)' }}>{a.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div className="modal-footer" style={{ padding:'16px 0 0', justifyContent:'flex-end', display:'flex', gap:8 }}>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>
              <Save size={14}/> {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal — Gerenciar Cargos */}
      {showRoles && (
        <Modal title={`Cargos — ${company}`} onClose={() => setShowRoles(false)}>
          <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:16 }}>
            Defina os cargos da sua empresa. Eles aparecem no cadastro de cada usuário.
          </p>
          <div style={{ display:'flex', gap:8, marginBottom:16 }}>
            <input className="input" value={newRole} onChange={e => setNewRole(e.target.value)}
              placeholder="Ex: Gerente Geral & Digital"
              onKeyDown={e => e.key === 'Enter' && addRole()}/>
            <button className="btn btn-primary" onClick={addRole} style={{ flexShrink:0 }}>
              <Plus size={14}/> Adicionar
            </button>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {roles.length === 0 && (
              <p style={{ fontSize:13, color:'var(--text-muted)', textAlign:'center', padding:'16px 0' }}>
                Nenhum cargo cadastrado ainda.
              </p>
            )}
            {roles.map(r => (
              <div key={r.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                padding:'10px 12px', borderRadius:8, background:'var(--surface-2)', border:'1px solid var(--border)' }}>
                <span style={{ fontSize:13, fontWeight:500 }}>{r.role_name}</span>
                <button className="btn-icon danger" onClick={() => deleteRole(r.id)}><Trash2 size={13}/></button>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
