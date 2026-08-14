import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Plus, Trash2, Check, Circle, ChevronRight, ChevronDown, ChevronUp, Target, AlertCircle, Flag, Clock, User, ToggleLeft, ToggleRight, CheckCircle2, Pencil, X, Lightbulb } from 'lucide-react';
import api from '../api';
import Avatar from '../components/Avatar';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';

const QUADRANTES = [
  { key: 'P', label: 'Planejar', color: '#E8681A' },
  { key: 'D', label: 'Fazer',    color: '#60A5FA' },
  { key: 'C', label: 'Checar',   color: '#34D399' },
  { key: 'A', label: 'Agir',     color: '#A78BFA' },
];

// ── Conteúdo educativo por quadrante ───────────────────────────
const DICAS = {
  P: {
    titulo: 'Como planejar bem — P do PDCA',
    intro: 'O P é a etapa mais importante. Um bom planejamento evita retrabalho e garante que você ataque a causa real do problema, não apenas o sintoma.',
    dicaRapida: 'Escreva a causa raiz do problema, não o sintoma — e já deixe uma meta com número e prazo.',
    exemplo: 'Ex: Identificar a causa raiz da ruptura de bebidas usando os 5 Porquês',
    passos: [
      { titulo: 'Identificação', texto: 'descreva o problema com dados — não "tem muita ruptura" mas "ruptura em 12% nas últimas 4 semanas na seção de bebidas".' },
      { titulo: 'Observação', texto: 'vá ao local, observe o processo, colete dados no campo antes de concluir a causa.' },
      { titulo: 'Análise', texto: 'use os 5 Porquês para chegar à causa raiz. Pergunte "por quê?" pelo menos 5 vezes.' },
      { titulo: 'Meta SMART', texto: 'defina uma meta Específica, Mensurável, Atingível, Relevante e com Prazo definido.' },
    ],
    perguntas: [
      'Qual é exatamente o problema? Tenho dados para comprovar?',
      'Qual é a causa raiz? (use os 5 Porquês)',
      'Minha meta é SMART? Tem número e prazo definido?',
    ],
    ferramentas: [
      { nome: '5 Porquês', desc: 'descubra a causa raiz perguntando "por quê?" 5 vezes' },
      { nome: 'Pareto', desc: 'identifique os 20% de causas que geram 80% do problema' },
      { nome: '5W2H', desc: 'O quê, Por quê, Onde, Quando, Quem, Como e Quanto custa' },
    ],
  },
  D: {
    titulo: 'Como executar bem — D do PDCA',
    intro: 'O D é onde o plano vira ação. Cada ação precisa ter um responsável claro, um prazo real e uma descrição que não deixe dúvida do que precisa ser feito.',
    dicaRapida: 'Descreva a ação como uma instrução clara: o quê fazer, e se possível como e onde.',
    exemplo: 'Ex: Repor a gôndola de bebidas a cada 2h durante o horário de pico',
    passos: [
      { titulo: '5W2H', texto: 'use pra montar cada ação: O quê será feito? Por quem? Onde? Quando? Por quê? Como? Quanto vai custar?' },
      { titulo: 'Delegue com clareza', texto: 'responsável único por ação. Tarefa com dois donos não tem dono.' },
      { titulo: 'Prazos realistas', texto: 'prazo impossível gera desmotivação. Prazo sem data não existe.' },
      { titulo: 'Acompanhe diariamente', texto: 'use as tarefas vinculadas do Rota Líder para monitorar o andamento.' },
    ],
    perguntas: [
      'Cada ação tem um responsável e um prazo definido?',
      'A descrição da ação é clara o suficiente para quem vai executar?',
      'Existe algum impedimento que pode travar a execução?',
    ],
    ferramentas: [
      { nome: '5W2H', desc: 'estrutura cada ação com todas as informações necessárias' },
      { nome: 'Cronograma', desc: 'organize as ações em sequência lógica de execução' },
      { nome: 'Tarefas do Rota Líder', desc: 'use o toggle para criar tarefa automática para o responsável' },
    ],
  },
  C: {
    titulo: 'Como verificar o resultado — C do PDCA',
    intro: 'O C é onde você compara o que planejou com o que aconteceu. Checar sem dados é achismo. Use números para avaliar cada ação.',
    dicaRapida: 'Descreva o que vai ser medido/comparado para provar se a ação do D funcionou.',
    exemplo: 'Ex: Comparar o índice de ruptura de bebidas antes e depois da reposição',
    passos: [
      { titulo: 'Ações COM resultado', texto: 'a ação foi executada e o indicador melhorou. Candidata a ser padronizada na etapa A.' },
      { titulo: 'Ações SEM resultado', texto: 'foi executada mas não gerou melhora. Revisar a causa raiz — talvez o problema seja outro.' },
      { titulo: 'Ações SEM conclusão', texto: 'não foi executada até o prazo. Entender o motivo e decidir se mantém, ajusta o prazo ou cancela.' },
    ],
    perguntas: [
      'O indicador melhorou em relação à meta definida no P?',
      'Quais ações funcionaram e quais não funcionaram?',
      'O problema foi resolvido ou apenas amenizado?',
    ],
    ferramentas: [
      { nome: 'Pareto', desc: 'veja quais ações tiveram maior impacto no resultado' },
      { nome: 'Histograma', desc: 'analise a distribuição dos resultados ao longo do tempo' },
      { nome: 'Gráfico sequencial', desc: 'compare resultado antes x depois das ações' },
    ],
  },
  A: {
    titulo: 'Como padronizar e melhorar — A do PDCA',
    intro: 'O A é onde você decide o que fazer com o que aprendeu. Se funcionou, padronize para virar rotina. Se não funcionou, ajuste e rode o ciclo de novo.',
    dicaRapida: 'Se deu certo, descreva como isso vira rotina (POP, comunicado, treinamento).',
    exemplo: 'Ex: Criar POP de reposição de bebidas e treinar o time de repositores',
    passos: [
      { titulo: 'Padronize o que funcionou', texto: 'crie um POP (Procedimento Operacional Padrão) para garantir que a melhoria se mantenha mesmo com troca de pessoas.' },
      { titulo: 'Comunique o time', texto: 'use os Comunicados do Rota Líder para informar a nova forma de trabalhar com confirmação de leitura.' },
      { titulo: 'Eduque e treine', texto: 'use o módulo de Treinamentos do Rota Líder para capacitar o time na nova rotina.' },
      { titulo: 'Monitore', texto: 'acompanhe o indicador nas próximas semanas para garantir que a melhoria se sustenta.' },
    ],
    naoFuncionou: 'Se não funcionou: volte ao P e reanalise a causa raiz. O PDCA não tem fim — é melhoria contínua.',
    perguntas: [
      'O que ficou padronizado para não regredir?',
      'O time foi comunicado e treinado na nova forma?',
      'Existe um próximo ciclo de melhoria a iniciar?',
    ],
    ferramentas: [
      { nome: 'POP (Procedimento Operacional Padrão)', desc: 'documente o processo correto' },
      { nome: 'Comunicados do Rota Líder', desc: 'comunique a mudança com confirmação de leitura' },
      { nome: 'Treinamentos do Rota Líder', desc: 'capacite o time na nova rotina' },
    ],
  },
};

