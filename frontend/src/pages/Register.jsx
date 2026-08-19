import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Eye, EyeOff, CheckCircle, AlertCircle, Loader } from 'lucide-react';

export default function Register({ onGoLogin }) {
  const [token, setToken]       = useState('');
  const [tokenOk, setTokenOk]   = useState(null); // null=verificando, true=ok, false=inválido
  const [step, setStep]         = useState(1);
  const [showPass, setShowPass] = useState(false);
  const [showPass2, setShowPass2] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);
  const [error, setError]       = useState('');
  const [precisaConfirmar, setPrecisaConfirmar] = useState(false);

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    company: '',
    password: '',
    password2: '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Ler token da URL (?token=XYZ) ao carregar
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    if (t) {
      setToken(t);
      verificarToken(t);
    } else {
      setTokenOk(false);
    }
  }, []);

  async function verificarToken(t) {
    setTokenOk(null);
    try {
      const resp = await fetch(`/api/hotmart/verificar-token?token=${encodeURIComponent(t)}`);
      if (!resp.ok) { setTokenOk(false); return; }
      const data = await resp.json();
      setTokenOk(true);
      setForm(f => ({ ...f, email: data.email }));
    } catch {
      setTokenOk(false);
    }
  }

  const submit = async () => {
    setError('');
    if (!form.full_name.trim()) return setError('Digite seu nome completo.');
    if (!form.company.trim())   return setError('Digite o nome da sua empresa ou equipe.');
    if (!form.password || form.password.length < 6) return setError('A senha deve ter ao menos 6 caracteres.');
    if (form.password !== form.password2) return setError('As senhas não coincidem.');

    setLoading(true);
    try {
      // 1. Criar usuário no Supabase Auth
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { full_name: form.full_name } },
      });
      if (signUpError) throw signUpError;

      const userId = authData.user?.id;
      if (!userId) throw new Error('Erro ao criar usuário.');

      // Se o Supabase exige confirmação de e-mail, o signUp não retorna sessão
      // ativa — nesse caso a pessoa precisa confirmar antes de conseguir logar.
      setPrecisaConfirmar(!authData.session);

      // 2. Criar tenant + perfil via backend (usa service key)
      const resp = await fetch('/api/hotmart/ativar-conta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          user_id:    userId,
          full_name:  form.full_name,
          email:      form.email,
          company:    form.company,
        }),
      });

      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || 'Erro ao ativar conta.');

      setDone(true);
    } catch (e) {
      setError(e.message || 'Erro ao criar conta.');
    }
    setLoading(false);
  };

  // Token inválido ou já usado
  if (tokenOk === false) return (
    <div className="auth-card">
      <div className="auth-header">
        <div className="auth-logo">Rota Líder</div>
        <div className="auth-subtitle">Gestão, Liderança e Produtividade</div>
      </div>
      <div style={{ textAlign:'center', padding:'24px 0' }}>
        <AlertCircle size={48} color="var(--primary)" style={{ marginBottom:16 }}/>
        <h2 style={{ fontSize:18, fontWeight:700, marginBottom:8 }}>Link inválido ou expirado</h2>
        <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:24 }}>
          Este link de cadastro não é válido ou já foi utilizado.<br/>
          Se você fez a compra, verifique o e-mail que recebeu.
        </p>
        <button className="btn btn-primary" style={{ width:'100%', justifyContent:'center' }} onClick={onGoLogin}>
          Ir para o Login
        </button>
      </div>
    </div>
  );

  // Verificando token
  if (tokenOk === null) return (
    <div className="auth-card">
      <div className="auth-header">
        <div className="auth-logo">Rota Líder</div>
      </div>
      <div style={{ textAlign:'center', padding:'32px 0', color:'var(--text-muted)' }}>
        <Loader size={32} style={{ animation:'spin 1s linear infinite', marginBottom:12 }}/>
        <p>Validando seu acesso...</p>
      </div>
    </div>
  );

  // Cadastro concluído
  if (done) return (
    <div className="auth-card">
      <div className="auth-header">
        <div className="auth-logo">Rota Líder</div>
      </div>
      <div style={{ textAlign:'center', padding:'24px 0' }}>
        <CheckCircle size={56} color="#10b981" style={{ marginBottom:16 }}/>
        <h2 style={{ fontSize:20, fontWeight:700, marginBottom:8 }}>Conta criada com sucesso!</h2>
        <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:16 }}>
          Seu workspace <strong>{form.company}</strong> está pronto.
        </p>
        {precisaConfirmar && (
          <div style={{ background:'#f59e0b15', border:'1px solid #f59e0b40', borderRadius:10,
            padding:'12px 14px', marginBottom:20, textAlign:'left', fontSize:13, color:'var(--text)' }}>
            <strong>⚠️ Confirme seu e-mail antes de entrar.</strong><br/>
            Enviamos um link de confirmação para <strong>{form.email}</strong> — verifique a caixa de
            entrada (e o spam) e clique nele. Só depois disso o login vai funcionar.
          </div>
        )}
        <button className="btn btn-primary" style={{ width:'100%', justifyContent:'center' }} onClick={onGoLogin}>
          {precisaConfirmar ? 'Já confirmei, fazer login' : 'Fazer login agora'}
        </button>
      </div>
    </div>
  );

  // Formulário de cadastro
  return (
    <div className="auth-card">
      <div className="auth-header">
        <div className="auth-logo">Rota Líder</div>
        <div className="auth-subtitle">Criar sua conta</div>
      </div>

      {error && <div className="auth-error">{error}</div>}

      <div className="auth-fields">
        <div className="form-group">
          <label className="form-label">Nome completo</label>
          <input className="input" value={form.full_name}
            onChange={e => set('full_name', e.target.value)}
            placeholder="Seu nome completo" />
        </div>

        <div className="form-group">
          <label className="form-label">E-mail</label>
          <input className="input" type="email" value={form.email} readOnly
            style={{ background:'var(--surface-2)', color:'var(--text-muted)' }} />
          <span style={{ fontSize:11, color:'var(--text-muted)' }}>E-mail vinculado à sua compra</span>
        </div>

        <div className="form-group">
          <label className="form-label">Nome da empresa ou equipe</label>
          <input className="input" value={form.company}
            onChange={e => set('company', e.target.value)}
            placeholder="Ex: Minha Empresa, Equipe Vendas..." />
        </div>

        <div className="form-group">
          <label className="form-label">Senha</label>
          <div style={{ position:'relative' }}>
            <input className="input" type={showPass ? 'text' : 'password'}
              value={form.password} onChange={e => set('password', e.target.value)}
              placeholder="Mínimo 6 caracteres" style={{ paddingRight:40 }} />
            <button type="button" className="btn-icon"
              onClick={() => setShowPass(p => !p)}
              style={{ position:'absolute', right:6, top:'50%', transform:'translateY(-50%)' }}>
              {showPass ? <EyeOff size={16}/> : <Eye size={16}/>}
            </button>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Confirmar senha</label>
          <div style={{ position:'relative' }}>
            <input className="input" type={showPass2 ? 'text' : 'password'}
              value={form.password2} onChange={e => set('password2', e.target.value)}
              placeholder="Repita a senha" style={{ paddingRight:40 }} />
            <button type="button" className="btn-icon"
              onClick={() => setShowPass2(p => !p)}
              style={{ position:'absolute', right:6, top:'50%', transform:'translateY(-50%)' }}>
              {showPass2 ? <EyeOff size={16}/> : <Eye size={16}/>}
            </button>
          </div>
        </div>

        <button className="btn btn-primary"
          style={{ width:'100%', justifyContent:'center', marginTop:8 }}
          onClick={submit} disabled={loading}>
          {loading ? 'Criando conta...' : 'Criar minha conta'}
        </button>
      </div>

      <div className="auth-footer">
        Já tem conta? <button className="auth-link" onClick={onGoLogin}>Entrar</button>
      </div>
    </div>
  );
}
