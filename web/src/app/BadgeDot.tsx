// Small badge anchored to a corner of an avatar — shared shape for the
// stale-data indicator (feedback #69, admin-only) and the unified
// notification-count indicator (feedback #100, replacing three earlier
// separate mechanisms — see InstitutionBanner.tsx). `corner` positions each
// badge at a different spot so an admin with both active at once sees two
// separate dots, not one overlapping another. `count`, when given and
// greater than 1, renders as a small numbered pill instead of a plain dot
// (feedback #98: "add a number to the avatar one if there are multiple") —
// a bare dot still covers the "exactly one" and "no count available"
// (stale-data) cases, since a number only adds information once there's
// more than one thing to distinguish.
//
// `color` defaults to danger (a real, personal "you have something new"
// notification) — feedback #114: the stale-data badge on the avatar used
// the same red dot with no visible way to tell it apart from a genuine
// notification, so a legitimately-working "data hasn't been refreshed in a
// week" nudge read as "broken notification code." The stale-data badge now
// passes color="warning" (amber) specifically so an admin can tell at a
// glance which kind of dot they're looking at, without needing to open Dev
// Tools first.
export function BadgeDot({
  corner,
  label,
  count,
  color = 'danger',
}: {
  corner: 'top-right' | 'bottom-right'
  label: string
  count?: number
  color?: 'danger' | 'warning'
}) {
  const showNumber = count !== undefined && count > 1
  const positionStyle: React.CSSProperties = corner === 'top-right' ? { top: -2, right: 12 } : { bottom: -2, right: 4 }

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
        background: `var(--ion-color-${color})`,
        border: '1.5px solid var(--banner-bg)',
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
