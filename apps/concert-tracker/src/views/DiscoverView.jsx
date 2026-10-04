import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context.jsx'
import MapView from '../components/MapView.jsx'
import EventRow, { EventList } from '../components/EventRow.jsx'
import { Button, Icon, Notice, Segmented, Empty } from '../components/ui.jsx'
import { discover, geocode, reverseGeocode } from '../lib/api/index.js'
import { getCurrentPosition, kmToUnit } from '../lib/geo.js'
import { todayISO, addDays } from '../lib/dates.js'
import { useStoredState } from '../lib/storage.js'

const RADII_KM = [10, 25, 50, 100, 250, 500]
const WHEN = [
  { id: 'any', label: 'Any time', days: null },
  { id: '7', label: 'Next 7 days', days: 7 },
  { id: '30', label: 'Next 30 days', days: 30 },
  { id: '90', label: 'Next 3 months', days: 90 },
  { id: 'custom', label: 'Custom dates', days: undefined },
]

export default function DiscoverView({ prefill, onPrefillConsumed }) {
  const { settings, notify, navigate } = useApp()
  const units = settings.units
  const [form, setForm] = useStoredState('lastSearch', { keyword: '', locationText: settings.home?.label || '', location: settings.home || null, radiusKm: settings.defaultRadiusKm || 50, when: 'any', startDate: todayISO(), endDate: '' })
  const [locQuery, setLocQuery] = useState(form.locationText || '')
  const [suggestions, setSuggestions] = useState([])
  const [activeSug, setActiveSug] = useState(-1)
  const [locating, setLocating] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [pane, setPane] = useState('list')
  const [hasSearched, setHasSearched] = useState(false)
  const listRef = useRef(null)
  const debounce = useRef(null)
  const update = useCallback((patch) => setForm((f) => ({ ...f, ...patch })), [setForm])

  useEffect(() => {
    clearTimeout(debounce.current)
    const q = locQuery.trim()
    if (q.length < 3 || q === form.locationText) return
    debounce.current = setTimeout(async () => { try { setSuggestions(await geocode(q)); setActiveSug(-1) } catch { setSuggestions([]) } }, 450)
    return () => clearTimeout(debounce.current)
  }, [locQuery, form.locationText])

  const pickSuggestion = (s) => {
    const label = s.short || s.label
    update({ locationText: label, location: { label, lat: s.lat, lng: s.lng } }); setLocQuery(label); setSuggestions([])
  }
  const useMyLocation = async () => {
    setLocating(true)
    try {
      const pos = await getCurrentPosition()
      const label = await reverseGeocode(pos)
      update({ locationText: label, location: { label, lat: pos.lat, lng: pos.lng } }); setLocQuery(label); setSuggestions([])
    } catch (e) { notify(e.message, 'error') } finally { setLocating(false) }
  }
  const clearLocation = () => { update({ locationText: '', location: null }); setLocQuery(''); setSuggestions([]) }

  const dateWindow = (f) => {
    const w = WHEN.find((x) => x.id === f.when) || WHEN[0]
    if (w.id === 'custom') return { startDate: f.startDate || undefined, endDate: f.endDate || undefined }
    if (w.days === null) return { startDate: todayISO(), endDate: undefined }
    return { startDate: todayISO(), endDate: addDays(todayISO(), w.days) }
  }

  const runSearch = async (overrides = {}, page = 0) => {
    const f = { ...form, ...overrides }
    let location = f.location
    if (locQuery.trim() && (!location || locQuery.trim() !== f.locationText)) {
      try {
        const [first] = await geocode(locQuery)
        if (!first) { notify(`No place called "${locQuery}" was found.`, 'error'); return }
        location = { label: first.short || first.label, lat: first.lat, lng: first.lng }
        update({ locationText: location.label, location }); setLocQuery(location.label)
      } catch (e) { notify(e.message, 'error'); return }
    } else if (!locQuery.trim()) location = null
    if (!f.keyword.trim() && !location) { notify('Enter an artist or a place to search.', 'error'); return }
    setLoading(true); setHasSearched(true)
    if (page === 0) setSelectedId(null)
    try {
      const r = await discover({ settings, keyword: f.keyword, location, radiusKm: f.radiusKm, ...dateWindow(f), page })
      setResult((prev) => page > 0 && prev ? { ...r, events: [...prev.events, ...r.events], origin: location } : { ...r, origin: location })
    } catch (e) { notify(e.message, 'error') } finally { setLoading(false) }
  }

  useEffect(() => {
    if (!prefill) return
    update({ keyword: prefill.keyword ?? form.keyword })
    onPrefillConsumed?.()
    setTimeout(() => runSearch({ keyword: prefill.keyword ?? form.keyword }), 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill])

  const onSelect = useCallback((id) => {
    setSelectedId(id)
    listRef.current?.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [])

  const events = result?.events || []
  const origin = result?.origin || form.location
  const mapCenter = useMemo(() => (origin ? { lat: origin.lat, lng: origin.lng } : null), [origin])
  const canLoadMore = result && result.page + 1 < result.totalPages && (settings.tmKey || settings.sgClientId)
  const geoCapable = Boolean(settings.tmKey || settings.sgClientId)
  const onMap = events.filter((e) => Number.isFinite(e.venue?.lat)).length

  const onLocKey = (e) => {
    if (!suggestions.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveSug((i) => Math.min(i + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveSug((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' && activeSug >= 0) { e.preventDefault(); pickSuggestion(suggestions[activeSug]) }
    else if (e.key === 'Escape') setSuggestions([])
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Find concerts</h1>
          <p>Search by artist, by place, or both. Results from Ticketmaster, SeatGeek and Bandsintown are combined and shown on the map.</p>
        </div>
      </div>

      <form className="panel search-form" onSubmit={(e) => { e.preventDefault(); runSearch() }} role="search" aria-label="Concert search">
        <div className="field">
          <label htmlFor="q">Artist or event</label>
          <div className="input-wrap"><Icon name="search" className="icon-left" /><input id="q" className="input" placeholder="Artist, band or festival" value={form.keyword} onChange={(e) => update({ keyword: e.target.value })} autoComplete="off" /></div>
        </div>
        <div className="field suggest-wrap">
          <label htmlFor="loc">Location</label>
          <div className="input-group">
            <div className="input-wrap" style={{ flex: 1 }}>
              <Icon name="map-pin" className="icon-left" />
              <input id="loc" className="input" placeholder="City or address" value={locQuery} role="combobox" aria-expanded={suggestions.length > 0} aria-controls="loc-suggest" aria-autocomplete="list" aria-activedescendant={activeSug >= 0 ? `loc-opt-${activeSug}` : undefined}
                onChange={(e) => { setLocQuery(e.target.value); if (e.target.value.trim().length < 3) setSuggestions([]); if (!e.target.value) update({ location: null, locationText: '' }) }} onKeyDown={onLocKey} autoComplete="off" />
            </div>
            <Button icon="crosshair" aria-label="Use my current location" title="Use my current location" onClick={useMyLocation} loading={locating} />
            {locQuery && <Button variant="ghost" icon="x" aria-label="Clear location" title="Clear location" onClick={clearLocation} />}
          </div>
          {suggestions.length > 0 && (
            <ul className="suggest" id="loc-suggest" role="listbox" aria-label="Place suggestions">
              {suggestions.map((s, i) => (
                <li key={i} role="none"><button type="button" id={`loc-opt-${i}`} role="option" aria-selected={i === activeSug} onMouseDown={(e) => e.preventDefault()} onClick={() => pickSuggestion(s)}>{s.short}<span className="sub">{s.label}</span></button></li>
              ))}
            </ul>
          )}
        </div>
        <div className="field">
          <label htmlFor="radius">Distance</label>
          <select id="radius" className="select" value={form.radiusKm} onChange={(e) => update({ radiusKm: Number(e.target.value) })}>
            {RADII_KM.map((km) => <option key={km} value={km}>Within {kmToUnit(km, units)} {units}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="when">Dates</label>
          <select id="when" className="select" value={form.when} onChange={(e) => update({ when: e.target.value })}>
            {WHEN.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
          </select>
        </div>
        <Button type="submit" variant="primary" size="lg" className="search-submit" loading={loading}>Search</Button>
        {form.when === 'custom' && (
          <div className="row" style={{ gridColumn: '1 / -1' }}>
            <div className="field"><label htmlFor="from">From</label><input id="from" type="date" className="input" value={form.startDate} onChange={(e) => update({ startDate: e.target.value })} /></div>
            <div className="field"><label htmlFor="to">To</label><input id="to" type="date" className="input" value={form.endDate} min={form.startDate} onChange={(e) => update({ endDate: e.target.value })} /></div>
          </div>
        )}
      </form>

      {!geoCapable && (
        <Notice tone="info" className="toolbar">
          Searching by location needs a free Ticketmaster or SeatGeek key. Artist search works without one. <button type="button" className="link-btn" onClick={() => navigate('settings')}>Add a key in Settings</button>
        </Notice>
      )}
      {result?.warnings?.map((w, i) => <Notice key={i} tone="warning" className="toolbar">{w}</Notice>)}

      <div className="toolbar">
        <div className="results-head" style={{ padding: 0 }}>
          {events.length > 0 ? <span><strong className="num">{events.length}{canLoadMore ? '+' : ''}</strong> concert{events.length === 1 ? '' : 's'}{origin ? ` near ${origin.label}` : ''}{result.providers.length ? ` · ${result.providers.join(', ')}` : ''}</span> : <span />}
        </div>
        <Segmented pressed label="Results view" value={pane} onChange={setPane} tabs={[{ id: 'list', label: 'List', icon: 'list' }, { id: 'map', label: 'Map', icon: 'map', count: onMap || undefined }]} />
      </div>

      <div className={`split ${pane === 'map' ? 'show-map' : 'show-list'}`}>
        <div className="results-pane" ref={listRef} data-testid="results" aria-busy={loading}>
          {loading && !events.length && <EventList>{[0, 1, 2].map((i) => <div key={i} className="skeleton" />)}</EventList>}
          {!loading && hasSearched && !events.length && <Empty icon="search" title="No concerts found">Try a wider distance, a longer date range, or a different spelling of the artist.</Empty>}
          {!hasSearched && !loading && <Empty icon="map-pin" title="Search for a show">Type an artist, choose a place or use your location, then press Search. Track anything you like and it appears in My Concerts.</Empty>}
          {events.length > 0 && (
            <EventList>
              {events.map((ev) => (
                <div key={ev.id} data-id={ev.id}>
                  <EventRow event={ev} interactive selected={ev.id === selectedId} onSelect={(id) => { setSelectedId(id); if (window.innerWidth <= 880) setPane('map') }} origin={origin} />
                </div>
              ))}
            </EventList>
          )}
          {canLoadMore && <Button className="btn-block" style={{ marginTop: 10 }} onClick={() => runSearch({}, result.page + 1)} loading={loading}>Load more</Button>}
        </div>
        <div className="map-sticky">
          <MapView events={events} selectedId={selectedId} onSelect={onSelect} userLocation={origin} center={mapCenter} autoFit />
        </div>
      </div>
    </div>
  )
}
