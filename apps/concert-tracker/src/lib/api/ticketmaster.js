import { fetchJson, ApiError } from './http.js'
import { normalizeTicketmasterEvent } from '../normalize.js'

const BASE = 'https://app.ticketmaster.com/discovery/v2'

function requireKey(key) {
  if (!key) {
    throw new ApiError('Ticketmaster API key is not configured', {
      provider: 'Ticketmaster',
      hint: 'Get a free key at developer.ticketmaster.com and paste it in Settings.',
    })
  }
}

function toTmDateTime(iso, endOfDay = false) {
  if (!iso) return null
  return `${iso}T${endOfDay ? '23:59:59' : '00:00:00'}Z`
}

/**
 * Search music events. Supports keyword and/or geo radius.
 * @returns {{ events, page: { number, totalPages, totalElements } }}
 */
export async function searchEvents({ apiKey, keyword, lat, lng, radiusKm, startDate, endDate, page = 0, size = 50, countryCode } = {}) {
  requireKey(apiKey)
  const p = new URLSearchParams({ apikey: apiKey, classificationName: 'music', size: String(size), page: String(page), sort: 'date,asc' })
  if (keyword?.trim()) p.set('keyword', keyword.trim())
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    p.set('latlong', `${lat.toFixed(5)},${lng.toFixed(5)}`)
    p.set('radius', String(Math.max(1, Math.min(500, Math.round(radiusKm || 50)))))
    p.set('unit', 'km')
  }
  if (countryCode) p.set('countryCode', countryCode)
  if (startDate) p.set('startDateTime', toTmDateTime(startDate))
  if (endDate) p.set('endDateTime', toTmDateTime(endDate, true))
  const data = await fetchJson(`${BASE}/events.json?${p}`, { provider: 'Ticketmaster' })
  const raw = data?._embedded?.events || []
  return {
    events: raw.map(normalizeTicketmasterEvent).filter(Boolean),
    page: { number: data?.page?.number ?? page, totalPages: data?.page?.totalPages ?? 1, totalElements: data?.page?.totalElements ?? raw.length },
  }
}

/** Upcoming events for a named artist (keyword search restricted to music). */
export async function artistEvents({ apiKey, artist, size = 50 }) {
  requireKey(apiKey)
  const p = new URLSearchParams({ apikey: apiKey, classificationName: 'music', keyword: artist, size: String(size), sort: 'date,asc' })
  const data = await fetchJson(`${BASE}/events.json?${p}`, { provider: 'Ticketmaster' })
  const raw = data?._embedded?.events || []
  const needle = artist.toLowerCase()
  return raw
    .map(normalizeTicketmasterEvent)
    .filter((ev) => ev && (ev.artists.some((a) => a.toLowerCase() === needle) || ev.name.toLowerCase().includes(needle)))
}

/** Artist (attraction) lookup for autocomplete. */
export async function searchAttractions({ apiKey, keyword, size = 8 }) {
  requireKey(apiKey)
  const p = new URLSearchParams({ apikey: apiKey, classificationName: 'music', keyword, size: String(size) })
  const data = await fetchJson(`${BASE}/attractions.json?${p}`, { provider: 'Ticketmaster' })
  return (data?._embedded?.attractions || []).map((a) => ({
    id: `tm:${a.id}`,
    name: a.name,
    image: a.images?.find((i) => i.ratio === '16_9')?.url || a.images?.[0]?.url || null,
    genre: a.classifications?.[0]?.genre?.name || null,
    upcoming: a.upcomingEvents?._total ?? null,
  }))
}
