import React, { useEffect, useState } from 'react';
import { Star, MessageSquareHeart } from 'lucide-react';
import api from '../api';
import { useToast } from '../components/Toast';
import Avatar from '../components/Avatar';

// ─────────────────────────────────────────────────────────────
// Sua opinião — estrelas + depoimento + autorização de uso público.
//
// A pergunta puxa depoimento útil ("o que mudou no seu dia a dia"), e a
// pessoa vê exatamente como vai aparecer antes de autorizar. Uma avaliação
// por pessoa, sempre editável.
// ─────────────────────────────────────────────────────────────

const ROTULO = { 1: 'Ruim', 2: 'Fraco', 3: 'Ok', 4: 'Bom', 5: 'Excelente' };

export function Estrelas({ valor, onChange, tamanho = 30 }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: 'flex', gap: 4 }} onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map(n => {
        const aceso = n <= (hover || valor);
        return (
          <button key={n} type="button" onClick={() => onChange?.(n)} onMouseEnter={() => onChange && setHover(n)}
            aria-label={`${n} estrela${n > 1 ? 's' : ''}`} disabled={!onChange}
            style={{ background: 'none', border: 'none', cursor: onChange ? 'pointer' : 'default', padding: 2, lineHeight: 0 }}>
            <Star size={tamanho} fill={aceso ? '#F5B301' : 'none'} color={aceso ? '#F5B301' : 'var(--border)'} strokeWidth={1.6}/>
          </button>
        );
      })}
    </div>
  );
}

// Depoimento como vai aparecer publicado — usado aqui e na tela do master.
export function CartaoDepoimento({ estrelas, texto, pessoa, data }) {
  const linha = [pessoa?.role, pessoa?.company].filter(Boolean).join(' · ');
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
      <Estrelas valor={estrelas} tamanho={18}/>
      {texto && <p style={{ fontSize: 14.5, lineHeight: 1.6, margin: '10px 0 12px', fontStyle: 'italic' }}>“{texto}”</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar avatarUrl={pessoa?.avatar_url} name={pessoa?.full_name} size={36}/>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>{pessoa?.full_name || '—'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{linha || 'Usuário do Rota Líder'}{data ? ` · ${new Date(data).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}` : ''}</div>
        </div>
      </div>
    </div>
  );
}

export default function SuaOpiniao({ userId }) {
  const toast = useToast();
  const [dados, setDados] = useState(null);
  const [estrelas, setEstrelas] = useState(0);
  const [texto, setTexto] = useState('');
  const [autoriza, setAutoriza] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    if (!userId) return;
    api.get(`/avaliacoes/minha?requester_id=${userId}`).then(r => {
      setDados(r.data);
      if (r.data.avaliacao) { setEstrelas(r.data.avaliacao.estrelas); setTexto(r.data.avaliacao.texto || ''); setAutoriza(!!r.data.avaliacao.autoriza_publicar); }
    }).catch(() => toast('Não foi possível carregar.', 'error'));
  }, [userId]);

  const enviar = async () => {
    if (!estrelas) return toast('Escolha quantas estrelas.', 'error');
    setSalvando(true);
    try {
      const r = await api.post('/avaliacoes', { requester_id: userId, estrelas, texto, autoriza_publicar: autoriza });
      setDados(d => ({ ...d, avaliacao: r.data, convidar: false }));
      setSalvo(true);
      toast(dados?.avaliacao ? 'Avaliação atualizada. Obrigado!' : 'Obrigado pela sua opinião!');
    } catch (e) { toast(e?.response?.data?.error || 'Não foi possível enviar.', 'error'); }
    setSalvando(false);
  };

  const pessoa = dados?.assinatura ? { full_name: dados.assinatura.nome, role: dados.assinatura.cargo, company: dados.assinatura.loja, avatar_url: dados.assinatura.avatar_url } : null;

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 9 }}><MessageSquareHeart size={20} style={{ color: 'var(--primary)' }}/> Sua opinião</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 2 }}>Leva um minuto e ajuda a melhorar o Rota Líder para você e para outros líderes.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Quantas estrelas você dá ao Rota Líder?</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Estrelas valor={estrelas} onChange={setEstrelas}/>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', minWidth: 70 }}>{estrelas ? ROTULO[estrelas] : ''}</span>
          </div>

          <div style={{ fontWeight: 700, fontSize: 14, margin: '18px 0 6px' }}>O que mudou no seu dia a dia com o Rota Líder?</div>
          <textarea value={texto} onChange={e => setTexto(e.target.value.slice(0, 1000))} rows={5}
            placeholder="Ex.: A escala chega no meu celular e a reunião de segunda ficou mais rápida com a ata pronta…"
            style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13.5, lineHeight: 1.6, fontFamily: 'inherit', resize: 'vertical' }}/>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>{texto.length}/1000</div>

          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 12, cursor: 'pointer', fontSize: 13, lineHeight: 1.5 }}>
            <input type="checkbox" checked={autoriza} onChange={e => setAutoriza(e.target.checked)} disabled={!texto.trim()} style={{ marginTop: 3, accentColor: 'var(--primary)' }}/>
            <span>
              Autorizo o Rota Líder a usar este depoimento, com meu nome, cargo, loja e foto, nas redes sociais e no site.
              <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: 12 }}>Opcional. Sem marcar, sua opinião fica só com a equipe do Rota Líder. Você pode mudar isso quando quiser.</span>
            </span>
          </label>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
            <button className="btn btn-primary" onClick={enviar} disabled={salvando || !estrelas}>{salvando ? 'Enviando...' : dados?.avaliacao ? 'Atualizar avaliação' : 'Enviar avaliação'}</button>
          </div>
          {salvo && <div style={{ fontSize: 12.5, color: '#16a34a', marginTop: 8 }}>Recebemos. Obrigado! 💛</div>}
        </div>

        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: .3, marginBottom: 8 }}>Como vai aparecer</div>
          <CartaoDepoimento estrelas={estrelas || 5} texto={texto.trim() || 'Seu depoimento aparece aqui.'} pessoa={pessoa} data={dados?.avaliacao?.created_at || new Date().toISOString()}/>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>Foto, nome e cargo vêm do seu perfil — dá para ajustar em Meu Perfil.</p>
        </div>
      </div>
    </div>
  );
}
