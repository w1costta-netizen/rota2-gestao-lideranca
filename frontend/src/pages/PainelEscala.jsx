import { useState, useEffect, useCallback } from 'react';
import { Users, Coffee, LogIn, LogOut, AlertTriangle, RefreshCw } from 'lucide-react';
import api from '../api';

// ─────────────────────────────────────────────────────────────
// Painel da loja — quem DEVERIA estar em cada setor agora.
//
// Ele mostra o PLANEJADO, e diz isso na cara. O app não coleta ponto,
// chegada nem atraso: chamar de "presentes" o que na verdade é "escalados"
// seria inventar um dado, e um painel que mente uma vez não é consultado de
// novo. O que ele resolve já é o que ninguém responde hoje sem abrir a
// escala e contar na mão — quantas pessoas deveriam estar na padaria agora.
// ─────────────────────────────────────────────────────────────

const FILTROS = [
  { chave: 'na_loja',  rotulo: 'Na loja' },
  { chave: 'intervalo', rotulo: 'Em intervalo' },
  { chave: 'a_entrar',  rotulo: 'A entrar' },
  { chave: 'ja_saiu',   rotulo: 'Já saiu' },
];

const CORES = {
  na_loja:   { fundo: '#16a34a22', texto: '#16a34a', rotulo: 'Na loja' },
  intervalo: { fundo: '#f59e0b22', texto: '#f59e0b', rotulo: 'Intervalo' },
  a_entrar:  { fundo: '#3b82f622', texto: '#3b82f6', rotulo: 'A entrar' },
  ja_saiu:   { fundo: '#64748b22', texto: '#94a3b8', rotulo: 'Já saiu' },
  sem_hora:  { fundo: '#64748b22', texto: '#94a3b8', rotulo: '—' },
};

function turnoDe(hora) {
  if (hora < 6)  return 'Madrugada';
  if (hora < 12) return 'Manhã';
  if (hora < 18) return 'Tarde';
  return 'Noite';
}

function KPI({ icone: Ic, valor, rotulo, cor }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: `${cor}22` }}>
        <Ic size={20} color={cor}/>
      </div>
      <div>
        <div className="stat-value">{valor}</div>
        <div className="stat-label">{rotulo}</div>
      </div>
    </div>
  );
}

