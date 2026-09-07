import { IonActionSheet, IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonPage, IonSpinner, IonTitle, IonToast, IonToolbar } from '@ionic/react'
import { checkmarkOutline, closeOutline, createOutline, ellipsisVerticalOutline, star, starOutline, timeOutline, trashOutline } from 'ionicons/icons'
import { useEffect, useState } from 'react'
import { useHistory, useParams } from 'react-router-dom'

import { AddToCalendarButton } from '../calendar/AddToCalendarButton'
import { InlineImageEditor } from '../edit-history/InlineField'
import { factLineStyle, leadingButtonGap } from '../theme/layout'
import { Avatar } from '../uploads/Avatar'
import { deleteSportsClub, fetchSportsClub, updateSportsClub, type SportsClub } from './api'
import { CommentsSection } from './CommentsSection'
import { calendarEventForSportsClub } from './format'
import { InterestedBadge } from './InterestedBadge'
import { SportsClubBody, type SportsClubBodyDraft } from './SportsClubBody'
import { useSportsClubImageUpload } from './useSportsClubImageUpload'
import { useSportsClubInterest } from './useSportsClubInterest'

function draftFromClub(club: SportsClub): SportsClubBodyDraft {
  return {
    title: club.title,
    description: club.description ?? '',
    category: club.category ?? '',
    schedule_type: club.schedule_type,
    first_date: club.first_date ?? '',
    last_date: club.last_date ?? '',
    cadence_note: club.cadence_note ?? '',
    age_min: club.age_min != null ? String(club.age_min) : '',
    age_max: club.age_max != null ? String(club.age_max) : '',
    price: club.price ?? '',
    price_unit: club.price_unit ?? '',
    price_per_week: club.price_per_week ?? '',
    price_note: club.price_note ?? '',
    options: club.options ?? [],
    address: club.address ?? '',
    location_name: club.location_name ?? '',
    signup_status: club.signup_status ?? '',
    signup_instructions: club.signup_instructions ?? '',
    source_url: club.source_url ?? '',
  }
}

