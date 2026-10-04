import { createContext, useContext } from 'react'

export const AppContext = createContext(null)
export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside <AppContext.Provider>')
  return ctx
}

export const STATUSES = [
  { id: 'interested', label: 'Interested', icon: '☆', badge: 'accent' },
  { id: 'going', label: 'Going', icon: '🎟️', badge: 'pink' },
  { id: 'attended', label: 'Attended', icon: '✓', badge: 'ok' },
]
export const statusById = Object.fromEntries(STATUSES.map((s) => [s.id, s]))

export const DEFAULT_SETTINGS = {
  tmKey: import.meta.env.VITE_TICKETMASTER_API_KEY || '',
  gmKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
  bitAppId: import.meta.env.VITE_BANDSINTOWN_APP_ID || 'encore-concert-tracker',
  units: 'km',
  mapProvider: 'auto', // auto | google | leaflet
  home: null, // { label, lat, lng }
  defaultRadiusKm: 50,
}
