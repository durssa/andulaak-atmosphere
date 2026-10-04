import { useRef, useState } from 'react'
import { useApp } from '../context.jsx'
import { Button, Field, Icon, Notice } from '../components/ui.jsx'
import { searchEvents as tmSearch } from '../lib/api/ticketmaster.js'
import { searchEvents as sgSearch } from '../lib/api/seatgeek.js'
import { loadGoogleMaps } from '../lib/api/googleMaps.js'
import { geocode, reverseGeocode } from '../lib/api/index.js'
import { getCurrentPosition } from '../lib/geo.js'
import { exportAllData, importAllData } from '../lib/storage.js'
import { beginSpotifyLogin, spotifyLogout, spotifyRedirectUri, spotifySession } from '../lib/api/spotify.js'
import { getSupabase, signInWithEmail, signInWithProvider, supabaseConfigured, authRedirectUri } from '../lib/api/supabase.js'

function KeyField({ id, label, value, onChange, placeholder, help }) {
  const [show, setShow] = useState(false)
  return (
    <Field label={label} id={id} help={help}>
      <div className="input-group">
        <input id={id} className="input" type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value.trim())} placeholder={placeholder} autoComplete="off" spellCheck={false} />
        <Button variant="ghost" icon={show ? 'eye-off' : 'eye'} aria-label={show ? 'Hide key' : 'Show key'} aria-pressed={show} onClick={() => setShow((s) => !s)} />
      </div>
    </Field>
  )
}

function TestResult({ r }) {
  if (!r || r.loading) return null
  return <span className={`status-line ${r.ok ? 'ok' : 'err'}`} role="status"><Icon name={r.ok ? 'check-circle' : 'alert'} size={14} />{r.text}</span>
}

