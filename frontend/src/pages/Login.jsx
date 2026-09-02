import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Eye, EyeOff, LogIn } from 'lucide-react';

export default function Login({ onGoRegister }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');

  const login = async () => {
    setError('');
    if (!email || !password) return setError('Preencha e-mail e senha.');
    setLoading(true);
    const { error: e } = await supabase.auth.signInWithPassword({ email, password });
    if (e) {
      const msg = e.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.'
        : e.message === 'Email not confirmed' ? 'Confirme seu e-mail antes de entrar — verifique a caixa de entrada (e o spam) e clique no link de confirmação que enviamos.'
        : e.message;
      setError(msg);
    }
    setLoading(false);
  };

  const sendReset = async () => {
    if (!resetEmail) return setError('Digite seu e-mail para redefinir a senha.');
    const { error: e } = await supabase.auth.resetPasswordForEmail(resetEmail);
    if (e) return setError(e.message);
    setResetSent(true);
  };

  return (
    <div className="auth-card">
      <div className="auth-header">
        <div className="auth-logo">Rota Líder</div>
        <div className="auth-subtitle">Gestão, Liderança e Produtividade</div>
      </div>

      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
          <LogIn size={28} color="white" />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Bem-vindo de volta</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>Acesse sua conta para continuar</p>
      </div>

      {error && <div className="auth-error">{error}</div>}

      {!showReset ? (
        <>
          <div className="auth-fields">
            <div className="form-group">
              <label className="form-label">E-mail</label>
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} spellCheck={false} autoCapitalize="none" autoCorrect="off"
                placeholder="seu@email.com" onKeyDown={e => e.key === 'Enter' && login()} />
            </div>
            <div className="form-group">
              <label className="form-label">Senha</label>
              <div style={{ position: 'relative' }}>
                <input className="input" type={showPass ? 'text' : 'password'} value={password} spellCheck={false} autoCapitalize="none" autoCorrect="off"
                  onChange={e => setPassword(e.target.value)} placeholder="Sua senha"
                  style={{ paddingRight: 40 }} onKeyDown={e => e.key === 'Enter' && login()} />
                <button type="button" className="btn-icon" onClick={() => setShowPass(p => !p)}
                  style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)' }}>
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
              onClick={login} disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
            <button className="auth-link" style={{ display: 'block', textAlign: 'center', marginTop: 12 }}
              onClick={() => { setShowReset(true); setError(''); }}>
              Esqueci minha senha
            </button>
          </div>
        </>
      ) : (
        <div className="auth-fields">
          {resetSent ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <p style={{ color: 'var(--accent)', fontWeight: 600 }}>✅ E-mail enviado!</p>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 8 }}>Verifique sua caixa de entrada e siga as instruções para redefinir a senha.</p>
              <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={() => { setShowReset(false); setResetSent(false); }}>Voltar ao login</button>
            </div>
          ) : (
            <>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>Digite seu e-mail e enviaremos um link para redefinir sua senha.</p>
              <div className="form-group">
                <label className="form-label">E-mail</label>
                <input className="input" type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)} placeholder="seu@email.com" spellCheck={false} autoCapitalize="none" autoCorrect="off" />
              </div>
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={sendReset}>Enviar link de redefinição</button>
              <button className="auth-link" style={{ display: 'block', textAlign: 'center', marginTop: 12 }} onClick={() => setShowReset(false)}>Voltar ao login</button>
            </>
          )}
        </div>
      )}

      {/* Quem chega aqui sem ter comprado — por indicação, por um print no
          grupo, procurando o nome — encontrava só "acesso por convite" e ia
          embora sem descobrir nem o preço. Não é falha de segurança: criar
          conta sem compra continua impossível. É venda perdida, e este é o
          único lugar em que dá para recuperá-la. */}
      {!showReset && (
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border)', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
            Ainda não tem uma conta?
          </div>
          {/* btn-secondary, não btn puro: a moldura do botão vem do estilo
              do elemento <button>, e isto aqui é um link. Com "btn" sozinho
              saía como texto solto, sem parecer clicável. */}
          <a href="/vendas.html"
            className="btn btn-secondary"
            style={{ width: '100%', justifyContent: 'center', textDecoration: 'none' }}>
            Conhecer o Rota Líder
          </a>
          <a href="/planos.html"
            style={{ display: 'inline-block', marginTop: 10, fontSize: 12.5,
                     color: 'var(--primary)', fontWeight: 600, textDecoration: 'underline' }}>
            Ver planos e assinar
          </a>
        </div>
      )}

      <div className="auth-footer" style={{ fontSize:12, color:'var(--text-muted)', textAlign:'center' }}>
        A equipe entra por convite do administrador da loja.<br />
        <a href="/termos-de-uso-rotalider.html" target="_blank" rel="noopener noreferrer"
          style={{ color:'var(--primary)', textDecoration:'underline', marginTop:6, display:'inline-block' }}>
          Termos de Uso
        </a>
        {' · '}
        <a href="/politica-de-privacidade-rotalider.html" target="_blank" rel="noopener noreferrer"
          style={{ color:'var(--primary)', textDecoration:'underline', display:'inline-block' }}>
          Política de Privacidade
        </a>
      </div>
    </div>
  );
}
