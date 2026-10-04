import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppContext, DEFAULT_SETTINGS } from './context.jsx'
import { useStoredState } from './lib/storage.js'
import { upcomingForArtist, lookupArtist } from './lib/api/index.js'
import { handleSpotifyRedirect, spotifySession } from './lib/api/spotify.js'
import { Toasts } from './components/Toast.jsx'
import { Icon } from './components/ui.jsx'
import HomeView from './views/HomeView.jsx'
import DiscoverView from './views/DiscoverView.jsx'
import ArtistsView from './views/ArtistsView.jsx'
import MyConcertsView from './views/MyConcertsView.jsx'
import SettingsView from './views/SettingsView.jsx'

const TABS = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'discover', label: 'Find concerts', short: 'Find', icon: 'search' },
  { id: 'artists', label: 'Artists', icon: 'mic' },
  { id: 'concerts', label: 'My concerts', icon: 'ticket' },
  { id: 'settings', label: 'Settings', icon: 'sliders' },
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
  const [spotify, setSpotify] = useState(spotifySession)
  const inflight = useRef(new Set())

  useEffect(() => {
    const onHash = () => setTab(tabFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'light' || settings.theme === 'dark') root.setAttribute('data-theme', settings.theme)
    else root.removeAttribute('data-theme')
  }, [settings.theme])

  const navigate = useCallback((id, params) => {
    if (params && id === 'discover') setPrefill(params)
    window.location.hash = `/${id}`
    setTab(id)
    window.scrollTo({ top: 0 })
    document.getElementById('main')?.focus({ preventScroll: true })
  }, [])

  const notify = useCallback((text, kind = 'success') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t, { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 3500)
  }, [])

  // Spotify OAuth callback
  const spotifyHandled = useRef(false)
  useEffect(() => {
    if (spotifyHandled.current) return
    spotifyHandled.current = true
    handleSpotifyRedirect(settings.spotifyClientId).then((s) => { if (s?.connected) { setSpotify(s); notify('Spotify connected'); setTab(tabFromHash()) } }).catch((e) => notify(e.message, 'error'))
  }, [settings.spotifyClientId, notify])

  const setStatus = useCallback((event, status) => {
    setTracked((t) => ({ ...t, [event.id]: { ...(t[event.id] || { addedAt: Date.now(), notes: '' }), event, status, updatedAt: Date.now() } }))
    notify(`${{ interested: 'Saved as interested', going: 'Marked as going', attended: 'Marked as attended' }[status]}: ${event.name}`)
  }, [setTracked, notify])
  const untrack = useCallback((id) => setTracked((t) => { const n = { ...t }; delete n[id]; return n }), [setTracked])
  const updateTracked = useCallback((id, patch) => setTracked((t) => (t[id] ? { ...t, [id]: { ...t[id], ...patch, updatedAt: Date.now() } } : t)), [setTracked])

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
    for (const a of artists) { refreshArtist(a.name, { force }); await new Promise((r) => setTimeout(r, 250)) }
  }, [artists, refreshArtist])

  const followArtist = useCallback(async (name, { quiet = false, profile = null } = {}) => {
    const clean = name.trim()
    if (!clean) return
    if (artists.some((a) => a.name.toLowerCase() === clean.toLowerCase())) { if (!quiet) notify(`Already following ${clean}`, 'info'); return }
    const found = await lookupArtist({ settings, name: clean })
    const entry = { name: found.name, image: profile?.image || found.image, upcoming: found.upcoming, spotifyUrl: profile?.spotifyUrl || null, addedAt: Date.now() }
    setArtists((list) => (list.some((a) => a.name.toLowerCase() === entry.name.toLowerCase()) ? list : [...list, entry]))
    if (!quiet) notify(`Following ${found.name}`)
    refreshArtist(found.name, { force: true })
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

  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    if (artists.length) refreshAll()
  }, [artists.length, refreshAll])

  const ctx = useMemo(() => ({ settings, setSettings, tracked, setStatus, untrack, updateTracked, artists, followArtist, unfollowArtist, feeds, feedStatus, refreshArtist, refreshAll, navigate, notify, resetAll }),
    [settings, setSettings, tracked, setStatus, untrack, updateTracked, artists, followArtist, unfollowArtist, feeds, feedStatus, refreshArtist, refreshAll, navigate, notify, resetAll])

  const today = new Date().toISOString().slice(0, 10)
  const upcomingCount = Object.values(tracked).filter((t) => t.status !== 'attended' && (!t.event.date || t.event.date >= today)).length

  const NavLinks = ({ className, short = false }) => (
    <nav className={className} aria-label="Main">
      {TABS.map((t) => (
        <a key={t.id} href={`#/${t.id}`} onClick={(e) => { e.preventDefault(); navigate(t.id) }} aria-current={tab === t.id ? 'page' : undefined}>
          <Icon name={t.icon} size={short ? 20 : 15} />
          <span>{short ? t.short || t.label : t.label}</span>
          {t.id === 'concerts' && upcomingCount > 0 && <span className="count" aria-label={`${upcomingCount} upcoming`}>{upcomingCount}</span>}
        </a>
      ))}
    </nav>
  )

  return (
    <AppContext.Provider value={ctx}>
      <div className="app">
        <a href="#main" className="skip-link">Skip to content</a>
        <header className="header">
          <div className="header-inner">
            <a className="brand" href="#/home" onClick={(e) => { e.preventDefault(); navigate('home') }} aria-label="Encore home">
              <span className="brand-mark" aria-hidden="true"><Icon name="ticket" size={14} /></span>Encore
            </a>
            <NavLinks className="nav" />
            <div className="header-right">
              {spotify.connected ? (
                <span className="status-line" title="Spotify connected"><Icon name="music" size={14} /><span className="t">{spotify.user?.name || 'Spotify connected'}</span></span>
              ) : (
                <a className="btn btn-ghost btn-sm" href="#/artists" onClick={(e) => { e.preventDefault(); navigate('artists') }}><Icon name="music" /><span className="t">Connect Spotify</span></a>
              )}
            </div>
          </div>
        </header>
        <main className="main" id="main" tabIndex={-1}>
          {tab === 'home' && <HomeView />}
          {tab === 'discover' && <DiscoverView prefill={prefill} onPrefillConsumed={() => setPrefill(null)} />}
          {tab === 'artists' && <ArtistsView />}
          {tab === 'concerts' && <MyConcertsView />}
          {tab === 'settings' && <SettingsView />}
        </main>
        <NavLinks className="tabbar" short />
        <Toasts items={toasts} />
      </div>
    </AppContext.Provider>
  )
}
