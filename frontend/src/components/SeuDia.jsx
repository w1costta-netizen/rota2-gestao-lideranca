import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import api from '../api';

// "SEU DIA EM 30 SEGUNDOS" (24/10/2026). Um parágrafo no alto do painel
// com o que importa hoje e por onde começar.
// Os fatos são os MESMOS números que o painel já contou (ver Dashboard), e o
// servidor só pede à IA que os escreva — regras em backend/lib/seuDia.js.
// Se a IA falhar, o servidor manda uma frase pronta: o cartão nunca some.

const saudacao = (periodo) => (periodo === 'noite' ? 'Boa noite' : periodo === 'tarde' ? 'Boa tarde' : 'Bom dia');
export const periodoAgora = () => {
  const h = new Date().getHours();
  return h >= 18 || h < 4 ? 'noite' : h >= 12 ? 'tarde' : 'manha';
};

export default function SeuDia({ nome, fatos }) {
  const [res, setRes] = useState(null);
  // Mesmo fato, mesma busca: o painel re-renderiza à toa e não pode
  // disparar a IA a cada vez.
  const chave = JSON.stringify(fatos);

  useEffect(() => {
    let vivo = true;
    api.post('/seu-dia', { fatos: JSON.parse(chave) })
      .then(r => { if (vivo) setRes(r.data); })
      .catch(() => { if (vivo) setRes({ texto: '', ia: false }); });
    return () => { vivo = false; };
  }, [chave]);

  // Sem resposta nenhuma (servidor fora): o cartão não aparece vazio.
  if (res && !res.texto) return null;
  const primeiro = (nome || '').split(' ')[0];

  return (
    <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid #8b5cf6', borderRadius: '0 12px 12px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Sparkles size={16} style={{ color: '#8b5cf6', flexShrink: 0 }}/>
        <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>
          {saudacao(fatos.periodo)}{primeiro ? `, ${primeiro}` : ''}
        </span>
      </div>
      {res ? (
        <>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)' }}>{res.texto}</div>
          {res.ia && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              Resumo escrito pela IA com os números do seu painel.
            </div>
          )}
        </>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Preparando o resumo do seu dia...</div>
      )}
    </div>
  );
}
