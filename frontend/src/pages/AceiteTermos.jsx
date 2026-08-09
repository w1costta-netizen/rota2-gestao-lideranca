import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

const VERSAO_TERMOS = '1.0';

export default function AceiteTermos({ userId, onAceito }) {
  const [aceito, setAceito] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');

  const confirmar = async () => {
    if (!aceito) return setErro('Você precisa aceitar os Termos de Uso e a Política de Privacidade para continuar.');
    setLoading(true);
    const agora = new Date().toISOString();
    const { error } = await supabase
      .from('profiles')
      .update({ aceite_termos_em: agora, versao_termos: VERSAO_TERMOS, aceite_privacidade_em: agora })
      .eq('id', userId);
    if (error) { setErro('Erro ao registrar aceite. Tente novamente.'); setLoading(false); return; }
    onAceito();
  };

  return (
    <div className="auth-card" style={{ maxWidth: 480 }}>
      <div className="auth-header">
        <div className="auth-logo">Rota Líder</div>
        <div className="auth-subtitle">Gestão de Liderança</div>
      </div>

      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>📋</div>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>Termos de Uso</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 6 }}>
          Antes de continuar, leia e aceite nossos Termos de Uso.
        </p>
      </div>

      <div style={{
        background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10,
        padding: '14px 16px', marginBottom: 20, maxHeight: 180, overflowY: 'auto', fontSize: 13,
        color: 'var(--text-muted)', lineHeight: 1.6,
      }}>
        <p style={{ marginBottom: 8 }}>O <strong style={{ color: 'var(--text)' }}>Rota Líder</strong> é uma plataforma de gestão de liderança e comunicação de equipes operada pelo <strong style={{ color: 'var(--text)' }}>Grupo F7</strong>.</p>
        <p style={{ marginBottom: 8 }}>Ao utilizar esta plataforma você concorda em:</p>
        <ul style={{ paddingLeft: 18, marginBottom: 8 }}>
          <li style={{ marginBottom: 4 }}>Usar o sistema apenas para fins profissionais autorizados pela sua empresa;</li>
          <li style={{ marginBottom: 4 }}>Manter suas credenciais de acesso em sigilo;</li>
          <li style={{ marginBottom: 4 }}>Não compartilhar, copiar ou redistribuir o sistema;</li>
          <li style={{ marginBottom: 4 }}>Respeitar a privacidade e os dados dos demais usuários.</li>
        </ul>
        <p>Seus dados são tratados em conformidade com a <strong style={{ color: 'var(--text)' }}>LGPD (Lei nº 13.709/2018)</strong>.</p>
      </div>

      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 20 }}>
        <a href="/termos-de-uso-rotalider.html" target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 13, color: 'var(--primary)', textDecoration: 'underline' }}>
          📄 Termos de Uso
        </a>
        <a href="/politica-de-privacidade-rotalider.html" target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 13, color: 'var(--primary)', textDecoration: 'underline' }}>
          🔒 Política de Privacidade
        </a>
      </div>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', marginBottom: 20 }}>
        <input type="checkbox" checked={aceito} onChange={e => { setAceito(e.target.checked); setErro(''); }}
          style={{ marginTop: 2, width: 18, height: 18, accentColor: 'var(--primary)', flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
          Li e aceito os{' '}
          <a href="/termos-de-uso-rotalider.html" target="_blank" rel="noopener noreferrer"
            style={{ color: 'var(--primary)', textDecoration: 'underline' }}>
            Termos de Uso
          </a>
          {' '}e a{' '}
          <a href="/politica-de-privacidade-rotalider.html" target="_blank" rel="noopener noreferrer"
            style={{ color: 'var(--primary)', textDecoration: 'underline' }}>
            Política de Privacidade
          </a>
          {' '}do Rota Líder
        </span>
      </label>

      {erro && <div className="auth-error" style={{ marginBottom: 16 }}>{erro}</div>}

      <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', opacity: aceito ? 1 : 0.5 }}
        onClick={confirmar} disabled={loading || !aceito}>
        {loading ? 'Registrando...' : 'Confirmar e acessar o app'}
      </button>
    </div>
  );
}
