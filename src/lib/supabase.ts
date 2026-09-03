import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** False when the build has no Supabase credentials; App shows a setup screen. */
export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// createClient throws on an empty URL, which would blank the whole page before
// anything can explain why. Fall back to a placeholder so the app still mounts
// and can say what is missing.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key'
);
