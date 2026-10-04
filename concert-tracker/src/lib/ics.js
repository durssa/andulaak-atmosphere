import { eventStart } from './dates.js'

function pad(n) { return String(n).padStart(2, '0') }

function toICSDateTimeUTC(d) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`
}

function toICSDate(iso) { return iso.replace(/-/g, '') }

export function escapeICS(s = '') {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

function foldLine(line) {
  // RFC 5545: lines should be at most 75 octets; fold with CRLF + space.
  const out = []
  let s = line
  while (s.length > 73) { out.push(s.slice(0, 73)); s = ' ' + s.slice(73) }
  out.push(s)
  return out.join('\r\n')
}

export function eventLocation(ev) {
  const v = ev.venue || {}
  return [v.name, v.address, v.city, v.region, v.country].filter(Boolean).join(', ')
}

export function buildVEvent(ev, { notes } = {}) {
  const uid = `${ev.id}@encore-concert-tracker`
  const lines = ['BEGIN:VEVENT', `UID:${escapeICS(uid)}`, `DTSTAMP:${toICSDateTimeUTC(new Date())}`]
  const start = eventStart(ev)
  if (ev.time && start) {
    const end = new Date(start.getTime() + 3 * 3600 * 1000)
    lines.push(`DTSTART:${toICSDateTimeUTC(start)}`, `DTEND:${toICSDateTimeUTC(end)}`)
  } else if (ev.date) {
    lines.push(`DTSTART;VALUE=DATE:${toICSDate(ev.date)}`)
  }
  lines.push(`SUMMARY:${escapeICS(ev.name)}`)
  const loc = eventLocation(ev)
  if (loc) lines.push(`LOCATION:${escapeICS(loc)}`)
  const desc = [ev.artists?.length ? `Lineup: ${ev.artists.join(', ')}` : '', ev.url ? `Tickets: ${ev.url}` : '', notes || '']
    .filter(Boolean).join('\n')
  if (desc) lines.push(`DESCRIPTION:${escapeICS(desc)}`)
  if (ev.url) lines.push(`URL:${ev.url}`)
  if (Number.isFinite(ev.venue?.lat) && Number.isFinite(ev.venue?.lng)) lines.push(`GEO:${ev.venue.lat};${ev.venue.lng}`)
  lines.push('END:VEVENT')
  return lines.map(foldLine).join('\r\n')
}

export function buildCalendar(events, notesById = {}) {
  const body = events.map((ev) => buildVEvent(ev, { notes: notesById[ev.id] })).join('\r\n')
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Encore Concert Tracker//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:My Concerts', body, 'END:VCALENDAR'].join('\r\n') + '\r\n'
}

export function googleCalendarUrl(ev, notes) {
  const start = eventStart(ev)
  const p = new URLSearchParams({ action: 'TEMPLATE', text: ev.name })
  if (ev.time && start) {
    const end = new Date(start.getTime() + 3 * 3600 * 1000)
    p.set('dates', `${toICSDateTimeUTC(start)}/${toICSDateTimeUTC(end)}`)
  } else if (ev.date) {
    const next = new Date(ev.date + 'T12:00:00'); next.setDate(next.getDate() + 1)
    p.set('dates', `${toICSDate(ev.date)}/${toICSDate(next.toISOString().slice(0, 10))}`)
  }
  const loc = eventLocation(ev)
  if (loc) p.set('location', loc)
  const details = [ev.url ? `Tickets: ${ev.url}` : '', notes || ''].filter(Boolean).join('\n')
  if (details) p.set('details', details)
  return `https://calendar.google.com/calendar/render?${p.toString()}`
}

export function downloadTextFile(filename, text, type = 'text/calendar;charset=utf-8') {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
