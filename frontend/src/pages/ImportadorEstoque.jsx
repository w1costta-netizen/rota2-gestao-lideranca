import React, { useState, useRef } from 'react';
import { Upload, CheckCircle, AlertTriangle, Loader } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { parseEstoqueXlsx } from '../lib/parseEstoqueXlsx';
import { useToast } from '../components/Toast';

const brl = v => v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const n0  = v => v == null ? '—' : Math.round(v).toLocaleString('pt-BR');

export default function ImportadorEstoque({ profile }) {
  const toast = useToast();
  const fileRef = useRef();
  const [estado, setEstado] = useState('idle'); // idle | processando | ok | erro
  const [mensagem, setMensagem] = useState('');
  const [resumo, setResumo] = useState(null);
  const company = profile?.company;

  async function processarArquivo(file) {
    if (!file?.name.match(/\.xlsx?$/i)) {
      toast('Apenas arquivos .xlsx são aceitos.', 'error');
      return;
    }
    if (!company) {
      toast('Empresa não identificada no perfil.', 'error');
      return;
    }

    setEstado('processando');
    setMensagem('Lendo e processando planilha…');
    setResumo(null);

    try {
      const payload = await parseEstoqueXlsx(file);
      setMensagem('Salvando no banco de dados…');

      const { error } = await supabase
        .from('estoque_payloads')
        .upsert({ company, payload, updated_at: new Date().toISOString() }, { onConflict: 'company' });

      if (error) throw new Error(error.message);

      setResumo(payload);
      setEstado('ok');
      setMensagem(`Importação concluída — ${n0(payload.linhas)} itens · ${payload.gerado_em}`);
      toast('Estoque importado e sincronizado!');
    } catch (e) {
      setEstado('erro');
      setMensagem(e.message || 'Erro ao processar o arquivo.');
      toast(e.message || 'Erro ao importar.', 'error');
    }
  }

  const onFile = e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) processarArquivo(f); };
  const onDrop = e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) processarArquivo(f); };

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 16px' }}>
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <div className="page-title">Importar Estoque</div>
          <div className="page-subtitle">Extração DASH259 · SAM'S WM → Relatórios → DASH259 → Exportar Excel</div>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onClick={() => estado !== 'processando' && fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={onDrop}
        style={{
          border: `2px dashed ${estado === 'ok' ? '#10b981' : estado === 'erro' ? '#ef4444' : 'var(--border)'}`,
          borderRadius: 14, padding: '36px 20px', textAlign: 'center',
          cursor: estado === 'processando' ? 'not-allowed' : 'pointer',
          background: estado === 'ok' ? '#10b98108' : estado === 'erro' ? '#ef444408' : 'var(--surface)',
          transition: 'all .2s',
        }}
      >
        <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={onFile} />
        <div style={{ fontSize: 36, marginBottom: 8 }}>
          {estado === 'processando' ? '⏳' : estado === 'ok' ? '✅' : estado === 'erro' ? '❌' : '📊'}
        </div>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>
          {estado === 'idle'        && 'Arraste o arquivo .xlsx aqui ou clique para selecionar'}
          {estado === 'processando' && 'Processando…'}
          {estado === 'ok'          && 'Importação concluída!'}
          {estado === 'erro'        && 'Erro na importação'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{mensagem}</div>
      </div>

      {/* Loading */}
      {estado === 'processando' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16,
          padding: '12px 16px', background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)' }}>
          <Loader size={16} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{mensagem}</span>
        </div>
      )}

      {/* Resumo após importação */}
      {estado === 'ok' && resumo && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { label: 'Rupturas ativas',      val: n0(resumo.totais.ruptura_count),    cor: '#ef4444' },
              { label: 'Urgente < 15 dias',     val: n0(resumo.totais.urgente_count),    cor: '#f59e0b' },
              { label: '$ Estoque parado',       val: brl((resumo.totais.sem4s_custo || 0) + (resumo.totais.aging_custo || 0)), cor: '#6366f1' },
              { label: 'Giro lento',            val: n0(resumo.totais.giro_lento_count), cor: '#f59e0b' },
              { label: 'Suspensos c/ estoque',  val: n0(resumo.totais.suspensos_count),  cor: '#e8681a' },
              { label: 'Estoque negativo',      val: n0(resumo.totais.estq_neg_count),   cor: '#ef4444' },
            ].map(({ label, val, cor }) => (
              <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: cor }}>{val}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 14 }}
            onClick={() => { setEstado('idle'); setMensagem(''); setResumo(null); }}>
            <Upload size={14}/> Importar outra planilha
          </button>
        </div>
      )}

      {/* Botão nova tentativa */}
      {estado === 'erro' && (
        <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 14 }}
          onClick={() => { setEstado('idle'); setMensagem(''); }}>
          Tentar novamente
        </button>
      )}
    </div>
  );
}
