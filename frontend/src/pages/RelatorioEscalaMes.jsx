import React, { useEffect, useState } from 'react';
import { X, Download, AlertTriangle, CheckCircle2, Crown, Users, Sun, Clock, CalendarOff } from 'lucide-react';
import api from '../api';
import { gerarPDFTexto } from '../lib/exportUtils';

// ─────────────────────────────────────────────────────────────
// Relatório do mês da LOJA INTEIRA.
//
// A "Análise" olha uma escala por vez e procura infração de jornada. Esta
// tela responde o que ninguém consegue respondendo escala por escala: em
// que dia faltou líder, que horário fica descoberto todo mês, onde as
// folgas se amontoaram, quanta gente está de férias.
//
// Cada achado traz a DATA e uma sugestão. Número solto não faz ninguém
// mudar a escala — e relatório que grita à toa não é lido na segunda vez.
// ─────────────────────────────────────────────────────────────

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const Bloco = ({ icone: Icone, titulo, cor = 'var(--text)', children, vazio }) => (
  <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
      <Icone size={15} style={{ color: cor, flexShrink: 0 }}/>
      <b style={{ fontSize: 13.5 }}>{titulo}</b>
    </div>
    {vazio
      ? <div style={{ fontSize: 12.5, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <CheckCircle2 size={13}/> {vazio}
        </div>
      : children}
  </div>
);

const Linha = ({ children, alerta }) => (
  <div style={{ fontSize: 12.5, lineHeight: 1.6, padding: '3px 0',
                color: alerta ? 'var(--danger)' : 'var(--text-muted)' }}>{children}</div>
);

const Dica = ({ children }) => (
  <div style={{ marginTop: 8, background: 'rgba(232,98,42,.07)', border: '1px solid rgba(232,98,42,.2)',
                borderRadius: 8, padding: '7px 10px', fontSize: 12.5, lineHeight: 1.55 }}>
    💡 {children}
  </div>
);

export default function RelatorioEscalaMes({ userId, profile, ano, mes, aoFechar, toast }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const q = `requester_id=${userId}&year=${ano}&month=${mes}${profile?.company ? `&company=${encodeURIComponent(profile.company)}` : ''}`;
    api.get(`/schedule/relatorio-mes?${q}`)
      .then(r => setDados(r.data))
      .catch(e => setErro(e?.response?.data?.error || 'Não foi possível montar o relatório.'));
  }, [userId, ano, mes, profile?.company]);

  const periodo = `${MESES[mes - 1]} de ${ano}`;

  const baixarPDF = () => {
    if (!dados) return;
    const blocos = [];
    const add = (titulo, texto) => { if (texto) blocos.push({ titulo, texto }); };

    add('Resumo', [
      `${dados.escalas} escala(s) lançadas · ${dados.linhas} lançamentos · ${dados.mes.diasAbertos} dias com movimento.`,
      `Mediana de ${dados.medianaTrabalham} pessoas escaladas por dia.`,
      dados.ferias.quantas ? `${dados.ferias.quantas} pessoa(s) de férias, somando ${dados.ferias.totalDias} dias.` : 'Ninguém de férias no mês.',
    ].join('\n'));

    if (dados.lideranca.existe) {
      add('Cobertura da liderança', [
        dados.lideranca.semNinguem.length
          ? `Dias SEM nenhum líder escalado: ${dados.lideranca.semNinguem.map(d => d.rotulo).join(', ')}.`
          : 'Nenhum dia ficou sem líder escalado.',
        dados.lideranca.umSo.length ? `Dias com um líder só: ${dados.lideranca.umSo.map(d => `${d.rotulo} (${d.quem})`).join(', ')}.` : '',
        dados.lideranca.buracos.length
          ? `Faixas do dia sem líder:\n${dados.lideranca.buracos.map(b => `  - ${b.rotulo}: ${b.faixas.map(f => `${f.de} as ${f.ate}`).join(', ')}`).join('\n')}`
          : '',
        dados.lideranca.horariosCriticos.length
          ? `Horarios que se repetem descobertos: ${dados.lideranca.horariosCriticos.map(h => `${h.hora} (${h.diasSem} dias)`).join(', ')}.`
          : '',
      ].filter(Boolean).join('\n'));
    } else {
      add('Cobertura da liderança', 'Nenhuma escala está marcada como "Escala da Liderança". Marque uma para o relatório medir a cobertura de líderes.');
    }

    if (dados.porCargo.quantos) {
      add('Líderes de setor (pelo cargo na escala)', [
        `${dados.porCargo.quantos} pessoa(s) com cargo de liderança na escala.`,
        dados.porCargo.semNinguem.length ? `Dias sem nenhum deles: ${dados.porCargo.semNinguem.map(d => d.rotulo).join(', ')}.` : 'Todos os dias tiveram ao menos um.',
      ].join('\n'));
    }

    if (dados.diasFracos.length) {
      add('Dias mais fracos', `Mediana do mês: ${dados.medianaTrabalham} pessoas.\n`
        + dados.diasFracos.map(d => `  - ${d.rotulo}: ${d.trabalham} escalados`).join('\n'));
    }
    if (dados.abaixoDoMinimo.length) {
      add('Abaixo do efetivo mínimo', dados.abaixoDoMinimo.slice(0, 40)
        .map(a => `  - ${a.rotulo} · ${a.setor}: ${a.escalados} escalado(s), mínimo ${a.minimo}`).join('\n'));
    }
    if (dados.setoresComMuitaFolga.length) {
      add('Folgas amontoadas', dados.setoresComMuitaFolga
        .map(s => `  - ${s.rotulo} · ${s.setor}: ${s.folgam} de ${s.time} de folga (${s.trabalham} trabalhando)`).join('\n'));
    }
    if (dados.ferias.quantas) {
      add('Férias do mês', dados.ferias.pessoas
        .map(p => `  - ${p.nome}${p.setor ? ` (${p.setor})` : ''}: ${p.dias} dias, de ${p.de.slice(8)}/${p.de.slice(5, 7)} a ${p.ate.slice(8)}/${p.ate.slice(5, 7)}`).join('\n'));
    }
    if (dados.curva.pico) {
      add('Curva de horário', `Pico as ${dados.curva.pico.hora} com ${dados.curva.pico.media} pessoas em media.\n`
        + `Horarios mais finos: ${dados.curva.vales.map(v => `${v.hora} (${v.media})`).join(', ')}.`);
    }
    if (dados.equipe.desequilibrio.length) {
      add('Quem sempre fecha', dados.equipe.desequilibrio.map(d =>
        `  - ${d.setor}: ${d.maior.nome} fechou ${d.maior.fechamentos}x e ${d.menor.nome} ${d.menor.fechamentos}x`).join('\n'));
    }
    if (dados.naoEntregues.length) {
      add('Escalas ainda não fechadas', dados.naoEntregues.map(e => `  - ${e.nome}${e.setor && e.setor !== e.nome ? ` (${e.setor})` : ''}`).join('\n'));
    }

    gerarPDFTexto({ titulo: 'Relatório da escala — loja inteira', subtitulo: `${profile?.company || ''} · ${periodo}`, blocos });
  };

  return (
    <div className="modal-overlay" onClick={ev => ev.target === ev.currentTarget && aoFechar()}>
      <div className="modal" style={{ maxWidth: 760 }}>
        <div className="modal-header">
          <span className="modal-title">Relatório da escala — loja inteira</span>
          <button className="btn-icon" onClick={aoFechar}><X size={16}/></button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>{periodo}</div>

          {erro && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{erro}</p>}
          {!dados && !erro && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Lendo as escalas do mês...</p>}
          {dados?.vazio && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nenhuma escala lançada neste mês.</p>}

          {dados && !dados.vazio && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 14 }}>
                {[['Escalas', dados.escalas], ['Dias com movimento', dados.mes.diasAbertos],
                  ['Pessoas/dia (mediana)', dados.medianaTrabalham], ['De férias', dados.ferias.quantas]].map(([r, v]) => (
                  <div key={r} style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '9px 11px' }}>
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>{r}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* ── Liderança ── */}
              <Bloco icone={Crown} titulo="Cobertura da liderança" cor="#a16207"
                vazio={dados.lideranca.existe && !dados.lideranca.semNinguem.length && !dados.lideranca.buracos.length && !dados.lideranca.umSo.length
                  ? 'Nenhum dia ficou sem líder, e não há faixa do dia descoberta.' : null}>
                {!dados.lideranca.existe ? (
                  <Linha alerta>Nenhuma escala está marcada como <b>Escala da Liderança</b> — sem isso não dá para medir cobertura de líder. Abra a escala da liderança e clique em &quot;É a liderança?&quot;.</Linha>
                ) : (
                  <>
                    {dados.lideranca.semNinguem.length > 0 && (
                      <Linha alerta><b>{dados.lideranca.semNinguem.length} dia(s) sem nenhum líder:</b> {dados.lideranca.semNinguem.map(d => d.rotulo).join(' · ')}</Linha>
                    )}
                    {dados.lideranca.umSo.length > 0 && (
                      <Linha><b>{dados.lideranca.umSo.length} dia(s) com um líder só:</b> {dados.lideranca.umSo.slice(0, 8).map(d => `${d.rotulo} (${d.quem})`).join(' · ')}{dados.lideranca.umSo.length > 8 ? ' …' : ''}</Linha>
                    )}
                    {dados.lideranca.buracos.length > 0 && (
                      <>
                        <Linha alerta><b>Faixas do dia sem líder na loja:</b></Linha>
                        {dados.lideranca.buracos.slice(0, 10).map(b => (
                          <Linha key={b.data}>· {b.rotulo}: {b.faixas.map(f => `${f.de} às ${f.ate}`).join(', ')}</Linha>
                        ))}
                      </>
                    )}
                    {dados.lideranca.horariosCriticos.length > 0 && (
                      <Dica>
                        O buraco se repete sempre no mesmo horário: <b>{dados.lideranca.horariosCriticos.map(h => `${h.hora} (${h.diasSem} dias)`).join(', ')}</b>.
                        {' '}Não é falha de um dia — é o desenho do turno. Vale deslocar a entrada ou a saída de um líder para cobrir essa faixa.
                      </Dica>
                    )}
                  </>
                )}
              </Bloco>

              {/* ── Líderes de setor ── */}
              {dados.porCargo.quantos > 0 && (
                <Bloco icone={Users} titulo={`Líderes de setor (${dados.porCargo.quantos} pelo cargo na escala)`} cor="#6366f1"
                  vazio={!dados.porCargo.semNinguem.length ? 'Todos os dias tiveram ao menos um líder de setor escalado.' : null}>
                  <Linha alerta><b>{dados.porCargo.semNinguem.length} dia(s) sem nenhum:</b> {dados.porCargo.semNinguem.map(d => d.rotulo).join(' · ')}</Linha>
                </Bloco>
              )}

              {/* ── Gente por dia ── */}
              <Bloco icone={Sun} titulo="Dias mais fracos" cor="#d97706"
                vazio={!dados.diasFracos.length ? `Nenhum dia ficou muito abaixo da mediana (${dados.medianaTrabalham} pessoas).` : null}>
                {dados.diasFracos.map(d => (
                  <Linha key={d.data}>· <b>{d.rotulo}</b>: {d.trabalham} escalados — a mediana do mês é {d.mediana}</Linha>
                ))}
                {dados.diasFracos.length > 0 && <Dica>Confira se esses dias caem em data de movimento (véspera de feriado, dia de pagamento). Dia fraco no papel vira fila no caixa.</Dica>}
              </Bloco>

              {/* ── Efetivo mínimo ── */}
              {Object.keys(dados.abaixoDoMinimo).length >= 0 && (
                <Bloco icone={AlertTriangle} titulo="Abaixo do efetivo mínimo" cor="var(--danger)"
                  vazio={!dados.abaixoDoMinimo.length ? 'Nenhum setor ficou abaixo do mínimo cadastrado.' : null}>
                  {dados.abaixoDoMinimo.slice(0, 12).map((a, i) => (
                    <Linha key={i} alerta>· <b>{a.rotulo}</b> · {a.setor}: {a.escalados} escalado(s), mínimo {a.minimo}</Linha>
                  ))}
                  {dados.abaixoDoMinimo.length > 12 && <Linha>… e mais {dados.abaixoDoMinimo.length - 12}. O PDF traz a lista completa.</Linha>}
                </Bloco>
              )}

              {/* ── Folgas ── */}
              <Bloco icone={CalendarOff} titulo="Folgas amontoadas" cor="#9d174d"
                vazio={!dados.setoresComMuitaFolga.length ? 'Nenhum setor ficou com metade ou mais do time de folga no mesmo dia.' : null}>
                {dados.setoresComMuitaFolga.map((s, i) => (
                  <Linha key={i}>· <b>{s.rotulo}</b> · {s.setor}: <b>{s.folgam} de {s.time}</b> de folga, sobraram {s.trabalham} trabalhando</Linha>
                ))}
                {dados.setoresComMuitaFolga.length > 0 && <Dica>Folga é direito, o problema é a coincidência. Espalhe as folgas do setor ao longo da semana em vez de concentrar no mesmo dia.</Dica>}
              </Bloco>

              {/* ── Férias ── */}
              <Bloco icone={Sun} titulo={`Férias do mês — ${dados.ferias.quantas} pessoa(s), ${dados.ferias.totalDias} dias`} cor="#92400e"
                vazio={!dados.ferias.quantas ? 'Ninguém de férias neste mês.' : null}>
                {dados.ferias.pessoas.map((p, i) => (
                  <Linha key={i}>· <b>{p.nome}</b>{p.setor ? ` · ${p.setor}` : ''}: {p.dias} dias, de {p.de.slice(8)}/{p.de.slice(5, 7)} a {p.ate.slice(8)}/{p.ate.slice(5, 7)}</Linha>
                ))}
                {dados.ferias.porSemana.length > 1 && (
                  <Linha>Peso por semana do mês: {dados.ferias.porSemana.map(s => `${s.semana}ª: ${s.dias} dia(s)`).join(' · ')}</Linha>
                )}
              </Bloco>

              {/* ── Curva de horário ── */}
              {dados.curva.pontos.length > 0 && (
                <Bloco icone={Clock} titulo="Curva de horário da loja" cor="#0369a1">
                  <Linha>Pico às <b>{dados.curva.pico.hora}</b> com {dados.curva.pico.media} pessoas em média.</Linha>
                  <Linha>Horários mais finos: {dados.curva.vales.map(v => `${v.hora} (${v.media})`).join(' · ')}</Linha>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 70, marginTop: 10 }}>
                    {dados.curva.pontos.map(p => (
                      <div key={p.hora} title={`${p.hora} — ${p.media} pessoas`}
                        style={{ flex: 1, minWidth: 2, borderRadius: '2px 2px 0 0',
                                 height: `${Math.max(3, (p.media / (dados.curva.pico.media || 1)) * 100)}%`,
                                 background: p.media <= (dados.curva.vales[0]?.media ?? 0) ? 'var(--danger)' : 'var(--primary)' }}/>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text-muted)', marginTop: 3 }}>
                    <span>{dados.curva.pontos[0]?.hora}</span><span>{dados.curva.pontos[dados.curva.pontos.length - 1]?.hora}</span>
                  </div>
                </Bloco>
              )}

              {/* ── Quem fecha ── */}
              {dados.equipe.desequilibrio.length > 0 && (
                <Bloco icone={Users} titulo="Quem sempre fecha" cor="#6b21a8">
                  {dados.equipe.desequilibrio.map(d => (
                    <Linha key={d.setor}>· <b>{d.setor}</b>: {d.maior.nome} fechou <b>{d.maior.fechamentos}x</b> e {d.menor.nome}, <b>{d.menor.fechamentos}x</b></Linha>
                  ))}
                  <Dica>Fechamento é o turno que ninguém quer. Rodar entre o time é a diferença entre uma escala justa e uma que ninguém reclama em voz alta.</Dica>
                </Bloco>
              )}

              {/* ── Escalas em aberto ── */}
              <Bloco icone={AlertTriangle} titulo="Escalas ainda não fechadas" cor="#d97706"
                vazio={!dados.naoEntregues.length ? 'Todas as escalas com lançamento já foram fechadas.' : null}>
                {dados.naoEntregues.map((e, i) => (
                  <Linha key={i}>· <b>{e.nome}</b>{e.setor ? ` · ${e.setor}` : ''}</Linha>
                ))}
              </Bloco>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={aoFechar}>Fechar</button>
          <button className="btn btn-primary" onClick={baixarPDF} disabled={!dados || dados.vazio}>
            <Download size={14}/> Baixar PDF
          </button>
        </div>
      </div>
    </div>
  );
}