export function SportsClubDetailPage() {
  const { id } = useParams<{ id: string }>()
  const history = useHistory()
  const [club, setClub] = useState<SportsClub | null>(null)
  const [error, setError] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<SportsClubBodyDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedToast, setSavedToast] = useState(false)
  const { pending: interestPending, setInterest, clearInterest } = useSportsClubInterest(setClub)
  const { image, fileInputRef, uploading, attach, setImage } = useSportsClubImageUpload(null)
  const [menuOpen, setMenuOpen] = useState(false)

  async function remove() {
    if (!club || !window.confirm('Delete this listing?')) return
    await deleteSportsClub(club.id)
    history.push('/sports-clubs')
  }

  function startEditing() {
    if (!club) return
    setDraft(draftFromClub(club))
    setImage(club.image_url && club.thumbnail_url ? { image_url: club.image_url, thumbnail_url: club.thumbnail_url } : null)
    setSaveError(null)
    setEditing(true)
  }

  function cancelEditing() {
    setEditing(false)
    setDraft(null)
    setSaveError(null)
  }

  async function save() {
    if (!club || !draft) return
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await updateSportsClub(club.id, {
        title: draft.title,
        description: draft.description,
        category: draft.category,
        schedule_type: draft.schedule_type,
        first_date: draft.first_date,
        last_date: draft.last_date,
        cadence_note: draft.cadence_note,
        age_min: draft.age_min.trim() ? Number(draft.age_min) : null,
        age_max: draft.age_max.trim() ? Number(draft.age_max) : null,
        price: draft.price.trim() ? Number(draft.price) : null,
        price_unit: draft.price_unit,
        price_per_week: draft.price_per_week.trim() ? Number(draft.price_per_week) : null,
        price_note: draft.price_note,
        options: draft.options,
        address: draft.address,
        location_name: draft.location_name,
        signup_status: draft.signup_status || null,
        signup_instructions: draft.signup_instructions,
        source_url: draft.source_url,
        image_url: image?.image_url ?? null,
        thumbnail_url: image?.thumbnail_url ?? null,
      })
      setClub(updated)
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
    if (!club) return
    if (club.interest_status === 'interested') {
      clearInterest(club)
    } else {
      setInterest(club, 'interested')
    }
  }

  useEffect(() => {
    setClub(null)
    setError(false)
    setEditing(false)
    setDraft(null)
    fetchSportsClub(id)
      .then(setClub)
      .catch(() => setError(true))
  }, [id])

  const calendarEvent = club ? calendarEventForSportsClub(club) : null

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/sports-clubs" />
          </IonButtons>
          <IonTitle>{editing ? 'Edit Listing' : (club?.title ?? 'Sports & Clubs')}</IonTitle>
          {club && (
            <IonButtons slot="end">
              {editing ? (
                <>
                  {/* See events/EventDetailPage.tsx's identical comment —
                      History stays reachable while editing; Cancel/Save are
                      edit mode's own active controls, not clutter to bury. */}
                  <IonButton routerLink={`/sports-clubs/${club.id}/history`}>
                    <IonIcon slot="icon-only" icon={timeOutline} />
                  </IonButton>
                  <IonButton onClick={cancelEditing} disabled={saving}>
                    <IonIcon slot="icon-only" icon={closeOutline} />
                  </IonButton>
                  <IonButton onClick={save} disabled={saving || uploading || !draft?.title.trim() || !draft?.category.trim() || !draft?.address.trim()}>
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
                      icon={club.interest_status === 'interested' ? star : starOutline}
                      color={club.interest_status === 'interested' ? 'warning' : undefined}
                    />
                  </IonButton>
                </>
              )}
            </IonButtons>
          )}
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen className="ion-padding">
        {!club && !error && (
          <div className="coming-soon">
            <IonSpinner name="dots" />
          </div>
        )}
        {error && (
          <div className="coming-soon">
            <p>Couldn't load this listing</p>
          </div>
        )}
        {club && (
          <>
            {!editing && !club.image_url && club.submitted_by && (
              <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 16px' }}>
                <Avatar url={club.submitted_by.avatar_url} name={club.submitted_by.name} size={120} />
              </div>
            )}
            <SportsClubBody
              club={club}
              editing={editing}
              draft={draft ?? undefined}
              onFieldChange={(key, value) => setDraft((d) => (d ? { ...d, [key]: value } : d))}
              imageEditor={
                <InlineImageEditor thumbnailUrl={image?.thumbnail_url ?? null} uploading={uploading} fileInputRef={fileInputRef} onAttach={attach} />
              }
              interestedBadge={
                club.interested_count > 0 && <InterestedBadge sportsClubId={club.id} count={club.interested_count} people={club.interested_people} emphasized />
              }
              commentsSection={<CommentsSection sportsClubId={club.id} source={club.source} />}
            />
            {saveError && <p style={{ ...factLineStyle, color: 'var(--ion-color-danger)' }}>{saveError}</p>}
            {!editing && (
              <>
                {calendarEvent && (
                  <AddToCalendarButton
                    event={{ ...calendarEvent, url: window.location.href }}
                    filename={`${club.title}.ics`}
                    style={club.source_url ? leadingButtonGap : { ...leadingButtonGap, marginBottom: 72 }}
                  />
                )}
                {club.source_url && (
                  <IonButton expand="block" href={club.source_url} target="_blank" rel="noreferrer" style={{ ...leadingButtonGap, marginBottom: 72 }}>
                    View Sign-up Page
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
            club && { text: 'History', icon: timeOutline, handler: () => history.push(`/sports-clubs/${club.id}/history`) },
            club?.can_edit && { text: 'Edit', icon: createOutline, handler: startEditing },
            club?.can_delete && { text: 'Delete', icon: trashOutline, role: 'destructive' as const, handler: remove },
            { text: 'Cancel', icon: closeOutline, role: 'cancel' as const },
          ] as ({ text: string; icon: string; role?: 'destructive' | 'cancel'; handler?: () => void } | false | null)[]
        ).filter((b): b is { text: string; icon: string; role?: 'destructive' | 'cancel'; handler?: () => void } => !!b)}
      />
    </IonPage>
  )
}
