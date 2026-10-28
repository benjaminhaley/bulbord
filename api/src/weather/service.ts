// Weather forecast for upcoming listings (feedback #184). Open-Meteo: free,
// no API key, 16-day forecasts. One forecast for the Nettelhorst area serves
// every listing — events are held to the 1-mile rule and weather doesn't
// change across a neighborhood — cached for an hour so a page view never
// waits on a fresh upstream call more than once an hour.
import { chicagoWallClock } from '../timezone.js'
import { fetchWithTimeout } from '../uploads/fetch-with-timeout.js'

const NETTELHORST = { lat: 41.94167, lng: -87.64472 }
// Ben's ask: "for events within the next 10 days". Day 10's evening needs
// the 11th forecast day's hours too.
const FORECAST_DAYS = 10
const CACHE_MS = 60 * 60 * 1000
const TIMEOUT_MS = 8000

interface HourlyForecast {
  at: string // ISO instant
  temp_f: number
  code: number // WMO weather code
  precip_pct: number
}

interface DailyForecast {
  date: string // Chicago calendar date, YYYY-MM-DD
  high_f: number
  low_f: number
  code: number
  precip_pct: number
}

export interface Forecast {
  hourly: HourlyForecast[]
  daily: DailyForecast[]
}

interface OpenMeteoResponse {
  hourly: { time: number[]; temperature_2m: (number | null)[]; weather_code: (number | null)[]; precipitation_probability: (number | null)[] }
  daily: {
    time: number[]
    temperature_2m_max: (number | null)[]
    temperature_2m_min: (number | null)[]
    weather_code: (number | null)[]
    precipitation_probability_max: (number | null)[]
  }
}

// Unix-time rows -> our shape. Daily times are Chicago midnights (the
// request asks for America/Chicago days), turned into calendar dates here.
// Rows with a missing value are dropped rather than shown as 0°.
export function normalizeForecast(raw: OpenMeteoResponse): Forecast {
  const hourly: HourlyForecast[] = []
  raw.hourly.time.forEach((t, i) => {
    const temp = raw.hourly.temperature_2m[i]
    const code = raw.hourly.weather_code[i]
    if (temp == null || code == null) return
    hourly.push({ at: new Date(t * 1000).toISOString(), temp_f: Math.round(temp), code, precip_pct: raw.hourly.precipitation_probability[i] ?? 0 })
  })
  const daily: DailyForecast[] = []
  raw.daily.time.forEach((t, i) => {
    const high = raw.daily.temperature_2m_max[i]
    const low = raw.daily.temperature_2m_min[i]
    const code = raw.daily.weather_code[i]
    if (high == null || low == null || code == null) return
    daily.push({
      date: chicagoWallClock(new Date(t * 1000)).date,
      high_f: Math.round(high),
      low_f: Math.round(low),
      code,
      precip_pct: raw.daily.precipitation_probability_max[i] ?? 0,
    })
  })
  return { hourly, daily }
}

let cached: { at: number; forecast: Forecast } | null = null

// Null when the upstream call fails — the page simply shows no weather line.
export async function getForecast(now = Date.now()): Promise<Forecast | null> {
  if (cached && now - cached.at < CACHE_MS) return cached.forecast
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${NETTELHORST.lat}&longitude=${NETTELHORST.lng}` +
    '&hourly=temperature_2m,weather_code,precipitation_probability' +
    '&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max' +
    `&temperature_unit=fahrenheit&timezone=America%2FChicago&timeformat=unixtime&forecast_days=${FORECAST_DAYS + 1}`
  const response = await fetchWithTimeout(url, TIMEOUT_MS)
  if (!response?.ok) return cached?.forecast ?? null
  try {
    const forecast = normalizeForecast((await response.json()) as OpenMeteoResponse)
    cached = { at: now, forecast }
    return forecast
  } catch {
    return cached?.forecast ?? null
  }
}
