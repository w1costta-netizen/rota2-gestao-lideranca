import { createClient } from '@supabase/supabase-js';

// O banco é acessado PELO NOSSO DOMÍNIO (rotalider.com.br/sb), e não direto
// em supabase.co — a hospedagem repassa (netlify.toml; no dev, vite.config).
//
// Rede de empresa costuma bloquear endereços que não conhece: no PC da loja
// (out/2026) o supabase.co não respondia ("Failed to fetch") enquanto o
// /api, que já passava pelo nosso domínio, funcionava. O app ficava preso em
// "Carregando...". Pelo nosso domínio, se o app abre, o banco também abre.
const PROJETO = 'urfnkgvdjtfeoedkrrqh';
const SUPABASE_URL = typeof window !== 'undefined' && window.location?.origin
  ? `${window.location.origin}/sb`
  : `https://${PROJETO}.supabase.co`;
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Eb21YDxTP3m55u-CuqTS9A_jZasOfU_';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  // O nome de onde o login fica guardado no navegador sai do endereço. Com o
  // endereço novo ele mudaria — e todo mundo seria deslogado. Fica o antigo.
  auth: { storageKey: `sb-${PROJETO}-auth-token` },
});
