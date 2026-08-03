import {
  IonButton,
  IonCheckbox,
  IonContent,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonSpinner,
  IonText,
} from '@ionic/react'
import { type ReactNode, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { API_URL } from '../config'
import { Avatar } from '../uploads/Avatar'
import { useImageUpload } from '../uploads/useImageUpload'
import { fetchInviteInfo, updateProfile, type InviteInfo } from './api'
import { useAuth } from './AuthContext'
import { setToken } from './token'
import { loginWithPasskey, registerPasskey } from './webauthn'

// Shown on every logged-out state (loading, invite, sign-in, dead-end) so a
// visitor always sees who this is for before deciding whether to continue
// (feedback #37) — logo/name mirror InstitutionBanner.tsx's authenticated
// header, since there's no shared header component spanning both states.
function BrandHeader() {
  return (
    <>
      {/* nettelhorst-logo.png is white artwork on a transparent background
          (designed for InstitutionBanner's dark toolbar) — invisible on this
          screen's plain background without its own dark backing. */}
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          background: '#2c2c2c',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <img src="/nettelhorst-logo.png" alt="" style={{ width: 40, height: 40, objectFit: 'contain' }} />
      </div>
      <h1 style={{ margin: '4px 0 0', fontSize: '1.5rem', fontWeight: 700 }}>Nettelhorst</h1>
      <p style={{ margin: '0 0 16px', color: 'var(--ion-color-medium)' }}>
        A bulletin board for the Nettelhorst community
      </p>
    </>
  )
}

function CenteredMessage({ children }: { children: ReactNode }) {
  return (
    <IonContent fullscreen className="ion-padding">
      <div className="account-fallback" style={{ height: '100%', justifyContent: 'center' }}>
        <BrandHeader />
        {children}
      </div>
    </IonContent>
  )
}

// Extracted so the admin "preview my invite page" dev tool (feedback #38,
// InvitePreviewPage.tsx) can render exactly what a real invitee sees without
// duplicating the markup — it passes busy={true} to inertly disable both
// buttons (reusing the existing disabled state rather than inventing a
// separate "preview mode" prop) instead of wiring onAccept/onSignIn to real
// passkey calls, which would be actively dangerous to trigger while already
// signed in as admin (registerPasskey/loginWithPasskey overwrite the current
// session token).
export function InviteAcceptCard({
  invite,
  busy,
  error,
  onAccept,
  onSignIn,
  banner,
}: {
  invite: InviteInfo | null
  busy: boolean
  error: string | null
  onAccept: () => void
  onSignIn: () => void
  // Preview-only annotation (InvitePreviewPage.tsx) shown above the card
  // itself, inside the same centered content — undefined in the real join
  // flow.
  banner?: ReactNode
}) {
  return (
    <CenteredMessage>
      {banner}
      <Avatar url={invite?.avatarUrl ?? null} name={invite?.name} size={64} />
      <h2>{invite ? `${invite.name} invited you` : 'Join Nettelhorst'}</h2>
      {error && (
        <IonText color="danger">
          <p>{error}</p>
        </IonText>
      )}
      <IonButton expand="block" disabled={busy} onClick={onAccept}>
        {invite ? 'Accept Invite' : 'Continue'}
      </IonButton>
      <p className="ion-margin-top">Already on Nettelhorst?</p>
      <IonButton expand="block" fill="outline" disabled={busy} onClick={onSignIn}>
        Sign In With Passkey
      </IonButton>
    </CenteredMessage>
  )
}

// Always offers a "sign in" path regardless of whether an invite/rootSecret
// param is present — a returning member who cleared localStorage or opened
// the app on a new device has neither in their URL bar, but still has a real
// passkey the browser can find (it's a discoverable credential). Without
// this, that person would be stuck at the "you need an invitation" dead end
// with no way back into their own account.
function JoinScreen() {
  const location = useLocation()
  const { refresh } = useAuth()
  const params = new URLSearchParams(location.search)
  const inviterUserId = params.get('invite') ?? undefined
  const rootSecret = params.get('rootSecret') ?? undefined
  const hasInvite = Boolean(inviterUserId || rootSecret)

  const [invite, setInvite] = useState<InviteInfo | null | undefined>(inviterUserId ? undefined : null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!inviterUserId) return
    fetchInviteInfo(inviterUserId).then(setInvite)
  }, [inviterUserId])

  async function accept() {
    setBusy(true)
    setError(null)
    try {
      const token = await registerPasskey({ inviterUserId, rootSecret })
      setToken(token)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your passkey')
    } finally {
      setBusy(false)
    }
  }

  async function signIn() {
    setBusy(true)
    setError(null)
    try {
      const token = await loginWithPasskey()
      setToken(token)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in')
    } finally {
      setBusy(false)
    }
  }

  const signInSection = (
    <>
      <p className="ion-margin-top">Already on Nettelhorst?</p>
      <IonButton expand="block" fill="outline" disabled={busy} onClick={signIn}>
        Sign In With Passkey
      </IonButton>
    </>
  )

  if (inviterUserId && invite === undefined) {
    return (
      <CenteredMessage>
        <IonSpinner name="dots" />
      </CenteredMessage>
    )
  }

  if (!hasInvite || (inviterUserId && invite === null)) {
    return (
      <CenteredMessage>
        {!hasInvite ? (
          <>
            <h2>You need an invitation to join Nettelhorst</h2>
            <p>Ask someone already using Nettelhorst to share their invite QR code with you.</p>
          </>
        ) : (
          <>
            <h2>This invite link isn't valid</h2>
            <p>Ask for a fresh invite QR code from someone already using Nettelhorst.</p>
          </>
        )}
        {error && (
          <IonText color="danger">
            <p>{error}</p>
          </IonText>
        )}
        {signInSection}
      </CenteredMessage>
    )
  }

  return <InviteAcceptCard invite={invite ?? null} busy={busy} error={error} onAccept={accept} onSignIn={signIn} />
}

