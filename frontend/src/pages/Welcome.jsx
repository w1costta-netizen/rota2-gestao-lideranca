import React, { useState } from 'react';
// Ícones desenhados, não emoji.
//
// Emoji é desenhado pelo sistema operacional: o mesmo caractere vira uma
// coisa no Windows, outra no iPhone, outra no Android — e o app não controla
// nenhuma delas. Estes são os mesmos do resto do produto, então a tela de
// boas-vindas passa a parecer parte do app em vez de um aviso colado nele.
import {
  Compass, Smartphone, ShieldCheck, Bell,
  CheckSquare, Megaphone, CalendarRange, PenTool, MessageCircle,
  Download, Feather, Camera, Lock, Trash2, Check,
} from 'lucide-react';
import api from '../api';
import { situacaoAtual, ativarNotificacoes } from '../lib/notificacoes';

const STEPS = [
  {
    icon: Compass,
    title: 'Bem-vindo ao Rota Líder',
    subtitle: 'Gestão, Liderança e Produtividade',
    body: 'Tudo o que a liderança precisa em um lugar só — no computador e no celular.',
    // Só o que TODO cliente recebe no plano. "Caixas" estava aqui e é módulo
    // adicional: a primeira tela do app prometia algo que o cliente novo não
    // tem. Mesmo erro do "acesso completo" que as páginas de venda traziam.
    highlights: [
      { icon: CheckSquare, text: 'Tarefas com prazo e responsável' },
      { icon: Megaphone, text: 'Comunicados com controle de quem leu' },
      { icon: CalendarRange, text: 'Escala e agenda da equipe' },
      { icon: PenTool, text: 'Atas de reunião assinadas' },
      { icon: MessageCircle, text: 'Conversas e Diário de Bordo' },
    ],
  },
  {
    icon: Smartphone,
    title: 'Leve na tela inicial',
    subtitle: 'Como um app nativo, sem ocupar espaço',
    // O motivo importa mais que o passo a passo: sem ele a pessoa pula a
    // tela, e depois reclama que a notificação não chega no iPhone.
    body: 'No iPhone, as notificações só funcionam com o app na tela de início. Vale fazer agora — leva 20 segundos.',
    tutorial: [
      {
        os: 'iPhone (Safari)',
        steps: [
          'Abra o link no Safari (não no Chrome)',
          'Toque no ícone de compartilhar ↑ na barra de baixo',
          'Role e toque em "Adicionar à Tela de Início"',
          'Confirme tocando em "Adicionar"',
        ],
      },
      {
        os: 'Android (Chrome)',
        steps: [
          'Abra o link no Google Chrome',
          'Toque nos 3 pontinhos ⋮ no canto superior direito',
          'Toque em "Adicionar à tela inicial"',
          'Confirme tocando em "Adicionar"',
        ],
      },
    ],
  },
  {
    icon: ShieldCheck,
    title: 'Seguro e leve',
    subtitle: 'Sem impacto no seu celular',
    body: null,
    // "Não acessa fotos, contatos ou câmera" saiu daqui: era FALSO. O app usa
    // câmera e galeria em Flyers, Tour 4x4, anexo do chat e foto de perfil —
    // sempre com permissão, mas afirmar o contrário é o tipo de frase que
    // destrói a confiança no dia em que o cliente percebe.
    // O tamanho também saiu: eram "menos de 500KB" contra 514KB medidos, e o
    // número só cresce. Promessa que envelhece mal não vale a pena.
    facts: [
      // "Não instala nada no celular" contradizia a tela anterior, que pede
      // justamente para adicionar à tela de início. Uma tela desmentindo a
      // outra é pior do que não dizer nada. O que é verdade: o ícone vai
      // para a tela de início, mas não vem de loja de aplicativos.
      { icon: Download, text: 'O ícone fica na tela de início, sem baixar da loja de apps' },
      { icon: Feather, text: 'Ocupa pouquíssimo espaço — bem menos que um aplicativo comum' },
      { icon: Camera, text: 'Usa a câmera e as fotos só quando você anexa alguma' },
      { icon: Lock, text: 'Não lê seus contatos nem suas mensagens' },
      { icon: Trash2, text: 'Para remover: apague o ícone da tela' },
    ],
  },
  {
    icon: Bell,
    title: 'Ative as notificações',
    subtitle: 'Fique sabendo na hora',
    body: 'Quando publicarem um comunicado, alterarem a agenda ou passarem uma tarefa para você, o aviso chega mesmo com o app fechado.',
    // Última etapa de propósito: é o pedido de permissão, e pedir isso antes
    // de a pessoa entender o que o app faz costuma virar recusa — e recusa
    // no iPhone só se desfaz nos Ajustes do aparelho.
    etapaPush: true,
  },
];

