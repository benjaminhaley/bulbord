// The 1-mile rule (feedback #179, 2026-09-30): an event the pipeline finds
// should be within a mile of Nettelhorst unless a member posted it by hand or
// its source is marked distance-exempt (event_sources.distance_exempt — a
// destination worth the trip, e.g. Lincoln Park Zoo). A failing check holds
// the event back as pending for review rather than rejecting it outright
// (Ben: "flag for review — this should be rare").
//
// Locating an event, in order: coordinates already on the row → geocode its
// address (US Census geocoder for a street address, then OpenStreetMap's
// Nominatim for a venue or landmark) → a web search for the venue's street
// address (the "Fall Family Fest at Endeavor Health Fire Pitch" case: a
// venue name only, no address) → Nominatim on the venue name. An address
// found by search is written back onto the event, since it was missing.
import { createWithServerTools, parseFinalJson } from '../claude.js'
import { fetchWithTimeout } from '../uploads/fetch-with-timeout.js'
import type { CheckResult } from './candidate-checks.js'

const MAX_DISTANCE_MILES = 1
const NETTELHORST_COORDS = { lat: 41.94167, lng: -87.64472 }
const EARTH_RADIUS_MILES = 3958.8
const GEOCODE_TIMEOUT_MS = 10_000
const SEARCH_TIMEOUT_MS = 120_000
// Chicagoland — a Nominatim match outside it is a same-named place elsewhere.
const CHICAGOLAND_VIEWBOX = '-88.4,42.5,-87.3,41.4'
// Nominatim's usage policy: at most one request per second.
const NOMINATIM_GAP_MS = 1100

export interface Coords {
  lat: number
  lng: number
}

export function milesFromNettelhorst({ lat, lng }: Coords): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat - NETTELHORST_COORDS.lat)
  const dLng = toRad(lng - NETTELHORST_COORDS.lng)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(NETTELHORST_COORDS.lat)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_MILES * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function distanceVerdict(miles: number, exempt: boolean, where: string): CheckResult {
  const rounded = miles < 0.1 ? 'under 0.1' : miles.toFixed(1)
  if (miles <= MAX_DISTANCE_MILES) return { pass: true, reason: `${rounded} mi from Nettelhorst (${where})`, attempts: 1 }
  if (exempt) return { pass: true, reason: `${rounded} mi from Nettelhorst (${where}) — its source is allowed beyond 1 mile`, attempts: 1 }
  return { pass: false, reason: `${rounded} mi from Nettelhorst (${where}) — over the ${MAX_DISTANCE_MILES} mile limit`, attempts: 1 }
}

// "3252 N Broadway" alone is ambiguous nationally — the Census geocoder
// needs a city or ZIP to match it.
export function withChicagoDefault(address: string): string {
  return /\b(IL|Illinois)\b|\b\d{5}\b/i.test(address) ? address : `${address}, Chicago, IL`
}

function toCoords(lat: unknown, lng: unknown): Coords | null {
  const la = Number(lat)
  const ln = Number(lng)
  return Number.isFinite(la) && Number.isFinite(ln) && (la !== 0 || ln !== 0) ? { lat: la, lng: ln } : null
}

async function geocodeCensus(address: string): Promise<Coords | null> {
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=${encodeURIComponent(withChicagoDefault(address))}`
  const response = await fetchWithTimeout(url, GEOCODE_TIMEOUT_MS)
  if (!response?.ok) return null
  try {
    const body = (await response.json()) as { result?: { addressMatches?: { coordinates?: { x?: number; y?: number } }[] } }
    const match = body.result?.addressMatches?.[0]?.coordinates
    return match ? toCoords(match.y, match.x) : null
  } catch {
    return null
  }
}

let nominatimNext = 0
async function geocodeNominatim(query: string): Promise<Coords | null> {
  const wait = nominatimNext - Date.now()
  nominatimNext = Math.max(Date.now(), nominatimNext) + NOMINATIM_GAP_MS
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&bounded=1&viewbox=${CHICAGOLAND_VIEWBOX}&q=${encodeURIComponent(query)}`
  const response = await fetchWithTimeout(url, GEOCODE_TIMEOUT_MS)
  if (!response?.ok) return null
  try {
    const [first] = (await response.json()) as { lat?: string; lon?: string }[]
    return first ? toCoords(first.lat, first.lon) : null
  } catch {
    return null
  }
}

