import { useEffect, useRef, useState } from 'react'
import { useApp } from '../context.jsx'
import EventRow, { EventList } from '../components/EventRow.jsx'
import { Button, Empty, Icon, Notice } from '../components/ui.jsx'
import { suggestArtists } from '../lib/api/index.js'
import { isPast } from '../lib/dates.js'
import { beginSpotifyLogin, getFollowedArtists, getTopArtists, searchSpotifyArtists, spotifySession, spotifyLogout } from '../lib/api/spotify.js'

function ArtistRow({ artist }) {
  const { feeds, feedStatus, refreshArtist, unfollowArtist, navigate, settings } = useApp()
  const key = artist.name.toLowerCase()
  const feed = feeds[key], status = feedStatus[key]
  const [open, setOpen] = useState(false)
  const upcoming = (feed?.events || []).filter((e) => !isPast(e))
  return (
    <>
      <div className="artist-row" data-testid="artist-card">
        <div className="avatar" aria-hidden="true">{artist.name.trim().charAt(0).toUpperCase()}{artist.image && <img src={artist.image} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none' }} />}</div>
        <div style={{ minWidth: 0 }}>
          <div className="artist-name">{artist.name} {artist.spotifyUrl && <a href={artist.spotifyUrl} target="_blank" rel="noopener noreferrer" className="faint small" aria-label={`${artist.name} on Spotify`}><Icon name="external" size={12} /></a>}</div>
          <div className="artist-sub">
            {status?.loading ? 'Checking tour dates…' : feed ? `${upcoming.length} upcoming show${upcoming.length === 1 ? '' : 's'}` : 'Not checked yet'}
            {feed?.fetchedAt && !status?.loading ? ` · updated ${new Date(feed.fetchedAt).toLocaleDateString()}` : ''}
            {status?.error && <span style={{ color: 'var(--danger)' }}> · {status.error}</span>}
          </div>
        </div>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          {upcoming.length > 0 && <Button size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open} icon={open ? 'chevron-down' : 'calendar'}>{open ? 'Hide' : 'Shows'}</Button>}
          <Button size="sm" variant="ghost" icon="refresh" aria-label={`Refresh ${artist.name}`} title="Refresh" onClick={() => refreshArtist(artist.name, { force: true })} loading={status?.loading} />
          <Button size="sm" variant="ghost" icon="search" aria-label={`Search concerts for ${artist.name}`} title="Search" onClick={() => navigate('discover', { keyword: artist.name })} />
          <Button size="sm" variant="ghost" icon="x" aria-label={`Unfollow ${artist.name}`} title="Unfollow" onClick={() => unfollowArtist(artist.name)} />
        </div>
      </div>
      {open && upcoming.length > 0 && (
        <div className="artist-shows">
          <EventList>{upcoming.slice(0, 25).map((ev) => <EventRow key={ev.id} event={ev} origin={settings.home} />)}</EventList>
          {upcoming.length > 25 && <p className="faint small" style={{ marginTop: 6 }}>Showing 25 of {upcoming.length}. Use Find concerts to see all of them.</p>}
        </div>
      )}
    </>
  )
}