export default function Welcome({ userId, onFinish }) {
  const [step, setStep]           = useState(0);
  const current = STEPS[step];
  const isLast  = step === STEPS.length - 1;

  const [push, setPush]       = useState(() => situacaoAtual().estado);
  const [ativando, setAtivando] = useState(false);

  const ativarPush = async () => {
    setAtivando(true);
    await ativarNotificacoes(userId);
    setPush(situacaoAtual().estado);
    setAtivando(false);
  };

  const finish = async () => {
    // Salva no localStorage imediatamente para não repetir mesmo se API falhar
    localStorage.setItem(`welcome_done_${userId}`, '1');
    await api.post('/profile/first-access-done', { user_id: userId }).catch(() => {});
    onFinish();
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#0D0D0D', padding: '24px 20px',
    }}>
      {/* Progress dots */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 40 }}>
        {STEPS.map((_, i) => (
          <div key={i} style={{
            width: i === step ? 24 : 8, height: 8, borderRadius: 4,
            background: i === step ? '#E8681A' : i < step ? '#E8681A80' : '#333',
            transition: 'all .3s',
          }}/>
        ))}
      </div>

      {/* Card */}
      <div style={{
        background: '#1A1A1A', borderRadius: 24, padding: '36px 28px',
        maxWidth: 420, width: '100%',
        border: '1px solid #2a2a2a',
        boxShadow: '0 24px 60px rgba(0,0,0,.6)',
      }}>
        {/* Ícone do passo, dentro de um círculo — sem o círculo o traço fino
            some no fundo escuro. */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'rgba(232,104,26,.12)', border: '1px solid rgba(232,104,26,.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <current.icon size={32} color="#E8681A" strokeWidth={1.8}/>
          </div>
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#fff', textAlign: 'center', marginBottom: 6 }}>
          {current.title}
        </h1>
        <p style={{ fontSize: 13, color: '#E8681A', textAlign: 'center', fontWeight: 600, marginBottom: 24 }}>
          {current.subtitle}
        </p>

        {/* Body text */}
        {current.body && (
          <p style={{ fontSize: 14, color: '#aaa', textAlign: 'center', lineHeight: 1.7, marginBottom: 24 }}>
            {current.body}
          </p>
        )}

        {/* Highlights (step 0) */}
        {current.highlights && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 8 }}>
            {current.highlights.map((h, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                background: '#242424', borderRadius: 12, padding: '12px 16px',
              }}>
                <h.icon size={19} color="#E8681A" strokeWidth={1.9} style={{ flexShrink: 0 }}/>
                <span style={{ fontSize: 14, color: '#ddd', fontWeight: 500 }}>{h.text}</span>
              </div>
            ))}
          </div>
        )}

        {/* Tutorial (step 1) */}
        {current.tutorial && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {current.tutorial.map((t, i) => (
              <div key={i} style={{ background: '#242424', borderRadius: 14, padding: '16px 18px' }}>
                <div style={{ fontWeight: 700, color: '#E8681A', fontSize: 14, marginBottom: 12 }}>{t.os}</div>
                {t.steps.map((s, j) => (
                  <div key={j} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
                    <span style={{
                      minWidth: 22, height: 22, borderRadius: '50%',
                      background: '#E8681A', color: '#fff',
                      fontSize: 11, fontWeight: 800,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{j + 1}</span>
                    <span style={{ fontSize: 13, color: '#ccc', lineHeight: 1.5 }}>{s}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Facts (step 2) */}
        {current.facts && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {current.facts.map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <f.icon size={17} color="#E8681A" strokeWidth={1.9} style={{ flexShrink: 0 }}/>
                <span style={{ fontSize: 14, color: '#ccc' }}>{f.text}</span>
              </div>
            ))}
          </div>
        )}

        {/* Ativação das notificações (última etapa) */}
        {current.etapaPush && (
          <div style={{ marginTop: 4 }}>
            {/* As duas causas que fazem a notificação sumir com tudo
                configurado certo. Levaram dias para serem descobertas num
                diagnóstico real, e nenhuma delas dá qualquer sinal na tela:
                a permissão continua aparecendo como ativa. Escrito aqui, a
                pessoa confere sozinha antes de abrir chamado. */}
            <div style={{
              marginBottom: 12, padding: '12px 14px', borderRadius: 12,
              background: '#33333360', border: '1px solid #444',
              color: '#bbb', fontSize: 12.5, lineHeight: 1.55,
            }}>
              <strong style={{ color: '#ddd' }}>Se um dia parar de chegar</strong>, confira
              no celular antes de tudo: <strong style={{ color: '#ddd' }}>Não Perturbe</strong> ou
              modo <strong style={{ color: '#ddd' }}>Sono</strong> ligado, e{' '}
              <strong style={{ color: '#ddd' }}>Economia de bateria</strong> ativada. Qualquer
              um dos dois segura a notificação sem avisar — e aqui continua marcado como ativo.
            </div>
            {push === 'permitido' ? (
              <div style={{
                padding: '14px', borderRadius: 14,
                background: '#10b98120', border: '1px solid #10b981',
                color: '#10b981', fontWeight: 700, fontSize: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                <Check size={16} strokeWidth={2.6}/> Notificações ativadas
              </div>
            ) : push === 'precisa_instalar' ? (
              // No iPhone a notificação só existe no app instalado. Sem este
              // aviso, o botão pediria uma permissão que o sistema nem
              // oferece, e a pessoa concluiria que o app está com defeito.
              <div style={{
                padding: '14px', borderRadius: 14,
                background: '#E8681A20', border: '1px solid #E8681A',
                color: '#E8681A', fontSize: 13, lineHeight: 1.5,
              }}>
                No iPhone, primeiro adicione o app à tela de início (passo anterior)
                e abra por lá. Depois é só ativar aqui no Perfil.
              </div>
            ) : push === 'bloqueado' ? (
              <div style={{
                padding: '14px', borderRadius: 14,
                background: '#33333380', border: '1px solid #444',
                color: '#aaa', fontSize: 13, lineHeight: 1.5,
              }}>
                As notificações estão bloqueadas nos ajustes do aparelho. Você pode
                liberar depois, no seu Perfil.
              </div>
            ) : (
              <button
                onClick={ativarPush}
                disabled={ativando}
                style={{
                  width: '100%', padding: '14px', borderRadius: 14, border: 'none',
                  background: '#E8681A', color: '#fff',
                  fontWeight: 700, fontSize: 15, cursor: 'pointer',
                  opacity: ativando ? .7 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                {ativando ? 'Ativando...' : (
                  <><Bell size={17} strokeWidth={2.2}/> Ativar notificações</>
                )}
              </button>
            )}
            <div style={{ fontSize: 12, color: '#777', marginTop: 10, textAlign: 'center' }}>
              Você pode ativar ou desativar depois, no seu Perfil.
            </div>
          </div>
        )}

      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', gap: 12, marginTop: 28, width: '100%', maxWidth: 420 }}>
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)} style={{
              flex: 1, padding: '14px', borderRadius: 14,
              border: '1px solid #333', background: 'transparent',
              color: '#888', fontWeight: 600, fontSize: 15, cursor: 'pointer',
            }}>
              ← Voltar
            </button>
          )}
          {/* A última etapa precisa concluir. Antes quem concluía era a
              etapa de notificações; sem ela, sem isto o usuário ficaria
              preso no fim do tutorial sem nenhum caminho de saída. */}
          <button onClick={() => (isLast ? finish() : setStep(s => s + 1))} style={{
            flex: 2, padding: '14px', borderRadius: 14, border: 'none',
            background: '#E8681A', color: '#fff',
            fontWeight: 700, fontSize: 15, cursor: 'pointer',
          }}>
          {isLast ? 'Começar a usar →' : step === 0 ? 'Começar →' : 'Próximo →'}
        </button>
      </div>
    </div>
  );
}
