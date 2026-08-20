import {
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonPage,
  IonRadio,
  IonRadioGroup,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { chevronDownOutline } from 'ionicons/icons'
import { type ReactNode, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { API_URL } from '../config'
import { ChooseFriendsScreen } from '../connections/ChooseFriendsScreen'
import { Avatar } from '../uploads/Avatar'
import { CropModal } from '../uploads/CropModal'
import { useImageUpload } from '../uploads/useImageUpload'
import { AboutPage } from './AboutPage'
import { fetchInviteInfo, updateProfile, type Grade, type InviteInfo } from './api'
import { useAuth } from './AuthContext'
import { MosaicMotif } from './MosaicMotif'
import {
  capitalizeFirst,
  GRADE_OPTIONS,
  isEmailValid,
  isKidsValid,
  isNameValid,
  isPhotoValid,
  isRoleValid,
  KID_COUNT_OPTIONS,
  REQUIRED_FIELDS_EXPLANATION,
  RequiredMark,
  ROLE_OPTIONS,
  type ProfileSetupInitialValues,
  type Role,
} from './profileForm'
import { ProfileSetupWizard } from './ProfileSetupWizard'
import { getToken, parseSignInToken, setToken } from './token'
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
      <h1 style={{ margin: '4px 0 0', fontSize: '1.5rem', fontWeight: 700 }}>Nettelhorst Bulbord</h1>
      <p style={{ margin: '0 0 4px', color: 'var(--ion-color-medium)' }}>
        A bulletin board for the Nettelhorst community
      </p>
      {/* Gray/underlined to sit at the same low-emphasis level as the copy
          above it (feedback #85) — the invite screen's job is to get a
          visitor into the app, not read About's full text, so this is a
          quiet way out rather than a second call to action. Reachable
          pre-auth: JoinGate special-cases the /about route below. */}
      <p style={{ margin: '0 0 16px' }}>
        <Link to="/about" style={{ color: 'var(--ion-color-medium)', textDecoration: 'underline' }}>
          Learn more
        </Link>
      </p>
    </>
  )
}

// Passkey sign-in de-emphasized to plain gray underlined text (feedback #84)
// — the same visual weight as "Already on Nettelhorst Bulbord?" above it,
// rather than a second full-width button competing with Accept/Continue for
// attention. Shared between InviteAcceptCard and JoinScreen's dead-end state
// so both stay visually identical rather than two hand-copied versions.
function SignInLink({ busy, onSignIn }: { busy: boolean; onSignIn: () => void }) {
  return (
    <p className="ion-margin-top" style={{ color: 'var(--ion-color-medium)', fontSize: '0.8125rem' }}>
      Already on Nettelhorst Bulbord?{' '}
      <a
        onClick={busy ? undefined : onSignIn}
        style={{
          color: 'var(--ion-color-medium)',
          textDecoration: 'underline',
          cursor: busy ? 'default' : 'pointer',
          opacity: busy ? 0.6 : 1,
        }}
      >
        Sign In
      </a>
    </p>
  )
}

// Fallback for anyone who has a real sign-in link (`?signInToken=...`, see
// Login's Sign-in link entry in CLAUDE.md) but can't rely on tapping it to
// hand off into the app — most notably an App Store reviewer, whose device
// is known to sometimes open the link in Safari instead of invoking the
// Universal Link (Apple rejected build 14 for exactly this, 2026-08-18: "the
// provided url leads to a website in Safari"). Typing/pasting the link or
// bare token directly into the running app sidesteps the whole hand-off
// question — there's nothing for iOS to intercept, since the value never
// leaves this text field as a real navigation. Collapsed behind a small
// low-emphasis toggle so it doesn't compete with the real sign-in path for a
// normal member, who'll essentially never need it.
function ManualSignInEntry({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const token = parseSignInToken(value)
    if (!token) return
    setBusy(true)
    setError(null)
    try {
      setToken(token)
      await onSignedIn()
      // fetchCurrentUser clears the stored token and leaves `user` null on a
      // 401 (see auth/api.ts) -- if it's gone again right after we just set
      // it, the token we were given wasn't valid.
      if (!getToken()) setError("That link or code didn't work")
    } catch {
      setError('Something went wrong -- try again')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <p style={{ margin: '4px 0 0' }}>
        <a
          onClick={() => setOpen(true)}
          style={{ color: 'var(--ion-color-medium)', textDecoration: 'underline', fontSize: '0.75rem', cursor: 'pointer' }}
        >
          Have a sign-in link instead?
        </a>
      </p>
    )
  }

  return (
    <div style={{ width: '100%', marginTop: 8 }}>
      <IonItem>
        <IonLabel position="stacked" style={{ fontSize: '0.75rem' }}>
          Sign-in link or code
        </IonLabel>
        <IonInput value={value} onIonInput={(e) => setValue(e.detail.value ?? '')} placeholder="Paste it here" />
      </IonItem>
      {error && (
        <IonText color="danger">
          <p style={{ fontSize: '0.75rem', margin: '4px 0 0' }}>{error}</p>
        </IonText>
      )}
      <IonButton
        expand="block"
        size="small"
        className="ion-margin-top"
        disabled={busy || !value.trim()}
        onClick={submit}
      >
        Continue
      </IonButton>
    </div>
  )
}

