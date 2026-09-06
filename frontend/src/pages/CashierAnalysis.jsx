import { useState, useEffect } from 'react';
import api from '../api';
import ExportMenu from '../components/ExportMenu';
import { gerarPDF, gerarExcel, compartilharWhatsApp, compartilharEmail } from '../lib/exportUtils';

// ─────────────────────────────────────────────────────────────
// Análise de caixas — quantos operadores há em cada faixa horária.
//
// A tela lê a escala de UMA pessoa, num DIA. Antes perguntava "terça de
// setembro", e essa terça não existe: setembro tem cinco, com gente e
// horários diferentes. Conferindo a escala real da frente de loja, a versão
// antiga contava 23 pessoas numa terça, das quais 12 eram de Perecíveis e
// Mercearia, e deixava de fora 41% da própria frente por causa de um cargo
// escrito "Jovem Aprendiz" onde o código esperava "aprendiz".
// ─────────────────────────────────────────────────────────────

const MAX_CAIXAS = 12;
const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DIAS_PT  = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];

function fmt(h) { return `${String(h).padStart(2, '0')}:00`; }
function hojeISO() { return new Date().toISOString().split('T')[0]; }

function porExtenso(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.split('-').map(Number);
  const dt = new Date(a, m - 1, d);
  return `${DIAS_PT[dt.getDay()]}, ${String(d).padStart(2, '0')} de ${MESES_PT[m - 1]} de ${a}`;
}

function statusBar(count) {
  const pct = Math.min((count / MAX_CAIXAS) * 100, 100);
  const color = count === 0 ? '#3A3A3A'
    : count <= 3 ? '#EF4444'
    : count <= 6 ? '#F59E0B'
    : '#10B981';
  return { pct, color };
}

