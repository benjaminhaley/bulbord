// Small red badge anchored to the top-right of an avatar/icon — the one
// shared shape for every "you have something to look at" alert. Feedback
// #132: an earlier version also rendered an amber `color="warning"` variant
// directly on the avatar for the admin-only stale-data nudge (feedback #69),
// distinguishable from a real notification only by its color — "there
// should not be a second way." That variant is gone: the stale-data nudge
// now folds into this same bell badge (see InstitutionBanner.tsx) and its
// own row in the Notifications list (see NotificationsPage.tsx), rather
// than a second, differently-colored dot living somewhere else.
//
// `count`, when given and greater than 1, renders as a small numbered pill
// instead of a plain dot (feedback #98: "add a number to the avatar one if
// there are multiple") — a bare dot still covers "exactly one" and "no
// count available" (the stale-data case has no discrete count).
export function BadgeDot({ label, count }: { label: string; count?: number }) {
  const showNumber = count !== undefined && count > 1

  return (
    <span
      aria-label={label}
      style={{
        position: 'absolute',
        top: -2,
        right: 12,
        minWidth: showNumber ? 16 : 10,
        height: showNumber ? 16 : 10,
        padding: showNumber ? '0 3px' : 0,
        borderRadius: showNumber ? 8 : '50%',
        background: 'var(--ion-color-danger)',
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
