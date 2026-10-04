import { describe, it, expect, vi } from 'vitest'
import { mergeTracked, mergeArtists, mergeSettings, createStore, reconcile, trackedToRow, rowToTracked } from '../lib/sync.js'

const ev = (id) => ({ id, name: `Show ${id}`, artists: [], venue: {}, date: '2026-12-01' })
const rec = (id, updatedAt, status = 'going') => ({ event: ev(id), status, notes: '', rating: 0, addedAt: updatedAt - 1000, updatedAt })

describe('mergeTracked', () => {
  it('keeps the newer copy and pushes local changes the server does not have', () => {
    const local = { a: rec('a', 2000, 'going'), b: rec('b', 1000) }
    const remote = { a: rec('a', 1000, 'interested'), c: rec('c', 3000) }
    const { merged, push, remove } = mergeTracked(local, remote)
    expect(merged.a.status).toBe('going'); expect(merged.c).toBeDefined(); expect(merged.b).toBeDefined()
    expect(push.sort()).toEqual(['a', 'b']); expect(remove).toEqual([])
  })
  it('prefers the remote copy when it is newer', () => {
    const { merged, push } = mergeTracked({ a: rec('a', 1000, 'going') }, { a: rec('a', 5000, 'attended') })
    expect(merged.a.status).toBe('attended'); expect(push).toEqual([])
  })
  it('honours local deletions through tombstones', () => {
    const { merged, remove } = mergeTracked({}, { a: rec('a', 1000) }, { a: 2000 })
    expect(merged.a).toBeUndefined(); expect(remove).toEqual(['a'])
  })
  it('lets a newer remote edit override an older tombstone', () => {
    const { merged, remove } = mergeTracked({}, { a: rec('a', 9000) }, { a: 2000 })
    expect(merged.a).toBeDefined(); expect(remove).toEqual([])
  })
})

describe('mergeArtists', () => {
  it('unions by name, case-insensitively, keeping the earliest follow date', () => {
    const { merged, push } = mergeArtists([{ name: 'Mitski', addedAt: 500 }, { name: 'The National', addedAt: 900 }], [{ name: 'mitski', addedAt: 100, image: 'x' }])
    expect(merged.map((a) => a.name)).toEqual(['Mitski', 'The National'])
    expect(merged[0].addedAt).toBe(100); expect(merged[0].image).toBe('x')
    expect(push).toEqual(['the national'])
  })
  it('drops artists unfollowed locally', () => {
    const { merged, remove } = mergeArtists([], [{ name: 'Khruangbin', addedAt: 100 }], { khruangbin: 200 })
    expect(merged).toEqual([]); expect(remove).toEqual(['khruangbin'])
  })
})

describe('mergeSettings', () => {
  it('only syncs non-secret keys and picks the newer side', () => {
    const local = { units: 'mi', tmKey: 'secret', updatedAt: 100 }
    const remote = { units: 'km', theme: 'dark', updatedAt: 200 }
    expect(mergeSettings(local, remote)).toEqual({ merged: { units: 'km', theme: 'dark' }, push: false })
    expect(mergeSettings({ ...local, updatedAt: 300 }, remote)).toEqual({ merged: { units: 'mi' }, push: true })
    expect(mergeSettings(local, {}).push).toBe(true)
  })
})

describe('row conversion', () => {
  it('round-trips a tracked record', () => {
    const r = rec('tm:1', 1700000000000)
    const back = rowToTracked(trackedToRow('u1', 'tm:1', r))
    expect(back).toMatchObject({ status: 'going', updatedAt: 1700000000000, addedAt: 1700000000000 - 1000 })
    expect(back.event.name).toBe('Show tm:1')
  })
})

function fakeClient(tables) {
  const q = (table) => {
    const chain = { _op: 'select', _rows: null, _filters: [] }
    chain.select = () => chain
    chain.eq = (col, v) => { chain._filters.push((r) => r[col] === v); return chain }
    chain.in = (col, vals) => { chain._filters.push((r) => vals.includes(r[col])); return chain }
    chain.maybeSingle = () => { chain._single = true; return chain }
    chain.upsert = (rows) => { chain._op = 'upsert'; chain._rows = rows; return chain }
    chain.delete = () => { chain._op = 'delete'; return chain }
    chain.then = (resolve) => {
      let data = null
      if (chain._op === 'select') { data = tables[table].filter((r) => chain._filters.every((f) => f(r))); if (chain._single) data = data[0] || null }
      else if (chain._op === 'upsert') { for (const row of [].concat(chain._rows)) { const i = tables[table].findIndex((r) => r.user_id === row.user_id && (r.event_id ?? r.name_key ?? '') === (row.event_id ?? row.name_key ?? '')); i >= 0 ? (tables[table][i] = row) : tables[table].push(row) } }
      else if (chain._op === 'delete') { tables[table] = tables[table].filter((r) => !chain._filters.every((f) => f(r))) }
      resolve({ data, error: null })
    }
    return chain
  }
  return { from: vi.fn(q), tables }
}

describe('reconcile', () => {
  it('pulls, merges and pushes the difference', async () => {
    const tables = { tracked_events: [trackedToRow('u1', 'r', rec('r', 1000))], followed_artists: [], user_settings: [] }
    const client = fakeClient(tables)
    const store = createStore(client, 'u1')
    const out = await reconcile(store, { tracked: { l: rec('l', 2000) }, artists: [{ name: 'Mitski', addedAt: 1 }], settings: { units: 'mi', updatedAt: 50 }, tombstones: {} })
    expect(Object.keys(out.tracked).sort()).toEqual(['l', 'r'])
    expect(client.tables.tracked_events.map((r) => r.event_id).sort()).toEqual(['l', 'r'])
    expect(client.tables.followed_artists[0].name_key).toBe('mitski')
    expect(client.tables.user_settings[0].data).toEqual({ units: 'mi' })
    expect(out.settingsFromRemote).toBe(false)
  })
})
