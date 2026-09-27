import React, { useEffect, useMemo, useState } from 'react';
import { Target, Plus, Trash2, X, ChevronLeft, LayoutGrid } from 'lucide-react';
import api from '../api';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';

// ─────────────────────────────────────────────────────────────
// Metas com número — da loja ou de um plano de ação.
//
// Portado do protótipo aprovado (prototipos/monitoramento-metas.html).
// Uma meta tem até três medidas (quantidade, R$, %) lado a lado; o
// lançamento traz os números juntos, por data; o gráfico é escolhido
// sozinho (mensal ou poucos pontos → barras; senão → linha com tendência).
// O servidor guarda; o cálculo é todo aqui, em analisar().
// ─────────────────────────────────────────────────────────────

const MEDIDAS = {
  quantidade: { nome: 'Quantidade', curto: 'Qtd', ex: 'Ex.: 1.200 unidades, 14 faltas, 300 itens', fmt: v => Math.round(v).toLocaleString('pt-BR'), passo: 1, ph: ['ex.: 9800', 'ex.: 12000'] },
  reais:      { nome: 'Valor em R$', curto: 'R$', ex: 'Ex.: R$ 450.000 de venda, R$ 8.000 de perda', fmt: v => 'R$ ' + Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 }), passo: 0.01, ph: ['ex.: 380000', 'ex.: 450000'] },
  percentual: { nome: 'Percentual (%)', curto: '%', ex: 'Ex.: 5% de ruptura, 100% da meta', fmt: v => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%', passo: 0.1, ph: ['ex.: 12', 'ex.: 5'] },
};
const ORDEM = ['quantidade', 'reais', 'percentual'];
const FREQ = { diario: 'todo dia', semanal: 'toda semana', mensal: 'todo mês' };

const hoje = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const br = iso => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');
const dias = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 864e5);
const medidasDe = m => ORDEM.filter(k => m.medidas?.[k]);
const setoresDe = m => (Array.isArray(m.setores) ? m.setores : []);
const TOTAL = '';   // setor '' = total da loja

// Série de uma medida: do setor pedido, ou do total.
//
// TOTAL COM SETORES: quantidade e R$ somam os setores lançados na data
// (um lançamento explícito do total, se houver, ganha). Percentual não
// soma: usa o lançado no total; sem ele, média ponderada pelo R$ dos
// setores (ou simples, quando não há R$).
function serie(m, k, setor) {
  const ls = m.lancamentos || [];
  const de = (st) => ls.filter(l => (l.setor || '') === st && l.valores?.[k] != null).map(l => [String(l.data).slice(0, 10), Number(l.valores[k])]);
  if (setor || !setoresDe(m).length) return de(setor || TOTAL).sort((a, b) => a[0].localeCompare(b[0]));

  const explicito = Object.fromEntries(de(TOTAL));
  const porData = {};
  ls.filter(l => l.setor && l.valores?.[k] != null).forEach(l => {
    const d = String(l.data).slice(0, 10);
    (porData[d] = porData[d] || []).push({ v: Number(l.valores[k]), peso: Number(l.valores?.reais) || 0 });
  });
  const datas = new Set([...Object.keys(explicito), ...Object.keys(porData)]);
  return [...datas].map(d => {
    if (explicito[d] != null) return [d, explicito[d]];
    const xs = porData[d];
    if (k !== 'percentual') return [d, xs.reduce((s, x) => s + x.v, 0)];
    const somaPeso = xs.reduce((s, x) => s + x.peso, 0);
    return [d, somaPeso > 0 ? xs.reduce((s, x) => s + x.v * x.peso, 0) / somaPeso : xs.reduce((s, x) => s + x.v, 0) / xs.length];
  }).sort((a, b) => a[0].localeCompare(b[0]));
}

// ── Cálculo de uma medida (do total ou de um setor) ──────────
function analisar(m, k, setor = TOTAL) {
  const T = MEDIDAS[k];
  const cfg = setor ? setoresDe(m).find(s => s.nome === setor)?.medidas?.[k] : m.medidas[k];
  if (!cfg) return null;
  const ms = serie(m, k, setor);
  const atual = ms.length ? ms[ms.length - 1][1] : cfg.inicial;
  const dataAtual = ms.length ? ms[ms.length - 1][0] : null;
  const percurso = cfg.meta - cfg.inicial, andado = atual - cfg.inicial;
  const pct = percurso === 0 ? 100 : Math.max(0, Math.min(120, andado / percurso * 100));
  const atingiu = m.direcao === 'reduzir' ? atual <= cfg.meta : atual >= cfg.meta;
  const restam = dias(hoje(), m.prazo);
  // Tendência: reta pelos pontos, projetada até o prazo.
  let projecao = null, chega = null;
  if (ms.length >= 2) {
    const x = ms.map(p => dias(ms[0][0], p[0])), y = ms.map(p => p[1]);
    const n = x.length, mx = x.reduce((a, b) => a + b) / n, my = y.reduce((a, b) => a + b) / n;
    const b = x.reduce((s, xi, j) => s + (xi - mx) * (y[j] - my), 0) / (x.reduce((s, xi) => s + (xi - mx) ** 2, 0) || 1);
    projecao = my + b * (dias(ms[0][0], m.prazo) - mx);
    chega = m.direcao === 'reduzir' ? projecao <= cfg.meta : projecao >= cfg.meta;
  }
  // Mesma escala de estado dos gráficos, nos tokens do app (validados
  // para daltonismo e contraste nos dois temas).
  const cor = atingiu ? 'var(--success)' : pct >= 60 ? 'var(--warning)' : 'var(--danger)';
  const frase = atingiu ? `Meta atingida: ${T.fmt(atual)} contra ${T.fmt(cfg.meta)}.`
    : ms.length < 2 ? 'Ainda sem tendência — lance pelo menos 2 vezes.'
    : restam < 0 ? `Prazo vencido há ${-restam} dias; ficou em ${T.fmt(atual)} (${Math.round(pct)}% do caminho).`
    : chega ? `No ritmo atual chega em ${T.fmt(projecao)} no prazo — a meta é ${T.fmt(cfg.meta)}. Continue.`
    : `No ritmo atual chegaria em ${T.fmt(projecao)}, e a meta é ${T.fmt(cfg.meta)}. Precisa acelerar: faltam ${restam} dias.`;
  return { k, setor, T, cfg, ms, atual, dataAtual, pct, atingiu, restam, projecao, chega, cor, frase };
}
// A medida de menor progresso é a que segura o resultado; a meta só é
// "atingida" quando todas batem.
function resumo(m, setor = TOTAL) {
  const as = medidasDe(m).map(k => analisar(m, k, setor)).filter(Boolean);
  const pior = as.reduce((p, a) => (a.pct < p.pct ? a : p), as[0]);
  return { as, pct: as.length ? Math.round(as.reduce((s, a) => s + a.pct, 0) / as.length) : 0, atingiu: as.length > 0 && as.every(a => a.atingiu), cor: pior?.cor || 'var(--danger)', pior };
}
// "500 / 800" numa meta de REDUZIR parecia que faltava chegar a 800,
// quando 500 já é melhor que a meta. O sinal resolve a leitura.
const metaLida = (m, a) => `${m.direcao === 'reduzir' ? 'até' : 'mín.'} ${a.T.fmt(a.cfg.meta)}`;

const graficoAutomatico = (m, a) => (m.frequencia === 'mensal' || a.ms.length <= 3 ? 'barras' : 'linha');

