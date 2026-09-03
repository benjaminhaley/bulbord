import { IonButton, IonContent, IonIcon, IonItem, IonLabel, IonList, IonSearchbar, IonSpinner, IonText } from '@ionic/react'
import { addCircleOutline, checkmarkCircle } from 'ionicons/icons'
import { useEffect, useState } from 'react'

import { useAuth } from '../auth/AuthContext'
import { MosaicMotif } from '../auth/MosaicMotif'
import { Avatar } from '../uploads/Avatar'
import { requestConnection, fetchConnectionsOf, fetchSuggestions, finishFriendsOnboarding, searchMembers, type MemberSummary } from './api'

// Closing screen of the real onboarding flow (feedback #88), shown after
// Continue/Skip below — not part of the AddFriendsPage.tsx reuse (see
// `onFinished` below), since "welcome" only makes sense the first time.
// Same triangulated-mosaic motif as the invite-accept screen (JoinGate.tsx),
// at full brightness here as the flow's one real celebratory moment rather
// than a subtle backdrop.
function WelcomeScreen({ onStart, error }: { onStart: () => void; error: string | null }) {
  return (
    <IonContent fullscreen>
      <div style={{ height: 220, position: 'relative', overflow: 'hidden' }}>
        <MosaicMotif bright />
      </div>
      <div
        style={{
          padding: '24px 24px 0',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <h2 style={{ fontSize: '1.6rem', fontWeight: 700 }}>Welcome to Nettelhorst Bulbord</h2>
        <p style={{ color: 'var(--ion-color-medium)' }}>You're in — take a look around.</p>
        {error && (
          <IonText color="danger">
            <p>{error}</p>
          </IonText>
        )}
        <IonButton expand="block" style={{ width: '100%', marginTop: 24, marginBottom: 72 }} onClick={onStart}>
          Start exploring
        </IonButton>
      </div>
    </IonContent>
  )
}

function MemberRow({
  member,
  added,
  busy,
  onAdd,
}: {
  member: MemberSummary
  added: boolean
  busy: boolean
  onAdd: () => void
}) {
  return (
    <IonItem>
      <Avatar slot="start" url={member.avatarUrl} name={member.name} />
      <IonLabel>
        <h2>{member.name}</h2>
        {member.reason && <p>{member.reason}</p>}
      </IonLabel>
      {added ? (
        <IonIcon slot="end" icon={checkmarkCircle} color="success" />
      ) : busy ? (
        <IonSpinner slot="end" name="dots" />
      ) : (
        <IonButton slot="end" fill="clear" onClick={onAdd} aria-label={`Send friend request to ${member.name}`}>
          <IonIcon icon={addCircleOutline} slot="icon-only" />
        </IonButton>
      )}
    </IonItem>
  )
}

// Shown in place of the real suggestions list in preview mode (feedback,
// 2026-08-16, from a live screenshot: the admin preview was correctly
// calling the real GET /connections/suggestions, but with only a couple of
// real members on Nettelhorst Bulbord so far, that legitimately returns
// "you're already connected with everyone" — a real, correct empty state,
// just a bad one to demo from). Fake ids ('demo-…', never a real UUID) so
// `handleAdd` below can tell these apart and skip the real
// GET /connections/of/:userId call it'd otherwise make for each one.
//
// One row per real suggestion tier (see CLAUDE.md's Connections section —
// api/src/connections/service.ts's actual priority order), in that same
// order, each labeled with `reason` so the ordering itself is visible and
// checkable on the demo screen rather than something to take on faith
// (feedback, 2026-08-16): the inviter, then the inviter's own connections,
// then a same-grade Family match, then — deliberately reason-less, the
// real "everyone else" fallback once those tiers are exhausted — a member
// suggested only because they're on Nettelhorst Bulbord, nothing more
// specific.
const DEMO_SUGGESTIONS: MemberSummary[] = [
  { id: 'demo-1', name: 'Maria Chen', avatarUrl: null, reason: 'Invited you' },
  { id: 'demo-2', name: 'James Okafor', avatarUrl: null, reason: 'Friend of Maria Chen' },
  { id: 'demo-3', name: 'Priya Patel', avatarUrl: null, reason: 'Kid in 2nd grade — same as yours' },
  { id: 'demo-4', name: 'Tom Reilly', avatarUrl: null },
  { id: 'demo-5', name: 'Sofia Kowalski', avatarUrl: null },
]

// Onboarding step shown after ProfileSetupScreen (feedback #83) — "start
// with the person who invited you and then all of those people's friends...
// and then the other people in your kids' grade level," with a search to
// find anyone else. Adding is one-directional and instant (no approval
// needed from the other side, mirroring event_interests' star pattern) —
// the added person is alerted by email instead (connections/service.ts,
// api-side), since there's no in-app notification inbox. Gated by
// users.friendsStepCompletedAt (JoinGate.tsx), a real DB flag so it doesn't
// re-show on another device, but picking anyone here is optional — Continue
// works with zero adds, same as Skip.
//
// `preview` (admin FriendsPreviewPage.tsx, the sign-up flow walkthrough's
// third step, feedback confirmed 2026-08-14) — same shape as
// ProfileSetupScreen's own `preview` prop: real data still loads (the
// suggestions/search GETs are read-only, safe to show for real), but the
// two mutations that would be actively wrong to trigger against the admin's
// own account while just looking at a preview — POST /connections and
// finishing the onboarding step — are skipped. The "Added" checkmark still
// shows on click so the interaction itself stays demonstrable.
//
// `onFinished` (AddFriendsPage.tsx, feedback #91) lets this same component
// be reached again after onboarding — "you can always do this later from
// your Account page," a promise this screen's own copy made before that
// page existed. Its presence (rather than a separate boolean) is also what
// swaps the button's label to "Done": outside onboarding there's no
// Continue/Skip distinction to preserve, since finishing this screen isn't
// advancing a signup flow, it's just closing an add-friends screen.
export function ChooseFriendsScreen({
  preview = false,
  onFinished,
}: { preview?: boolean; onFinished?: () => void } = {}) {
  const { refresh } = useAuth()
  const [suggestions, setSuggestions] = useState<MemberSummary[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(true)
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<MemberSummary[]>([])
  const [searching, setSearching] = useState(false)
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const [addingId, setAddingId] = useState<string | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Local, non-persisted — gates the Welcome screen below (feedback #88).
  // Real onboarding only (never set when `onFinished` is passed, i.e. the
  // AddFriendsPage.tsx reuse) — "welcome" doesn't make sense for an already
  // fully-onboarded member adding one more friend later.
  const [finished, setFinished] = useState(false)

  // Both effects below guard their async continuations with a "still
  // mounted" flag — without it, a fetch that resolves after this screen has
  // already unmounted (e.g. a fast test/story tearing down before a real
  // network round-trip finishes) calls setState on an unmounted component.
  // In a jsdom/browser-mode test run that surfaces as an unhandled
  // rejection attributed to whichever *other* test happens to be running
  // when the leaked promise finally settles — the same class of async-
  // lifecycle gotcha this codebase's IonModal testing notes already
  // document (see CLAUDE.md's Testing section), just from a plain
  // useEffect fetch rather than an overlay component's own lifecycle.
  useEffect(() => {
    if (preview) {
      setSuggestions(DEMO_SUGGESTIONS)
      setLoadingSuggestions(false)
      return
    }
    let cancelled = false
    fetchSuggestions()
      .then((result) => {
        if (!cancelled) setSuggestions(result)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load suggestions')
      })
      .finally(() => {
        if (!cancelled) setLoadingSuggestions(false)
      })
    return () => {
      cancelled = true
    }
  }, [preview])

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setSearchResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    let cancelled = false
    const handle = setTimeout(() => {
      searchMembers(trimmed)
        .then((result) => {
          if (!cancelled) setSearchResults(result)
        })
        .catch(() => {
          if (!cancelled) setSearchResults([])
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [query])

  async function handleAdd(member: MemberSummary) {
    setAddingId(member.id)
    setError(null)
    try {
      if (!preview) await requestConnection(member.id)
      setAddedIds((prev) => new Set(prev).add(member.id))
      // "As you add potential friends, suggest their friends at the bottom
      // of the list" — append the newly-added person's own connections.
      // Still a real (read-only) fetch in preview — nothing unsafe about it,
      // except for DEMO_SUGGESTIONS' own fake ids above, which don't exist
      // to look up.
      if (!member.id.startsWith('demo-')) {
        const theirConnections = await fetchConnectionsOf(member.id)
        setSuggestions((prev) => {
          const existingIds = new Set(prev.map((m) => m.id))
          const additions = theirConnections.filter((c) => !existingIds.has(c.id))
          return [...prev, ...additions]
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add friend')
    } finally {
      setAddingId(null)
    }
  }

  async function finish() {
    // Preview mode never calls the real finish-onboarding endpoint or
    // refresh() — that would mark the admin's own account as having
    // completed a step they didn't actually just complete. It still shows
    // the local Welcome screen below, though (setFinished(true)) — same
    // "every screen stays genuinely demonstrable" posture as every other
    // preview interaction, just stopping short of the real mutation.
    if (preview) {
      setFinished(true)
      return
    }
    setFinishing(true)
    setError(null)
    try {
      await finishFriendsOnboarding()
      if (onFinished) {
        // AddFriendsPage.tsx reuse — unchanged from before: refresh and
        // return immediately, no Welcome screen.
        await refresh()
        onFinished()
      } else {
        // Real onboarding — defer refresh() (the thing that actually
        // advances JoinGate.tsx past this screen) until the member taps
        // "Start exploring" on the Welcome screen below, same pattern
        // ProfileSetupWizard's own completion screen uses.
        setFinished(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not continue')
      setFinishing(false)
    }
  }

  async function startExploring() {
    if (preview) return
    try {
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not continue')
    }
  }

  if (finished) {
    return <WelcomeScreen onStart={startExploring} error={error} />
  }

  const showingSearch = query.trim().length > 0
  const listItems = showingSearch ? searchResults : suggestions

  return (
    <IonContent fullscreen className="ion-padding">
      <h2 className="ion-padding-top">Find your friends</h2>
      <p className="ion-padding-start ion-padding-end" style={{ color: 'var(--ion-color-medium)', marginTop: 0 }}>
        Add people you know on Nettelhorst Bulbord. This is optional — you can always do this later from your Account
        page.
      </p>
      <IonSearchbar value={query} onIonInput={(e) => setQuery(e.detail.value ?? '')} placeholder="Search for someone" />
      <IonList inset>
        {showingSearch && searching && (
          <IonItem lines="none">
            <IonSpinner name="dots" />
          </IonItem>
        )}
        {!showingSearch && loadingSuggestions && (
          <IonItem lines="none">
            <IonSpinner name="dots" />
          </IonItem>
        )}
        {!searching &&
          listItems.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              added={addedIds.has(member.id)}
              busy={addingId === member.id}
              onAdd={() => handleAdd(member)}
            />
          ))}
        {!searching && !loadingSuggestions && listItems.length === 0 && (
          <IonItem lines="none">
            <IonLabel color="medium">
              {showingSearch ? 'No members found' : "You're already connected with everyone on Nettelhorst Bulbord!"}
            </IonLabel>
          </IonItem>
        )}
      </IonList>
      {error && (
        <IonText color="danger">
          <p className="ion-padding-start">{error}</p>
        </IonText>
      )}
      <IonButton expand="block" className="ion-margin-top" disabled={finishing} onClick={finish}>
        {onFinished ? 'Done' : addedIds.size > 0 ? 'Continue' : 'Skip for now'}
      </IonButton>
    </IonContent>
  )
}
