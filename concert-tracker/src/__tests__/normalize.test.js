import { describe, it, expect } from 'vitest'
import { normalizeTicketmasterEvent, normalizeBandsintownEvent, dedupeEvents, sortByDate } from '../lib/normalize.js'
import { tmEvent, bitEvent } from './fixtures.js'

describe('normalizeTicketmasterEvent', () => {
  it('maps the Discovery API shape to the common event', () => {
    const ev = normalizeTicketmasterEvent(tmEvent)
    expect(ev).toMatchObject({
      id: 'tm:Z7r9jZ1AdFUoT', source: 'ticketmaster', name: 'Radiohead', artists: ['Radiohead', 'The Smile'],
      date: '2026-11-21', time: '20:00', timezone: 'Europe/London', status: 'onsale', genre: 'Rock',
      priceMin: 65, priceMax: 120, currency: 'GBP', image: 'https://img/wide.jpg',
      venue: { name: 'The O2', city: 'London', country: 'GB', address: 'Peninsula Square', lat: 51.503, lng: 0.0032 },
    })
  })
  it('tolerates missing optional fields', () => {
    const ev = normalizeTicketmasterEvent({ id: 'x', name: 'Mystery', dates: { start: {} } })
    expect(ev.date).toBeNull(); expect(ev.time).toBeNull(); expect(ev.venue.lat).toBeNull(); expect(ev.priceMin).toBeNull(); expect(ev.artists).toEqual([])
  })
  it('returns null for junk', () => { expect(normalizeTicketmasterEvent(null)).toBeNull(); expect(normalizeTicketmasterEvent({})).toBeNull() })
})

describe('normalizeBandsintownEvent', () => {
  it('maps the v3 event shape', () => {
    const ev = normalizeBandsintownEvent(bitEvent, 'Radiohead')
    expect(ev).toMatchObject({ id: 'bit:1038801290', source: 'bandsintown', name: 'Radiohead at The O2 Arena', artists: ['Radiohead', 'The Smile'], url: 'https://tickets.example/1', date: '2026-11-21', time: '20:00', status: 'onsale' })
    expect(ev.venue).toMatchObject({ name: 'The O2 Arena', city: 'London', country: 'United Kingdom', lat: 51.503, lng: 0.003 })
  })
  it('hides midnight placeholder times', () => {
    expect(normalizeBandsintownEvent({ ...bitEvent, datetime: '2026-12-01T00:00:00' }).time).toBeNull()
  })
})

describe('dedupeEvents', () => {
  it('merges the same show from both providers and keeps Ticketmaster details', () => {
    const tm = normalizeTicketmasterEvent(tmEvent), bit = normalizeBandsintownEvent(bitEvent, 'Radiohead')
    const out = dedupeEvents([bit, tm])
    expect(out).toHaveLength(1)
    expect(out[0].source).toBe('ticketmaster')
    expect(out[0].altUrl).toBe('https://tickets.example/1')
  })
  it('keeps different shows on the same night apart', () => {
    const a = normalizeBandsintownEvent(bitEvent, 'Radiohead')
    const b = normalizeBandsintownEvent({ ...bitEvent, id: '2', artist: { name: 'Mitski' }, lineup: ['Mitski'] }, 'Mitski')
    expect(dedupeEvents([a, b])).toHaveLength(2)
  })
})

describe('sortByDate', () => {
  it('orders by date then time, unknown dates last', () => {
    const mk = (date, time) => ({ date, time })
    const out = sortByDate([mk(null, null), mk('2026-05-02', '21:00'), mk('2026-05-02', '19:00'), mk('2026-01-01', null)])
    expect(out.map((e) => `${e.date}/${e.time}`)).toEqual(['2026-01-01/null', '2026-05-02/19:00', '2026-05-02/21:00', 'null/null'])
  })
})
