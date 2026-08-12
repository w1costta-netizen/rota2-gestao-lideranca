import React, { useState, useEffect, useCallback } from 'react';
import { Shield, Search, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import api from '../api';
import { useToast } from '../components/Toast';
import Avatar from '../components/Avatar';

const ACAO_LABEL = {
  criar_usuario: 'Criou usuário',
  editar_usuario: 'Editou usuário',
  desativar_usuario: 'Desativou usuário',
  excluir_usuario_permanente: 'Excluiu usuário (permanente)',
  erro_nao_tratado: 'Erro inesperado',
};

function formatData(iso) {
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function LogsAuditoria({ userId, profile }) {
  const toast = useToast();
  const isMaster = profile?.access_level === 'master';
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [acao, setAcao] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ requester_id: userId });
    if (profile?.company && !isMaster) params.set('company', profile.company);
    if (q)      params.set('q', q);
    if (status) params.set('status', status);
    if (acao)   params.set('acao', acao);
    api.get(`/logs?${params.toString()}`)
      .then(r => setList(r.data || []))
      .catch(() => toast('Erro ao carregar logs', 'error'))
      .finally(() => setLoading(false));
  }, [userId, profile?.company, isMaster, q, status, acao]);

  useEffect(() => { load(); }, [load]);

  const acoesDisponiveis = [...new Set(list.map(l => l.acao))];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Logs de Auditoria</div>
          <div className="page-subtitle">
            {isMaster ? 'Ações administrativas em todas as empresas' : 'Ações administrativas da sua empresa'}
          </div>
        </div>
        <button className="btn btn-ghost" onClick={load}>
          <RefreshCw size={14}/> Atualizar
        </button>
      </div>

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
                  {isMaster && log.company && (
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
