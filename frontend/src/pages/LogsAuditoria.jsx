import React, { useState, useEffect, useCallback } from 'react';
import { Shield, Search, CheckCircle2, XCircle, RefreshCw, Plus, X, Store } from 'lucide-react';
import api from '../api';
import { useToast } from '../components/Toast';
import Avatar from '../components/Avatar';
import ExportMenu from '../components/ExportMenu';
import { gerarPDF, gerarExcel } from '../lib/exportUtils';

const ACAO_LABEL = {
  push_chegou_no_aparelho: 'Push chegou no aparelho',
  criar_usuario: 'Criou usuário',
  editar_usuario: 'Editou usuário',
  desativar_usuario: 'Desativou usuário',
  excluir_usuario_permanente: 'Excluiu usuário (permanente)',
  adicionar_foto_tour: 'Adicionou foto (Tour 4x4)',
  remover_foto_tour: 'Removeu foto (Tour 4x4)',
  criar_tarefa: 'Criou tarefa',
  editar_tarefa: 'Editou tarefa',
  excluir_tarefa: 'Excluiu tarefa',
  criar_comunicado: 'Criou comunicado',
  editar_comunicado: 'Editou comunicado',
  excluir_comunicado: 'Excluiu comunicado',
  criar_mural: 'Criou item no mural',
  editar_mural: 'Editou item do mural',
  excluir_mural: 'Excluiu item do mural',
  criar_campanha: 'Criou campanha/flyer',
  editar_campanha: 'Editou campanha/flyer',
  arquivar_campanha: 'Arquivou campanha/flyer',
  criar_plano_pdca: 'Criou plano de ação (PDCA)',
  editar_plano_pdca: 'Editou plano de ação (PDCA)',
  excluir_plano_pdca: 'Excluiu plano de ação (PDCA)',
  excluir_acao_pdca: 'Excluiu ação do PDCA',
  criar_agenda: 'Criou item de agenda',
  editar_agenda: 'Editou item de agenda',
  excluir_agenda: 'Excluiu item de agenda',
  adicionar_foto_flyer: 'Adicionou foto (Flyer)',
  remover_foto_flyer: 'Removeu foto (Flyer)',
  erro_nao_tratado: 'Erro inesperado',

  // Organograma e equipe
  editar_organograma: 'Alterou o organograma',
  criar_membro_equipe: 'Cadastrou membro da equipe',
  editar_membro_equipe: 'Editou membro da equipe',
  excluir_membro_equipe: 'Excluiu membro da equipe',
  criar_lider: 'Cadastrou líder',
  editar_lider: 'Editou líder',
  excluir_lider: 'Excluiu líder',
  importar_lideres_csv: 'Importou líderes (CSV)',

  // Atas de reunião
  criar_ata: 'Criou ata de reunião',
  excluir_ata: 'Excluiu ata de reunião',
  assinar_ata: 'Assinou ata de reunião',
  desfazer_assinatura_ata: 'Desfez assinatura da ata',
  comentar_ata: 'Comentou em ata',

  // Listas pessoais
  criar_lista: 'Criou lista',
  editar_lista: 'Editou lista',
  excluir_lista: 'Excluiu lista',
  adicionar_item_lista: 'Adicionou item à lista',
  editar_item_lista: 'Editou item da lista',
  excluir_item_lista: 'Excluiu item da lista',

  // Estoque e conferência
  importar_estoque: 'Importou planilha de estoque',
  importar_conferencia: 'Importou planilha de conferência',
  criar_conferencia: 'Iniciou conferência de seção',
  finalizar_conferencia: 'Finalizou conferência de seção',
  excluir_conferencia: 'Excluiu conferência de seção',
  coletar_item_conferencia: 'Coletou item na conferência',
  remover_item_conferencia: 'Removeu item da conferência',

  // Escala e caixas
  enviar_escala: 'Enviou a escala do mês',
  reabrir_escala: 'Reabriu a escala do mês',
  importar_escala: 'Importou planilha de escala',
  excluir_importacao_escala: 'Excluiu importação de escala',
  excluir_entrada_escala: 'Excluiu entrada da escala',
  salvar_escala: 'Salvou a escala',
  alerta_escala_pendente: 'Alerta de escala pendente',
  salvar_caixas: 'Salvou registros de caixas',
  excluir_caixas: 'Excluiu registros de caixas',

  // Flyers
  adicionar_itens_flyer: 'Adicionou itens ao flyer',
  editar_item_flyer: 'Editou item do flyer',
  excluir_item_flyer: 'Excluiu item do flyer',
  sinalizar_item_flyer: 'Sinalizou item do flyer',
  ler_flyer_ia: 'Leu flyer com IA',

  // Tour 4x4
  criar_tour_4x4: 'Criou Tour 4x4',
  editar_tour_4x4: 'Editou Tour 4x4',
  excluir_tour_4x4: 'Excluiu Tour 4x4',
  editar_foto_tour_4x4: 'Editou foto do Tour 4x4',
  exportar_organograma_pdf: 'Exportou PDF do organograma',

  // PDCA
  criar_acao_pdca: 'Criou ação do PDCA',
  editar_acao_pdca: 'Editou ação do PDCA',

  // Tarefas, comunicados e mural
  comentar_tarefa: 'Comentou em tarefa',
  editar_comentario_tarefa: 'Editou comentário de tarefa',
  excluir_comentario_tarefa: 'Excluiu comentário de tarefa',
  marcar_comunicado_lido: 'Marcou comunicado como lido',
  marcar_mural_lido: 'Marcou item do mural como lido',
  comentar_mural: 'Comentou no mural',
  editar_comentario_mural: 'Editou comentário do mural',
  excluir_comentario_mural: 'Excluiu comentário do mural',
  comentar_comunicado: 'Comentou em comunicado',
  editar_comentario_comunicado: 'Editou comentário de comunicado',
  excluir_comentario_comunicado: 'Excluiu comentário de comunicado',
  reagir: 'Reagiu a um item',
  remover_reacao: 'Removeu reação',

  // Lojas, perfil e acesso
  criar_loja: 'Criou loja',
  solicitar_loja: 'Solicitou cadastro de loja',
  aprovar_loja: 'Aprovou loja',
  desativar_loja: 'Desativou loja',
  editar_modulos_premium: 'Alterou módulos da loja',
  adicionar_loja_extra: 'Liberou loja extra',
  remover_loja_extra: 'Removeu loja extra',
  criar_cargo: 'Criou cargo',
  excluir_cargo: 'Excluiu cargo',
  criar_setor: 'Criou setor',
  excluir_setor: 'Excluiu setor',
  salvar_perfil: 'Salvou perfil',
  editar_perfil: 'Editou o próprio perfil',
  concluir_boas_vindas: 'Concluiu as boas-vindas',
  ativar_conta_hotmart: 'Ativou conta (Hotmart)',
  webhook_hotmart: 'Recebeu compra (Hotmart)',

  // Notificações e erros de tela
  testar_notificacao: 'Testou notificação',
  enviar_push: 'Falha ao enviar notificação',
  registrar_dispositivo_push: 'Registrou dispositivo de notificação',
  remover_dispositivo_push: 'Removeu dispositivo de notificação',
  erro_tela: 'Erro na tela',
  acao_tela: 'Ação na tela',

  // Treinamentos e leitura de tarefas
  atualizar_progresso_produtividade: 'Avançou em treinamento',
  concluir_treinamento_produtividade: 'Concluiu treinamento',
  listar_tarefas: 'Carregou as tarefas',
};

