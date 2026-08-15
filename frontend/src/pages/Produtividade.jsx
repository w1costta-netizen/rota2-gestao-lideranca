import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Lightbulb, ChevronDown, ChevronUp, ChevronLeft, CheckCircle2, Circle,
  ArrowRight, PartyPopper, Users, AlertTriangle, ListChecks, CalendarDays,
  Grid2x2, ListOrdered, Brain, RotateCcw, Timer, Sparkles,
} from 'lucide-react';
import api from '../api';
import Avatar from '../components/Avatar';

const TOTAL_ETAPAS = 5;

// ─────────────────────────────────────────────────────────────
// 7 treinamentos fixos — conteúdo definido junto com o líder do time
// ─────────────────────────────────────────────────────────────
const TREINAMENTOS = [
  {
    id: 1, bloco: 1, icone: ListChecks, cor: '#E8681A',
    titulo: 'Como montar tarefas que funcionam',
    dica: {
      titulo: 'Por que isso importa',
      texto: 'Tarefa mal feita é trabalho que vai ter que ser refeito. Um time produtivo começa com tarefas claras — sem ambiguidade, sem margem para "achei que era outra coisa".',
      perguntas: [
        'O título começa com um verbo de ação?',
        'Existe um responsável único e um prazo real?',
        'Quem receber essa tarefa vai entender sem precisar perguntar?',
      ],
    },
    etapas: [
      { titulo: 'O que faz uma boa tarefa', texto: 'Uma boa tarefa tem: verbo de ação no título, descrição clara do resultado esperado, um único responsável, prazo definido e prioridade.' },
      { titulo: 'Como escrever o título certo', texto: "Use verbos: Enviar, Organizar, Ligar, Revisar, Conferir. Errado: 'Relatório'. Certo: 'Enviar relatório de vendas para o gerente até sexta'.", dica: 'Se você consegue ler o título e não sabe exatamente o que fazer, reescreva.' },
      { titulo: 'Prazo real x prazo desejo', texto: "Prazo desejo: 'assim que possível' ou 'urgente'. Prazo real: uma data específica. Sem data, a tarefa vai para o final da fila de todo mundo." },
      { titulo: 'Responsável único — sem dois donos', texto: 'Tarefa com dois responsáveis não tem dono. Cada um acha que o outro vai fazer. Defina um responsável e copie os demais se necessário.' },
      { titulo: 'Tarefa x Plano de ação: quando usar cada um', texto: 'Tarefa: ação simples e pontual do dia a dia. PDCA: problema recorrente que precisa de análise de causa e acompanhamento de resultado.', dica: 'Se o mesmo problema gera tarefas toda semana, é hora de abrir um Plano de Ação.' },
    ],
    praticar: { label: 'Ir para Tarefas e praticar', page: 'tarefas' },
  },
  {
    id: 2, bloco: 1, icone: CalendarDays, cor: '#60A5FA',
    titulo: 'Como montar sua agenda',
    dica: {
      titulo: 'Por que agenda é diferente de lista de tarefas',
      texto: 'Lista de tarefas é o que você precisa fazer. Agenda é quando você vai fazer. Sem horário reservado, a tarefa mais importante perde para o urgente do momento.',
      perguntas: [
        'Quais são minhas 3 prioridades de hoje?',
        'Reservei tempo na agenda para cada uma?',
        'Deixei 30 minutos para imprevisto?',
      ],
    },
    etapas: [
      { titulo: 'Por que ter uma agenda organizada', texto: 'Líder sem agenda é líder que apaga incêndio. A agenda transforma intenção em compromisso e protege o tempo do importante.' },
      { titulo: 'O que colocar na agenda', texto: 'Coloque: reuniões, rondas de loja, revisão de indicadores, devolutivas, treinamentos e horários de pico. Não coloque tudo — agenda lotada é agenda inútil.', dica: 'No máximo 3 compromissos críticos por dia. O resto é flexível.' },
      { titulo: 'Script de montagem — passo a passo', texto: '1) Revise as tarefas do dia, 2) Bloqueie tempo para prioridades, 3) Reserve 30min para imprevisto, 4) Confirme compromissos fixos da equipe.', dica: 'Monte sua agenda no final do dia anterior — você chega no dia seguinte já sabendo o que fazer.' },
      { titulo: 'Como vincular agenda com tarefas', texto: 'Toda tarefa com prazo hoje precisa de um horário reservado na agenda. Se não tem horário, não acontece.' },
      { titulo: 'Revisão semanal — o ritual da sexta', texto: 'Toda sexta: o que foi feito, o que ficou e por quê. Use para melhorar o planejamento da próxima semana.' },
    ],
    praticar: { label: 'Ir para Agenda e praticar', page: 'agenda' },
  },
  {
    id: 3, bloco: 2, icone: Grid2x2, cor: '#34D399',
    titulo: 'Matriz de Eisenhower — Urgente x Importante',
    dica: {
      titulo: 'Por que isso importa',
      texto: 'A maioria dos líderes passa o dia no quadrante errado — apagando incêndio (urgente e importante) e nunca chegando no que realmente transforma resultado (importante e não urgente).',
      perguntas: [],
    },
    etapas: [
      { titulo: 'Os 4 quadrantes', texto: 'Q1 Urgente + Importante: faça agora (crises, prazos críticos). Q2 Importante + Não urgente: agende (planejamento, treinamento, melhoria). Q3 Urgente + Não importante: delegue (interrupções, alguns e-mails). Q4 Não urgente + Não importante: elimine (distrações, reuniões inúteis).' },
      { titulo: 'Onde os líderes perdem mais tempo', texto: 'A maioria vive no Q1 e Q3. O segredo é investir tempo no Q2 — planejamento, treinamento e melhoria de processo — para que o Q1 encolha com o tempo.' },
      { titulo: 'Como classificar o que chega', texto: 'Quando chegar uma demanda, pergunte: isso é urgente? (precisa de resposta agora) E é importante? (impacta diretamente o resultado). A resposta define o quadrante.' },
      { titulo: 'Aplicando no dia a dia do varejo', texto: 'Ruptura inesperada = Q1. Treinar o time em reposição = Q2. Responder WhatsApp de fornecedor = Q3. Reorganizar arquivo de escalas antigas = Q4.', dica: 'Líderes de alto desempenho passam 60% do tempo no Q2.' },
      { titulo: 'Use a Matriz no Rota Líder', texto: 'Ao criar uma tarefa, classifique ela em um quadrante. Isso ajuda a priorizar o dia e a delegar o que não precisa ser você.' },
    ],
    praticar: { label: 'Ir para Tarefas e praticar', page: 'tarefas' },
  },
  {
    id: 4, bloco: 2, icone: ListOrdered, cor: '#E8A23A',
    titulo: 'Regra dos 3 — As 3 prioridades do dia',
    dica: {
      titulo: 'Por que isso importa',
      texto: 'Quem tem 10 prioridades não tem nenhuma. A Regra dos 3 força você a decidir o que realmente importa antes de começar o dia.',
      perguntas: [],
    },
    etapas: [
      { titulo: 'O que é a Regra dos 3', texto: 'Todo dia, antes de começar, escolha apenas 3 coisas que, se feitas, farão o dia ter valido a pena. Não 10. Não 5. Três.' },
      { titulo: 'Como escolher as 3 certas', texto: 'Pergunte: se eu só puder fazer 3 coisas hoje, quais terão maior impacto no resultado? Combine com a Matriz de Eisenhower — priorize Q1 e Q2.' },
      { titulo: 'As 3 e as tarefas do Rota Líder', texto: 'Marque as 3 tarefas do dia como prioridade no app. Elas ficam destacadas no topo da sua lista e lembram você do foco durante o dia.' },
      { titulo: 'E quando aparecer o imprevisto?', texto: 'Imprevisto faz parte. Avalie: esse imprevisto é mais importante que uma das minhas 3? Se sim, substitua. Se não, resolva rápido e volte ao foco.' },
      { titulo: 'Ritual diário', texto: 'Crie o hábito: toda manhã, antes de abrir qualquer mensagem, defina suas 3 prioridades. Leva menos de 2 minutos e transforma sua produtividade.' },
    ],
    praticar: { label: 'Ir para Tarefas e praticar', page: 'tarefas' },
  },
  {
    id: 5, bloco: 2, icone: Brain, cor: '#A78BFA',
    titulo: 'GTD Simplificado — Capturar, Organizar, Executar',
    dica: {
      titulo: 'Por que isso importa',
      texto: 'Líder com a cabeça cheia de coisas para lembrar comete erros e vive estressado. O GTD resolve isso: tira tudo da cabeça e coloca em um sistema confiável.',
      perguntas: [],
    },
    etapas: [
      { titulo: 'O problema que o GTD resolve', texto: 'Quando você tenta guardar tudo na cabeça, gasta energia mental desnecessária. O GTD libera sua mente para pensar, não para lembrar.' },
      { titulo: 'Capturar: tire tudo da cabeça', texto: 'Toda vez que surgir algo — uma ideia, uma pendência, uma demanda — anote imediatamente. Use as tarefas do Rota Líder como sua caixa de entrada. Não filtre agora, só capture.' },
      { titulo: 'Organizar: classifique o que capturou', texto: 'Para cada item capturado: é acionável? Se sim, vira tarefa com prazo e responsável. Se não, arquive ou delete. Se leva menos de 2 minutos, faça agora.' },
      { titulo: 'Executar: trabalhe no sistema, não na cabeça', texto: 'Abra o Rota Líder, veja suas tarefas organizadas e execute. Confie no sistema — não fique checando se esqueceu algo porque não esqueceu.' },
      { titulo: 'Revisão semanal: mantenha o sistema vivo', texto: 'Uma vez por semana, revise tudo: o que ficou pendente, o que pode ser deletado, o que precisa de prazo novo. Sistema sem revisão vira bagunça digital.' },
    ],
    praticar: { label: 'Ir para Tarefas e praticar', page: 'tarefas' },
  },
  {
    id: 6, bloco: 2, icone: RotateCcw, cor: '#F1685E',
    titulo: 'Revisão Semanal — O ritual da semana',
    dica: {
      titulo: 'Por que isso importa',
      texto: 'Líderes que fazem revisão semanal tomam decisões melhores na semana seguinte. É o momento de aprender com o que aconteceu e planejar com clareza o que vem.',
      perguntas: [],
    },
    etapas: [
      { titulo: 'Por que fazer revisão semanal', texto: '30 minutos na sexta valem mais que horas de retrabalho na próxima semana. Sem revisão, você repete os mesmos erros. Com revisão, você melhora a cada semana.' },
      { titulo: 'O que revisar: tarefas', texto: 'Abra o Rota Líder e revise: O que foi concluído? O que ficou pendente e por quê? Existe alguma tarefa que não faz mais sentido e pode ser deletada?' },
      { titulo: 'O que revisar: agenda', texto: 'Olhe para a semana que passou: o que estava planejado e não aconteceu? Por quê? O que roubou meu tempo sem gerar resultado?' },
      { titulo: 'Planejar a próxima semana', texto: 'Com base na revisão, planeje: quais são os 3 objetivos da próxima semana? Quais tarefas precisam ser criadas ou redistribuídas? Quais compromissos já estão na agenda?' },
      { titulo: 'Tornando isso um hábito', texto: 'Agende um bloco fixo toda sexta — 30 minutos antes de encerrar. Trate como reunião importante: não cancele, não adie. Sua produtividade da semana seguinte depende disso.' },
    ],
    praticar: { label: 'Ir para Agenda e praticar', page: 'agenda' },
  },
  {
    id: 7, bloco: 2, icone: Timer, cor: '#34D399',
    titulo: 'Técnica Pomodoro — Blocos de foco',
    dica: {
      titulo: 'Por que isso importa',
      texto: 'O maior inimigo da produtividade é a interrupção. O Pomodoro cria blocos protegidos de foco — 25 minutos onde você não atende nada, só executa.',
      perguntas: [],
    },
    etapas: [
      { titulo: 'O que é o Pomodoro', texto: 'Trabalhe 25 minutos focado em uma única tarefa. Depois, 5 minutos de pausa. A cada 4 ciclos, uma pausa maior de 15 a 30 minutos.' },
      { titulo: 'Por que funciona no varejo', texto: 'No chão de loja, interrupções são inevitáveis. O Pomodoro ensina você a criar janelas de foco mesmo em ambiente dinâmico — use nos momentos de menor movimento.' },
      { titulo: 'Como aplicar', texto: '1) Escolha uma tarefa. 2) Configure o timer para 25 minutos. 3) Trabalhe só naquela tarefa até o timer tocar. 4) Pause 5 minutos. 5) Repita.' },
      { titulo: 'E quando vier interrupção?', texto: 'Se a interrupção for urgente, pause o timer, resolva e retome. Se não for urgente, anote para depois e continue. Treine o time a respeitar seus blocos de foco.' },
      { titulo: 'Use com as tarefas do Rota Líder', texto: 'Antes de cada Pomodoro, abra a tarefa no Rota Líder e foque só nela durante os 25 minutos. Ao terminar, registre o progresso.' },
    ],
    praticar: { label: 'Ir para Tarefas e praticar', page: 'tarefas' },
  },
];

