import React, { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext(null);

// Tons do modo escuro. O roxo é o padrão — é a identidade do app; os
// outros dois existem porque tema escuro é gosto pessoal, e cada pessoa
// passa o dia inteiro olhando para a tela dela.
//
// As cores moram no index.css, em `[data-theme="dark"][data-tom="..."]`.
// Aqui fica só a lista, para a tela de Perfil montar as opções sem
// repetir hexadecimal — hexadecimal repetido é hexadecimal que um dia
// vai ficar diferente de um lado.
export const TONS_ESCUROS = [
  { id: 'roxo',    nome: 'Roxo',    descricao: 'O tom da marca. É o padrão do app.',
    amostra: ['#150C20', '#2A1A3D'] },
  { id: 'grafite', nome: 'Grafite', descricao: 'Cinza sem cor. Deixa o laranja aparecer mais.',
    amostra: ['#0F1015', '#212228'] },
  { id: 'azul',    nome: 'Azul-noite', descricao: 'Azul profundo, com ar de sistema de gestão.',
    amostra: ['#031124', '#122337'] },
];
const TONS_VALIDOS = TONS_ESCUROS.map(t => t.id);

// Lembrar a preferência não pode derrubar o app. Em aba anônima, ou com
// os dados do site bloqueados, o acesso ao armazenamento LANÇA — e sem
// isto a tela inteira morria antes de desenhar.
const ler = (chave, padrao) => {
  try { return localStorage.getItem(chave) || padrao; } catch { return padrao; }
};
const gravar = (chave, valor) => {
  try { localStorage.setItem(chave, valor); } catch { /* aba anônima */ }
};

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const saved = ler('rl-theme', null);
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // Tom guardado que não existe mais (a lista mudou) volta para o padrão,
  // em vez de deixar a pessoa com um `data-tom` que nenhuma regra atende.
  const [tom, setTom] = useState(() => {
    const salvo = ler('rl-tom', 'roxo');
    return TONS_VALIDOS.includes(salvo) ? salvo : 'roxo';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    gravar('rl-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-tom', tom);
    gravar('rl-tom', tom);
  }, [tom]);

  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, toggle, tom, setTom, tons: TONS_ESCUROS }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
