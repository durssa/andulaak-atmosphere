import { fetchJson, ApiError } from './http.js'
import { normalizeBandsintownEvent } from '../normalize.js'

const BASE = 'https://rest.bandsintown.com'

function enc(name) {
  // Bandsintown requires slashes double-encoded and question marks encoded.
  return encodeURIComponent(name.trim()).replace(/%2F/g, '%252F').replace(/\?/g, '%253F').replace(/\*/g, '%252A').replace(/"/g, '%27C')
}

export async function artistInfo({ appId, artist }) {
  const data = await fetchJson(`${BASE}/artists/${enc(artist)}?app_id=${encodeURIComponent(appId)}`, { provider: 'Bandsintown' })
  if (!data || data.error || !data.name) throw new ApiError(`Bandsintown has no artist named "${artist}"`, { provider: 'Bandsintown', status: 404 })
  return {
    name: data.name,
    image: data.image_url || data.thumb_url || null,
    thumb: data.thumb_url || null,
    url: data.url || null,
    upcoming: Number.isFinite(data.upcoming_event_count) ? data.upcoming_event_count : null,
    trackers: Number.isFinite(data.tracker_count) ? data.tracker_count : null,
  }
}

export async function artistEvents({ appId, artist, range = 'upcoming' }) {
  const data = await fetchJson(`${BASE}/artists/${enc(artist)}/events?app_id=${encodeURIComponent(appId)}&date=${range}`, { provider: 'Bandsintown' })
  if (!Array.isArray(data)) {
    const msg = data?.errorMessage || data?.error
    if (msg) throw new ApiError(msg, { provider: 'Bandsintown', status: /not.?found/i.test(msg) ? 404 : undefined })
    return []
  }
  return data.map((e) => normalizeBandsintownEvent(e, artist)).filter(Boolean)
}
