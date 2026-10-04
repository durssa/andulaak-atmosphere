import { useMemo, useState } from 'react'
import { useApp, STATUSES } from '../context.jsx'
import EventCard from '../components/EventCard.jsx'
import MapView from '../components/MapView.jsx'
import { isPast, monthLabel, sortKey } from '../lib/dates.js'
import { buildCalendar, downloadTextFile } from '../lib/ics.js'

function Rating({ value, onChange }) {
  return (
    <span className="rating" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} className={value >= n ? 'on' : ''} onClick={(e) => { e.stopPropagation(); onChange(value === n ? 0 : n) }}>★</button>
      ))}
    </span>
  )
}

export default function MyConcertsView() {
  const { tracked, updateTracked, settings, navigate } = useApp()
  const [when, setWhen] = useState('upcoming')
  const [filter, setFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(null)
  const [editing, setEditing] = useState(null)

  const all = useMemo(() => Object.values(tracked).map((t) => ({ ...t, event: t.event })), [tracked])
  const list = useMemo(() => {
    const items = all.filter((t) => (when === 'past' ? isPast(t.event) : !isPast(t.event))).filter((t) => filter === 'all' || t.status === filter)
    items.sort((a, b) => (sortKey(a.event) < sortKey(b.event) ? -1 : 1) * (when === 'past' ? -1 : 1))
    return items
  }, [all, when, filter])

  const groups = useMemo(() => {
    const g = []
    for (const t of list) {
      const key = t.event.date ? t.event.date.slice(0, 7) : 'tba'
      const last = g[g.length - 1]
      if (last && last.key === key) last.items.push(t)
      else g.push({ key, label: t.event.date ? monthLabel(t.event.date.slice(0, 7) + '-01') : 'Date TBA', items: [t] })
    }
    return g
  }, [list])

  const upcomingCount = all.filter((t) => !isPast(t.event)).length
  const events = list.map((t) => t.event)

  const exportIcs = () => {
    const evs = all.filter((t) => !isPast(t.event)).map((t) => t.event)
    if (!evs.length) return
    downloadTextFile('my-concerts.ics', buildCalendar(evs, Object.fromEntries(all.map((t) => [t.event.id, t.notes]))))
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>My concerts</h1>
          <p>Everything you're interested in, going to, or have been to. Add notes, rate shows, and export to your calendar.</p>
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={exportIcs} disabled={!upcomingCount}>📅 Export upcoming (.ics)</button>
        </div>
      </div>

      {!all.length ? (
        <div className="empty">
          <div className="big">🎟️</div>
          <h3>Nothing tracked yet</h3>
          <p>Hit <b>Track</b> on any concert in Discover and it will show up here.</p>
          <button type="button" className="btn primary" style={{ marginTop: 10 }} onClick={() => navigate('discover')}>Discover concerts</button>
        </div>
      ) : (
        <>
          <div className="row between" style={{ marginBottom: 14 }}>
            <div className="segmented" role="tablist">
              <button role="tab" aria-selected={when === 'upcoming'} className={when === 'upcoming' ? 'active' : ''} onClick={() => setWhen('upcoming')}>Upcoming ({upcomingCount})</button>
              <button role="tab" aria-selected={when === 'past'} className={when === 'past' ? 'active' : ''} onClick={() => setWhen('past')}>Past ({all.length - upcomingCount})</button>
            </div>
            <div className="segmented" role="tablist" aria-label="Status filter">
              <button role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All</button>
              {STATUSES.map((s) => <button key={s.id} role="tab" aria-selected={filter === s.id} className={filter === s.id ? 'active' : ''} onClick={() => setFilter(s.id)}>{s.icon} {s.label}</button>)}
            </div>
          </div>

          <div className="split">
            <div className="results" data-testid="tracked-list">
              {!list.length && <div className="empty"><p>No {when} concerts match this filter.</p></div>}
              {groups.map((g) => (
                <div key={g.key} className="month-group">
                  <h3>{g.label}</h3>
                  <div className="stack" style={{ gap: 10 }}>
                    {g.items.map((t) => (
                      <EventCard key={t.event.id} event={t.event} selected={selectedId === t.event.id} onSelect={setSelectedId} origin={settings.home}>
                        <div className="notes-box" onClick={(e) => e.stopPropagation()}>
                          {t.status === 'attended' && (
                            <div className="row" style={{ marginBottom: 6 }}><Rating value={t.rating || 0} onChange={(r) => updateTracked(t.event.id, { rating: r })} /><span className="faint small">{t.rating ? `${t.rating}/5` : 'Rate it'}</span></div>
                          )}
                          {editing === t.event.id ? (
                            <textarea className="textarea" autoFocus defaultValue={t.notes || ''} placeholder="Seats, who you're going with, setlist hopes…" onBlur={(e) => { updateTracked(t.event.id, { notes: e.target.value }); setEditing(null) }} />
                          ) : (
                            <button type="button" className="btn xs ghost" style={{ whiteSpace: 'normal', textAlign: 'left', justifyContent: 'flex-start' }} onClick={() => setEditing(t.event.id)}>
                              {t.notes ? <span className="muted">📝 {t.notes}</span> : <span className="faint">+ Add a note</span>}
                            </button>
                          )}
                        </div>
                      </EventCard>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="map-sticky">
              <MapView events={events} selectedId={selectedId} onSelect={setSelectedId} userLocation={settings.home} center={settings.home} autoFit short={false} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
