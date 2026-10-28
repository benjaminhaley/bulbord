import { describe, expect, it } from 'vitest'

import { normalizeForecast } from './service.js'

describe('normalizeForecast', () => {
  it('turns Open-Meteo rows into instants and Chicago calendar dates, rounding temperatures', () => {
    const chicagoMidnightOct28 = Date.UTC(2026, 9, 28, 5) / 1000
    const forecast = normalizeForecast({
      hourly: { time: [chicagoMidnightOct28], temperature_2m: [60.6], weather_code: [3], precipitation_probability: [12] },
      daily: {
        time: [chicagoMidnightOct28],
        temperature_2m_max: [75.4],
        temperature_2m_min: [50.3],
        weather_code: [61],
        precipitation_probability_max: [null],
      },
    })
    expect(forecast.hourly).toEqual([{ at: '2026-10-28T05:00:00.000Z', temp_f: 61, code: 3, precip_pct: 12 }])
    expect(forecast.daily).toEqual([{ date: '2026-10-28', high_f: 75, low_f: 50, code: 61, precip_pct: 0 }])
  })

  it('drops rows with a missing temperature or condition instead of showing 0°', () => {
    const forecast = normalizeForecast({
      hourly: { time: [0, 3600], temperature_2m: [null, 50], weather_code: [1, null], precipitation_probability: [0, 0] },
      daily: { time: [], temperature_2m_max: [], temperature_2m_min: [], weather_code: [], precipitation_probability_max: [] },
    })
    expect(forecast.hourly).toEqual([])
  })
})