// ── Caixa de dica colapsável — aberta na 1ª vez, fechada depois (localStorage) ──
function DicaBox({ quadrante, color }) {
  const storageKey = `pdca_dica_vista_${quadrante}`;
  const [open, setOpen] = useState(() => !localStorage.getItem(storageKey));
  const dica = DICAS[quadrante];

  useEffect(() => {
    localStorage.setItem(storageKey, '1');
  }, [storageKey]);

  if (!dica) return null;

  return (
    <div style={{ margin: '0 12px 10px', borderRadius: 10,
      background: color + '14', border: `1px solid ${color}40`, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <Lightbulb size={14} style={{ color, flexShrink: 0 }}/>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color }}>{dica.titulo}</span>
        {open ? <ChevronUp size={14} style={{ color, flexShrink: 0 }}/> : <ChevronDown size={14} style={{ color, flexShrink: 0 }}/>}
      </button>

      {open && (
        <div style={{ padding: '0 12px 14px', fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>
          <p style={{ margin: '0 0 10px', color: 'var(--text-muted)' }}>{dica.intro}</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {dica.passos.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 8 }}>
                <span style={{ flexShrink: 0, fontWeight: 800, color }}>{i + 1}.</span>
                <span><strong style={{ color: 'var(--text)' }}>{p.titulo}:</strong> {p.texto}</span>
              </div>
            ))}
          </div>

          {dica.naoFuncionou && (
            <p style={{ margin: '0 0 10px', padding: '8px 10px', borderRadius: 8,
              background: color + '20', color: 'var(--text)', fontSize: 11.5 }}>{dica.naoFuncionou}</p>
          )}

          <div style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 700, color, fontSize: 11, textTransform: 'uppercase', letterSpacing: .3, marginBottom: 4 }}>Perguntas guia</div>
            <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-muted)' }}>
              {dica.perguntas.map((q, i) => <li key={i} style={{ marginBottom: 2 }}>{q}</li>)}
            </ul>
          </div>

          <div>
            <div style={{ fontWeight: 700, color, fontSize: 11, textTransform: 'uppercase', letterSpacing: .3, marginBottom: 4 }}>Ferramentas sugeridas</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {dica.ferramentas.map((f, i) => (
                <div key={i} style={{ color: 'var(--text-muted)' }}>
                  <strong style={{ color: 'var(--text)' }}>{f.nome}</strong> — {f.desc}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Calcula status de prazo de uma ação ──────────────────────────
function prazoInfo(prazo) {
  if (!prazo) return null;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const [y, m, d] = prazo.split('-').map(Number);
  const dataPrazo = new Date(y, m - 1, d);
  const diffDias = Math.round((dataPrazo - hoje) / 86400000);
  if (diffDias < 0) return { cor: '#ef4444', icone: '🔴', texto: `Atrasada ${Math.abs(diffDias)} dia${Math.abs(diffDias) > 1 ? 's' : ''}` };
  if (diffDias <= 7) return { cor: '#f59e0b', icone: '⏰', texto: diffDias === 0 ? 'Vence hoje' : `Vence em ${diffDias} dia${diffDias > 1 ? 's' : ''}` };
  return { cor: '#34D399', icone: null, texto: null };
}

const EMPTY_PLANO  = { titulo: '', problema: '', meta: '', prazo_final: '' };
const EMPTY_ACAO    = { descricao: '', responsavel_id: '', prazo: '', criar_tarefa: true };
const EMPTY_ACAO_P  = { problema: '', porques: ['', '', '', '', ''], meta_smart: '' };
const EMPTY_ACAO_C  = { descricao: '', resultado: '', classificacao: '', responsavel_id: '', prazo: '', criar_tarefa: true };

const CLASSIFICACOES_C = [
  { key: 'com_resultado', label: 'Com resultado', cor: '#10b981', emoji: '✅', desc: 'melhorou — candidata a padronizar no A' },
  { key: 'sem_resultado', label: 'Sem resultado', cor: '#f59e0b', emoji: '⚠️', desc: 'executada mas não melhorou — revisar causa raiz' },
  { key: 'sem_conclusao', label: 'Sem conclusão', cor: '#6b7280', emoji: '⏳', desc: 'não foi executada até o prazo' },
];

function ProgressBar({ value, color = '#E8681A' }) {
  return (
    <div style={{ height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden', width: '100%' }}>
      <div style={{ height: '100%', width: `${value}%`, background: color, borderRadius: 99, transition: 'width .3s' }}/>
    </div>
  );
}

export default function PlanoAcao({ userId, profile }) {
  const toast = useToast();
  const company     = profile?.company;
  const canManage   = ['admin', 'supervisor', 'master'].includes(profile?.access_level);

  // ── Views ────────────────────────────────────────────────
  const [view, setView]             = useState('list');
  const [selectedPlan, setSelected] = useState(null);

  // ── List state ───────────────────────────────────────────
  const [plans, setPlans]           = useState([]);
  const [filterStatus, setFilter]   = useState('todos');
  const [loadingList, setLoadList]  = useState(false);

  // ── Detail state ─────────────────────────────────────────
  const [acoes, setAcoes]           = useState([]);
  const [loadingAcoes, setLoadAcoes] = useState(false);
  const [membros, setMembros]       = useState([]);

  // ── Modais e formulários ─────────────────────────────────
  const [modalPlano, setModalPlano]     = useState(false);
  const [editingPlano, setEditingPlano] = useState(null);
  const [formPlano, setFormPlano]       = useState(EMPTY_PLANO);
  const [savingPlano, setSavingPlano]   = useState(false);

  const [addingTo, setAddingTo]     = useState(null); // 'P'|'D'|'C'|'A'
  const [editingAcao, setEditingAcao] = useState(null);
  const [formAcao, setFormAcao]     = useState(EMPTY_ACAO);
  const [savingAcao, setSavingAcao] = useState(false);

  // ── Fetch plans ──────────────────────────────────────────
  const fetchPlans = useCallback(async () => {
    setLoadList(true);
    try {
      const { data } = await api.get(`/pdca?requester_id=${userId}&company=${company || ''}`);
      setPlans(data || []);
    } catch { toast('Erro ao carregar planos'); }
    finally { setLoadList(false); }
  }, [userId, company]);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  // ── Fetch acoes for selected plan ────────────────────────
  const fetchAcoes = useCallback(async (planId) => {
    setLoadAcoes(true);
    try {
      const { data } = await api.get(`/pdca/${planId}/acoes?requester_id=${userId}`);
      setAcoes(data || []);
    } catch { toast('Erro ao carregar ações'); }
    finally { setLoadAcoes(false); }
  }, [userId]);

  // ── Fetch membros ────────────────────────────────────────
  const fetchMembros = useCallback(async () => {
    if (!canManage) return;
    try {
      const { data } = await api.get(`/admin/users?requester_id=${userId}&company=${company || ''}`);
      setMembros([{ id: userId, full_name: profile?.full_name, avatar_url: profile?.avatar_url }, ...(data || []).filter(u => u.active !== false)]);
    } catch {}
  }, [userId, company, canManage]);

  // ── Open plan detail ─────────────────────────────────────
  const openPlan = (plan) => {
    setSelected(plan);
    setView('detail');
    fetchAcoes(plan.id);
    fetchMembros();
  };

  // ── Check for deep-link from Tarefas ─────────────────────
  useEffect(() => {
    const openId = localStorage.getItem('pdca_open_plan');
    if (openId && plans.length > 0) {
      localStorage.removeItem('pdca_open_plan');
      const plan = plans.find(p => p.id === openId);
      if (plan) openPlan(plan);
    }
  }, [plans]);

  // ── Save plan ─────────────────────────────────────────────
  const savePlano = async () => {
    if (!formPlano.titulo.trim()) return toast('Título obrigatório');
    setSavingPlano(true);
    try {
      if (editingPlano) {
        const { data } = await api.put(`/pdca/${editingPlano.id}`, { requester_id: userId, ...formPlano });
        setPlans(ps => ps.map(p => p.id === data.id ? { ...p, ...data } : p));
        if (selectedPlan?.id === data.id) setSelected(prev => ({ ...prev, ...data }));
      } else {
        const { data } = await api.post('/pdca', { requester_id: userId, ...formPlano, company });
        setPlans(ps => [data, ...ps]);
      }
      setModalPlano(false);
      setEditingPlano(null);
      setFormPlano(EMPTY_PLANO);
    } catch (e) { toast('Erro ao salvar plano: ' + (e?.response?.data?.error || e.message)); }
    finally { setSavingPlano(false); }
  };

  const openEditPlano = (plan) => {
    setEditingPlano(plan);
    setFormPlano({ titulo: plan.titulo, problema: plan.problema || '', meta: plan.meta || '', prazo_final: plan.prazo_final || '' });
    setModalPlano(true);
  };

  const toggleStatusPlano = async (plan) => {
    const novoStatus = plan.status === 'andamento' ? 'concluido' : 'andamento';
    try {
      const { data } = await api.put(`/pdca/${plan.id}`, { requester_id: userId, status: novoStatus });
      setPlans(ps => ps.map(p => p.id === data.id ? { ...p, ...data } : p));
      if (selectedPlan?.id === data.id) setSelected(prev => ({ ...prev, status: novoStatus }));
    } catch { toast('Erro ao alterar status'); }
  };

  const deletePlano = async (plan) => {
    if (!window.confirm(`Excluir o plano "${plan.titulo}" e todas as suas ações?`)) return;
    try {
      await api.delete(`/pdca/${plan.id}?requester_id=${userId}`);
      setPlans(ps => ps.filter(p => p.id !== plan.id));
      if (selectedPlan?.id === plan.id) { setView('list'); setSelected(null); }
      toast('Plano excluído');
    } catch { toast('Erro ao excluir plano'); }
  };

  // ── Save ação ────────────────────────────────────────────
  // No quadrante P a ação é uma ferramenta de planejamento (Problema/Causa raiz/
  // Meta), não uma tarefa delegável — os 3 campos viram um único texto salvo
  // em "descricao" (não exige mudança no banco).
  const composeDescricaoP = (f) => {
    const partes = [];
    if (f.problema?.trim()) partes.push(`Problema: ${f.problema.trim()}`);
    const porquesPreenchidos = (f.porques || []).map(p => p.trim()).filter(Boolean);
    if (porquesPreenchidos.length) {
      partes.push(`Causa raiz (5 Porquês):\n${porquesPreenchidos.map((p, i) => `${i + 1}) ${p}`).join('\n')}`);
    }
    if (f.meta_smart?.trim()) partes.push(`Meta: ${f.meta_smart.trim()}`);
    return partes.join('\n');
  };

  // No quadrante C, a classificação + resultado observado entram junto na
  // descrição (mesmo motivo: sem precisar mudar o banco).
  const composeDescricaoC = (f) => {
    const partes = [];
    const cls = CLASSIFICACOES_C.find(c => c.key === f.classificacao);
    if (cls) partes.push(`${cls.emoji} ${cls.label.toUpperCase()}`);
    if (f.descricao?.trim()) partes.push(f.descricao.trim());
    if (f.resultado?.trim()) partes.push(`Resultado observado: ${f.resultado.trim()}`);
    return partes.join('\n');
  };

  const saveAcao = async () => {
    const quadranteAtual = editingAcao ? editingAcao.quadrante : addingTo;
    const isP = quadranteAtual === 'P';
    const isC = quadranteAtual === 'C';
    const payload = isP
      ? { descricao: composeDescricaoP(formAcao) }
      : isC
      ? { descricao: composeDescricaoC(formAcao), responsavel_id: formAcao.responsavel_id, prazo: formAcao.prazo, criar_tarefa: formAcao.criar_tarefa }
      : formAcao;

    if (!payload.descricao?.trim()) return toast(isP ? 'Preencha ao menos o problema' : 'Descrição obrigatória');
    setSavingAcao(true);
    try {
      if (editingAcao) {
        const { data } = await api.put(`/pdca/acoes/${editingAcao.id}`, { requester_id: userId, ...payload });
        setAcoes(as => as.map(a => a.id === data.id ? data : a));
        setEditingAcao(null);
      } else {
        const { data } = await api.post(`/pdca/${selectedPlan.id}/acoes`, {
          requester_id: userId, quadrante: addingTo, ...payload,
        });
        setAcoes(as => [...as, data]);
      }
      setAddingTo(null);
      setFormAcao(isP ? EMPTY_ACAO_P : isC ? EMPTY_ACAO_C : EMPTY_ACAO);
      // Atualiza stats do plano selecionado
      fetchAcoes(selectedPlan.id);
    } catch (e) { toast('Erro ao salvar ação: ' + (e?.response?.data?.error || e.message)); }
    finally { setSavingAcao(false); }
  };

  const toggleAcao = async (acao) => {
    try {
      const { data } = await api.put(`/pdca/acoes/${acao.id}`, { requester_id: userId, concluida: !acao.concluida });
      setAcoes(as => as.map(a => a.id === data.id ? data : a));
    } catch { toast('Erro ao atualizar ação'); }
  };

  const deleteAcao = async (acao) => {
    try {
      await api.delete(`/pdca/acoes/${acao.id}?requester_id=${userId}`);
      setAcoes(as => as.filter(a => a.id !== acao.id));
    } catch { toast('Erro ao excluir ação'); }
  };

  // ── Computed ─────────────────────────────────────────────
  const filteredPlans = plans.filter(p =>
    filterStatus === 'todos' ? true :
    filterStatus === 'andamento' ? p.status === 'andamento' :
    p.status === 'concluido'
  );

  const acoesByQ = { P: [], D: [], C: [], A: [] };
  acoes.forEach(a => { if (acoesByQ[a.quadrante]) acoesByQ[a.quadrante].push(a); });
  const totalAcoes  = acoes.length;
  const acoesFeitas = acoes.filter(a => a.concluida).length;
  const progress    = totalAcoes > 0 ? Math.round((acoesFeitas / totalAcoes) * 100) : 0;

  const formatDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '';
  const membroById = (id) => membros.find(m => m.id === id);

  // ── Render ───────────────────────────────────────────────

  if (view === 'detail' && selectedPlan) {
    return (
      <div style={{ padding: '24px 20px', maxWidth: 1200, margin: '0 auto' }}>
        {/* Header do plano */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button onClick={() => { setView('list'); setSelected(null); fetchPlans(); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
            <ArrowLeft size={16}/> Voltar
          </button>
        </div>

        <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '20px 24px', border: '1px solid var(--border)', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <Target size={20} style={{ color: '#E8681A', flexShrink: 0 }}/>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', margin: 0 }}>{selectedPlan.titulo}</h2>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8,
                  background: selectedPlan.status === 'concluido' ? '#10b98122' : '#E8681A22',
                  color: selectedPlan.status === 'concluido' ? '#10b981' : '#E8681A' }}>
                  {selectedPlan.status === 'concluido' ? '✓ Concluído' : 'Em andamento'}
                </span>
              </div>

              {selectedPlan.problema && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 4 }}>
                  <AlertCircle size={13} style={{ color: 'var(--text-muted)', marginTop: 2, flexShrink: 0 }}/>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}><strong>Problema:</strong> {selectedPlan.problema}</span>
                </div>
              )}
              {selectedPlan.meta && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 4 }}>
                  <Flag size={13} style={{ color: 'var(--text-muted)', marginTop: 2, flexShrink: 0 }}/>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}><strong>Meta:</strong> {selectedPlan.meta}</span>
                </div>
              )}
              {selectedPlan.prazo_final && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                  <Clock size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }}/>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}><strong>Prazo:</strong> {formatDate(selectedPlan.prazo_final)}</span>
                </div>
              )}
            </div>

            {canManage && (
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button onClick={() => openEditPlano(selectedPlan)}
                  className="btn-secondary" style={{ fontSize: 13, padding: '6px 12px' }}>
                  <Pencil size={14}/> Editar
                </button>
                <button onClick={() => toggleStatusPlano(selectedPlan)}
                  className="btn-secondary" style={{ fontSize: 13, padding: '6px 12px',
                    background: selectedPlan.status === 'concluido' ? '#6366f122' : '#10b98122',
                    color: selectedPlan.status === 'concluido' ? '#6366f1' : '#10b981', border: 'none' }}>
                  {selectedPlan.status === 'concluido' ? '↺ Reabrir' : '✓ Concluir'}
                </button>
                <button onClick={() => deletePlano(selectedPlan)}
                  className="btn-icon" style={{ color: '#ef4444' }} title="Excluir plano">
                  <Trash2 size={16}/>
                </button>
              </div>
            )}
          </div>

          {/* Barra de progresso */}
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, color: 'var(--text-muted)' }}>
              <span>Progresso geral</span>
              <strong style={{ color: progress === 100 ? '#10b981' : '#E8681A' }}>{progress}% ({acoesFeitas}/{totalAcoes} ações)</strong>
            </div>
            <ProgressBar value={progress} color={progress === 100 ? '#10b981' : '#E8681A'}/>
          </div>
        </div>

        {/* Grid 2×2 dos quadrantes */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          {QUADRANTES.map(q => (
            <div key={q.key} style={{ background: 'var(--surface)', borderRadius: 14, border: `1px solid var(--border)`,
              borderTop: `3px solid ${q.color}`, overflow: 'hidden' }}>
              {/* Cabeçalho do quadrante */}
              <div style={{ padding: '14px 16px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: q.color + '22',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 900, fontSize: 14, color: q.color }}>
                    {q.key}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: q.color }}>{q.key} — {q.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {acoesByQ[q.key].filter(a => a.concluida).length}/{acoesByQ[q.key].length} concluídas
                    </div>
                  </div>
                </div>
                {canManage && (
                  <button onClick={() => { setAddingTo(q.key); setFormAcao(q.key === 'P' ? EMPTY_ACAO_P : q.key === 'C' ? EMPTY_ACAO_C : EMPTY_ACAO); }}
                    style={{ background: q.color + '22', border: 'none', borderRadius: 8, color: q.color,
                      cursor: 'pointer', padding: '4px 10px', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Plus size={13}/> Ação
                  </button>
                )}
              </div>

              {/* Dica educativa */}
              <DicaBox quadrante={q.key} color={q.color}/>

              {/* Lista de ações */}
              <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {loadingAcoes ? (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8 }}>Carregando...</div>
                ) : acoesByQ[q.key].length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8, textAlign: 'center' }}>
                    Nenhuma ação ainda
                  </div>
                ) : acoesByQ[q.key].map(acao => (
                  <AcaoCard
                    key={acao.id}
                    acao={acao}
                    color={q.color}
                    canManage={canManage}
                    membros={membros}
                    userId={userId}
                    formatDate={formatDate}
                    onToggle={() => toggleAcao(acao)}
                    onEdit={() => {
                      setEditingAcao(acao);
                      setAddingTo(acao.quadrante);
                      if (acao.quadrante === 'P') {
                        // O texto salvo é um bloco único; não dá pra separar de volta
                        // com certeza, então recarrega tudo no campo "Problema".
                        setFormAcao({ ...EMPTY_ACAO_P, problema: acao.descricao });
                      } else if (acao.quadrante === 'C') {
                        setFormAcao({
                          ...EMPTY_ACAO_C,
                          descricao: acao.descricao,
                          responsavel_id: acao.responsavel_id || '',
                          prazo: acao.prazo || '',
                          criar_tarefa: acao.criar_tarefa !== false,
                        });
                      } else {
                        setFormAcao({
                          descricao: acao.descricao,
                          responsavel_id: acao.responsavel_id || '',
                          prazo: acao.prazo || '',
                          criar_tarefa: acao.criar_tarefa !== false,
                        });
                      }
                    }}
                    onDelete={() => deleteAcao(acao)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Modal de adicionar/editar ação */}
        <Modal open={!!addingTo} onClose={() => { setAddingTo(null); setEditingAcao(null); setFormAcao(EMPTY_ACAO); }}
          title={editingAcao ? 'Editar ação' : `Adicionar ação — ${addingTo} · ${QUADRANTES.find(q => q.key === addingTo)?.label}`}>
          <AcaoForm
            form={formAcao}
            setForm={setFormAcao}
            membros={membros}
            saving={savingAcao}
            hasTask={!!editingAcao?.tarefa_id}
            onSave={saveAcao}
            quadrante={addingTo}
          />
        </Modal>

        {/* Modal editar plano */}
        <Modal open={modalPlano} onClose={() => { setModalPlano(false); setEditingPlano(null); setFormPlano(EMPTY_PLANO); }}
          title={editingPlano ? 'Editar plano' : 'Novo plano de ação'}>
          <PlanoForm form={formPlano} setForm={setFormPlano} saving={savingPlano} onSave={savePlano}/>
        </Modal>
      </div>
    );
  }

  // ── LIST VIEW ─────────────────────────────────────────────
  return (
    <div style={{ padding: '24px 20px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Plano de Ação</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>Metodologia PDCA — Planejar, Fazer, Checar, Agir</p>
        </div>
        {canManage && (
          <button className="btn-primary" onClick={() => { setModalPlano(true); setEditingPlano(null); setFormPlano(EMPTY_PLANO); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={16}/> Novo plano
          </button>
        )}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[['todos', 'Todos'], ['andamento', 'Em andamento'], ['concluido', 'Concluídos']].map(([val, label]) => (
          <button key={val} onClick={() => setFilter(val)}
            style={{ padding: '6px 14px', borderRadius: 20, border: '1px solid var(--border)',
              background: filterStatus === val ? '#E8681A' : 'var(--surface)',
              color: filterStatus === val ? '#fff' : 'var(--text-muted)',
              fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Lista de planos */}
      {loadingList ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Carregando...</div>
      ) : filteredPlans.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 60 }}>
          <Target size={40} style={{ opacity: .3, marginBottom: 12 }}/>
          <div style={{ fontWeight: 700 }}>Nenhum plano encontrado</div>
          {canManage && <div style={{ fontSize: 13, marginTop: 4 }}>Crie o primeiro plano de ação</div>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredPlans.map(plan => {
            const prog = plan.total_acoes > 0 ? Math.round((plan.acoes_concluidas / plan.total_acoes) * 100) : 0;
            return (
              <div key={plan.id} style={{ background: 'var(--surface)', borderRadius: 14, padding: '18px 20px',
                border: '1px solid var(--border)', cursor: 'pointer', transition: 'border-color .15s' }}
                onClick={() => openPlan(plan)}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#E8681A66'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{plan.titulo}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 8,
                        background: plan.status === 'concluido' ? '#10b98122' : '#E8681A22',
                        color: plan.status === 'concluido' ? '#10b981' : '#E8681A' }}>
                        {plan.status === 'concluido' ? '✓ Concluído' : 'Em andamento'}
                      </span>
                    </div>
                    {plan.meta && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                        🎯 {plan.meta}
                      </div>
                    )}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                        <span>Progresso</span>
                        <strong style={{ color: prog === 100 ? '#10b981' : 'var(--text)' }}>{prog}% ({plan.acoes_concluidas}/{plan.total_acoes})</strong>
                      </div>
                      <ProgressBar value={prog} color={prog === 100 ? '#10b981' : '#E8681A'}/>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {plan.responsaveis.slice(0, 5).map((r, i) => (
                          <Avatar key={r.id} name={r.full_name} avatarUrl={r.avatar_url} size={24}
                            style={{ marginLeft: i > 0 ? -6 : 0, zIndex: 5 - i }}/>
                        ))}
                        {plan.responsaveis.length > 5 && (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>+{plan.responsaveis.length - 5}</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: 'var(--text-muted)' }}>
                        {plan.prazo_final && <span>📅 {formatDate(plan.prazo_final)}</span>}
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>Ver plano <ChevronRight size={12}/></span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal novo/editar plano */}
      <Modal open={modalPlano} onClose={() => { setModalPlano(false); setFormPlano(EMPTY_PLANO); }}
        title="Novo plano de ação">
        <PlanoForm form={formPlano} setForm={setFormPlano} saving={savingPlano} onSave={savePlano}/>
      </Modal>
    </div>
  );
}

// ── Sub-componentes ───────────────────────────────────────────

function PlanoForm({ form, setForm, saving, onSave }) {
  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="form-group">
        <label className="form-label">Título do plano *</label>
        <input className="input" value={form.titulo} onChange={f('titulo')} placeholder="Ex: Reduzir ruptura no setor de bebidas"/>
      </div>
      <div className="form-group">
        <label className="form-label">Problema identificado</label>
        <textarea className="input" rows={2} value={form.problema} onChange={f('problema')}
          placeholder="Descreva o problema a ser resolvido..." style={{ resize: 'vertical' }}/>
      </div>
      <div className="form-group">
        <label className="form-label">Meta</label>
        <input className="input" value={form.meta} onChange={f('meta')} placeholder="Ex: Reduzir ruptura de 12% para menos de 5%"/>
      </div>
      <div className="form-group">
        <label className="form-label">Prazo final</label>
        <input className="input" type="date" value={form.prazo_final} onChange={f('prazo_final')}/>
      </div>
      <button className="btn-primary" onClick={onSave} disabled={saving}>
        {saving ? 'Salvando...' : 'Salvar plano'}
      </button>
    </div>
  );
}

function AcaoForm(props) {
  if (props.quadrante === 'P') return <AcaoFormPlanejar {...props}/>;
  if (props.quadrante === 'C') return <AcaoFormChecar {...props}/>;
  return <AcaoFormPadrao {...props}/>;
}

// P — Planejar: ferramenta de análise (Problema / Causa raiz / Meta),
// sem responsável/prazo/tarefa — planejamento não é uma tarefa delegável.
function AcaoFormPlanejar({ form, setForm, saving, onSave }) {
  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));
  const q = QUADRANTES.find(x => x.key === 'P');
  const dica = DICAS.P;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px',
        borderRadius: 8, background: q.color + '14', border: `1px solid ${q.color}40` }}>
        <Lightbulb size={14} style={{ color: q.color, flexShrink: 0, marginTop: 1 }}/>
        <span style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.4 }}>{dica.dicaRapida}</span>
      </div>

      <div className="form-group">
        <label className="form-label">Problema identificado (com dados) *</label>
        <textarea className="input" rows={2} value={form.problema} onChange={f('problema')}
          placeholder='Ex: Ruptura em 12% nas últimas 4 semanas na seção de bebidas' style={{ resize: 'vertical' }}/>
      </div>
      <div className="form-group">
        <label className="form-label">Causa raiz — 5 Porquês</label>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
          Pergunte "por quê?" a cada resposta, até chegar na causa real.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {form.porques.map((valor, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: q.color + '22',
                color: q.color, fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {i + 1}
              </span>
              <input className="input" value={valor}
                onChange={e => setForm(p => {
                  const next = [...p.porques];
                  next[i] = e.target.value;
                  return { ...p, porques: next };
                })}
                placeholder={i === 0 ? 'Por que isso acontece?' : 'Por quê?'}/>
            </div>
          ))}
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Meta SMART</label>
        <input className="input" value={form.meta_smart} onChange={f('meta_smart')}
          placeholder='Ex: Reduzir ruptura de 12% para 5% em 30 dias'/>
      </div>

      <button className="btn-primary" onClick={onSave} disabled={saving}>
        {saving ? 'Salvando...' : 'Salvar planejamento'}
      </button>
    </div>
  );
}