// ── Gráficos em SVG (sem biblioteca, como o resto do app) ────
//
// Regras seguidas aqui, nesta ordem: primeiro a forma (barra para poucos
// períodos, linha para muitos), depois a cor — e a cor é UMA por gráfico,
// nunca uma por barra. Colorir cada barra pelo seu próprio estado parece
// informativo, mas repete em cor o que o tamanho da barra já diz, e as
// três cores de status não se distinguem por quem tem daltonismo (medido:
// verde↔âmbar fica em ΔE 9,3 — no limite). Quem bateu a meta ganha um ✓,
// que é leitura garantida sem depender de cor.
//
// As cores vêm dos tokens do app (--success/--warning/--danger), que já
// passam nas checagens de banda de luminosidade, croma, daltonismo e
// contraste nos dois temas.
const ESTADOS = {
  bom:     { cor: 'var(--success)', rotulo: 'na meta' },
  caminho: { cor: 'var(--warning)', rotulo: 'a caminho' },
  atencao: { cor: 'var(--danger)',  rotulo: 'precisa acelerar' },
};
const estadoDe = (a) => (a.atingiu ? ESTADOS.bom : a.pct >= 60 ? ESTADOS.caminho : ESTADOS.atencao);

// Régua do eixo em números redondos. "467" e "1.773" são o intervalo bruto
// dividido em três; ninguém lê isso como referência — 0, 500, 1.000 sim.
function passoBonito(bruto) {
  const exp = Math.pow(10, Math.floor(Math.log10(Math.abs(bruto) || 1)));
  const n = bruto / exp;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * exp;
}
function marcasY(min, max, quantas = 3) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max === min) return [min];
  // Tenta o passo ideal e, se não couberem pelo menos duas marcas dentro do
  // intervalo, vai diminuindo. Sem isso o gráfico pequeno caía no intervalo
  // cru (467 · 1.773), que é justamente o que se queria evitar.
  for (const divisor of [1, 2, 5, 10]) {
    const passo = passoBonito((max - min) / quantas) / divisor;
    if (!Number.isFinite(passo) || passo <= 0) break;
    const out = [];
    for (let v = Math.ceil(min / passo) * passo; v <= max + 1e-9 && out.length < 8; v += passo) {
      out.push(Number(v.toFixed(6)));
    }
    if (out.length >= 2) return out;
  }
  return [min, max];
}

// Observação daquele lançamento, para o ponto do gráfico contar o porquê.
const obsDe = (m, setor) => Object.fromEntries(
  (m.lancamentos || [])
    .filter(l => (l.setor || '') === (setor || '') && l.observacao)
    .map(l => [String(l.data).slice(0, 10), l.observacao]));

// Caixa de texto que segue o mouse. O <title> do SVG demora ~1s e some
// sozinho; num gráfico de acompanhamento a pessoa quer conferir ponto a
// ponto, e a espera atrapalha.
function useDica() {
  const [dica, setDica] = useState(null);
  const caixa = dica && (
    <div style={{ position: 'fixed', left: dica.x + 12, top: dica.y - 8, zIndex: 60, pointerEvents: 'none',
      background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 10,
      boxShadow: 'var(--shadow-md)', padding: '8px 10px', maxWidth: 260 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{dica.titulo}</div>
      <div style={{ fontSize: 14, fontWeight: 800, marginTop: 1 }}>{dica.valor}</div>
      {dica.extra && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>{dica.extra}</div>}
      {dica.obs && <div style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.35 }}>💬 {dica.obs}</div>}
    </div>
  );
  const em = (e, d) => setDica({ ...d, x: e.clientX, y: e.clientY });
  return { caixa, em, fora: () => setDica(null) };
}

// Variação em relação ao lançamento anterior — é o que a reunião comenta.
const variacao = (a, i) => {
  if (i === 0) return null;
  const d = a.ms[i][1] - a.ms[i - 1][1];
  if (d === 0) return 'igual ao anterior';
  const bom = a.T === MEDIDAS.percentual || true; // só descreve; o juízo é da direção
  return `${d > 0 ? '▲' : '▼'} ${a.T.fmt(Math.abs(d))} ${d > 0 ? 'a mais' : 'a menos'} que antes${bom ? '' : ''}`;
};

function Linha({ m, a, mini }) {
  const { caixa, em, fora } = useDica();
  const obs = obsDe(m, a.setor);
  const W = 640, H = mini ? 120 : 240, P = mini ? { l: 44, r: 14, t: 10, b: 18 } : { l: 58, r: 54, t: 26, b: 30 };
  const pts = a.ms;
  if (!pts.length) return <SemDados mini={mini}/>;
  const est = estadoDe(a);

  const ys = [...pts.map(p => p[1]), a.cfg.meta, a.cfg.inicial];
  let y0 = Math.min(...ys), y1 = Math.max(...ys); const pad = (y1 - y0 || 1) * .18; y0 -= pad; y1 += pad;
  const x0 = pts[0][0], x1 = pts[pts.length - 1][0] > m.prazo ? pts[pts.length - 1][0] : m.prazo;
  const sx = d => P.l + dias(x0, d) / (dias(x0, x1) || 1) * (W - P.l - P.r);
  const sy = v => P.t + (1 - (v - y0) / (y1 - y0)) * (H - P.t - P.b);
  const cam = pts.map((p, i) => (i ? 'L' : 'M') + sx(p[0]).toFixed(1) + ' ' + sy(p[1]).toFixed(1)).join(' ');
  const base = sy(Math.max(y0, 0));
  const area = `${cam} L ${sx(pts[pts.length - 1][0]).toFixed(1)} ${base.toFixed(1)} L ${sx(x0).toFixed(1)} ${base.toFixed(1)} Z`;
  const ultimo = pts[pts.length - 1];
  const grade = marcasY(y0, y1, mini ? 2 : 3);

  return (
    <div style={{ position: 'relative' }}>
      {caixa}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxHeight: mini ? 140 : 280, display: 'block' }}
        onMouseLeave={fora}>
        {/* Grade discreta: linha fina e sólida, só para dar régua ao olho */}
        {grade.map(v => (
          <g key={v}>
            <line x1={P.l} x2={W - P.r} y1={sy(v)} y2={sy(v)} stroke="var(--border)" strokeWidth="1"/>
            <text x={P.l - 6} y={sy(v) + 4} fontSize={mini ? 9 : 10.5} fill="var(--text-muted)" textAnchor="end">{a.T.fmt(v)}</text>
          </g>))}

        {/* A meta é referência, não dado: fica em cinza tracejado e com o
            nome escrito, para não competir com a linha do resultado. */}
        <line x1={P.l} x2={W - P.r} y1={sy(a.cfg.meta)} y2={sy(a.cfg.meta)} stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="5 4" opacity=".85"/>
        {!mini && <text x={P.l + 2} y={sy(a.cfg.meta) - 5} fontSize="10.5" fill="var(--text-muted)">meta {a.T.fmt(a.cfg.meta)}</text>}

        <path d={area} fill={est.cor} opacity=".10"/>
        <path d={cam} fill="none" stroke={est.cor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>

        {/* Ritmo até o prazo: onde termina se seguir assim. */}
        {/* Só faz sentido projetar o que ainda está em andamento: com a meta
            batida, a reta continuava descendo e anunciava "-390", que para
            quantidade não existe. */}
        {a.projecao != null && a.restam > 0 && !a.atingiu && !mini && (() => {
          const piso = a.k === 'percentual' ? -Infinity : 0;
          const proj = Math.max(piso, a.projecao);
          const yp = sy(Math.max(y0, Math.min(y1, proj)));
          return (
            <g>
              <line x1={sx(ultimo[0])} y1={sy(ultimo[1])} x2={sx(m.prazo)} y2={yp}
                stroke="var(--text-muted)" strokeWidth="1.5" strokeDasharray="3 4"/>
              <circle cx={sx(m.prazo)} cy={yp} r="3.5" fill="var(--surface)" stroke="var(--text-muted)" strokeWidth="1.5"/>
              <text x={W - P.r + 6} y={yp + 4} fontSize="10.5" fill="var(--text-muted)">{a.T.fmt(proj)}</text>
            </g>
          );
        })()}

        {pts.map((p, i) => {
          const ehUltimo = i === pts.length - 1;
          const temObs = !!obs[p[0]];
          return (
            <g key={p[0]}>
              {/* Alvo de toque maior que o ponto, senão acertar com o dedo vira sorte */}
              <circle cx={sx(p[0])} cy={sy(p[1])} r="14" fill="transparent"
                onMouseMove={e => em(e, { titulo: br(p[0]), valor: a.T.fmt(p[1]), extra: variacao(a, i), obs: obs[p[0]] })}/>
              <circle cx={sx(p[0])} cy={sy(p[1])} r={ehUltimo ? 5 : 4} fill={est.cor} stroke="var(--surface)" strokeWidth="2"/>
              {temObs && !mini && <text x={sx(p[0])} y={sy(p[1]) - 12} fontSize="11" textAnchor="middle">💬</text>}
            </g>
          );
        })}

        {/* Número em cada ponto — mas só onde cabe. A régua abaixo mede o
            espaço já ocupado e pula o rótulo que fosse encostar no vizinho;
            o último ponto sempre aparece, maior, porque é a resposta. */}
        {(() => {
          const alt = 7.2; // largura média por caractere no tamanho usado
          const usados = [];
          const cabe = (x, txt) => {
            const meia = (txt.length * alt) / 2 + 6;
            if (usados.some(u => Math.abs(u.x - x) < u.meia + meia)) return false;
            usados.push({ x, meia }); return true;
          };
          // O último entra primeiro: ele tem prioridade sobre os do meio.
          const ordem = [pts.length - 1, ...pts.map((_, i) => i).filter(i => i !== pts.length - 1)];
          return ordem.map(i => {
            const p = pts[i], ehUltimo = i === pts.length - 1;
            const txt = a.T.fmt(p[1]);
            if (!cabe(sx(p[0]), txt)) return null;
            return (
              <text key={`v${p[0]}`} x={sx(p[0])} y={sy(p[1]) - (obs[p[0]] && !mini ? 26 : 14)}
                fontSize={ehUltimo ? (mini ? 11 : 13.5) : (mini ? 10 : 11.5)}
                fontWeight={ehUltimo ? 800 : 600}
                textAnchor="middle" fill="var(--text)">{txt}</text>
            );
          });
        })()}

        <text x={sx(x0)} y={H - 6} fontSize="10.5" fill="var(--text-muted)">{br(x0)}</text>
        <text x={W - P.r} y={H - 6} fontSize="10.5" fill="var(--text-muted)" textAnchor="end">prazo {br(m.prazo)}</text>
      </svg>
    </div>
  );
}

