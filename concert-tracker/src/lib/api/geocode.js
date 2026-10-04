import { fetchJson, ApiError } from './http.js'

function withGoogle() {
  return typeof window !== 'undefined' && window.google?.maps?.Geocoder
}

function googleGeocode(request) {
  return new Promise((resolve, reject) => {
    const g = new window.google.maps.Geocoder()
    g.geocode(request, (results, status) => {
      if (status === 'OK' && results?.length) resolve(results)
      else if (status === 'ZERO_RESULTS') resolve([])
      else reject(new ApiError(`Google Geocoding failed (${status})`, { provider: 'Google Maps' }))
    })
  })
}

function shortCity(r) {
  const get = (type) => r.address_components?.find((c) => c.types.includes(type))?.long_name
  const city = get('locality') || get('postal_town') || get('administrative_area_level_2') || get('administrative_area_level_1')
  const country = r.address_components?.find((c) => c.types.includes('country'))?.short_name
  return [city, country].filter(Boolean).join(', ') || r.formatted_address
}

/** Forward geocode a place name → [{ label, lat, lng }]. Uses Google when its JS API is loaded, else Nominatim. */
export async function geocode(query) {
  const q = query?.trim()
  if (!q) return []
  if (withGoogle()) {
    try {
      const results = await googleGeocode({ address: q })
      return results.slice(0, 5).map((r) => ({ label: r.formatted_address, short: shortCity(r), lat: r.geometry.location.lat(), lng: r.geometry.location.lng(), provider: 'google' }))
    } catch {
      /* fall through to Nominatim */
    }
  }
  const p = new URLSearchParams({ q, format: 'jsonv2', limit: '5', addressdetails: '1' })
  const data = await fetchJson(`https://nominatim.openstreetmap.org/search?${p}`, { provider: 'OpenStreetMap' })
  return (Array.isArray(data) ? data : []).map((r) => {
    const a = r.address || {}
    const city = a.city || a.town || a.village || a.municipality || a.county || a.state
    return { label: r.display_name, short: [city, a.country_code?.toUpperCase()].filter(Boolean).join(', ') || r.display_name.split(',')[0], lat: parseFloat(r.lat), lng: parseFloat(r.lon), provider: 'osm' }
  })
}

/** Reverse geocode → short label like "Berlin, DE". */
export async function reverseGeocode({ lat, lng }) {
  if (withGoogle()) {
    try {
      const results = await googleGeocode({ location: { lat, lng } })
      if (results[0]) return shortCity(results[0])
    } catch { /* fall through */ }
  }
  try {
    const p = new URLSearchParams({ lat: String(lat), lon: String(lng), format: 'jsonv2', zoom: '10' })
    const data = await fetchJson(`https://nominatim.openstreetmap.org/reverse?${p}`, { provider: 'OpenStreetMap' })
    const a = data?.address || {}
    const city = a.city || a.town || a.village || a.municipality || a.county || a.state
    return [city, a.country_code?.toUpperCase()].filter(Boolean).join(', ') || `${lat.toFixed(3)}, ${lng.toFixed(3)}`
  } catch {
    return `${lat.toFixed(3)}, ${lng.toFixed(3)}`
  }
}
