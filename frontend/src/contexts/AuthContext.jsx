import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import api from '../api';
import { registrarSeJaPermitido, removerInscricaoDesteAparelho } from '../lib/notificacoes';
import { reportError } from '../lib/reportError';

// O padrão precisa ser um objeto, não null: quando sai uma versão nova e o
// navegador fica com pedaços do código antigo e novo misturados, o contexto
// pode chegar vazio num componente. Com null, o "const { session } = useAuth()"
// estourava e derrubava a tela inteira ("Cannot destructure property 'session'").
// Com este padrão, o app apenas entende que ainda está carregando — e o
// recarregamento automático de versão resolve em seguida.
const AuthCtx = createContext({
  session: undefined, // undefined = carregando
  profile: undefined, // idem — nunca `null` aqui, que significaria "não tem"
  signOut: async () => {},
  loadProfile: async () => {},
  contaDesativada: false,
  motivoPerfil: null,
});

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = loading
  // undefined = ainda carregando · null = tentou e não veio · objeto = pronto.
  //
  // A diferença entre "ainda não sei" e "não tem" é o que evita o app julgar
  // permissão antes de conhecer o usuário — sem ela, todo módulo aparecia
  // como "Acesso restrito" por um instante e depois liberava sozinho.
  const [profile, setProfile] = useState(undefined);
  const [contaDesativada, setContaDesativada] = useState(false);
  // Por que o perfil não veio. A tela de erro mostrava sempre o mesmo texto
  // para causas diferentes — falta de rede, perfil inexistente, permissão do
  // banco — e sem essa distinção não há como investigar sem adivinhar.
  const [motivoPerfil, setMotivoPerfil] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) loadProfile(data.session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) loadProfile(session.user.id);
      else setProfile(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadProfile(userId) {
    let carregado = null;
    let motivo = null;
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();

      if (error) {
        // PGRST116 = a consulta não achou nenhuma linha. Distingue "cadastro
        // não existe" de "o banco recusou a leitura", que pedem soluções
        // completamente diferentes.
        motivo = error.code === 'PGRST116'
          ? 'cadastro não encontrado'
          : `${error.code || 'erro'}: ${error.message || 'sem detalhe'}`;
      } else if (!data) {
        motivo = 'cadastro não encontrado';
      }

      // Cadastro desativado não entra.
      //
      // Desativar tirava a pessoa das listas — contatos, participantes,
      // equipe — mas não barrava o acesso: quem foi desligado continuava
      // entrando e lendo comunicados, tarefas, escala e conversas da loja.
      // O gestor desativa acreditando que cortou o acesso, e é essa crença
      // que tornava a falha perigosa.
      if (data && data.active === false) {
        setContaDesativada(true);
        setProfile(null);
        try { await supabase.auth.signOut(); } catch { /* sair local basta */ }
        return null;
      }

      if (data) {
        try {
          const res = await api.get(`/stores/my?requester_id=${userId}`);
          data.modulos_premium = res.data?.modulos_premium || [];
        } catch {
          data.modulos_premium = [];
        }
      }
      carregado = data || null;
    } catch (e) {
      carregado = null;
      motivo = motivo || `falha de rede: ${e?.message || 'sem detalhe'}`;
    }

    setMotivoPerfil(carregado ? null : motivo);
    // Vai para o log de auditoria: sem isto, o problema só existe na tela de
    // quem esbarrou nele, e some quando a pessoa fecha o app.
    if (!carregado) {
      reportError({ userId, acao: 'carregar_perfil', tabela: 'profiles', erro: new Error(motivo || 'sem motivo') });
    }
    // Sempre termina com um valor definido, mesmo em falha: deixar como
    // `undefined` prenderia o app na tela de carregamento para sempre.
    setProfile(carregado);

    // Mantém o cadastro do aparelho em dia. O navegador troca a inscrição
    // sozinho de vez em quando (reinstalação, restauração de backup), e sem
    // isto a pessoa pararia de receber sem nenhum aviso. Não usa await: é
    // manutenção de fundo e não pode segurar a entrada no app.
    registrarSeJaPermitido(userId).catch(() => {});
  }

  async function signOut() {
    // Limpa a última tela salva: em aparelho compartilhado (comum na loja),
    // sem isso a próxima pessoa a entrar cairia na tela de quem saiu.
    try {
      localStorage.removeItem('current_page');
      localStorage.removeItem('master_viewing_store');
    } catch { /* aba anônima */ }

    // Desfaz a inscrição de notificação deste aparelho. Sem isto, quem sai
    // continua recebendo push nesta máquina — e com o chat isso significa a
    // prévia de mensagem privada aparecendo para quem usar o aparelho
    // depois, o que em loja é o computador compartilhado.
    // Cinturão e suspensório: mesmo com os limites internos, a saída não
    // fica refém desta limpeza. Sair da conta é o pedido da pessoa; a
    // notificação é arrumação nossa.
    await Promise.race([
      removerInscricaoDesteAparelho(),
      new Promise(resolve => setTimeout(resolve, 5000)),
    ]);

    // O signOut do Supabase fala com o servidor para invalidar a sessão, e
    // por isso PODE REJEITAR: rede instável, servidor fora, sessão já
    // expirada do outro lado. O botão chama esta função direto, então a
    // exceção subia sem tratamento e a tela não reagia — a pessoa clicava em
    // Sair e continuava logada, sem nenhuma explicação. Foi o que aconteceu
    // no PC, onde o travamento do service worker não se aplica.
    try {
      await supabase.auth.signOut();
    } catch { /* o que importa é sair daqui; o servidor se acerta depois */ }

    // Some com o que ficou na memória da página. Sem isto, sair e entrar com
    // outra pessoa no mesmo aparelho podia reaproveitar estado da anterior.
    setSession(null);
    setProfile(null);

    // Garantia final, sem depender de rede: apaga o cartão de acesso que o
    // Supabase guarda no navegador e reinicia o app na tela de entrada.
    // Qualquer falha acima deixaria a pessoa presa dentro da conta; daqui
    // não tem como não sair.
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'))
        .forEach(k => localStorage.removeItem(k));
    } catch { /* aba anônima */ }

    window.location.replace('/');
  }

  return (
    <AuthCtx.Provider value={{ session, profile, signOut, loadProfile, contaDesativada, motivoPerfil }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
