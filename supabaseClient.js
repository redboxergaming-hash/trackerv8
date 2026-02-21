// Avoid hard static bare-module imports in direct browser usage (no bundler).
async function loadCreateClient() {
const candidates = [
  'https://esm.sh/@supabase/supabase-js@2',   // ✅ works on Netlify/static
  '@supabase/supabase-js',
  './node_modules/@supabase/supabase-js/dist/module/index.js',
  '/node_modules/@supabase/supabase-js/dist/module/index.js'
];
  for (const specifier of candidates) {
    try {
      const mod = await import(specifier);
      if (typeof mod?.createClient === 'function') {
        return mod.createClient;
      }
    } catch (_error) {
      // Try next candidate.
    }
  }
  return null;
}

const createClient = await loadCreateClient();

// TODO: replace fallback constants with your project values for production.
const FALLBACK_SUPABASE_URL = '';
const FALLBACK_SUPABASE_ANON_KEY = '';

const config = typeof window !== 'undefined' && window.__APP_CONFIG__
  ? window.__APP_CONFIG__
  : {};

const SUPABASE_URL = config.SUPABASE_URL || FALLBACK_SUPABASE_URL;
const SUPABASE_ANON_KEY = config.SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY;

export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY && createClient
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

export async function getSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data?.session || null;
}

export function onAuthStateChange(handler) {
  if (!supabase) {
    return () => {};
  }

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    handler(session || null);
  });

  return () => {
    data?.subscription?.unsubscribe();
  };
}


export function isSupabaseConfigured() {
  return Boolean(supabase);
}

export async function signInWithGoogle(redirectTo) {
  if (!supabase) {
    return { error: new Error('Supabase is not configured.') };
  }
  const options = redirectTo ? { redirectTo } : undefined;
  return supabase.auth.signInWithOAuth({ provider: 'google', options });
}

export async function signInWithEmailOtp(email) {
  if (!supabase) {
    return { error: new Error('Supabase is not configured.') };
  }
  return supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` } });
}

export async function signOutAuth() {
  if (!supabase) {
    return { error: null };
  }
  return supabase.auth.signOut();
}
