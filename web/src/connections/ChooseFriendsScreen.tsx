import { IonButton, IonContent, IonIcon, IonItem, IonLabel, IonList, IonSearchbar, IonSpinner, IonText } from '@ionic/react'
import { addCircleOutline, checkmarkCircle } from 'ionicons/icons'
import { useEffect, useState } from 'react'

import { useAuth } from '../auth/AuthContext'
import { Avatar } from '../uploads/Avatar'
import { addConnection, fetchConnectionsOf, fetchSuggestions, finishFriendsOnboarding, searchMembers, type MemberSummary } from './api'

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
      <IonLabel>{member.name}</IonLabel>
      {added ? (
        <IonIcon slot="end" icon={checkmarkCircle} color="success" />
      ) : busy ? (
        <IonSpinner slot="end" name="dots" />
      ) : (
        <IonButton slot="end" fill="clear" onClick={onAdd} aria-label={`Add ${member.name}`}>
          <IonIcon icon={addCircleOutline} slot="icon-only" />
        </IonButton>
      )}
    </IonItem>
  )
}

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
export function ChooseFriendsScreen({ preview = false }: { preview?: boolean } = {}) {
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

  useEffect(() => {
    fetchSuggestions()
      .then(setSuggestions)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load suggestions'))
      .finally(() => setLoadingSuggestions(false))
  }, [])

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setSearchResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    const handle = setTimeout(() => {
      searchMembers(trimmed)
        .then(setSearchResults)
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false))
    }, 300)
    return () => clearTimeout(handle)
  }, [query])

  async function handleAdd(member: MemberSummary) {
    setAddingId(member.id)
    setError(null)
    try {
      if (!preview) await addConnection(member.id)
      setAddedIds((prev) => new Set(prev).add(member.id))
      // "As you add potential friends, suggest their friends at the bottom
      // of the list" — append the newly-added person's own connections.
      // Still a real (read-only) fetch in preview — nothing unsafe about it.
      const theirConnections = await fetchConnectionsOf(member.id)
      setSuggestions((prev) => {
        const existingIds = new Set(prev.map((m) => m.id))
        const additions = theirConnections.filter((c) => !existingIds.has(c.id))
        return [...prev, ...additions]
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add friend')
    } finally {
      setAddingId(null)
    }
  }

  async function finish() {
    // Preview mode never calls the real finish-onboarding endpoint or
    // refresh() — that would mark the admin's own account as having
    // completed a step they didn't actually just complete.
    if (preview) return
    setFinishing(true)
    setError(null)
    try {
      await finishFriendsOnboarding()
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not continue')
      setFinishing(false)
    }
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
        {addedIds.size > 0 ? 'Continue' : 'Skip for now'}
      </IonButton>
    </IonContent>
  )
}