export default function PainelEscala({ profile }) {
  const [relogio, setRelogio] = useState(new Date());
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [filtro, setFiltro] = useState('na_loja');
  const [setorAberto, setSetorAberto] = useState(null);

  // O relógio anda sozinho; os dados não. Bater no servidor a cada segundo
  // seria desperdício — a escala não muda de minuto a minuto.
  useEffect(() => {
    const t = setInterval(() => setRelogio(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const carregar = useCallback(async () => {
    if (!profile?.company) { setCarregando(false); return; }
    const agora = new Date();
    // O minuto vai daqui, não do servidor: ele roda em UTC e a loja não.
    const minuto = agora.getHours() * 60 + agora.getMinutes();
    const dia = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
    try {
      const r = await api.get(`/schedule/painel?company=${encodeURIComponent(profile.company)}&data=${dia}&minuto=${minuto}`);
      setDados(r.data);
      setErro(false);
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, [profile?.company]);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 60000);
    return () => clearInterval(t);
  }, [carregar]);

  const hhmmss = relogio.toLocaleTimeString('pt-BR');
  const totais = dados?.totais || {};
  const setores = dados?.setores || [];

  const todasPessoas = setores.flatMap(s => s.pessoas.map(p => ({ ...p, setor: s.setor })));
  const visiveis = todasPessoas
    .filter(p => p.situacao === filtro)
    .filter(p => !setorAberto || p.setor === setorAberto)
    .sort((a, b) => a.entrouMin - b.entrouMin || a.nome.localeCompare(b.nome, 'pt-BR'));

  // Semáforo: com mínimo cadastrado, a régua é ele. Sem mínimo, a régua é o
  // pico do próprio setor no dia — é a única comparação honesta disponível,
  // e não inventa um número que ninguém definiu.
  const semaforo = (s) => {
    const alvo = s.minimo ?? s.pico;
    if (!alvo) return { cor: '#64748b', pct: 0 };
    const pct = Math.min((s.naLoja / alvo) * 100, 100);
    const cor = s.minimo != null
      ? (s.naLoja < s.minimo ? '#dc2626' : '#16a34a')
      : (pct >= 70 ? '#16a34a' : pct >= 40 ? '#f59e0b' : '#dc2626');
    return { cor, pct };
  };

  if (carregando) return (
    <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
      Carregando o painel...
    </div>
  );

  return (
    <div>
      {/* Cabeçalho */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{profile?.company || 'Painel da loja'}</h1>
          <p className="page-subtitle">
            Turno da {turnoDe(relogio.getHours()).toLowerCase()} ·{' '}
            {relogio.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {hhmmss}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>atualiza a cada minuto</div>
          </div>
          <button className="btn-icon" onClick={carregar} title="Atualizar agora"><RefreshCw size={16}/></button>
        </div>
      </div>

      {erro && (
        <div className="card" style={{ marginBottom: 16, color: 'var(--danger)', fontSize: 13 }}>
          Não foi possível atualizar o painel. Tentando de novo em 1 minuto.
        </div>
      )}

      {/* Alertas de cobertura */}
      {dados?.alertas?.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid #dc2626' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <AlertTriangle size={16} color="#dc2626"/>
            <b style={{ fontSize: 14 }}>Precisa de atenção</b>
          </div>
          {dados.alertas.map(a => (
            <div key={`${a.tipo}-${a.setor}`} style={{ fontSize: 13, padding: '3px 0' }}>
              <b>{a.setor}</b>{' — '}
              {a.tipo === 'sem_escala'
                ? 'escala deste mês ainda não foi lançada'
                : `${a.naLoja} na loja, mínimo ${a.minimo}`}
            </div>
          ))}
        </div>
      )}

      {/* KPIs — os rótulos dizem "escalado", não "presente": é o que o dado é */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <KPI icone={Users}  valor={totais.naLoja ?? 0}        rotulo="Escalados na loja agora" cor="#16a34a"/>
        <KPI icone={Coffee} valor={totais.intervalo ?? 0}     rotulo="Em intervalo"            cor="#f59e0b"/>
        <KPI icone={LogIn}  valor={totais.aEntrar ?? 0}       rotulo="Ainda entram hoje"       cor="#3b82f6"/>
        <KPI icone={LogOut} valor={totais.jaSaiu ?? 0}        rotulo="Já saíram"               cor="#94a3b8"/>
      </div>

      {/* Cobertura por setor */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ fontWeight: 700, fontSize: 15 }}>Cobertura por setor</h3>
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
            {dados?.temMinimoConfigurado
              ? 'comparado ao efetivo mínimo cadastrado'
              : 'comparado ao pico do próprio setor hoje — cadastre o mínimo para ter alerta'}
          </span>
        </div>

        {setores.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Ninguém escalado hoje nesta loja.
          </p>
        ) : setores.map(s => {
          const { cor, pct } = semaforo(s);
          const aberto = setorAberto === s.setor;
          const vazio = s.semEscalaHoje;
          return (
            <div key={s.setor}
              onClick={() => !vazio && setSetorAberto(aberto ? null : s.setor)}
              style={{ padding: '9px 0', borderBottom: '1px solid var(--border)',
                       cursor: vazio ? 'default' : 'pointer', opacity: vazio ? .75 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
                               background: vazio ? 'transparent' : cor,
                               border: vazio ? '1.5px dashed var(--text-muted)' : 'none' }}/>
                <span style={{ fontWeight: aberto ? 800 : 600, fontSize: 13.5, flex: 1, minWidth: 120 }}>
                  {s.setor}
                </span>

                {/* Os dois vazios não são a mesma coisa e o painel não pode
                    misturá-los: um é escala esquecida, o outro é um dia sem
                    ninguém numa escala que existe. */}
                {vazio ? (
                  <span style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 99, padding: '2px 9px',
                                 color: s.semEscalaNoMes ? '#dc2626' : 'var(--text-muted)',
                                 background: s.semEscalaNoMes ? '#dc262618' : 'var(--surface-2)',
                                 border: `1px solid ${s.semEscalaNoMes ? '#dc262640' : 'var(--border)'}` }}>
                    {s.semEscalaNoMes ? 'escala não lançada' : 'ninguém escalado hoje'}
                  </span>
                ) : (<>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {s.intervalo > 0 && `${s.intervalo} em intervalo · `}
                    {s.aEntrar > 0 && `${s.aEntrar} a entrar · `}
                    {s.totalDia} no dia
                  </span>
                  <span style={{ fontWeight: 800, fontSize: 15, color: cor, minWidth: 54, textAlign: 'right' }}>
                    {s.naLoja}{s.minimo != null ? ` / ${s.minimo}` : ''}
                  </span>
                </>)}
              </div>
              {!vazio && (
                <div style={{ height: 6, borderRadius: 99, background: 'var(--surface-2)', overflow: 'hidden', marginTop: 6 }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: cor, transition: 'width .3s' }}/>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pessoas */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ fontWeight: 700, fontSize: 15, marginRight: 4 }}>Colaboradores</h3>
          {FILTROS.map(f => {
            const n = todasPessoas.filter(p => p.situacao === f.chave).length;
            const ativo = filtro === f.chave;
            return (
              <button key={f.chave} onClick={() => setFiltro(f.chave)}
                style={{ padding: '4px 11px', borderRadius: 99, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                         background: ativo ? CORES[f.chave].texto : 'var(--surface-2)',
                         color: ativo ? '#fff' : 'var(--text-muted)',
                         border: `1px solid ${ativo ? CORES[f.chave].texto : 'var(--border)'}` }}>
                {f.rotulo} · {n}
              </button>
            );
          })}
          {setorAberto && (
            <button onClick={() => setSetorAberto(null)}
              style={{ padding: '4px 11px', borderRadius: 99, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                       background: 'var(--primary)', color: '#fff', border: 'none' }}>
              {setorAberto} ✕
            </button>
          )}
        </div>

        {visiveis.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: '10px 0' }}>
            Ninguém neste filtro agora.
          </p>
        ) : visiveis.map((p, i) => (
          <div key={`${p.nome}-${i}`} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0',
            borderBottom: i < visiveis.length - 1 ? '1px solid var(--border)' : 'none', flexWrap: 'wrap',
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                           background: CORES[p.situacao]?.texto || '#94a3b8' }}/>
            <div style={{ flex: 1, minWidth: 150 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{p.nome}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                {p.setor}{p.cargo ? ` · ${p.cargo}` : ''}
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>
              <div style={{ fontVariantNumeric: 'tabular-nums' }}>{p.entrada} – {p.saida}</div>
              {p.intervalo && (
                <div style={{ fontSize: 11 }}>intervalo {p.intervalo}–{p.retorno}</div>
              )}
            </div>
            <span style={{ fontSize: 10.5, fontWeight: 800, borderRadius: 99, padding: '2px 9px', flexShrink: 0,
                           background: CORES[p.situacao]?.fundo, color: CORES[p.situacao]?.texto }}>
              {CORES[p.situacao]?.rotulo}
            </span>
          </div>
        ))}
      </div>

      {/* Próximo turno */}
      {dados?.proximoTurno && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
            Próximos a entrar — {dados.proximoTurno.hora}
          </h3>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 12 }}>
            {dados.proximoTurno.pessoas.length} pessoa(s) entram no próximo horário
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {dados.proximoTurno.pessoas.map((p, i) => (
              <div key={i} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '7px 11px',
                                    border: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 600, fontSize: 12.5 }}>{p.nome}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {p.setor} · até {p.saida}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, textAlign: 'center' }}>
        Este painel mostra a escala <b>planejada</b> — quem deveria estar em cada setor agora.
        O app não registra ponto, então ele não diz quem de fato chegou.
      </p>
    </div>
  );
}
