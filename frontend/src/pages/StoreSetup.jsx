import { useState } from 'react';
import api from '../api';

export default function StoreSetup({ userId, onFinish }) {
  const [name,    setName]    = useState('');
  const [city,    setCity]    = useState('');
  const [saving,  setSaving]  = useState(false);
  const [done,    setDone]    = useState(false);
  const [error,   setError]   = useState('');

  const submit = async () => {
    if (!name.trim()) return setError('Nome da loja é obrigatório.');
    setSaving(true);
    setError('');
    try {
      await api.post('/stores', { requester_id: userId, name: name.trim(), city: city.trim() });
      setDone(true);
    } catch (e) {
      setError(e.response?.data?.error || 'Erro ao cadastrar loja.');
    }
    setSaving(false);
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0D0D0D', padding: 24,
    }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16,
        padding: 40, maxWidth: 440, width: '100%',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏪</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>
            Cadastrar sua loja
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Preencha os dados da sua unidade. Após o cadastro, o administrador vai liberar o seu acesso.
          </p>
        </div>

        {done ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Solicitação enviada!</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Sua loja foi cadastrada e aguarda aprovação do administrador.
              Você receberá acesso assim que for aprovado.
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 16 }}>
              Pode fechar esta aba ou aguardar.
            </p>
          </div>
        ) : (
          <>
            {error && (
              <div style={{ background: '#ef444420', border: '1px solid #ef444440', borderRadius: 8,
                padding: '10px 14px', fontSize: 13, color: '#f87171', marginBottom: 16 }}>
                {error}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Nome da loja *</label>
              <input className="input" value={name} onChange={e => setName(e.target.value)}
                placeholder="Ex: Sam's Club Brasília Sul" autoFocus />
            </div>

            <div className="form-group">
              <label className="form-label">Cidade</label>
              <input className="input" value={city} onChange={e => setCity(e.target.value)}
                placeholder="Ex: Brasília - DF" />
            </div>

            <button className="btn btn-primary" onClick={submit} disabled={saving}
              style={{ width: '100%', justifyContent: 'center', marginTop: 8, padding: '12px' }}>
              {saving ? 'Cadastrando...' : 'Cadastrar loja'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
