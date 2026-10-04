/** Date helpers — all events carry a local `date` (YYYY-MM-DD) and optional `time` (HH:mm). */

export function todayISO(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return todayISO(d)
}

/** Local Date object for an event's start (midday when the time is unknown). */
export function eventStart(ev) {
  if (!ev?.date) return null
  const t = ev.time && /^\d{2}:\d{2}/.test(ev.time) ? ev.time.slice(0, 5) : '12:00'
  const d = new Date(`${ev.date}T${t}:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function isPast(ev, now = new Date()) {
  const d = eventStart(ev)
  if (!d) return false
  // An event counts as past the day after its date.
  const endOfDay = new Date(`${ev.date}T23:59:59`)
  return endOfDay < now && d < now
}

export function daysUntil(ev, now = new Date()) {
  if (!ev?.date) return null
  const a = new Date(todayISO(now) + 'T00:00:00')
  const b = new Date(ev.date + 'T00:00:00')
  return Math.round((b - a) / 86400000)
}

export function formatEventDate(ev, { weekday = true } = {}) {
  const d = eventStart(ev)
  if (!d) return 'Date TBA'
  const opts = { month: 'short', day: 'numeric', year: 'numeric' }
  if (weekday) opts.weekday = 'short'
  let s = d.toLocaleDateString(undefined, opts)
  if (ev.time) s += ` · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
  return s
}

export function monthLabel(iso) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

export function countdownLabel(ev, now = new Date()) {
  const n = daysUntil(ev, now)
  if (n === null) return ''
  if (n < 0) return `${Math.abs(n)} day${n === -1 ? '' : 's'} ago`
  if (n === 0) return 'Today'
  if (n === 1) return 'Tomorrow'
  if (n < 14) return `In ${n} days`
  if (n < 60) return `In ${Math.round(n / 7)} weeks`
  return `In ${Math.round(n / 30)} months`
}

export function sortKey(ev) {
  return `${ev?.date || '9999-99-99'}T${ev?.time || '99:99'}`
}