function SpotifyPanel() {
  const { settings, artists, followArtist, notify, navigate } = useApp()
  const [session, setSession] = useState(spotifySession)
  const [source, setSource] = useState('followed')
  const [list, setList] = useState(null)
  const [loading, setLoading] = useState(false)
  const [chosen, setChosen] = useState(() => new Set())
  const [importing, setImporting] = useState(false)
  const known = new Set(artists.map((a) => a.name.toLowerCase()))

  const load = async (src) => {
    setLoading(true); setList(null)
    try {
      const items = src === 'followed' ? await getFollowedArtists(settings.spotifyClientId) : await getTopArtists(settings.spotifyClientId, src)
      setList(items); setChosen(new Set(items.filter((a) => !known.has(a.name.toLowerCase())).map((a) => a.id)))
    } catch (e) { notify(e.message, 'error'); if (e.status === 401) setSession(spotifySession()) } finally { setLoading(false) }
  }
  useEffect(() => {
    if (!session.connected) return
    const id = setTimeout(() => load(source), 0)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.connected, source])

  const importChosen = async () => {
    setImporting(true)
    let n = 0
    for (const a of list.filter((x) => chosen.has(x.id))) {
      try { await followArtist(a.name, { quiet: true, profile: { image: a.image, spotifyUrl: a.url } }); n++ } catch { /* continue */ }
    }
    setImporting(false)
    notify(`Added ${n} artist${n === 1 ? '' : 's'} from Spotify`)
    setChosen(new Set())
  }

  if (!settings.spotifyClientId) {
    return <Notice tone="info">Connect Spotify to import the artists you follow and your most-played artists. <button type="button" className="link-btn" onClick={() => navigate('settings')}>Set up Spotify in Settings</button></Notice>
  }
  if (!session.connected) {
    return (
      <div className="card">
        <div className="card-head"><h2>Import from Spotify</h2></div>
        <p className="muted small" style={{ marginBottom: 12 }}>Sign in with Spotify to bring in the artists you follow and your top artists. Encore only reads your library; it never posts or changes anything.</p>
        <Button variant="primary" icon="music" onClick={() => beginSpotifyLogin(settings.spotifyClientId).catch((e) => notify(e.message, 'error'))}>Connect Spotify</Button>
      </div>
    )
  }
  const selectable = (list || []).filter((a) => !known.has(a.name.toLowerCase()))
  return (
    <div className="card">
      <div className="card-head">
        <h2>Import from Spotify</h2>
        <div className="row"><span className="faint small">{session.user?.name ? `Signed in as ${session.user.name}` : 'Connected'}</span><Button size="sm" variant="ghost" icon="log-out" onClick={() => { spotifyLogout(); setSession(spotifySession()); setList(null) }}>Disconnect</Button></div>
      </div>
      <div className="row" style={{ marginBottom: 10 }}>
        <label htmlFor="sp-source" className="label">Show</label>
        <select id="sp-source" className="select" style={{ width: 'auto' }} value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="followed">Artists I follow</option>
          <option value="short_term">Top artists · last 4 weeks</option>
          <option value="medium_term">Top artists · last 6 months</option>
          <option value="long_term">Top artists · all time</option>
        </select>
        {list && <span className="faint small">{list.length} found · {list.length - selectable.length} already followed</span>}
      </div>
      {loading && <p className="muted small"><span className="spinner" aria-hidden="true" /> Loading from Spotify…</p>}
      {list && !loading && (selectable.length ? (
        <>
          <div className="check-list" role="group" aria-label="Artists to import">
            {selectable.map((a) => (
              <label key={a.id}>
                <input type="checkbox" checked={chosen.has(a.id)} onChange={(e) => setChosen((s) => { const n = new Set(s); e.target.checked ? n.add(a.id) : n.delete(a.id); return n })} />
                <span className="avatar sm" aria-hidden="true">{a.name.charAt(0)}{a.image && <img src={a.image} alt="" loading="lazy" />}</span>
                <span style={{ minWidth: 0 }}><span className="artist-name" style={{ display: 'block' }}>{a.name}</span>{a.genres?.length > 0 && <span className="faint tiny">{a.genres.slice(0, 3).join(', ')}</span>}</span>
              </label>
            ))}
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <Button variant="primary" onClick={importChosen} loading={importing} disabled={!chosen.size}>Follow {chosen.size} selected</Button>
            <Button variant="ghost" onClick={() => setChosen(new Set(selectable.map((a) => a.id)))}>Select all</Button>
            <Button variant="ghost" onClick={() => setChosen(new Set())}>Clear</Button>
          </div>
        </>
      ) : <p className="muted small">Everything here is already in your list.</p>)}
    </div>
  )
}

