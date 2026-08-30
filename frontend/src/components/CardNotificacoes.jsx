import React, { useState } from 'react';
import { Bell, BellOff, Smartphone } from 'lucide-react';
import { useToast } from './Toast';
import { situacaoAtual, ativarNotificacoes, enviarTeste, ehIOS } from '../lib/notificacoes';

// ─────────────────────────────────────────────────────────────
// NOTIFICAÇÕES — ETAPA 1
//
// A tela diz o que está acontecendo em vez de só oferecer um botão. No iOS
// a maior parte das falhas é muda: a permissão aparece como concedida e
// nada chega. Explicar o passo que falta aqui evita a pessoa concluir que
// "o app não funciona".
// ─────────────────────────────────────────────────────────────
export default function CardNotificacoes({ userId }) {
  const toast = useToast();
  const [situacao, setSituacao] = useState(() => situacaoAtual());
  const [ocupado, setOcupado]   = useState(false);

  const ativar = async () => {
    setOcupado(true);
    const r = await ativarNotificacoes(userId);
    setSituacao(situacaoAtual());
    setOcupado(false);

    if (r.ok) {
      toast(`Notificações ativadas neste aparelho${r.servico ? ` (${r.servico})` : ''}.`);
      return;
    }
    const recado = {
      precisa_instalar:  'No iPhone, é preciso instalar o app na tela de início primeiro.',
      bloqueado:         'As notificações estão bloqueadas nos ajustes do aparelho.',
      recusado:          'Você recusou a permissão. Toque de novo e escolha Permitir.',
      sem_suporte:       'Este navegador não trabalha com notificações.',
      servidor_sem_chave:'O servidor está sem a chave de notificações.',
    }[r.motivo] || `Não foi possível ativar${r.detalhe ? `: ${r.detalhe}` : '.'}`;
    toast(recado, 'error');
  };

  const testar = async () => {
    setOcupado(true);
    try {
      const r = await enviarTeste(userId);
      const lista = (r.aparelhos || []).map(a =>
        `${a.servico}: ${a.aceito ? 'aceito' : `falhou${a.codigo ? ` (${a.codigo})` : ''}`}`
      ).join(' · ');
      // Mostrar o resultado por aparelho é o que explica o caso clássico de
      // chegar no computador e não no celular.
      toast(lista || 'Nenhum aparelho registrado.', r.aceitos ? 'success' : 'error');
    } catch (e) {
      toast(e?.response?.data?.error || 'Erro ao enviar o teste', 'error');
    }
    setOcupado(false);
  };

  const ativo = situacao.estado === 'permitido';

  return (
    <div className="card" style={{ marginBottom: 20, display:'flex', alignItems:'center', justifyContent:'space-between', gap:16, flexWrap:'wrap' }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, minWidth:0 }}>
        {situacao.estado === 'precisa_instalar'
          ? <Smartphone size={20} style={{ color:'var(--accent)', flexShrink:0 }}/>
          : ativo
            ? <Bell size={20} style={{ color:'#10b981', flexShrink:0 }}/>
            : <BellOff size={20} style={{ color:'var(--text-muted)', flexShrink:0 }}/>}
        <div style={{ minWidth:0 }}>
          <div style={{ fontWeight:600, fontSize:14 }}>
            {{
              permitido:        'Notificações ativadas',
              bloqueado:        'Notificações bloqueadas',
              precisa_instalar: 'Instale o app para receber notificações',
              sem_suporte:      'Notificações indisponíveis',
            }[situacao.estado] || 'Receber notificações'}
          </div>
          <div style={{ fontSize:12, color:'var(--text-muted)' }}>
            {{
              permitido:        'Você receberá avisos mesmo com o app fechado.',
              bloqueado:        ehIOS()
                                  ? 'Vá em Ajustes › Notificações › Rota Líder e permita.'
                                  : 'Desbloqueie nas configurações do navegador.',
              precisa_instalar: 'Toque em Compartilhar e depois em "Adicionar à Tela de Início". Abra o app por esse ícone.',
              sem_suporte:      'Este navegador não trabalha com notificações.',
            }[situacao.estado] || 'Toque para ativar os avisos neste aparelho.'}
          </div>
        </div>
      </div>

      <div style={{ display:'flex', gap:8, flexShrink:0 }}>
        {situacao.estado === 'pode_ativar' && (
          <button className="btn btn-primary" onClick={ativar} disabled={ocupado}>
            <Bell size={14}/> {ocupado ? 'Ativando...' : 'Ativar'}
          </button>
        )}
        {ativo && (
          <>
            {/* Registrar de novo é inofensivo e resolve o caso de o aparelho
                estar permitido mas nunca ter chegado a se cadastrar. */}
            <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={ativar} disabled={ocupado}>
              Registrar aparelho
            </button>
            <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={testar} disabled={ocupado}>
              <Bell size={13}/> {ocupado ? 'Enviando...' : 'Testar'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
