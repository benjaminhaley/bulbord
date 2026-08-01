import {
  IonButton,
  IonContent,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonSpinner,
  IonText,
} from '@ionic/react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { API_URL } from '../config'
import { uploadImage } from '../uploads/api'
import { fetchInviteInfo, updateProfile, type InviteInfo } from './api'
import { useAuth } from './AuthContext'
import { setToken } from './token'
import { loginWithPasskey, registerPasskey } from './webauthn'

function CenteredMessage({ children }: { children: ReactNode }) {
  return (
    <IonContent fullscreen className="ion-padding">
      <div className="account-fallback" style={{ height: '100%', justifyContent: 'center' }}>
        {children}
      </div>
    </IonContent>
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
      <p className="ion-margin-top">Already on Campy?</p>
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
            <h2>You need an invitation to join Campy</h2>
            <p>Ask someone already using Campy to share their invite QR code with you.</p>
          </>
        ) : (
          <>
            <h2>This invite link isn't valid</h2>
            <p>Ask for a fresh invite QR code from someone already using Campy.</p>
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

  return (
    <CenteredMessage>
      {invite?.avatarUrl && (
        <img
          src={`${API_URL}${invite.avatarUrl}`}
          alt=""
          style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }}
        />
      )}
      <h2>{invite ? `${invite.name} invited you to Campy` : 'Set up Campy'}</h2>
      <p>Create a passkey to sign in — just your face, fingerprint, or screen lock. No password to remember.</p>
      {error && (
        <IonText color="danger">
          <p>{error}</p>
        </IonText>
      )}
      <IonButton expand="block" disabled={busy} onClick={accept}>
        {invite ? 'Accept Invite' : 'Continue'}
      </IonButton>
      {signInSection}
    </CenteredMessage>
  )
}

function ProfileSetupScreen() {
  const { refresh } = useAuth()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function attachPhoto(file: File) {
    setUploading(true)
    try {
      const uploaded = await uploadImage(file, 'profiles')
      setAvatarUrl(uploaded.image_url)
    } catch {
      setError('Could not upload photo')
    } finally {
      setUploading(false)
    }
  }

  async function submit() {
    const name = `${firstName.trim()} ${lastName.trim()}`.trim()
    if (!name) return
    setSubmitting(true)
    setError(null)
    try {
      await updateProfile({ name, avatarUrl: avatarUrl ?? undefined })
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
              width: 84,
              height: 84,
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
            <IonInput value={firstName} onIonInput={(e) => setFirstName(e.detail.value ?? '')} autofocus />
          </IonItem>
          <IonItem lines="none">
            <IonLabel position="stacked">Last name</IonLabel>
            <IonInput value={lastName} onIonInput={(e) => setLastName(e.detail.value ?? '')} />
          </IonItem>
        </IonList>
        {error && (
          <IonText color="danger">
            <p className="ion-padding-start">{error}</p>
          </IonText>
        )}
        <IonButton
          expand="block"
          className="ion-margin-top"
          disabled={submitting || uploading || !firstName.trim() || !lastName.trim()}
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