export default function ArtistsView() {
  const { artists, followArtist, settings, refreshAll, feedStatus, notify } = useApp()
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [bulk, setBulk] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const debounce = useRef(null)
  const spotifyOn = spotifySession().connected

  useEffect(() => {
    clearTimeout(debounce.current)
    if (name.trim().length < 2) return
    debounce.current = setTimeout(async () => {
      try {
        const items = spotifyOn ? (await searchSpotifyArtists(name, settings.spotifyClientId)).map((a) => ({ id: a.id, name: a.name, sub: a.genres.slice(0, 2).join(', ') })) : (await suggestArtists({ settings, keyword: name })).map((a) => ({ id: a.id, name: a.name, sub: a.genre }))
        setSuggestions(items)
      } catch { setSuggestions([]) }
    }, 350)
    return () => clearTimeout(debounce.current)
  }, [name, settings, spotifyOn])

  const add = async (n) => {
    const v = (n ?? name).trim()
    if (!v) return
    setAdding(true); setSuggestions([])
    try { await followArtist(v); setName('') } catch (e) { notify(e.message, 'error') } finally { setAdding(false) }
  }
  const addBulk = async () => {
    const names = bulkText.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean)
    if (!names.length) return
    setAdding(true)
    let ok = 0
    for (const n of names) { try { await followArtist(n, { quiet: true }); ok++ } catch { /* continue */ } }
    setAdding(false); setBulkText(''); setBulk(false)
    notify(`Following ${ok} artist${ok === 1 ? '' : 's'}`)
  }
  const anyLoading = Object.values(feedStatus).some((s) => s.loading)

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Artists</h1>
          <p>Follow artists and Encore checks Bandsintown{settings.tmKey ? ', Ticketmaster' : ''}{settings.sgClientId ? ', SeatGeek' : ''} for their tour dates. New shows appear on your Home page.</p>
        </div>
        {artists.length > 0 && <Button icon="refresh" onClick={() => refreshAll({ force: true })} loading={anyLoading}>Refresh all</Button>}
      </div>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <form className="card" onSubmit={(e) => { e.preventDefault(); add() }}>
          <div className="card-head"><h2>Follow an artist</h2><Button size="sm" variant="ghost" onClick={() => setBulk((b) => !b)}>{bulk ? 'Single artist' : 'Paste a list'}</Button></div>
          {bulk ? (
            <div className="stack">
              <div className="field"><label htmlFor="bulk">Artists, one per line or comma-separated</label><textarea id="bulk" className="textarea" placeholder={'The National\nMitski\nKhruangbin'} value={bulkText} onChange={(e) => setBulkText(e.target.value)} /></div>
              <div><Button variant="primary" onClick={addBulk} loading={adding} disabled={!bulkText.trim()}>Follow all</Button></div>
            </div>
          ) : (
            <div className="field suggest-wrap">
              <label htmlFor="artist">Artist name</label>
              <div className="input-group">
                <input id="artist" className="input" placeholder="e.g. Phoebe Bridgers" value={name} onChange={(e) => { setName(e.target.value); if (e.target.value.trim().length < 2) setSuggestions([]) }} autoComplete="off" />
                <Button type="submit" variant="primary" loading={adding} disabled={!name.trim()}>Follow</Button>
              </div>
              {suggestions.length > 0 && (
                <ul className="suggest" role="listbox" aria-label="Artist suggestions">
                  {suggestions.map((s) => <li key={s.id} role="none"><button type="button" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => add(s.name)}>{s.name}{s.sub && <span className="sub">{s.sub}</span>}</button></li>)}
                </ul>
              )}
              <span className="help">{spotifyOn ? 'Suggestions from Spotify.' : settings.tmKey ? 'Suggestions from Ticketmaster.' : 'Connect Spotify or add a Ticketmaster key for suggestions as you type.'}</span>
            </div>
          )}
        </form>
        <SpotifyPanel />
      </div>

      <div className="section">
        <div className="section-head"><h2>Following <span className="faint">({artists.length})</span></h2></div>
        {!artists.length ? <Empty icon="mic" title="No artists yet">Follow a few artists and Encore keeps an eye on their tour dates for you.</Empty> : (
          <div className="panel">{artists.map((a) => <ArtistRow key={a.name} artist={a} />)}</div>
        )}
      </div>
    </div>
  )
}