export default function CashierAnalysis({ userId, profile }) {
  const [dia, setDia] = useState(hojeISO());
  const [escalaId, setEscalaId] = useState(userId || '');
  const [perfis, setPerfis] = useState([]);
  // null = ainda não mexeram nos cargos, e o servidor aplica o padrão dele.
  const [cargosLigados, setCargosLigados] = useState(null);
  const [resp, setResp] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { setEscalaId(id => id || userId); }, [userId]);

  // Mesma lista da tela de Escala: escolhe-se a PESSOA que monta a escala.
  useEffect(() => {
    const company = encodeURIComponent(profile?.company || '');
    api.get(`/profile/all?company=${company}`)
      .then(r => setPerfis(Array.isArray(r.data) ? r.data : []))
      .catch(() => {});
  }, [profile?.company]);

  useEffect(() => {
    if (!escalaId || !dia) return;
    setLoading(true);
    setError(null);
    const filtro = cargosLigados ? `&cargos=${encodeURIComponent(cargosLigados.join('|'))}` : '';
    api.get(`/schedule/operators?escala_id=${escalaId}&data=${dia}${filtro}`)
      .then(r => setResp(r.data))
      .catch(() => setError('Não foi possível carregar a escala deste dia.'))
      .finally(() => setLoading(false));
  }, [escalaId, dia, cargosLigados]);

  // Trocar de escala zera a escolha de cargos: os cargos de uma frente de
  // loja não são os de uma padaria, e manter a seleção anterior devolveria
  // uma tela vazia sem explicar por quê.
  const trocarEscala = (id) => { setEscalaId(id); setCargosLigados(null); setResp(null); };

  const horas   = resp?.horas || [];
  const cargos  = resp?.cargos || [];
  const rotuloDe = (p) => (p?.escala_setor || '').trim() || (p?.sector || '').trim() || 'Sem setor';

  const donoDaEscala = perfis.find(p => p.id === escalaId);
  const nomeDaEscala = donoDaEscala
    ? `${rotuloDe(donoDaEscala)} — ${donoDaEscala.full_name}`
    : (profile?.full_name || '');
  const periodoLabel = `${nomeDaEscala} · ${porExtenso(dia)}`;

  const totalOperadores = horas.length ? Math.max(...horas.map(h => h.operators)) : 0;
  const peakHour = horas.reduce((melhor, h) => h.operators > (melhor?.operators ?? -1) ? h : melhor, null);
  const semCobertura = horas.filter(h => h.operators === 0).length;

  const alternarCargo = (nome) => {
    const atuais = cargosLigados ?? cargos.filter(c => c.ativo).map(c => c.nome);
    setCargosLigados(atuais.includes(nome) ? atuais.filter(c => c !== nome) : [...atuais, nome]);
  };

  const linhasExport = () => horas.map(h => ({
    horario: `${fmt(h.hour)} – ${fmt(h.hour + 1)}`,
    operadores: h.operators,
    disponivel: Math.min(h.operators, MAX_CAIXAS),
  }));

  function handlePDF() {
    if (!horas.length) return;
    gerarPDF({
      titulo: 'Análise de Caixas',
      subtitulo: periodoLabel,
      secoes: [{
        titulo: 'Operadores por horário',
        colunas: [
          { header: 'Horário', dataKey: 'horario' },
          { header: 'Operadores', dataKey: 'operadores' },
          { header: 'Caixas disponíveis', dataKey: 'disponivel' },
        ],
        rows: linhasExport(),
      }],
    });
  }

  function handleExcel() {
    if (!horas.length) return;
    gerarExcel({
      nomeArquivo: 'Caixas',
      abas: [{
        nome: dia,
        colunas: ['Horário', 'Operadores', 'Caixas disponíveis'],
        rows: linhasExport().map(l => [l.horario, l.operadores, l.disponivel]),
      }],
    });
  }

  function handleWhatsApp() {
    compartilharWhatsApp([
      `🏪 *Análise de Caixas*`,
      periodoLabel,
      ``,
      `👥 Máx. operadores: ${totalOperadores}`,
      peakHour ? `⏰ Pico: ${fmt(peakHour.hour)} com ${peakHour.operators} operadores` : '',
      `🔢 Caixas no clube: ${MAX_CAIXAS}`,
    ].filter(Boolean).join('\n'));
  }

  function handleEmail() {
    compartilharEmail({
      assunto: `Análise de Caixas — ${porExtenso(dia)}`,
      corpo: [
        `Análise de Caixas`,
        periodoLabel,
        ``,
        `Máx. operadores no dia: ${totalOperadores}`,
        peakHour ? `Horário de pico: ${fmt(peakHour.hour)} com ${peakHour.operators} operadores` : '',
        `Caixas no clube: ${MAX_CAIXAS}`,
      ].filter(Boolean).join('\n'),
    });
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Caixas</h1>
          <p className="page-subtitle">
            Operadores por faixa horária, lidos da escala • {MAX_CAIXAS} caixas no clube
          </p>
        </div>
        <ExportMenu
          disabled={!horas.length}
          onPDF={handlePDF}
          onExcel={handleExcel}
          onWhatsApp={handleWhatsApp}
          onEmail={handleEmail}
        />
      </div>

      {/* Escala e dia */}
      <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label className="form-label" style={{ display: 'block', marginBottom: 6 }}>Escala</label>
          <select className="select" value={escalaId} onChange={e => trocarEscala(e.target.value)} style={{ width: '100%' }}>
            {!perfis.length && <option value={userId}>{profile?.full_name || 'Minha escala'}</option>}
            {[...perfis]
              .filter(p => p.active !== false)
              .sort((a, b) =>
                rotuloDe(a).localeCompare(rotuloDe(b), 'pt-BR') ||
                (a.full_name || '').localeCompare(b.full_name || '', 'pt-BR'))
              .map(p => (
                <option key={p.id} value={p.id}>{rotuloDe(p)} — {p.full_name}</option>
              ))}
          </select>
        </div>
        <div style={{ minWidth: 180 }}>
          <label className="form-label" style={{ display: 'block', marginBottom: 6 }}>Dia</label>
          <input type="date" className="input" value={dia} onChange={e => setDia(e.target.value)} style={{ width: '100%' }}/>
        </div>
      </div>

      {/* Cargos: o que entra na conta fica visível e ajustável. Era o que
          ninguém conseguia enxergar — a régua de quem é caixa estava
          escondida no servidor. */}
      {cargos.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <label className="form-label" style={{ display: 'block', marginBottom: 8 }}>
            Quem conta como caixa neste dia
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {cargos.map(c => (
              <button key={c.nome} onClick={() => alternarCargo(c.nome)}
                style={{
                  padding: '6px 12px', borderRadius: 99, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                  background: c.ativo ? 'var(--primary)' : 'var(--surface-2)',
                  color: c.ativo ? '#fff' : 'var(--text-muted)',
                  border: `1px solid ${c.ativo ? 'var(--primary)' : 'var(--border)'}`,
                }}>
                {c.nome} · {c.total}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 8 }}>
            Toque para incluir ou tirar da conta. O número ao lado é quantas pessoas
            daquele cargo estão escaladas neste dia.
          </p>
        </div>
      )}

      {loading && (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          Carregando escala...
        </div>
      )}

      {error && (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: '#EF4444' }}>{error}</div>
      )}

      {!loading && !error && resp && (
        <>
          {horas.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
              <p style={{ fontWeight: 600, color: 'var(--text)' }}>Ninguém escalado neste dia</p>
              <p style={{ fontSize: 13, marginTop: 6 }}>
                {cargos.length
                  ? 'Há pessoas na escala, mas nenhuma dos cargos marcados acima. Ajuste os cargos ou escolha outro dia.'
                  : 'Esta escala não tem horários lançados para este dia.'}
              </p>
            </div>
          ) : (
            <>
              <div className="stats-grid" style={{ marginBottom: 20 }}>
                <div className="stat-card">
                  <div className="stat-icon"><span style={{ fontSize: 22 }}>👥</span></div>
                  <div>
                    <div className="stat-value">{totalOperadores}</div>
                    <div className="stat-label">Máx. operadores no dia</div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon"><span style={{ fontSize: 22 }}>🏪</span></div>
                  <div>
                    <div className="stat-value">{MAX_CAIXAS}</div>
                    <div className="stat-label">Caixas disponíveis</div>
                  </div>
                </div>
                {peakHour && peakHour.operators > 0 && (
                  <div className="stat-card">
                    <div className="stat-icon"><span style={{ fontSize: 22 }}>🔺</span></div>
                    <div>
                      <div className="stat-value">{fmt(peakHour.hour)}</div>
                      <div className="stat-label">Pico • {peakHour.operators} operadores</div>
                    </div>
                  </div>
                )}
                <div className="stat-card">
                  <div className="stat-icon"><span style={{ fontSize: 22 }}>📋</span></div>
                  <div>
                    <div className="stat-value">{semCobertura}</div>
                    <div className="stat-label">Faixas sem cobertura</div>
                  </div>
                </div>
              </div>

              <div className="card">
                <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Operadores por faixa horária</h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 18 }}>{periodoLabel}</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {horas.map(row => {
                    const { pct, color } = statusBar(row.operators);
                    return (
                      <div key={row.hour} style={{
                        display: 'grid', gridTemplateColumns: '80px 40px 1fr 200px',
                        alignItems: 'center', gap: 14, padding: '10px 14px',
                        background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)',
                      }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>
                          {fmt(row.hour)}–{fmt(row.hour + 1)}
                        </div>
                        <div style={{ fontWeight: 800, fontSize: 18, color, textAlign: 'center' }}>
                          {row.operators}
                        </div>
                        <div style={{ background: 'var(--border)', borderRadius: 99, height: 8, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99, transition: 'width .3s' }}/>
                        </div>
                        <div title={row.names?.join(', ')}
                          style={{ fontSize: 11.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.names?.length > 0
                            ? row.names.slice(0, 3).join(', ') + (row.names.length > 3 ? ` +${row.names.length - 3}` : '')
                            : <span style={{ color: '#444' }}>Sem operadores</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', gap: 20, marginTop: 16, flexWrap: 'wrap' }}>
                  {[
                    { color: '#10B981', label: '7 ou mais operadores' },
                    { color: '#F59E0B', label: '4–6 operadores' },
                    { color: '#EF4444', label: '1–3 operadores' },
                    { color: '#3A3A3A', label: 'Sem cobertura' },
                  ].map(l => (
                    <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: l.color, display: 'inline-block' }}/>
                      {l.label}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
