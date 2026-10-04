import { describe, it, expect } from 'vitest'
import { daysUntil, isPast, countdownLabel, addDays, eventStart } from '../lib/dates.js'
import { haversineKm, formatDistance, boundsOf } from '../lib/geo.js'
import { buildCalendar, escapeICS, googleCalendarUrl } from '../lib/ics.js'
import { normalizeTicketmasterEvent } from '../lib/normalize.js'
import { tmEvent } from './fixtures.js'

const now = new Date('2026-10-04T12:00:00')

describe('dates', () => {
  it('counts days until an event', () => {
    expect(daysUntil({ date: '2026-10-04' }, now)).toBe(0)
    expect(daysUntil({ date: '2026-10-05' }, now)).toBe(1)
    expect(daysUntil({ date: '2026-09-30' }, now)).toBe(-4)
  })
  it('treats the event day as not past until it ends', () => {
    expect(isPast({ date: '2026-10-04', time: '09:00' }, now)).toBe(false)
    expect(isPast({ date: '2026-10-03', time: '21:00' }, now)).toBe(true)
    expect(isPast({ date: null }, now)).toBe(false)
  })
  it('labels countdowns', () => {
    expect(countdownLabel({ date: '2026-10-04' }, now)).toBe('Today')
    expect(countdownLabel({ date: '2026-10-05' }, now)).toBe('Tomorrow')
    expect(countdownLabel({ date: '2026-10-14' }, now)).toBe('In 10 days')
    expect(countdownLabel({ date: '2026-11-15' }, now)).toBe('In 6 weeks')
    expect(countdownLabel({ date: '2027-04-04' }, now)).toBe('In 6 months')
  })
  it('adds days across month boundaries', () => { expect(addDays('2026-01-30', 3)).toBe('2026-02-02') })
  it('falls back to midday when no time is known', () => { expect(eventStart({ date: '2026-10-04' }).getHours()).toBe(12) })
})

describe('geo', () => {
  it('computes great-circle distance', () => {
    const d = haversineKm({ lat: 52.52, lng: 13.405 }, { lat: 48.8566, lng: 2.3522 }) // Berlin → Paris
    expect(d).toBeGreaterThan(870); expect(d).toBeLessThan(890)
  })
  it('formats in both unit systems', () => {
    expect(formatDistance(3.456, 'km')).toBe('3.5 km')
    expect(formatDistance(160.9, 'mi')).toBe('100 mi')
    expect(formatDistance(null)).toBe('')
  })
  it('skips invalid points in bounds', () => {
    expect(boundsOf([{ lat: 1, lng: 2 }, { lat: null, lng: 2 }, { lat: -1, lng: 5 }])).toEqual({ minLat: -1, maxLat: 1, minLng: 2, maxLng: 5 })
    expect(boundsOf([])).toBeNull()
  })
})

describe('ics', () => {
  const ev = normalizeTicketmasterEvent(tmEvent)
  it('escapes reserved characters', () => { expect(escapeICS('a,b;c' + String.fromCharCode(10) + 'd' + String.fromCharCode(92) + 'e')).toBe('a' + String.fromCharCode(92) + ',b' + String.fromCharCode(92) + ';c' + String.fromCharCode(92) + 'nd' + String.fromCharCode(92) + String.fromCharCode(92) + 'e') })
  it('builds a valid calendar with timed events', () => {
    const ics = buildCalendar([ev], { [ev.id]: 'Row A' })
    expect(ics).toContain('BEGIN:VCALENDAR'); expect(ics).toContain('END:VCALENDAR')
    expect(ics).toContain('SUMMARY:Radiohead')
    expect(ics).toMatch(/DTSTART:\d{8}T\d{6}Z/)
    expect(ics).toContain('LOCATION:The O2\\, Peninsula Square\\, London\\, London\\, GB')
    expect(ics).toContain('GEO:51.503;0.0032')
    expect(ics).toContain('Row A')
    expect(ics.split('\r\n').every((l) => l.length <= 75)).toBe(true)
  })
  it('uses all-day entries when the time is unknown', () => {
    expect(buildCalendar([{ ...ev, time: null }])).toContain('DTSTART;VALUE=DATE:20261121')
  })
  it('creates a Google Calendar link', () => {
    const u = new URL(googleCalendarUrl(ev))
    expect(u.hostname).toBe('calendar.google.com')
    expect(u.searchParams.get('text')).toBe('Radiohead')
    expect(u.searchParams.get('dates')).toMatch(/^\d{8}T\d{6}Z\/\d{8}T\d{6}Z$/)
  })
})
