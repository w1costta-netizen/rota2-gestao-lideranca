import { useState, useEffect, useCallback } from 'react';
import { Users, Coffee, LogIn, LogOut, AlertTriangle, RefreshCw, Crown } from 'lucide-react';
import api from '../api';
import ExportMenu from '../components/ExportMenu';
import { gerarPDF, compartilharWhatsApp, compartilharArquivo } from '../lib/exportUtils';
import { useToast } from '../components/Toast';

// Data local (Brasília) em AAAA-MM-DD, sem passar pelo UTC do toISOString.
const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const somarDias = (iso, n) => { const [a, m, d] = iso.split('-').map(Number); return isoLocal(new Date(a, m - 1, d + n)); };
const dataDe = (iso) => { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d, 12); };
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

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
  const toast = useToast();
  const [relogio, setRelogio] = useState(new Date());
  // Previsibilidade: dá para olhar um dia à frente. Em outro dia não existe
  // "agora", então a pessoa escolhe a hora para simular ("como vai estar a
  // loja quinta às 14h"). Hoje segue o relógio e atualiza sozinho.
  const [dia, setDia] = useState(() => isoLocal(new Date()));
  const [horaSim, setHoraSim] = useState(() => { const n = new Date(); return hhmm(n.getHours() * 60 + n.getMinutes()); });
  const ehHoje = dia === isoLocal(new Date());
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
    // Em outro dia, o minuto é o da hora simulada.
    const [hs, ms] = horaSim.split(':').map(Number);
    const minuto = ehHoje ? agora.getHours() * 60 + agora.getMinutes() : (hs * 60 + (ms || 0));
    try {
      const r = await api.get(`/schedule/painel?company=${encodeURIComponent(profile.company)}&data=${dia}&minuto=${minuto}`);
      setDados(r.data);
      setErro(false);
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, [profile?.company, dia, horaSim, ehHoje]);

  useEffect(() => {
    carregar();
    if (!ehHoje) return undefined;   // dia futuro não muda sozinho
    const t = setInterval(carregar, 60000);
    return () => clearInterval(t);
  }, [carregar, ehHoje]);

  // "agora" vira "às 14:00 de quinta" quando não é hoje.
  const quando = ehHoje ? 'agora' : `às ${horaSim}`;
  const rotuloDia = ehHoje ? 'hoje' : dataDe(dia).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });

  // ── Relatório do dia: PDF e WhatsApp ───────────────────────────
  // O relatório é o PLANO do dia inteiro (quem está escalado, horários,
  // intervalos, por setor), não só a foto do momento — é o que se manda
  // para o grupo de manhã.
  const tituloRel = `Escala do dia — ${dataDe(dia).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}`;
  const montarPDF = (saida = 'download') => {
    const sets = dados?.setores || [];
    const colunas = [{ header: 'Nome', dataKey: 'n' }, { header: 'Cargo', dataKey: 'c' }, { header: 'Entrada', dataKey: 'e' }, { header: 'Saída', dataKey: 's' }, { header: 'Intervalo', dataKey: 'i' }];
    const secoes = [];
    if (dados?.lideranca?.configurada) {
      const lid = [...(dados.lideranca.naLoja || []), ...(dados.lideranca.emIntervalo || [])];
      if (lid.length) secoes.push({ titulo: `Liderança (${quando})`, colunas: [{ header: 'Nome', dataKey: 'n' }, { header: 'Cargo', dataKey: 'c' }, { header: 'Até', dataKey: 's' }],
        rows: lid.map(l => ({ n: l.nome, c: l.cargo || '', s: l.saida || l.retorno || '' })) });
    }
    sets.filter(st => st.pessoas?.length).forEach(st => secoes.push({
      titulo: `${st.setor} — ${st.totalDia} no dia${st.minimo != null ? ` · mínimo ${st.minimo}` : ''}`,
      colunas,
      rows: [...st.pessoas].sort((a, b) => a.entrouMin - b.entrouMin).map(p => ({ n: p.nome, c: p.cargo || '', e: p.entrada || '', s: p.saida || '', i: p.intervalo ? `${p.intervalo}–${p.retorno}` : '' })),
    }));
    if (!secoes.length) { toast('Ninguém escalado neste dia.', 'error'); return null; }
    return gerarPDF({ titulo: tituloRel, subtitulo: `${profile?.company || ''} · ${todasPessoas.length} escalado(s)${dados?.alertas?.length ? ` · ${dados.alertas.length} alerta(s)` : ''}`, secoes, orientacao: 'portrait', saida });
  };
  const textoWhats = () => {
    const sets = (dados?.setores || []).filter(st => st.pessoas?.length);
    if (!sets.length) return '';
    let t = `*${tituloRel}*\n${profile?.company || ''} · ${todasPessoas.length} escalado(s)\n`;
    (dados?.alertas || []).forEach(a => { t += `⚠️ ${a.setor}: ${a.tipo === 'sem_lider' ? 'sem líder' : a.tipo === 'sem_escala' ? 'escala não lançada' : `${a.naLoja} na loja, mínimo ${a.minimo}`}\n`; });
    sets.forEach(st => {
      t += `\n*${st.setor}* (${st.totalDia})\n`;
      [...st.pessoas].sort((a, b) => a.entrouMin - b.entrouMin).forEach(p => { t += `• ${p.nome} ${p.entrada}–${p.saida}${p.intervalo ? ` (int. ${p.intervalo})` : ''}\n`; });
    });
    return t + '\n_Enviado via Rota Líder_';
  };
  const whatsTexto = () => { const t = textoWhats(); if (!t) return toast('Ninguém escalado neste dia.', 'error'); compartilharWhatsApp(t); };
  const pdfWhats = async () => {
    const r = montarPDF('blob'); if (!r) return;
    const res = await compartilharArquivo({ ...r, texto: tituloRel });
    if (res === 'baixado') toast('PDF baixado. No WhatsApp, anexe o arquivo que acabou de baixar.');
  };

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
            {ehHoje
              ? <>Turno da {turnoDe(relogio.getHours()).toLowerCase()} · {relogio.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</>
              : <>Previsão para {dataDe(dia).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })} às {horaSim}</>}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {ehHoje ? (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{hhmmss}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>atualiza a cada minuto</div>
            </div>
          ) : (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-muted)' }}>
              Ver como às
              <input type="time" value={horaSim} onChange={e => e.target.value && setHoraSim(e.target.value)}
                style={{ padding: '6px 8px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }}/>
            </label>
          )}
          <ExportMenu label="Relatório do dia" disabled={!dados} onPDF={() => montarPDF()} onWhatsApp={whatsTexto} onPDFWhatsApp={pdfWhats}/>
          <button className="btn-icon" onClick={carregar} title="Atualizar agora"><RefreshCw size={16}/></button>
        </div>
      </div>

      {/* Dias à frente: hoje + 6 dias, ou qualquer data. */}
      <div className="card" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', padding: '8px 12px', marginBottom: 16 }}>
        {Array.from({ length: 7 }, (_, i) => somarDias(isoLocal(new Date()), i)).map((d, i) => {
          const ativo = d === dia;
          const rot = i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : dataDe(d).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
          return (
            <button key={d} onClick={() => setDia(d)}
              style={{ padding: '5px 11px', borderRadius: 99, fontSize: 12, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize',
                       border: `1px solid ${ativo ? 'var(--primary)' : 'var(--border)'}`, background: ativo ? 'var(--primary)' : 'transparent', color: ativo ? '#fff' : 'var(--text-muted)' }}>
              {rot} <span style={{ fontWeight: 400, opacity: .8 }}>{d.slice(8, 10)}/{d.slice(5, 7)}</span>
            </button>
          );
        })}
        <input type="date" value={dia} onChange={e => e.target.value && setDia(e.target.value)}
          style={{ marginLeft: 'auto', padding: '5px 8px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12.5 }}/>
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
              {a.tipo === 'sem_lider'
                ? `nenhum líder na loja ${quando} — ${a.detalhe}`
                : a.tipo === 'sem_escala'
                  ? 'escala deste mês ainda não foi lançada'
                  : `${a.naLoja} na loja, mínimo ${a.minimo}`}
            </div>
          ))}
        </div>
      )}

      {/* KPIs — os rótulos dizem "escalado", não "presente": é o que o dado é */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <KPI icone={Users}  valor={totais.naLoja ?? 0}        rotulo={`Escalados na loja ${quando}`} cor="#16a34a"/>
        <KPI icone={Coffee} valor={totais.intervalo ?? 0}     rotulo="Em intervalo"            cor="#f59e0b"/>
        <KPI icone={LogIn}  valor={totais.aEntrar ?? 0}       rotulo={ehHoje ? 'Ainda entram hoje' : 'Entram depois'} cor="#3b82f6"/>
        <KPI icone={LogOut} valor={totais.jaSaiu ?? 0}        rotulo="Já saíram"               cor="#94a3b8"/>
      </div>

      {/* Liderança — quem responde pela loja agora.
          Fica antes dos setores porque é a pergunta de maior consequência:
          um setor curto atrasa o atendimento, uma loja sem ninguém
          respondendo por ela trava qualquer decisão. */}
      {dados?.lideranca && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Crown size={16} color="#a16207"/>
            <h3 style={{ fontWeight: 700, fontSize: 15 }}>Liderança</h3>
          </div>

          {!dados.lideranca.configurada ? (
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Nenhuma escala está marcada como a da liderança. Abra a escala dos líderes
              e toque em <b>É a liderança?</b> na barra do topo — a partir daí este bloco
              mostra quem responde pela loja a cada momento.
            </p>
          ) : (<>
            {dados.lideranca.naLoja.length > 0 ? (<>
              {/* "Na loja agora", e nao "de plantao": o app nao registra
                  plantao, e chamar assim seria dar ao gestor uma certeza que
                  o dado nao sustenta. Varios lideres podem estar escalados ao
                  mesmo tempo sem que nenhum responda formalmente pela loja. */}
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)',
                            textTransform: 'uppercase', letterSpacing: .4, marginBottom: 7 }}>
                Na loja {quando}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                {dados.lideranca.naLoja.map((l, i) => (
                  <div key={i} style={{ background: '#fef9c3', border: '1px solid #fde047',
                                        borderRadius: 8, padding: '8px 12px' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#713f12' }}>{l.nome}</div>
                    <div style={{ fontSize: 11.5, color: '#a16207' }}>
                      {l.cargo ? `${l.cargo} · ` : ''}até {l.saida}
                    </div>
                  </div>
                ))}
              </div>
            </>) : (
              <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 700, marginBottom: 10 }}>
                Nenhum líder na loja {quando}
                {dados.lideranca.emIntervalo.length > 0 &&
                  ` — em intervalo, volta ${dados.lideranca.emIntervalo[0].retorno}`}
                {dados.lideranca.proximo && dados.lideranca.emIntervalo.length === 0 &&
                  ` — ${dados.lideranca.proximo.nome} entra ${dados.lideranca.proximo.entrada}`}
              </div>
            )}

            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {dados.lideranca.escaladosHoje} líder(es) escalado(s) {rotuloDia}
              {dados.lideranca.proximo && ` · próximo entra ${dados.lideranca.proximo.entrada}`}
            </div>

            {/* Estar no time e ter horário lançado são coisas diferentes — o
                painel não pode dizer "fora da escala" para quem só está
                esperando o horário ser preenchido. */}
            {dados.lideranca.semHorario?.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#d97706', marginBottom: 4 }}>
                  {dados.lideranca.semHorario.length} no time da liderança, sem horário lançado neste mês
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  {dados.lideranca.semHorario.slice(0, 10).join(' · ')}
                  {dados.lideranca.semHorario.length > 10 && ` +${dados.lideranca.semHorario.length - 10}`}
                </div>
              </div>
            )}

            {dados.lideranca.foraDeEscala?.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  {dados.lideranca.foraDeEscala.length} com acesso de liderança fora da escala
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  {dados.lideranca.foraDeEscala.slice(0, 10).map(l => l.nome).join(' · ')}
                  {dados.lideranca.foraDeEscala.length > 10 && ` +${dados.lideranca.foraDeEscala.length - 10}`}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 5 }}>
                  Comparado pelo nome: quem estiver escrito diferente no cadastro do time
                  aparece aqui mesmo estando na escala.
                </div>
              </div>
            )}
          </>)}
        </div>
      )}

      {/* Cobertura por setor */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ fontWeight: 700, fontSize: 15 }}>Cobertura por setor</h3>
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
            {dados?.temMinimoConfigurado
              ? 'comparado ao efetivo mínimo cadastrado'
              : `comparado ao pico do próprio setor ${rotuloDia} — cadastre o mínimo para ter alerta`}
          </span>
        </div>

        {setores.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Ninguém escalado {rotuloDia} nesta loja.
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
                    {s.semEscalaNoMes ? 'escala não lançada' : `ninguém escalado ${rotuloDia}`}
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
            Ninguém neste filtro {quando}.
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
        Este painel mostra a escala <b>planejada</b> — quem deveria estar em cada setor {quando}.
        O app não registra ponto, então ele não diz quem de fato chegou.
      </p>
    </div>
  );
}
