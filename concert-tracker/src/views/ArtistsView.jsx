import { useEffect, useRef, useState } from 'react'
import { useApp } from '../context.jsx'
import EventCard from '../components/EventCard.jsx'
import { suggestArtists } from '../lib/api/index.js'
import { isPast } from '../lib/dates.js'

function ArtistCard({ artist }) {
  const { feeds, feedStatus, refreshArtist, unfollowArtist, navigate, settings } = useApp()
  const feed = feeds[artist.name.toLowerCase()]
  const status = feedStatus[artist.name.toLowerCase()]
  const [open, setOpen] = useState(false)
  const upcoming = (feed?.events || []).filter((e) => !isPast(e))
  const initial = artist.name.trim().charAt(0).toUpperCase()
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="artist-card" data-testid="artist-card">
        <div className="avatar">{initial}{artist.image && <img src={artist.image} alt="" loading="lazy" style={{ position: 'absolute', inset: 0 }} onError={(e) => { e.currentTarget.style.display = 'none' }} />}</div>
        <div style={{ minWidth: 0 }}>
          <div className="name">{artist.name}</div>
          <div className="sub">
            {status?.loading ? <span><span className="spinner" style={{ width: 11, height: 11, verticalAlign: '-2px' }} /> Checking tour dates…</span>
              : feed ? `${upcoming.length} upcoming show${upcoming.length === 1 ? '' : 's'}${feed.fetchedAt ? ` · updated ${new Date(feed.fetchedAt).toLocaleDateString()}` : ''}`
              : 'Not checked yet'}
            {status?.error && <span style={{ color: 'var(--danger)' }}> · {status.error}</span>}
          </div>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
          {upcoming.length > 0 && <button type="button" className="btn sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{open ? 'Hide' : 'Shows'}</button>}
          <button type="button" className="btn sm ghost" title="Refresh" aria-label={`Refresh ${artist.name}`} onClick={() => refreshArtist(artist.name, { force: true })} disabled={status?.loading}>↻</button>
          <button type="button" className="btn sm ghost" title="Search on Discover" aria-label={`Search ${artist.name}`} onClick={() => navigate('discover', { keyword: artist.name })}>🔍</button>
          <button type="button" className="btn sm ghost danger" title="Unfollow" aria-label={`Unfollow ${artist.name}`} onClick={() => unfollowArtist(artist.name)}>✕</button>
        </div>
      </div>
      {open && upcoming.length > 0 && (
        <div className="artist-events">
          {upcoming.slice(0, 25).map((ev) => <EventCard key={ev.id} event={ev} compact origin={settings.home} />)}
          {upcoming.length > 25 && <span className="faint small">…and {upcoming.length - 25} more. Use Discover to see them all.</span>}
        </div>
      )}
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

  useEffect(() => {
    clearTimeout(debounce.current)
    if (name.trim().length < 2 || !settings.tmKey) return
    debounce.current = setTimeout(async () => setSuggestions(await suggestArtists({ settings, keyword: name })), 400)
    return () => clearTimeout(debounce.current)
  }, [name, settings])

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
    for (const n of names) { try { await followArtist(n, { quiet: true }); ok++ } catch { /* keep going */ } }
    setAdding(false); setBulkText(''); setBulk(false)
    notify(`Following ${ok} artist${ok === 1 ? '' : 's'}`)
  }

  const anyLoading = Object.values(feedStatus).some((s) => s.loading)

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Artists you follow</h1>
          <p>Follow artists and Encore checks Bandsintown{settings.tmKey ? ' and Ticketmaster' : ''} for their tour dates. New shows appear on your Home page.</p>
        </div>
        {artists.length > 0 && <button type="button" className="btn" onClick={() => refreshAll({ force: true })} disabled={anyLoading}>{anyLoading ? <span className="spinner" /> : '↻'} Refresh all</button>}
      </div>

      <form className="card" onSubmit={(e) => { e.preventDefault(); add() }}>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="field loc-wrap" style={{ flex: 1, minWidth: 220 }}>
            <label htmlFor="artist">Artist name</label>
            <input id="artist" className="input" placeholder="e.g. Phoebe Bridgers" value={name} onChange={(e) => { setName(e.target.value); if (e.target.value.trim().length < 2) setSuggestions([]) }} autoComplete="off" />
            {suggestions.length > 0 && (
              <div className="suggest" role="listbox">
                {suggestions.map((s) => <button type="button" key={s.id} role="option" aria-selected={false} onClick={() => add(s.name)}>{s.name}<span className="sub">{[s.genre, s.upcoming !== null ? `${s.upcoming} upcoming` : null].filter(Boolean).join(' · ')}</span></button>)}
              </div>
            )}
          </div>
          <button type="submit" className="btn primary" disabled={adding || !name.trim()} style={{ height: 42 }}>{adding ? <span className="spinner" /> : 'Follow'}</button>
          <button type="button" className="btn ghost" onClick={() => setBulk((b) => !b)} style={{ height: 42 }}>{bulk ? 'Cancel' : 'Paste a list'}</button>
        </div>
        {bulk && (
          <div className="stack" style={{ marginTop: 12 }}>
            <textarea className="textarea" placeholder={'One artist per line, or comma-separated:\nThe National\nMitski\nKhruangbin'} value={bulkText} onChange={(e) => setBulkText(e.target.value)} />
            <div className="row"><button type="button" className="btn primary" onClick={addBulk} disabled={adding || !bulkText.trim()}>{adding ? <span className="spinner" /> : 'Follow all'}</button><span className="faint small">Tip: export your Spotify or Apple Music artists and paste them here.</span></div>
          </div>
        )}
      </form>

      <div className="stack" style={{ marginTop: 16 }}>
        {!artists.length && (
          <div className="empty">
            <div className="big">🎤</div>
            <h3>No artists yet</h3>
            <p>Follow a few artists and Encore will keep an eye on their tour dates for you.</p>
          </div>
        )}
        {artists.map((a) => <ArtistCard key={a.name} artist={a} />)}
      </div>
    </div>
  )
}
