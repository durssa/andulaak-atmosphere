import { fetchJson, ApiError } from './http.js'
import { normalizeSeatGeekEvent } from '../normalize.js'

const BASE = 'https://api.seatgeek.com/2'

function requireId(clientId) {
  if (!clientId) throw new ApiError('SeatGeek client id is not configured', { provider: 'SeatGeek', hint: 'Register a free app at seatgeek.com/account/develop and paste the client id in Settings.' })
}

/** Concert search. SeatGeek pages are 1-based. */
export async function searchEvents({ clientId, keyword, lat, lng, radiusKm, startDate, endDate, page = 1, perPage = 50 } = {}) {
  requireId(clientId)
  const p = new URLSearchParams({ client_id: clientId, 'taxonomies.name': 'concert', per_page: String(perPage), page: String(page), sort: 'datetime_utc.asc' })
  if (keyword?.trim()) p.set('q', keyword.trim())
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    p.set('lat', lat.toFixed(5)); p.set('lon', lng.toFixed(5))
    p.set('range', `${Math.max(1, Math.round((radiusKm || 50) * 0.621371))}mi`)
  }
  if (startDate) p.set('datetime_utc.gte', startDate)
  if (endDate) p.set('datetime_utc.lte', `${endDate}T23:59:59`)
  const data = await fetchJson(`${BASE}/events?${p}`, { provider: 'SeatGeek' })
  const raw = Array.isArray(data?.events) ? data.events : []
  const total = data?.meta?.total ?? raw.length
  return {
    events: raw.map(normalizeSeatGeekEvent).filter(Boolean),
    page: { number: page - 1, totalPages: Math.max(1, Math.ceil(total / perPage)), totalElements: total },
  }
}

export async function artistEvents({ clientId, artist, perPage = 50 }) {
  requireId(clientId)
  const p = new URLSearchParams({ client_id: clientId, 'taxonomies.name': 'concert', 'performers.slug': slugify(artist), per_page: String(perPage), sort: 'datetime_utc.asc' })
  const data = await fetchJson(`${BASE}/events?${p}`, { provider: 'SeatGeek' })
  return (data?.events || []).map(normalizeSeatGeekEvent).filter(Boolean)
}

export function slugify(name) {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}
