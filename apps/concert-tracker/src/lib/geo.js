const EARTH_KM = 6371

export function haversineKm(a, b) {
  if (!a || !b) return null
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_KM * Math.asin(Math.sqrt(s))
}

export function formatDistance(km, units = 'km') {
  if (km === null || km === undefined || Number.isNaN(km)) return ''
  const v = units === 'mi' ? km * 0.621371 : km
  const n = v < 10 ? v.toFixed(1) : Math.round(v)
  return `${n} ${units}`
}

export function kmToUnit(km, units) {
  return units === 'mi' ? Math.round(km * 0.621371) : Math.round(km)
}

/** Fit a bounding box around points; returns null when no valid coords. */
export function boundsOf(points) {
  const valid = points.filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng))
  if (!valid.length) return null
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180
  for (const p of valid) {
    minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat)
    minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng)
  }
  return { minLat, maxLat, minLng, maxLng }
}

export function getCurrentPosition(options = {}) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation is not supported by this browser'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => reject(new Error(err.message || 'Could not get your location')),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000, ...options },
    )
  })
}
