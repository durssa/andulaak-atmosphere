import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { useApp } from '../context.jsx'
import { loadGoogleMaps, GOOGLE_DARK_STYLE } from '../lib/api/googleMaps.js'
import { boundsOf } from '../lib/geo.js'
import { formatEventDate } from '../lib/dates.js'
import { Tag } from './ui.jsx'
import { useIsDark } from '../lib/useIsDark.js'

const DEFAULT_CENTER = { lat: 20, lng: 0 }
const PIN = '<svg class="pin %CLS%" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C7.6 2 4 5.6 4 10c0 6 8 12 8 12s8-6 8-12c0-4.4-3.6-8-8-8z"/><circle cx="12" cy="10" r="3.2" fill="#fff"/></svg>'

function escapeHtml(s = '') { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) }
function popupHtml(ev) {
  const venue = [ev.venue?.name, ev.venue?.city].filter(Boolean).join(' · ')
  return `<b>${escapeHtml(ev.name)}</b><div>${escapeHtml(formatEventDate(ev))}</div><div style="opacity:.75">${escapeHtml(venue)}</div>`
}
function withCoords(events) { return events.filter((e) => Number.isFinite(e.venue?.lat) && Number.isFinite(e.venue?.lng)) }

/* Leaflet with CARTO basemaps (OpenStreetMap data). No key required. */
function LeafletMap({ events, selectedId, onSelect, userLocation, center, autoFit, trackedIds, dark }) {
  const rootRef = useRef(null), mapRef = useRef(null), tileRef = useRef(null), layerRef = useRef(null), userRef = useRef(null)
  const markersRef = useRef(new Map())

  useEffect(() => {
    if (mapRef.current) return
    const map = L.map(rootRef.current, { zoomControl: true, worldCopyJump: true })
    map.setView([center?.lat ?? DEFAULT_CENTER.lat, center?.lng ?? DEFAULT_CENTER.lng], center ? 10 : 2)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(rootRef.current)
    return () => { ro.disconnect(); map.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    tileRef.current?.remove()
    tileRef.current = L.tileLayer(`https://{s}.basemaps.cartocdn.com/${dark ? 'dark_all' : 'rastertiles/voyager'}/{z}/{x}/{y}{r}.png`, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>', subdomains: 'abcd', maxZoom: 19,
    }).addTo(map)
  }, [dark])

  useEffect(() => {
    const map = mapRef.current, layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers(); markersRef.current.clear()
    const pts = withCoords(events)
    for (const ev of pts) {
      const icon = L.divIcon({ className: '', html: PIN.replace('%CLS%', trackedIds.has(ev.id) ? 'tracked' : ''), iconSize: [28, 28], iconAnchor: [14, 27], popupAnchor: [0, -24] })
      const m = L.marker([ev.venue.lat, ev.venue.lng], { icon, title: ev.name, alt: ev.name, keyboard: true })
      m.bindPopup(popupHtml(ev))
      m.on('click', () => onSelect?.(ev.id))
      m.addTo(layer)
      markersRef.current.set(ev.id, m)
    }
    if (autoFit && pts.length) {
      const b = boundsOf(pts.map((e) => e.venue))
      if (pts.length === 1) map.setView([b.minLat, b.minLng], 11)
      else map.fitBounds([[b.minLat, b.minLng], [b.maxLat, b.maxLng]], { padding: [40, 40], maxZoom: 12 })
    }
  }, [events, autoFit, trackedIds, onSelect])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    for (const [id, m] of markersRef.current) m.getElement()?.querySelector('.pin')?.classList.toggle('selected', id === selectedId)
    const sel = selectedId && markersRef.current.get(selectedId)
    if (sel) {
      const ll = sel.getLatLng()
      if (!map.getBounds().pad(-0.2).contains(ll)) map.panTo(ll)
      sel.openPopup()
    }
  }, [selectedId, events])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    userRef.current?.remove(); userRef.current = null
    if (userLocation && Number.isFinite(userLocation.lat)) {
      const icon = L.divIcon({ className: '', html: '<div class="pin-user"></div>', iconSize: [14, 14], iconAnchor: [7, 7] })
      userRef.current = L.marker([userLocation.lat, userLocation.lng], { icon, title: 'Your location', interactive: false, zIndexOffset: -100 }).addTo(map)
    }
  }, [userLocation])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !center) return
    if (!withCoords(events).length) map.setView([center.lat, center.lng], 10)
  }, [center]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={rootRef} className="map-root" data-testid="leaflet-map" role="region" aria-label="Map of concerts" />
}

