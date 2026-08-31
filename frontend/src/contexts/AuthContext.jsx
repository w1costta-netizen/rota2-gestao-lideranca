import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import api from '../api';
import { registrarSeJaPermitido, removerInscricaoDesteAparelho } from '../lib/notificacoes';

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
});

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = loading
  // undefined = ainda carregando · null = tentou e não veio · objeto = pronto.
  //
  // A diferença entre "ainda não sei" e "não tem" é o que evita o app julgar
  // permissão antes de conhecer o usuário — sem ela, todo módulo aparecia
  // como "Acesso restrito" por um instante e depois liberava sozinho.
  const [profile, setProfile] = useState(undefined);

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
    try {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (data) {
        try {
          const res = await api.get(`/stores/my?requester_id=${userId}`);
          data.modulos_premium = res.data?.modulos_premium || [];
        } catch {
          data.modulos_premium = [];
        }
      }
      carregado = data || null;
    } catch {
      carregado = null;
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
    <AuthCtx.Provider value={{ session, profile, signOut, loadProfile }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