function AccountSection() {
  const { settings, setSettings, notify, account, syncState, syncNow, signOutAccount } = useApp()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const configured = supabaseConfigured(settings)
  const [showSetup, setShowSetup] = useState(!configured)

  const withClient = async (fn) => {
    setBusy(true)
    try { const c = await getSupabase(settings); if (!c) throw new Error('Account service is not configured'); await fn(c) } catch (e) { notify(e.message, 'error') } finally { setBusy(false) }
  }
  const sendLink = () => withClient(async (c) => { await signInWithEmail(c, email.trim()); setSent(true) })

  return (
    <section className="card" aria-labelledby="s-account">
      <div className="card-head"><h2 id="s-account">Account and sync</h2>{account ? <span className="tag tag-success">Signed in</span> : configured ? <span className="tag">Signed out</span> : <span className="tag">Device only</span>}</div>
      {account ? (
        <>
          <div className="row" style={{ marginBottom: 10 }}>
            <span className="avatar sm" aria-hidden="true">{account.name.charAt(0).toUpperCase()}{account.avatar && <img src={account.avatar} alt="" />}</span>
            <div><div style={{ fontWeight: 600 }}>{account.name}</div><div className="faint small">{account.email || account.provider}</div></div>
          </div>
          <p className="muted small" style={{ marginBottom: 10 }}>Your tracked concerts, followed artists and preferences are saved to your account and kept in sync on every device you sign in on. API keys stay on this device only.</p>
          <div className="row">
            <Button size="sm" icon="refresh" onClick={syncNow} loading={syncState.status === 'syncing'}>Sync now</Button>
            <Button size="sm" variant="ghost" icon="log-out" onClick={signOutAccount}>Sign out</Button>
            <span className={`status-line ${syncState.status === 'error' ? 'err' : syncState.status === 'synced' ? 'ok' : ''}`} role="status">
              {syncState.status === 'error' ? <><Icon name="alert" size={14} />{syncState.error}</> : syncState.at ? <><Icon name="check-circle" size={14} />Synced {new Date(syncState.at).toLocaleTimeString()}</> : null}
            </span>
          </div>
        </>
      ) : configured ? (
        <>
          <p className="muted small" style={{ marginBottom: 12 }}>Sign in to keep your concerts and artists across devices. What's on this device is merged into your account the first time you sign in.</p>
          <Field label="Email" id="acct-email" help={sent ? `Check ${email} for a sign-in link.` : 'We send a one-time sign-in link. No password needed.'}>
            <div className="input-group">
              <input id="acct-email" className="input" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => { setEmail(e.target.value); setSent(false) }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendLink() } }} />
              <Button variant="primary" onClick={sendLink} loading={busy} disabled={!/.+@.+\..+/.test(email)}>Send link</Button>
            </div>
          </Field>
          <div className="row" style={{ marginTop: 12 }}>
            <Button size="sm" icon="globe" onClick={() => withClient((c) => signInWithProvider(c, 'google'))} disabled={busy}>Continue with Google</Button>
            <Button size="sm" icon="music" onClick={() => withClient((c) => signInWithProvider(c, 'spotify'))} disabled={busy}>Continue with Spotify</Button>
          </div>
          <p className="help" style={{ marginTop: 8 }}>Google and Spotify sign-in only work once those providers are enabled in your Supabase project.</p>
        </>
      ) : (
        <p className="muted small">Without an account service, everything is saved in this browser only. Export a backup below to move it to another device, or set up sync.</p>
      )}
      <div className="divider" />
      <button type="button" className="link-btn small" onClick={() => setShowSetup((v) => !v)} aria-expanded={showSetup}>{showSetup ? 'Hide' : 'Show'} sync service setup</button>
      {showSetup && (
        <div className="stack" style={{ marginTop: 10 }}>
          <p className="muted small">Encore syncs through a <a href="https://supabase.com/" target="_blank" rel="noopener noreferrer">Supabase</a> project you own (free tier is plenty). Create a project, run <code>supabase/schema.sql</code> from the repository in its SQL editor, add <code>{authRedirectUri()}</code> to Authentication → URL configuration → Redirect URLs, then paste the project URL and anon key here. The anon key is safe to share; row-level security keeps each person's rows private.</p>
          <Field label="Project URL" id="sbUrl"><input id="sbUrl" className="input" placeholder="https://xxxx.supabase.co" value={settings.supabaseUrl} onChange={(e) => setSettings({ supabaseUrl: e.target.value.trim() })} autoComplete="off" spellCheck={false} /></Field>
          <KeyField id="sbKey" label="Anon key" value={settings.supabaseAnonKey} onChange={(v) => setSettings({ supabaseAnonKey: v })} placeholder="eyJ…" />
        </div>
      )}
    </section>
  )
}

