// Temas do torneio — aparência e vocabulário. Nada aqui muda pontuação.
//
// O que faz um torneio pegar não é o placar: é a conversa que ele gera no
// corredor. "Setor Mercearia — 340 pontos" é relatório. "Casa Mercearia —
// 340 de honra" é assunto. Mesma tela, mesma conta, sensação diferente.
//
// TEMAS SÃO ORIGINAIS DE PROPÓSITO. Universo medieval, campeonato e corrida
// são de domínio comum; nomes de séries, times reais e escuderias são marca
// registrada, e o app é vendido. O tema sendo nosso, ele também pode ir para
// a página de vendas e para o Instagram sem pedir licença a ninguém.

export const TEMAS = {
  classico: {
    nome: 'Clássico',
    descricao: 'Sem tema. Direto ao ponto.',
    emblema: '🏆',
    grupo: 'Setor', grupos: 'Setores',
    ponto: 'ponto', pontos: 'pontos',
    campeao: 'Líder',
    cores: { principal: '#E8681A', fundo: 'rgba(232,104,26,.10)', borda: 'rgba(232,104,26,.35)' },
    medalhas: ['#F5C518', '#B9C2CC', '#CD7F32'],
  },

  reinos: {
    nome: 'Reinos',
    descricao: 'Casas em disputa por honra e pelo trono.',
    emblema: '⚔️',
    grupo: 'Casa', grupos: 'Casas',
    ponto: 'de honra', pontos: 'de honra',
    campeao: 'No trono',
    cores: { principal: '#C9A227', fundo: 'rgba(201,162,39,.10)', borda: 'rgba(201,162,39,.40)' },
    medalhas: ['#C9A227', '#9C8B6B', '#7A3B2E'],
  },

  copa: {
    nome: 'Copa',
    descricao: 'Times na disputa do campeonato.',
    emblema: '⚽',
    grupo: 'Time', grupos: 'Times',
    ponto: 'gol', pontos: 'gols',
    campeao: 'Na liderança',
    cores: { principal: '#16A34A', fundo: 'rgba(22,163,74,.10)', borda: 'rgba(22,163,74,.35)' },
    medalhas: ['#F5C518', '#B9C2CC', '#CD7F32'],
  },

  corrida: {
    nome: 'Corrida',
    descricao: 'Equipes disputando o pódio, volta a volta.',
    emblema: '🏁',
    grupo: 'Equipe', grupos: 'Equipes',
    ponto: 'volta', pontos: 'voltas',
    campeao: 'Na frente',
    cores: { principal: '#DC2626', fundo: 'rgba(220,38,38,.10)', borda: 'rgba(220,38,38,.35)' },
    medalhas: ['#F5C518', '#B9C2CC', '#CD7F32'],
  },
};

// Tema desconhecido cai no clássico em vez de quebrar a tela: uma campanha
// antiga, ou um tema removido no futuro, continua abrindo.
export const temaDe = (chave) => TEMAS[chave] || TEMAS.classico;