// D / C / A — ação delegável de verdade: responsável, prazo, tarefa vinculada
function AcaoFormPadrao({ form, setForm, membros, saving, hasTask, onSave, quadrante }) {
  const f = (k) => (e) => setForm(p => ({ ...p, [k]: typeof e === 'object' && e.target ? e.target.value : e }));
  const podeToggleTarefa = !hasTask;
  const q = QUADRANTES.find(x => x.key === quadrante);
  const dica = DICAS[quadrante];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {dica && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px',
          borderRadius: 8, background: (q?.color || '#E8681A') + '14', border: `1px solid ${(q?.color || '#E8681A')}40` }}>
          <Lightbulb size={14} style={{ color: q?.color || '#E8681A', flexShrink: 0, marginTop: 1 }}/>
          <span style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.4 }}>{dica.dicaRapida}</span>
        </div>
      )}
      <div className="form-group">
        <label className="form-label">Descrição da ação *</label>
        <textarea className="input" rows={2} value={form.descricao} onChange={f('descricao')}
          placeholder={dica?.exemplo || 'O que precisa ser feito?'} style={{ resize: 'vertical' }}/>
      </div>
      <ResponsavelPrazoTarefa form={form} setForm={setForm} membros={membros} podeToggleTarefa={podeToggleTarefa}/>

      <button className="btn-primary" onClick={onSave} disabled={saving}>
        {saving ? 'Salvando...' : 'Salvar ação'}
      </button>
    </div>
  );
}