// `mosaic` adds the same triangulated backdrop the real app icon uses as a
// subtle decorative flourish (feedback #88) — reserved for the personalized
// InviteAcceptCard state specifically (see below), not the generic
// spinner/dead-end states JoinScreen also renders through this same shell,
// which stay plain on purpose.
function CenteredMessage({ children, mosaic = false }: { children: ReactNode; mosaic?: boolean }) {
  return (
    <IonContent fullscreen className="ion-padding">
      <div className="account-fallback" style={{ height: '100%', justifyContent: 'center', position: 'relative' }}>
        {mosaic && <MosaicMotif />}
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '100%',
          }}
        >
          <BrandHeader />
          {children}
        </div>
      </div>
    </IonContent>
  )
}

// Extracted so the admin "preview my invite page" dev tool (feedback #38,
// InvitePreviewPage.tsx) can render exactly what a real invitee sees without
// duplicating the markup — it passes busy={false} (both buttons genuinely
// clickable, per feedback that a preview should let every control actually
// be used, not sit permanently disabled) but onAccept/onSignIn as no-ops
// instead of the real passkey calls, which would be actively dangerous to
// trigger while already signed in as admin (registerPasskey/loginWithPasskey
// overwrite the current session token). `busy` itself is still real here —
// it's the same prop the actual JoinScreen below passes while a passkey
// ceremony is genuinely in flight — just never forced true by the preview.
export function InviteAcceptCard({
  invite,
  busy,
  error,
  onAccept,
  onSignIn,
}: {
  invite: InviteInfo | null
  busy: boolean
  error: string | null
  onAccept: () => void
  onSignIn: () => void
}) {
  return (
    <CenteredMessage mosaic>
      <Avatar url={invite?.avatarUrl ?? null} name={invite?.name} size={72} />
      <h2 style={{ fontSize: '1.4rem' }}>{invite ? `${invite.name} invited you` : 'Join Nettelhorst Bulbord'}</h2>
      {error && (
        <IonText color="danger">
          <p>{error}</p>
        </IonText>
      )}
      <IonButton expand="block" disabled={busy} onClick={onAccept}>
        {invite ? 'Accept Invite' : 'Continue'}
      </IonButton>
      <SignInLink busy={busy} onSignIn={onSignIn} />
    </CenteredMessage>
  )
}

// Shown in place of InviteAcceptCard while the real WebAuthn ceremony
// (registerPasskey) is actually in flight (feedback #88 — previously this
// moment was just a disabled button with no real acknowledgment that
// something was happening, which reads as unresponsive during whatever gap
// exists before the OS's own Face ID/Touch ID/screen-lock prompt appears).
// Duration is however long the real ceremony takes, not a fixed timer — this
// unmounts the instant `accept()`'s await resolves, same as any other
// loading state in this app.
function PasskeySettingUpScreen() {
  return (
    <CenteredMessage>
      <IonSpinner name="dots" />
      <h2 style={{ fontSize: '1.2rem', marginTop: 8 }}>Setting up your passkey</h2>
      <p style={{ color: 'var(--ion-color-medium)' }}>
        Face ID, Touch ID, or your device's screen lock — no password to remember, ever.
      </p>
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
  // Distinct from `busy` (which also covers signIn()) — only true for the
  // real Accept Invite ceremony, so PasskeySettingUpScreen doesn't also
  // replace the whole screen during an existing member's much quicker
  // sign-in tap (see PasskeySettingUpScreen's own comment).
  const [acceptInFlight, setAcceptInFlight] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!inviterUserId) return
    fetchInviteInfo(inviterUserId).then(setInvite)
  }, [inviterUserId])

  async function accept() {
    setBusy(true)
    setAcceptInFlight(true)
    setError(null)
    try {
      const token = await registerPasskey({ inviterUserId, rootSecret })
      setToken(token)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your passkey')
    } finally {
      setBusy(false)
      setAcceptInFlight(false)
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

  const signInSection = <SignInLink busy={busy} onSignIn={signIn} />

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
            <h2>You need an invitation to join Nettelhorst Bulbord</h2>
            <p>Ask someone already using Nettelhorst Bulbord to share their invite QR code with you.</p>
          </>
        ) : (
          <>
            <h2>This invite link isn't valid</h2>
            <p>Ask for a fresh invite QR code from someone already using Nettelhorst Bulbord.</p>
          </>
        )}
        {error && (
          <IonText color="danger">
            <p>{error}</p>
          </IonText>
        )}
        {signInSection}
        <ManualSignInEntry onSignedIn={refresh} />
      </CenteredMessage>
    )
  }

  if (acceptInFlight) {
    return <PasskeySettingUpScreen />
  }

  return <InviteAcceptCard invite={invite ?? null} busy={busy} error={error} onAccept={accept} onSignIn={signIn} />
}

