import { API_URL } from '../config'
import type { Forecast } from './forecast'

const CACHE_MS = 30 * 60 * 1000
let cached: { at: number; promise: Promise<Forecast | null> } | null = null

// One request shared by every page for half an hour; null on any failure,
// which just means no weather line.
export function fetchForecast(): Promise<Forecast | null> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.promise
  const promise = fetch(`${API_URL}/weather/forecast`)
    .then(async (response) => (response.ok ? ((await response.json()) as { data: Forecast | null }).data : null))
    .catch(() => null)
  cached = { at: Date.now(), promise }
  return promise
}
