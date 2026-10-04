import { useMemo } from 'react'
import { useApp } from '../context.jsx'
import EventRow, { EventList } from '../components/EventRow.jsx'
import { Button, Empty } from '../components/ui.jsx'
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
    const announced = dedupeEvents(Object.values(feeds).flatMap((f) => f.events || [])).filter((e) => !isPast(e))
    const within = addDays(todayISO(), 180)
    const evs = announced.filter((e) => !tracked[e.id] && (!e.date || e.date <= within))
    if (settings.home) {
      evs.sort((a, b) => {
        const da = haversineKm(settings.home, a.venue) ?? 1e9, db = haversineKm(settings.home, b.venue) ?? 1e9
        const na = da <= 300 ? 0 : 1, nb = db <= 300 ? 0 : 1
        return na !== nb ? na - nb : sortKey(a) < sortKey(b) ? -1 : 1
      })
    } else evs.sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1))
    return [evs.slice(0, 8), announced.length]
  }, [feeds, tracked, settings.home])
  const loadingFeeds = Object.values(feedStatus).some((s) => s.loading)
  const empty = !trackedList.length && !artists.length
  const d = next ? daysUntil(next.event) : null

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Home</h1>
          <p>{empty ? 'Keep track of the concerts you care about. Start by searching for a show or following an artist.' : `${upcoming.length} upcoming · ${attended.length} attended · ${artists.length} artist${artists.length === 1 ? '' : 's'} followed`}</p>
        </div>
      </div>

      {empty && (
        <div className="getting-started">
          <div className="card"><span className="step">1</span><h3>Search for a show</h3><p className="muted small">Artist search works right away. Add a free Ticketmaster or SeatGeek key to search by city and distance.</p><div><Button variant="primary" size="sm" onClick={() => navigate('discover')}>Find concerts</Button></div></div>
          <div className="card"><span className="step">2</span><h3>Follow your artists</h3><p className="muted small">Type names, paste a list, or import from Spotify. Their tour dates show up here as soon as they're announced.</p><div><Button size="sm" onClick={() => navigate('artists')}>Add artists</Button></div></div>
          <div className="card"><span className="step">3</span><h3>Set your home city</h3><p className="muted small">Encore uses it as the default search area and sorts shows by distance from you.</p><div><Button size="sm" onClick={() => navigate('settings')}>Open settings</Button></div></div>
        </div>
      )}

      <div className="hero-grid">
        <div className="next-up" data-testid="next-up">
          {next ? (
            <>
              <div>
                <div className="eyebrow">Next up · {next.status === 'going' ? "You're going" : "You're interested"}</div>
                <h2>{next.event.name}</h2>
                <div className="muted">{formatEventDate(next.event)}{next.event.venue?.name ? ` · ${[next.event.venue.name, next.event.venue.city].filter(Boolean).join(', ')}` : ''}</div>
                <div className="row" style={{ marginTop: 12 }}>
                  {next.event.url && <Button as="a" href={next.event.url} target="_blank" rel="noopener noreferrer" size="sm" icon="ticket">Tickets</Button>}
                  <Button size="sm" variant="ghost" icon="arrow-right" onClick={() => navigate('concerts')}>All my concerts</Button>
                </div>
              </div>
              <div className="countdown" aria-label={d === 0 ? 'Today' : `${d} days to go`}>
                <div className="n num">{d === 0 ? 'Today' : d}</div>
                {d !== 0 && <div className="l">day{d === 1 ? '' : 's'} to go</div>}
              </div>
            </>
          ) : (
            <div>
              <div className="eyebrow">Next up</div>
              <h2>No upcoming shows tracked</h2>
              <p className="muted">Track a concert you're interested in and the countdown starts here.</p>
              <div style={{ marginTop: 12 }}><Button variant="primary" size="sm" onClick={() => navigate('discover')}>Find a show</Button></div>
            </div>
          )}
        </div>
        <div className="stats">
          <div className="stat"><div className="n num">{upcoming.length}</div><div className="l">Upcoming</div></div>
          <div className="stat"><div className="n num">{attended.length}</div><div className="l">Attended</div></div>
          <div className="stat"><div className="n num">{artists.length}</div><div className="l">Artists followed</div></div>
          <div className="stat"><div className="n num">{cities.size}</div><div className="l">{cities.size === 1 ? 'City visited' : 'Cities visited'}</div></div>
        </div>
      </div>

      {upcoming.length > 1 && (
        <div className="section">
          <div className="section-head"><h2>Coming up</h2><Button size="sm" variant="ghost" onClick={() => navigate('concerts')}>See all</Button></div>
          <EventList>{upcoming.slice(1, 5).map((t) => <EventRow key={t.event.id} event={t.event} origin={settings.home} />)}</EventList>
        </div>
      )}

      {artists.length > 0 && (
        <div className="section">
          <div className="section-head">
            <h2>From artists you follow {loadingFeeds && <span className="spinner" aria-label="Checking tour dates" style={{ marginLeft: 6 }} />}</h2>
            <span className="faint small">{settings.home ? `Shows near ${settings.home.label} first` : 'Set a home city in Settings to sort by distance'}</span>
          </div>
          {fromArtists.length ? <EventList>{fromArtists.map((e) => <EventRow key={e.id} event={e} origin={settings.home} />)}</EventList>
            : <Empty icon="calendar">{loadingFeeds ? 'Checking tour dates…' : announcedCount ? 'Every announced show from your artists is already in My concerts.' : 'No upcoming shows announced for the artists you follow in the next six months.'}</Empty>}
        </div>
      )}
    </div>
  )
}
