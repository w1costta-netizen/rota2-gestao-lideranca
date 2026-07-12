import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { registerPush } from '../lib/push';

const STEPS = [
  {
    icon: '🧭',
    title: 'Bem-vindo ao Rota 2.0',
    subtitle: 'Gestão de Liderança — Sam\'s Club',
    body: 'Sua ferramenta exclusiva de comunicação e gestão. Tudo que você precisa para o dia a dia, direto no celular.',
    highlights: [
      { icon: '📅', text: 'Agenda semanal atualizada em tempo real' },
      { icon: '📢', text: 'Comunicados e avisos importantes' },
      { icon: '📋', text: 'Sua escala sempre disponível' },
      { icon: '💳', text: 'Análise de desempenho de caixas' },
    ],
  },
  {
    icon: '📱',
    title: 'Leve na tela inicial',
    subtitle: 'Como um app nativo, sem ocupar espaço',
    body: null,
    tutorial: [
      {
        os: '🍎 iPhone (Safari)',
        steps: [
          'Abra o link no Safari (não no Chrome)',
          'Toque no ícone de compartilhar ↑ na barra de baixo',
          'Role e toque em "Adicionar à Tela de Início"',
          'Confirme tocando em "Adicionar"',
        ],
      },
      {
        os: '🤖 Android (Chrome)',
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
    icon: '🔒',
    title: 'Seguro e leve',
    subtitle: 'Sem impacto no seu celular',
    body: null,
    facts: [
      { icon: '✅', text: 'Ocupa menos de 500KB — menos que uma foto' },
      { icon: '✅', text: 'Não instala arquivos no celular' },
      { icon: '✅', text: 'Não consome dados em segundo plano' },
      { icon: '✅', text: 'Não acessa fotos, contatos ou câmera' },
      { icon: '✅', text: 'Para remover: apague o ícone da tela' },
      { icon: '✅', text: 'Funciona como um site inteligente e seguro' },
    ],
  },
  {
    icon: '🔔',
    title: 'Ative as notificações',
    subtitle: 'Receba alertas em tempo real',
    body: 'Quando o gestor publicar um comunicado ou atualizar a agenda, você recebe uma notificação — mesmo com o app fechado.',
    pushStep: true,
  },
];

export default function Welcome({ userId, onFinish }) {
  const [step, setStep]           = useState(0);
  const [pushDone, setPushDone]   = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const current = STEPS[step];
  const isLast  = step === STEPS.length - 1;

  const finish = async () => {
    await supabase.from('profiles').update({ first_access: false }).eq('id', userId).catch(() => {});
    onFinish();
  };

  const activatePush = async () => {
    setPushLoading(true);
    await registerPush(userId).catch(() => {});
    setPushDone(Notification.permission === 'granted');
    setPushLoading(false);
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
        {/* Icon */}
        <div style={{ fontSize: 56, textAlign: 'center', marginBottom: 16 }}>
          {current.icon}
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
                <span style={{ fontSize: 22 }}>{h.icon}</span>
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
                <span style={{ fontSize: 16 }}>{f.icon}</span>
                <span style={{ fontSize: 14, color: '#ccc' }}>{f.text}</span>
              </div>
            ))}
          </div>
        )}

        {/* Push step (step 3) */}
        {current.pushStep && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
            {!pushDone ? (
              <button
                onClick={activatePush}
                disabled={pushLoading}
                style={{
                  padding: '14px', borderRadius: 14, border: 'none',
                  background: '#E8681A', color: '#fff',
                  fontWeight: 700, fontSize: 15, cursor: 'pointer',
                  opacity: pushLoading ? .7 : 1,
                }}>
                {pushLoading ? 'Ativando...' : '🔔 Ativar notificações'}
              </button>
            ) : (
              <div style={{
                padding: '14px', borderRadius: 14,
                background: '#10b98120', border: '1px solid #10b981',
                textAlign: 'center', color: '#10b981', fontWeight: 700,
              }}>
                ✅ Notificações ativadas!
              </div>
            )}
            <button
              onClick={finish}
              style={{
                padding: '12px', borderRadius: 14, border: '1px solid #333',
                background: 'transparent', color: '#666',
                fontSize: 13, cursor: 'pointer',
              }}>
              Pular por agora
            </button>
          </div>
        )}
      </div>

      {/* Navigation */}
      {!current.pushStep && (
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
          <button onClick={() => setStep(s => s + 1)} style={{
            flex: 2, padding: '14px', borderRadius: 14, border: 'none',
            background: '#E8681A', color: '#fff',
            fontWeight: 700, fontSize: 15, cursor: 'pointer',
          }}>
            {step === 0 ? 'Começar →' : 'Próximo →'}
          </button>
        </div>
      )}
    </div>
  );
}