async function geocodeAddress(address: string): Promise<Coords | null> {
  return (await geocodeCensus(address)) ?? (await geocodeNominatim(address))
}

interface LocationLookup {
  address: string | null
  online: boolean
  explanation: string
}

const LOOKUP_SYSTEM_PROMPT = `You find where an event takes place, for a Chicago family events app. Given an event's title, description, venue name and (possibly vague or missing) address, use web search to find the street address of the venue where it happens. The venue is most likely in Chicago or its suburbs, but don't assume — a same-named venue in another city is possible, so match on the event's own details.

Respond with ONLY a JSON object, no markdown fences: {"address": string | null, "online": boolean, "explanation": string}. "address" is a full street address with city and state (e.g. "2430 N Cannon Dr, Chicago, IL 60614"), or null if you genuinely can't find one. "online" is true only for a virtual/online-only event. "explanation" is one short sentence on how you found it (or why not).`

async function lookUpLocation(input: DistanceInput): Promise<LocationLookup | null> {
  try {
    const message = await createWithServerTools(
      {
        model: 'claude-opus-5',
        max_tokens: 4000,
        output_config: { effort: 'low' },
        system: LOOKUP_SYSTEM_PROMPT,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }],
        messages: [
          {
            role: 'user',
            content: JSON.stringify({ title: input.title, description: input.description ?? null, location_name: input.locationName ?? null, address: input.address ?? null }),
          },
        ],
      },
      SEARCH_TIMEOUT_MS,
    )
    if (!message || message.stop_reason === 'refusal') return null
    const parsed = parseFinalJson(message, 'object') as { address?: unknown; online?: unknown; explanation?: unknown } | null
    if (!parsed) return null
    return {
      address: typeof parsed.address === 'string' && parsed.address.trim() ? parsed.address.trim() : null,
      online: parsed.online === true,
      explanation: typeof parsed.explanation === 'string' ? parsed.explanation : '',
    }
  } catch {
    return null
  }
}

export interface DistanceInput {
  title: string
  description?: string | null
  address?: string | null
  locationName?: string | null
  latitude?: string | null
  longitude?: string | null
  // The event's source is marked distance-exempt.
  exempt: boolean
}

export interface DistanceResult {
  check: CheckResult
  // Set when the event was located, to store on the row.
  latitude?: string
  longitude?: string
  // A street address found by web search for an event that had none.
  foundAddress?: string
}

// Never throws: every lookup degrades to "couldn't locate", which fails the
// check (held for review) rather than passing an unknown location.
export async function checkDistance(input: DistanceInput): Promise<DistanceResult> {
  const located = (coords: Coords, where: string, foundAddress?: string): DistanceResult => ({
    check: distanceVerdict(milesFromNettelhorst(coords), input.exempt, where),
    latitude: coords.lat.toFixed(6),
    longitude: coords.lng.toFixed(6),
    ...(foundAddress ? { foundAddress } : {}),
  })

  try {
    const stored = toCoords(input.latitude, input.longitude)
    if (stored) return located(stored, 'stored coordinates')

    const address = input.address?.trim()
    if (address) {
      const coords = await geocodeAddress(address)
      if (coords) return located(coords, address)
    }

    const lookup = await lookUpLocation(input)
    if (lookup?.online && !lookup.address) return { check: { pass: true, reason: 'Online event — no physical location', attempts: 1 } }
    if (lookup?.address) {
      const coords = await geocodeAddress(lookup.address)
      if (coords) return located(coords, lookup.address, address ? undefined : lookup.address)
    }

    const venue = input.locationName?.trim()
    if (venue) {
      const coords = await geocodeNominatim(venue)
      if (coords) return located(coords, venue)
    }

    const why = lookup?.explanation ? ` ${lookup.explanation}` : ''
    return { check: { pass: false, reason: `Couldn't find where this is, so couldn't confirm it's within ${MAX_DISTANCE_MILES} mile.${why}`, attempts: 1 } }
  } catch (err) {
    return { check: { pass: false, reason: `Distance check errored: ${err instanceof Error ? err.message : 'unknown error'}`, attempts: 1 } }
  }
}

// For an event a member posted by hand — the rule doesn't apply to them.
export const MANUAL_POST_DISTANCE_CHECK: CheckResult = { pass: true, reason: 'Posted by a member — the 1 mile rule only applies to sourced events', attempts: 1 }
