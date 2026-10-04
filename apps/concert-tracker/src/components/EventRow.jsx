import { useApp, STATUSES, statusById } from '../context.jsx'
import { Button, Icon, Menu, Tag } from './ui.jsx'
import { eventStart, isPast, countdownLabel } from '../lib/dates.js'
import { formatDistance, haversineKm } from '../lib/geo.js'
import { directionsUrl } from '../lib/api/googleMaps.js'
import { buildCalendar, downloadTextFile, googleCalendarUrl } from '../lib/ics.js'
import { spotifySearchUrl } from '../lib/api/spotify.js'

const SOURCE_LABEL = { ticketmaster: 'Ticketmaster', seatgeek: 'SeatGeek', bandsintown: 'Bandsintown' }

function formatPrice(ev) {
  if (ev.priceMin === null || ev.priceMin === undefined) return null
  try {
    const f = new Intl.NumberFormat(undefined, { style: 'currency', currency: ev.currency || 'USD', maximumFractionDigits: 0 })
    return `From ${f.format(ev.priceMin)}`
  } catch { return `From ${ev.priceMin} ${ev.currency || ''}`.trim() }
}

export function DateBlock({ event }) {
  const d = eventStart(event)
  if (!d) return <div className="date-block" aria-hidden="true"><span className="mon">Date</span><span className="day" style={{ fontSize: 14 }}>TBA</span></div>
  return (
    <div className="date-block" aria-hidden="true">
      <span className="dow">{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
      <span className="day num">{d.getDate()}</span>
      <span className="mon">{d.toLocaleDateString(undefined, { month: 'short' })}</span>
    </div>
  )
}

export function TrackMenu({ event, size = 'sm' }) {
  const { tracked, setStatus, untrack } = useApp()
  const current = tracked[event.id]?.status
  const st = current && statusById[current]
  const items = STATUSES.map((s) => ({ key: s.id, label: s.label, icon: s.icon, checked: current === s.id, onSelect: () => setStatus(event, s.id) }))
  if (current) items.push('sep', { key: 'remove', label: 'Remove from my concerts', icon: 'x', danger: true, onSelect: () => untrack(event.id) })
  return <Menu label={st ? st.label : 'Track'} icon={st ? st.icon : 'plus'} variant={st ? 'default' : 'primary'} size={size} items={items} testId="track-btn" />
}

function StatusTag({ status }) {
  const map = { cancelled: ['danger', 'Cancelled'], postponed: ['warning', 'Postponed'], rescheduled: ['warning', 'Rescheduled'], offsale: [undefined, 'Off sale'] }
  if (!map[status]) return null
  const [tone, label] = map[status]
  return <Tag tone={tone}>{label}</Tag>
}

/**
 * One concert in a list. Date block on the left, details in the middle, actions on the right.
 * `interactive`: the row selects on click (used beside the map).
 */
export default function EventRow({ event, selected = false, onSelect, origin, interactive = false, children }) {
  const { settings, tracked } = useApp()
  const t = tracked[event.id]
  const past = isPast(event)
  const dist = origin && Number.isFinite(event.venue?.lat) ? formatDistance(haversineKm(origin, event.venue), settings.units) : ''
  const place = [event.venue?.name, [event.venue?.city, event.venue?.country === 'US' ? event.venue?.region : event.venue?.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ')
  const time = event.time ? eventStart(event)?.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : null
  const price = formatPrice(event)
  const dir = directionsUrl(event)
  const more = [
    dir && { key: 'dir', label: 'Directions', icon: 'navigation', href: dir },
    event.date && { key: 'gcal', label: 'Add to Google Calendar', icon: 'calendar', href: googleCalendarUrl(event, t?.notes) },
    event.date && { key: 'ics', label: 'Download .ics file', icon: 'download', onSelect: () => downloadTextFile(`${event.name.replace(/[^\w\- ]+/g, '').slice(0, 60) || 'concert'}.ics`, buildCalendar([event], { [event.id]: t?.notes })) },
    event.artists[0] && { key: 'sp', label: 'Listen on Spotify', icon: 'music', href: spotifySearchUrl(event.artists[0]) },
    event.altUrl && { key: 'alt', label: 'Other ticket source', icon: 'external', href: event.altUrl },
  ].filter(Boolean)

  const onKey = (e) => { if (interactive && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect?.(event.id) } }

  return (
    <article className={`event-row ${interactive ? 'clickable' : ''} ${selected ? 'selected' : ''} ${past ? 'past' : ''}`} data-testid="event-card"
      onClick={interactive ? () => onSelect?.(event.id) : undefined} onKeyDown={onKey} tabIndex={interactive ? 0 : undefined} aria-current={selected ? 'true' : undefined}
      aria-label={`${event.name}, ${place || 'venue to be announced'}`}>
      <DateBlock event={event} />
      <div className="event-body">
        <div className="event-title">{event.name}</div>
        <div className="event-venue truncate" title={place}>{place || 'Venue to be announced'}{dist ? ` · ${dist}` : ''}</div>
        <div className="event-meta">
          {t && <Tag tone={statusById[t.status]?.tone} icon={statusById[t.status]?.icon}>{statusById[t.status]?.label}</Tag>}
          <StatusTag status={event.status} />
          {event.date && <span>{countdownLabel(event)}{time ? ` · ${time}` : ''}</span>}
          {event.genre && <span>{event.genre}</span>}
          {price && <span className="num">{price}</span>}
          {event.artists.length > 1 && <span title={event.artists.join(', ')}>+{event.artists.length - 1} more on the bill</span>}
          <span>{SOURCE_LABEL[event.source] || event.source}</span>
        </div>
      </div>
      <div className="event-actions" onClick={(e) => e.stopPropagation()}>
        <TrackMenu event={event} />
        {event.url && <Button as="a" href={event.url} target="_blank" rel="noopener noreferrer" size="sm" icon="ticket">Tickets</Button>}
        {more.length > 0 && <Menu label="" icon="sliders" size="sm" items={more} className="more-menu" />}
      </div>
      {children && <div className="event-extra" onClick={(e) => e.stopPropagation()}>{children}</div>}
    </article>
  )
}

export function EventList({ children }) {
  return <div className="event-list">{children}</div>
}

