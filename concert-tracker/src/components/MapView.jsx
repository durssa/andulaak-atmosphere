import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { useApp } from '../context.jsx'
import { loadGoogleMaps, GOOGLE_DARK_STYLE } from '../lib/api/googleMaps.js'
import { boundsOf } from '../lib/geo.js'
import { formatEventDate } from '../lib/dates.js'

const DEFAULT_CENTER = { lat: 20, lng: 0 }

function markerHtml(cls) { return `<div class="enc-marker ${cls}"></div>` }
function escapeHtml(s = '') { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) }
function popupHtml(ev) {
  const venue = [ev.venue?.name, ev.venue?.city].filter(Boolean).join(' · ')
  return `<b>${escapeHtml(ev.name)}</b><div>${escapeHtml(formatEventDate(ev))}</div><div style="opacity:.75">${escapeHtml(venue)}</div>`
}
function withCoords(events) { return events.filter((e) => Number.isFinite(e.venue?.lat) && Number.isFinite(e.venue?.lng)) }

/* ─── Leaflet (OpenStreetMap / CARTO tiles, no key required) ─── */
function LeafletMap({ events, selectedId, onSelect, userLocation, center, autoFit, trackedIds }) {
  const rootRef = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)
  const markersRef = useRef(new Map())
  const userRef = useRef(null)

  useEffect(() => {
    if (mapRef.current) return
    const map = L.map(rootRef.current, { zoomControl: true, attributionControl: true, worldCopyJump: true })
    map.setView([center?.lat ?? DEFAULT_CENTER.lat, center?.lng ?? DEFAULT_CENTER.lng], center ? 10 : 2)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd', maxZoom: 19,
    }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(rootRef.current)
    return () => { ro.disconnect(); map.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Markers
  useEffect(() => {
    const map = mapRef.current, layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()
    markersRef.current.clear()
    const pts = withCoords(events)
    for (const ev of pts) {
      const cls = trackedIds?.has(ev.id) ? 'tracked' : ''
      const icon = L.divIcon({ className: '', html: markerHtml(cls), iconSize: [26, 26], iconAnchor: [13, 24], popupAnchor: [0, -22] })
      const m = L.marker([ev.venue.lat, ev.venue.lng], { icon, title: ev.name })
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

  // Selection highlight
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    for (const [id, m] of markersRef.current) {
      const el = m.getElement()?.firstElementChild
      if (!el) continue
      el.classList.toggle('selected', id === selectedId)
    }
    const sel = selectedId && markersRef.current.get(selectedId)
    if (sel) {
      const ll = sel.getLatLng()
      if (!map.getBounds().pad(-0.2).contains(ll)) map.panTo(ll, { animate: true })
      sel.openPopup()
    }
  }, [selectedId, events])

  // User location
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (userRef.current) { userRef.current.remove(); userRef.current = null }
    if (userLocation && Number.isFinite(userLocation.lat)) {
      const icon = L.divIcon({ className: '', html: markerHtml('user'), iconSize: [16, 16], iconAnchor: [8, 8] })
      userRef.current = L.marker([userLocation.lat, userLocation.lng], { icon, title: 'You', interactive: false, zIndexOffset: -100 }).addTo(map)
    }
  }, [userLocation])

  // Centre changes (e.g. after geocoding) when there are no events to fit
  useEffect(() => {
    const map = mapRef.current
    if (!map || !center) return
    if (!withCoords(events).length) map.setView([center.lat, center.lng], 10)
  }, [center]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={rootRef} className="map-root" data-testid="leaflet-map" />
}

/* ─── Google Maps (used when a key is configured) ─── */
function GoogleMap({ apiKey, events, selectedId, onSelect, userLocation, center, autoFit, trackedIds, onFail }) {
  const rootRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef(new Map())
  const userRef = useRef(null)
  const infoRef = useRef(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadGoogleMaps(apiKey).then((gmaps) => {
      if (cancelled || !rootRef.current) return
      const map = new gmaps.Map(rootRef.current, {
        center: center || DEFAULT_CENTER, zoom: center ? 10 : 2, styles: GOOGLE_DARK_STYLE,
        mapTypeControl: false, streetViewControl: false, fullscreenControl: true, backgroundColor: '#0e0e15',
      })
      mapRef.current = map
      infoRef.current = new gmaps.InfoWindow()
      setReady(true)
    }).catch((e) => { if (!cancelled) onFail?.(e) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const gmaps = window.google.maps
    for (const m of markersRef.current.values()) m.setMap(null)
    markersRef.current.clear()
    const pts = withCoords(events)
    const icon = (color, scale = 1) => ({ path: 'M12 2C7.6 2 4 5.6 4 10c0 6 8 12 8 12s8-6 8-12c0-4.4-3.6-8-8-8zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6z', fillColor: color, fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 1.5, scale: 1.3 * scale, anchor: new gmaps.Point(12, 22) })
    for (const ev of pts) {
      const tracked = trackedIds?.has(ev.id)
      const m = new gmaps.Marker({ position: { lat: ev.venue.lat, lng: ev.venue.lng }, map, title: ev.name, icon: icon(tracked ? '#ff5c8a' : '#8b6cff') })
      m.__base = tracked ? '#ff5c8a' : '#8b6cff'
      m.addListener('click', () => onSelect?.(ev.id))
      markersRef.current.set(ev.id, m)
    }
    if (autoFit && pts.length) {
      if (pts.length === 1) { map.setCenter({ lat: pts[0].venue.lat, lng: pts[0].venue.lng }); map.setZoom(11) }
      else {
        const b = new gmaps.LatLngBounds()
        pts.forEach((e) => b.extend({ lat: e.venue.lat, lng: e.venue.lng }))
        map.fitBounds(b, 40)
      }
    }
  }, [ready, events, autoFit, trackedIds, onSelect])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const gmaps = window.google.maps
    for (const [id, m] of markersRef.current) {
      const sel = id === selectedId
      const ic = m.getIcon(); if (ic) m.setIcon({ ...ic, fillColor: sel ? '#ffffff' : m.__base, scale: sel ? 1.7 : 1.3 })
      m.setZIndex(sel ? 999 : 1)
    }
    const sel = selectedId && markersRef.current.get(selectedId)
    const ev = selectedId && events.find((e) => e.id === selectedId)
    if (sel && ev) {
      infoRef.current.setContent(`<div class="gm-popup">${popupHtml(ev)}</div>`)
      infoRef.current.open({ map, anchor: sel })
      if (!map.getBounds()?.contains(sel.getPosition())) map.panTo(sel.getPosition())
    } else infoRef.current?.close()
    return () => { void gmaps }
  }, [ready, selectedId, events])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const gmaps = window.google.maps
    if (userRef.current) { userRef.current.setMap(null); userRef.current = null }
    if (userLocation && Number.isFinite(userLocation.lat)) {
      userRef.current = new gmaps.Marker({ position: userLocation, map, title: 'You', clickable: false, icon: { path: gmaps.SymbolPath.CIRCLE, scale: 7, fillColor: '#4fd18b', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 } })
    }
  }, [ready, userLocation])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !center) return
    if (!withCoords(events).length) { map.setCenter(center); map.setZoom(10) }
  }, [ready, center]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={rootRef} className="map-root" data-testid="google-map" />
}

