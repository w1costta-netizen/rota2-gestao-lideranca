import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, X, ChevronLeft, ChevronRight, Search, BookOpen, CalendarDays } from 'lucide-react';
import api from '../api';
import { useToast } from '../components/Toast';
import Avatar from '../components/Avatar';
import ExportMenu from '../components/ExportMenu';
import { gerarPDF, gerarExcel } from '../lib/exportUtils';

// ─────────────────────────────────────────────────────────────
// Diário de Bordo — o que aconteceu na loja, dia a dia.
//
// As categorias não são enfeite: são elas que tornam a análise possível
// depois. "Por que a venda caiu na terça?" só tem resposta se o relato da
// chuva estiver marcado como clima, e não perdido no meio do texto.
// ─────────────────────────────────────────────────────────────
const CATEGORIAS = {
  resultado: { nome: 'Resultado',  cor: '#10b981', desc: 'Venda, meta, indicadores' },
  operacao:  { nome: 'Operação',   cor: '#3b82f6', desc: 'Ruptura, abastecimento, equipamento' },
  clima:     { nome: 'Clima',      cor: '#06b6d4', desc: 'Chuva, calor, feriado, movimento' },
  seguranca: { nome: 'Segurança',  cor: '#ef4444', desc: 'Acidente, incidente, furto' },
  equipe:    { nome: 'Equipe',     cor: '#8b5cf6', desc: 'Falta, atraso, treinamento' },
  cliente:   { nome: 'Cliente',    cor: '#f59e0b', desc: 'Reclamação, elogio' },
  outro:     { nome: 'Outro',      cor: '#6b7280', desc: 'Qualquer outro registro' },
};

const hoje = () => new Date().toISOString().split('T')[0];

function porExtenso(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
}
const curta = iso => (iso ? iso.split('-').reverse().join('/') : '');