export default function SettingsView() {
  const { settings, setSettings, notify, resetAll } = useApp()
  const [tmTest, setTmTest] = useState(null)
  const [sgTest, setSgTest] = useState(null)
  const [gmTest, setGmTest] = useState(null)
  const [homeQuery, setHomeQuery] = useState(settings.home?.label || '')
  const [busy, setBusy] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [session, setSession] = useState(spotifySession)
  const fileRef = useRef(null)

  const testTm = async () => {
    setTmTest({ loading: true })
    try { const r = await tmSearch({ apiKey: settings.tmKey, keyword: 'music', size: 1 }); setTmTest({ ok: true, text: `Connected. ${r.page.totalElements.toLocaleString()} music events available.` }) } catch (e) { setTmTest({ ok: false, text: e.message }) }
  }
  const testSg = async () => {
    setSgTest({ loading: true })
    try { const r = await sgSearch({ clientId: settings.sgClientId, keyword: 'concert', perPage: 1 }); setSgTest({ ok: true, text: `Connected. ${r.page.totalElements.toLocaleString()} concerts available.` }) } catch (e) { setSgTest({ ok: false, text: e.message }) }
  }
  const testGm = async () => {
    setGmTest({ loading: true })
    try { await loadGoogleMaps(settings.gmKey); setGmTest({ ok: true, text: 'Google Maps loaded. Maps now use Google.' }) } catch (e) { setGmTest({ ok: false, text: e.message }) }
  }
  const setHome = async () => {
    if (!homeQuery.trim()) { setSettings({ home: null }); notify('Home location cleared'); return }
    setBusy(true)
    try {
      const [first] = await geocode(homeQuery)
      if (!first) { notify(`No place called "${homeQuery}" was found.`, 'error'); return }
      const home = { label: first.short || first.label, lat: first.lat, lng: first.lng }
      setSettings({ home }); setHomeQuery(home.label); notify(`Home set to ${home.label}`)
    } catch (e) { notify(e.message, 'error') } finally { setBusy(false) }
  }
  const homeFromGps = async () => {
    setBusy(true)
    try { const pos = await getCurrentPosition(); const label = await reverseGeocode(pos); setSettings({ home: { label, lat: pos.lat, lng: pos.lng } }); setHomeQuery(label); notify(`Home set to ${label}`) } catch (e) { notify(e.message, 'error') } finally { setBusy(false) }
  }
  const doExport = () => {
    const blob = new Blob([JSON.stringify(exportAllData(), null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `encore-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  const doImport = (file) => {
    const reader = new FileReader()
    reader.onload = () => { try { importAllData(JSON.parse(reader.result)); notify('Backup imported. Reloading…'); setTimeout(() => window.location.reload(), 600) } catch (e) { notify(e.message, 'error') } }
    reader.readAsText(file)
  }
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); notify('Copied') } catch { notify('Copy failed. Select the text and copy it manually.', 'error') } }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Keys are stored only in this browser and sent directly to the provider they belong to. Encore has no server.</p>
        </div>
      </div>
      <div className="settings-grid">
        <div className="stack">
          <section className="card" aria-labelledby="s-tm">
            <div className="card-head"><h2 id="s-tm">Ticketmaster</h2>{settings.tmKey ? <span className="tag tag-success">Configured</span> : <span className="tag">Not configured</span>}</div>
            <p className="muted small" style={{ marginBottom: 12 }}>Search by city and distance, prices, genres and ticket status. The free tier allows 5,000 calls a day. <a href="https://developer.ticketmaster.com/products-and-docs/apis/getting-started/" target="_blank" rel="noopener noreferrer">Get a key</a>, then paste the app's Consumer Key below.</p>
            <KeyField id="tmKey" label="Consumer key" value={settings.tmKey} onChange={(v) => { setSettings({ tmKey: v }); setTmTest(null) }} placeholder="Paste your Ticketmaster key" />
            <div className="row" style={{ marginTop: 10 }}><Button size="sm" onClick={testTm} disabled={!settings.tmKey} loading={tmTest?.loading}>Test connection</Button><TestResult r={tmTest} /></div>
          </section>

          <section className="card" aria-labelledby="s-sg">
            <div className="card-head"><h2 id="s-sg">SeatGeek</h2>{settings.sgClientId ? <span className="tag tag-success">Configured</span> : <span className="tag">Not configured</span>}</div>
            <p className="muted small" style={{ marginBottom: 12 }}>A second source for location search and ticket prices, including resale listings. <a href="https://seatgeek.com/account/develop" target="_blank" rel="noopener noreferrer">Register an app</a> and paste its client id.</p>
            <KeyField id="sgClientId" label="Client id" value={settings.sgClientId} onChange={(v) => { setSettings({ sgClientId: v }); setSgTest(null) }} placeholder="Paste your SeatGeek client id" />
            <div className="row" style={{ marginTop: 10 }}><Button size="sm" onClick={testSg} disabled={!settings.sgClientId} loading={sgTest?.loading}>Test connection</Button><TestResult r={sgTest} /></div>
          </section>

          <section className="card" aria-labelledby="s-sp">
            <div className="card-head"><h2 id="s-sp">Spotify</h2>{session.connected ? <span className="tag tag-success">Connected</span> : <span className="tag">Not connected</span>}</div>
            <p className="muted small" style={{ marginBottom: 12 }}>Import the artists you follow and your top artists. Create an app in the <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer">Spotify developer dashboard</a>, add the redirect URI below to it, and paste the Client ID.</p>
            <Field label="Client ID" id="spotifyClientId">
              <input id="spotifyClientId" className="input" value={settings.spotifyClientId} onChange={(e) => setSettings({ spotifyClientId: e.target.value.trim() })} placeholder="32-character client id" autoComplete="off" spellCheck={false} />
            </Field>
            <div className="field" style={{ marginTop: 10 }}>
              <span className="label">Redirect URI to register</span>
              <div className="row"><code>{spotifyRedirectUri()}</code><Button size="sm" variant="ghost" icon="copy" aria-label="Copy redirect URI" onClick={() => copy(spotifyRedirectUri())} /></div>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              {session.connected ? (
                <><span className="small muted">{session.user?.name ? `Signed in as ${session.user.name}` : 'Connected'}</span><Button size="sm" icon="log-out" onClick={() => { spotifyLogout(); setSession(spotifySession()); notify('Disconnected from Spotify') }}>Disconnect</Button></>
              ) : (
                <Button size="sm" variant="primary" icon="music" disabled={!settings.spotifyClientId} onClick={() => beginSpotifyLogin(settings.spotifyClientId).catch((e) => notify(e.message, 'error'))}>Connect Spotify</Button>
              )}
            </div>
          </section>

          <section className="card" aria-labelledby="s-gm">
            <div className="card-head"><h2 id="s-gm">Google Maps</h2>{settings.gmKey ? <span className="tag tag-success">Configured</span> : <span className="tag">Using OpenStreetMap</span>}</div>
            <p className="muted small" style={{ marginBottom: 12 }}>Optional. With a key, maps and geocoding use Google Maps; without one, Encore uses OpenStreetMap. Enable the Maps JavaScript API and Geocoding API, and restrict the key to this site's address. <a href="https://developers.google.com/maps/documentation/javascript/get-api-key" target="_blank" rel="noopener noreferrer">Get a key</a></p>
            <KeyField id="gmKey" label="API key" value={settings.gmKey} onChange={(v) => { setSettings({ gmKey: v }); setGmTest(null) }} placeholder="AIza…" />
            <div className="row" style={{ marginTop: 10 }}><Button size="sm" onClick={testGm} disabled={!settings.gmKey} loading={gmTest?.loading}>Test key</Button><TestResult r={gmTest} /></div>
            <Field label="Map provider" id="mapProvider" className="field" >
              <select id="mapProvider" className="select" value={settings.mapProvider} onChange={(e) => setSettings({ mapProvider: e.target.value })} style={{ marginTop: 4 }}>
                <option value="auto">Google Maps when a key is set</option>
                <option value="leaflet">Always OpenStreetMap</option>
              </select>
            </Field>
          </section>
        </div>

        <div className="stack">
          <AccountSection />
          <section className="card" aria-labelledby="s-home">
            <div className="card-head"><h2 id="s-home">Location and units</h2></div>
            <Field label="Home city" id="home" help={settings.home ? `Saved: ${settings.home.label}. Used as the default search area and to sort shows by distance.` : 'Used as the default search area and to sort shows by distance.'}>
              <div className="input-group">
                <input id="home" className="input" placeholder="City where you live" value={homeQuery} onChange={(e) => setHomeQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setHome() } }} />
                <Button icon="crosshair" aria-label="Use my current location" title="Use my current location" onClick={homeFromGps} disabled={busy} />
                <Button onClick={setHome} loading={busy}>Save</Button>
              </div>
            </Field>
            <div className="grid grid-3" style={{ marginTop: 14 }}>
              <Field label="Distance units" id="units"><select id="units" className="select" value={settings.units} onChange={(e) => setSettings({ units: e.target.value })}><option value="km">Kilometres</option><option value="mi">Miles</option></select></Field>
              <Field label="Default distance" id="radius"><select id="radius" className="select" value={settings.defaultRadiusKm} onChange={(e) => setSettings({ defaultRadiusKm: Number(e.target.value) })}>{[10, 25, 50, 100, 250, 500].map((k) => <option key={k} value={k}>{settings.units === 'mi' ? `${Math.round(k * 0.621)} mi` : `${k} km`}</option>)}</select></Field>
              <Field label="Appearance" id="theme"><select id="theme" className="select" value={settings.theme} onChange={(e) => setSettings({ theme: e.target.value })}><option value="system">Match system</option><option value="light">Light</option><option value="dark">Dark</option></select></Field>
            </div>
          </section>

          <section className="card" aria-labelledby="s-bit">
            <div className="card-head"><h2 id="s-bit">Bandsintown</h2><span className="tag tag-success">No key needed</span></div>
            <p className="muted small" style={{ marginBottom: 12 }}>Used for artist tour dates. The app id only identifies this app to Bandsintown; change it if you have your own.</p>
            <Field label="App id" id="bit"><input id="bit" className="input" value={settings.bitAppId} onChange={(e) => setSettings({ bitAppId: e.target.value.trim() || 'encore-concert-tracker' })} /></Field>
          </section>

          <section className="card" aria-labelledby="s-data">
            <div className="card-head"><h2 id="s-data">Your data</h2></div>
            <p className="muted small" style={{ marginBottom: 12 }}>Export a backup of your tracked concerts, followed artists and settings, or restore one. Clearing removes everything from this browser only; an account keeps its own copy.</p>
            <div className="row">
              <Button size="sm" icon="download" onClick={doExport}>Export backup</Button>
              <Button size="sm" icon="upload" onClick={() => fileRef.current?.click()}>Import backup</Button>
              <input ref={fileRef} type="file" accept="application/json" className="sr-only" aria-label="Choose a backup file" onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
              <Button size="sm" variant="danger" icon="trash" onClick={() => setConfirmReset(true)}>Clear everything</Button>
            </div>
            {confirmReset && (
              <Notice tone="danger" className="toolbar">
                <div>This deletes all tracked concerts, artists and settings from this browser. It cannot be undone.</div>
                <div className="row" style={{ marginTop: 8 }}><Button size="sm" variant="danger" onClick={resetAll}>Yes, delete everything</Button><Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>Cancel</Button></div>
              </Notice>
            )}
          </section>

          <section className="card" aria-labelledby="s-about">
            <div className="card-head"><h2 id="s-about">About</h2></div>
            <dl className="kv">
              <dt>Concert data</dt><dd><a href="https://developer.ticketmaster.com/" target="_blank" rel="noopener noreferrer">Ticketmaster Discovery API</a>, <a href="https://platform.seatgeek.com/" target="_blank" rel="noopener noreferrer">SeatGeek Platform</a>, <a href="https://www.bandsintown.com/" target="_blank" rel="noopener noreferrer">Bandsintown</a></dd>
              <dt>Music library</dt><dd><a href="https://developer.spotify.com/" target="_blank" rel="noopener noreferrer">Spotify Web API</a></dd>
              <dt>Maps</dt><dd><a href="https://developers.google.com/maps" target="_blank" rel="noopener noreferrer">Google Maps Platform</a>, <a href="https://leafletjs.com/" target="_blank" rel="noopener noreferrer">Leaflet</a> with <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> and <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a> tiles</dd>
              <dt>Geocoding</dt><dd>Google Geocoding with a key, otherwise <a href="https://nominatim.org/" target="_blank" rel="noopener noreferrer">Nominatim</a></dd>
              <dt>Version</dt><dd>{__APP_VERSION__}</dd>
            </dl>
          </section>
        </div>
      </div>
    </div>
  )
}
