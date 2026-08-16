import { useState } from 'react'

// A small, dependency-free bar chart for the 30-day daily-active-visitors
// trend (feedback #96) — one flat-colored bar per day (height already
// encodes the count, so color needs no magnitude ramp of its own), thin
// marks with rounded data-ends, a recessive baseline, and sparse axis
// labels (every ~5th day) rather than 30 colliding date strings. Built by
// hand rather than a charting dependency, same "~150 lines, no new
// package" posture as calendarLinks.ts.
export function DauChart({ data }: { data: { date: string; count: number }[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const width = 320
  const height = 120
  const barGap = 2
  const barWidth = data.length ? width / data.length - barGap : 0
  const max = Math.max(1, ...data.map((d) => d.count))
  const labelEvery = Math.max(1, Math.ceil(data.length / 6))

  const active = activeIndex !== null ? data[activeIndex] : null

  return (
    <div>
      <p style={{ minHeight: 20, margin: '0 0 4px', fontSize: '0.875rem', fontWeight: 600 }}>
        {active ? `${formatDay(active.date)}: ${active.count} active` : ' '}
      </p>
      <svg
        viewBox={`0 0 ${width} ${height + 20}`}
        width="100%"
        role="img"
        aria-label={`Daily active members, last ${data.length} days`}
      >
        <line x1={0} y1={height} x2={width} y2={height} stroke="var(--ion-color-step-150, #d9d9d9)" strokeWidth={1} />
        {data.map((d, i) => {
          const barHeight = (d.count / max) * (height - 8)
          const x = i * (barWidth + barGap)
          const y = height - barHeight
          return (
            <g key={d.date}>
              <rect
                x={x}
                y={y}
                width={Math.max(barWidth, 1)}
                height={Math.max(barHeight, 0)}
                rx={2}
                fill="var(--ion-color-primary)"
                opacity={activeIndex === null || activeIndex === i ? 1 : 0.5}
                onClick={() => setActiveIndex(i)}
                style={{ cursor: 'pointer' }}
              />
              {i % labelEvery === 0 && (
                <text x={x + barWidth / 2} y={height + 14} fontSize={9} fill="var(--ion-color-medium)" textAnchor="middle">
                  {formatDay(d.date, true)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <details style={{ marginTop: 8 }}>
        <summary style={{ fontSize: '0.8125rem', color: 'var(--ion-color-medium)', cursor: 'pointer' }}>View as table</summary>
        <table style={{ width: '100%', fontSize: '0.8125rem', borderCollapse: 'collapse', marginTop: 4 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '2px 8px 2px 0' }}>Date</th>
              <th style={{ textAlign: 'right', padding: '2px 0' }}>Active</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.date}>
                <td style={{ padding: '2px 8px 2px 0' }}>{formatDay(d.date)}</td>
                <td style={{ textAlign: 'right', padding: '2px 0' }}>{d.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}

// Parsed as local midnight, not UTC midnight — same convention dayLabel.ts
// uses for every other `YYYY-MM-DD` date string in this codebase.
function formatDay(isoDate: string, short = false): string {
  const date = new Date(`${isoDate}T00:00:00`)
  return date.toLocaleDateString('en-US', short ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })
}
