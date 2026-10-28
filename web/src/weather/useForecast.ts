import { useEffect, useState } from 'react'

import { fetchForecast } from './api'
import type { Forecast } from './forecast'

export function useForecast(): Forecast | null {
  const [forecast, setForecast] = useState<Forecast | null>(null)
  useEffect(() => {
    let live = true
    fetchForecast().then((f) => live && setForecast(f))
    return () => {
      live = false
    }
  }, [])
  return forecast
}
