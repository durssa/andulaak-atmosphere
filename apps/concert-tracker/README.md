# Encore — Concert Tracker

Discover upcoming concerts, see them on a map, and keep track of the shows you're interested in, going to, or have been to.

**Live app:** https://durssa.github.io/andulaak-atmosphere/

## Design

Light, product-style interface (dark mode follows the system or the in-app setting): one accent colour, IBM Plex Sans, a date block on every event row, a list beside the map, and SVG icons. Built for keyboard and screen-reader use: landmarks and a skip link, labelled controls, arrow-key menus and tab lists, visible focus, WCAG AA contrast, and reduced-motion support.

## What it does

- **Discover** — search by artist, by place (city/address or your GPS location) with a distance radius, and by date range. Results are listed and plotted on a map.
- **Artists** — follow artists; Encore checks their tour dates (refreshed every 6 hours) and surfaces new shows on the Home page, nearest-to-home first.
- **My Concerts** — track any event as *Interested*, *Going* or *Attended*. Add notes, rate shows you attended, export everything to your calendar (.ics) or add a single show to Google Calendar.
- **Home** — countdown to your next show, stats, and upcoming dates from the artists you follow.
- Works offline-first: all data lives in your browser's localStorage; export/import a JSON backup from Settings.

## Integrations

| Provider | Used for | Key needed? |
| --- | --- | --- |
| [Ticketmaster Discovery API](https://developer.ticketmaster.com/) | Location-radius search, keyword search, prices, genres, ticket status, artist autocomplete | Yes (free, 5k calls/day). Paste it in **Settings** or set `VITE_TICKETMASTER_API_KEY` |
| [SeatGeek Platform API](https://platform.seatgeek.com/) | Second source for location and keyword search, including resale prices | Yes (free client id). Paste it in **Settings** or set `VITE_SEATGEEK_CLIENT_ID` |
| [Bandsintown](https://www.bandsintown.com/) | Artist tour dates and artist profiles | No |
| [Spotify Web API](https://developer.spotify.com/) | Import followed artists and top artists, artist suggestions while typing (PKCE sign-in, read-only scopes) | Yes (free Client ID). Register the redirect URI shown in **Settings** |
| [Google Maps Platform](https://developers.google.com/maps) | Map rendering (Maps JavaScript API) and geocoding | Optional. Paste it in **Settings** or set `VITE_GOOGLE_MAPS_API_KEY` |
| [Leaflet](https://leafletjs.com/) + [OpenStreetMap](https://www.openstreetmap.org/) / [CARTO](https://carto.com/attributions) tiles | Map rendering when no Google key is set | No |
| [Nominatim](https://nominatim.org/) | Geocoding when no Google key is set | No |
| Browser Geolocation | "Use my location" | No |
| [Supabase](https://supabase.com/) | Optional accounts and cross-device sync (email link, Google or Spotify sign-in, Postgres with row-level security) | Optional. Project URL and anon key in **Settings** or `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` |
| Google Maps directions links, Google Calendar links, iCalendar export | Getting there and remembering | No |

Everything runs in the browser; there is no backend. Keys you enter in Settings never leave your device except in requests to the provider they belong to.

### Without any keys

Artist search (Bandsintown), following artists, tracking, calendar export and the OpenStreetMap map all work with zero configuration. Searching **by location** requires a Ticketmaster or SeatGeek key.

### Other ticket sources

StubHub's API is limited to approved partners, and TickPick, AXS and Dice have no public API, so they are not integrated. SeatGeek listings already include many resale tickets.

## Accounts and sync

By default everything is stored in the browser (localStorage) and can be moved with the backup export. To give people accounts and cross-device sync, point the app at a [Supabase](https://supabase.com/) project:

1. Create a free Supabase project and run `supabase/schema.sql` in its SQL editor. It creates `tracked_events`, `followed_artists` and `user_settings` with row-level security, so each person can only read and write their own rows.
2. In Authentication → URL configuration, add the app URL (`https://durssa.github.io/andulaak-atmosphere/`) to Redirect URLs. Enable Google and Spotify under Providers if you want those sign-in buttons; email sign-in links work out of the box.
3. Put the project URL and anon key in Settings → Account and sync, or ship them with the build as the `SUPABASE_URL` and `SUPABASE_ANON_KEY` repository secrets.

How it behaves: the browser stays the working copy, so the app is fully usable offline and signed out. When someone signs in, local data is merged into the account (newer record wins, artists are a union, deletions are remembered as tombstones) and every later change is written through. API keys and the Spotify session are never synced; they stay on the device.

## Development

```bash
cd apps/concert-tracker
npm install
npm run dev        # http://localhost:5173
npm run lint
npm test           # unit tests (vitest)
npm run build
npm run test:e2e   # headless-Chromium smoke test against ./dist with mocked APIs
```

Copy `.env.example` to `.env.local` to bake keys into a local build.

## Deployment

`.github/workflows/deploy-concert-tracker.yml` lints, tests and builds the app on every push to `master` that touches `apps/concert-tracker/`, then publishes `dist/` to the `gh-pages` branch, which GitHub Pages serves at the URL above (Settings → Pages → Source: *Deploy from a branch*, `gh-pages`, `/ (root)`). To ship API keys with the build, add `TICKETMASTER_API_KEY`, `SEATGEEK_CLIENT_ID`, `SPOTIFY_CLIENT_ID` and/or `GOOGLE_MAPS_API_KEY` as repository Actions secrets; otherwise users enter keys in the app's Settings page.

If a Google Maps key is shipped, restrict it to the site's URL (HTTP referrer restriction) in Google Cloud Console.

## Project layout

```
src/
  App.jsx               shell, hash routing, global state (tracked, artists, feeds, settings)
  context.jsx           React context + constants
  components/           ui.jsx (buttons, menu, icons), EventRow, MapView (Leaflet + Google Maps), Toast
  views/                Home, Discover, Artists, MyConcerts, Settings
  lib/
    api/                ticketmaster.js, seatgeek.js, bandsintown.js, spotify.js, geocode.js, googleMaps.js, index.js (facade)
    normalize.js        provider → common event shape, cross-provider de-duplication
    dates.js, geo.js    date/countdown and distance helpers
    ics.js              iCalendar + Google Calendar export
    storage.js          localStorage-backed state, backup import/export
    sync.js             merge rules and the account store (Supabase)
    api/supabase.js     lazy Supabase client, sign-in helpers
supabase/schema.sql     tables and row-level security for sync
  __tests__/            vitest unit tests + API fixtures
e2e/smoke.mjs           Playwright smoke test
```
