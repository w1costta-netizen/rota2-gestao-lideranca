import { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Edit2, X, Save, Trash2, UserCheck, UserX, Settings } from 'lucide-react';
import api from '../api';

const ACCESS_LEVELS = [
  { value: 'admin',      label: 'Admin',      desc: 'Gerencia usuários e toda a empresa' },
  { value: 'supervisor', label: 'Supervisor',  desc: 'Vê escalas de todos os setores' },
  { value: 'lider',      label: 'Líder',       desc: 'Gerencia apenas seu setor' },
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

function Modal({ title, onClose, children, maxWidth = 480 }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth }}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="btn-icon" onClick={onClose}><X size={16}/></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/* Campo com dropdown + botão inline para adicionar novo item */
function InlineSelect({ value, onChange, items, placeholder, onAdd, onRemove, addLabel }) {
  const [adding, setAdding]   = useState(false);
  const [newVal, setNewVal]   = useState('');
  const [saving, setSaving]   = useState(false);

  const handleAdd = async () => {
    if (!newVal.trim() || saving) return;
    setSaving(true);
    const saved = await onAdd(newVal.trim());
    setNewVal('');
    setAdding(false);
    setSaving(false);
    if (saved) onChange(saved);
  };

  return (
    <div>
      <div style={{ display:'flex', gap:6 }}>
        <select value={value} onChange={e => onChange(e.target.value)}
          style={{ flex:1, padding:'9px 12px', borderRadius:8, border:'1px solid var(--border)',
            background:'var(--surface-2)', color: value ? 'var(--text)' : 'var(--text-muted)', fontSize:13 }}>
          <option value="">{placeholder}</option>
          {items.map(i => <option key={i.id} value={i.name}>{i.name}</option>)}
          {value && !items.find(i => i.name === value) && <option value={value}>{value}</option>}
        </select>
        <button type="button" title={addLabel}
          onClick={() => setAdding(a => !a)}
          style={{ width:38, borderRadius:8, border:'1px solid var(--border)', flexShrink:0,
            background: adding ? 'var(--primary)' : 'var(--surface-2)',
            color: adding ? '#fff' : 'var(--text-muted)',
            fontSize:20, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
          +
        </button>
      </div>

      {adding && (
        <div style={{ display:'flex', gap:6, marginTop:8 }}>
          <input autoFocus className="input" value={newVal}
            onChange={e => setNewVal(e.target.value)}
            placeholder={addLabel}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            style={{ fontSize:13 }}/>
          <button type="button" onClick={handleAdd} disabled={saving}
            style={{ padding:'0 14px', borderRadius:8, border:'none', flexShrink:0,
              background:'var(--primary)', color:'#fff', cursor:'pointer', fontWeight:700 }}>
            {saving ? '...' : 'OK'}
          </button>
          <button type="button" onClick={() => { setAdding(false); setNewVal(''); }}
            style={{ width:36, borderRadius:8, border:'1px solid var(--border)', flexShrink:0,
              background:'var(--surface-2)', color:'var(--text-muted)', cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center' }}>
            <X size={13}/>
          </button>
        </div>
      )}
    </div>
  );
}

/* Modal de configurações: abas Cargos / Setores */
function ConfigModal({ userId, company, roles, sectors, onClose, onReload }) {
  const [tab,      setTab]      = useState('roles');
  const [newRole,  setNewRole]  = useState('');
  const [newSect,  setNewSect]  = useState('');

  const addRole = async () => {
    if (!newRole.trim()) return;
    await api.post('/admin/roles', { requester_id: userId, role_name: newRole.trim() });
    setNewRole(''); onReload();
  };
  const delRole = async (id) => {
    await api.delete(`/admin/roles/${id}?requester_id=${userId}`); onReload();
  };
  const addSect = async () => {
    if (!newSect.trim()) return;
    await api.post('/admin/sectors', { requester_id: userId, sector_name: newSect.trim() });
    setNewSect(''); onReload();
  };
  const delSect = async (id) => {
    await api.delete(`/admin/sectors/${id}?requester_id=${userId}`); onReload();
  };

  const list = tab === 'roles' ? roles : sectors;
  const nameKey = tab === 'roles' ? 'role_name' : 'sector_name';
  const newVal  = tab === 'roles' ? newRole : newSect;
  const setVal  = tab === 'roles' ? setNewRole : setNewSect;
  const addFn   = tab === 'roles' ? addRole : addSect;
  const delFn   = tab === 'roles' ? delRole : delSect;
  const ph      = tab === 'roles' ? 'Ex: Supervisor(a) de Loja' : 'Ex: Mercearia';

  return (
    <Modal title="Configurações da Empresa" onClose={onClose}>
      <p style={{ fontSize:12, color:'var(--text-muted)', marginBottom:14 }}>{company}</p>

      {/* Abas */}
      <div style={{ display:'flex', gap:0, marginBottom:16, borderBottom:'1px solid var(--border)' }}>
        {[['roles','Cargos'],['sectors','Setores']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ padding:'8px 18px', background:'none', border:'none', cursor:'pointer',
              fontWeight: tab===id ? 700 : 400, fontSize:13,
              color: tab===id ? 'var(--primary)' : 'var(--text-muted)',
              borderBottom: tab===id ? '2px solid var(--primary)' : '2px solid transparent',
              marginBottom:-1 }}>
            {label}
          </button>
        ))}
      </div>

      {/* Adicionar */}
      <div style={{ display:'flex', gap:8, marginBottom:14 }}>
        <input className="input" value={newVal} onChange={e => setVal(e.target.value)}
          placeholder={ph} onKeyDown={e => e.key === 'Enter' && addFn()}
          style={{ fontSize:13 }}/>
        <button onClick={addFn} className="btn btn-primary btn-sm" style={{ flexShrink:0 }}>
          <Plus size={13}/> Adicionar
        </button>
      </div>

      {/* Lista */}
      <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:280, overflowY:'auto' }}>
        {list.length === 0 && (
          <p style={{ fontSize:13, color:'var(--text-muted)', textAlign:'center', padding:'20px 0' }}>
            Nenhum item cadastrado ainda.
          </p>
        )}
        {list.map(item => (
          <div key={item.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'10px 14px', borderRadius:8,
            background:'var(--surface-2)', border:'1px solid var(--border)' }}>
            <span style={{ fontSize:13, fontWeight:500 }}>{item[nameKey]}</span>
            <button className="btn-icon danger" title="Remover" onClick={() => delFn(item.id)}>
              <Trash2 size={13}/>
            </button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export default function UsersAdmin({ userId, profile }) {
  const [users,    setUsers]    = useState([]);
  const [roles,    setRoles]    = useState([]);
  const [sectors,  setSectors]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showNew,  setShowNew]  = useState(false);
  const [showCfg,  setShowCfg]  = useState(false);
  const [editing,  setEditing]  = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  const [form, setForm] = useState({
    full_name:'', email:'', password:'', role:'', sector:'', access_level:'lider'
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const company = profile?.company || '';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, rRes, sRes] = await Promise.all([
        api.get(`/admin/users?requester_id=${userId}`),
        api.get(`/admin/roles?company=${encodeURIComponent(company)}`),
        api.get(`/admin/sectors?company=${encodeURIComponent(company)}`),
      ]);
      setUsers(uRes.data);
      setRoles(rRes.data);
      setSectors(sRes.data);
    } catch {}
    setLoading(false);
  }, [userId, company]);

  useEffect(() => { load(); }, [load]);

  const roleItems   = roles.map(r => ({ id: r.id, name: r.role_name }));
  const sectorItems = sectors.map(s => ({ id: s.id, name: s.sector_name }));

  const addRoleInline = async (name) => {
    await api.post('/admin/roles', { requester_id: userId, role_name: name });
    await load();
    return name;
  };

  const addSectorInline = async (name) => {
    await api.post('/admin/sectors', { requester_id: userId, sector_name: name });
    await load();
    return name;
  };

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
    if (u.active) await api.delete(`/admin/users/${u.id}?requester_id=${userId}`);
    else          await api.put(`/admin/users/${u.id}`, { requester_id: userId, active: true });
    load();
  };

  const FormFields = ({ values, onChange }) => (
    <>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <div className="form-group">
          <label className="form-label">Cargo</label>
          <InlineSelect
            value={values.role}
            onChange={v => onChange('role', v)}
            items={roleItems}
            placeholder="Selecione o cargo"
            addLabel="Novo cargo..."
            onAdd={addRoleInline}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Setor</label>
          <InlineSelect
            value={values.sector}
            onChange={v => onChange('sector', v)}
            items={sectorItems}
            placeholder="Selecione o setor"
            addLabel="Novo setor..."
            onAdd={addSectorInline}
          />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Nível de acesso</label>
        <div style={{ display:'flex', gap:8 }}>
          {ACCESS_LEVELS.map(a => (
            <label key={a.value} title={a.desc}
              style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4,
                cursor:'pointer', padding:'10px 8px', borderRadius:8, textAlign:'center',
                border:`1px solid ${values.access_level===a.value?'var(--primary)':'var(--border)'}`,
                background: values.access_level===a.value ? 'rgba(232,98,42,.08)' : 'var(--surface-2)' }}>
              <input type="radio" name={`al_${values.email||'edit'}`} value={a.value}
                checked={values.access_level===a.value}
                onChange={() => onChange('access_level', a.value)}
                style={{ accentColor:'var(--primary)' }}/>
              <span style={{ fontWeight:600, fontSize:12 }}>{a.label}</span>
              <span style={{ fontSize:10, color:'var(--text-muted)', lineHeight:1.3 }}>{a.desc}</span>
            </label>
          ))}
        </div>
      </div>
    </>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Gestão de Usuários</h1>
          <p className="page-subtitle">{company} · {users.filter(u=>u.active).length} ativos</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => setShowCfg(true)} className="btn btn-ghost btn-sm">
            <Settings size={14}/> Configurações
          </button>
          <button onClick={() => { setShowNew(true); setError(''); }} className="btn btn-primary btn-sm">
            <Plus size={14}/> Novo Usuário
          </button>
        </div>
      </div>

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
        <Modal title="Novo Usuário" onClose={() => setShowNew(false)} maxWidth={520}>
          {error && <div className="auth-error" style={{ marginBottom:14 }}>{error}</div>}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">Nome completo *</label>
              <input className="input" value={form.full_name}
                onChange={e => set('full_name', e.target.value)} placeholder="Nome do colaborador"/>
            </div>
            <div className="form-group">
              <label className="form-label">E-mail *</label>
              <input className="input" type="email" value={form.email}
                onChange={e => set('email', e.target.value)} placeholder="email@empresa.com"/>
            </div>
            <div className="form-group">
              <label className="form-label">Senha provisória *</label>
              <input className="input" type="password" value={form.password}
                onChange={e => set('password', e.target.value)} placeholder="Mínimo 6 caracteres"/>
            </div>
          </div>
          <FormFields values={form} onChange={set}/>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:8 }}>
            <button className="btn btn-ghost" onClick={() => setShowNew(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={createUser} disabled={saving}>
              <Save size={14}/> {saving ? 'Criando...' : 'Criar Usuário'}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal — Editar Usuário */}
      {editing && (
        <Modal title="Editar Usuário" onClose={() => setEditing(null)} maxWidth={520}>
          {error && <div className="auth-error" style={{ marginBottom:14 }}>{error}</div>}
          <div className="form-group">
            <label className="form-label">Nome completo</label>
            <input className="input" value={editing.full_name}
              onChange={e => setEditing(ed => ({ ...ed, full_name: e.target.value }))}/>
          </div>
          <FormFields
            values={editing}
            onChange={(k, v) => setEditing(ed => ({ ...ed, [k]: v }))}
          />
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:8 }}>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>
              <Save size={14}/> {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal — Configurações (Cargos + Setores) */}
      {showCfg && (
        <ConfigModal
          userId={userId}
          company={company}
          roles={roles}
          sectors={sectors}
          onClose={() => setShowCfg(false)}
          onReload={load}
        />
      )}
    </div>
  );
}
