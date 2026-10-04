import * as tm from './ticketmaster.js'
import * as bit from './bandsintown.js'
import * as sg from './seatgeek.js'
import { dedupeEvents, sortByDate } from '../normalize.js'
import { haversineKm } from '../geo.js'

export { geocode, reverseGeocode } from './geocode.js'
export { ApiError } from './http.js'

/**
 * Unified discovery search.
 * - Location/keyword search needs Ticketmaster (the only free provider with geo search).
 * - Artist-only search also queries Bandsintown so it works with no key at all.
 * Returns { events, warnings: [string], providers: [string], totalPages, page }.
 */
export async function discover({ settings, keyword, location, radiusKm, startDate, endDate, page = 0 }) {
  const warnings = []
  const providers = []
  let events = []
  let totalPages = 1
  const hasGeo = Number.isFinite(location?.lat) && Number.isFinite(location?.lng)
  const geo = hasGeo ? { lat: location.lat, lng: location.lng, radiusKm } : {}
  const tasks = []
  const geoCapable = Boolean(settings.tmKey || settings.sgClientId)

  if (settings.tmKey) {
    tasks.push(
      tm.searchEvents({ apiKey: settings.tmKey, keyword, ...geo, startDate, endDate, page })
        .then((r) => { providers.push('Ticketmaster'); totalPages = Math.max(totalPages, r.page.totalPages); events.push(...r.events) })
        .catch((e) => warnings.push(`Ticketmaster: ${e.message}`)),
    )
  }
  if (settings.sgClientId) {
    tasks.push(
      sg.searchEvents({ clientId: settings.sgClientId, keyword, ...geo, startDate, endDate, page: page + 1 })
        .then((r) => { providers.push('SeatGeek'); totalPages = Math.max(totalPages, r.page.totalPages); events.push(...r.events) })
        .catch((e) => warnings.push(`SeatGeek: ${e.message}`)),
    )
  }
  if (hasGeo && !geoCapable) {
    warnings.push('Searching by location needs a Ticketmaster or SeatGeek key. Add one in Settings. Showing artist matches from Bandsintown only.')
  }
  if (keyword?.trim() && page === 0 && !(hasGeo && geoCapable)) {
    tasks.push(
      bit.artistEvents({ appId: settings.bitAppId, artist: keyword })
        .then((evs) => { providers.push('Bandsintown'); events.push(...evs) })
        .catch((e) => { if (e.status !== 404) warnings.push(`Bandsintown: ${e.message}`) }),
    )
  }
  if (!tasks.length) {
    warnings.push(geoCapable ? 'Enter an artist, a place, or both.' : 'Enter an artist name to search Bandsintown, or add a Ticketmaster or SeatGeek key in Settings to search by location.')
  }
  await Promise.all(tasks)

  if (startDate || endDate) {
    events = events.filter((ev) => !ev.date || ((!startDate || ev.date >= startDate) && (!endDate || ev.date <= endDate)))
  }
  if (hasGeo && radiusKm) {
    // Ticketmaster and SeatGeek apply the radius server-side; Bandsintown has no geo search, so filter its results here.
    events = events.filter((ev) => { if (ev.source !== 'bandsintown') return true; const d = haversineKm(location, ev.venue); return d === null || d <= radiusKm })
  }
  return { events: sortByDate(dedupeEvents(events)), warnings, providers, totalPages, page }
}

/** Upcoming events for one followed artist, merged across providers. */
export async function upcomingForArtist({ settings, artist }) {
  const warnings = []
  const results = []
  const tasks = [
    bit.artistEvents({ appId: settings.bitAppId, artist }).then((e) => results.push(...e)).catch((e) => { if (e.status !== 404) warnings.push(`Bandsintown: ${e.message}`) }),
  ]
  if (settings.tmKey) {
    tasks.push(tm.artistEvents({ apiKey: settings.tmKey, artist }).then((e) => results.push(...e)).catch((e) => warnings.push(`Ticketmaster: ${e.message}`)))
  }
  if (settings.sgClientId) {
    tasks.push(sg.artistEvents({ clientId: settings.sgClientId, artist }).then((e) => results.push(...e)).catch((e) => warnings.push(`SeatGeek: ${e.message}`)))
  }
  await Promise.all(tasks)
  return { events: sortByDate(dedupeEvents(results)), warnings }
}

/** Resolve an artist name to a profile (image, upcoming count) using whichever provider answers. */
export async function lookupArtist({ settings, name }) {
  try {
    const info = await bit.artistInfo({ appId: settings.bitAppId, artist: name })
    return { name: info.name, image: info.image, upcoming: info.upcoming, source: 'bandsintown' }
  } catch (e) {
    if (settings.tmKey) {
      try {
        const [first] = await tm.searchAttractions({ apiKey: settings.tmKey, keyword: name, size: 1 })
        if (first) return { name: first.name, image: first.image, upcoming: first.upcoming, source: 'ticketmaster' }
      } catch { /* ignore */ }
    }
    if (e.status === 404) return { name: name.trim(), image: null, upcoming: null, source: null }
    throw e
  }
}

export async function suggestArtists({ settings, keyword }) {
  if (!settings.tmKey || !keyword?.trim()) return []
  try { return await tm.searchAttractions({ apiKey: settings.tmKey, keyword, size: 6 }) } catch { return [] }
}
