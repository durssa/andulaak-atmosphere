import { useMemo, useState } from 'react'
import { useApp, STATUSES } from '../context.jsx'
import EventRow, { EventList } from '../components/EventRow.jsx'
import MapView from '../components/MapView.jsx'
import { Button, Empty, Icon, Segmented } from '../components/ui.jsx'
import { isPast, monthLabel, sortKey } from '../lib/dates.js'
import { buildCalendar, downloadTextFile } from '../lib/ics.js'

function Rating({ value, onChange }) {
  return (
    <span className="rating" role="radiogroup" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} className={value >= n ? 'on' : ''} onClick={() => onChange(value === n ? 0 : n)}><Icon name="star" size={18} style={{ fill: value >= n ? 'currentColor' : 'none' }} /></button>
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

  const all = useMemo(() => Object.values(tracked), [tracked])
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
      else g.push({ key, label: t.event.date ? monthLabel(t.event.date.slice(0, 7) + '-01') : 'Date to be announced', items: [t] })
    }
    return g
  }, [list])
  const upcomingCount = all.filter((t) => !isPast(t.event)).length
  const events = list.map((t) => t.event)

  const exportIcs = () => {
    const evs = all.filter((t) => !isPast(t.event)).map((t) => t.event)
    if (evs.length) downloadTextFile('my-concerts.ics', buildCalendar(evs, Object.fromEntries(all.map((t) => [t.event.id, t.notes]))))
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>My concerts</h1>
          <p>Shows you're interested in, going to, or have been to. Add notes, rate the ones you attended, and export the rest to your calendar.</p>
        </div>
        <Button icon="download" onClick={exportIcs} disabled={!upcomingCount}>Export to calendar</Button>
      </div>

      {!all.length ? (
        <Empty icon="ticket" title="Nothing tracked yet" action={<Button variant="primary" onClick={() => navigate('discover')}>Find concerts</Button>}>Use Track on any concert and it will show up here.</Empty>
      ) : (
        <>
          <div className="toolbar">
            <Segmented label="Time" value={when} onChange={setWhen} tabs={[{ id: 'upcoming', label: 'Upcoming', count: upcomingCount }, { id: 'past', label: 'Past', count: all.length - upcomingCount }]} />
            <Segmented label="Status" value={filter} onChange={setFilter} tabs={[{ id: 'all', label: 'All' }, ...STATUSES.map((s) => ({ id: s.id, label: s.label, icon: s.icon }))]} />
          </div>
          <div className="split">
            <div className="results-pane" data-testid="tracked-list">
              {!list.length && <Empty icon="info">No {when} concerts match this filter.</Empty>}
              {groups.map((g) => (
                <section key={g.key} aria-labelledby={`m-${g.key}`}>
                  <h2 className="month-head" id={`m-${g.key}`}>{g.label}</h2>
                  <EventList>
                    {g.items.map((t) => (
                      <EventRow key={t.event.id} event={t.event} interactive selected={selectedId === t.event.id} onSelect={setSelectedId} origin={settings.home}>
                        {t.status === 'attended' && <div className="row" style={{ marginBottom: 4 }}><Rating value={t.rating || 0} onChange={(r) => updateTracked(t.event.id, { rating: r })} /><span className="faint small">{t.rating ? `${t.rating} of 5` : 'Rate this show'}</span></div>}
                        {editing === t.event.id ? (
                          <div className="field"><label htmlFor={`note-${t.event.id}`} className="sr-only">Notes</label><textarea id={`note-${t.event.id}`} className="textarea" autoFocus defaultValue={t.notes || ''} placeholder="Seats, who you're going with, setlist hopes…" onBlur={(e) => { updateTracked(t.event.id, { notes: e.target.value }); setEditing(null) }} onKeyDown={(e) => { if (e.key === 'Escape') e.currentTarget.blur() }} /></div>
                        ) : (
                          <button type="button" className="note-btn" onClick={() => setEditing(t.event.id)} aria-label={t.notes ? 'Edit note' : 'Add a note'}><Icon name="edit" size={14} />{t.notes ? <span>{t.notes}</span> : <span className="faint">Add a note</span>}</button>
                        )}
                      </EventRow>
                    ))}
                  </EventList>
                </section>
              ))}
            </div>
            <div className="map-sticky"><MapView events={events} selectedId={selectedId} onSelect={setSelectedId} userLocation={settings.home} center={settings.home} autoFit /></div>
          </div>
        </>
      )}
    </div>
  )
}
