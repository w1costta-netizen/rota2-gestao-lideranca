import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Eye, EyeOff, UserPlus, CheckCircle } from 'lucide-react';
import PhoneInput from '../components/PhoneInput';
import { unformatPhone } from '../utils';

const FUNCOES = ['Diretor(a)','Gerente','Coordenador(a)','Supervisor(a)','Líder','Analista','Assistente','Outro'];
const NIVEIS = ['admin','gestor','lider'];
const NIVEL_LABELS = { admin: 'Administrador', gestor: 'Gestor', lider: 'Líder' };

export default function Register({ onGoLogin }) {
  const [step, setStep] = useState(1);
  const [showPass, setShowPass] = useState(false);
  const [showPass2, setShowPass2] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    company: '',
    employee_id: '',
    sector: '',
    role: '',
    phone: '',
    whatsapp: '',
    access_level: 'lider',
    password: '',
    password2: '',
    terms: false,
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const nextStep = () => {
    setError('');
    if (step === 1) {
      if (!form.full_name || !form.email || !form.company)
        return setError('Preencha nome, e-mail e empresa.');
    }
    if (step === 2) {
      if (!form.sector || !form.role || !form.phone)
        return setError('Preencha setor, função e celular.');
    }
    setStep(s => s + 1);
  };

  const submit = async () => {
    setError('');
    if (!form.password || form.password.length < 6)
      return setError('A senha deve ter ao menos 6 caracteres.');
    if (form.password !== form.password2)
      return setError('As senhas não coincidem.');
    if (!form.terms)
      return setError('Aceite os termos de uso para continuar.');

    setLoading(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { full_name: form.full_name } },
      });

      if (signUpError) throw signUpError;

      if (data.user) {
        // Usa o backend com chave secreta para garantir que o perfil
        // seja salvo mesmo antes do e-mail ser confirmado
        await fetch('/api/profile/upsert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: data.user.id,
            full_name: form.full_name,
            email: form.email,
            company: form.company,
            employee_id: form.employee_id,
            sector: form.sector,
            role: form.role,
            phone: form.phone,
            whatsapp: form.whatsapp || form.phone,
            access_level: form.access_level,
          }),
        });
      }

      setDone(true);
    } catch (e) {
      setError(e.message || 'Erro ao criar conta.');
    }
    setLoading(false);
  };

  const initials = form.full_name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

  if (done) return (
    <div className="auth-success">
      <CheckCircle size={56} color="#10b981" />
      <h2>Conta criada com sucesso!</h2>
      <p>Enviamos um e-mail de confirmação para <strong>{form.email}</strong>.<br />Confirme seu e-mail e depois faça login.</p>
      <button className="btn btn-primary" onClick={onGoLogin}>Ir para o Login</button>
    </div>
  );

  return (
    <div className="auth-card">
      <div className="auth-header">
        <div className="auth-logo">Rota 2.0</div>
        <div className="auth-subtitle">Gestão de Liderança</div>
      </div>

      {/* Avatar preview */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
        <div className="avatar-preview">{initials}</div>
      </div>

      {/* Step indicator */}
      <div className="step-indicator">
        {[1,2,3].map(s => (
          <div key={s} className={`step-dot${step >= s ? ' active' : ''}${step > s ? ' done' : ''}`}>
            <span>{s}</span>
          </div>
        ))}
      </div>
      <div className="step-labels">
        <span className={step === 1 ? 'active' : ''}>Identificação</span>
        <span className={step === 2 ? 'active' : ''}>Empresa</span>
        <span className={step === 3 ? 'active' : ''}>Acesso</span>
      </div>

      {error && <div className="auth-error">{error}</div>}

      {/* Step 1 — Dados pessoais */}
      {step === 1 && (
        <div className="auth-fields">
          <div className="form-group">
            <label className="form-label">Nome completo *</label>
            <input className="input" value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Seu nome completo" />
          </div>
          <div className="form-group">
            <label className="form-label">E-mail *</label>
            <input className="input" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="seu@email.com" />
          </div>
          <div className="form-group">
            <label className="form-label">Empresa *</label>
            <input className="input" value={form.company} onChange={e => set('company', e.target.value)} placeholder="Nome da empresa" />
          </div>
          <div className="form-group">
            <label className="form-label">ID do colaborador</label>
            <input className="input" value={form.employee_id} onChange={e => set('employee_id', e.target.value)} placeholder="Número de matrícula (opcional)" />
          </div>
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }} onClick={nextStep}>
            Continuar →
          </button>
        </div>
      )}

      {/* Step 2 — Empresa/função */}
      {step === 2 && (
        <div className="auth-fields">
          <div className="form-group">
            <label className="form-label">Setor *</label>
            <input className="input" value={form.sector} onChange={e => set('sector', e.target.value)} placeholder="Ex: Operações, RH, TI..." />
          </div>
          <div className="form-group">
            <label className="form-label">Função *</label>
            <select className="select" value={form.role} onChange={e => set('role', e.target.value)}>
              <option value="">Selecione sua função...</option>
              {FUNCOES.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Celular *</label>
            <PhoneInput value={form.phone} onChange={v => set('phone', v)} />
          </div>
          <div className="form-group">
            <label className="form-label">WhatsApp</label>
            <PhoneInput value={form.whatsapp} onChange={v => set('whatsapp', v)} placeholder="Igual ao celular se for o mesmo" />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setStep(1)}>← Voltar</button>
            <button className="btn btn-primary" style={{ flex: 2, justifyContent: 'center' }} onClick={nextStep}>Continuar →</button>
          </div>
        </div>
      )}

      {/* Step 3 — Acesso e senha */}
      {step === 3 && (
        <div className="auth-fields">
          <div className="form-group">
            <label className="form-label">Nível de acesso</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {NIVEIS.map(n => (
                <button key={n} type="button"
                  className={`day-chip${form.access_level === n ? ' selected' : ''}`}
                  style={{ flex: 1, textAlign: 'center' }}
                  onClick={() => set('access_level', n)}>
                  {NIVEL_LABELS[n]}
                </button>
              ))}
            </div>
            <span className="form-hint">Admin gerencia tudo · Gestor gerencia líderes · Líder acessa apenas sua agenda</span>
          </div>
          <div className="form-group">
            <label className="form-label">Usuário (celular)</label>
            <input className="input" value={form.phone} readOnly style={{ background: '#f8fafc', color: 'var(--text-muted)' }} />
            <span className="form-hint">Seu número de celular é o seu usuário de login</span>
          </div>
          <div className="form-group">
            <label className="form-label">Senha *</label>
            <div style={{ position: 'relative' }}>
              <input className="input" type={showPass ? 'text' : 'password'} value={form.password}
                onChange={e => set('password', e.target.value)} placeholder="Mínimo 6 caracteres" style={{ paddingRight: 40 }} />
              <button type="button" className="btn-icon" onClick={() => setShowPass(p => !p)}
                style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)' }}>
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Confirmar senha *</label>
            <div style={{ position: 'relative' }}>
              <input className="input" type={showPass2 ? 'text' : 'password'} value={form.password2}
                onChange={e => set('password2', e.target.value)} placeholder="Repita a senha" style={{ paddingRight: 40 }} />
              <button type="button" className="btn-icon" onClick={() => setShowPass2(p => !p)}
                style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)' }}>
                {showPass2 ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            <input type="checkbox" checked={form.terms} onChange={e => set('terms', e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
            Concordo com os <span style={{ color: 'var(--primary-light)', textDecoration: 'underline', cursor: 'pointer' }}>Termos de Uso</span> e a <span style={{ color: 'var(--primary-light)', textDecoration: 'underline', cursor: 'pointer' }}>Política de Privacidade</span>
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setStep(2)}>← Voltar</button>
            <button className="btn btn-accent" style={{ flex: 2, justifyContent: 'center' }} onClick={submit} disabled={loading}>
              <UserPlus size={16} /> {loading ? 'Criando conta...' : 'Criar conta'}
            </button>
          </div>
        </div>
      )}

      <div className="auth-footer">
        Já tem conta? <button className="auth-link" onClick={onGoLogin}>Entrar</button>
      </div>
    </div>
  );
}
