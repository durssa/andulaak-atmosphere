import { useRef, useState } from 'react'
import { useApp } from '../context.jsx'
import { searchEvents } from '../lib/api/ticketmaster.js'
import { loadGoogleMaps } from '../lib/api/googleMaps.js'
import { geocode, reverseGeocode } from '../lib/api/index.js'
import { getCurrentPosition } from '../lib/geo.js'
import { exportAllData, importAllData } from '../lib/storage.js'

function KeyField({ id, label, value, onChange, placeholder, help }) {
  const [show, setShow] = useState(false)
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
        <input id={id} className="input" type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value.trim())} placeholder={placeholder} autoComplete="off" spellCheck={false} />
        <button type="button" className="btn icon ghost" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide key' : 'Show key'}>{show ? '🙈' : '👁️'}</button>
      </div>
      {help && <span className="faint small">{help}</span>}
    </div>
  )
}

export default function SettingsView() {
  const { settings, setSettings, notify, resetAll } = useApp()
  const [tmTest, setTmTest] = useState(null)
  const [gmTest, setGmTest] = useState(null)
  const [homeQuery, setHomeQuery] = useState(settings.home?.label || '')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  const testTm = async () => {
    setTmTest({ loading: true })
    try {
      const r = await searchEvents({ apiKey: settings.tmKey, keyword: 'music', size: 1 })
      setTmTest({ ok: true, text: `Connected — ${r.page.totalElements.toLocaleString()} music events available` })
    } catch (e) { setTmTest({ ok: false, text: e.message }) }
  }
  const testGm = async () => {
    setGmTest({ loading: true })
    try { await loadGoogleMaps(settings.gmKey); setGmTest({ ok: true, text: 'Google Maps loaded. Maps now use Google.' }) } catch (e) { setGmTest({ ok: false, text: e.message }) }
  }

  const setHome = async () => {
    if (!homeQuery.trim()) { setSettings({ home: null }); return }
    setBusy(true)
    try {
      const [first] = await geocode(homeQuery)
      if (!first) { notify(`Could not find "${homeQuery}"`, 'error'); return }
      const home = { label: first.short || first.label, lat: first.lat, lng: first.lng }
      setSettings({ home }); setHomeQuery(home.label); notify(`Home set to ${home.label}`)
    } catch (e) { notify(e.message, 'error') } finally { setBusy(false) }
  }
  const homeFromGps = async () => {
    setBusy(true)
    try {
      const pos = await getCurrentPosition()
      const label = await reverseGeocode(pos)
      setSettings({ home: { label, lat: pos.lat, lng: pos.lng } }); setHomeQuery(label); notify(`Home set to ${label}`)
    } catch (e) { notify(e.message, 'error') } finally { setBusy(false) }
  }

  const doExport = () => {
    const blob = new Blob([JSON.stringify(exportAllData(), null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `encore-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  const doImport = (file) => {
    const reader = new FileReader()
    reader.onload = () => { try { importAllData(JSON.parse(reader.result)); notify('Data imported — reloading'); setTimeout(() => window.location.reload(), 600) } catch (e) { notify(e.message, 'error') } }
    reader.readAsText(file)
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Keys are stored only in this browser (localStorage) and sent straight to each provider — there is no Encore server.</p>
        </div>
      </div>
      <div className="settings-grid">
        <div className="stack">
          <div className="card">
            <h3>🎟️ Ticketmaster Discovery API</h3>
            <p className="muted small" style={{ marginTop: 0 }}>Unlocks search by city and distance, prices, genres and ticket status. Free tier: 5,000 calls/day. <a href="https://developer.ticketmaster.com/products-and-docs/apis/getting-started/" target="_blank" rel="noopener noreferrer">Get a key ↗</a> (create an app, copy its <em>Consumer Key</em>).</p>
            <KeyField id="tmKey" label="Consumer key" value={settings.tmKey} onChange={(v) => { setSettings({ tmKey: v }); setTmTest(null) }} placeholder="Paste your Ticketmaster key" />
            <div className="row" style={{ marginTop: 10 }}>
              <button type="button" className="btn sm" onClick={testTm} disabled={!settings.tmKey || tmTest?.loading}>{tmTest?.loading ? <span className="spinner" /> : 'Test connection'}</button>
              {tmTest && !tmTest.loading && <span className={`small ${tmTest.ok ? '' : ''}`} style={{ color: tmTest.ok ? 'var(--ok)' : 'var(--danger)' }}>{tmTest.text}</span>}
              {!settings.tmKey && <span className="badge warn">Not configured — artist search still works via Bandsintown</span>}
            </div>
          </div>

          <div className="card">
            <h3>🗺️ Google Maps</h3>
            <p className="muted small" style={{ marginTop: 0 }}>Optional. With a key, maps and geocoding use Google Maps; without one, Encore uses OpenStreetMap. Enable <em>Maps JavaScript API</em> and <em>Geocoding API</em> and restrict the key to this site's URL. <a href="https://developers.google.com/maps/documentation/javascript/get-api-key" target="_blank" rel="noopener noreferrer">Get a key ↗</a></p>
            <KeyField id="gmKey" label="API key" value={settings.gmKey} onChange={(v) => { setSettings({ gmKey: v }); setGmTest(null) }} placeholder="AIza…" />
            <div className="row" style={{ marginTop: 10 }}>
              <button type="button" className="btn sm" onClick={testGm} disabled={!settings.gmKey || gmTest?.loading}>{gmTest?.loading ? <span className="spinner" /> : 'Test key'}</button>
              {gmTest && !gmTest.loading && <span className="small" style={{ color: gmTest.ok ? 'var(--ok)' : 'var(--danger)' }}>{gmTest.text}</span>}
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor="mapProvider">Map provider</label>
              <select id="mapProvider" className="select" value={settings.mapProvider} onChange={(e) => setSettings({ mapProvider: e.target.value })}>
                <option value="auto">Automatic (Google when a key is set)</option>
                <option value="leaflet">Always OpenStreetMap</option>
              </select>
            </div>
          </div>

          <div className="card">
            <h3>🎸 Bandsintown</h3>
            <p className="muted small" style={{ marginTop: 0 }}>Used for artist tour dates and works without registration. The app id identifies this app to Bandsintown; change it only if you have your own.</p>
            <div className="field"><label htmlFor="bit">App id</label><input id="bit" className="input" value={settings.bitAppId} onChange={(e) => setSettings({ bitAppId: e.target.value.trim() || 'encore-concert-tracker' })} /></div>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h3>📍 Home & units</h3>
            <div className="field">
              <label htmlFor="home">Home location</label>
              <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                <input id="home" className="input" placeholder="City where you live" value={homeQuery} onChange={(e) => setHomeQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setHome() } }} />
                <button type="button" className="btn icon" title="Use my location" aria-label="Use my location" onClick={homeFromGps} disabled={busy}>◎</button>
                <button type="button" className="btn" onClick={setHome} disabled={busy}>{busy ? <span className="spinner" /> : 'Save'}</button>
              </div>
              <span className="faint small">{settings.home ? `Saved: ${settings.home.label} (${settings.home.lat.toFixed(3)}, ${settings.home.lng.toFixed(3)}). Used as the default search area and to sort shows by distance.` : 'Not set. Used as the default search area and to sort shows by distance.'}</span>
            </div>
            <div className="row" style={{ marginTop: 14 }}>
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="units">Distance units</label>
                <select id="units" className="select" value={settings.units} onChange={(e) => setSettings({ units: e.target.value })}><option value="km">Kilometres</option><option value="mi">Miles</option></select>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="radius">Default radius</label>
                <select id="radius" className="select" value={settings.defaultRadiusKm} onChange={(e) => setSettings({ defaultRadiusKm: Number(e.target.value) })}>{[10, 25, 50, 100, 250, 500].map((k) => <option key={k} value={k}>{settings.units === 'mi' ? `${Math.round(k * 0.621)} mi` : `${k} km`}</option>)}</select>
              </div>
            </div>
          </div>

          <div className="card">
            <h3>💾 Your data</h3>
            <p className="muted small" style={{ marginTop: 0 }}>Tracked concerts, followed artists and settings live in this browser. Export a backup to move them to another device.</p>
            <div className="row">
              <button type="button" className="btn sm" onClick={doExport}>Export backup (.json)</button>
              <button type="button" className="btn sm" onClick={() => fileRef.current?.click()}>Import backup</button>
              <input ref={fileRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
              <button type="button" className="btn sm danger" onClick={() => { if (window.confirm('Delete all tracked concerts, artists and settings from this browser?')) resetAll() }}>Clear everything</button>
            </div>
          </div>

          <div className="card">
            <h3>ℹ️ About Encore</h3>
            <dl className="kv">
              <dt>Concert data</dt><dd><a href="https://developer.ticketmaster.com/" target="_blank" rel="noopener noreferrer">Ticketmaster Discovery API</a> · <a href="https://www.bandsintown.com/" target="_blank" rel="noopener noreferrer">Bandsintown</a></dd>
              <dt>Maps</dt><dd><a href="https://developers.google.com/maps" target="_blank" rel="noopener noreferrer">Google Maps Platform</a> · <a href="https://leafletjs.com/" target="_blank" rel="noopener noreferrer">Leaflet</a> with <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> / <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a> tiles</dd>
              <dt>Geocoding</dt><dd>Google Geocoding (with key) · <a href="https://nominatim.org/" target="_blank" rel="noopener noreferrer">Nominatim</a></dd>
              <dt>Version</dt><dd>{__APP_VERSION__}</dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}
