# Encore — Concert Tracker

Discover upcoming concerts, see them on a map, and keep track of the shows you're interested in, going to, or have been to.

**Live app:** https://durssa.github.io/andulaak-atmosphere/

## What it does

- **Discover** — search by artist, by place (city/address or your GPS location) with a distance radius, and by date range. Results are listed and plotted on a map.
- **Artists** — follow artists; Encore checks their tour dates (refreshed every 6 hours) and surfaces new shows on the Home page, nearest-to-home first.
- **My Concerts** — track any event as *Interested*, *Going* or *Attended*. Add notes, rate shows you attended, export everything to your calendar (.ics) or add a single show to Google Calendar.
- **Home** — countdown to your next show, stats, and upcoming dates from the artists you follow.
- Works offline-first: all data lives in your browser's localStorage; export/import a JSON backup from Settings.

## Integrations

| Provider | Used for | Key needed? |
| --- | --- | --- |
| [Ticketmaster Discovery API](https://developer.ticketmaster.com/) | Location-radius search, keyword search, prices, genres, ticket status, artist autocomplete | Yes (free, 5k calls/day) — paste it in **Settings** or set `VITE_TICKETMASTER_API_KEY` |
| [Bandsintown](https://www.bandsintown.com/) | Artist tour dates and artist profiles | No |
| [Google Maps Platform](https://developers.google.com/maps) | Map rendering (Maps JavaScript API) and geocoding | Optional — paste it in **Settings** or set `VITE_GOOGLE_MAPS_API_KEY` |
| [Leaflet](https://leafletjs.com/) + [OpenStreetMap](https://www.openstreetmap.org/) / [CARTO](https://carto.com/attributions) tiles | Map rendering when no Google key is set | No |
| [Nominatim](https://nominatim.org/) | Geocoding when no Google key is set | No |
| Browser Geolocation | "Use my location" | No |
| Google Maps directions links, Google Calendar links, iCalendar export | Getting there and remembering | No |

Everything runs in the browser — there is no backend. Keys you enter in Settings never leave your device except in requests to the provider they belong to.

### Without any keys

Artist search (Bandsintown), following artists, tracking, calendar export and the OpenStreetMap map all work with zero configuration. Searching **by location** requires a Ticketmaster key because it is the only free provider with geo search.

## Development

```bash
cd concert-tracker
npm install
npm run dev        # http://localhost:5173
npm run lint
npm test           # unit tests (vitest)
npm run build
npm run test:e2e   # headless-Chromium smoke test against ./dist with mocked APIs
```

Copy `.env.example` to `.env.local` to bake keys into a local build.

## Deployment

`.github/workflows/deploy-concert-tracker.yml` builds the app and publishes it to GitHub Pages on every push to `master` that touches `concert-tracker/`. The workflow enables Pages on first run. To ship API keys with the build, add `TICKETMASTER_API_KEY` and/or `GOOGLE_MAPS_API_KEY` as repository Actions secrets; otherwise users enter keys in the app's Settings page.

If a Google Maps key is shipped, restrict it to the site's URL (HTTP referrer restriction) in Google Cloud Console.

## Project layout

```
src/
  App.jsx               shell, hash routing, global state (tracked, artists, feeds, settings)
  context.jsx           React context + constants
  components/           MapView (Leaflet + Google Maps), EventCard, Toast
  views/                Home, Discover, Artists, MyConcerts, Settings
  lib/
    api/                ticketmaster.js, bandsintown.js, geocode.js, googleMaps.js, index.js (facade)
    normalize.js        provider → common event shape, cross-provider de-duplication
    dates.js, geo.js    date/countdown and distance helpers
    ics.js              iCalendar + Google Calendar export
    storage.js          localStorage-backed state, backup import/export
  __tests__/            vitest unit tests + API fixtures
e2e/smoke.mjs           Playwright smoke test
```
