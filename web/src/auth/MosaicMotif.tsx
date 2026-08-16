// A small decorative echo of the real app icon (web/ios/App/App/Assets.xcassets/
// AppIcon.appiconset — a red/gold triangulated stained-glass mosaic), used as
// a background flourish on the invite-accept and post-onboarding welcome
// screens (feedback #88's "first class onboarding" redesign). Deliberately a
// fixed, hand-placed set of triangles rather than randomly generated on each
// render — a stable decoration, not a different pattern every time the
// screen remounts.
const PALETTE = ['#c8562f', '#dd9d1f', '#9c3b23', '#efc35e', '#b5461f']

interface Triangle {
  top: string
  left: string
  size: number
  rotate: number
  color: string
}

const TRIANGLES: Triangle[] = [
  { top: '-6%', left: '4%', size: 110, rotate: 0, color: PALETTE[0] },
  { top: '2%', left: '58%', size: 90, rotate: 180, color: PALETTE[1] },
  { top: '14%', left: '30%', size: 70, rotate: 90, color: PALETTE[2] },
  { top: '-4%', left: '78%', size: 130, rotate: 270, color: PALETTE[3] },
  { top: '20%', left: '2%', size: 60, rotate: 180, color: PALETTE[4] },
  { top: '10%', left: '86%', size: 80, rotate: 0, color: PALETTE[0] },
  { top: '28%', left: '46%', size: 55, rotate: 270, color: PALETTE[1] },
]

export function MosaicMotif({ bright = false }: { bright?: boolean }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        opacity: bright ? 1 : 0.14,
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      {TRIANGLES.map((t, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: t.top,
            left: t.left,
            width: t.size,
            height: t.size,
            background: t.color,
            transform: `rotate(${t.rotate}deg)`,
            clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)',
          }}
        />
      ))}
    </div>
  )
}
