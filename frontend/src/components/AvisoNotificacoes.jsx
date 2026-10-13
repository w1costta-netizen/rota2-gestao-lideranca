import React, { useEffect, useState, useCallback } from 'react';
import { BellRing, X } from 'lucide-react';
import { useToast } from './Toast';
import { registrarSeJaPermitido, ativarNotificacoes } from '../lib/notificacoes';

// ─────────────────────────────────────────────────────────────
// Mantém as notificações vivas sem a pessoa precisar ir ao Perfil.
//
// Ao abrir o app e ao voltar para ele, confere o cadastro do aparelho e o
// refaz sozinho quando dá. Quando o aparelho exige um toque para isso
// (iPhone, às vezes), mostra esta faixa com UM botão — antes, o único
// caminho era descobrir sozinho que tinha parado, ir em Perfil e ativar.
// ─────────────────────────────────────────────────────────────
const ADIADO = 'rota_push_aviso_adiado_ate';
const ADIAR_MS = 2 * 24 * 60 * 60 * 1000;   // "Agora não" = 2 dias
const CONFERIR_MS = 10 * 60 * 1000;          // no máximo a cada 10 min

const adiado = () => {
  try { return Number(localStorage.getItem(ADIADO) || 0) > Date.now(); } catch { return false; }
};

export default function AvisoNotificacoes({ userId }) {
  const toast = useToast();
  const [mostrar, setMostrar] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const conferir = useCallback(async () => {
    const r = await registrarSeJaPermitido(userId);
    setMostrar(r === 'precisa_toque' && !adiado());
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let ultima = 0;
    const talvez = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - ultima < CONFERIR_MS) return;
      ultima = Date.now();
      conferir();
    };
    talvez();
    // App instalado no celular quase nunca é "aberto de novo": fica em
    // segundo plano e volta. Por isso confere também na volta.
    document.addEventListener('visibilitychange', talvez);
    return () => document.removeEventListener('visibilitychange', talvez);
  }, [userId, conferir]);

  if (!mostrar) return null;

  const reativar = async () => {
    setOcupado(true);
    // Chamada direto do clique: é o que o iPhone exige.
    const r = await ativarNotificacoes(userId);
    setOcupado(false);
    if (r.ok) {
      setMostrar(false);
      toast('Notificações reativadas neste aparelho.');
    } else if (r.motivo === 'recusado' || r.motivo === 'bloqueado') {
      setMostrar(false);
      toast('As notificações estão bloqueadas nos ajustes do aparelho. Veja em Perfil → Notificações como liberar.', 'error');
    } else {
      toast('Não foi possível reativar agora. Tente de novo em Perfil → Notificações.', 'error');
    }
  };

  const agoraNao = () => {
    try { localStorage.setItem(ADIADO, String(Date.now() + ADIAR_MS)); } catch { /* aba anônima */ }
    setMostrar(false);
  };

  return (
    <div role="status" style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      background: 'var(--surface-2, var(--surface))', border: '1px solid var(--primary)',
      borderRadius: 12, padding: '10px 14px', margin: '12px 16px 0', fontSize: 13,
    }}>
      <BellRing size={18} style={{ color: 'var(--primary)', flexShrink: 0 }} />
      <span style={{ flex: '1 1 200px', minWidth: 0 }}>
        As notificações pararam neste aparelho. Toque para voltar a receber tarefas, avisos e mensagens.
      </span>
      <button className="btn btn-primary" onClick={reativar} disabled={ocupado} style={{ fontSize: 13, padding: '6px 14px' }}>
        {ocupado ? 'Reativando…' : 'Reativar'}
      </button>
      <button className="btn-icon" onClick={agoraNao} title="Agora não" aria-label="Agora não">
        <X size={16} />
      </button>
    </div>
  );
}
