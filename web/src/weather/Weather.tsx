import { factLineStyle } from '../theme/layout'
import { formatWeather, weatherForDate, weatherText, type WeatherTiming } from './forecast'
import { useForecast } from './useForecast'

// A labeled fact line for an event's own detail page.
export function WeatherLine({ timing }: { timing: WeatherTiming }) {
  const text = weatherText(useForecast(), timing)
  return text ? <p style={factLineStyle}>Weather: {text}</p> : null
}

// A camp's date range: its days that fall in the forecast — one line for a
// single-day camp, else a short list.
export function WeatherDays({ startDate, endDate }: { startDate: string; endDate: string }) {
  const forecast = useForecast()
  if (!forecast) return null
  const days = forecast.daily.flatMap((d) => {
    const summary = d.date >= startDate && d.date <= endDate ? weatherForDate(forecast, d.date) : null
    return summary ? [{ date: d.date, text: formatWeather(summary, 'day') }] : []
  })
  if (days.length === 0) return null
  if (startDate === endDate) return <p style={factLineStyle}>Weather: {days[0].text}</p>
  return (
    <>
      <p style={factLineStyle}>Weather:</p>
      <ul style={{ marginTop: 0, marginBottom: 4, paddingLeft: 20 }}>
        {days.map((d) => (
          <li key={d.date} style={{ marginBottom: 2 }}>
            {new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}: {d.text}
          </li>
        ))}
      </ul>
    </>
  )
}