// A custom modal picker, not IonSelect — feedback (2026-08-06): the
// role explainer ("Family: you have a child...") must only be visible
// while actively choosing, not sitting on the main form page the whole
// time. There's no way to satisfy that with IonSelect at all: a plain
// ion-select-option's display, in every interface mode (action-sheet,
// popover, alert), always flattens to one plain-text line, so secondary
// text can't be shown even inside IonSelect's own picker. This swaps the
// field for a real IonModal sheet listing each role as a two-line IonItem
// (IonLabel's h2/p for bold name + subtle description, IonRadio moved to
// slot="end" rather than used as the label itself — IonRadio's own default-
// slot label wrapper is hard-coded `white-space: nowrap` in its shadow CSS
// with no exposed part to override, which silently clipped the Family
// description) that only exists while open — closing it removes the
// explainer from the page entirely.
function RolePicker({ value, onChange }: { value: Role | undefined; onChange: (value: Role) => void }) {
  const [open, setOpen] = useState(false)
  const selected = ROLE_OPTIONS.find((option) => option.value === value)

  return (
    <>
      <IonItem button detail={false} onClick={() => setOpen(true)}>
        <IonLabel position="stacked">
          I am...
          <RequiredMark />
        </IonLabel>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            padding: '8px 0',
            color: selected ? undefined : 'var(--ion-color-medium)',
          }}
        >
          {selected?.label ?? 'Select one'}
          <IonIcon icon={chevronDownOutline} color="medium" />
        </div>
      </IonItem>
      <IonModal
        isOpen={open}
        onDidDismiss={() => setOpen(false)}
        initialBreakpoint={0.6}
        breakpoints={[0, 0.6]}
        keepContentsMounted
      >
        <IonHeader>
          <IonToolbar>
            <IonTitle>I am...</IonTitle>
            <IonButtons slot="end">
              <IonButton onClick={() => setOpen(false)}>Close</IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>
        <IonContent>
          <IonRadioGroup
            value={value}
            onIonChange={(e) => {
              onChange(e.detail.value)
              setOpen(false)
            }}
          >
            <IonList>
              {ROLE_OPTIONS.map((option) => (
                <IonItem key={option.value}>
                  <IonLabel className="ion-text-wrap">
                    <h2>{option.label}</h2>
                    <p>{option.detail}</p>
                  </IonLabel>
                  <IonRadio slot="end" value={option.value} />
                </IonItem>
              ))}
            </IonList>
          </IonRadioGroup>
        </IonContent>
      </IonModal>
    </>
  )
}

// ProfileSetupInitialValues now lives in profileForm.tsx (shared with
// ProfileSetupWizard) — re-exported here so EditProfilePage.tsx's existing
// import path (`from './JoinGate'`) keeps working unchanged.
export type { ProfileSetupInitialValues } from './profileForm'