function formatData(iso) {
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function LogsAuditoria({ userId, profile }) {
  const toast = useToast();
  // O suporte (Help Desk) enxerga os logs de todas as lojas, igual ao master —
  // é o único módulo a que ele tem acesso, para investigar erros dos clientes.
  const isMaster = ['master', 'suporte'].includes(profile?.access_level);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [acao, setAcao] = useState('');
  const [userIdFiltro, setUserIdFiltro] = useState('');
  const [dataIni, setDataIni] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [empresaSel, setEmpresaSel] = useState(''); // só para master
  const [lojas, setLojas] = useState([]);           // só para master
  const [empresasExtras, setEmpresasExtras] = useState([]);
  const [novaEmpresa, setNovaEmpresa] = useState('');
  const [salvandoEmpresa, setSalvandoEmpresa] = useState(false);

  // Master: carrega a lista de lojas para o dropdown de empresa
  useEffect(() => {
    if (!isMaster) return;
    api.get(`/stores?requester_id=${userId}`)
      .then(r => setLojas(r.data || []))
      .catch(() => {});
  }, [isMaster, userId]);

  const loadEmpresasExtras = useCallback(() => {
    if (isMaster) return;
    api.get(`/logs/empresas-extras?requester_id=${userId}`)
      .then(r => setEmpresasExtras(r.data || []))
      .catch(() => {});
  }, [userId, isMaster]);

  useEffect(() => { loadEmpresasExtras(); }, [loadEmpresasExtras]);

  const adicionarEmpresa = async () => {
    if (!novaEmpresa.trim()) return;
    setSalvandoEmpresa(true);
    try {
      await api.post('/logs/empresas-extras', { requester_id: userId, company: novaEmpresa.trim() });
      setNovaEmpresa('');
      loadEmpresasExtras();
      load();
      toast('Loja adicionada!');
    } catch (e) {
      toast(e?.response?.data?.error || 'Erro ao adicionar loja', 'error');
    } finally {
      setSalvandoEmpresa(false);
    }
  };

  const removerEmpresa = async (id) => {
    try {
      await api.delete(`/logs/empresas-extras/${id}?requester_id=${userId}`);
      setEmpresasExtras(l => l.filter(e => e.id !== id));
      load();
      toast('Loja removida');
    } catch { toast('Erro ao remover', 'error'); }
  };

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ requester_id: userId });
    if (isMaster) { if (empresaSel) params.set('company', empresaSel); }
    else if (profile?.company) params.set('company', profile.company);
    if (q)          params.set('q', q);
    if (status)     params.set('status', status);
    if (acao)       params.set('acao', acao);
    if (userIdFiltro) params.set('user_id', userIdFiltro);
    if (dataIni)     params.set('data_ini', dataIni);
    if (dataFim)     params.set('data_fim', dataFim);
    api.get(`/logs?${params.toString()}`)
      .then(r => setList(r.data || []))
      .catch(() => toast('Erro ao carregar logs', 'error'))
      .finally(() => setLoading(false));
  }, [userId, profile?.company, isMaster, q, status, acao, userIdFiltro, dataIni, dataFim, empresaSel]);

  useEffect(() => { load(); }, [load]);

  const acoesDisponiveis = [...new Set(list.map(l => l.acao))];
  const usuariosDisponiveis = [...new Map(
    list.filter(l => l.usuario).map(l => [l.user_id, l.usuario.full_name])
  ).entries()].sort((a, b) => a[1].localeCompare(b[1]));

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Logs de Auditoria</div>
          <div className="page-subtitle">
            {isMaster ? 'Ações administrativas em todas as empresas' : 'Ações administrativas da sua empresa'}
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-ghost" onClick={load}>
            <RefreshCw size={14}/> Atualizar
          </button>
          <ExportMenu
            disabled={list.length === 0}
            onPDF={() => gerarPDF({
              titulo: 'Logs de Auditoria',
              subtitulo: isMaster ? 'Todas as empresas' : (profile?.company || ''),
              secoes: [{
                colunas: [
                  { header: 'Data',    dataKey: 'data' },
                  { header: 'Status',  dataKey: 'status' },
                  { header: 'Ação',    dataKey: 'acao' },
                  { header: 'Tabela',  dataKey: 'tabela' },
                  { header: 'Usuário', dataKey: 'usuario' },
                  { header: 'Empresa', dataKey: 'empresa' },
                  { header: 'Detalhe', dataKey: 'detalhe' },
                ],
                rows: list.map(l => ({
                  data: formatData(l.created_at),
                  status: l.status === 'falha' ? 'Falha' : 'Sucesso',
                  acao: ACAO_LABEL[l.acao] || l.acao,
                  tabela: l.tabela || '',
                  usuario: l.usuario?.full_name || 'Sistema',
                  empresa: l.company || '',
                  detalhe: l.erro_mensagem || '',
                })),
              }],
            })}
            onExcel={() => gerarExcel({
              nomeArquivo: 'logs_auditoria',
              abas: [{
                nome: 'Logs',
                colunas: ['Data', 'Status', 'Ação', 'Tabela', 'Usuário', 'Empresa', 'Detalhe'],
                rows: list.map(l => [
                  formatData(l.created_at),
                  l.status === 'falha' ? 'Falha' : 'Sucesso',
                  ACAO_LABEL[l.acao] || l.acao,
                  l.tabela || '',
                  l.usuario?.full_name || 'Sistema',
                  l.company || '',
                  l.erro_mensagem || '',
                ]),
              }],
            })}
          />
        </div>
      </div>

      {/* Gestão de lojas extras — só para contas admin (master já vê tudo) */}
      {!isMaster && (
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10,
          padding:'12px 14px', marginBottom:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
            <Store size={15} style={{ color:'var(--primary)' }}/>
            <span style={{ fontWeight:700, fontSize:13 }}>Minhas lojas</span>
            <span style={{ fontSize:11, color:'var(--text-muted)' }}>
              — além da sua loja principal ({profile?.company || '—'}), você pode liberar outras lojas para aparecerem aqui
            </span>
          </div>

          {empresasExtras.length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:10 }}>
              {empresasExtras.map(e => (
                <span key={e.id} style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, fontWeight:600,
                  padding:'4px 10px', borderRadius:20, background:'#6366f120', color:'#6366f1' }}>
                  {e.company}
                  <button onClick={() => removerEmpresa(e.id)}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'#6366f1', padding:0, display:'flex' }}>
                    <X size={12}/>
                  </button>
                </span>
              ))}
            </div>
          )}

          <div style={{ display:'flex', gap:8 }}>
            <input className="input" style={{ flex:1 }} placeholder="Nome exato da loja (campo 'company')"
              value={novaEmpresa} onChange={e => setNovaEmpresa(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') adicionarEmpresa(); }}/>
            <button className="btn btn-primary" onClick={adicionarEmpresa} disabled={salvandoEmpresa || !novaEmpresa.trim()}>
              <Plus size={14}/> Adicionar
            </button>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16 }}>
        <div style={{ position:'relative', flex:1, minWidth:200 }}>
          <Search size={14} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)' }}/>
          <input className="input" style={{ paddingLeft:32 }} placeholder="Buscar por ação, tabela..."
            value={q} onChange={e => setQ(e.target.value)}/>
        </div>
        <select className="select" style={{ maxWidth:160 }} value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="sucesso">✓ Sucesso</option>
          <option value="falha">✗ Falha</option>
        </select>
        <select className="select" style={{ maxWidth:200 }} value={acao} onChange={e => setAcao(e.target.value)}>
          <option value="">Todas as ações</option>
          {acoesDisponiveis.map(a => <option key={a} value={a}>{ACAO_LABEL[a] || a}</option>)}
        </select>
        <select className="select" style={{ maxWidth:200 }} value={userIdFiltro} onChange={e => setUserIdFiltro(e.target.value)}>
          <option value="">Todos os usuários</option>
          {usuariosDisponiveis.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
        </select>
        {isMaster && (
          <select className="select" style={{ maxWidth:220 }} value={empresaSel} onChange={e => setEmpresaSel(e.target.value)}>
            <option value="">Todas as empresas</option>
            {lojas.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
          </select>
        )}
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <input type="date" className="input" style={{ maxWidth:150 }} value={dataIni}
            onChange={e => setDataIni(e.target.value)} title="Data inicial"/>
          <span style={{ color:'var(--text-muted)', fontSize:12 }}>até</span>
          <input type="date" className="input" style={{ maxWidth:150 }} value={dataFim}
            onChange={e => setDataFim(e.target.value)} title="Data final"/>
        </div>
      </div>

      {loading && <div style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}>Carregando...</div>}

      {!loading && list.length === 0 && (
        <div style={{ textAlign:'center', padding:60, color:'var(--text-muted)' }}>
          <Shield size={40} style={{ opacity:.3, marginBottom:12 }}/>
          <p>Nenhum registro de auditoria ainda.</p>
        </div>
      )}

      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {list.map(log => (
          <div key={log.id} style={{
            background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10,
            padding:'12px 14px', borderLeft:`3px solid ${log.status === 'falha' ? '#ef4444' : '#10b981'}`,
          }}>
            <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
              {log.status === 'falha'
                ? <XCircle size={16} style={{ color:'#ef4444', flexShrink:0, marginTop:2 }}/>
                : <CheckCircle2 size={16} style={{ color:'#10b981', flexShrink:0, marginTop:2 }}/>}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:2 }}>
                  <span style={{ fontWeight:700, fontSize:13 }}>{ACAO_LABEL[log.acao] || log.acao}</span>
                  {log.tabela && <span style={{ fontSize:11, color:'var(--text-muted)' }}>· {log.tabela}</span>}
                  {(isMaster || empresasExtras.length > 0) && log.company && (
                    <span style={{ fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:5,
                      background:'#6366f120', color:'#6366f1' }}>{log.company}</span>
                  )}
                </div>
                {log.erro_mensagem && (
                  <div style={{ fontSize:12, color:'#ef4444', marginTop:4 }}>{log.erro_mensagem}</div>
                )}
                <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:6 }}>
                  {log.usuario?.full_name && <Avatar name={log.usuario.full_name} size={18}/>}
                  <span style={{ fontSize:11, color:'var(--text-muted)' }}>
                    {log.usuario?.full_name || 'Sistema'} · {formatData(log.created_at)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
