import { IonActionSheet, IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonPage, IonSpinner, IonTitle, IonToast, IonToolbar } from '@ionic/react'
import { checkmarkOutline, closeOutline, createOutline, ellipsisVerticalOutline, star, starOutline, timeOutline, trashOutline } from 'ionicons/icons'
import { useEffect, useState } from 'react'
import { useHistory, useParams } from 'react-router-dom'

import { track } from '../analytics/api'
import { AddToCalendarButton } from '../calendar/AddToCalendarButton'
import { InlineImageEditor } from '../edit-history/InlineField'
import { factLineStyle, leadingButtonGap } from '../theme/layout'
import { Avatar } from '../uploads/Avatar'
import { deleteCamp, fetchCamp, updateCamp, type Camp } from './api'
import { CampBody, type CampBodyDraft } from './CampBody'
import { CommentsSection } from './CommentsSection'
import { useCampImageUpload } from './useCampImageUpload'
import { useCampInterest } from './useCampInterest'
import { InterestedBadge } from './InterestedBadge'

function draftFromCamp(camp: Camp): CampBodyDraft {
  return {
    title: camp.title,
    description: camp.description ?? '',
    start_date: camp.start_date,
    end_date: camp.end_date,
    start_time: camp.start_time?.slice(0, 5) ?? '',
    end_time: camp.end_time?.slice(0, 5) ?? '',
    address: camp.address ?? '',
    location_name: camp.location_name ?? '',
    price_per_day: camp.price_per_day ?? '',
    price_is_estimated: camp.price_is_estimated,
    options: camp.options ?? [],
    options_note: camp.options_note ?? '',
    age_min: camp.age_min != null ? String(camp.age_min) : '',
    age_max: camp.age_max != null ? String(camp.age_max) : '',
    spots_available: camp.spots_available != null ? String(camp.spots_available) : '',
    booking_status: camp.booking_status ?? '',
    booking_instructions: camp.booking_instructions ?? '',
    prep_items: camp.prep_items ?? [],
    prep_note: camp.prep_note ?? '',
    source_url: camp.source_url ?? '',
  }
}

