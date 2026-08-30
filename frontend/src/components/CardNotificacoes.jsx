import React, { useState, useEffect } from 'react';
import { Bell, BellOff, Smartphone, RefreshCw } from 'lucide-react';
import { useToast } from './Toast';
import {
  situacaoAtual, ativarNotificacoes, enviarTeste, ehIOS,
  versaoAtiva, atualizarAplicativo, consumirAvisoDeReinstalacao, VERSAO_ESPERADA,
} from '../lib/notificacoes';

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
  const [versao, setVersao]     = useState(null);

  useEffect(() => {
    versaoAtiva().then(setVersao);
    if (consumirAvisoDeReinstalacao()) {
      toast('O app foi reinstalado neste aparelho. Toque em "Registrar aparelho" para voltar a receber notificações.');
    }
  }, []);

  const desatualizado = versao !== null && versao !== VERSAO_ESPERADA;

  const atualizar = async () => {
    setOcupado(true);
    try {
      await atualizarAplicativo();
    } catch {
      setOcupado(false);
      toast('Não foi possível atualizar. Feche o app por completo e abra de novo.', 'error');
    }
  };

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
      // A versão vai junto de propósito. Quem exibe a notificação é o
      // service worker DESTE aparelho, e saber se ele está atualizado é
      // metade do diagnóstico — separado do resto da tela, esse dado passava
      // despercebido justamente na hora em que era necessário.
      const atual = await versaoAtiva();
      setVersao(atual);
      const prefixo = atual === VERSAO_ESPERADA
        ? `[${atual}] `
        : `[ESTE APARELHO ESTÁ DESATUALIZADO: ${atual || 'não foi possível verificar'}] `;
      toast(prefixo + (lista || 'Nenhum aparelho registrado.'), r.aceitos ? 'success' : 'error');
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
          {versao && (
            <div style={{ fontSize:11, marginTop:4, color: desatualizado ? 'var(--danger)' : 'var(--text-muted)' }}>
              {desatualizado
                ? `⚠️ Este aparelho está com uma versão antiga (${versao}). Quem exibe a notificação é essa parte do app — enquanto ela não atualizar, nada aparece.`
                : `Versão neste aparelho: ${versao}`}
            </div>
          )}
        </div>
      </div>

      <div style={{ display:'flex', gap:8, flexShrink:0, flexWrap:'wrap' }}>
        {desatualizado && (
          <button className="btn btn-primary" onClick={atualizar} disabled={ocupado}>
            <RefreshCw size={14}/> {ocupado ? 'Atualizando...' : 'Atualizar app'}
          </button>
        )}
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
