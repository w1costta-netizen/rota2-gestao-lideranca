import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://urfnkgvdjtfeoedkrrqh.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Eb21YDxTP3m55u-CuqTS9A_jZasOfU_';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
