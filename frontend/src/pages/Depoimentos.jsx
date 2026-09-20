import React, { useEffect, useState } from 'react';
import { Star, Copy, MessageSquareHeart } from 'lucide-react';
import api from '../api';
import { useToast } from '../components/Toast';
import { CartaoDepoimento } from './SuaOpiniao';

// ─────────────────────────────────────────────────────────────
// Depoimentos — só o master. Tudo o que os usuários avaliaram, com o
// filtro que importa: autorizados para publicar. "Copiar" entrega o texto
// pronto para post. Nota baixa fica aqui como reclamação, não vitrine.
// ─────────────────────────────────────────────────────────────

export default function Depoimentos({ userId }) {
  const toast = useToast();
  const [dados, setDados] = useState(null);
  const [filtro, setFiltro] = useState('autorizadas');   // autorizadas | todas | baixas

  useEffect(() => {
    if (!userId) return;
    api.get(`/avaliacoes/todas?requester_id=${userId}`).then(r => setDados(r.data))
      .catch(e => toast(e?.response?.data?.error || 'Não foi possível carregar.', 'error'));
  }, [userId]);

  if (!dados) return <div className="card" style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>Carregando...</div>;

  const { avaliacoes, resumo } = dados;
  const lista = avaliacoes.filter(a => filtro === 'todas' ? true : filtro === 'baixas' ? a.estrelas <= 3 : (a.autoriza_publicar && a.texto));

  const copiar = async (a) => {
    const p = a.pessoa || {};
    const txt = `${'⭐'.repeat(a.estrelas)}\n“${a.texto}”\n— ${p.full_name}${p.role ? `, ${p.role}` : ''}${p.company ? ` · ${p.company}` : ''}`;
    try { await navigator.clipboard.writeText(txt); toast('Copiado — pronto para colar no post.'); }
    catch { toast('Não foi possível copiar.', 'error'); }
  };

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 9 }}><MessageSquareHeart size={20} style={{ color: 'var(--primary)' }}/> Depoimentos</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 2 }}>O que os usuários dizem do Rota Líder. Só os <b>autorizados</b> podem ir para redes e página de vendas.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
        {[['Avaliações', resumo.total, ''], ['Média', resumo.media ? resumo.media.toFixed(1) : '—', 'de 5 estrelas'], ['Autorizadas', resumo.autorizadas, 'para publicar'], ['Notas baixas', avaliacoes.filter(a => a.estrelas <= 3).length, '≤ 3 estrelas']].map(([r, v, s]) => (
          <div key={r} className="card" style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>{r}</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{v}</div>
            {s && <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{s}</div>}
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          {resumo.porEstrela.map(e => (
            <div key={e.estrelas} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
              <Star size={13} fill="#F5B301" color="#F5B301"/> {e.estrelas}: <b>{e.qtd}</b>
            </div>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {[['autorizadas', `Autorizadas (${resumo.autorizadas})`], ['todas', `Todas (${resumo.total})`], ['baixas', 'Notas baixas']].map(([id, t]) => (
              <button key={id} onClick={() => setFiltro(id)}
                style={{ padding: '5px 11px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                         border: `1px solid ${filtro === id ? 'var(--primary)' : 'var(--border)'}`, background: filtro === id ? 'var(--primary)' : 'transparent', color: filtro === id ? '#fff' : 'var(--text-muted)' }}>{t}</button>
            ))}
          </div>
        </div>
      </div>

      {lista.length === 0 ? (
        <div className="card" style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nada aqui ainda.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
          {lista.map(a => (
            <div key={a.id}>
              <CartaoDepoimento estrelas={a.estrelas} texto={a.texto} pessoa={a.pessoa} data={a.created_at}/>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                <span>{a.autoriza_publicar && a.texto ? '✅ autorizado para publicar' : '🔒 uso interno'}{a.updated_at ? ' · editado' : ''}</span>
                {a.autoriza_publicar && a.texto && <button className="btn btn-ghost btn-sm" onClick={() => copiar(a)}><Copy size={13}/> Copiar para post</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