function somarDias(iso, n) {
  const [a, m, d] = iso.split('-').map(Number);
  const dt = new Date(a, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export default function DiarioBordo({ userId, profile }) {
  const toast = useToast();
  const ehGestor = ['admin', 'supervisor', 'master'].includes(profile?.access_level);

  // Dois modos: o dia (rotina) e o período (análise). Sem o período, comparar
  // um mês inteiro exigiria abrir dia por dia.
  const [modo, setModo] = useState('dia');
  const [dia, setDia] = useState(hoje());
  const [de, setDe]   = useState(somarDias(hoje(), -30));
  const [ate, setAte] = useState(hoje());
  const [filtroCat, setFiltroCat] = useState('');
  const [busca, setBusca] = useState('');

  const [relatos, setRelatos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState(null);

  const carregar = async () => {
    setCarregando(true);
    try {
      const p = new URLSearchParams({ requester_id: userId });
      if (modo === 'dia') p.set('data', dia);
      else { p.set('de', de); p.set('ate', ate); }
      if (filtroCat) p.set('categoria', filtroCat);
      if (profile?.company) p.set('company', profile.company);
      const r = await api.get(`/diario?${p.toString()}`);
      setRelatos(r.data || []);
    } catch {
      toast('Não foi possível carregar o diário.', 'error');
    }
    setCarregando(false);
  };

  useEffect(() => { if (userId) carregar(); }, [userId, modo, dia, de, ate, filtroCat, profile?.company]);

  const abrirNovo = () => setEditando({
    id: null, data: modo === 'dia' ? dia : hoje(), hora: '', categoria: 'operacao', texto: '',
  });

  const salvar = async () => {
    if (!editando.texto.trim()) { toast('Escreva o relato.', 'error'); return; }
    try {
      const corpo = {
        requester_id: userId,
        data: editando.data,
        hora: editando.hora || null,
        categoria: editando.categoria,
        texto: editando.texto,
      };
      if (editando.id) await api.put(`/diario/${editando.id}`, corpo);
      else             await api.post('/diario', corpo);
      setEditando(null);
      carregar();
    } catch (e) {
      toast(e?.response?.data?.error || 'Erro ao salvar.', 'error');
    }
  };

  const excluir = async (r) => {
    if (!window.confirm('Excluir este relato?')) return;
    try {
      await api.delete(`/diario/${r.id}?requester_id=${userId}`);
      setEditando(null);
      carregar();
    } catch (e) {
      toast(e?.response?.data?.error || 'Erro ao excluir.', 'error');
    }
  };

  const podeMexer = r => r.user_id === userId || ehGestor;

  const termo = busca.trim().toLowerCase();
  const visiveis = termo
    ? relatos.filter(r => `${r.texto} ${r.autor?.full_name || ''}`.toLowerCase().includes(termo))
    : relatos;

  // No modo período os relatos vêm de vários dias — agrupar por data é o que
  // deixa a leitura parecida com um diário de verdade.
  const porDia = visiveis.reduce((mapa, r) => {
    (mapa[r.data] = mapa[r.data] || []).push(r);
    return mapa;
  }, {});
  const diasOrdenados = Object.keys(porDia).sort().reverse();

  const linhasExport = visiveis.map(r => ({
    data: curta(r.data),
    hora: r.hora ? r.hora.slice(0, 5) : '—',
    categoria: CATEGORIAS[r.categoria]?.nome || r.categoria,
    autor: r.autor?.full_name || '—',
    relato: r.texto,
  }));
  const periodoTexto = modo === 'dia' ? curta(dia) : `${curta(de)} a ${curta(ate)}`;

  return (
    <div>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, flexWrap:'wrap', marginBottom:14 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700, display:'flex', alignItems:'center', gap:9 }}>
            <BookOpen size={20} style={{ color:'var(--primary)' }}/> Diário de Bordo
          </h1>
          <p style={{ color:'var(--text-muted)', fontSize:13, marginTop:2 }}>
            O que aconteceu na loja, dia a dia — para consultar e entender depois.
          </p>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <ExportMenu
            disabled={visiveis.length === 0}
            onPDF={() => gerarPDF({
              titulo: 'Diário de Bordo',
              subtitulo: `${profile?.company || ''} · ${periodoTexto}`,
              secoes: [{
                colunas: [
                  { header: 'Data',      dataKey: 'data' },
                  { header: 'Hora',      dataKey: 'hora' },
                  { header: 'Categoria', dataKey: 'categoria' },
                  { header: 'Quem',      dataKey: 'autor' },
                  { header: 'Relato',    dataKey: 'relato' },
                ],
                rows: linhasExport,
              }],
            })}
            onExcel={() => gerarExcel({
              nomeArquivo: `diario-de-bordo-${periodoTexto.replace(/[^\d]/g, '-')}`,
              abas: [{
                nome: 'Diário',
                colunas: ['Data', 'Hora', 'Categoria', 'Quem', 'Relato'],
                rows: linhasExport.map(l => [l.data, l.hora, l.categoria, l.autor, l.relato]),
              }],
            })}
          />
          <button className="btn btn-primary" onClick={abrirNovo}><Plus size={15}/> Novo relato</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom:16, display:'flex', flexDirection:'column', gap:12 }}>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          <div style={{ display:'flex', borderRadius:'var(--radius)', overflow:'hidden', border:'1px solid var(--border)' }}>
            {[['dia','Por dia'],['periodo','Por período']].map(([id, rotulo]) => (
              <button key={id} onClick={() => setModo(id)}
                style={{ padding:'7px 14px', fontSize:12.5, fontWeight:600, cursor:'pointer', border:'none',
                         background: modo === id ? 'var(--primary)' : 'transparent',
                         color: modo === id ? '#fff' : 'var(--text-muted)' }}>
                {rotulo}
              </button>
            ))}
          </div>

          {modo === 'dia' ? (
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <button className="btn btn-ghost" style={{ padding:'6px 9px' }} onClick={() => setDia(d => somarDias(d, -1))} aria-label="Dia anterior">
                <ChevronLeft size={16}/>
              </button>
              <input type="date" value={dia} onChange={e => setDia(e.target.value || hoje())}
                style={{ padding:'7px 10px', borderRadius:'var(--radius)', border:'1px solid var(--border)',
                         background:'var(--surface)', color:'var(--text)', fontSize:13 }}/>
              <button className="btn btn-ghost" style={{ padding:'6px 9px' }}
                onClick={() => setDia(d => somarDias(d, 1))}
                disabled={dia >= hoje()} aria-label="Próximo dia">
                <ChevronRight size={16}/>
              </button>
              {dia !== hoje() && (
                <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={() => setDia(hoje())}>Hoje</button>
              )}
            </div>
          ) : (
            <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
              <input type="date" value={de} onChange={e => setDe(e.target.value)}
                style={{ padding:'7px 10px', borderRadius:'var(--radius)', border:'1px solid var(--border)',
                         background:'var(--surface)', color:'var(--text)', fontSize:13 }}/>
              <span style={{ color:'var(--text-muted)', fontSize:12.5 }}>até</span>
              <input type="date" value={ate} onChange={e => setAte(e.target.value)}
                style={{ padding:'7px 10px', borderRadius:'var(--radius)', border:'1px solid var(--border)',
                         background:'var(--surface)', color:'var(--text)', fontSize:13 }}/>
            </div>
          )}
        </div>

        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, flex:'1 1 220px',
                        background:'var(--surface-1)', borderRadius:'var(--radius)', padding:'7px 11px' }}>
            <Search size={14} style={{ color:'var(--text-muted)', flexShrink:0 }}/>
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar no relato ou por quem escreveu"
              style={{ border:'none', background:'none', outline:'none', width:'100%', fontSize:13, color:'var(--text)' }}/>
            {busca && <button onClick={() => setBusca('')} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:0 }}><X size={14}/></button>}
          </div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            <button onClick={() => setFiltroCat('')}
              style={{ padding:'5px 11px', borderRadius:99, fontSize:12, cursor:'pointer', fontWeight:600,
                       border:'1px solid var(--border)',
                       background: filtroCat === '' ? 'var(--text)' : 'transparent',
                       color: filtroCat === '' ? 'var(--surface)' : 'var(--text-muted)' }}>
              Todas
            </button>
            {Object.entries(CATEGORIAS).map(([id, c]) => (
              <button key={id} onClick={() => setFiltroCat(f => f === id ? '' : id)} title={c.desc}
                style={{ padding:'5px 11px', borderRadius:99, fontSize:12, cursor:'pointer', fontWeight:600,
                         border:`1px solid ${filtroCat === id ? c.cor : 'var(--border)'}`,
                         background: filtroCat === id ? c.cor : 'transparent',
                         color: filtroCat === id ? '#fff' : 'var(--text-muted)' }}>
                {c.nome}
              </button>
            ))}
          </div>
        </div>
      </div>

      {carregando ? (
        <div className="card" style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>Carregando...</div>
      ) : visiveis.length === 0 ? (
        <div className="card" style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>
          <CalendarDays size={30} style={{ opacity:.4, marginBottom:10 }}/>
          <div style={{ fontSize:14 }}>
            {termo || filtroCat ? 'Nenhum relato encontrado com esse filtro.'
              : modo === 'dia' ? `Nenhum relato para ${curta(dia)}.`
              : 'Nenhum relato no período.'}
          </div>
        </div>
      ) : (
        diasOrdenados.map(d => (
          <div key={d} style={{ marginBottom:18 }}>
            <div style={{ fontSize:12.5, fontWeight:700, color:'var(--text-muted)', marginBottom:8, textTransform:'capitalize' }}>
              {porExtenso(d)} · {porDia[d].length} {porDia[d].length === 1 ? 'relato' : 'relatos'}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {porDia[d].map(r => {
                const c = CATEGORIAS[r.categoria] || CATEGORIAS.outro;
                return (
                  <div key={r.id} className="card" style={{ borderLeft:`4px solid ${c.cor}`, borderRadius:'0 12px 12px 0' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10, marginBottom:8 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:9, minWidth:0 }}>
                        <Avatar url={r.autor?.avatar_url} name={r.autor?.full_name} size={28}/>
                        <div style={{ minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {r.autor?.full_name || 'Alguém'}
                          </div>
                          <div style={{ fontSize:11.5, color:'var(--text-muted)' }}>
                            {r.hora ? `${r.hora.slice(0,5)} · ` : ''}
                            <span style={{ color:c.cor, fontWeight:600 }}>{c.nome}</span>
                          </div>
                        </div>
                      </div>
                      {podeMexer(r) && (
                        <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                          <button onClick={() => setEditando({ id:r.id, data:r.data, hora:r.hora ? r.hora.slice(0,5) : '', categoria:r.categoria, texto:r.texto })}
                            aria-label="Editar relato"
                            style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:7, margin:-7 }}>
                            <Pencil size={15}/>
                          </button>
                          <button onClick={() => excluir(r)} aria-label="Excluir relato"
                            style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:7, margin:-7 }}>
                            <Trash2 size={15}/>
                          </button>
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize:13.5, lineHeight:1.6, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
                      {r.texto}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {editando && (
        <div onClick={() => setEditando(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000,
                   display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={e => e.stopPropagation()} className="card"
            style={{ width:'100%', maxWidth:520, maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <h2 style={{ fontSize:16, fontWeight:700 }}>{editando.id ? 'Editar relato' : 'Novo relato'}</h2>
              <button onClick={() => setEditando(null)} aria-label="Fechar"
                style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:6, margin:-6 }}>
                <X size={18}/>
              </button>
            </div>

            <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap' }}>
              <div style={{ flex:'1 1 150px' }}>
                <label style={{ fontSize:11.5, color:'var(--text-muted)', fontWeight:600, display:'block', marginBottom:5 }}>
                  DIA DO OCORRIDO
                </label>
                <input type="date" value={editando.data} max={hoje()}
                  onChange={e => setEditando({ ...editando, data:e.target.value })}
                  style={{ width:'100%', padding:'8px 10px', borderRadius:'var(--radius)',
                           border:'1px solid var(--border)', background:'var(--surface)', color:'var(--text)', fontSize:13 }}/>
              </div>
              <div style={{ flex:'0 0 110px' }}>
                <label style={{ fontSize:11.5, color:'var(--text-muted)', fontWeight:600, display:'block', marginBottom:5 }}>
                  HORA <span style={{ fontWeight:400 }}>(opcional)</span>
                </label>
                <input type="time" value={editando.hora}
                  onChange={e => setEditando({ ...editando, hora:e.target.value })}
                  style={{ width:'100%', padding:'8px 10px', borderRadius:'var(--radius)',
                           border:'1px solid var(--border)', background:'var(--surface)', color:'var(--text)', fontSize:13 }}/>
              </div>
            </div>

            <label style={{ fontSize:11.5, color:'var(--text-muted)', fontWeight:600, display:'block', marginBottom:6 }}>
              CATEGORIA
            </label>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14 }}>
              {Object.entries(CATEGORIAS).map(([id, c]) => (
                <button key={id} onClick={() => setEditando({ ...editando, categoria:id })} title={c.desc}
                  style={{ padding:'6px 12px', borderRadius:99, fontSize:12, cursor:'pointer', fontWeight:600,
                           border:`1px solid ${editando.categoria === id ? c.cor : 'var(--border)'}`,
                           background: editando.categoria === id ? c.cor : 'transparent',
                           color: editando.categoria === id ? '#fff' : 'var(--text-muted)' }}>
                  {c.nome}
                </button>
              ))}
            </div>
            <div style={{ fontSize:11.5, color:'var(--text-muted)', marginTop:-8, marginBottom:14 }}>
              {CATEGORIAS[editando.categoria]?.desc}
            </div>

            <label style={{ fontSize:11.5, color:'var(--text-muted)', fontWeight:600, display:'block', marginBottom:6 }}>
              O QUE ACONTECEU
            </label>
            <textarea
              value={editando.texto} rows={6} autoFocus
              onChange={e => setEditando({ ...editando, texto:e.target.value })}
              placeholder="Ex: Choveu forte das 8h às 14h, movimento bem abaixo do normal na manhã."
              style={{ width:'100%', padding:'10px 12px', borderRadius:'var(--radius)', resize:'vertical',
                       border:'1px solid var(--border)', background:'var(--surface)', color:'var(--text)',
                       fontSize:13.5, lineHeight:1.6, fontFamily:'inherit' }}/>

            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:16, gap:10 }}>
              {editando.id
                ? <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={() => excluir(editando)}>
                    <Trash2 size={14}/> Excluir
                  </button>
                : <span/>}
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-ghost" onClick={() => setEditando(null)}>Cancelar</button>
                <button className="btn btn-primary" onClick={salvar}>Salvar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
