import { useMemo } from 'react'
import { useApp } from '../context.jsx'
import EventCard from '../components/EventCard.jsx'
import { isPast, daysUntil, formatEventDate, sortKey, todayISO, addDays } from '../lib/dates.js'
import { haversineKm } from '../lib/geo.js'
import { dedupeEvents } from '../lib/normalize.js'

export default function HomeView() {
  const { tracked, artists, feeds, settings, navigate, feedStatus } = useApp()
  const trackedList = useMemo(() => Object.values(tracked), [tracked])
  const upcoming = useMemo(() => trackedList.filter((t) => !isPast(t.event) && t.status !== 'attended').sort((a, b) => (sortKey(a.event) < sortKey(b.event) ? -1 : 1)), [trackedList])
  const attended = trackedList.filter((t) => t.status === 'attended' || (isPast(t.event) && t.status === 'going'))
  const next = upcoming[0]
  const cities = new Set(attended.map((t) => t.event.venue?.city).filter(Boolean))

  const [fromArtists, announcedCount] = useMemo(() => {
    const all = Object.values(feeds).flatMap((f) => f.events || [])
    const within = addDays(todayISO(), 180)
    const announced = dedupeEvents(all).filter((e) => !isPast(e))
    const evs = announced.filter((e) => !tracked[e.id] && (!e.date || e.date <= within))
    if (settings.home) {
      evs.sort((a, b) => {
        const da = haversineKm(settings.home, a.venue) ?? 1e9, db = haversineKm(settings.home, b.venue) ?? 1e9
        // Near shows first, then by date.
        const na = da <= 300 ? 0 : 1, nb = db <= 300 ? 0 : 1
        return na !== nb ? na - nb : sortKey(a) < sortKey(b) ? -1 : 1
      })
    } else evs.sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1))
    return [evs.slice(0, 8), announced.length]
  }, [feeds, tracked, settings.home])

  const loadingFeeds = Object.values(feedStatus).filter((s) => s.loading).length
  const empty = !trackedList.length && !artists.length

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{greeting()}</h1>
          <p>{empty ? 'Encore keeps track of the concerts you care about. Start by searching for a show or following an artist.' : `${upcoming.length} upcoming · ${attended.length} attended · ${artists.length} artist${artists.length === 1 ? '' : 's'} followed`}</p>
        </div>
      </div>

      {empty && (
        <div className="grid cols-3" style={{ marginBottom: 24 }}>
          <div className="card"><h3>🔍 Discover</h3><p className="muted small">Search any artist with no setup — Bandsintown is free. Add a Ticketmaster key to search by city and distance.</p><button className="btn primary sm" onClick={() => navigate('discover')}>Search concerts</button></div>
          <div className="card"><h3>🎤 Follow artists</h3><p className="muted small">Follow your favourites and their tour dates show up here as soon as they're announced.</p><button className="btn sm" onClick={() => navigate('artists')}>Add artists</button></div>
          <div className="card"><h3>🗺️ Map it</h3><p className="muted small">Every result lands on an OpenStreetMap map. Paste a Google Maps key in Settings to switch to Google Maps.</p><button className="btn sm" onClick={() => navigate('settings')}>Open settings</button></div>
        </div>
      )}

      <div className="hero">
        <div className="next-up" data-testid="next-up">
          {next?.event.image && <div className="bg" style={{ backgroundImage: `url(${next.event.image})` }} />}
          {next ? (
            <>
              <div className="eyebrow">Next up · {next.status === 'going' ? "You're going" : "You're interested"}</div>
              <h2>{next.event.name}</h2>
              <div className="muted">{formatEventDate(next.event)} · {[next.event.venue?.name, next.event.venue?.city].filter(Boolean).join(', ')}</div>
              <Countdown ev={next.event} />
              <div className="row" style={{ marginTop: 8 }}>
                {next.event.url && <a className="btn sm" href={next.event.url} target="_blank" rel="noopener noreferrer">🎫 Tickets</a>}
                <button className="btn sm ghost" onClick={() => navigate('concerts')}>All my concerts →</button>
              </div>
            </>
          ) : (
            <>
              <div className="eyebrow">Next up</div>
              <h2>No upcoming shows tracked</h2>
              <p className="muted">Track a concert you're interested in and the countdown starts here.</p>
              <button className="btn primary sm" onClick={() => navigate('discover')}>Find a show</button>
            </>
          )}
        </div>
        <div className="stats">
          <Stat n={upcoming.length} l="Upcoming" />
          <Stat n={attended.length} l="Attended" />
          <Stat n={artists.length} l="Artists followed" />
          <Stat n={cities.size} l={cities.size === 1 ? 'City visited' : 'Cities visited'} />
        </div>
      </div>

      {upcoming.length > 1 && (
        <div className="section">
          <div className="section-head"><h2>Coming up</h2><button className="btn xs ghost" onClick={() => navigate('concerts')}>See all</button></div>
          <div className="grid cols-2">{upcoming.slice(1, 5).map((t) => <EventCard key={t.event.id} event={t.event} origin={settings.home} />)}</div>
        </div>
      )}

      {artists.length > 0 && (
        <div className="section">
          <div className="section-head">
            <h2>From artists you follow {loadingFeeds ? <span className="spinner" style={{ marginLeft: 8 }} /> : null}</h2>
            <span className="faint small">{settings.home ? `Shows near ${settings.home.label} first` : 'Set a home location in Settings to sort by distance'}</span>
          </div>
          {fromArtists.length ? (
            <div className="grid cols-2">{fromArtists.map((e) => <EventCard key={e.id} event={e} origin={settings.home} />)}</div>
          ) : (
            <div className="empty"><p>{loadingFeeds ? 'Checking tour dates…' : announcedCount ? "Every announced show from your artists is already in My Concerts — nice." : 'No upcoming shows announced for the artists you follow (next 6 months). Try refreshing on the Artists page.'}</p></div>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ n, l }) { return <div className="stat"><div className="n mono">{n}</div><div className="l">{l}</div></div> }

function Countdown({ ev }) {
  const d = daysUntil(ev)
  if (d === null) return null
  if (d === 0) return <div className="countdown">Tonight!</div>
  return <div className="countdown mono">{d}<small>day{d === 1 ? '' : 's'} to go</small></div>
}

function greeting() {
  const h = new Date().getHours()
  return h < 5 ? 'Still up?' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

