# Apps

A small collection of browser-only web apps. Each one lives in its own folder under `apps/`, has its own `package.json`, and runs with `npm install && npm run dev`.

| App | What it does | Live |
| --- | --- | --- |
| [Encore](apps/concert-tracker/) | Concert tracker: find shows via Ticketmaster, SeatGeek and Bandsintown, import artists from Spotify, see everything on a map, and keep track of the concerts you're going to. | https://durssa.github.io/andulaak-atmosphere/ |
| [Atmosphere](apps/atmosphere/) | Ambience controller for tabletop sessions: scenes, YouTube and Spotify audio, soundboard, session planning. | — |

## Deployment

`.github/workflows/deploy-concert-tracker.yml` lints, tests and builds Encore on every push to `master` that touches `apps/concert-tracker/`, then publishes the build to the `gh-pages` branch, which GitHub Pages serves. API keys can be added as repository secrets (see the app README) or entered by users inside the app.