// Bloco reutilizável: Responsável + Prazo + toggle "criar tarefa automaticamente"
function ResponsavelPrazoTarefa({ form, setForm, membros, podeToggleTarefa }) {
  return (
    <>
      <div className="form-group">
        <label className="form-label">Responsável</label>
        <select className="input" value={form.responsavel_id} onChange={e => setForm(p => ({ ...p, responsavel_id: e.target.value }))}>
          <option value="">— sem responsável —</option>
          {membros.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Prazo</label>
        <input className="input" type="date" value={form.prazo} onChange={e => setForm(p => ({ ...p, prazo: e.target.value }))}/>
      </div>

      {podeToggleTarefa ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--surface-2, #262B38)', borderRadius: 10, padding: '10px 14px' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Criar tarefa automaticamente</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {form.responsavel_id && form.prazo ? 'Tarefa será criada ao salvar' : 'Preencha responsável e prazo para ativar'}
            </div>
          </div>
          <button onClick={() => setForm(p => ({ ...p, criar_tarefa: !p.criar_tarefa }))}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: form.criar_tarefa ? '#E8681A' : 'var(--text-muted)' }}>
            {form.criar_tarefa ? <ToggleRight size={28}/> : <ToggleLeft size={28}/>}
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: '#10b981', background: '#10b98115', borderRadius: 8, padding: '8px 12px' }}>
          ✓ Tarefa já criada para esta ação
        </div>
      )}
    </>
  );
}

