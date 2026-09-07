import {
  IonActionSheet,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToast,
  IonToolbar,
} from '@ionic/react'
import { checkmarkOutline, closeOutline, createOutline, ellipsisVerticalOutline, star, starOutline, timeOutline, trashOutline } from 'ionicons/icons'
import { useEffect, useState } from 'react'
import { useHistory, useParams } from 'react-router-dom'

import { track } from '../analytics/api'
import { AddToCalendarButton } from '../calendar/AddToCalendarButton'
import { InlineImageEditor } from '../edit-history/InlineField'
import { factLineStyle, leadingButtonGap } from '../theme/layout'
import { Avatar } from '../uploads/Avatar'
import { deleteEvent, fetchEvent, updateEvent, type Event } from './api'
import { CommentsSection } from './CommentsSection'
import { EventBody, type EventBodyDraft } from './EventBody'
import { InterestedBadge } from './InterestedBadge'
import { useEventImageUpload } from './useEventImageUpload'
import { useEventInterest } from './useEventInterest'

function draftFromEvent(event: Event): EventBodyDraft {
  return {
    title: event.title,
    description: event.description ?? '',
    start_date: event.start_date,
    start_time: event.start_time?.slice(0, 5) ?? '',
    end_time: event.end_time?.slice(0, 5) ?? '',
    all_day: event.all_day,
    location_name: event.location_name ?? '',
    address: event.address ?? '',
    source_url: event.source_url ?? '',
    topic: event.topic ?? '',
  }
}

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const history = useHistory()
  const [event, setEvent] = useState<Event | null>(null)
  const [error, setError] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<EventBodyDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedToast, setSavedToast] = useState(false)
  const { pending: interestPending, setInterest, clearInterest } = useEventInterest(setEvent)
  const { image, fileInputRef, uploading, attach, setImage } = useEventImageUpload(null)
  const [menuOpen, setMenuOpen] = useState(false)

  async function remove() {
    if (!event || !window.confirm('Delete this event?')) return
    await deleteEvent(event.id)
    history.push('/events')
  }

  function startEditing() {
    if (!event) return
    setDraft(draftFromEvent(event))
    setImage(event.image_url && event.thumbnail_url ? { image_url: event.image_url, thumbnail_url: event.thumbnail_url } : null)
    setSaveError(null)
    setEditing(true)
  }

  function cancelEditing() {
    setEditing(false)
    setDraft(null)
    setSaveError(null)
  }

  async function save() {
    if (!event || !draft) return
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await updateEvent(event.id, {
        title: draft.title,
        description: draft.description,
        start_date: draft.start_date,
        start_time: draft.start_time,
        end_time: draft.end_time,
        all_day: draft.all_day,
        location_name: draft.location_name,
        address: draft.address,
        source_url: draft.source_url,
        topic: draft.topic,
        image_url: image?.image_url ?? null,
        thumbnail_url: image?.thumbnail_url ?? null,
      })
      setEvent(updated)
      setEditing(false)
      setDraft(null)
      setSavedToast(true)
    } catch {
      setSaveError('Could not save changes')
    } finally {
      setSaving(false)
    }
  }

  function toggleInterest() {
    if (!event) return
    if (event.interest_status === 'interested') {
      clearInterest(event)
    } else {
      setInterest(event, 'interested')
    }
  }

  useEffect(() => {
    setEvent(null)
    setError(false)
    setEditing(false)
    setDraft(null)
    fetchEvent(id)
      .then(setEvent)
      .catch(() => setError(true))
  }, [id])

  // Feedback #96's "number of people viewing events."
  useEffect(() => {
    track('event_viewed', { eventId: id }).catch(() => {})
  }, [id])

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/events" />
          </IonButtons>
          <IonTitle>{editing ? 'Edit Event' : (event?.title ?? 'Event')}</IonTitle>
          {event && (
            <IonButtons slot="end">
              {editing ? (
                <>
                  {/* History stays reachable while editing too (feedback
                      #141's own literal ask), but Cancel/Save are edit
                      mode's own active controls, not auxiliary actions —
                      only three buttons here, no clutter to bury. */}
                  <IonButton routerLink={`/events/${event.id}/history`}>
                    <IonIcon slot="icon-only" icon={timeOutline} />
                  </IonButton>
                  <IonButton onClick={cancelEditing} disabled={saving}>
                    <IonIcon slot="icon-only" icon={closeOutline} />
                  </IonButton>
                  <IonButton onClick={save} disabled={saving || uploading || !draft?.title.trim() || !draft?.address.trim()}>
                    {saving ? <IonSpinner name="dots" /> : <IonIcon slot="icon-only" icon={checkmarkOutline} />}
                  </IonButton>
                </>
              ) : (
                <>
                  {/* History/Edit/Delete buried under one overflow menu,
                      same pattern as feedback #95's FeedbackPage.tsx
                      redesign ("gotten kind of ridiculous, take up too much
                      room") — a live screenshot of this same read-mode
                      toolbar (History/Edit/Delete/Star all showing at once)
                      prompted the identical fix here. Star stays directly
                      visible, unlike Feedback's own menu, since it's the
                      one action every member (not just can_edit/can_delete)
                      uses on every visit. */}
                  <IonButton onClick={() => setMenuOpen(true)} aria-label="Actions">
                    <IonIcon slot="icon-only" icon={ellipsisVerticalOutline} />
                  </IonButton>
                  <IonButton disabled={interestPending} onClick={toggleInterest}>
                    <IonIcon
                      slot="icon-only"
                      icon={event.interest_status === 'interested' ? star : starOutline}
                      color={event.interest_status === 'interested' ? 'warning' : undefined}
                    />
                  </IonButton>
                </>
              )}
            </IonButtons>
          )}
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen className="ion-padding">
        {!event && !error && (
          <div className="coming-soon">
            <IonSpinner name="dots" />
          </div>
        )}
        {error && (
          <div className="coming-soon">
            <p>Couldn't load this event</p>
          </div>
        )}
        {event && (
          <>
            {!editing && !event.image_url && event.submitted_by && (
              <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 16px' }}>
                <Avatar url={event.submitted_by.avatar_url} name={event.submitted_by.name} size={120} />
              </div>
            )}
            {/* Feedback #141: inline WYSIWYG editing — the same EventBody
                that renders the read-only page also renders the editable
                one, one field at a time swapped in place (see EventBody.tsx
                and edit-history/InlineField.tsx) — not a separate form
                screen, and not a different component tree, so entering/
                leaving edit mode never remounts the page or resets scroll. */}
            <EventBody
              event={event}
              editing={editing}
              draft={draft ?? undefined}
              onFieldChange={(key, value) => setDraft((d) => (d ? { ...d, [key]: value } : d))}
              imageEditor={
                <InlineImageEditor thumbnailUrl={image?.thumbnail_url ?? null} uploading={uploading} fileInputRef={fileInputRef} onAttach={attach} />
              }
              slots={{
                afterWhen: !editing ? (
                  <>
                    {event.submitted_by && <p style={{ ...factLineStyle, color: 'var(--ion-color-medium)' }}>Posted by {event.submitted_by.name}</p>}
                    {event.interested_count > 0 && (
                      <InterestedBadge eventId={event.id} count={event.interested_count} people={event.interested_people} emphasized />
                    )}
                  </>
                ) : undefined,
              }}
            />
            {saveError && (
              <p style={{ ...factLineStyle, color: 'var(--ion-color-danger)' }}>{saveError}</p>
            )}
            {!editing && (
              <>
                {/* Feedback #76: lets a member add this event to their own
                    calendar (Google/Outlook/.ics — see AddToCalendarButton). */}
                <AddToCalendarButton
                  event={{
                    title: event.title,
                    description: event.description,
                    location: event.location_name ?? event.address,
                    url: window.location.href,
                    startDate: event.start_date,
                    startTime: event.start_time,
                    allDay: event.all_day,
                  }}
                  filename={`${event.title}.ics`}
                  style={leadingButtonGap}
                />
                {event.source_url && (
                  <IonButton expand="block" href={event.source_url} target="_blank" rel="noreferrer" style={leadingButtonGap}>
                    View source
                  </IonButton>
                )}
                <CommentsSection eventId={event.id} />
              </>
            )}
          </>
        )}
      </IonContent>
      <IonToast isOpen={savedToast} onDidDismiss={() => setSavedToast(false)} message="Saved" duration={1500} />
      {/* Unconditionally mounted, buttons computed fresh each render — same
          fix as FeedbackPage.tsx's own documented feedback #142 gotcha: an
          IonActionSheet nested inside a conditional branch that can
          unmount mid-open never gets to run its real dismiss lifecycle,
          leaving menuOpen stuck true and popping back open uninvited. */}
      <IonActionSheet
        isOpen={menuOpen}
        onDidDismiss={() => setMenuOpen(false)}
        buttons={(
          [
            event && { text: 'History', icon: timeOutline, handler: () => history.push(`/events/${event.id}/history`) },
            event?.can_edit && { text: 'Edit', icon: createOutline, handler: startEditing },
            event?.can_delete && { text: 'Delete', icon: trashOutline, role: 'destructive' as const, handler: remove },
            { text: 'Cancel', icon: closeOutline, role: 'cancel' as const },
          ] as ({ text: string; icon: string; role?: 'destructive' | 'cancel'; handler?: () => void } | false | null)[]
        ).filter((b): b is { text: string; icon: string; role?: 'destructive' | 'cancel'; handler?: () => void } => !!b)}
      />
    </IonPage>
  )
}
