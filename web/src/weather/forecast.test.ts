import { describe, expect, it } from 'vitest'

import { formatWeather, weatherForDate, weatherForWindow, type Forecast } from './forecast'

const NOW = new Date('2026-10-28T15:00:00Z')

function hour(iso: string, temp_f: number, code = 2, precip_pct = 0) {
  return { at: new Date(iso).toISOString(), temp_f, code, precip_pct }
}

const FORECAST: Forecast = {
  hourly: [
    hour('2026-10-30T17:00:00Z', 52, 2, 5),
    hour('2026-10-30T18:00:00Z', 55, 61, 40),
    hour('2026-10-30T19:00:00Z', 58, 3, 20),
    hour('2026-10-30T20:00:00Z', 60, 0, 0),
  ],
  daily: [
    { date: '2026-10-30', high_f: 61, low_f: 45, code: 3, precip_pct: 20 },
    { date: '2026-11-09', high_f: 50, low_f: 40, code: 71, precip_pct: 60 },
  ],
}

describe('weatherForWindow', () => {
  it('covers the hours the event runs: worst condition, temperature range, highest chance', () => {
    // 12:30–2pm Chicago: the 17:00Z hour it starts in, through 18:00Z; not 19:00Z.
    const summary = weatherForWindow(FORECAST, new Date('2026-10-30T17:30:00Z'), new Date('2026-10-30T19:00:00Z'), NOW)
    expect(summary).toEqual({ code: 61, low_f: 52, high_f: 55, precip_pct: 40 })
  })

  it('uses just the starting hour when there is no end time', () => {
    expect(weatherForWindow(FORECAST, new Date('2026-10-30T19:00:00Z'), null, NOW)).toEqual({ code: 3, low_f: 58, high_f: 58, precip_pct: 20 })
  })

  it('shows nothing more than 10 days out, or once it is over', () => {
    expect(weatherForWindow(FORECAST, new Date('2026-11-08T18:00:00Z'), null, NOW)).toBeNull()
    expect(weatherForWindow(FORECAST, new Date('2026-10-30T17:00:00Z'), null, new Date('2026-10-31T00:00:00Z'))).toBeNull()
  })
})

describe('weatherForDate', () => {
  it("uses the day's high/low", () => {
    expect(weatherForDate(FORECAST, '2026-10-30', NOW)).toEqual({ code: 3, low_f: 45, high_f: 61, precip_pct: 20 })
  })

  it('stops at 10 days even when the forecast goes further', () => {
    expect(weatherForDate(FORECAST, '2026-11-09', NOW)).toBeNull()
  })
})

describe('formatWeather', () => {
  it('reads as condition, temperatures, and chance of rain', () => {
    expect(formatWeather({ code: 61, low_f: 52, high_f: 55, precip_pct: 40 }, 'hours')).toBe('🌧️ Rain, 52–55° · 40% rain')
    expect(formatWeather({ code: 3, low_f: 45, high_f: 61, precip_pct: 20 }, 'day')).toBe('☁️ Cloudy, 61° / 45° · 20% rain')
  })

  it('says snow for snow, and leaves out a negligible chance', () => {
    expect(formatWeather({ code: 73, low_f: 30, high_f: 30, precip_pct: 70 }, 'hours')).toBe('🌨️ Snow, 30° · 70% snow')
    expect(formatWeather({ code: 0, low_f: 70, high_f: 70, precip_pct: 5 }, 'hours')).toBe('☀️ Clear, 70°')
  })
})
