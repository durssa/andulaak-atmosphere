export const tmEvent = {
  id: 'Z7r9jZ1AdFUoT',
  name: 'Radiohead',
  url: 'https://www.ticketmaster.com/radiohead-tickets/event/Z7r9jZ1AdFUoT',
  images: [
    { ratio: '3_2', url: 'https://img/small.jpg', width: 305, height: 203 },
    { ratio: '16_9', url: 'https://img/wide.jpg', width: 1024, height: 576 },
  ],
  dates: { start: { localDate: '2026-11-21', localTime: '20:00:00', dateTime: '2026-11-21T19:00:00Z' }, timezone: 'Europe/London', status: { code: 'onsale' } },
  classifications: [{ primary: true, segment: { name: 'Music' }, genre: { name: 'Rock' } }],
  priceRanges: [{ type: 'standard', currency: 'GBP', min: 65, max: 120 }],
  _embedded: {
    venues: [{ name: 'The O2', city: { name: 'London' }, state: { name: 'London' }, country: { name: 'United Kingdom', countryCode: 'GB' }, address: { line1: 'Peninsula Square' }, location: { longitude: '0.0032', latitude: '51.5030' } }],
    attractions: [{ name: 'Radiohead' }, { name: 'The Smile' }],
  },
}

export const tmResponse = (events, page = { number: 0, totalPages: 1, totalElements: events.length }) => ({ _embedded: { events }, page })

export const bitEvent = {
  id: '1038801290',
  url: 'https://www.bandsintown.com/e/1038801290',
  datetime: '2026-11-21T20:00:00',
  title: '',
  artist: { name: 'Radiohead', image_url: 'https://img/radiohead.jpg' },
  venue: { name: 'The O2 Arena', latitude: '51.503', longitude: '0.003', city: 'London', region: 'England', country: 'United Kingdom', street_address: 'Peninsula Square' },
  offers: [{ type: 'Tickets', url: 'https://tickets.example/1', status: 'available' }],
  lineup: ['Radiohead', 'The Smile'],
}

export const bitArtist = { name: 'Radiohead', image_url: 'https://img/radiohead.jpg', thumb_url: 'https://img/thumb.jpg', upcoming_event_count: 12, tracker_count: 2000000, url: 'https://www.bandsintown.com/a/1' }

export const sgEvent = {
  id: 5000, type: 'concert', title: 'Radiohead', short_title: 'Radiohead', url: 'https://seatgeek.com/radiohead-tickets/5000', status: 'normal',
  datetime_local: '2026-11-21T20:00:00', datetime_tbd: false, time_tbd: false,
  venue: { name: 'The O2 Arena', address: 'Peninsula Square', city: 'London', state: 'ENG', country: 'GB', timezone: 'Europe/London', location: { lat: 51.503, lon: 0.003 } },
  performers: [{ name: 'Radiohead', primary: true, image: 'https://img/sg-radiohead.jpg', genres: [{ name: 'Rock' }] }],
  stats: { lowest_price: 70, highest_price: 400, average_price: 150 },
}
export const sgResponse = (events, meta = { total: events.length, page: 1, per_page: 50 }) => ({ events, meta })

export const nominatimBerlin = [{ place_id: 1, lat: '52.5170365', lon: '13.3888599', display_name: 'Berlin, Deutschland', address: { city: 'Berlin', country: 'Deutschland', country_code: 'de' } }]
