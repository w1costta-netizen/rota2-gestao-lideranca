import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import { User, Lock, Save, Eye, EyeOff, Building2, Phone, Briefcase, Hash, Shield, Camera, X, AlertTriangle, Bell, BellOff } from 'lucide-react';
import { registerPush } from '../lib/push';
import PhoneInput from '../components/PhoneInput';
import { formatPhone } from '../utils';

const FUNCOES = ['Diretor(a)','Gerente','Coordenador(a)','Supervisor(a)','Líder','Analista','Assistente','Outro'];
const NIVEL_LABELS = { admin: 'Administrador', gestor: 'Gestor', lider: 'Líder' };
const NIVEL_COLORS = { admin: '#6366f1', gestor: '#f59e0b', lider: '#10b981' };
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_MB = 3;

export default function Profile() {
  const { profile, loadProfile, session } = useAuth();
  const toast = useToast();
  const fileRef = useRef();

  const [tab, setTab] = useState('dados');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name:'', email:'', company:'', employee_id:'',
    sector:'', role:'', phone:'', whatsapp:''
  });
  const [pushStatus, setPushStatus] = useState(Notification.permission); // 'default'|'granted'|'denied'
  const [passForm, setPassForm] = useState({ current:'', novo:'', confirmar:'' });
  const [showPass, setShowPass] = useState({ current:false, novo:false, confirmar:false });
  const [passLoading, setPassLoading] = useState(false);

  // Photo state
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoError, setPhotoError] = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);

  // Auto-preenche com dados do perfil salvo no cadastro
  useEffect(() => {
    if (profile) {
      setForm({
        full_name:   profile.full_name   || '',
        email:       profile.email       || session?.user?.email || '',
        company:     profile.company     || '',
        employee_id: profile.employee_id || '',
        sector:      profile.sector      || '',
        role:        profile.role        || '',
        phone:       profile.phone       || '',
        whatsapp:    profile.whatsapp    || '',
      });
    }
  }, [profile]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setP = (k, v) => setPassForm(f => ({ ...f, [k]: v }));

  // ── Photo validation ──────────────────────────────────────────
  const handlePhotoSelect = (e) => {
    setPhotoError('');
    const file = e.target.files[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setPhotoError('Formato inválido. Use apenas JPG, PNG ou WEBP.');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setPhotoError(`Foto muito grande. O limite é ${MAX_MB}MB.`);
      e.target.value = '';
      return;
    }

    // Check image dimensions — must be at least 200x200
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (img.width < 200 || img.height < 200) {
        setPhotoError('Foto muito pequena. Use uma imagem de pelo menos 200×200 pixels.');
        e.target.value = '';
        return;
      }
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    };
    img.src = url;
    e.target.value = '';
  };

  const cancelPhoto = () => {
    setPhotoPreview(null);
    setPhotoFile(null);
    setPhotoError('');
  };

  const uploadPhoto = async () => {
    if (!photoFile) return;
    setPhotoUploading(true);
    try {
      const ext = photoFile.name.split('.').pop();
      const path = `${session.user.id}/avatar.${ext}`;

      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, photoFile, { upsert: true, contentType: photoFile.type });

      if (upErr) throw upErr;

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);

      const { error: dbErr } = await supabase.from('profiles')
        .update({ avatar_url: publicUrl + '?t=' + Date.now() })
        .eq('id', session.user.id);

      if (dbErr) throw dbErr;

      await loadProfile(session.user.id);
      setPhotoPreview(null);
      setPhotoFile(null);
      toast('Foto de perfil atualizada!');
    } catch (e) {
      toast('Erro ao enviar foto: ' + e.message, 'error');
    }
    setPhotoUploading(false);
  };

  // ── Save profile ──────────────────────────────────────────────
  const saveProfile = async () => {
    if (!form.full_name || !form.company) return toast('Nome e empresa são obrigatórios', 'error');
    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      full_name:   form.full_name,
      company:     form.company,
      employee_id: form.employee_id,
      sector:      form.sector,
      role:        form.role,
      phone:       form.phone,
      whatsapp:    form.whatsapp,
    }).eq('id', session.user.id);

    if (error) toast('Erro ao salvar: ' + error.message, 'error');
    else { toast('Perfil atualizado!'); loadProfile(session.user.id); }
    setSaving(false);
  };

  // ── Change password ───────────────────────────────────────────
  const changePassword = async () => {
    if (!passForm.novo || passForm.novo.length < 6) return toast('A nova senha deve ter ao menos 6 caracteres', 'error');
    if (passForm.novo !== passForm.confirmar) return toast('As senhas não coincidem', 'error');
    setPassLoading(true);
    const { error: reAuthError } = await supabase.auth.signInWithPassword({
      email: profile.email || session.user.email,
      password: passForm.current,
    });
    if (reAuthError) { toast('Senha atual incorreta', 'error'); setPassLoading(false); return; }
    const { error } = await supabase.auth.updateUser({ password: passForm.novo });
    if (error) toast('Erro ao alterar senha: ' + error.message, 'error');
    else { toast('Senha alterada com sucesso!'); setPassForm({ current:'', novo:'', confirmar:'' }); }
    setPassLoading(false);
  };

  const initials = form.full_name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase() || '?';
  const nivel = profile?.access_level || 'lider';
  const avatarUrl = profile?.avatar_url;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Meu Perfil</div>
          <div className="page-subtitle">Gerencie suas informações pessoais e de acesso</div>
        </div>
      </div>

      {/* Header card com foto */}
      <div className="card" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 24 }}>
        {/* Avatar com botão de editar */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{
            width: 88, height: 88, borderRadius: '50%',
            background: avatarUrl ? 'transparent' : 'linear-gradient(135deg, var(--primary), var(--primary-light))',
            color: 'white', fontSize: 28, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(30,58,95,.25)',
            overflow: 'hidden',
          }}>
            {avatarUrl
              ? <img src={avatarUrl} alt="avatar" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
              : initials}
          </div>
          <button
            onClick={() => fileRef.current.click()}
            style={{
              position: 'absolute', bottom: 0, right: 0,
              width: 28, height: 28, borderRadius: '50%',
              background: 'var(--primary-light)', color: 'white',
              border: '2px solid white', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,.2)'
            }}
            title="Alterar foto"
          >
            <Camera size={14} />
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }} onChange={handlePhotoSelect} />
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{form.full_name || 'Seu nome'}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 2 }}>{form.role || '—'} · {form.company || '—'}</div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="badge badge-blue">{form.sector || 'Setor'}</span>
            <span style={{
              display:'inline-flex', alignItems:'center', gap:4, padding:'3px 10px',
              borderRadius:99, fontSize:11.5, fontWeight:600,
              background: NIVEL_COLORS[nivel]+'20', color: NIVEL_COLORS[nivel]
            }}>
              <Shield size={11}/> {NIVEL_LABELS[nivel] || nivel}
            </span>
            {form.employee_id && <span className="badge badge-gray"><Hash size={10}/> {form.employee_id}</span>}
          </div>
        </div>

        <div style={{ textAlign:'right', color:'var(--text-muted)', fontSize:12 }}>
          <div>{form.email}</div>
          <div style={{ marginTop:4 }}>{formatPhone(form.phone)}</div>
        </div>
      </div>

      {/* Botão de notificações */}
      {'Notification' in window && (
        <div className="card" style={{ marginBottom:20, display:'flex', alignItems:'center', justifyContent:'space-between', gap:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            {pushStatus === 'granted'
              ? <Bell size={20} style={{ color:'#10b981' }}/>
              : <BellOff size={20} style={{ color:'var(--text-muted)' }}/>}
            <div>
              <div style={{ fontWeight:600, fontSize:14 }}>
                {pushStatus === 'granted' ? 'Notificações ativadas' : pushStatus === 'denied' ? 'Notificações bloqueadas' : 'Receber notificações'}
              </div>
              <div style={{ fontSize:12, color:'var(--text-muted)' }}>
                {pushStatus === 'granted' ? 'Você receberá alertas de comunicados e agenda'
                  : pushStatus === 'denied' ? 'Desbloqueie nas configurações do navegador'
                  : 'Toque para ativar alertas no seu dispositivo'}
              </div>
            </div>
          </div>
          {pushStatus !== 'denied' && pushStatus !== 'granted' && (
            <button className="btn btn-primary" style={{ flexShrink:0 }}
              onClick={async () => {
                await registerPush(session?.user?.id);
                setPushStatus(Notification.permission);
                if (Notification.permission === 'granted') toast('Notificações ativadas!');
              }}>
              <Bell size={14}/> Ativar
            </button>
          )}
          {pushStatus === 'granted' && (
            <span style={{ fontSize:12, color:'#10b981', fontWeight:600, flexShrink:0 }}>✓ Ativo</span>
          )}
        </div>
      )}

      {/* Preview da nova foto */}
      {(photoPreview || photoError) && (
        <div className="card" style={{ marginBottom: 20, border: photoError ? '1.5px solid var(--danger)' : '1.5px solid var(--accent)' }}>
          {photoError ? (
            <div style={{ display:'flex', alignItems:'center', gap:12, color:'var(--danger)' }}>
              <AlertTriangle size={20}/>
              <div>
                <div style={{ fontWeight:600, fontSize:13 }}>Foto inválida</div>
                <div style={{ fontSize:12.5, marginTop:2 }}>{photoError}</div>
              </div>
            </div>
          ) : (
            <div style={{ display:'flex', alignItems:'center', gap:16 }}>
              <img src={photoPreview} alt="preview"
                style={{ width:72, height:72, borderRadius:'50%', objectFit:'cover', border:'3px solid var(--accent)' }}/>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, fontSize:13 }}>Nova foto selecionada</div>
                <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>
                  Verifique se a foto mostra seu rosto claramente e tem aparência profissional.
                </div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-ghost btn-sm" onClick={cancelPhoto}><X size={14}/> Cancelar</button>
                <button className="btn btn-accent btn-sm" onClick={uploadPhoto} disabled={photoUploading}>
                  <Camera size={14}/> {photoUploading ? 'Enviando...' : 'Usar esta foto'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Orientação sobre foto */}
      {!photoPreview && !photoError && (
        <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:10, padding:'10px 16px', marginBottom:20, fontSize:12.5, color:'#1e40af', display:'flex', gap:10, alignItems:'flex-start' }}>
          <Camera size={16} style={{ flexShrink:0, marginTop:1 }}/>
          <div>
            <strong>Foto de perfil profissional:</strong> Use uma foto de rosto, bem iluminada e com fundo neutro.
            Formatos aceitos: JPG, PNG ou WEBP · Máximo 3MB · Mínimo 200×200px.
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:20 }}>
        {[
          { id:'dados',   label:'Dados Pessoais',    icon: User },
          { id:'empresa', label:'Empresa & Função',  icon: Building2 },
          { id:'senha',   label:'Alterar Senha',     icon: Lock },
        ].map(({ id, label, icon: Icon }) => (
          <button key={id}
            className={`btn ${tab === id ? 'btn-primary' : 'btn-ghost'} btn-sm`}
            onClick={() => setTab(id)}>
            <Icon size={14}/> {label}
          </button>
        ))}
      </div>

      <div className="card">
        {/* Dados pessoais */}
        {tab === 'dados' && (
          <div>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:20, display:'flex', alignItems:'center', gap:8 }}>
              <User size={18} color="var(--primary-light)"/> Dados Pessoais
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              <div className="form-group" style={{ margin:0 }}>
                <label className="form-label">Nome completo *</label>
                <input className="input" value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Seu nome completo"/>
              </div>
              <div className="form-group" style={{ margin:0 }}>
                <label className="form-label">E-mail</label>
                <input className="input" value={form.email} readOnly
                  style={{ background:'#f8fafc', color:'var(--text-muted)', cursor:'not-allowed' }}/>
                <span className="form-hint">O e-mail não pode ser alterado</span>
              </div>
              <div className="form-group" style={{ margin:0 }}>
                <label className="form-label"><Phone size={13} style={{ marginRight:4 }}/>Celular</label>
                <PhoneInput value={form.phone} onChange={v => set('phone', v)} />
              </div>
              <div className="form-group" style={{ margin:0 }}>
                <label className="form-label">WhatsApp</label>
                <PhoneInput value={form.whatsapp} onChange={v => set('whatsapp', v)} />
              </div>
            </div>
            <div style={{ marginTop:24, display:'flex', justifyContent:'flex-end' }}>
              <button className="btn btn-primary" onClick={saveProfile} disabled={saving}>
                <Save size={15}/> {saving ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        )}

        {/* Empresa & Função */}
        {tab === 'empresa' && (
          <div>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:20, display:'flex', alignItems:'center', gap:8 }}>
              <Building2 size={18} color="var(--primary-light)"/> Empresa & Função
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              <div className="form-group" style={{ margin:0 }}>
                <label className="form-label">Empresa *</label>
                <input className="input" value={form.company} onChange={e => set('company', e.target.value)} placeholder="Nome da empresa"/>
              </div>
              <div className="form-group" style={{ margin:0 }}>
                <label className="form-label"><Hash size={13} style={{ marginRight:4 }}/>ID / Matrícula</label>
                <input className="input" value={form.employee_id} onChange={e => set('employee_id', e.target.value)} placeholder="Número de matrícula"/>
              </div>
              <div className="form-group" style={{ margin:0 }}>
                <label className="form-label">Setor</label>
                <input className="input" value={form.sector} onChange={e => set('sector', e.target.value)} placeholder="Ex: Operações, RH, TI..."/>
              </div>
              <div className="form-group" style={{ margin:0 }}>
                <label className="form-label"><Briefcase size={13} style={{ marginRight:4 }}/>Função</label>
                <select className="select" value={form.role} onChange={e => set('role', e.target.value)}>
                  <option value="">Selecione...</option>
                  {FUNCOES.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginTop:20, padding:16, background:'var(--bg)', borderRadius:10 }}>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
                <Shield size={14}/> Nível de acesso
              </div>
              <div style={{ display:'flex', gap:10 }}>
                {Object.entries(NIVEL_LABELS).map(([key, label]) => (
                  <div key={key} style={{
                    flex:1, padding:'10px 14px', borderRadius:10,
                    border:`2px solid ${nivel===key ? NIVEL_COLORS[key] : 'var(--border)'}`,
                    background: nivel===key ? NIVEL_COLORS[key]+'15' : 'white',
                    textAlign:'center',
                  }}>
                    <div style={{ fontWeight:700, fontSize:13, color: nivel===key ? NIVEL_COLORS[key] : 'var(--text-muted)' }}>{label}</div>
                    <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>
                      {key==='admin' ? 'Acesso total' : key==='gestor' ? 'Gerencia líderes' : 'Agenda pessoal'}
                    </div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:10 }}>O nível de acesso é definido pelo administrador.</p>
            </div>

            <div style={{ marginTop:24, display:'flex', justifyContent:'flex-end' }}>
              <button className="btn btn-primary" onClick={saveProfile} disabled={saving}>
                <Save size={15}/> {saving ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        )}

        {/* Alterar senha */}
        {tab === 'senha' && (
          <div style={{ maxWidth:420 }}>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:20, display:'flex', alignItems:'center', gap:8 }}>
              <Lock size={18} color="var(--primary-light)"/> Alterar Senha
            </div>
            {['current','novo','confirmar'].map((field) => {
              const labels = { current:'Senha atual', novo:'Nova senha', confirmar:'Confirmar nova senha' };
              const placeholders = { current:'Digite a senha atual', novo:'Mínimo 6 caracteres', confirmar:'Repita a nova senha' };
              return (
                <div className="form-group" key={field}>
                  <label className="form-label">{labels[field]}</label>
                  <div style={{ position:'relative' }}>
                    <input className="input"
                      type={showPass[field] ? 'text' : 'password'}
                      value={passForm[field]}
                      onChange={e => setP(field, e.target.value)}
                      placeholder={placeholders[field]}
                      style={{ paddingRight:40 }}/>
                    <button type="button" className="btn-icon"
                      onClick={() => setShowPass(p => ({ ...p, [field]: !p[field] }))}
                      style={{ position:'absolute', right:6, top:'50%', transform:'translateY(-50%)' }}>
                      {showPass[field] ? <EyeOff size={15}/> : <Eye size={15}/>}
                    </button>
                  </div>
                </div>
              );
            })}
            <div style={{ background:'#fef3c7', borderRadius:8, padding:'10px 14px', fontSize:12.5, color:'#92400e', marginBottom:20 }}>
              💡 Use letras maiúsculas, números e símbolos para uma senha mais segura.
            </div>
            <button className="btn btn-primary" onClick={changePassword} disabled={passLoading}>
              <Lock size={15}/> {passLoading ? 'Alterando...' : 'Alterar senha'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
