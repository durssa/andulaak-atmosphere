import { useCallback, useEffect, useState } from 'react'

const PREFIX = 'encore.'

export function readKey(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw === null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function writeKey(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    /* storage unavailable (private mode, quota) — keep in-memory state only */
  }
}

/** useState that mirrors into localStorage under the `encore.` namespace. */
export function useStoredState(key, initial) {
  const [value, setValue] = useState(() => readKey(key, initial))
  const set = useCallback(
    (next) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next
        writeKey(key, resolved)
        return resolved
      })
    },
    [key],
  )
  // Keep multiple tabs in sync.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === PREFIX + key && e.newValue !== null) {
        try { setValue(JSON.parse(e.newValue)) } catch { /* ignore */ }
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [key])
  return [value, set]
}

export const EXPORT_KEYS = ['tracked', 'artists', 'settings', 'recentSearches']

export function exportAllData() {
  const out = { app: 'encore', version: 1, exportedAt: new Date().toISOString() }
  for (const k of EXPORT_KEYS) out[k] = readKey(k, null)
  return out
}

export function importAllData(json) {
  if (!json || json.app !== 'encore') throw new Error('Not an Encore export file')
  for (const k of EXPORT_KEYS) if (json[k] !== null && json[k] !== undefined) writeKey(k, json[k])
}