export function CampDetailPage() {
  const { id } = useParams<{ id: string }>()
  const history = useHistory()
  const [camp, setCamp] = useState<Camp | null>(null)
  const [error, setError] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<CampBodyDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedToast, setSavedToast] = useState(false)
  const { pending: interestPending, setInterest, clearInterest } = useCampInterest(setCamp)
  const { image, fileInputRef, uploading, attach, setImage } = useCampImageUpload(null)
  const [menuOpen, setMenuOpen] = useState(false)

  async function remove() {
    if (!camp || !window.confirm('Delete this camp?')) return
    await deleteCamp(camp.id)
    history.push('/camps')
  }

  function startEditing() {
    if (!camp) return
    setDraft(draftFromCamp(camp))
    setImage(camp.image_url && camp.thumbnail_url ? { image_url: camp.image_url, thumbnail_url: camp.thumbnail_url } : null)
    setSaveError(null)
    setEditing(true)
  }

  function cancelEditing() {
    setEditing(false)
    setDraft(null)
    setSaveError(null)
  }

  async function save() {
    if (!camp || !draft) return
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await updateCamp(camp.id, {
        title: draft.title,
        description: draft.description,
        start_date: draft.start_date,
        end_date: draft.end_date,
        start_time: draft.start_time,
        end_time: draft.end_time,
        address: draft.address,
        price_per_day: draft.price_per_day.trim() ? Number(draft.price_per_day) : null,
        price_is_estimated: draft.price_is_estimated,
        options: draft.options,
        options_note: draft.options_note,
        age_min: draft.age_min.trim() ? Number(draft.age_min) : null,
        age_max: draft.age_max.trim() ? Number(draft.age_max) : null,
        spots_available: draft.spots_available.trim() ? Number(draft.spots_available) : null,
        booking_status: draft.booking_status || null,
        booking_instructions: draft.booking_instructions,
        prep_items: draft.prep_items,
        prep_note: draft.prep_note,
        source_url: draft.source_url,
        image_url: image?.image_url ?? null,
        thumbnail_url: image?.thumbnail_url ?? null,
      })
      setCamp(updated)
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
    if (!camp) return
    if (camp.interest_status === 'interested') {
      clearInterest(camp)
    } else {
      setInterest(camp, 'interested')
    }
  }

  useEffect(() => {
    setCamp(null)
    setError(false)
    setEditing(false)
    setDraft(null)
    fetchCamp(id)
      .then(setCamp)
      .catch(() => setError(true))
  }, [id])

  useEffect(() => {
    track('camp_viewed', { campId: id }).catch(() => {})
  }, [id])

  const calendarDescription = (() => {
    if (!camp) return null
    const prepText =
      camp.prep_items && camp.prep_items.length > 0
        ? camp.prep_items.map((item) => `- ${item.label}${item.detail ? `: ${item.detail}` : ''}`).join('\n')
        : camp.prep_note
    return [camp.description, prepText ? `What to bring / prepare:\n${prepText}` : null].filter((v): v is string => Boolean(v)).join('\n\n') || null
  })()

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/camps" />
          </IonButtons>
          <IonTitle>{editing ? 'Edit Camp' : (camp?.title ?? 'Camp')}</IonTitle>
          {camp && (
            <IonButtons slot="end">
              {editing ? (
                <>
                  {/* See events/EventDetailPage.tsx's identical comment —
                      History stays reachable while editing; Cancel/Save are
                      edit mode's own active controls, not clutter to bury. */}
                  <IonButton routerLink={`/camps/${camp.id}/history`}>
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
                  {/* History/Edit/Delete buried under one overflow menu —
                      see events/EventDetailPage.tsx's identical comment
                      (feedback #95's FeedbackPage.tsx precedent, and a live
                      screenshot of this exact toolbar prompting the fix). */}
                  <IonButton onClick={() => setMenuOpen(true)} aria-label="Actions">
                    <IonIcon slot="icon-only" icon={ellipsisVerticalOutline} />
                  </IonButton>
                  <IonButton disabled={interestPending} onClick={toggleInterest}>
                    <IonIcon
                      slot="icon-only"
                      icon={camp.interest_status === 'interested' ? star : starOutline}
                      color={camp.interest_status === 'interested' ? 'warning' : undefined}
                    />
                  </IonButton>
                </>
              )}
            </IonButtons>
          )}
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen className="ion-padding">
        {!camp && !error && (
          <div className="coming-soon">
            <IonSpinner name="dots" />
          </div>
        )}
        {error && (
          <div className="coming-soon">
            <p>Couldn't load this camp</p>
          </div>
        )}
        {camp && (
          <>
            {!editing && !camp.image_url && camp.submitted_by && (
              <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 16px' }}>
                <Avatar url={camp.submitted_by.avatar_url} name={camp.submitted_by.name} size={120} />
              </div>
            )}
            <CampBody
              camp={camp}
              editing={editing}
              draft={draft ?? undefined}
              onFieldChange={(key, value) => setDraft((d) => (d ? { ...d, [key]: value } : d))}
              imageEditor={
                <InlineImageEditor thumbnailUrl={image?.thumbnail_url ?? null} uploading={uploading} fileInputRef={fileInputRef} onAttach={attach} />
              }
              interestedBadge={
                camp.interested_count > 0 && <InterestedBadge campId={camp.id} count={camp.interested_count} people={camp.interested_people} emphasized />
              }
              commentsSection={<CommentsSection campId={camp.id} source={camp.source} />}
            />
            {saveError && <p style={{ ...factLineStyle, color: 'var(--ion-color-danger)' }}>{saveError}</p>}
            {!editing && (
              <>
                <AddToCalendarButton
                  event={{
                    title: camp.title,
                    description: calendarDescription,
                    location: camp.location_name ?? camp.address,
                    url: window.location.href,
                    startDate: camp.start_date,
                    endDate: camp.end_date,
                    startTime: camp.start_date === camp.end_date ? camp.start_time : null,
                    endTime: camp.start_date === camp.end_date ? camp.end_time : null,
                    allDay: camp.start_date !== camp.end_date,
                  }}
                  filename={`${camp.title}.ics`}
                  style={camp.source_url ? leadingButtonGap : { ...leadingButtonGap, marginBottom: 72 }}
                />
                {camp.source_url && (
                  <IonButton expand="block" href={camp.source_url} target="_blank" rel="noreferrer" style={{ ...leadingButtonGap, marginBottom: 72 }}>
                    View Booking Page
                  </IonButton>
                )}
              </>
            )}
          </>
        )}
      </IonContent>
      <IonToast isOpen={savedToast} onDidDismiss={() => setSavedToast(false)} message="Saved" duration={1500} />
      {/* Unconditionally mounted — see events/EventDetailPage.tsx's
          identical comment (feedback #142's documented gotcha). */}
      <IonActionSheet
        isOpen={menuOpen}
        onDidDismiss={() => setMenuOpen(false)}
        buttons={(
          [
            camp && { text: 'History', icon: timeOutline, handler: () => history.push(`/camps/${camp.id}/history`) },
            camp?.can_edit && { text: 'Edit', icon: createOutline, handler: startEditing },
            camp?.can_delete && { text: 'Delete', icon: trashOutline, role: 'destructive' as const, handler: remove },
            { text: 'Cancel', icon: closeOutline, role: 'cancel' as const },
          ] as ({ text: string; icon: string; role?: 'destructive' | 'cancel'; handler?: () => void } | false | null)[]
        ).filter((b): b is { text: string; icon: string; role?: 'destructive' | 'cancel'; handler?: () => void } => !!b)}
      />
    </IonPage>
  )
}
