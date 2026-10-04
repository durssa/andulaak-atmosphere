/**
 * Offline-first sync. localStorage is the cache; when a user is signed in, every change is written through
 * to Supabase and, on sign-in or reload, the two sides are reconciled: the newer copy of each record wins,
 * followed artists are a union, and deletions are remembered as tombstones so they do not come back.
 */

export const SYNCED_SETTINGS = ['units', 'home', 'theme', 'defaultRadiusKm', 'mapProvider']

const ms = (v) => (typeof v === 'number' ? v : v ? Date.parse(v) || 0 : 0)
const iso = (v) => new Date(v || Date.now()).toISOString()
export const artistKey = (name) => name.trim().toLowerCase()

export function trackedToRow(userId, id, t) {
  return { user_id: userId, event_id: id, status: t.status, notes: t.notes || '', rating: t.rating || null, event: t.event, added_at: iso(t.addedAt), updated_at: iso(t.updatedAt || t.addedAt) }
}
export function rowToTracked(r) {
  return { event: r.event, status: r.status, notes: r.notes || '', rating: r.rating || 0, addedAt: ms(r.added_at), updatedAt: ms(r.updated_at) }
}
export function artistToRow(userId, a) {
  return { user_id: userId, name_key: artistKey(a.name), name: a.name, image: a.image || null, spotify_url: a.spotifyUrl || null, added_at: iso(a.addedAt), updated_at: iso(a.updatedAt || a.addedAt) }
}
export function rowToArtist(r) {
  return { name: r.name, image: r.image || null, spotifyUrl: r.spotify_url || null, addedAt: ms(r.added_at), updatedAt: ms(r.updated_at) }
}

/**
 * Three-way merge of tracked concerts.
 * @returns {{ merged, push: string[], remove: string[] }} ids to upsert remotely and ids to delete remotely.
 */
export function mergeTracked(local = {}, remote = {}, tombstones = {}) {
  const merged = {}
  const push = [], remove = []
  const ids = new Set([...Object.keys(local), ...Object.keys(remote)])
  for (const id of ids) {
    const l = local[id], r = remote[id], dead = tombstones[id] || 0
    const lt = l ? ms(l.updatedAt || l.addedAt) : -1
    const rt = r ? ms(r.updatedAt || r.addedAt) : -1
    if (dead && dead >= lt && dead >= rt) { if (r) remove.push(id); continue }
    if (lt >= rt) { merged[id] = l; if (!r || lt > rt) push.push(id) } else merged[id] = r
  }
  return { merged, push, remove }
}

/** Union of followed artists by name. Returns the merged list and the ones missing or stale remotely. */
export function mergeArtists(local = [], remote = [], tombstones = {}) {
  const byKey = new Map()
  const push = [], remove = []
  for (const a of remote) byKey.set(artistKey(a.name), { ...a, _remote: true })
  for (const a of local) {
    const k = artistKey(a.name), r = byKey.get(k)
    if (!r) byKey.set(k, { ...a, _local: true })
    else byKey.set(k, { ...r, ...a, image: a.image || r.image, spotifyUrl: a.spotifyUrl || r.spotifyUrl, addedAt: Math.min(ms(a.addedAt) || Infinity, ms(r.addedAt) || Infinity), _remote: true, _enriched: Boolean((a.image && !r.image) || (a.spotifyUrl && !r.spotifyUrl)) })
  }
  const merged = []
  for (const [k, a] of byKey) {
    const dead = tombstones[k] || 0
    if (dead && dead >= ms(a.addedAt)) { if (a._remote) remove.push(k); continue }
    if (!a._remote || a._enriched) push.push(k)
    const { _remote, _local, _enriched, ...clean } = a
    merged.push(clean)
  }
  merged.sort((x, y) => ms(x.addedAt) - ms(y.addedAt))
  return { merged, push, remove }
}

export function mergeSettings(local = {}, remote = {}) {
  const lt = ms(local.updatedAt), rt = ms(remote.updatedAt)
  const pick = (obj) => Object.fromEntries(SYNCED_SETTINGS.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]))
  if (!rt) return { merged: pick(local), push: Object.keys(pick(local)).length > 0 }
  if (lt > rt) return { merged: pick(local), push: true }
  return { merged: pick(remote), push: false }
}

/** Remote store bound to one user. All methods throw on failure so callers can queue retries. */
export function createStore(client, userId) {
  const check = ({ error }) => { if (error) throw new Error(error.message) }
  return {
    async pull() {
      const [t, a, s] = await Promise.all([
        client.from('tracked_events').select('*').eq('user_id', userId),
        client.from('followed_artists').select('*').eq('user_id', userId),
        client.from('user_settings').select('*').eq('user_id', userId).maybeSingle(),
      ])
      check(t); check(a); check(s)
      return {
        tracked: Object.fromEntries((t.data || []).map((r) => [r.event_id, rowToTracked(r)])),
        artists: (a.data || []).map(rowToArtist),
        settings: s.data ? { ...(s.data.data || {}), updatedAt: ms(s.data.updated_at) } : {},
      }
    },
    async upsertTracked(entries) {
      if (!entries.length) return
      check(await client.from('tracked_events').upsert(entries.map(([id, t]) => trackedToRow(userId, id, t)), { onConflict: 'user_id,event_id' }))
    },
    async deleteTracked(ids) {
      if (!ids.length) return
      check(await client.from('tracked_events').delete().eq('user_id', userId).in('event_id', ids))
    },
    async upsertArtists(list) {
      if (!list.length) return
      check(await client.from('followed_artists').upsert(list.map((a) => artistToRow(userId, a)), { onConflict: 'user_id,name_key' }))
    },
    async deleteArtists(keys) {
      if (!keys.length) return
      check(await client.from('followed_artists').delete().eq('user_id', userId).in('name_key', keys))
    },
    async saveSettings(data, updatedAt) {
      check(await client.from('user_settings').upsert({ user_id: userId, data, updated_at: iso(updatedAt) }, { onConflict: 'user_id' }))
    },
  }
}

/** Pull, merge with local state, push the differences, and return what local state should become. */
export async function reconcile(store, local) {
  const remote = await store.pull()
  const t = mergeTracked(local.tracked, remote.tracked, local.tombstones?.tracked)
  const a = mergeArtists(local.artists, remote.artists, local.tombstones?.artists)
  const s = mergeSettings(local.settings, remote.settings)
  await Promise.all([
    store.upsertTracked(t.push.map((id) => [id, t.merged[id]])),
    store.deleteTracked(t.remove),
    store.upsertArtists(a.merged.filter((x) => a.push.includes(artistKey(x.name)))),
    store.deleteArtists(a.remove),
    s.push ? store.saveSettings(s.merged, local.settings?.updatedAt || Date.now()) : Promise.resolve(),
  ])
  return { tracked: t.merged, artists: a.merged, settings: s.merged, settingsFromRemote: !s.push && Object.keys(s.merged).length > 0 }
}
