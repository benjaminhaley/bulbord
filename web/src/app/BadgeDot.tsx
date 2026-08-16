// Small red badge anchored to a corner of an avatar/icon — shared shape for
// the stale-data (feedback #69), new-friend-activity (feedback #94), and
// new-feedback-reply (feedback #98) indicators, which previously each
// carried (or would have carried) their own copy of this same style object.
// `corner` positions each badge at a different spot so a viewer with more
// than one active at once sees separate dots, not one overlapping another.
// `count`, when given and greater than 1, renders as a small numbered pill
// instead of a plain dot (feedback #98: "add a number to the avatar one if
// there are multiple") — a bare dot still covers the "exactly one" and
// "no count available" (stale-data, friend-activity) cases, since a number
// only adds information once there's more than one thing to distinguish.
export function BadgeDot({
  corner,
  label,
  count,
  borderColor = 'var(--banner-bg)',
}: {
  corner: 'top-left' | 'top-right' | 'bottom-right'
  label: string
  count?: number
  // The dot's border is a halo separating it from whatever sits behind it
  // (an avatar photo against the dark banner background, by default) —
  // override it when the badge sits somewhere with a different background,
  // e.g. the tab bar's own light background (see FeedbackTabIcon.tsx).
  borderColor?: string
}) {
  const showNumber = count !== undefined && count > 1
  const positionStyle: React.CSSProperties =
    corner === 'top-left'
      ? { top: -2, left: -2 }
      : corner === 'top-right'
        ? { top: -2, right: 12 }
        : { bottom: -2, right: 4 }

  return (
    <span
      aria-label={label}
      style={{
        position: 'absolute',
        ...positionStyle,
        minWidth: showNumber ? 16 : 10,
        height: showNumber ? 16 : 10,
        padding: showNumber ? '0 3px' : 0,
        borderRadius: showNumber ? 8 : '50%',
        background: 'var(--ion-color-danger)',
        border: `1.5px solid ${borderColor}`,
        color: '#fff',
        fontSize: '0.625rem',
        fontWeight: 600,
        lineHeight: showNumber ? '13px' : undefined,
        textAlign: 'center',
        boxSizing: 'border-box',
      }}
    >
      {showNumber ? count : null}
    </span>
  )
}
