import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { autoRegisterPush } from '../lib/push';
import api from '../api';

const AuthCtx = createContext(null);

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
    autoRegisterPush(userId).catch(() => {});
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
