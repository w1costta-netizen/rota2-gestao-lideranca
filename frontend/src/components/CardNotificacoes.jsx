import React, { useState, useEffect } from 'react';
import { Bell, BellOff, Smartphone, RefreshCw, HelpCircle, ChevronDown } from 'lucide-react';
import { useToast } from './Toast';
import {
  situacaoAtual, ativarNotificacoes, enviarTeste, ehIOS,
  versaoAtiva, atualizarAplicativo, consumirAvisoDeReinstalacao, meusAparelhos, VERSAO_ESPERADA,
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
  const [ajuda, setAjuda]       = useState(false);

  const [aparelhos, setAparelhos] = useState(null);

  const carregarAparelhos = () => { meusAparelhos(userId).then(setAparelhos); };

  useEffect(() => {
    versaoAtiva().then(setVersao);
    carregarAparelhos();
    if (consumirAvisoDeReinstalacao()) {
      toast('O app foi reinstalado neste aparelho. Toque em "Registrar aparelho" para voltar a receber notificações.');
    }
  }, [userId]);

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
    carregarAparelhos();
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
      // O teste apaga aparelhos que não existem mais, então a lista muda.
      carregarAparelhos();
    } catch (e) {
      toast(e?.response?.data?.error || 'Erro ao enviar o teste', 'error');
    }
    setOcupado(false);
  };

  const ativo = situacao.estado === 'permitido';

  // ─────────────────────────────────────────────────────────────
  // Orientação para quem tem a notificação ativada e mesmo assim não
  // recebe. A ordem não é aleatória: é a ordem em que essas causas
  // realmente aparecem. As duas primeiras são configurações do próprio
  // celular que não dão nenhum sinal de que estão agindo — a notificação
  // simplesmente não chega, e a pessoa conclui que o app está quebrado.
  // ─────────────────────────────────────────────────────────────
  const VERIFICACOES = ehIOS() ? [
    ['Bateria amarela na barra de cima',
     'É o Modo de Baixo Consumo. Ele segura as notificações para poupar bateria. Coloque para carregar até passar de 20%.'],
    ['Ícone de lua ou cama na barra de cima',
     'É um Foco ativo (Sono, Não Perturbe, Trabalho). Ele silencia notificações. Desligue, ou libere o Rota Líder dentro do Foco.'],
    ['Ajustes › Notificações › Rota Líder',
     'Confira: "Permitir Notificações" ligado, "Avisos" marcado e entrega "Imediata" — se estiver em "Resumo Agendado", os avisos só chegam no horário do resumo.'],
    ['O app precisa estar na tela de início',
     'No iPhone, notificação só funciona no app instalado e aberto pelo ícone. Pelo Safari não funciona.'],
    ['Versão do app neste aparelho',
     'Se aparecer o aviso de desatualizado aqui em cima, toque em "Atualizar app". É essa parte que exibe as notificações.'],
  ] : [
    ['Economia de bateria',
     'Modo de economia costuma segurar notificações. Desative para o navegador ou coloque para carregar.'],
    ['Permissão no navegador',
     'Clique no cadeado ao lado do endereço e confirme que as notificações estão permitidas para este site.'],
    ['Não Perturbe / Assistente de Foco',
     'No Windows e no Android, esse modo silencia os avisos sem dar nenhum sinal.'],
    ['Versão do app neste aparelho',
     'Se aparecer o aviso de desatualizado aqui em cima, toque em "Atualizar app". É essa parte que exibe as notificações.'],
  ];

  return (
    <div className="card" style={{ marginBottom: 20 }}>
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:16, flexWrap:'wrap' }}>
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
          {ativo && aparelhos && (
            <div style={{ fontSize:11, marginTop:4, color: aparelhos.length ? 'var(--text-muted)' : 'var(--danger)' }}>
              {aparelhos.length
                ? `Registrado em: ${aparelhos.map(a => a.tipo).join(', ')}`
                : '⚠️ Este aparelho não está registrado no servidor. Toque em "Registrar aparelho".'}
            </div>
          )}
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

    {ativo && (
      <div style={{ marginTop:14, borderTop:'1px solid var(--border)', paddingTop:12 }}>
        <button
          onClick={() => setAjuda(v => !v)}
          style={{ background:'none', border:'none', padding:0, cursor:'pointer',
                   color:'var(--accent)', fontSize:12.5, fontWeight:600,
                   display:'flex', alignItems:'center', gap:6 }}>
          <HelpCircle size={14}/>
          Não está recebendo as notificações?
          <ChevronDown size={14} style={{ transform: ajuda ? 'rotate(180deg)' : 'none', transition:'transform .15s' }}/>
        </button>

        {ajuda && (
          <div style={{ marginTop:10 }}>
            <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:10 }}>
              Confira nesta ordem — as duas primeiras são as causas mais comuns, e são
              ajustes do próprio aparelho que não dão nenhum sinal de que estão agindo.
            </div>
            <ol style={{ margin:0, paddingLeft:18, display:'flex', flexDirection:'column', gap:8 }}>
              {VERIFICACOES.map(([titulo, texto]) => (
                <li key={titulo} style={{ fontSize:12.5 }}>
                  <strong>{titulo}</strong>
                  <div style={{ color:'var(--text-muted)', marginTop:2 }}>{texto}</div>
                </li>
              ))}
            </ol>
            <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:12,
                          background:'var(--bg-subtle, rgba(0,0,0,.04))', padding:'8px 10px', borderRadius:8 }}>
              Se percorreu tudo e continua sem receber, toque em <strong>Testar</strong> e
              envie ao suporte o que aparecer na mensagem — ela traz a versão do aparelho
              e o resultado de cada envio, que é o que permite achar a causa.
            </div>
          </div>
        )}
      </div>
    )}
    </div>
  );
}