function capitalizeFirst(value: string) {
  return value.length ? value[0].toUpperCase() + value.slice(1) : value
}

function ProfileSetupScreen() {
  const { refresh } = useAuth()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [newsletterSubscribed, setNewsletterSubscribed] = useState(true)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { fileInputRef, uploading, attach } = useImageUpload('profiles', (image) => setAvatarUrl(image.image_url))

  const name = `${firstName.trim()} ${lastName.trim()}`.trim()
  const trimmedEmail = email.trim()
  const canSubmit = !submitting && !uploading && !!firstName.trim() && !!lastName.trim() && trimmedEmail.includes('@')

  async function attachPhoto(file: File) {
    if (!(await attach(file))) setError('Could not upload photo')
  }

  async function submit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      await updateProfile({ name, email: trimmedEmail, avatarUrl: avatarUrl ?? undefined, newsletterSubscribed })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <IonPage>
      <IonContent fullscreen className="ion-padding">
        <h2 className="ion-padding-top">Set up your profile</h2>
        <div style={{ textAlign: 'center', margin: '16px 0' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void attachPhoto(file)
              e.target.value = ''
            }}
          />
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              // rem, not px, so this grows along with OS/browser text-size
              // settings instead of staying fixed while "Add photo" grows
              // past it and gets clipped by overflow: hidden below.
              width: '5.25rem',
              height: '5.25rem',
              borderRadius: '50%',
              border: '1.5px dashed var(--ion-color-medium)',
              margin: '0 auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              cursor: 'pointer',
            }}
          >
            {uploading && <IonSpinner name="dots" />}
            {!uploading && avatarUrl && (
              <img src={`${API_URL}${avatarUrl}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            )}
            {!uploading && !avatarUrl && <IonLabel color="medium">Add photo</IonLabel>}
          </div>
        </div>
        <IonList inset>
          <IonItem>
            <IonLabel position="stacked">First name</IonLabel>
            <IonInput
              value={firstName}
              onIonInput={(e) => setFirstName(capitalizeFirst(e.detail.value ?? ''))}
              autofocus
            />
          </IonItem>
          <IonItem>
            <IonLabel position="stacked">Last name</IonLabel>
            <IonInput value={lastName} onIonInput={(e) => setLastName(capitalizeFirst(e.detail.value ?? ''))} />
          </IonItem>
          <IonItem>
            <IonLabel position="stacked">Email</IonLabel>
            <IonInput type="email" value={email} onIonInput={(e) => setEmail(e.detail.value ?? '')} />
          </IonItem>
          <IonItem lines="none">
            <IonCheckbox
              checked={newsletterSubscribed}
              onIonChange={(e) => setNewsletterSubscribed(e.detail.checked)}
              justify="start"
              labelPlacement="end"
            >
              Get weekly events email
            </IonCheckbox>
          </IonItem>
        </IonList>
        <p className="ion-padding-start" style={{ color: 'var(--ion-color-medium)', fontSize: '0.875rem', marginTop: 4 }}>
          You can unsubscribe anytime from any email you get.
        </p>
        {error && (
          <IonText color="danger">
            <p className="ion-padding-start">{error}</p>
          </IonText>
        )}
        <IonButton
          expand="block"
          className="ion-margin-top"
          disabled={!canSubmit}
          onClick={submit}
        >
          Continue
        </IonButton>
      </IonContent>
    </IonPage>
  )
}

// The whole app is invite-only (see CLAUDE.md, Product shape): every route
// renders behind this gate instead of the previous "no route guarding at
// all" model. Because this component only conditionally renders `children`
// rather than redirecting, whatever path was already in the URL bar (e.g.
// from a shared `/events/:id?invite=...` link) renders immediately once the
// user is fully signed in — no separate navigation step needed.
export function JoinGate({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <IonPage>
        <CenteredMessage>
          <IonSpinner name="dots" />
        </CenteredMessage>
      </IonPage>
    )
  }

  if (!user) {
    return (
      <IonPage>
        <JoinScreen />
      </IonPage>
    )
  }

  if (!user.profileComplete) {
    return <ProfileSetupScreen />
  }

  return <>{children}</>
}