// C — Checar: o que foi verificado, resultado observado (com dados) e
// classificação (Com resultado / Sem resultado / Sem conclusão)
function AcaoFormChecar({ form, setForm, membros, saving, hasTask, onSave }) {
  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));
  const podeToggleTarefa = !hasTask;
  const q = QUADRANTES.find(x => x.key === 'C');
  const dica = DICAS.C;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px',
        borderRadius: 8, background: q.color + '14', border: `1px solid ${q.color}40` }}>
        <Lightbulb size={14} style={{ color: q.color, flexShrink: 0, marginTop: 1 }}/>
        <span style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.4 }}>{dica.dicaRapida}</span>
      </div>

      <div className="form-group">
        <label className="form-label">O que foi verificado *</label>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
          Qual ação (do D) você está avaliando? Quais ações funcionaram e quais não funcionaram?
        </div>
        <textarea className="input" rows={4} value={form.descricao} onChange={f('descricao')}
          placeholder={dica.exemplo} style={{ resize: 'vertical' }}/>
      </div>

      <div className="form-group">
        <label className="form-label">Resultado observado (com dados)</label>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
          O indicador melhorou em relação à meta definida no P? Compare o antes x depois com números.
        </div>
        <textarea className="input" rows={4} value={form.resultado} onChange={f('resultado')}
          placeholder="Ex: Ruptura caiu de 12% para 6% na seção de bebidas (meta era 5%)" style={{ resize: 'vertical' }}/>
      </div>

      <div className="form-group">
        <label className="form-label">Classificação</label>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
          O problema foi resolvido, apenas amenizado, ou nem chegou a ser concluído?
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {CLASSIFICACOES_C.map(c => (
            <button key={c.key} type="button"
              onClick={() => setForm(p => ({ ...p, classificacao: p.classificacao === c.key ? '' : c.key }))}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10,
                fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'left',
                border: `2px solid ${form.classificacao === c.key ? c.cor : 'var(--border)'}`,
                background: form.classificacao === c.key ? c.cor + '18' : 'transparent',
                color: form.classificacao === c.key ? c.cor : 'var(--text)',
              }}>
              <span style={{ fontSize: 16 }}>{c.emoji}</span>
              <span style={{ flex: 1 }}>{c.label}</span>
              <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>{c.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }}/>

      <ResponsavelPrazoTarefa form={form} setForm={setForm} membros={membros} podeToggleTarefa={podeToggleTarefa}/>

      <button className="btn-primary" onClick={onSave} disabled={saving}>
        {saving ? 'Salvando...' : 'Salvar verificação'}
      </button>
    </div>
  );
}