/* Google Maps, used when a key is configured. */
function GoogleMap({ apiKey, events, selectedId, onSelect, userLocation, center, autoFit, trackedIds, dark, onFail }) {
  const rootRef = useRef(null), mapRef = useRef(null), userRef = useRef(null), infoRef = useRef(null)
  const markersRef = useRef(new Map())
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadGoogleMaps(apiKey).then((gmaps) => {
      if (cancelled || !rootRef.current) return
      const map = new gmaps.Map(rootRef.current, { center: center || DEFAULT_CENTER, zoom: center ? 10 : 2, styles: dark ? GOOGLE_DARK_STYLE : [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }], mapTypeControl: false, streetViewControl: false, fullscreenControl: true })
      mapRef.current = map; infoRef.current = new gmaps.InfoWindow(); setReady(true)
    }).catch((e) => { if (!cancelled) onFail?.(e) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey])

  useEffect(() => { if (ready && mapRef.current) mapRef.current.setOptions({ styles: dark ? GOOGLE_DARK_STYLE : [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }] }) }, [ready, dark])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const gmaps = window.google.maps
    for (const m of markersRef.current.values()) m.setMap(null)
    markersRef.current.clear()
    const pts = withCoords(events)
    const icon = (color, scale = 1) => ({ path: 'M12 2C7.6 2 4 5.6 4 10c0 6 8 12 8 12s8-6 8-12c0-4.4-3.6-8-8-8zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6z', fillColor: color, fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 1.5, scale: 1.3 * scale, anchor: new gmaps.Point(12, 22) })
    for (const ev of pts) {
      const base = trackedIds.has(ev.id) ? '#15803d' : '#1f5fbf'
      const m = new gmaps.Marker({ position: { lat: ev.venue.lat, lng: ev.venue.lng }, map, title: ev.name, icon: icon(base) })
      m.__base = base
      m.addListener('click', () => onSelect?.(ev.id))
      markersRef.current.set(ev.id, m)
    }
    if (autoFit && pts.length) {
      if (pts.length === 1) { map.setCenter({ lat: pts[0].venue.lat, lng: pts[0].venue.lng }); map.setZoom(11) }
      else { const b = new gmaps.LatLngBounds(); pts.forEach((e) => b.extend({ lat: e.venue.lat, lng: e.venue.lng })); map.fitBounds(b, 40) }
    }
  }, [ready, events, autoFit, trackedIds, onSelect])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    for (const [id, m] of markersRef.current) {
      const sel = id === selectedId
      const ic = m.getIcon(); if (ic) m.setIcon({ ...ic, fillColor: sel ? '#111111' : m.__base, scale: sel ? 1.7 : 1.3 })
      m.setZIndex(sel ? 999 : 1)
    }
    const sel = selectedId && markersRef.current.get(selectedId)
    const ev = selectedId && events.find((e) => e.id === selectedId)
    if (sel && ev) {
      infoRef.current.setContent(`<div class="gm-popup">${popupHtml(ev)}</div>`)
      infoRef.current.open({ map, anchor: sel })
      if (!map.getBounds()?.contains(sel.getPosition())) map.panTo(sel.getPosition())
    } else infoRef.current?.close()
  }, [ready, selectedId, events])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const gmaps = window.google.maps
    userRef.current?.setMap(null); userRef.current = null
    if (userLocation && Number.isFinite(userLocation.lat)) {
      userRef.current = new gmaps.Marker({ position: userLocation, map, title: 'Your location', clickable: false, icon: { path: gmaps.SymbolPath.CIRCLE, scale: 7, fillColor: '#1f5fbf', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 } })
    }
  }, [ready, userLocation])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !center) return
    if (!withCoords(events).length) { map.setCenter(center); map.setZoom(10) }
  }, [ready, center]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={rootRef} className="map-root" data-testid="google-map" role="region" aria-label="Map of concerts" />
}

export default function MapView({ events = [], selectedId, onSelect, userLocation, center, autoFit = true, overlay }) {
  const { settings, tracked, notify } = useApp()
  const [failedKey, setFailedKey] = useState(null)
  const dark = useIsDark(settings.theme)
  const trackedKey = Object.keys(tracked).sort().join('|')
  const trackedIds = useMemo(() => new Set(trackedKey ? trackedKey.split('|') : []), [trackedKey])
  const wantGoogle = Boolean(settings.gmKey) && settings.mapProvider !== 'leaflet' && failedKey !== settings.gmKey

  return (
    <div className="map-wrap">
      {wantGoogle ? (
        <GoogleMap key={settings.gmKey} apiKey={settings.gmKey} events={events} selectedId={selectedId} onSelect={onSelect} userLocation={userLocation} center={center} autoFit={autoFit} trackedIds={trackedIds} dark={dark}
          onFail={(e) => { setFailedKey(settings.gmKey); notify(`${e.message}. Using OpenStreetMap instead.`, 'error') }} />
      ) : (
        <LeafletMap events={events} selectedId={selectedId} onSelect={onSelect} userLocation={userLocation} center={center} autoFit={autoFit} trackedIds={trackedIds} dark={dark} />
      )}
      <div className="map-overlay">
        {overlay}
        <Tag>{wantGoogle ? 'Google Maps' : 'OpenStreetMap'}</Tag>
      </div>
    </div>
  )
}
