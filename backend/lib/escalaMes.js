// ─────────────────────────────────────────────────────────────
// Relatório do mês da LOJA INTEIRA.
//
// A Análise que já existia olha UMA escala por vez e procura infração de
// jornada. Isto aqui é outra pergunta: com 20 e poucas escalas, como está a
// loja no mês? Onde falta líder, que dia ficou fino, onde as folgas se
// amontoaram, quanta gente está de férias.
//
// REGRA DE OURO DESTE ARQUIVO (paga caro na análise anterior): relatório que
// grita à toa deixa de ser lido na segunda vez. Todo achado aqui tem piso de
// tamanho — setor com 2 pessoas não entra em estatística de distribuição — e
// vem com a DATA, porque achado sem data não serve para nada.
//
// O cálculo vive separado da rota de propósito: assim dá para rodá-lo contra
// escalas montadas à mão e conferir que uma escala boa gera zero alerta.
// ─────────────────────────────────────────────────────────────

const FOLGAS = ['folga', 'dsr', 'folga_premio', 'folga_feriado', 'feriado'];
const FERIAS = 'ferias';

// Number('') é 0, não NaN — foi o que gerou 80 alertas falsos na primeira
// versão da análise. Campo vazio precisa virar null.
const paraMinutos = (t) => {
  const partes = String(t ?? '').trim().split(':');
  if (partes.length < 2) return null;
  const h = Number(partes[0]), m = Number(partes[1]);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

const CURTO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
const diaSemana = (iso) => new Date(iso + 'T12:00:00Z').getUTCDay();
const diaCurto = (iso) => `${CURTO[diaSemana(iso)]} ${iso.slice(8)}/${iso.slice(5, 7)}`;
const hhmm = (min) => `${String(Math.floor((min % 1440) / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

const mediana = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Cargo que manda em gente. A escala marcada como "Liderança" é a fonte
// confiável; isto aqui é a segunda leitura, pelo cargo escrito na escala —
// serve para ver o líder DE SETOR, que não está naquela escala.
const EH_CARGO_LIDER = /l[ií]der|encarregad|supervisor|gerent|coordenad|chefe/i;

const FATIA = 30;                 // meia em meia hora
const FATIAS = 1440 / FATIA;      // 48 no dia

// Em que fatias do dia esta pessoa está na loja (fora do intervalo).
function fatiasDoTurno(e) {
  const ini = paraMinutos(e.entrada);
  let fim = paraMinutos(e.saida);
  if (ini === null || fim === null) return [];
  if (fim <= ini) fim += 1440;          // vira o dia
  let pausa = paraMinutos(e.intervalo);
  let volta = paraMinutos(e.retorno_intervalo);
  // Turno que vira o dia: a pausa das 02:00 de quem entrou 23:00 precisa vir
  // para a mesma linha do tempo, senão ela não é descontada e a pessoa
  // aparece na loja durante o próprio intervalo.
  if (pausa !== null && volta !== null && fim > 1440) {
    if (pausa < ini)   pausa += 1440;
    if (volta < pausa) volta += 1440;
  }
  const temPausa = pausa !== null && volta !== null && volta > pausa;

  const dentro = [];
  for (let m = Math.floor(ini / FATIA) * FATIA; m < fim; m += FATIA) {
    if (temPausa && m >= pausa && m < volta) continue;
    dentro.push((m / FATIA) % FATIAS);
  }
  return dentro;
}

// Junta fatias vazias vizinhas numa faixa só: "sem líder das 06:00 às 08:00"
// é uma informação; seis linhas de meia hora não são.
function faixasVazias(temGente, de, ate) {
  const faixas = [];
  let inicio = null;
  for (let f = de; f <= ate; f++) {
    if (!temGente[f]) { if (inicio === null) inicio = f; }
    else if (inicio !== null) { faixas.push({ de: hhmm(inicio * FATIA), ate: hhmm(f * FATIA) }); inicio = null; }
  }
  if (inicio !== null) faixas.push({ de: hhmm(inicio * FATIA), ate: hhmm((ate + 1) * FATIA) });
  return faixas;
}

// Cobertura de um grupo de pessoas ao longo do mês.
function cobertura(linhasDoGrupo, dias, janelaDoDia) {
  const porDia = {};
  dias.forEach(d => { porDia[d] = { data: d, n: 0, fatias: new Array(FATIAS).fill(0), pessoas: [] }; });

  for (const e of linhasDoGrupo) {
    const alvo = porDia[e.work_date];
    if (!alvo) continue;
    alvo.n++;
    if (!alvo.pessoas.includes(e.nome)) alvo.pessoas.push(e.nome);
    for (const f of fatiasDoTurno(e)) alvo.fatias[f]++;
  }

  const semNinguem = [];
  const umSo = [];
  const buracos = [];
  for (const d of dias) {
    const dia = porDia[d];
    const janela = janelaDoDia[d];
    if (!janela) continue;                       // loja fechada nesse dia
    if (dia.n === 0) { semNinguem.push({ data: d, rotulo: diaCurto(d) }); continue; }
    if (dia.n === 1) umSo.push({ data: d, rotulo: diaCurto(d), quem: dia.pessoas[0] });
    const vazias = faixasVazias(dia.fatias, janela.de, janela.ate);
    if (vazias.length) buracos.push({ data: d, rotulo: diaCurto(d), faixas: vazias });
  }

  // Em que horário a falha se repete — é a dica de horário, e ela só vale
  // se a mesma fatia falhar em vários dias.
  const porFatia = new Array(FATIAS).fill(0);
  let diasConsiderados = 0;
  for (const d of dias) {
    const janela = janelaDoDia[d];
    if (!janela) continue;
    diasConsiderados++;
    for (let f = janela.de; f <= janela.ate; f++) if (!porDia[d].fatias[f]) porFatia[f]++;
  }
  const horariosCriticos = porFatia
    .map((n, f) => ({ hora: hhmm(f * FATIA), diasSem: n }))
    .filter(x => x.diasSem >= Math.max(3, Math.round(diasConsiderados * 0.3)))
    .sort((a, b) => b.diasSem - a.diasSem)
    .slice(0, 8);

  return {
    porDia: dias.map(d => ({ data: d, rotulo: diaCurto(d), n: porDia[d].n })),
    semNinguem, umSo, buracos, horariosCriticos, diasConsiderados,
  };
}

/**
 * @param entries  linhas de schedule_entries já achatadas:
 *                 { user_id, work_date, status, entrada, intervalo,
 *                   retorno_intervalo, saida, nome, cargo, setor }
 * @param perfis   [{ id, full_name, escala_lideranca, escala_setor, sector }]
 * @param setores  [{ sector_name, efetivo_minimo }]
 * @param entregues Set de user_id que já fecharam o mês
 */
function analisarMes({ entries, perfis, setores = [], entregues = new Set(), year, month }) {
  const ultimo = new Date(year, month, 0).getDate();
  const p2 = (n) => String(n).padStart(2, '0');
  const dias = Array.from({ length: ultimo }, (_, i) => `${year}-${p2(month)}-${p2(i + 1)}`);

  const trabalha = entries.filter(e => e.status === 'trabalha');

  // ── Janela de funcionamento de cada dia ────────────────────
  // Sai dos próprios lançamentos: dia sem ninguém é loja fechada, e loja
  // fechada não é buraco de cobertura. Foi a decisão que evitou 17 alertas
  // falsos na análise anterior.
  const janelaDoDia = {};
  for (const d of dias) {
    const doDia = trabalha.filter(e => e.work_date === d);
    const fatias = new Array(FATIAS).fill(0);
    let tem = false;
    for (const e of doDia) for (const f of fatiasDoTurno(e)) { fatias[f]++; tem = true; }
    if (!tem) continue;
    const ocupadas = fatias.map((n, f) => (n ? f : -1)).filter(f => f >= 0);
    janelaDoDia[d] = { de: Math.min(...ocupadas), ate: Math.max(...ocupadas), fatias };
  }

  // ── 1. Cobertura da liderança (a escala marcada) ───────────
  const idsLideranca = new Set(perfis.filter(p => p.escala_lideranca).map(p => p.id));
  const linhasLideranca = trabalha.filter(e => idsLideranca.has(e.user_id));
  const lideranca = {
    existe: idsLideranca.size > 0,
    escalas: perfis.filter(p => p.escala_lideranca).map(p => p.full_name),
    ...cobertura(linhasLideranca, dias, janelaDoDia),
  };

  // ── 2. Líderes de setor, pelo cargo escrito na escala ──────
  const linhasCargo = trabalha.filter(e => EH_CARGO_LIDER.test(e.cargo || ''));
  const porCargo = {
    quantos: new Set(linhasCargo.map(e => e.nome)).size,
    ...cobertura(linhasCargo, dias, janelaDoDia),
  };

  // ── 3. Gente por dia ───────────────────────────────────────
  const porDia = dias.map(d => {
    const doDia = entries.filter(e => e.work_date === d);
    return {
      data: d, rotulo: diaCurto(d),
      trabalham: doDia.filter(e => e.status === 'trabalha').length,
      folgam:    doDia.filter(e => FOLGAS.includes(e.status)).length,
      ferias:    doDia.filter(e => e.status === FERIAS).length,
      aberta:    !!janelaDoDia[d],
    };
  });
  const abertos = porDia.filter(d => d.aberta);
  const medTrabalham = mediana(abertos.map(d => d.trabalham));
  // "Fino" é 30% abaixo da mediana do próprio mês, nunca um número fixo:
  // cada loja tem um porte.
  const diasFracos = abertos
    .filter(d => medTrabalham >= 5 && d.trabalham <= medTrabalham * 0.7)
    .map(d => ({ ...d, mediana: medTrabalham }));

  // ── 4. Setor abaixo do efetivo mínimo ──────────────────────
  const minimoDe = {};
  setores.forEach(s => { if (s.efetivo_minimo != null) minimoDe[String(s.sector_name).trim()] = s.efetivo_minimo; });
  const abaixoDoMinimo = [];
  for (const d of dias) {
    if (!janelaDoDia[d]) continue;
    const contagem = {};
    trabalha.filter(e => e.work_date === d).forEach(e => {
      const st = (e.setor || '').trim(); if (!st) return;
      contagem[st] = (contagem[st] || 0) + 1;
    });
    for (const [setor, minimo] of Object.entries(minimoDe)) {
      const n = contagem[setor] || 0;
      if (n < minimo) abaixoDoMinimo.push({ data: d, rotulo: diaCurto(d), setor, escalados: n, minimo });
    }
  }

  // ── 5. Folgas amontoadas ───────────────────────────────────
  const medFolgas = mediana(abertos.map(d => d.folgam));
  const folgasConcentradas = abertos
    .filter(d => medFolgas >= 2 && d.folgam >= medFolgas * 1.6 && d.folgam >= medFolgas + 3)
    .map(d => {
      // Qual setor puxou: só vale para time de 3+, senão uma dupla folgando
      // junto vira "50% do setor de folga" e polui o relatório.
      const porSetor = {};
      entries.filter(e => e.work_date === d.data).forEach(e => {
        const st = (e.setor || '').trim() || 'Sem setor';
        porSetor[st] = porSetor[st] || { setor: st, time: 0, folgam: 0 };
        porSetor[st].time++;
        if (FOLGAS.includes(e.status)) porSetor[st].folgam++;
      });
      return {
        ...d, mediana: medFolgas,
        setores: Object.values(porSetor)
          .filter(s => s.time >= 3 && s.folgam / s.time >= 0.5)
          .sort((a, b) => b.folgam - a.folgam),
      };
    });

  // Folga amontoada DENTRO de um setor. A regra da loja inteira não pega
  // isto: 4 dos 6 da mercearia folgando no mesmo dia mal move a mediana da
  // loja, mas deixa o setor sem gente. Piso de 4 pessoas no time, senão uma
  // dupla folgando junto viraria "50% do setor de folga".
  const setoresComMuitaFolga = [];
  for (const d of dias) {
    if (!janelaDoDia[d]) continue;
    const porSetor = {};
    entries.filter(e => e.work_date === d).forEach(e => {
      const st = (e.setor || '').trim() || 'Sem setor';
      porSetor[st] = porSetor[st] || { setor: st, time: 0, folgam: 0, trabalham: 0 };
      porSetor[st].time++;
      if (FOLGAS.includes(e.status)) porSetor[st].folgam++;
      if (e.status === 'trabalha') porSetor[st].trabalham++;
    });
    Object.values(porSetor)
      .filter(s => s.time >= 4 && s.folgam / s.time >= 0.5)
      .forEach(s => setoresComMuitaFolga.push({ data: d, rotulo: diaCurto(d), ...s }));
  }

  // ── 6. Férias do mês ───────────────────────────────────────
  const porPessoaFerias = {};
  entries.filter(e => e.status === FERIAS).forEach(e => {
    const chave = `${e.nome}|${e.setor || ''}`;
    porPessoaFerias[chave] = porPessoaFerias[chave] || { nome: e.nome, setor: e.setor || '', dias: [] };
    porPessoaFerias[chave].dias.push(e.work_date);
  });
  const pessoasFerias = Object.values(porPessoaFerias).map(p => {
    const ord = p.dias.sort();
    return { nome: p.nome, setor: p.setor, dias: ord.length, de: ord[0], ate: ord[ord.length - 1] };
  }).sort((a, b) => b.dias - a.dias);
  const ferias = {
    pessoas: pessoasFerias,
    quantas: pessoasFerias.length,
    totalDias: pessoasFerias.reduce((s, p) => s + p.dias, 0),
    // Em que semana do mês pesa mais — é o que ajuda a remanejar.
    porSemana: (() => {
      const sem = {};
      entries.filter(e => e.status === FERIAS).forEach(e => {
        const n = Math.ceil(Number(e.work_date.slice(8)) / 7);
        sem[n] = (sem[n] || 0) + 1;
      });
      return Object.entries(sem).map(([n, dias]) => ({ semana: Number(n), dias })).sort((a, b) => a.semana - b.semana);
    })(),
  };

  // ── 7. Curva de horário da loja ────────────────────────────
  const somaFatia = new Array(FATIAS).fill(0);
  let diasAbertos = 0;
  for (const d of dias) {
    const j = janelaDoDia[d];
    if (!j) continue;
    diasAbertos++;
    j.fatias.forEach((n, f) => { somaFatia[f] += n; });
  }
  const curva = somaFatia
    .map((soma, f) => ({ hora: hhmm(f * FATIA), media: diasAbertos ? +(soma / diasAbertos).toFixed(1) : 0 }))
    .filter(x => x.media > 0);
  const pico = curva.reduce((a, b) => (b.media > a.media ? b : a), curva[0] || { media: 0 });
  const vales = [...curva].sort((a, b) => a.media - b.media).slice(0, 3);

  // ── 8. Quem fecha, quem pega domingo ───────────────────────
  // "Fechamento" é relativo ao SETOR: a última saída daquele setor no mês.
  // Um número fixo (21:00) acusaria a padaria inteira e inocentaria o
  // administrativo.
  const ultimaSaidaDoSetor = {};
  trabalha.forEach(e => {
    const st = (e.setor || '').trim() || 'Sem setor';
    const ini = paraMinutos(e.entrada);
    let fim = paraMinutos(e.saida);
    if (ini === null || fim === null) return;
    if (fim <= ini) fim += 1440;
    ultimaSaidaDoSetor[st] = Math.max(ultimaSaidaDoSetor[st] ?? 0, fim);
  });
  const porPessoa = {};
  trabalha.forEach(e => {
    const st = (e.setor || '').trim() || 'Sem setor';
    const chave = `${e.nome}|${st}`;
    porPessoa[chave] = porPessoa[chave] || { nome: e.nome, setor: st, dias: 0, fechamentos: 0, domingos: 0, fimDeSemana: 0 };
    const p = porPessoa[chave];
    p.dias++;
    const dow = diaSemana(e.work_date);
    if (dow === 0) p.domingos++;
    if (dow === 0 || dow === 6) p.fimDeSemana++;
    const ini = paraMinutos(e.entrada);
    let fim = paraMinutos(e.saida);
    if (ini !== null && fim !== null) {
      if (fim <= ini) fim += 1440;
      if (fim >= (ultimaSaidaDoSetor[st] ?? 0) - 60) p.fechamentos++;
    }
  });
  // Só reporta o desequilíbrio quando o setor tem gente suficiente para que
  // a comparação signifique alguma coisa.
  const porSetorPessoas = {};
  Object.values(porPessoa).forEach(p => { (porSetorPessoas[p.setor] = porSetorPessoas[p.setor] || []).push(p); });
  const desequilibrio = Object.entries(porSetorPessoas)
    .filter(([, ps]) => ps.length >= 4)
    .map(([setor, ps]) => {
      const ordenado = [...ps].sort((a, b) => b.fechamentos - a.fechamentos);
      const maior = ordenado[0], menor = ordenado[ordenado.length - 1];
      return { setor, maior, menor, pessoas: ordenado,
               diferenca: maior.fechamentos - menor.fechamentos };
    })
    .filter(x => x.diferenca >= 8)
    .sort((a, b) => b.diferenca - a.diferenca);

  // ── 9. Escalas que ainda não foram fechadas ────────────────
  const donos = [...new Set(entries.map(e => e.user_id))];
  const naoEntregues = perfis
    .filter(p => donos.includes(p.id) && !entregues.has(p.id))
    .map(p => ({ nome: p.full_name, setor: p.escala_setor || p.sector || '' }));

  return {
    mes: { year, month, dias: dias.length, diasAbertos },
    lideranca, porCargo,
    porDia, medianaTrabalham: medTrabalham, diasFracos,
    abaixoDoMinimo, folgasConcentradas, setoresComMuitaFolga, ferias,
    curva: { pontos: curva, pico, vales },
    equipe: { pessoas: Object.values(porPessoa).sort((a, b) => b.fechamentos - a.fechamentos), desequilibrio },
    naoEntregues,
    escalas: donos.length,
  };
}

module.exports = { analisarMes, paraMinutos, fatiasDoTurno, diaCurto, hhmm, FOLGAS };