function AcaoCard({ acao, color, canManage, formatDate, onToggle, onEdit, onDelete }) {
  return (
    <div style={{ background: 'var(--bg, #0F1116)', borderRadius: 10, padding: '12px 14px',
      border: `1px solid ${acao.concluida ? color + '44' : 'var(--border)'}`,
      opacity: acao.concluida ? 0.75 : 1, transition: 'opacity .2s' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <button onClick={onToggle}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 1, flexShrink: 0 }}>
          {acao.concluida
            ? <CheckCircle2 size={18} style={{ color }}/>
            : <Circle size={18} style={{ color: 'var(--text-muted)' }}/>}
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)',
            textDecoration: acao.concluida ? 'line-through' : 'none',
            lineHeight: 1.4, marginBottom: 6 }}>
            {acao.descricao}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {acao.responsavel && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Avatar name={acao.responsavel.full_name} avatarUrl={acao.responsavel.avatar_url} size={20}/>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{acao.responsavel.full_name.split(' ')[0]}</span>
              </div>
            )}
            {acao.prazo && (() => {
              const info = !acao.concluida ? prazoInfo(acao.prazo) : null;
              return (
                <span style={{ fontSize: 11, color: info?.icone ? info.cor : 'var(--text-muted)', fontWeight: info?.icone ? 700 : 400 }}>
                  {info?.icone ? `${info.icone} ${info.texto}` : `📅 ${formatDate(acao.prazo)}`}
                </span>
              );
            })()}
            {acao.tarefa_id && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 5,
                background: '#E8681A22', color: '#E8681A' }}>🔗 Tarefa</span>
            )}
          </div>
        </div>

        {canManage && (
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <button className="btn-icon" onClick={onEdit} title="Editar" style={{ width: 26, height: 26 }}><Pencil size={12}/></button>
            <button className="btn-icon" onClick={onDelete} title="Excluir" style={{ width: 26, height: 26, color: '#ef4444' }}><Trash2 size={12}/></button>
          </div>
        )}
      </div>
    </div>
  );
}
