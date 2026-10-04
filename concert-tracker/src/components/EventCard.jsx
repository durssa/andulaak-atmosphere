import { useEffect, useRef, useState } from 'react'
import { useApp, STATUSES, statusById } from '../context.jsx'
import { formatEventDate, isPast, countdownLabel } from '../lib/dates.js'
import { formatDistance, haversineKm } from '../lib/geo.js'
import { directionsUrl } from '../lib/api/googleMaps.js'
import { buildCalendar, downloadTextFile, googleCalendarUrl } from '../lib/ics.js'

export function TrackButton({ event, size = 'sm' }) {
  const { tracked, setStatus, untrack } = useApp()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const current = tracked[event.id]?.status
  useEffect(() => {
    if (!open) return
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const st = current && statusById[current]
  return (
    <div className="status-menu" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button type="button" className={`btn ${size} ${st ? 'accent2' : 'primary'}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="track-btn">
        {st ? `${st.icon} ${st.label}` : '+ Track'} <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="menu" role="menu">
          {STATUSES.map((s) => (
            <button key={s.id} type="button" role="menuitem" onClick={() => { setStatus(event, s.id); setOpen(false) }}>
              <span>{s.icon}</span> {s.label} {current === s.id && <span className="faint" style={{ marginLeft: 'auto' }}>✓</span>}
            </button>
          ))}
          {current && (
            <button type="button" role="menuitem" className="danger" onClick={() => { untrack(event.id); setOpen(false) }}>✕ Remove</button>
          )}
        </div>
      )}
    </div>
  )
}

export function CalendarButton({ event, notes, size = 'sm' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  if (!event.date) return null
  return (
    <div className="status-menu" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button type="button" className={`btn ${size}`} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>📅 Calendar ▾</button>
      {open && (
        <div className="menu" role="menu">
          <a role="menuitem" href={googleCalendarUrl(event, notes)} target="_blank" rel="noopener noreferrer" className="btn ghost sm" style={{ justifyContent: 'flex-start', width: '100%' }} onClick={() => setOpen(false)}>Google Calendar</a>
          <button type="button" role="menuitem" onClick={() => { downloadTextFile(`${event.name.replace(/[^\w\- ]+/g, '').slice(0, 60) || 'concert'}.ics`, buildCalendar([event], { [event.id]: notes })); setOpen(false) }}>Download .ics (Apple, Outlook…)</button>
        </div>
      )}
    </div>
  )
}

export function SourceBadge({ source }) {
  if (source === 'ticketmaster') return <span className="badge tm">Ticketmaster</span>
  if (source === 'bandsintown') return <span className="badge bit">Bandsintown</span>
  return null
}

function StatusBadge({ status }) {
  if (!status || status === 'onsale' || status === 'unknown') return null
  const map = { cancelled: ['danger', 'Cancelled'], postponed: ['warn', 'Postponed'], rescheduled: ['warn', 'Rescheduled'], offsale: ['', 'Off sale'] }
  const [cls, label] = map[status] || ['', status]
  return <span className={`badge ${cls}`}>{label}</span>
}

export default function EventCard({ event, selected, onSelect, origin, compact = false, children }) {
  const { settings, tracked } = useApp()
  const t = tracked[event.id]
  const past = isPast(event)
  const dist = origin && Number.isFinite(event.venue?.lat) ? formatDistance(haversineKm(origin, event.venue), settings.units) : ''
  const venue = [event.venue?.name, event.venue?.city, event.venue?.region && event.venue?.country === 'US' ? event.venue.region : null, event.venue?.country].filter(Boolean).join(' · ')
  const dir = directionsUrl(event)
  const price = event.priceMin !== null && event.priceMin !== undefined ? `${event.currency || ''} ${event.priceMin}${event.priceMax && event.priceMax !== event.priceMin ? `–${event.priceMax}` : ''}`.trim() : null
  return (
    <article className={`event-card ${selected ? 'selected' : ''} ${past ? 'past' : ''} ${compact ? 'compact' : ''}`} onClick={() => onSelect?.(event.id)} data-testid="event-card" aria-selected={selected}>
      <div className="thumb"><span aria-hidden="true">🎵</span>{event.image && <img src={event.image} alt="" loading="lazy" style={{ position: 'absolute' }} onError={(e) => e.currentTarget.classList.add('broken')} />}</div>
      <div className="body">
        <div className="row between" style={{ gap: 6 }}>
          <span className="date">{formatEventDate(event)}</span>
          <span className="faint small">{countdownLabel(event)}</span>
        </div>
        <div className="title">{event.name}</div>
        <div className="venue" title={venue}>{venue || 'Venue TBA'}{dist ? ` · ${dist}` : ''}</div>
        <div className="meta">
          {t && <span className={`badge ${statusById[t.status]?.badge}`}>{statusById[t.status]?.icon} {statusById[t.status]?.label}</span>}
          <StatusBadge status={event.status} />
          {event.genre && <span className="badge">{event.genre}</span>}
          {price && <span className="badge">{price}</span>}
          {event.artists.length > 1 && <span className="badge" title={event.artists.join(', ')}>+{event.artists.length - 1} more</span>}
          <SourceBadge source={event.source} />
        </div>
        <div className="actions">
          <TrackButton event={event} />
          {event.url && <a className="btn sm" href={event.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>🎫 Tickets</a>}
          {dir && <a className="btn sm" href={dir} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>🧭 Directions</a>}
          <CalendarButton event={event} notes={t?.notes} />
        </div>
        {children}
      </div>
    </article>
  )
}
