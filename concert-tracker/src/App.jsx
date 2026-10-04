import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppContext, DEFAULT_SETTINGS } from './context.jsx'
import { useStoredState } from './lib/storage.js'
import { upcomingForArtist, lookupArtist } from './lib/api/index.js'
import { Toasts } from './components/Toast.jsx'
import HomeView from './views/HomeView.jsx'
import DiscoverView from './views/DiscoverView.jsx'
import ArtistsView from './views/ArtistsView.jsx'
import MyConcertsView from './views/MyConcertsView.jsx'
import SettingsView from './views/SettingsView.jsx'

const TABS = [
  { id: 'home', label: 'Home', ico: '🏠' },
  { id: 'discover', label: 'Discover', ico: '🔍' },
  { id: 'artists', label: 'Artists', ico: '🎤' },
  { id: 'concerts', label: 'My Concerts', ico: '🎟️' },
  { id: 'settings', label: 'Settings', ico: '⚙️' },
]
const FEED_TTL = 6 * 3600 * 1000

function tabFromHash() {
  const h = window.location.hash.replace(/^#\/?/, '')
  return TABS.some((t) => t.id === h) ? h : 'home'
}

export default function App() {
  const [storedSettings, setStoredSettings] = useStoredState('settings', {})
  const settings = useMemo(() => ({ ...DEFAULT_SETTINGS, ...storedSettings }), [storedSettings])
  const setSettings = useCallback((patch) => setStoredSettings((s) => ({ ...s, ...patch })), [setStoredSettings])

  const [tracked, setTracked] = useStoredState('tracked', {})
  const [artists, setArtists] = useStoredState('artists', [])
  const [feeds, setFeeds] = useStoredState('feeds', {})
  const [feedStatus, setFeedStatus] = useState({})
  const [tab, setTab] = useState(tabFromHash)
  const [prefill, setPrefill] = useState(null)
  const [toasts, setToasts] = useState([])
  const inflight = useRef(new Set())

  // Hash routing
  useEffect(() => {
    const onHash = () => setTab(tabFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const navigate = useCallback((id, params) => {
    if (params && id === 'discover') setPrefill(params)
    window.location.hash = `/${id}`
    setTab(id)
    window.scrollTo({ top: 0 })
  }, [])

  const notify = useCallback((text, kind = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t, { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3200)
  }, [])

  // Tracking
  const setStatus = useCallback((event, status) => {
    setTracked((t) => ({ ...t, [event.id]: { ...(t[event.id] || { addedAt: Date.now(), notes: '' }), event, status, updatedAt: Date.now() } }))
    const label = { interested: 'Interested in', going: "You're going to", attended: 'Attended' }[status]
    notify(`${label} ${event.name} 🎶`)
  }, [setTracked, notify])
  const untrack = useCallback((id) => setTracked((t) => { const n = { ...t }; delete n[id]; return n }), [setTracked])
  const updateTracked = useCallback((id, patch) => setTracked((t) => (t[id] ? { ...t, [id]: { ...t[id], ...patch, updatedAt: Date.now() } } : t)), [setTracked])

  // Artist feeds
  const refreshArtist = useCallback(async (name, { force = false } = {}) => {
    const key = name.toLowerCase()
    if (inflight.current.has(key)) return
    const existing = feeds[key]
    if (!force && existing?.fetchedAt && Date.now() - existing.fetchedAt < FEED_TTL) return
    inflight.current.add(key)
    setFeedStatus((s) => ({ ...s, [key]: { loading: true } }))
    try {
      const { events, warnings } = await upcomingForArtist({ settings, artist: name })
      setFeeds((f) => ({ ...f, [key]: { events, warnings, fetchedAt: Date.now() } }))
      setFeedStatus((s) => ({ ...s, [key]: { loading: false, error: warnings[0] || null } }))
    } catch (e) {
      setFeedStatus((s) => ({ ...s, [key]: { loading: false, error: e.message } }))
    } finally { inflight.current.delete(key) }
  }, [feeds, settings, setFeeds])

  const refreshAll = useCallback(async ({ force = false } = {}) => {
    // Stagger requests to stay friendly to provider rate limits.
    for (const a of artists) { refreshArtist(a.name, { force }); await new Promise((r) => setTimeout(r, 250)) }
  }, [artists, refreshArtist])

  const followArtist = useCallback(async (name, { quiet = false } = {}) => {
    const clean = name.trim()
    if (!clean) return
    if (artists.some((a) => a.name.toLowerCase() === clean.toLowerCase())) { if (!quiet) notify(`Already following ${clean}`); return }
    const profile = await lookupArtist({ settings, name: clean })
    setArtists((list) => list.some((a) => a.name.toLowerCase() === profile.name.toLowerCase()) ? list : [...list, { name: profile.name, image: profile.image, upcoming: profile.upcoming, addedAt: Date.now() }])
    if (!quiet) notify(`Following ${profile.name}`)
    refreshArtist(profile.name, { force: true })
  }, [artists, settings, setArtists, notify, refreshArtist])

  const unfollowArtist = useCallback((name) => {
    setArtists((list) => list.filter((a) => a.name !== name))
    setFeeds((f) => { const n = { ...f }; delete n[name.toLowerCase()]; return n })
  }, [setArtists, setFeeds])

  const resetAll = useCallback(() => {
    Object.keys(localStorage).filter((k) => k.startsWith('encore.')).forEach((k) => localStorage.removeItem(k))
    window.location.hash = ''
    window.location.reload()
  }, [])

  // Refresh stale feeds on start-up
  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    if (artists.length) refreshAll()
  }, [artists.length, refreshAll])

  const ctx = useMemo(() => ({ settings, setSettings, tracked, setStatus, untrack, updateTracked, artists, followArtist, unfollowArtist, feeds, feedStatus, refreshArtist, refreshAll, navigate, notify, resetAll }),
    [settings, setSettings, tracked, setStatus, untrack, updateTracked, artists, followArtist, unfollowArtist, feeds, feedStatus, refreshArtist, refreshAll, navigate, notify, resetAll])

  const upcomingCount = Object.values(tracked).filter((t) => t.status !== 'attended' && (!t.event.date || t.event.date >= new Date().toISOString().slice(0, 10))).length

  return (
    <AppContext.Provider value={ctx}>
      <div className="app">
        <header className="header">
          <a className="brand" href="#/home" onClick={(e) => { e.preventDefault(); navigate('home') }}>
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="30" height="30" />
            <span>En<b>core</b></span>
          </a>
          <nav className="nav" aria-label="Main">
            {TABS.map((t) => (
              <button key={t.id} type="button" className={tab === t.id ? 'active' : ''} onClick={() => navigate(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
                <span className="ico" aria-hidden="true">{t.ico}</span>{t.label}
                {t.id === 'concerts' && upcomingCount > 0 && <span className="badge pink">{upcomingCount}</span>}
              </button>
            ))}
          </nav>
          <div className="header-right">
            <button type="button" className={`pill ${settings.tmKey ? 'on' : 'warn'}`} onClick={() => navigate('settings')} title={settings.tmKey ? 'Ticketmaster connected' : 'Add a Ticketmaster key to search by location'} style={{ cursor: 'pointer' }}>
              <span className="dot" /><span className="t">Ticketmaster</span>
            </button>
            <button type="button" className={`pill ${settings.gmKey && settings.mapProvider !== 'leaflet' ? 'on' : ''}`} onClick={() => navigate('settings')} title="Map provider" style={{ cursor: 'pointer' }}>
              <span className="dot" /><span className="t">{settings.gmKey && settings.mapProvider !== 'leaflet' ? 'Google Maps' : 'OpenStreetMap'}</span>
            </button>
          </div>
        </header>
        <main className="main">
          {tab === 'home' && <HomeView />}
          {tab === 'discover' && <DiscoverView prefill={prefill} onPrefillConsumed={() => setPrefill(null)} />}
          {tab === 'artists' && <ArtistsView />}
          {tab === 'concerts' && <MyConcertsView />}
          {tab === 'settings' && <SettingsView />}
        </main>
        <Toasts items={toasts} />
      </div>
    </AppContext.Provider>
  )
}
