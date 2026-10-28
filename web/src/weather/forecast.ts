// Weather for upcoming listings (feedback #184: "for events within the next
// 10 days... add the expected weather"). The API serves one Nettelhorst-area
// forecast (api/src/weather/service.ts); everything here is pure, picking the
// hours a listing actually runs.

interface HourlyForecast {
  at: string
  temp_f: number
  code: number
  precip_pct: number
}

interface DailyForecast {
  date: string
  high_f: number
  low_f: number
  code: number
  precip_pct: number
}

export interface Forecast {
  hourly: HourlyForecast[]
  daily: DailyForecast[]
}

export interface WeatherSummary {
  code: number
  low_f: number
  high_f: number
  precip_pct: number
}

const FORECAST_DAYS = 10
const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

// WMO weather codes, as Open-Meteo reports them.
function weatherCondition(code: number): { emoji: string; label: string; precip: 'rain' | 'snow' } {
  if (code === 0) return { emoji: '☀️', label: 'Clear', precip: 'rain' }
  if (code === 1) return { emoji: '🌤️', label: 'Mostly clear', precip: 'rain' }
  if (code === 2) return { emoji: '⛅', label: 'Partly cloudy', precip: 'rain' }
  if (code === 3) return { emoji: '☁️', label: 'Cloudy', precip: 'rain' }
  if (code === 45 || code === 48) return { emoji: '🌫️', label: 'Fog', precip: 'rain' }
  if (code >= 51 && code <= 57) return { emoji: '🌦️', label: 'Drizzle', precip: 'rain' }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { emoji: '🌨️', label: 'Snow', precip: 'snow' }
  if (code >= 80 && code <= 82) return { emoji: '🌦️', label: 'Showers', precip: 'rain' }
  if (code >= 95) return { emoji: '⛈️', label: 'Thunderstorms', precip: 'rain' }
  return { emoji: '🌧️', label: 'Rain', precip: 'rain' } // 61–67, and anything unlisted
}

// The hours a timed listing runs: every forecast hour from the one it starts
// in up to its end (just the starting hour when there's no end). WMO codes
// rise roughly with severity, so the highest code is the condition to plan
// for. Null outside the next 10 days, once it's over, or with no forecast.
export function weatherForWindow(forecast: Forecast, startsAt: Date, endsAt: Date | null, now = new Date()): WeatherSummary | null {
  const end = endsAt && endsAt > startsAt ? endsAt : new Date(startsAt.getTime() + HOUR_MS)
  if (end <= now || startsAt.getTime() - now.getTime() > FORECAST_DAYS * DAY_MS) return null
  const fromHour = Math.floor(startsAt.getTime() / HOUR_MS) * HOUR_MS
  const hours = forecast.hourly.filter((h) => {
    const t = new Date(h.at).getTime()
    return t >= fromHour && t < end.getTime()
  })
  if (hours.length === 0) return null
  return {
    code: Math.max(...hours.map((h) => h.code)),
    low_f: Math.min(...hours.map((h) => h.temp_f)),
    high_f: Math.max(...hours.map((h) => h.temp_f)),
    precip_pct: Math.max(...hours.map((h) => h.precip_pct)),
  }
}

// A whole calendar day (an all-day event, a camp day): the day's high/low.
export function weatherForDate(forecast: Forecast, date: string, now = new Date()): WeatherSummary | null {
  const day = forecast.daily.find((d) => d.date === date)
  if (!day) return null
  // The forecast starts today, so only the far end needs a cutoff.
  if (new Date(`${date}T00:00:00`).getTime() - now.getTime() > FORECAST_DAYS * DAY_MS) return null
  return { code: day.code, low_f: day.low_f, high_f: day.high_f, precip_pct: day.precip_pct }
}

// "⛅ Partly cloudy, 52–58° · 30% rain". A whole day reads as high / low;
// a chance under 10% is left out as noise.
export function formatWeather(summary: WeatherSummary, kind: 'hours' | 'day'): string {
  const { emoji, label, precip } = weatherCondition(summary.code)
  const temps =
    kind === 'day' ? `${summary.high_f}° / ${summary.low_f}°` : summary.low_f === summary.high_f ? `${summary.high_f}°` : `${summary.low_f}–${summary.high_f}°`
  const chance = summary.precip_pct >= 10 ? ` · ${summary.precip_pct}% ${precip}` : ''
  return `${emoji} ${label}, ${temps}${chance}`
}

export interface WeatherTiming {
  starts_at?: string | null
  ends_at?: string | null
  all_day?: boolean
  // Calendar date, for an all-day entry.
  date: string
}

// Text for one dated thing, or null when it's out of range/unknown.
export function weatherText(forecast: Forecast | null, timing: WeatherTiming): string | null {
  if (!forecast) return null
  if (timing.all_day || !timing.starts_at) {
    const day = weatherForDate(forecast, timing.date)
    return day && formatWeather(day, 'day')
  }
  const hours = weatherForWindow(forecast, new Date(timing.starts_at), timing.ends_at ? new Date(timing.ends_at) : null)
  return hours && formatWeather(hours, 'hours')
}
