/**
 * Supabase client for accounts and sync. Loaded lazily so the bundle stays small when it is not configured.
 * The anon key is safe to ship in the browser: row-level security (see supabase/schema.sql) limits every
 * request to the signed-in user's own rows.
 */
let clientPromise = null
let clientKey = ''

export function supabaseConfigured(settings) {
  return Boolean(settings?.supabaseUrl && settings?.supabaseAnonKey)
}

export function authRedirectUri() {
  return `${window.location.origin}${window.location.pathname.replace(/index\.html$/, '')}`
}

export async function getSupabase(settings) {
  if (!supabaseConfigured(settings)) return null
  const key = `${settings.supabaseUrl}|${settings.supabaseAnonKey}`
  if (clientPromise && clientKey === key) return clientPromise
  clientKey = key
  clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(settings.supabaseUrl, settings.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    }),
  )
  return clientPromise
}

export function describeUser(user) {
  if (!user) return null
  const meta = user.user_metadata || {}
  return { id: user.id, email: user.email || null, name: meta.full_name || meta.name || meta.user_name || user.email || 'Signed in', avatar: meta.avatar_url || meta.picture || null, provider: user.app_metadata?.provider || null }
}

export async function signInWithEmail(client, email) {
  sessionStorage.setItem('encore.auth.return', window.location.hash || '#/settings')
  const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: authRedirectUri() } })
  if (error) throw new Error(error.message)
}

export async function signInWithProvider(client, provider) {
  sessionStorage.setItem('encore.auth.return', window.location.hash || '#/settings')
  const { error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo: authRedirectUri() } })
  if (error) throw new Error(error.message)
}

export async function signOut(client) {
  const { error } = await client.auth.signOut()
  if (error) throw new Error(error.message)
}

/** Restores the hash route saved before an auth redirect and strips auth params from the URL. */
export function finishAuthRedirect() {
  const back = sessionStorage.getItem('encore.auth.return')
  if (!back) return
  sessionStorage.removeItem('encore.auth.return')
  window.history.replaceState({}, '', `${window.location.pathname}${back}`)
}