// Exported (not just used internally by JoinGate) so it can be previewed —
// both via Storybook (feedback #44) and in-app via the admin
// SignupFlowPreviewPage (feedback #44 follow-up: Ben wants to walk through
// the whole flow from the deployed app itself, not just a local dev tool) —
// with the same real component code the actual sign-up flow renders. No
// IonPage wrapper here (unlike a typical top-level screen) so a preview
// caller can nest it inside its own IonPage/IonHeader with a back button,
// the same shape InviteAcceptCard/CenteredMessage above already use; the
// real flow's own caller (JoinGate, below) supplies the IonPage instead.
// `initialValues`/`submitLabel`/`onSaved` are what EditProfilePage.tsx uses
// to reuse this same component after onboarding, rather than building a
// second form — validation, the photo/kids requirements, and the crop step
// all stay identical to the real signup flow.
export function ProfileSetupScreen({
  preview = false,
  initialValues,
  submitLabel = 'Continue',
  onSaved,
}: {
  preview?: boolean
  initialValues?: ProfileSetupInitialValues
  submitLabel?: string
  onSaved?: () => void
} = {}) {
  const { refresh } = useAuth()
  const [firstName, setFirstName] = useState(initialValues?.firstName ?? '')
  const [lastName, setLastName] = useState(initialValues?.lastName ?? '')
  const [email, setEmail] = useState(initialValues?.email ?? '')
  const [newsletterSubscribed, setNewsletterSubscribed] = useState(initialValues?.newsletterSubscribed ?? true)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialValues?.avatarUrl ?? null)
  const [role, setRole] = useState<'staff' | 'family' | 'other' | undefined>(initialValues?.role)
  const [roleOther, setRoleOther] = useState(initialValues?.roleOther ?? '')
  // One grade per kid (feedback #81) — Family role only. The array's own
  // length is the "how many kids" count, rather than a separate number field
  // that would need to stay in sync with it.
  const [kidGrades, setKidGrades] = useState<Grade[]>(initialValues?.kidGrades ?? [])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingCropFile, setPendingCropFile] = useState<File | null>(null)
  const { fileInputRef, uploading, attach } = useImageUpload('profiles', (image) => setAvatarUrl(image.image_url))

  const name = `${firstName.trim()} ${lastName.trim()}`.trim()
  const trimmedEmail = email.trim()
  const trimmedRoleOther = roleOther.trim()
  // Deliberately the same validation a real signup would use, preview or
  // not — Continue enabling/disabling itself as fields fill in is part of
  // what a preview should demonstrate (feedback: preview should let every
  // field "be filled out and buttons... clicked even if they have no real
  // effect"), rather than being force-disabled the whole time. Only
  // `submit()` below actually branches on `preview`, to skip the real
  // network call.
  // Split from canSubmit so the required-fields explainer (feedback #82) can
  // show whenever a field is genuinely missing, but not merely because a
  // photo upload or the submit request itself is in flight.
  const fieldsComplete =
    isNameValid(firstName, lastName) &&
    isEmailValid(email) &&
    isPhotoValid(avatarUrl) &&
    isRoleValid(role, roleOther) &&
    isKidsValid(role, kidGrades)
  const canSubmit = !submitting && !uploading && fieldsComplete

  async function attachPhoto(file: File) {
    if (!(await attach(file))) setError('Could not upload photo')
  }

  async function submit() {
    if (!canSubmit) return
    // Preview mode never calls the real PATCH /auth/me — that would
    // overwrite the admin's own name/email/role. Clicking Continue here is
    // otherwise identical to the real flow (same validation, same disabled
    // state), it just stops short of the actual network call.
    if (preview) return
    setSubmitting(true)
    setError(null)
    try {
      await updateProfile({
        name,
        email: trimmedEmail,
        avatarUrl: avatarUrl ?? undefined,
        newsletterSubscribed,
        role,
        roleOther: role === 'other' ? trimmedRoleOther : undefined,
        kids: role === 'family' ? kidGrades.map((grade) => ({ grade })) : undefined,
      })
      await refresh()
      onSaved?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <IonContent fullscreen className="ion-padding">
      <h2 className="ion-padding-top">{initialValues ? 'Edit your profile' : 'Set up your profile'}</h2>
      <div style={{ textAlign: 'center', margin: '16px 0' }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) setPendingCropFile(file)
            e.target.value = ''
          }}
        />
        <CropModal
          file={pendingCropFile}
          onCancel={() => setPendingCropFile(null)}
          onCropped={(cropped) => {
            setPendingCropFile(null)
            void attachPhoto(cropped)
          }}
        />
        <p style={{ margin: '0 0 4px', fontSize: '0.875rem', color: 'var(--ion-color-medium)' }}>
          Photo
          <RequiredMark />
        </p>
        {/* Photo pick + crop is genuinely interactive in preview mode, same
            as every field below — Ben wanted a way to actually try the crop
            step (feedback #56) from the deployed admin dev tools without
            registering a real passkey. It's safe to leave live here:
            nothing is sent to the server until Continue's real PATCH
            /auth/me, which `submit()` above still blocks in preview — a
            test upload just sits unused in the 'profiles' folder. */}
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
            <IonLabel position="stacked">
              First name
              <RequiredMark />
            </IonLabel>
            <IonInput
              value={firstName}
              onIonInput={(e) => setFirstName(capitalizeFirst(e.detail.value ?? ''))}
              autocomplete="given-name"
              autofocus
            />
          </IonItem>
          <IonItem>
            <IonLabel position="stacked">
              Last name
              <RequiredMark />
            </IonLabel>
            <IonInput
              value={lastName}
              onIonInput={(e) => setLastName(capitalizeFirst(e.detail.value ?? ''))}
              autocomplete="family-name"
            />
          </IonItem>
          <IonItem>
            <IonLabel position="stacked">
              Email
              <RequiredMark />
            </IonLabel>
            <IonInput type="email" value={email} onIonInput={(e) => setEmail(e.detail.value ?? '')} autocomplete="email" />
          </IonItem>
          {/* Every field stays genuinely interactive in preview, including
              this one (feedback #49) — nothing is sent to the server until
              Continue's real PATCH /auth/me, which `submit()` above still
              blocks whenever `preview` is set. */}
          <RolePicker
            value={role}
            onChange={(value) => {
              setRole(value)
              // Pre-selected to one kid, never zero (feedback, 2026-08-14) —
              // the count dropdown below only offers 1-5, so there must
              // already be a kid present the first time Family is picked.
              if (value === 'family' && kidGrades.length === 0) setKidGrades([GRADE_OPTIONS[0].value])
            }}
          />
          {role === 'other' && (
            <IonItem>
              <IonLabel position="stacked">
                Please describe your relationship to Nettelhorst
                <RequiredMark />
              </IonLabel>
              <IonInput value={roleOther} onIonInput={(e) => setRoleOther(e.detail.value ?? '')} />
            </IonItem>
          )}
        </IonList>
        {/* Kids/grade, Family role only (feedback #81, count-dropdown revised
            2026-08-14) — a "Kids at Nettelhorst" count picker (1-5, never 0 —
            RolePicker above pre-seeds one kid the moment Family is chosen, so
            there's nothing to add a first kid from) drives how many grade
            rows show below it; each kid is only a grade, no name (see
            CLAUDE.md's Data safety & classification — this stays the minimum
            needed for grade-level friend suggestions, not a name/DOB field). */}
        {role === 'family' && (
          <IonList inset>
            <IonItem>
              <IonLabel position="stacked">
                Kids at Nettelhorst
                <RequiredMark />
              </IonLabel>
              <IonSelect
                interface="action-sheet"
                value={kidGrades.length}
                onIonChange={(e) => {
                  const count = e.detail.value as number
                  setKidGrades((prev) =>
                    count <= prev.length ? prev.slice(0, count) : [...prev, ...Array(count - prev.length).fill(GRADE_OPTIONS[0].value)],
                  )
                }}
              >
                {KID_COUNT_OPTIONS.map((count) => (
                  <IonSelectOption key={count} value={count}>
                    {count}
                  </IonSelectOption>
                ))}
              </IonSelect>
            </IonItem>
            {kidGrades.map((grade, index) => (
              <IonItem key={index}>
                <IonLabel position="stacked">Kid {index + 1} grade</IonLabel>
                <IonSelect
                  interface="action-sheet"
                  value={grade}
                  onIonChange={(e) =>
                    setKidGrades((prev) => prev.map((g, i) => (i === index ? (e.detail.value as Grade) : g)))
                  }
                >
                  {GRADE_OPTIONS.map((option) => (
                    <IonSelectOption key={option.value} value={option.value}>
                      {option.label}
                    </IonSelectOption>
                  ))}
                </IonSelect>
              </IonItem>
            ))}
          </IonList>
        )}
        <IonList inset>
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
          {submitLabel}
        </IonButton>
        {!fieldsComplete && (
          <p
            className="ion-padding-start ion-padding-end"
            style={{ color: 'var(--ion-color-medium)', fontSize: '0.8125rem', textAlign: 'center', marginTop: 8 }}
          >
            {REQUIRED_FIELDS_EXPLANATION}
          </p>
        )}
      </IonContent>
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
  const location = useLocation()

  // The invite screen's new "Learn more" link (feedback #85) points at the
  // real About page, which normally only renders once already a member (see
  // App.tsx's own /about Route, inside these `children`). Special-cased here
  // so a not-yet-a-member visitor can read it too, without duplicating its
  // content into a second copy just for the logged-out state. Only bypasses
  // the gate for this one path — every other route still requires being a
  // full member, same as before.
  if (location.pathname === '/about' && (isLoading || !user || !user.profileComplete)) {
    return <AboutPage />
  }

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
    return (
      <IonPage>
        <ProfileSetupWizard />
      </IonPage>
    )
  }

  if (!user.friendsStepComplete) {
    return (
      <IonPage>
        <ChooseFriendsScreen />
      </IonPage>
    )
  }

  return <>{children}</>
}
