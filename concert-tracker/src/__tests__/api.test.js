import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { discover, upcomingForArtist, lookupArtist } from '../lib/api/index.js'
import { searchEvents } from '../lib/api/ticketmaster.js'
import { tmEvent, tmResponse, bitEvent, bitArtist } from './fixtures.js'

function mockFetch(router) {
  globalThis.fetch = vi.fn(async (url) => {
    const u = String(url)
    const hit = router.find(([m]) => u.includes(m))
    if (!hit) return new Response(JSON.stringify({ error: 'unmocked ' + u }), { status: 500 })
    const [, body, status = 200] = hit
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  })
}
const settingsNoKey = { tmKey: '', bitAppId: 'test' }
const settingsKey = { tmKey: 'abc', bitAppId: 'test' }

beforeEach(() => { vi.restoreAllMocks() })
afterEach(() => { delete globalThis.fetch })

describe('ticketmaster.searchEvents', () => {
  it('builds a geo + date query and normalises results', async () => {
    mockFetch([['app.ticketmaster.com/discovery/v2/events.json', tmResponse([tmEvent])]])
    const r = await searchEvents({ apiKey: 'abc', keyword: 'rock', lat: 51.5, lng: -0.12, radiusKm: 25, startDate: '2026-10-04', endDate: '2026-10-31' })
    const url = new URL(globalThis.fetch.mock.calls[0][0])
    expect(url.searchParams.get('apikey')).toBe('abc')
    expect(url.searchParams.get('latlong')).toBe('51.50000,-0.12000')
    expect(url.searchParams.get('radius')).toBe('25'); expect(url.searchParams.get('unit')).toBe('km')
    expect(url.searchParams.get('startDateTime')).toBe('2026-10-04T00:00:00Z')
    expect(url.searchParams.get('endDateTime')).toBe('2026-10-31T23:59:59Z')
    expect(url.searchParams.get('classificationName')).toBe('music')
    expect(r.events[0].id).toBe('tm:Z7r9jZ1AdFUoT'); expect(r.page.totalPages).toBe(1)
  })
  it('surfaces API faults as readable errors', async () => {
    mockFetch([['events.json', { fault: { faultstring: 'Invalid ApiKey' } }, 401]])
    await expect(searchEvents({ apiKey: 'bad' })).rejects.toThrow('Invalid ApiKey')
  })
  it('refuses to run without a key', async () => {
    await expect(searchEvents({ apiKey: '' })).rejects.toThrow(/not configured/)
  })
})

describe('discover', () => {
  it('uses Bandsintown alone when there is no Ticketmaster key', async () => {
    mockFetch([['rest.bandsintown.com/artists/Radiohead/events', [bitEvent]]])
    const r = await discover({ settings: settingsNoKey, keyword: 'Radiohead' })
    expect(r.providers).toEqual(['Bandsintown']); expect(r.events).toHaveLength(1); expect(r.warnings).toEqual([])
  })
  it('warns that location search needs Ticketmaster, and still returns artist matches', async () => {
    mockFetch([['rest.bandsintown.com', [bitEvent]]])
    const r = await discover({ settings: settingsNoKey, keyword: 'Radiohead', location: { lat: 51.5, lng: 0 }, radiusKm: 50 })
    expect(r.warnings[0]).toMatch(/Ticketmaster API key/); expect(r.events).toHaveLength(1)
  })
  it('filters Bandsintown results by radius client-side', async () => {
    mockFetch([['rest.bandsintown.com', [bitEvent]]])
    const r = await discover({ settings: settingsNoKey, keyword: 'Radiohead', location: { lat: 40.7, lng: -74 }, radiusKm: 50 })
    expect(r.events).toHaveLength(0)
  })
  it('merges both providers and dedupes shared shows', async () => {
    mockFetch([['app.ticketmaster.com', tmResponse([tmEvent])], ['rest.bandsintown.com', [bitEvent]]])
    const r = await discover({ settings: settingsKey, keyword: 'Radiohead' })
    expect(r.providers.sort()).toEqual(['Bandsintown', 'Ticketmaster']); expect(r.events).toHaveLength(1); expect(r.events[0].source).toBe('ticketmaster')
  })
  it('keeps going when one provider fails', async () => {
    mockFetch([['app.ticketmaster.com', { fault: { faultstring: 'Rate limit' } }, 429], ['rest.bandsintown.com', [bitEvent]]])
    const r = await discover({ settings: settingsKey, keyword: 'Radiohead' })
    expect(r.events).toHaveLength(1); expect(r.warnings[0]).toMatch(/Ticketmaster: Rate limit/)
  })
  it('applies the date window to merged results', async () => {
    mockFetch([['rest.bandsintown.com', [bitEvent, { ...bitEvent, id: '2', datetime: '2027-03-01T20:00:00' }]]])
    const r = await discover({ settings: settingsNoKey, keyword: 'Radiohead', startDate: '2027-01-01' })
    expect(r.events.map((e) => e.id)).toEqual(['bit:2'])
  })
})

describe('artists', () => {
  it('looks up an artist profile from Bandsintown', async () => {
    mockFetch([['rest.bandsintown.com/artists/Radiohead?', bitArtist]])
    expect(await lookupArtist({ settings: settingsNoKey, name: 'Radiohead' })).toMatchObject({ name: 'Radiohead', upcoming: 12, source: 'bandsintown' })
  })
  it('falls back to a bare profile when nobody knows the artist', async () => {
    mockFetch([['rest.bandsintown.com', { error: 'Not Found' }]])
    expect(await lookupArtist({ settings: settingsNoKey, name: 'Nobody Band' })).toMatchObject({ name: 'Nobody Band', source: null })
  })
  it('collects upcoming shows across providers', async () => {
    mockFetch([['rest.bandsintown.com', [bitEvent]], ['app.ticketmaster.com', tmResponse([tmEvent, { ...tmEvent, id: 'other', name: 'Someone Else', _embedded: { ...tmEvent._embedded, attractions: [{ name: 'Someone Else' }] } }])]])
    const r = await upcomingForArtist({ settings: settingsKey, artist: 'Radiohead' })
    expect(r.events.map((e) => e.id)).toEqual(['tm:Z7r9jZ1AdFUoT'])
  })
  it('treats a Bandsintown "not found" body as no results, not an error', async () => {
    mockFetch([['rest.bandsintown.com', { errorMessage: '[NotFound] The artist was not found' }], ['app.ticketmaster.com', tmResponse([tmEvent])]])
    const r = await discover({ settings: settingsKey, keyword: 'jazz festival' })
    expect(r.warnings).toEqual([]); expect(r.events).toHaveLength(1)
  })
  it('encodes awkward artist names for Bandsintown', async () => {
    mockFetch([['rest.bandsintown.com', []]])
    await upcomingForArtist({ settings: settingsNoKey, artist: 'AC/DC' })
    expect(String(globalThis.fetch.mock.calls[0][0])).toContain('/artists/AC%252FDC/events')
  })
})
