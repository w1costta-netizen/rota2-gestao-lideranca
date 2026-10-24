import { useState } from 'react';
import { Sparkles, Check, AlertTriangle, X, RefreshCw } from 'lucide-react';
import api from '../api';
import Modal from './Modal';

// ASSISTENTE DO PLANO DE AÇÃO (24/10/2026).
// A IA só SUGERE: tudo aqui mostra a sugestão e devolve para o formulário
// quando o líder clica em "Usar". Nada é gravado sem ele salvar.
// Regras do pedido e da resposta: backend/lib/assistentePlano.js.

const COR = '#8b5cf6';
const GIRA = { animation: 'spin 1s linear infinite' };

const REPETE = { diaria: 'todo dia', semanal: 'toda semana', quinzenal: 'a cada 15 dias', mensal: 'todo mês' };

export function useAssistente(planoId) {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [resultado, setResultado] = useState(null);

  const pedir = async (modo, rascunho) => {
    if (!planoId || carregando) return;
    setCarregando(true); setErro(''); setResultado(null);
    try {
      const { data } = await api.post(`/pdca/${planoId}/assistente`, { modo, rascunho });
      setResultado(data);
    } catch (e) {
      setErro(e?.response?.data?.error || 'O assistente não respondeu agora. Tente de novo.');
    } finally { setCarregando(false); }
  };
  const limpar = () => { setResultado(null); setErro(''); };
  return { pedir, carregando, erro, resultado, limpar };
}

export function BotaoIA({ children, carregando, onClick, style }) {
  return (
    <button type="button" onClick={onClick} disabled={carregando}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
        padding: '6px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: carregando ? 'wait' : 'pointer',
        background: COR + '18', color: COR, border: `1px solid ${COR}55`, ...style,
      }}>
      {carregando ? <RefreshCw size={14} style={GIRA}/> : <Sparkles size={14}/>}
      {carregando ? 'Pensando...' : children}
    </button>
  );
}

function Caixa({ titulo, children, onFechar }) {
  return (
    <div style={{ border: `1px solid ${COR}55`, background: COR + '0d', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Sparkles size={13} style={{ color: COR }}/>
        <span style={{ fontSize: 12, fontWeight: 700, color: COR, flex: 1 }}>{titulo}</span>
        {onFechar && (
          <button type="button" onClick={onFechar} aria-label="Fechar sugestão"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
            <X size={14}/>
          </button>
        )}
      </div>
      {children}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
        Sugestão da IA. Confira e ajuste antes de salvar.
      </div>
    </div>
  );
}

export function ErroIA({ erro }) {
  if (!erro) return null;
  return <div style={{ fontSize: 12, color: '#ef4444' }}>{erro}</div>;
}

// P — os 5 porquês e a meta.
export function SugestaoPorques({ sugestao, onUsar, onFechar }) {
  if (!sugestao) return null;
  return (
    <Caixa titulo="Sugestão de causa raiz" onFechar={onFechar}>
      <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--text)', lineHeight: 1.55 }}>
        {sugestao.porques.map((p, i) => <li key={i}>{p}</li>)}
      </ol>
      {sugestao.meta_smart && (
        <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 8 }}><strong>Meta:</strong> {sugestao.meta_smart}</div>
      )}
      {sugestao.observacao && (
        <div style={{ display: 'flex', gap: 6, fontSize: 12, color: '#b45309', marginTop: 8 }}>
          <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 2 }}/> {sugestao.observacao}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="button" className="btn-secondary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={onUsar}>
          <Check size={13}/> Usar
        </button>
        <button type="button" className="btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }} onClick={onFechar}>
          Descartar
        </button>
      </div>
    </Caixa>
  );
}

// D — ações sugeridas; cada uma preenche o formulário.
export function SugestaoAcoes({ acoes, onUsar, onFechar }) {
  if (!acoes) return null;
  return (
    <Caixa titulo="Ações sugeridas para a causa raiz" onFechar={onFechar}>
      {acoes.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nenhuma sugestão nova para este plano.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {acoes.map((a, i) => (
          <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{a.oque}</div>
            {(a.como || a.onde) && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {[a.onde && `Onde: ${a.onde}`, a.como && `Como: ${a.como}`].filter(Boolean).join(' · ')}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              {REPETE[a.recorrencia] && (
                <span style={{ fontSize: 11, fontWeight: 700, color: COR, background: COR + '18', borderRadius: 6, padding: '2px 6px' }}>
                  Rotina: {REPETE[a.recorrencia]}
                </span>
              )}
              <button type="button" className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px', marginLeft: 'auto' }}
                onClick={() => onUsar(a)}>
                <Check size={13}/> Usar esta
              </button>
            </div>
          </div>
        ))}
      </div>
    </Caixa>
  );
}

// Revisão do plano inteiro.
export function ModalRevisao({ open, onClose, assistente, onRefazer }) {
  const { carregando, erro, resultado } = assistente;
  return (
    <Modal open={open} onClose={onClose} title="Revisão do plano">
      {carregando && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)', padding: '12px 0' }}>
          <RefreshCw size={15} style={{ ...GIRA, color: COR }}/> Lendo o plano inteiro...
        </div>
      )}
      <ErroIA erro={erro}/>
      {resultado?.modo === 'revisar' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {resultado.resumo && <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.5 }}>{resultado.resumo}</div>}
          {resultado.pontos.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.5,
              color: 'var(--text)', padding: '8px 10px', borderRadius: 8,
              background: p.tipo === 'ok' ? '#10b98114' : '#f59e0b14' }}>
              {p.tipo === 'ok'
                ? <Check size={15} style={{ color: '#10b981', flexShrink: 0, marginTop: 2 }}/>
                : <AlertTriangle size={15} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 2 }}/>}
              <span>{p.texto}</span>
            </div>
          ))}
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Revisão feita pela IA a partir do que está escrito no plano. Ela não altera nada.
          </div>
        </div>
      )}
      {!carregando && (
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button className="btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Fechar</button>
          <button className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={onRefazer}>
            <RefreshCw size={14}/> Revisar de novo
          </button>
        </div>
      )}
    </Modal>
  );
}
