/**
 * Spotify Web API via Authorization Code with PKCE. Runs entirely in the browser.
 * Scopes: user-follow-read (followed artists), user-top-read (top artists).
 */
import { ApiError } from './http.js'

const KEY = 'encore.spotify'
const SCOPES = 'user-follow-read user-top-read'

function read() { try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null } }
function write(v) { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY) } catch { /* ignore */ } }

function b64url(bytes) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '') }
async function challenge(verifier) { return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))) }

/** The exact redirect URI to register in the Spotify developer dashboard. */
export function spotifyRedirectUri() {
  const path = window.location.pathname.replace(/index\.html$/, '')
  return `${window.location.origin}${path}`
}

export function spotifySession() {
  const s = read()
  return s?.access ? { connected: true, user: s.user || null } : { connected: false, user: null }
}

export async function beginSpotifyLogin(clientId) {
  if (!clientId) throw new ApiError('Spotify client id is not configured', { provider: 'Spotify' })
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)))
  sessionStorage.setItem('encore.spotify.verifier', verifier)
  sessionStorage.setItem('encore.spotify.return', window.location.hash || '#/artists')
  const p = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: spotifyRedirectUri(), code_challenge_method: 'S256', code_challenge: await challenge(verifier), scope: SCOPES })
  window.location.assign(`https://accounts.spotify.com/authorize?${p}`)
}

async function tokenRequest(params) {
  const r = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) })
  const d = await r.json().catch(() => ({}))
  if (!r.ok || !d.access_token) throw new ApiError(d.error_description || d.error || `Spotify token error ${r.status}`, { provider: 'Spotify', status: r.status })
  return d
}

/** Call once on page load. Returns null when the URL carries no Spotify callback. */
export async function handleSpotifyRedirect(clientId) {
  const q = new URLSearchParams(window.location.search)
  const code = q.get('code'), error = q.get('error')
  if (!code && !error) return null
  const back = sessionStorage.getItem('encore.spotify.return') || '#/artists'
  const clean = () => window.history.replaceState({}, '', `${window.location.pathname}${back}`)
  if (error) { clean(); throw new ApiError(`Spotify sign-in was cancelled (${error})`, { provider: 'Spotify' }) }
  const verifier = sessionStorage.getItem('encore.spotify.verifier')
  // A ?code= without our verifier belongs to another sign-in flow (Supabase auth); leave it alone.
  if (!verifier) return null
  const d = await tokenRequest({ client_id: clientId, grant_type: 'authorization_code', code, redirect_uri: spotifyRedirectUri(), code_verifier: verifier })
  sessionStorage.removeItem('encore.spotify.verifier')
  write({ access: d.access_token, refresh: d.refresh_token, expires: Date.now() + (d.expires_in - 60) * 1000, clientId })
  clean()
  try { const me = await api('/me', clientId); write({ ...read(), user: { id: me.id, name: me.display_name || me.id } }) } catch { /* profile is optional */ }
  return spotifySession()
}

async function accessToken(clientId) {
  const s = read()
  if (!s?.access) throw new ApiError('Not connected to Spotify', { provider: 'Spotify', status: 401 })
  if (Date.now() < s.expires) return s.access
  if (!s.refresh) { write(null); throw new ApiError('Spotify session expired. Connect again.', { provider: 'Spotify', status: 401 }) }
  const d = await tokenRequest({ client_id: clientId || s.clientId, grant_type: 'refresh_token', refresh_token: s.refresh }).catch((e) => { write(null); throw e })
  write({ ...s, access: d.access_token, refresh: d.refresh_token || s.refresh, expires: Date.now() + (d.expires_in - 60) * 1000 })
  return d.access_token
}

async function api(path, clientId) {
  const token = await accessToken(clientId)
  const r = await fetch(`https://api.spotify.com/v1${path}`, { headers: { Authorization: `Bearer ${token}` } })
  if (r.status === 401) { write(null); throw new ApiError('Spotify session expired. Connect again.', { provider: 'Spotify', status: 401 }) }
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new ApiError(d.error?.message || `Spotify error ${r.status}`, { provider: 'Spotify', status: r.status })
  return d
}

function toArtist(a) {
  return { id: a.id, name: a.name, image: a.images?.[0]?.url || null, genres: a.genres || [], url: a.external_urls?.spotify || null, followers: a.followers?.total ?? null }
}

export async function getFollowedArtists(clientId) {
  const out = []
  let after = null
  for (let i = 0; i < 20; i++) {
    const d = await api(`/me/following?type=artist&limit=50${after ? `&after=${after}` : ''}`, clientId)
    const items = d.artists?.items || []
    out.push(...items.map(toArtist))
    after = d.artists?.cursors?.after
    if (!after || !items.length) break
  }
  return out
}

export async function getTopArtists(clientId, range = 'medium_term') {
  const d = await api(`/me/top/artists?limit=50&time_range=${range}`, clientId)
  return (d.items || []).map(toArtist)
}

export async function searchSpotifyArtists(q, clientId) {
  if (!q?.trim()) return []
  const d = await api(`/search?type=artist&limit=8&q=${encodeURIComponent(q.trim())}`, clientId)
  return (d.artists?.items || []).map(toArtist)
}

export function spotifyLogout() { write(null) }

export function spotifySearchUrl(artist) { return `https://open.spotify.com/search/${encodeURIComponent(artist)}` }
