/**
 * Every provider is normalised to this shape:
 * {
 *   id, source, name, artists: [], url, image, date: 'YYYY-MM-DD', time: 'HH:mm'|null, timezone,
 *   status: 'onsale'|'offsale'|'cancelled'|'postponed'|'rescheduled'|'unknown',
 *   genre, priceMin, priceMax, currency,
 *   venue: { name, address, city, region, country, lat, lng }
 * }
 */

function num(v) {
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Number.isFinite(n) ? n : null
}

function pickImage(images = []) {
  if (!Array.isArray(images) || !images.length) return null
  const sorted = [...images].filter((i) => i?.url).sort((a, b) => (b.width || 0) - (a.width || 0))
  const wide = sorted.find((i) => i.ratio === '16_9' && (i.width || 0) >= 600)
  return (wide || sorted[0])?.url || null
}

const TM_STATUS = { onsale: 'onsale', offsale: 'offsale', cancelled: 'cancelled', canceled: 'cancelled', postponed: 'postponed', rescheduled: 'rescheduled' }

export function normalizeTicketmasterEvent(e) {
  if (!e?.id) return null
  const venue = e._embedded?.venues?.[0] || {}
  const attractions = e._embedded?.attractions || []
  const cls = (e.classifications || []).find((c) => !c?.family) || e.classifications?.[0] || {}
  const prices = Array.isArray(e.priceRanges) ? e.priceRanges : []
  const mins = prices.map((p) => num(p.min)).filter((n) => n !== null)
  const maxs = prices.map((p) => num(p.max)).filter((n) => n !== null)
  const localTime = e.dates?.start?.localTime || null
  return {
    id: `tm:${e.id}`,
    source: 'ticketmaster',
    name: e.name || 'Untitled event',
    artists: attractions.map((a) => a?.name).filter(Boolean),
    url: e.url || null,
    image: pickImage(e.images),
    date: e.dates?.start?.localDate || null,
    time: localTime ? localTime.slice(0, 5) : null,
    timezone: e.dates?.timezone || null,
    status: TM_STATUS[(e.dates?.status?.code || '').toLowerCase()] || 'unknown',
    genre: cls.genre?.name && cls.genre.name !== 'Undefined' ? cls.genre.name : cls.segment?.name || null,
    priceMin: mins.length ? Math.min(...mins) : null,
    priceMax: maxs.length ? Math.max(...maxs) : null,
    currency: prices[0]?.currency || null,
    venue: {
      name: venue.name || null,
      address: venue.address?.line1 || null,
      city: venue.city?.name || null,
      region: venue.state?.stateCode || venue.state?.name || null,
      country: venue.country?.countryCode || venue.country?.name || null,
      lat: num(venue.location?.latitude),
      lng: num(venue.location?.longitude),
    },
  }
}

export function normalizeBandsintownEvent(e, artistName) {
  if (!e?.id) return null
  const venue = e.venue || {}
  const dt = typeof e.datetime === 'string' ? e.datetime : ''
  const [date, timePart] = dt.split('T')
  const lineup = Array.isArray(e.lineup) && e.lineup.length ? e.lineup : [e.artist?.name || artistName].filter(Boolean)
  const headliner = e.artist?.name || artistName || lineup[0] || 'Concert'
  const ticketOffer = (e.offers || []).find((o) => /ticket/i.test(o?.type || '')) || e.offers?.[0]
  const titled = e.title && e.title.trim() && !/^\s*$/.test(e.title) ? e.title.trim() : null
  const name = titled || (venue.name ? `${headliner} at ${venue.name}` : headliner)
  const status = ticketOffer?.status === 'available' ? 'onsale' : ticketOffer ? 'offsale' : 'unknown'
  return {
    id: `bit:${e.id}`,
    source: 'bandsintown',
    name,
    artists: lineup,
    url: ticketOffer?.url || e.url || null,
    image: e.artist?.image_url || null,
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    time: timePart && /^\d{2}:\d{2}/.test(timePart) && timePart.slice(0, 5) !== '00:00' ? timePart.slice(0, 5) : null,
    timezone: null,
    status,
    genre: null,
    priceMin: null,
    priceMax: null,
    currency: null,
    venue: {
      name: venue.name || null,
      address: venue.street_address || null,
      city: venue.city || null,
      region: venue.region || null,
      country: venue.country || null,
      lat: num(venue.latitude),
      lng: num(venue.longitude),
    },
  }
}

/** Collapse duplicates across providers: same date, same venue (by name prefix or within ~1 km), overlapping artists. */
export function dedupeEvents(events) {
  const norm = (v) => (v || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const sameVenue = (a, b) => {
    const na = norm(a.venue?.name), nb = norm(b.venue?.name)
    if (na && nb && (na === nb || na.startsWith(nb) || nb.startsWith(na))) return true
    if (Number.isFinite(a.venue?.lat) && Number.isFinite(b.venue?.lat)) {
      const dLat = Math.abs(a.venue.lat - b.venue.lat), dLng = Math.abs(a.venue.lng - b.venue.lng)
      return dLat < 0.01 && dLng < 0.015
    }
    return false
  }
  const sameArtists = (a, b) => {
    const set = new Set(a.artists.map((s) => s.toLowerCase()))
    return b.artists.some((s) => set.has(s.toLowerCase())) || (b.artists[0] && a.name.toLowerCase().includes(b.artists[0].toLowerCase())) || (a.artists[0] && b.name.toLowerCase().includes(a.artists[0].toLowerCase()))
  }
  const out = []
  for (const ev of events) {
    if (!ev) continue
    const idx = ev.date ? out.findIndex((p) => p.date === ev.date && p.id !== ev.id && sameVenue(p, ev) && sameArtists(p, ev)) : -1
    if (idx === -1) { out.push(ev); continue }
    const prev = out[idx]
    // Prefer the richer Ticketmaster record, but keep fields the other provider had.
    const rich = prev.source === 'ticketmaster' || ev.source !== 'ticketmaster' ? prev : ev
    const poor = rich === prev ? ev : prev
    const merged = { ...rich, image: rich.image || poor.image, url: rich.url || poor.url, time: rich.time || poor.time, artists: rich.artists.length ? rich.artists : poor.artists }
    if (poor.url && poor.url !== merged.url) merged.altUrl = poor.url
    out[idx] = merged
  }
  return out
}

export function sortByDate(events) {
  return [...events].sort((a, b) => {
    const da = `${a.date || '9999'}T${a.time || '99:99'}`
    const db = `${b.date || '9999'}T${b.time || '99:99'}`
    return da < db ? -1 : da > db ? 1 : 0
  })
}
