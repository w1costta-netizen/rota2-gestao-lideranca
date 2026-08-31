// Uma regra só, de propósito: nome usado sem existir (no-undef).
//
// Existe por causa de um erro real: o signOut chamava uma função cujo import
// se perdeu numa edição. O build passou verde três vezes — JavaScript trata
// identificador solto como global e só quebra na mão do usuário, que ficou
// dias sem conseguir sair da conta. Esta checagem roda antes do build e
// derruba a publicação no mesmo segundo em que esse tipo de erro aparecer.
//
// Não é um lint de estilo. Não adicionar regras de formatação aqui — quanto
// mais barulho, maior a chance de alguém ignorar o aviso que importa.
import globals from 'globals';

export default [
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    rules: {
      'no-undef': 'error',
    },
  },
];
