import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import api from '../api';
import { registrarSeJaPermitido } from '../lib/notificacoes';

// O padrão precisa ser um objeto, não null: quando sai uma versão nova e o
// navegador fica com pedaços do código antigo e novo misturados, o contexto
// pode chegar vazio num componente. Com null, o "const { session } = useAuth()"
// estourava e derrubava a tela inteira ("Cannot destructure property 'session'").
// Com este padrão, o app apenas entende que ainda está carregando — e o
// recarregamento automático de versão resolve em seguida.
const AuthCtx = createContext({
  session: undefined, // undefined = carregando
  profile: null,
  signOut: async () => {},
  loadProfile: async () => {},
});

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = loading
  const [profile, setProfile] = useState(null);

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
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) {
      try {
        const res = await api.get(`/stores/my?requester_id=${userId}`);
        data.modulos_premium = res.data?.modulos_premium || [];
      } catch {
        data.modulos_premium = [];
      }
    }
    setProfile(data);

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
    await supabase.auth.signOut();
  }

  return (
    <AuthCtx.Provider value={{ session, profile, signOut, loadProfile }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