/**
 * Picks Google Maps when a key is configured (and not forced off), otherwise Leaflet + OSM tiles.
 * Falls back to Leaflet automatically if Google rejects the key.
 */
export default function MapView({ events = [], selectedId, onSelect, userLocation, center, autoFit = true, short = false, overlay }) {
  const { settings, tracked, notify } = useApp()
  const [failedKey, setFailedKey] = useState(null)
  const googleFailed = failedKey === settings.gmKey
  const trackedKey = Object.keys(tracked).sort().join('|')
  const trackedIds = useMemo(() => new Set(trackedKey ? trackedKey.split('|') : []), [trackedKey])
  const wantGoogle = Boolean(settings.gmKey) && settings.mapProvider !== 'leaflet' && !googleFailed

  return (
    <div className={`map-wrap ${short ? 'short' : ''}`}>
      {wantGoogle ? (
        <GoogleMap key={settings.gmKey} apiKey={settings.gmKey} events={events} selectedId={selectedId} onSelect={onSelect} userLocation={userLocation} center={center} autoFit={autoFit} trackedIds={trackedIds}
          onFail={(e) => { setFailedKey(settings.gmKey); notify(`${e.message}. Using OpenStreetMap instead.`, 'error') }} />
      ) : (
        <LeafletMap events={events} selectedId={selectedId} onSelect={onSelect} userLocation={userLocation} center={center} autoFit={autoFit} trackedIds={trackedIds} />
      )}
      <div className="map-overlay">
        <span className="pill"><span className="dot" style={{ background: wantGoogle ? '#4fd18b' : '#8b6cff' }} />{wantGoogle ? 'Google Maps' : 'OpenStreetMap'}</span>
        {overlay}
      </div>
    </div>
  )
}
