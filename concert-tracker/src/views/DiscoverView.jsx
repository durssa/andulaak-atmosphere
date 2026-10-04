import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context.jsx'
import MapView from '../components/MapView.jsx'
import EventCard from '../components/EventCard.jsx'
import { discover, geocode, reverseGeocode } from '../lib/api/index.js'
import { getCurrentPosition, kmToUnit } from '../lib/geo.js'
import { todayISO, addDays } from '../lib/dates.js'
import { useStoredState } from '../lib/storage.js'

const RADII_KM = [10, 25, 50, 100, 250, 500]

export default function DiscoverView({ prefill, onPrefillConsumed }) {
  const { settings, notify, navigate } = useApp()
  const units = settings.units
  const [form, setForm] = useStoredState('lastSearch', { keyword: '', locationText: settings.home?.label || '', location: settings.home || null, radiusKm: settings.defaultRadiusKm || 50, startDate: todayISO(), endDate: '' })
  const [locQuery, setLocQuery] = useState(form.locationText || '')
  const [suggestions, setSuggestions] = useState([])
  const [locating, setLocating] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null) // { events, warnings, providers, totalPages, page, origin }
  const [selectedId, setSelectedId] = useState(null)
  const [pane, setPane] = useState('list')
  const [hasSearched, setHasSearched] = useState(false)
  const listRef = useRef(null)
  const debounce = useRef(null)

  const update = useCallback((patch) => setForm((f) => ({ ...f, ...patch })), [setForm])

  // Location autocomplete (debounced)
  useEffect(() => {
    clearTimeout(debounce.current)
    const q = locQuery.trim()
    if (q.length < 3 || q === form.locationText) return
    debounce.current = setTimeout(async () => {
      try { setSuggestions(await geocode(q)) } catch { setSuggestions([]) }
    }, 450)
    return () => clearTimeout(debounce.current)
  }, [locQuery, form.locationText])

  const pickSuggestion = (s) => {
    update({ locationText: s.short || s.label, location: { label: s.short || s.label, lat: s.lat, lng: s.lng } })
    setLocQuery(s.short || s.label)
    setSuggestions([])
  }

  const useMyLocation = async () => {
    setLocating(true)
    try {
      const pos = await getCurrentPosition()
      const label = await reverseGeocode(pos)
      update({ locationText: label, location: { label, lat: pos.lat, lng: pos.lng } })
      setLocQuery(label)
      setSuggestions([])
    } catch (e) { notify(e.message, 'error') } finally { setLocating(false) }
  }

  const clearLocation = () => { update({ locationText: '', location: null }); setLocQuery(''); setSuggestions([]) }

  const runSearch = async (overrides = {}, page = 0) => {
    const f = { ...form, ...overrides }
    let location = f.location
    // Resolve a typed place name that was never picked from suggestions.
    if (locQuery.trim() && (!location || locQuery.trim() !== f.locationText)) {
      try {
        const [first] = await geocode(locQuery)
        if (first) { location = { label: first.short || first.label, lat: first.lat, lng: first.lng }; update({ locationText: location.label, location }); setLocQuery(location.label) }
        else { notify(`Could not find a place called "${locQuery}"`, 'error'); return }
      } catch (e) { notify(e.message, 'error'); return }
    } else if (!locQuery.trim()) location = null
    if (!f.keyword.trim() && !location) { notify('Enter an artist or a place to search', 'error'); return }
    setLoading(true); setHasSearched(true)
    if (page === 0) setSelectedId(null)
    try {
      const r = await discover({ settings, keyword: f.keyword, location, radiusKm: f.radiusKm, startDate: f.startDate || undefined, endDate: f.endDate || undefined, page })
      setResult((prev) => page > 0 && prev ? { ...r, events: [...prev.events, ...r.events], origin: location } : { ...r, origin: location })
      if (page === 0) setPane(r.events.length ? 'list' : 'list')
    } catch (e) {
      notify(e.message, 'error')
    } finally { setLoading(false) }
  }

  // Pre-fill from other views (e.g. "search this artist")
  useEffect(() => {
    if (!prefill) return
    update({ keyword: prefill.keyword ?? form.keyword })
    onPrefillConsumed?.()
    setTimeout(() => runSearch({ keyword: prefill.keyword ?? form.keyword }), 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill])

  const onSelect = useCallback((id) => {
    setSelectedId(id)
    const el = listRef.current?.querySelector(`[data-id="${id}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [])

  const events = result?.events || []
  const origin = result?.origin || form.location
  const mapCenter = useMemo(() => origin ? { lat: origin.lat, lng: origin.lng } : null, [origin])
  const canLoadMore = result && result.page + 1 < result.totalPages && settings.tmKey

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Discover concerts</h1>
          <p>Search by artist, by place, or both. Results come from Ticketmaster and Bandsintown and land on the map.</p>
        </div>
        <div className="segmented" role="tablist" aria-label="View">
          <button role="tab" aria-selected={pane === 'list'} className={pane === 'list' ? 'active' : ''} onClick={() => setPane('list')}>List</button>
          <button role="tab" aria-selected={pane === 'map'} className={pane === 'map' ? 'active' : ''} onClick={() => setPane('map')}>Map</button>
        </div>
      </div>

      <form className="card search-panel" onSubmit={(e) => { e.preventDefault(); runSearch() }} role="search">
        <div className="field">
          <label htmlFor="q">Artist or keyword</label>
          <input id="q" className="input" placeholder="e.g. Radiohead, jazz festival" value={form.keyword} onChange={(e) => update({ keyword: e.target.value })} autoComplete="off" />
        </div>
        <div className="field loc-wrap">
          <label htmlFor="loc">Near</label>
          <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
            <input id="loc" className="input" placeholder="City or address" value={locQuery} onChange={(e) => { setLocQuery(e.target.value); if (e.target.value.trim().length < 3) setSuggestions([]); if (!e.target.value) update({ location: null, locationText: '' }) }} autoComplete="off" />
            <button type="button" className="btn icon" title="Use my location" aria-label="Use my location" onClick={useMyLocation} disabled={locating}>{locating ? <span className="spinner" /> : '◎'}</button>
            {locQuery && <button type="button" className="btn icon ghost" title="Clear location" aria-label="Clear location" onClick={clearLocation}>✕</button>}
          </div>
          {suggestions.length > 0 && (
            <div className="suggest" role="listbox">
              {suggestions.map((s, i) => (
                <button type="button" key={i} role="option" aria-selected={false} onClick={() => pickSuggestion(s)}>{s.short}<span className="sub">{s.label}</span></button>
              ))}
            </div>
          )}
        </div>
        <div className="field">
          <label htmlFor="radius">Within</label>
          <select id="radius" className="select" value={form.radiusKm} onChange={(e) => update({ radiusKm: Number(e.target.value) })}>
            {RADII_KM.map((km) => <option key={km} value={km}>{kmToUnit(km, units)} {units}</option>)}
          </select>
        </div>
        <div className="field dates">
          <label htmlFor="from">Dates</label>
          <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
            <input id="from" type="date" className="input" value={form.startDate} onChange={(e) => update({ startDate: e.target.value })} aria-label="From date" />
            <input type="date" className="input" value={form.endDate} min={form.startDate} onChange={(e) => update({ endDate: e.target.value })} aria-label="To date" />
          </div>
        </div>
        <button type="submit" className="btn primary btn-search" disabled={loading} style={{ height: 42 }}>{loading ? <span className="spinner" /> : 'Search'}</button>
      </form>

      <div className="row" style={{ margin: '10px 0 16px', gap: 6 }}>
        <span className="faint small">Quick dates:</span>
        <button type="button" className="btn xs" onClick={() => update({ startDate: todayISO(), endDate: addDays(todayISO(), 7) })}>Next 7 days</button>
        <button type="button" className="btn xs" onClick={() => update({ startDate: todayISO(), endDate: addDays(todayISO(), 30) })}>Next 30 days</button>
        <button type="button" className="btn xs" onClick={() => update({ startDate: todayISO(), endDate: addDays(todayISO(), 90) })}>Next 3 months</button>
        <button type="button" className="btn xs ghost" onClick={() => update({ startDate: todayISO(), endDate: '' })}>Any time</button>
        {!settings.tmKey && <button type="button" className="btn xs ghost" style={{ marginLeft: 'auto' }} onClick={() => navigate('settings')}>Add Ticketmaster key for location search →</button>}
      </div>

      {result?.warnings?.map((w, i) => <div key={i} className="notice warn" style={{ marginBottom: 10 }}>⚠️ <span>{w}</span></div>)}

      <div className={`split ${pane === 'map' ? 'show-map' : 'show-list'}`}>
        <div className="results" ref={listRef} data-testid="results">
          {loading && !events.length && [0, 1, 2].map((i) => <div key={i} className="skeleton" />)}
          {!loading && hasSearched && !events.length && (
            <div className="empty">
              <div className="big">🎶</div>
              <h3>No concerts found</h3>
              <p>Try a wider radius, a longer date range, or a different spelling of the artist.</p>
            </div>
          )}
          {!hasSearched && !loading && (
            <div className="empty">
              <div className="big">🗺️</div>
              <h3>Find your next show</h3>
              <p>Type an artist, pick a city or use your location, then hit Search. Track anything you like — it shows up in My Concerts and on the map.</p>
            </div>
          )}
          {events.length > 0 && (
            <div className="results-head">
              <span className="muted small">{events.length}{canLoadMore ? '+' : ''} event{events.length === 1 ? '' : 's'}{result.providers.length ? ` · via ${result.providers.join(' + ')}` : ''}</span>
              {origin && <span className="faint small">near {origin.label}</span>}
            </div>
          )}
          {events.map((ev) => (
            <div key={ev.id} data-id={ev.id}>
              <EventCard event={ev} selected={ev.id === selectedId} onSelect={(id) => { setSelectedId(id); if (window.innerWidth <= 860) setPane('map') }} origin={origin} />
            </div>
          ))}
          {canLoadMore && <button type="button" className="btn" onClick={() => runSearch({}, result.page + 1)} disabled={loading}>{loading ? <span className="spinner" /> : 'Load more'}</button>}
        </div>
        <div className="map-sticky">
          <MapView events={events} selectedId={selectedId} onSelect={onSelect} userLocation={origin} center={mapCenter} autoFit
            overlay={events.length ? <span className="pill">{events.filter((e) => Number.isFinite(e.venue?.lat)).length} on map</span> : null} />
        </div>
      </div>
    </div>
  )
}
