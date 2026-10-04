/** Loads the Google Maps JavaScript API once. Resolves to window.google.maps or rejects on auth failure. */
let loading = null

export function loadGoogleMaps(apiKey) {
  if (!apiKey) return Promise.reject(new Error('No Google Maps API key'))
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps)
  if (loading) return loading
  loading = new Promise((resolve, reject) => {
    const cbName = '__encoreGmapsReady'
    const timer = setTimeout(() => fail(new Error('Google Maps took too long to load')), 15000)
    const fail = (err) => {
      clearTimeout(timer)
      loading = null
      delete window[cbName]
      script.remove()
      reject(err)
    }
    // Google calls this when the key is invalid / not authorised for this origin.
    window.gm_authFailure = () => fail(new Error('Google Maps rejected the API key (check key restrictions and that the Maps JavaScript API is enabled)'))
    window[cbName] = () => {
      clearTimeout(timer)
      delete window[cbName]
      resolve(window.google.maps)
    }
    const script = document.createElement('script')
    const p = new URLSearchParams({ key: apiKey, v: 'weekly', loading: 'async', callback: cbName })
    script.src = `https://maps.googleapis.com/maps/api/js?${p}`
    script.async = true
    script.onerror = () => fail(new Error('Google Maps script failed to load'))
    document.head.appendChild(script)
  })
  return loading
}

export const GOOGLE_DARK_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#15151d' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9b9bb0' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0b0b10' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#3a3a4c' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#262633' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1a1a24' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#33334a' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0d1626' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#131a16' }] },
]

export function directionsUrl(ev) {
  const v = ev?.venue || {}
  if (Number.isFinite(v.lat) && Number.isFinite(v.lng)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lng}${v.name ? `&destination_place_id=&travelmode=transit` : ''}`
  }
  const q = [v.name, v.city, v.country].filter(Boolean).join(', ')
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null
}
