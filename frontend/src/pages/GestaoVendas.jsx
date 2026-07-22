import React, { useState, useEffect, useCallback } from 'react';
import { Upload, Trash2, Archive, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { parseVendasXlsx } from '../lib/parseVendasXlsx';
import { useToast } from '../components/Toast';

export default function GestaoVendas({ userId, profile }) {
  const { showToast } = useToast();
  const [historico, setHistorico] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [fechando, setFechando] = useState(false);
  const [totalAtual, setTotalAtual] = useState(null);
  const [loading, setLoading] = useState(true);

  const company = profile?.company;

  const carregarDados = useCallback(async () => {
    setLoading(true);
    const [{ count }, { data: hist }] = await Promise.all([
      supabase.from('vendas_atual').select('*', { count: 'exact', head: true }).eq('company', company),
      supabase.from('vendas_historico').select('periodo, created_at').eq('company', company)
        .order('created_at', { ascending: false }),
    ]);
    setTotalAtual(count || 0);

    // Agrupa períodos únicos
    const periodos = [...new Set((hist || []).map(h => h.periodo))];
    setHistorico(periodos);
    setLoading(false);
  }, [company]);

  useEffect(() => { carregarDados(); }, [carregarDados]);

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setUploading(true);
    try {
      const { linhas } = await parseVendasXlsx(file);
      if (!linhas.length) {
        showToast('Nenhum dado encontrado. Verifique se o arquivo tem colunas CANAL/DEPARTAMENTO/CATEGORIA.', 'error');
        return;
      }

      // Apaga os dados atuais da empresa
      await supabase.from('vendas_atual').delete().eq('company', company);

      // Insere novo lote
      const rows = linhas.map(l => ({
        company,
        canal:         l.tipo === 'CANAL'        ? l.nome : null,
        departamento:  l.tipo === 'DEPARTAMENTO' ? l.nome : null,
        categoria:     l.tipo === 'CATEGORIA'    ? l.nome : null,
        item:          l.tipo === 'ITEM'         ? l.nome : null,
        meta:          l.meta,
        realizado:     l.realizado,
        percentual:    l.percentual,
        extras:        l.extras || null,
        uploaded_by:   userId,
      }));

      const { error } = await supabase.from('vendas_atual').insert(rows);
      if (error) throw error;

      showToast(`${linhas.length} linhas importadas com sucesso!`, 'success');
      carregarDados();
    } catch (err) {
      showToast('Erro ao processar arquivo: ' + err.message, 'error');
    } finally {
      setUploading(false);
    }
  }

  async function handleFecharMes() {
    if (!window.confirm('Fechar o mês atual? Os dados serão salvos no histórico.')) return;
    setFechando(true);
    try {
      const { data: linhas, error: errLer } = await supabase
        .from('vendas_atual').select('*').eq('company', company);
      if (errLer) throw errLer;
      if (!linhas?.length) { showToast('Não há dados atuais para fechar.', 'error'); return; }

      const agora = new Date();
      const periodo = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;

      const rows = linhas.map(({ id, uploaded_by, uploaded_at, ...l }) => ({
        ...l,
        periodo,
      }));

      const { error } = await supabase.from('vendas_historico').insert(rows);
      if (error) throw error;

      showToast(`Mês ${periodo} fechado com sucesso!`, 'success');
      carregarDados();
    } catch (err) {
      showToast('Erro ao fechar mês: ' + err.message, 'error');
    } finally {
      setFechando(false);
    }
  }

  async function handleExcluirPeriodo(periodo) {
    if (!window.confirm(`Excluir o histórico de ${periodo}?`)) return;
    await supabase.from('vendas_historico').delete().eq('company', company).eq('periodo', periodo);
    showToast('Período excluído.', 'success');
    carregarDados();
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'60vh', color:'var(--text-muted)' }}>
      Carregando...
    </div>
  );

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
        Gestão de Vendas
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 28 }}>
        Importe o relatório de vendas e gerencie o histórico mensal.
      </p>

      {/* Card: dados atuais */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Dados Atuais</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {totalAtual > 0
                ? <span style={{ color: '#22c55e', display:'flex', alignItems:'center', gap: 4 }}><CheckCircle size={13}/> {totalAtual} linhas carregadas</span>
                : <span style={{ color: 'var(--text-muted)', display:'flex', alignItems:'center', gap: 4 }}><AlertTriangle size={13}/> Nenhum dado importado</span>
              }
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => document.getElementById('upload-vendas').click()}
              disabled={uploading}
              style={{ display:'flex', alignItems:'center', gap: 6, background:'var(--primary)', color:'#fff',
                border:'none', borderRadius: 8, padding:'8px 14px', fontSize: 13, fontWeight: 600, cursor:'pointer' }}
            >
              {uploading ? <RefreshCw size={14} style={{ animation:'spin 1s linear infinite' }}/> : <Upload size={14}/>}
              {uploading ? 'Importando...' : 'Importar .xlsx'}
            </button>
            {totalAtual > 0 && (
              <button
                onClick={handleFecharMes}
                disabled={fechando}
                style={{ display:'flex', alignItems:'center', gap: 6, background:'#f59e0b', color:'#fff',
                  border:'none', borderRadius: 8, padding:'8px 14px', fontSize: 13, fontWeight: 600, cursor:'pointer' }}
              >
                {fechando ? <RefreshCw size={14} style={{ animation:'spin 1s linear infinite' }}/> : <Archive size={14}/>}
                Fechar mês
              </button>
            )}
          </div>
        </div>
        <input id="upload-vendas" type="file" accept=".xlsx,.xls" style={{ display:'none' }} onChange={handleUpload}/>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
          O arquivo deve conter blocos de CANAL, DEPARTAMENTO, CATEGORIA e ITEM com colunas META e REALIZADO.
          Ao importar, os dados atuais são substituídos.
        </p>
      </div>

      {/* Histórico mensal */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>
          Histórico Mensal ({historico.length} {historico.length === 1 ? 'período' : 'períodos'})
        </div>
        {historico.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            Nenhum mês fechado ainda. Importe dados e clique em "Fechar mês" para salvar.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {historico.map(p => {
              const [ano, mes] = p.split('-');
              const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
              const label = `${nomes[parseInt(mes) - 1]}/${ano}`;
              return (
                <div key={p} style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                  padding:'10px 14px', background:'var(--bg)', borderRadius: 8, border:'1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{label}</span>
                  <button
                    onClick={() => handleExcluirPeriodo(p)}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)',
                      display:'flex', alignItems:'center', gap: 4, fontSize: 12, padding: 4 }}
                  >
                    <Trash2 size={14}/> Excluir
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