const BLOCOS = {
  1: { label: 'Ferramentas do Rota Líder', badge: 'Essencial', badgeCor: '#E8681A' },
  2: { label: 'Métodos de Produtividade',  badge: 'Avançado',  badgeCor: '#60A5FA' },
};

const CORES = ['#E8681A', '#60A5FA', '#34D399', '#E8A23A', '#A78BFA', '#F1685E'];

function fmtRelativo(iso) {
  if (!iso) return 'Nunca acessou';
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias <= 0) return 'Hoje';
  if (dias === 1) return 'Ontem';
  return `Há ${dias} dias`;
}
function diasDesde(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

// ─────────────────────────────────────────────────────────────
// Confete leve — sem dependência externa
// ─────────────────────────────────────────────────────────────
function Confetti() {
  const pecas = useMemo(() => Array.from({ length: 42 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.4,
    duration: 2.2 + Math.random() * 1.4,
    cor: CORES[i % CORES.length],
    rot: Math.random() * 360,
    size: 6 + Math.random() * 6,
  })), []);
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999, overflow: 'hidden' }}>
      <style>{`@keyframes confetti-fall { 0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; } 100% { transform: translateY(110vh) rotate(720deg); opacity: 0; } }`}</style>
      {pecas.map(p => (
        <div key={p.id} style={{
          position: 'absolute', top: 0, left: `${p.left}%`,
          width: p.size, height: p.size * 1.6, background: p.cor,
          animation: `confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
          borderRadius: 2,
        }} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
function DicaTreinamento({ dica, cor, storageKey }) {
  const [open, setOpen] = useState(() => !localStorage.getItem(storageKey));
  useEffect(() => { localStorage.setItem(storageKey, '1'); }, [storageKey]);

  return (
    <div style={{ borderRadius: 10, background: cor + '14', border: `1px solid ${cor}40`, overflow: 'hidden', marginBottom: 16 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <Lightbulb size={14} style={{ color: cor, flexShrink: 0 }}/>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: cor }}>{dica.titulo}</span>
        {open ? <ChevronUp size={14} style={{ color: cor }}/> : <ChevronDown size={14} style={{ color: cor }}/>}
      </button>
      {open && (
        <div style={{ padding: '0 12px 14px', fontSize: 12.5, color: 'var(--text)', lineHeight: 1.5 }}>
          <p style={{ margin: '0 0 10px', color: 'var(--text-muted)' }}>{dica.texto}</p>
          {dica.perguntas?.length > 0 && (
            <div>
              <div style={{ fontWeight: 700, color: cor, fontSize: 11, textTransform: 'uppercase', letterSpacing: .3, marginBottom: 4 }}>Perguntas guia</div>
              <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-muted)' }}>
                {dica.perguntas.map((q, i) => <li key={i} style={{ marginBottom: 2 }}>{q}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
function ProgressBar({ pct, cor }) {
  return (
    <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: cor, borderRadius: 3, transition: 'width .25s' }}/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
function TreinamentoCard({ t, progresso, onOpen }) {
  const p = progresso[t.id] || { etapa_atual: 0, concluido: false };
  const pct = Math.round(((p.etapa_atual || 0) / TOTAL_ETAPAS) * 100);
  const Icone = t.icone;
  const status = p.concluido ? 'Concluído' : p.etapa_atual > 0 ? 'Em andamento' : 'Não iniciado';
  const bloco = BLOCOS[t.bloco];

  return (
    <button onClick={() => onOpen(t.id)} style={{
      textAlign: 'left', background: 'var(--surface, #1B1F2A)', border: '1px solid var(--border, #262B38)',
      borderRadius: 12, padding: 16, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10,
      width: '100%',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: t.cor + '20',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icone size={19} style={{ color: t.cor }}/>
        </div>
        <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 999,
          background: bloco.badgeCor + '22', color: bloco.badgeCor, whiteSpace: 'nowrap' }}>{bloco.badge}</span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3 }}>{t.titulo}</div>
      <ProgressBar pct={pct} cor={t.cor}/>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5 }}>
        <span style={{ color: p.concluido ? '#34D399' : p.etapa_atual > 0 ? t.cor : 'var(--text-muted)', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 4 }}>
          {p.concluido ? <CheckCircle2 size={13}/> : <Circle size={13}/>}
          {status}
        </span>
        <span style={{ color: 'var(--text-muted)' }}>{p.etapa_atual || 0}/{TOTAL_ETAPAS}</span>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
function TreinamentoPlayer({ treinamento, progressoAtual, onVoltar, onSalvar, setPage }) {
  const maxEtapaSalva = progressoAtual?.etapa_atual || 0;
  const [etapaIndex, setEtapaIndex] = useState(() => Math.min(Math.max(maxEtapaSalva - (progressoAtual?.concluido ? 0 : 1), 0), TOTAL_ETAPAS - 1));
  const [showCongrats, setShowCongrats] = useState(false);
  const etapa = treinamento.etapas[etapaIndex];
  const isUltima = etapaIndex === TOTAL_ETAPAS - 1;

  const avancar = async () => {
    if (!isUltima) {
      const novoIndex = etapaIndex + 1;
      const novoAtual = Math.max(maxEtapaSalva, novoIndex + 1);
      setEtapaIndex(novoIndex);
      onSalvar(treinamento.id, novoAtual, false);
    } else {
      onSalvar(treinamento.id, TOTAL_ETAPAS, true);
      setShowCongrats(true);
    }
  };
  const voltarEtapa = () => { if (etapaIndex > 0) setEtapaIndex(i => i - 1); else onVoltar(); };

  if (showCongrats) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 16, padding: '40px 16px' }}>
        <Confetti/>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: treinamento.cor + '22',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <PartyPopper size={34} style={{ color: treinamento.cor }}/>
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Treinamento concluído!</div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 360 }}>
          Você concluiu <strong style={{ color: 'var(--text)' }}>{treinamento.titulo}</strong>. Agora é hora de colocar em prática.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button onClick={() => setPage(treinamento.praticar.page)} className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={15}/> {treinamento.praticar.label}
          </button>
          <button onClick={onVoltar} className="btn btn-ghost">Voltar aos treinamentos</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button onClick={voltarEtapa} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none',
        border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, marginBottom: 14, padding: 0 }}>
        <ChevronLeft size={16}/> {etapaIndex > 0 ? 'Etapa anterior' : 'Voltar aos treinamentos'}
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: treinamento.cor + '20',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <treinamento.icone size={17} style={{ color: treinamento.cor }}/>
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{treinamento.titulo}</div>
      </div>

      <DicaTreinamento dica={treinamento.dica} cor={treinamento.cor} storageKey={`produtividade_dica_vista_${treinamento.id}`}/>

      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
          <span>Etapa {etapaIndex + 1} de {TOTAL_ETAPAS}</span>
          <span>{Math.round(((etapaIndex + 1) / TOTAL_ETAPAS) * 100)}%</span>
        </div>
        <ProgressBar pct={((etapaIndex + 1) / TOTAL_ETAPAS) * 100} cor={treinamento.cor}/>
      </div>

      <div style={{ background: 'var(--surface, #1B1F2A)', border: '1px solid var(--border, #262B38)',
        borderRadius: 12, padding: 18, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: treinamento.cor, marginBottom: 8 }}>{etapa.titulo}</div>
        <p style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.6, margin: 0 }}>{etapa.texto}</p>
        {etapa.dica && (
          <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: treinamento.cor + '14',
            fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <Lightbulb size={13} style={{ color: treinamento.cor, flexShrink: 0, marginTop: 1 }}/>
            <span>{etapa.dica}</span>
          </div>
        )}
      </div>

      <button onClick={avancar} className="btn-primary" style={{ width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 8 }}>
        {isUltima ? 'Concluir treinamento' : 'Próxima etapa'} <ArrowRight size={15}/>
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
function TabTreinamentos({ userId, setPage }) {
  const [progresso, setProgresso] = useState({});
  const [loading, setLoading] = useState(true);
  const [abertoId, setAbertoId] = useState(null);

  const carregar = useCallback(async () => {
    try {
      const { data } = await api.get('/produtividade/progresso', { params: { requester_id: userId } });
      const map = {};
      (data || []).forEach(r => { map[r.treinamento_id] = r; });
      setProgresso(map);
    } catch {}
    setLoading(false);
  }, [userId]);

  useEffect(() => { carregar(); }, [carregar]);

  const salvarProgresso = async (treinamentoId, etapaAtual, concluido) => {
    setProgresso(p => ({ ...p, [treinamentoId]: { ...(p[treinamentoId] || {}), etapa_atual: etapaAtual, concluido, total_etapas: TOTAL_ETAPAS } }));
    try {
      await api.post('/produtividade/progresso', { requester_id: userId, treinamento_id: treinamentoId, etapa_atual: etapaAtual, concluido });
    } catch {}
  };

  if (loading) return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Carregando...</p>;

  if (abertoId) {
    const treinamento = TREINAMENTOS.find(t => t.id === abertoId);
    return (
      <TreinamentoPlayer
        treinamento={treinamento}
        progressoAtual={progresso[abertoId]}
        onVoltar={() => setAbertoId(null)}
        onSalvar={salvarProgresso}
        setPage={setPage}
      />
    );
  }

  return (
    <div>
      {[1, 2].map(bloco => (
        <div key={bloco} style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 999,
              background: BLOCOS[bloco].badgeCor + '22', color: BLOCOS[bloco].badgeCor }}>{BLOCOS[bloco].badge}</span>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', margin: 0 }}>{BLOCOS[bloco].label}</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {TREINAMENTOS.filter(t => t.bloco === bloco).map(t => (
              <TreinamentoCard key={t.id} t={t} progresso={progresso} onOpen={setAbertoId}/>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
function KpiMini({ label, value, cor }) {
  return (
    <div style={{ flex: '1 1 160px', background: 'var(--surface, #1B1F2A)', border: '1px solid var(--border, #262B38)',
      borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: cor }}>{value}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function TabPainelTime({ userId, company }) {
  const [time, setTime] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/produtividade/team', { params: { requester_id: userId, company } });
        setTime(data || []);
      } catch {}
      setLoading(false);
    })();
  }, [userId, company]);

  if (loading) return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Carregando...</p>;
  if (!time.length) return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nenhum colaborador encontrado.</p>;

  const concluiuAoMenos1 = time.filter(u => u.progresso.some(p => p.concluido)).length;
  const emAndamento      = time.filter(u => !u.progresso.some(p => p.concluido) && u.progresso.some(p => (p.etapa_atual || 0) > 0)).length;
  const semAcesso7d      = time.filter(u => { const d = diasDesde(u.ultimo_acesso); return d === null || d > 7; });
  const mediaGeral       = Math.round(time.reduce((a, u) => a + (u.pct_geral || 0), 0) / time.length);

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        <KpiMini label="Concluíram ao menos 1 treinamento" value={concluiuAoMenos1} cor="#34D399"/>
        <KpiMini label="Em andamento" value={emAndamento} cor="#E8681A"/>
        <KpiMini label="Sem acesso há +7 dias" value={semAcesso7d.length} cor="#F1685E"/>
        <KpiMini label="Média geral do time" value={`${mediaGeral}%`} cor="#F3F4F7"/>
      </div>

      {semAcesso7d.length > 0 && (
        <div style={{ background: '#F1685E14', border: '1px solid #F1685E40', borderRadius: 10,
          padding: '12px 14px', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <AlertTriangle size={15} style={{ color: '#F1685E' }}/>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#F1685E' }}>Colaboradores sem acesso recente</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {semAcesso7d.map(u => {
              const d = diasDesde(u.ultimo_acesso);
              return (
                <div key={u.id} style={{ fontSize: 12.5, color: 'var(--text)' }}>
                  <strong>{u.full_name}</strong> — {d === null ? 'nunca acessou' : `${d} dias sem acesso`}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {time.map(u => {
          const porTreinamento = {};
          u.progresso.forEach(p => { porTreinamento[p.treinamento_id] = p; });
          return (
            <div key={u.id} style={{ background: 'var(--surface, #1B1F2A)', border: '1px solid var(--border, #262B38)',
              borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
                <Avatar name={u.full_name} avatarUrl={u.avatar_url} size={38}/>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{u.full_name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{u.role || '—'} · Último acesso: {fmtRelativo(u.ultimo_acesso)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: u.pct_geral >= 70 ? '#34D399' : u.pct_geral >= 30 ? '#E8A23A' : '#F1685E' }}>{u.pct_geral}%</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>conclusão geral</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                {TREINAMENTOS.map(t => {
                  const p = porTreinamento[t.id];
                  const pct = Math.round(((p?.etapa_atual || 0) / TOTAL_ETAPAS) * 100);
                  return (
                    <div key={t.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 3 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }} title={t.titulo}>{t.titulo}</span>
                        <span>{pct}%</span>
                      </div>
                      <ProgressBar pct={pct} cor={t.cor}/>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
export default function Produtividade({ userId, profile, setPage }) {
  const canManage = ['admin', 'supervisor', 'master'].includes(profile?.access_level);
  const [tab, setTab] = useState('treinamentos');

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Gestão do Tempo e Produtividade</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
          Treinamentos práticos para organizar tarefas, agenda e prioridades do dia a dia.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        <button onClick={() => setTab('treinamentos')}
          style={{ background: 'none', border: 'none', borderBottom: tab === 'treinamentos' ? '2px solid #E8681A' : '2px solid transparent',
            color: tab === 'treinamentos' ? '#E8681A' : 'var(--text-muted)', fontWeight: tab === 'treinamentos' ? 700 : 400,
            fontSize: 13, padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          📚 Treinamentos
        </button>
        {canManage && (
          <button onClick={() => setTab('painel')}
            style={{ background: 'none', border: 'none', borderBottom: tab === 'painel' ? '2px solid #E8681A' : '2px solid transparent',
              color: tab === 'painel' ? '#E8681A' : 'var(--text-muted)', fontWeight: tab === 'painel' ? 700 : 400,
              fontSize: 13, padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            📊 Painel do time
          </button>
        )}
      </div>

      {tab === 'treinamentos'
        ? <TabTreinamentos userId={userId} setPage={setPage}/>
        : <TabPainelTime userId={userId} company={profile?.company}/>}
    </div>
  );
}