function Barras({ m, a, mini }) {
  const { caixa, em, fora } = useDica();
  const obs = obsDe(m, a.setor);
  const W = 640, H = mini ? 120 : 240, P = mini ? { l: 44, r: 10, t: 16, b: 20 } : { l: 58, r: 18, t: 30, b: 34 };
  const pts = a.ms.slice(-12);
  if (!pts.length) return <SemDados mini={mini}/>;
  const est = estadoDe(a);

  const y1 = Math.max(...pts.map(p => p[1]), a.cfg.meta, 0) * 1.15 || 1, y0 = 0;
  const sy = v => P.t + (1 - (v - y0) / (y1 - y0)) * (H - P.t - P.b);
  const faixa = (W - P.l - P.r) / pts.length;
  // Barra fina com ar em volta: no máximo 24px, e 2px de respiro entre elas.
  const bw = Math.min(24, faixa - 2);
  const rot = d => (m.frequencia === 'mensal' ? new Date(d + 'T12:00:00Z').toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }) : br(d).slice(0, 5));
  const bateu = v => (m.direcao === 'reduzir' ? v <= a.cfg.meta : v >= a.cfg.meta);
  // Topo arredondado, base reta: a barra nasce na linha do zero.
  const barra = (x, y, w, h, r = 4) => {
    const rr = Math.min(r, h, w / 2);
    return `M ${x} ${y + h} L ${x} ${y + rr} Q ${x} ${y} ${x + rr} ${y} L ${x + w - rr} ${y} Q ${x + w} ${y} ${x + w} ${y + rr} L ${x + w} ${y + h} Z`;
  };

  return (
    <div style={{ position: 'relative' }}>
      {caixa}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxHeight: mini ? 140 : 280, display: 'block' }}
        onMouseLeave={fora}>
        {marcasY(y0, y1, mini ? 1 : 2).map(v => (
          <g key={v}>
            <line x1={P.l} x2={W - P.r} y1={sy(v)} y2={sy(v)} stroke="var(--border)" strokeWidth="1"/>
            <text x={P.l - 6} y={sy(v) + 4} fontSize={mini ? 9 : 10.5} fill="var(--text-muted)" textAnchor="end">{a.T.fmt(v)}</text>
          </g>))}

        <line x1={P.l} x2={W - P.r} y1={sy(a.cfg.meta)} y2={sy(a.cfg.meta)} stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="5 4" opacity=".85"/>
        {!mini && <text x={P.l + 2} y={sy(a.cfg.meta) - 5} fontSize="10.5" fill="var(--text-muted)">meta {a.T.fmt(a.cfg.meta)}</text>}

        {pts.map((p, i) => {
          const v = Math.max(0, p[1]);
          const x = P.l + i * faixa + (faixa - bw) / 2;
          const y = sy(v), h = Math.max(1, sy(0) - y);
          return (
            <g key={p[0]}
              onMouseMove={e => em(e, { titulo: br(p[0]), valor: a.T.fmt(p[1]), extra: variacao(a, a.ms.length - pts.length + i), obs: obs[p[0]] })}>
              <rect x={x - 3} y={P.t} width={bw + 6} height={sy(0) - P.t} fill="transparent"/>
              <path d={barra(x, y, bw, h)} fill={est.cor}/>
              <text x={x + bw / 2} y={y - (mini ? 5 : 8)} fontSize={mini ? 9.5 : 12.5} fontWeight="700" textAnchor="middle" fill="var(--text)">
                {a.T.fmt(p[1])}
              </text>
              {/* Quem bateu a meta ganha ✓: leitura que não depende de cor */}
              {!mini && bateu(p[1]) && <text x={x + bw / 2} y={y - 21} fontSize="11" textAnchor="middle" fill="var(--success)">✓</text>}
              {obs[p[0]] && !mini && <text x={x + bw / 2} y={sy(0) + 14} fontSize="10" textAnchor="middle">💬</text>}
              <text x={x + bw / 2} y={H - 6} fontSize="10.5" textAnchor="middle" fill="var(--text-muted)">{rot(p[0])}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function SemDados({ mini }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: mini ? 90 : 150, gap: 4, color: 'var(--text-muted)', fontSize: 12.5,
      border: '1px dashed var(--border)', borderRadius: 10 }}>
      <span style={{ fontSize: 20, opacity: .5 }}>📈</span>
      <span>Sem lançamentos ainda</span>
      {!mini && <span style={{ fontSize: 11.5 }}>Clique em "Lançar" e o gráfico começa a se desenhar.</span>}
    </div>
  );
}

function Progresso({ a, compacto, m }) {
  const est = estadoDe(a);
  const largura = Math.min(100, Math.max(0, a.pct));
  // Onde deveria estar hoje, se o avanço fosse parelho do início até o prazo.
  const ritmo = (() => {
    if (!m?.prazo || !a.ms.length) return null;
    const total = dias(a.ms[0][0], m.prazo);
    if (total <= 0) return null;
    return Math.min(100, Math.max(0, dias(a.ms[0][0], hoje()) / total * 100));
  })();
  return (
    <div>
      {!compacto && (
        <div style={{ margin: '6px 0 2px', display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--text-muted)' }}>
          <span>Começou em <b style={{ color: 'var(--text)' }}>{a.T.fmt(a.cfg.inicial)}</b></span>
          <span>Quer chegar em <b style={{ color: 'var(--text)' }}>{a.T.fmt(a.cfg.meta)}</b></span>
        </div>
      )}
      <div style={{ position: 'relative', height: compacto ? 8 : 12, borderRadius: 99, background: 'var(--surface-2)', overflow: 'hidden', marginTop: compacto ? 4 : 0 }}>
        <div style={{ width: `${largura}%`, height: '100%', background: est.cor, borderRadius: 99, transition: 'width .4s' }}/>
      </div>
      {/* A marca do ritmo mostra se o avanço está adiantado ou atrasado em
          relação ao tempo que já passou — sem ela, 40% pode ser ótimo ou
          péssimo dependendo do prazo. */}
      {!compacto && ritmo != null && (
        <div style={{ position: 'relative', height: 14 }}>
          <div style={{ position: 'absolute', left: `${ritmo}%`, transform: 'translateX(-50%)', fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            ▲ tempo decorrido
          </div>
        </div>
      )}
      {!compacto && (
        <div style={{ fontSize: 12, marginTop: 5 }}>
          Hoje está em <b>{a.T.fmt(a.atual)}</b> — já andou <b>{Math.round(a.pct)}%</b> do caminho até a meta
          {ritmo != null && <span style={{ color: 'var(--text-muted)' }}> · {Math.round(ritmo)}% do prazo usado</span>}
        </div>
      )}
    </div>
  );
}

function Grafico({ m, a, mini }) {
  const t = m.grafico === 'auto' ? graficoAutomatico(m, a) : m.grafico;
  if (t === 'linha') return <Linha m={m} a={a} mini={mini}/>;
  if (t === 'barras') return <Barras m={m} a={a} mini={mini}/>;
  return <Progresso a={a} m={m}/>;
}

const Selo = ({ cor, children }) => <span style={{ fontSize: 11, fontWeight: 700, color: cor, background: `${cor}1f`, borderRadius: 99, padding: '3px 9px', whiteSpace: 'nowrap' }}>{children}</span>;
const Rotulo = ({ children }) => <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: .3, margin: '10px 0 4px' }}>{children}</label>;
const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13.5 };

export default function Metas({ userId, profile }) {
  const toast = useToast();
  const company = profile?.company || '';
  const q = `requester_id=${userId}${company ? `&company=${encodeURIComponent(company)}` : ''}`;

  const [dados, setDados] = useState({ metas: [], planos: [], setoresLoja: [], podeGerir: false });
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState('todas');
  const [abertaId, setAbertaId] = useState(null);
  // Para onde voltar depois de editar: o assistente mora na lista, então
  // editar fecha a meta e a reabre ao salvar.
  const [voltarPara, setVoltarPara] = useState(null);
  const [medida, setMedida] = useState(null);
  const [setorFoco, setSetorFoco] = useState(TOTAL);   // '' = total
  const [modal, setModal] = useState(null);        // 'nova' | 'lancar'
  const [nova, setNova] = useState(null);
  const [lanc, setLanc] = useState({ data: hoje(), valores: {}, porSetor: {}, observacao: '' });
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    try { const r = await api.get(`/metas?${q}`); setDados(r.data); }
    catch { toast('Não foi possível carregar as metas.', 'error'); }
    setCarregando(false);
  };
  useEffect(() => { if (userId) carregar(); }, [userId, company]);

  const planoDe = id => dados.planos.find(p => p.id === id);
  const aberta = dados.metas.find(m => m.id === abertaId) || null;
  const lista = useMemo(() => dados.metas.filter(m => filtro === 'todas' ? true : filtro === 'livres' ? !m.plano_id : m.plano_id === filtro), [dados.metas, filtro]);

  // ── Ações ──────────────────────────────────────────────────
  const abrirNova = () => {
    setNova({ nome: '', direcao: 'aumentar', prazo: '', frequencia: 'mensal', plano_id: dados.planos.some(p => p.id === filtro) ? filtro : '',
              usa: { quantidade: false, reais: true, percentual: false }, val: { quantidade: { inicial: '', meta: '' }, reais: { inicial: '', meta: '' }, percentual: { inicial: '', meta: '' } },
              porSetor: false, setores: [], novoSetor: '' });
    setModal('nova');
  };
  // Editar reaproveita o MESMO assistente da criação: manter duas telas
  // parecidas era garantir que uma ficasse para trás. `nova.id` é o que
  // diz se estamos criando ou corrigindo.
  const abrirEdicao = (m) => {
    const usa = { quantidade: false, reais: false, percentual: false };
    const val = { quantidade: { inicial: '', meta: '' }, reais: { inicial: '', meta: '' }, percentual: { inicial: '', meta: '' } };
    ORDEM.forEach(k => {
      if (m.medidas?.[k]) {
        usa[k] = true;
        val[k] = { inicial: String(m.medidas[k].inicial), meta: String(m.medidas[k].meta) };
      }
    });
    const sets = setoresDe(m).map(st => ({
      nome: st.nome,
      val: Object.fromEntries(ORDEM.map(k => [k, st.medidas?.[k]
        ? { inicial: String(st.medidas[k].inicial), meta: String(st.medidas[k].meta) }
        : { inicial: '', meta: '' }])),
    }));
    setNova({ id: m.id, nome: m.nome, direcao: m.direcao, prazo: String(m.prazo).slice(0, 10),
              frequencia: m.frequencia, plano_id: m.plano_id || '', usa, val,
              porSetor: sets.length > 0, setores: sets, novoSetor: '' });
    setVoltarPara(abertaId);
    setAbertaId(null);
    setModal('nova');
  };

  const salvarNova = async () => {
    const ks = ORDEM.filter(k => nova.usa[k]);
    if (!nova.nome.trim()) return toast('Diga o que você quer acompanhar (passo 1).', 'error');
    if (!ks.length) return toast('Marque pelo menos uma forma de medir (passo 3).', 'error');
    if (ks.some(k => nova.val[k].inicial === '' || nova.val[k].meta === '')) return toast('Em cada medida marcada, preencha "hoje está em" e "quer chegar em".', 'error');
    if (!nova.prazo) return toast('Informe até quando (passo 4).', 'error');
    const medidas = {}; ks.forEach(k => { medidas[k] = { inicial: Number(nova.val[k].inicial), meta: Number(nova.val[k].meta) }; });
    // Setores: só os marcados; cada um precisa de partida e meta nas medidas da meta.
    const setores = nova.porSetor ? nova.setores.map(st => ({ nome: st.nome, medidas: Object.fromEntries(ks.filter(k => st.val?.[k]?.inicial !== '' && st.val?.[k]?.meta !== '' && st.val?.[k]).map(k => [k, { inicial: Number(st.val[k].inicial), meta: Number(st.val[k].meta) }])) })) : [];
    if (nova.porSetor && !setores.length) return toast('Marque pelo menos um setor (passo 5) ou desligue "acompanhar por setor".', 'error');
    const incompleto = setores.find(st => ks.some(k => !st.medidas[k]));
    if (incompleto) return toast(`No setor "${incompleto.nome}", preencha "hoje está em" e "quer chegar em" em todas as medidas.`, 'error');
    // Tirar um setor que já tem números lançados é decisão com consequência:
    // os lançamentos ficam no banco, mas somem da tela. Por isso o aviso
    // nomeia quais setores sairiam.
    if (nova.id) {
      const antes = setoresDe(dados.metas.find(m => m.id === nova.id) || {}).map(st => st.nome);
      const agora = setores.map(st => st.nome);
      const comLancamento = new Set((dados.metas.find(m => m.id === nova.id)?.lancamentos || [])
        .filter(l => l.setor).map(l => l.setor));
      const sumindo = antes.filter(n => !agora.includes(n) && comLancamento.has(n));
      if (sumindo.length && !window.confirm(
        `Você está tirando ${sumindo.length === 1 ? 'o setor' : 'os setores'} ${sumindo.join(', ')}, que já ${sumindo.length === 1 ? 'tem número lançado' : 'têm números lançados'}.\n\nOs lançamentos não somem do banco, mas deixam de aparecer aqui. Continuar?`)) return;
    }

    setSalvando(true);
    try {
      const corpo = { requester_id: userId, company: company || undefined, nome: nova.nome, direcao: nova.direcao, prazo: nova.prazo, frequencia: nova.frequencia, medidas, setores, plano_id: nova.plano_id || null };
      if (nova.id) {
        await api.put(`/metas/${nova.id}`, corpo);
        toast('Meta atualizada.');
        if (voltarPara) { setAbertaId(voltarPara); setVoltarPara(null); }
      } else {
        await api.post('/metas', corpo);
        toast('Meta criada.');
      }
      setModal(null); carregar();
    } catch (e) { toast(e?.response?.data?.error || 'Não foi possível salvar.', 'error'); }
    setSalvando(false);
  };
  const salvarLanc = async () => {
    const ks = medidasDe(aberta);
    const limpar = (obj, chaves) => { const v = {}; chaves.forEach(k => { if (obj?.[k] !== '' && obj?.[k] != null) v[k] = Number(obj[k]); }); return v; };
    if (!lanc.data) return toast('Informe a data.', 'error');
    // Um pedido por linha preenchida: total (sem setor) e cada setor.
    const pedidos = [];
    const total = limpar(lanc.valores, ks);
    if (Object.keys(total).length) pedidos.push({ setor: '', valores: total, observacao: lanc.observacao });
    setoresDe(aberta).forEach(st => {
      const v = limpar(lanc.porSetor[st.nome], Object.keys(st.medidas));
      if (Object.keys(v).length) pedidos.push({ setor: st.nome, valores: v, observacao: lanc.observacao });
    });
    if (!pedidos.length) return toast('Informe pelo menos um número.', 'error');
    setSalvando(true);
    try {
      for (const pd of pedidos) {
        await api.post(`/metas/${aberta.id}/lancamentos`, { requester_id: userId, company: company || undefined, data: lanc.data, ...pd });
      }
      setModal(null); setLanc({ data: hoje(), valores: {}, porSetor: {}, observacao: '' }); toast('Lançado.'); carregar();
    } catch (e) { toast(e?.response?.data?.error || 'Não foi possível lançar.', 'error'); }
    setSalvando(false);
  };
  const apagarLanc = async (data, setor) => {
    if (!window.confirm('Apagar este lançamento?')) return;
    try { await api.delete(`/metas/${aberta.id}/lancamentos/${data}?${q}&setor=${encodeURIComponent(setor || '')}`); carregar(); }
    catch (e) { toast(e?.response?.data?.error || 'Não foi possível apagar.', 'error'); }
  };
  const apagarMeta = async (m) => {
    if (!window.confirm(`Apagar a meta "${m.nome}"? Ela some da lista.`)) return;
    try { await api.delete(`/metas/${m.id}?${q}`); setAbertaId(null); toast('Meta apagada.'); carregar(); }
    catch (e) { toast(e?.response?.data?.error || 'Não foi possível apagar.', 'error'); }
  };
  const setGrafico = async (g) => {
    // Otimista: é preferência de leitura, não precisa esperar o servidor.
    setDados(d => ({ ...d, metas: d.metas.map(m => m.id === aberta.id ? { ...m, grafico: g } : m) }));
    try { await api.put(`/metas/${aberta.id}`, { requester_id: userId, company: company || undefined, grafico: g }); } catch { /* fica só na tela */ }
  };

  const cabecalho = (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 9 }}><Target size={20} style={{ color: 'var(--primary)' }}/> Resultados</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 2 }}>Lance o número de cada período e acompanhe a evolução — da empresa e dos planos de ação.</p>
      </div>
      {dados.podeGerir && !aberta && <button className="btn btn-primary" onClick={abrirNova}><Plus size={15}/> Nova meta</button>}
    </div>
  );

  // ── Tela da meta ────────────────────────────────────────────
  if (aberta) {
    const pl = planoDe(aberta.plano_id);
    const sets = setoresDe(aberta);
    const setorValido = setorFoco && sets.some(s => s.nome === setorFoco) ? setorFoco : TOTAL;
    const r = resumo(aberta, setorValido);
    const rTotal = setorValido ? resumo(aberta) : r;
    const foco = medida ? analisar(aberta, medida, setorValido) : null;
    const tipoAtual = foco ? (aberta.grafico === 'auto' ? graficoAutomatico(aberta, foco) : aberta.grafico) : null;
    const ks = medidasDe(aberta);
    const lancs = [...(aberta.lancamentos || [])].sort((a, b) => String(b.data).localeCompare(String(a.data)) || String(a.setor || '').localeCompare(String(b.setor || '')));
    // Setor que mais segura o resultado: o de menor progresso médio.
    const porSetor = sets.map(st => ({ nome: st.nome, r: resumo(aberta, st.nome) })).filter(x => x.r.as.length);
    const setorPior = porSetor.length ? porSetor.reduce((p, x) => (x.r.pct < p.r.pct ? x : p), porSetor[0]) : null;
    return (
      <div>
        {cabecalho}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}><button className="btn btn-sm" onClick={() => { setAbertaId(null); setMedida(null); setSetorFoco(TOTAL); }}><ChevronLeft size={14}/> Resultados</button></div>

        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{aberta.nome}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                {aberta.direcao === 'reduzir' ? 'Reduzir' : 'Aumentar'} · prazo {br(aberta.prazo)} · lança {FREQ[aberta.frequencia]}{pl ? ` · 🎯 ${pl.titulo}` : ' · meta da empresa (sem plano)'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Selo cor={rTotal.cor}>{rTotal.atingiu ? 'Meta atingida' : `${rTotal.pct}% do caminho`}</Selo>
              <button className="btn btn-primary btn-sm" onClick={() => { setLanc({ data: hoje(), valores: {}, porSetor: {}, observacao: '' }); setModal('lancar'); }}><Plus size={14}/> Lançar</button>
              {/* Editar existe principalmente para ligar o acompanhamento
                  por setor depois — antes só dava para isso apagando a meta
                  e perdendo os lançamentos. */}
              <button className="btn btn-sm" onClick={() => abrirEdicao(aberta)} title="Editar a meta, o prazo e os setores">Editar</button>
              {dados.podeGerir && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => apagarMeta(aberta)}><Trash2 size={14}/></button>}
            </div>
          </div>
          {rTotal.pior && (
            <div style={{ marginTop: 10, background: 'rgba(232,98,42,.08)', border: '1px solid rgba(232,98,42,.2)', borderRadius: 10, padding: '8px 12px', fontSize: 12.5, lineHeight: 1.55 }}>
              {rTotal.atingiu ? 'Todas as medidas bateram a meta. 🎉' : <><b>{rTotal.pior.T.nome}</b> é o que mais segura o resultado: {rTotal.pior.frase}</>}
              {setorPior && !rTotal.atingiu && <> <b>{setorPior.nome}</b> é o setor mais atrasado ({setorPior.r.pct}% do caminho).</>}
            </div>
          )}
        </div>

        {/* Por setor: a visão que vai para a reunião. Uma linha por setor
            com atual / meta / % em cada medida; clique abre o gráfico do setor. */}
        {sets.length > 0 && (
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <h3 style={{ fontWeight: 700, fontSize: 14, margin: 0 }}>Por área</h3>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total = soma dos setores em quantidade e R$; o percentual do total é o lançado (ou média ponderada).</div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr>
                  <th style={{ textAlign: 'left', padding: '7px 8px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>Setor</th>
                  {ks.map(k => <th key={k} style={{ textAlign: 'right', padding: '7px 8px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{MEDIDAS[k].curto} · atual / meta</th>)}
                  <th style={{ textAlign: 'right', padding: '7px 8px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>Caminho</th>
                </tr></thead>
                <tbody>
                  {[{ nome: TOTAL, r: rTotal }, ...porSetor].map(({ nome, r: rs }) => {
                    const ativo = setorValido === nome;
                    return (
                      <tr key={nome || '__total'} onClick={() => { setSetorFoco(nome); setMedida(null); }} style={{ cursor: 'pointer', background: ativo ? 'rgba(232,98,42,.08)' : 'transparent' }}>
                        <td style={{ padding: '8px', borderBottom: '1px solid var(--border)', fontWeight: nome ? 600 : 800 }}>{nome || 'Total'}</td>
                        {ks.map(k => { const a = rs.as.find(x => x.k === k); return (
                          <td key={k} style={{ padding: '8px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                            {a ? <><b>{a.T.fmt(a.atual)}</b> <span style={{ color: 'var(--text-muted)' }}>· {metaLida(aberta, a)}</span></> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                          </td>); })}
                        <td style={{ padding: '8px', borderBottom: '1px solid var(--border)', textAlign: 'right' }}><Selo cor={rs.cor}>{rs.atingiu ? '✓ atingiu' : `${rs.pct}%`}</Selo></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <h3 style={{ fontWeight: 700, fontSize: 14, margin: 0 }}>{setorValido ? `${setorValido} — ` : sets.length ? 'Total — ' : ''}{foco ? foco.T.nome : 'Painel — as medidas lado a lado'}</h3>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {foco && <button className="btn btn-sm" onClick={() => setMedida(null)}><LayoutGrid size={13}/> Ver painel</button>}
              {[['auto', 'Automático'], ['linha', 'Linha'], ['barras', 'Barras'], ['progresso', 'Progresso']].map(([g, t]) => (
                <button key={g} onClick={() => setGrafico(g)}
                  style={{ padding: '4px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                           border: `1px solid ${aberta.grafico === g ? 'var(--primary)' : 'var(--border)'}`,
                           background: aberta.grafico === g ? 'var(--primary)' : 'transparent',
                           color: aberta.grafico === g ? '#fff' : 'var(--text-muted)' }}>{t}</button>
              ))}
            </div>
          </div>
          {foco ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 8 }}>
                {/* O número fica em tinta de texto; quem carrega o estado é
                    a marca colorida ao lado, com palavra junto. Número verde
                    ou vermelho some para quem não distingue as cores — e,
                    em tamanho grande, cansa a leitura. */}
                {[['Atual', foco.T.fmt(foco.atual), foco.dataAtual ? br(foco.dataAtual) : 'partida', foco.cor],
                  ['Meta', foco.T.fmt(foco.cfg.meta), `até ${br(aberta.prazo)}`, null],
                  ['Do caminho', `${Math.round(foco.pct)}%`, `saiu de ${foco.T.fmt(foco.cfg.inicial)}`, foco.cor],
                  ['Prazo', foco.restam >= 0 ? `${foco.restam}d` : 'vencido', foco.restam >= 0 ? 'restantes' : `${-foco.restam} dias atrás`, null]].map(([r1, v, s, c]) => (
                  <div key={r1} style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>{r1}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', display: 'flex', alignItems: 'center', gap: 7 }}>
                      {c && <span style={{ width: 9, height: 9, borderRadius: '50%', background: c, flexShrink: 0 }}/>}
                      {v}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{s}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.55 }}>{foco.frase}</div>
              <Grafico m={aberta} a={foco}/>
              {tipoAtual !== 'progresso' && <Progresso a={foco} m={aberta}/>}
            </>
          ) : (
            <>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 8 }}>Cada quadro é uma forma de medir a mesma meta. Toque num quadro para ver o gráfico grande e se, no ritmo atual, chega no prazo.</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
                {r.as.map(a => (
                  <div key={a.k} onClick={() => setMedida(a.k)} style={{ background: 'var(--surface-2)', borderRadius: 12, padding: 12, cursor: 'pointer', border: '1.5px solid transparent' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>{a.T.nome}</span>
                      {/* A cor mora no selo, e o selo diz em palavras o que
                          a cor está dizendo — quem não distingue as cores lê
                          a mesma informação. */}
                      <Selo cor={a.cor}>{a.atingiu ? '✓ na meta' : `${Math.round(a.pct)}% do caminho`}</Selo>
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: '2px 0 4px', fontVariantNumeric: 'tabular-nums' }}>{a.T.fmt(a.atual)} <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>· meta {metaLida(aberta, a)}</span></div>
                    <Grafico m={aberta} a={a} mini/>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="card">
          <h3 style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Lançamentos</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr>
                {['Data', ...(sets.length ? ['Área'] : []), ...ks.map(k => MEDIDAS[k].curto), 'Quem', ''].map((h, i) => <th key={i} style={{ textAlign: ks.map(k => MEDIDAS[k].curto).includes(h) ? 'right' : 'left', padding: '7px 8px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {lancs.map(l => (
                  <tr key={`${l.data}|${l.setor || ''}`}>
                    <td style={{ padding: '7px 8px', borderBottom: '1px solid var(--border)' }}>{br(l.data)}</td>
                    {sets.length > 0 && <td style={{ padding: '7px 8px', borderBottom: '1px solid var(--border)', fontWeight: l.setor ? 500 : 700 }}>{l.setor || 'Total'}</td>}
                    {ks.map(k => <td key={k} style={{ padding: '7px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{l.valores?.[k] != null ? MEDIDAS[k].fmt(l.valores[k]) : '—'}</td>)}
                    <td style={{ padding: '7px 8px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)' }}>
                      {l.quem?.full_name?.split(' ')[0] || '—'}
                      {l.observacao && (
                        <div style={{ fontSize: 11.5, color: 'var(--text)', opacity: .85, marginTop: 2, lineHeight: 1.35, whiteSpace: 'pre-wrap' }}>
                          💬 {l.observacao}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '7px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>
                      {(dados.podeGerir || l.lancado_por === userId) && <button className="btn-icon" onClick={() => apagarLanc(String(l.data).slice(0, 10), l.setor || '')} title="Apagar"><X size={13}/></button>}
                    </td>
                  </tr>
                ))}
                {!lancs.length && <tr><td colSpan={ks.length + 3 + (sets.length ? 1 : 0)} style={{ padding: 14, color: 'var(--text-muted)', fontSize: 12.5 }}>Nenhum lançamento. Clique em "Lançar".</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <Modal open={modal === 'lancar'} onClose={() => setModal(null)} title={`Lançar número — ${aberta.nome}`}
          footer={<><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancelar</button><button className="btn btn-primary" onClick={salvarLanc} disabled={salvando}>{salvando ? 'Lançando...' : 'Lançar'}</button></>}>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.55 }}>Informe a data e como ficou o número nesse dia/semana/mês. Se lançar duas vezes na mesma data, vale o último.</p>
          <Rotulo>Data do lançamento</Rotulo>
          <input type="date" style={inputStyle} value={lanc.data} onChange={e => setLanc(l => ({ ...l, data: e.target.value }))}/>
          {sets.length === 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              {ks.map(k => (
                <div key={k}>
                  <Rotulo>{MEDIDAS[k].nome} — como ficou</Rotulo>
                  <input type="number" step={MEDIDAS[k].passo} style={inputStyle} value={lanc.valores[k] ?? ''} placeholder={`a meta é ${MEDIDAS[k].fmt(aberta.medidas[k].meta)}`}
                    onChange={e => setLanc(l => ({ ...l, valores: { ...l.valores, [k]: e.target.value } }))}/>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 4px' }}>Uma linha por área. Quantidade e R$ do total somam sozinhos{ks.includes('percentual') ? '; o % do total você lança na linha "Total" (ou deixa em branco para a média ponderada)' : ''}.</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr><th style={{ textAlign: 'left', padding: '6px 4px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Área</th>{ks.map(k => <th key={k} style={{ textAlign: 'left', padding: '6px 4px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{MEDIDAS[k].curto}</th>)}</tr></thead>
                  <tbody>
                    {sets.map(st => (
                      <tr key={st.nome}>
                        <td style={{ padding: '4px', fontWeight: 600, whiteSpace: 'nowrap' }}>{st.nome}</td>
                        {ks.map(k => <td key={k} style={{ padding: '4px' }}>
                          {st.medidas[k]
                            ? <input type="number" step={MEDIDAS[k].passo} style={{ ...inputStyle, minWidth: 110 }} value={lanc.porSetor[st.nome]?.[k] ?? ''} placeholder={`meta ${MEDIDAS[k].fmt(st.medidas[k].meta)}`}
                                onChange={e => setLanc(l => ({ ...l, porSetor: { ...l.porSetor, [st.nome]: { ...(l.porSetor[st.nome] || {}), [k]: e.target.value } } }))}/>
                            : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                        </td>)}
                      </tr>
                    ))}
                    {ks.includes('percentual') && (
                      <tr>
                        <td style={{ padding: '4px', fontWeight: 800, whiteSpace: 'nowrap' }}>Total</td>
                        {ks.map(k => <td key={k} style={{ padding: '4px' }}>
                          {k === 'percentual'
                            ? <input type="number" step={0.1} style={{ ...inputStyle, minWidth: 110 }} value={lanc.valores.percentual ?? ''} placeholder={`meta ${MEDIDAS.percentual.fmt(aberta.medidas.percentual.meta)}`}
                                onChange={e => setLanc(l => ({ ...l, valores: { ...l.valores, percentual: e.target.value } }))}/>
                            : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>soma</span>}
                        </td>)}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* O que explica o número. Sem isto, três meses depois ninguém
              lembra por que a semana caiu, e o gráfico vira uma linha sem
              história — que é justamente o que se discute na reunião. */}
          <div style={{ marginTop: 12 }}>
            <Rotulo>Observação (opcional)</Rotulo>
            <textarea rows={2} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              value={lanc.observacao}
              onChange={e => setLanc(l => ({ ...l, observacao: e.target.value }))}
              placeholder="O que explica esse número? Ex: faltou o caminhão na quarta"/>
          </div>
        </Modal>
      </div>
    );
  }

  // ── Lista ───────────────────────────────────────────────────
  const atingidas = dados.metas.filter(m => resumo(m).atingiu).length;
  const planoFiltrado = dados.planos.find(p => p.id === filtro);
  return (
    <div>
      {cabecalho}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 8 }}>
          {dados.metas.length} meta(s) · {atingidas} atingida(s). Aqui você lança o número de cada período: das metas da loja e das de cada plano de ação. Todo plano do PDCA aparece nos filtros.
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[['todas', `Todas (${dados.metas.length})`], ['livres', `Da loja (${dados.metas.filter(m => !m.plano_id).length})`],
            ...dados.planos.map(p => [p.id, `🎯 ${p.titulo} (${dados.metas.filter(m => m.plano_id === p.id).length})`])].map(([id, t]) => (
            <button key={id} onClick={() => setFiltro(id)}
              style={{ padding: '5px 11px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                       border: `1px solid ${filtro === id ? 'var(--primary)' : 'var(--border)'}`,
                       background: filtro === id ? 'var(--primary)' : 'transparent', color: filtro === id ? '#fff' : 'var(--text-muted)' }}>{t}</button>
          ))}
        </div>
      </div>

      {carregando ? <div className="card" style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>Carregando...</div>
      : lista.length === 0 ? (
        <div className="card">
          {planoFiltrado ? (
            <>
              <b>Este plano de ação ainda não tem meta com número.</b>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4 }}>A meta escrita no plano ("{planoFiltrado.meta || 'sem texto'}") é só texto. Crie a meta com número para acompanhar no gráfico.</div>
              {dados.podeGerir && <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={abrirNova}><Plus size={14}/> Criar a primeira meta deste plano</button>}
            </>
          ) : <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nenhuma meta aqui ainda.{dados.podeGerir ? ' Clique em "Nova meta".' : ''}</span>}
        </div>
      ) : lista.map(m => {
        const r = resumo(m); const p = planoDe(m.plano_id);
        return (
          <div key={m.id} className="card" onClick={() => { setAbertaId(m.id); setMedida(null); setSetorFoco(TOTAL); }}
            style={{ cursor: 'pointer', borderLeft: `4px solid ${r.cor}`, borderRadius: '0 12px 12px 0', marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <b style={{ fontSize: 14 }}>{m.nome}</b><Selo cor={r.cor}>{r.atingiu ? 'Meta atingida' : `${r.pct}% do caminho`}</Selo>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.direcao === 'reduzir' ? 'Reduzir' : 'Aumentar'} · até {br(m.prazo)} · lança {FREQ[m.frequencia]}{p ? ` · 🎯 ${p.titulo}` : ''}</div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${r.as.length || 1}, 1fr)`, gap: 10, marginTop: 8 }}>
              {r.as.map(a => (
                <div key={a.k}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>{a.T.curto} · <b style={{ color: 'var(--text)' }}>{a.T.fmt(a.atual)}</b> <span style={{ fontWeight: 400 }}>· meta {metaLida(m, a)}</span></div>
                  <Progresso a={a} compacto/>
                </div>
              ))}
            </div>
            {setoresDe(m).length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {setoresDe(m).map(st => { const rs = resumo(m, st.nome); return <Selo key={st.nome} cor={rs.cor}>{st.nome} · {rs.atingiu ? 'atingiu' : `${rs.pct}%`}</Selo>; })}
              </div>
            )}
          </div>
        );
      })}

      <Modal open={modal === 'nova'} onClose={() => setModal(null)} title={nova?.id ? 'Editar meta' : 'Nova meta'}
        footer={<><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancelar</button><button className="btn btn-primary" onClick={salvarNova} disabled={salvando}>{salvando ? 'Salvando...' : (nova?.id ? 'Salvar alterações' : 'Criar meta')}</button></>}>
        {nova && (() => {
          const ks = ORDEM.filter(k => nova.usa[k]);
          const set = (patch) => setNova(n => ({ ...n, ...patch }));
          const setVal = (k, campo, v) => setNova(n => ({ ...n, val: { ...n.val, [k]: { ...n.val[k], [campo]: v } } }));
          const escolha = (on) => ({ padding: '7px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'left', border: `1px solid ${on ? 'var(--primary)' : 'var(--border)'}`, background: on ? 'rgba(232,98,42,.08)' : 'transparent', color: on ? 'var(--primary)' : 'var(--text-muted)' });
          return (
            <>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Em 4 passos: o que medir · como medir · de onde sai e onde quer chegar · até quando.</p>
              <Rotulo>1. O que você quer acompanhar?</Rotulo>
              <input style={inputStyle} value={nova.nome} maxLength={80} onChange={e => set({ nome: e.target.value })} placeholder="Ex.: Vendas do mês · Retrabalho na produção · Faltas da equipe"/>
              <Rotulo>2. O número precisa subir ou descer?</Rotulo>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" style={escolha(nova.direcao === 'aumentar')} onClick={() => set({ direcao: 'aumentar' })}>⬆ Subir — quanto maior, melhor (venda, conversão)</button>
                <button type="button" style={escolha(nova.direcao === 'reduzir')} onClick={() => set({ direcao: 'reduzir' })}>⬇ Descer — quanto menor, melhor (ruptura, perda, faltas)</button>
              </div>
              <Rotulo>3. Como você mede? <span style={{ fontWeight: 400, textTransform: 'none' }}>Pode marcar mais de uma — elas aparecem lado a lado.</span></Rotulo>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {ORDEM.map(k => (
                  <button key={k} type="button" style={{ ...escolha(nova.usa[k]), flex: '1 1 150px' }} onClick={() => set({ usa: { ...nova.usa, [k]: !nova.usa[k] } })}>
                    <div>{nova.usa[k] ? '☑' : '☐'} {MEDIDAS[k].nome}</div><div style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>{MEDIDAS[k].ex}</div>
                  </button>
                ))}
              </div>
              {ks.length > 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>Para cada medida marcada: <b>hoje está em</b> (o número de partida) e <b>quer chegar em</b> (a meta).</div>}
              {ks.map(k => (
                <div key={k} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px', marginTop: 8 }}>
                  <b style={{ fontSize: 12.5 }}>{MEDIDAS[k].nome}</b>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div><Rotulo>Hoje está em</Rotulo><input type="number" step={MEDIDAS[k].passo} style={inputStyle} value={nova.val[k].inicial} placeholder={MEDIDAS[k].ph[0]} onChange={e => setVal(k, 'inicial', e.target.value)}/></div>
                    <div><Rotulo>Quer chegar em</Rotulo><input type="number" step={MEDIDAS[k].passo} style={inputStyle} value={nova.val[k].meta} placeholder={MEDIDAS[k].ph[1]} onChange={e => setVal(k, 'meta', e.target.value)}/></div>
                  </div>
                </div>
              ))}
              <Rotulo>4. Até quando, e de quanto em quanto tempo você lança o número?</Rotulo>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><input type="date" style={inputStyle} value={nova.prazo} onChange={e => set({ prazo: e.target.value })}/><div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Prazo final da meta</div></div>
                <div>
                  <select className="select" value={nova.frequencia} onChange={e => set({ frequencia: e.target.value })}>
                    {Object.entries(FREQ).map(([k, t]) => <option key={k} value={k}>Lanço {t}</option>)}
                  </select>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Mensal vira gráfico de barras; diário/semanal vira linha com tendência</div>
                </div>
              </div>
              {/* Setor aqui é qualquer recorte que a pessoa use: setor,
                  área, equipe, turno, filial, obra. As sugestões vêm do que
                  a própria empresa cadastrou, e o campo livre aceita
                  qualquer nome — este app não é só de loja. */}
              <Rotulo>5. Quer acompanhar separado por área? <span style={{ fontWeight: 400, textTransform: 'none' }}>(opcional) — o total e cada parte: setor, equipe, turno, filial, o que fizer sentido para você</span></Rotulo>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" style={escolha(!nova.porSetor)} onClick={() => set({ porSetor: false })}>Não — só o total</button>
                <button type="button" style={escolha(nova.porSetor)} onClick={() => set({ porSetor: true })}>Sim — total + partes</button>
              </div>
              {nova.porSetor && (() => {
                const vazio = () => Object.fromEntries(ks.map(k => [k, { inicial: '', meta: '' }]));
                const ligar = (nome) => { if (!nome || nova.setores.some(s => s.nome.toLowerCase() === nome.toLowerCase())) return; set({ setores: [...nova.setores, { nome, val: vazio() }], novoSetor: '' }); };
                const tirar = (nome) => set({ setores: nova.setores.filter(s => s.nome !== nome) });
                const setValSetor = (nome, k, campo, v) => set({ setores: nova.setores.map(s => s.nome === nome ? { ...s, val: { ...s.val, [k]: { ...(s.val[k] || { inicial: '', meta: '' }), [campo]: v } } } : s) });
                const sugestoes = (dados.setoresLoja || []).filter(n => !nova.setores.some(s => s.nome.toLowerCase() === n.toLowerCase()));
                return (
                  <div style={{ marginTop: 8 }}>
                    {sugestoes.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                        {sugestoes.map(n => <button key={n} type="button" className="btn btn-sm" onClick={() => ligar(n)}>+ {n}</button>)}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input style={inputStyle} value={nova.novoSetor} maxLength={40} placeholder="Digite o nome e aperte Enter — ex.: Comercial, Turno da noite, Filial Centro" onChange={e => set({ novoSetor: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ligar(nova.novoSetor.trim()); } }}/>
                      <button type="button" className="btn btn-sm" onClick={() => ligar(nova.novoSetor.trim())}>Adicionar</button>
                    </div>
                    {nova.setores.map(st => (
                      <div key={st.nome} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px', marginTop: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <b style={{ fontSize: 12.5 }}>{st.nome}</b>
                          <button type="button" className="btn-icon" onClick={() => tirar(st.nome)} title="Tirar da lista"><X size={13}/></button>
                        </div>
                        {ks.map(k => (
                          <div key={k} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div><Rotulo>{MEDIDAS[k].nome} — hoje está em</Rotulo><input type="number" step={MEDIDAS[k].passo} style={inputStyle} value={st.val?.[k]?.inicial ?? ''} onChange={e => setValSetor(st.nome, k, 'inicial', e.target.value)}/></div>
                            <div><Rotulo>Quer chegar em</Rotulo><input type="number" step={MEDIDAS[k].passo} style={inputStyle} value={st.val?.[k]?.meta ?? ''} onChange={e => setValSetor(st.nome, k, 'meta', e.target.value)}/></div>
                          </div>
                        ))}
                      </div>
                    ))}
                    {ks.length > 0 && nova.setores.length > 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>Dica: a soma das metas das partes costuma bater com a meta do total.</div>}
                  </div>
                );
              })()}

              <Rotulo>Essa meta faz parte de um plano de ação? <span style={{ fontWeight: 400, textTransform: 'none' }}>(opcional)</span></Rotulo>
              <select className="select" value={nova.plano_id} onChange={e => set({ plano_id: e.target.value })}>
                <option value="">Não — é uma meta da empresa</option>
                {dados.planos.map(p => <option key={p.id} value={p.id}>🎯 {p.titulo}</option>)}
              </select>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Todos os planos do PDCA aparecem aqui. Ligando, a meta também fica visível dentro do plano.</div>
            </>
          );
        })()}
      </Modal>
    </div>
  );
}
