import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppContext, DEFAULT_SETTINGS } from './context.jsx'
import { useStoredState } from './lib/storage.js'
import { upcomingForArtist, lookupArtist } from './lib/api/index.js'
import { handleSpotifyRedirect, spotifySession } from './lib/api/spotify.js'
import { getSupabase, describeUser, signOut as sbSignOut, finishAuthRedirect, supabaseConfigured } from './lib/api/supabase.js'
import { createStore, reconcile, SYNCED_SETTINGS, artistKey } from './lib/sync.js'
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
  const [tracked, setTracked] = useStoredState('tracked', {})
  const [artists, setArtists] = useStoredState('artists', [])
  const [feeds, setFeeds] = useStoredState('feeds', {})
  const [tombstones, setTombstones] = useStoredState('tombstones', { tracked: {}, artists: {} })
  const [account, setAccount] = useState(null)
  const [syncState, setSyncState] = useState({ status: 'idle', at: null, error: null })
  const storeRef = useRef(null)
  const latest = useRef({})
  latest.current = { tracked, artists, settings, tombstones }
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

  // Write-through to the account store when signed in; failures are surfaced once and retried on the next reconcile.
  const remote = useCallback((fn) => {
    const store = storeRef.current
    if (!store) return
    fn(store).then(() => setSyncState((s) => (s.status === 'error' ? { status: 'synced', at: Date.now(), error: null } : s)))
      .catch((e) => setSyncState({ status: 'error', at: Date.now(), error: e.message }))
  }, [])

  const setSettings = useCallback((patch) => {
    const synced = Object.keys(patch).some((k) => SYNCED_SETTINGS.includes(k))
    const stamped = synced ? { ...patch, updatedAt: Date.now() } : patch
    setStoredSettings((s) => ({ ...s, ...stamped }))
    if (synced) {
      const next = { ...latest.current.settings, ...stamped }
      remote((st) => st.saveSettings(Object.fromEntries(SYNCED_SETTINGS.filter((k) => next[k] !== undefined).map((k) => [k, next[k]])), next.updatedAt))
    }
  }, [setStoredSettings, remote])

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
    const prev = latest.current.tracked[event.id]
    const record = { ...(prev || { addedAt: Date.now(), notes: '' }), event, status, updatedAt: Date.now() }
    setTracked((t) => ({ ...t, [event.id]: record }))
    remote((s) => s.upsertTracked([[event.id, record]]))
    notify(`${{ interested: 'Saved as interested', going: 'Marked as going', attended: 'Marked as attended' }[status]}: ${event.name}`)
  }, [setTracked, notify, remote])
  const untrack = useCallback((id) => {
    setTracked((t) => { const n = { ...t }; delete n[id]; return n })
    setTombstones((tb) => ({ ...tb, tracked: { ...tb.tracked, [id]: Date.now() } }))
    remote((s) => s.deleteTracked([id]))
  }, [setTracked, setTombstones, remote])
  const updateTracked = useCallback((id, patch) => {
    const prev = latest.current.tracked[id]
    if (!prev) return
    const record = { ...prev, ...patch, updatedAt: Date.now() }
    setTracked((t) => ({ ...t, [id]: record }))
    remote((s) => s.upsertTracked([[id, record]]))
  }, [setTracked, remote])

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
    const entry = { name: found.name, image: profile?.image || found.image, upcoming: found.upcoming, spotifyUrl: profile?.spotifyUrl || null, addedAt: Date.now(), updatedAt: Date.now() }
    setArtists((list) => (list.some((a) => a.name.toLowerCase() === entry.name.toLowerCase()) ? list : [...list, entry]))
    setTombstones((tb) => { if (!tb.artists[artistKey(entry.name)]) return tb; const n = { ...tb.artists }; delete n[artistKey(entry.name)]; return { ...tb, artists: n } })
    remote((s) => s.upsertArtists([entry]))
    if (!quiet) notify(`Following ${found.name}`)
    refreshArtist(found.name, { force: true })
  }, [artists, settings, setArtists, setTombstones, notify, refreshArtist, remote])

  const unfollowArtist = useCallback((name) => {
    setArtists((list) => list.filter((a) => a.name !== name))
    setFeeds((f) => { const n = { ...f }; delete n[name.toLowerCase()]; return n })
    setTombstones((tb) => ({ ...tb, artists: { ...tb.artists, [artistKey(name)]: Date.now() } }))
    remote((s) => s.deleteArtists([artistKey(name)]))
  }, [setArtists, setFeeds, setTombstones, remote])

  const resetAll = useCallback(() => {
    Object.keys(localStorage).filter((k) => k.startsWith('encore.')).forEach((k) => localStorage.removeItem(k))
    window.location.hash = ''
    window.location.reload()
  }, [])

  // Account: Supabase session + reconcile on sign-in
  const configured = supabaseConfigured(settings)
  useEffect(() => {
    if (!configured) { setAccount(null); storeRef.current = null; return }
    let sub = null, cancelled = false
    getSupabase(settings).then((client) => {
      if (cancelled || !client) return
      client.auth.getSession().then(({ data }) => { if (!cancelled) setAccount(describeUser(data.session?.user)) })
      sub = client.auth.onAuthStateChange((event, session) => {
        setAccount(describeUser(session?.user))
        if (event === 'SIGNED_IN') { finishAuthRedirect(); setTab(tabFromHash()) }
      }).data.subscription
    }).catch((e) => notify(`Account service: ${e.message}`, 'error'))
    return () => { cancelled = true; sub?.unsubscribe() }
  }, [configured, settings.supabaseUrl, settings.supabaseAnonKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const syncNow = useCallback(async () => {
    if (!account) return
    const client = await getSupabase(latest.current.settings)
    if (!client) return
    const store = createStore(client, account.id)
    storeRef.current = store
    setSyncState((s) => ({ ...s, status: 'syncing', error: null }))
    try {
      const out = await reconcile(store, latest.current)
      setTracked(out.tracked)
      setArtists(out.artists)
      if (out.settingsFromRemote) setStoredSettings((s) => ({ ...s, ...out.settings }))
      setTombstones({ tracked: {}, artists: {} })
      setSyncState({ status: 'synced', at: Date.now(), error: null })
    } catch (e) {
      setSyncState({ status: 'error', at: Date.now(), error: e.message })
      notify(`Sync failed: ${e.message}`, 'error')
    }
  }, [account, setTracked, setArtists, setStoredSettings, setTombstones, notify])

  const lastSyncedUser = useRef(null)
  useEffect(() => {
    if (!account) { storeRef.current = null; lastSyncedUser.current = null; setSyncState({ status: 'idle', at: null, error: null }); return }
    if (lastSyncedUser.current === account.id) return
    lastSyncedUser.current = account.id
    const id = setTimeout(syncNow, 0)
    return () => clearTimeout(id)
  }, [account, syncNow])

  const signOutAccount = useCallback(async () => {
    const client = await getSupabase(latest.current.settings)
    if (client) await sbSignOut(client)
    storeRef.current = null
    setAccount(null)
    notify('Signed out. Your data stays on this device.', 'info')
  }, [notify])

  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    if (artists.length) refreshAll()
  }, [artists.length, refreshAll])

  const ctx = useMemo(() => ({ settings, setSettings, tracked, setStatus, untrack, updateTracked, artists, followArtist, unfollowArtist, feeds, feedStatus, refreshArtist, refreshAll, navigate, notify, resetAll, account, syncState, syncNow, signOutAccount }),
    [settings, setSettings, tracked, setStatus, untrack, updateTracked, artists, followArtist, unfollowArtist, feeds, feedStatus, refreshArtist, refreshAll, navigate, notify, resetAll, account, syncState, syncNow, signOutAccount])

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
              {account ? (
                <a className="btn btn-ghost btn-sm" href="#/settings" onClick={(e) => { e.preventDefault(); navigate('settings') }} title={syncState.status === 'error' ? `Sync error: ${syncState.error}` : syncState.at ? `Synced ${new Date(syncState.at).toLocaleTimeString()}` : 'Signed in'}>
                  {account.avatar ? <img src={account.avatar} alt="" width="18" height="18" style={{ borderRadius: '50%' }} /> : <Icon name="users" />}<span className="t">{account.name}</span>
                  {syncState.status === 'syncing' && <span className="spinner" aria-label="Syncing" />}
                  {syncState.status === 'error' && <Icon name="alert" size={14} style={{ color: 'var(--danger)' }} />}
                </a>
              ) : configured ? (
                <a className="btn btn-sm" href="#/settings" onClick={(e) => { e.preventDefault(); navigate('settings') }}><Icon name="users" /><span className="t">Sign in</span></a>
              ) : null}
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
