import {
  IonButton,
  IonContent,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonProgressBar,
  IonRadio,
  IonRadioGroup,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
  IonToggle,
} from '@ionic/react'
import { camera, checkmark, chevronBackOutline } from 'ionicons/icons'
import { useState, type ReactNode } from 'react'

import { API_URL } from '../config'
import { unstyledButtonStyle } from '../theme/layout'
import { CropModal } from '../uploads/CropModal'
import { useImageUpload } from '../uploads/useImageUpload'
import { updateProfile } from './api'
import { useAuth } from './AuthContext'
import './onboardingWizard.css'
import {
  capitalizeWords,
  GRADE_OPTIONS,
  isEmailValid,
  isKidsValid,
  isNameValid,
  isPhotoValid,
  isRoleValid,
  REQUIRED_FIELDS_EXPLANATION,
  ROLE_OPTIONS,
  type Role,
} from './profileForm'

// The stepped, one-thing-per-screen sign-up flow (feedback #88 — the earlier
// version of this screen, ProfileSetupScreen (still exported from
// JoinGate.tsx and used by EditProfilePage.tsx for editing an existing
// profile — see CLAUDE.md's Login section, "keep single-page for editing"),
// was one long scrolling form; Ben's own framing was "modern apps... walk
// you through it... one step at a time"). New members only — this component
// has no `initialValues` prop and is never used for editing.
//
// Field state/validation isn't shared with ProfileSetupScreen via a common
// hook — the two components' interaction models differ enough (one scroll
// vs. one field per screen) that forcing shared state through an abstraction
// wasn't worth it; what genuinely is shared is the *validation rules*
// (profileForm.tsx's isNameValid/isEmailValid/etc.) and the field option
// constants, which would silently drift if hand-copied twice.
//
// Approved by Ben via an interactive HTML prototype before any of this was
// built (feedback #88) — two changes from that prototype: (1) the photo
// step's crop UI stayed a CropModal overlay on the *same* step rather than
// becoming its own step in the sequence, per Ben's own follow-up ("just one
// photo step should be enough, it doesn't need a distinct screen") — this
// was actually already true of how CropModal works (a modal, not a route),
// the prototype's own step-swap-within-the-photo-screen was just a mockup
// simplification. (2) the invite-accept and choose-friends screens' restyle
// + the passkey-pending/welcome transition screens live in JoinGate.tsx and
// ChooseFriendsScreen.tsx respectively, not here — this file is only the
// profile-fields portion of the flow.

type StepId = 'name' | 'email' | 'role' | 'kids' | 'photo' | 'newsletter'

function visibleSteps(role: Role | undefined): StepId[] {
  const steps: StepId[] = ['name', 'email', 'role']
  if (role === 'family') steps.push('kids')
  steps.push('photo', 'newsletter')
  return steps
}

// A step's own headline/subcopy/content, plus the shared chrome (back
// chevron + progress bar above, Continue button + optional helper text
// below) every field step uses identically.
function StepShell({
  stepNumber,
  totalSteps,
  onBack,
  headline,
  subcopy,
  children,
  continueLabel = 'Continue',
  onContinue,
  continueDisabled,
  helperText,
  error,
  direction,
}: {
  stepNumber: number
  totalSteps: number
  onBack: (() => void) | null
  headline: string
  subcopy?: string
  children: ReactNode
  continueLabel?: string
  onContinue: () => void
  continueDisabled: boolean
  helperText?: string
  error?: string | null
  direction: 1 | -1
}) {
  return (
    <IonContent fullscreen>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px 4px' }}>
        <IonButton
          fill="clear"
          size="small"
          disabled={!onBack}
          onClick={onBack ?? undefined}
          style={{ visibility: onBack ? 'visible' : 'hidden', margin: 0 }}
          aria-label="Back"
          data-testid="wizard-back"
        >
          <IonIcon icon={chevronBackOutline} slot="icon-only" />
        </IonButton>
        <IonProgressBar value={stepNumber / totalSteps} style={{ flex: 1, borderRadius: 2 }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ion-color-medium)', minWidth: 32, textAlign: 'right' }}>
          {stepNumber}/{totalSteps}
        </span>
      </div>
      <div
        key={`${headline}-${direction}`}
        className={direction === 1 ? 'wizard-step-forward' : 'wizard-step-back'}
        style={{ padding: '8px 24px 24px', display: 'flex', flexDirection: 'column', minHeight: 'calc(100% - 40px)' }}
      >
        <h2 style={{ fontSize: '1.7rem', fontWeight: 700, letterSpacing: '-0.01em', margin: '8px 0 4px' }}>{headline}</h2>
        {subcopy && (
          <p style={{ color: 'var(--ion-color-medium)', margin: '0 0 24px', maxWidth: '34ch' }}>{subcopy}</p>
        )}
        <div style={{ flex: 1 }}>{children}</div>
        {error && (
          <IonText color="danger">
            <p>{error}</p>
          </IonText>
        )}
        {helperText && (
          <p style={{ color: 'var(--ion-color-medium)', fontSize: '0.8125rem', textAlign: 'center', margin: '0 0 8px' }}>
            {helperText}
          </p>
        )}
        <IonButton
          expand="block"
          disabled={continueDisabled}
          onClick={onContinue}
          // 72px clears the persistent share FAB (index.css's .share-fab,
          // see CLAUDE.md's Camps section for the same fix applied there) —
          // only actually visible when this step is reached via the admin
          // preview route (ShareButton doesn't render during real
          // onboarding, since JoinGate hasn't returned `children` yet), but
          // harmless extra bottom space either way.
          style={{ marginTop: 8, marginBottom: 72 }}
        >
          {continueLabel}
        </IonButton>
      </div>
    </IonContent>
  )
}

// Big tappable role cards, shown as their own step — a real UX improvement
// over ProfileSetupScreen's RolePicker (a modal bottom sheet) that a
// dedicated screen makes possible: RolePicker's whole reason for being a
// modal was fitting a role explainer onto a form page already busy with
// other fields (see JoinGate.tsx's RolePicker doc comment) — that constraint
// doesn't exist here, so the explainer can just live on the page directly.
function RoleStepCards({ value, onSelect }: { value: Role | undefined; onSelect: (role: Role) => void }) {
  return (
    <IonRadioGroup value={value} onIonChange={(e) => onSelect(e.detail.value)}>
      {ROLE_OPTIONS.map((option) => {
        const selected = value === option.value
        return (
          <div
            key={option.value}
            style={{
              border: `1.5px solid ${selected ? 'var(--ion-color-primary)' : 'var(--ion-color-light-shade, #e0e0e0)'}`,
              borderRadius: 16,
              marginBottom: 12,
              background: selected ? 'rgba(56, 128, 255, 0.08)' : 'transparent',
            }}
          >
            <IonItem button lines="none" detail={false} style={{ '--background': 'transparent' } as React.CSSProperties} onClick={() => onSelect(option.value)}>
              <IonLabel className="ion-text-wrap">
                <h3 style={{ fontWeight: 700, marginBottom: 2 }}>{option.label}</h3>
                <p>{option.detail}</p>
              </IonLabel>
              <IonRadio slot="end" value={option.value} />
            </IonItem>
          </div>
        )
      })}
    </IonRadioGroup>
  )
}

export function ProfileSetupWizard({ preview = false, onSaved }: { preview?: boolean; onSaved?: () => void } = {}) {
  const { refresh } = useAuth()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role | undefined>(undefined)
  const [roleOther, setRoleOther] = useState('')
  const [kidGrades, setKidGrades] = useState<(typeof GRADE_OPTIONS)[number]['value'][]>([])
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [newsletterSubscribed, setNewsletterSubscribed] = useState(true)
  const [pendingCropFile, setPendingCropFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { fileInputRef, uploading, attach } = useImageUpload('profiles', (image) => setAvatarUrl(image.image_url))

  const [stepIndex, setStepIndex] = useState(0)
  const [direction, setDirection] = useState<1 | -1>(1)
  // Local, non-persisted — no DB flag needed. Set once the real (or, in
  // preview, simulated) submit succeeds; JoinGate keeps rendering this same
  // component the whole time this is shown, since `refresh()` (the thing
  // that actually advances JoinGate to ChooseFriendsScreen) is deliberately
  // deferred until the member taps Continue here, not fired the instant the
  // network call resolves — same "let the member choose when to move on"
  // pattern ChooseFriendsScreen's own Welcome screen uses.
  const [phase, setPhase] = useState<'fields' | 'complete'>('fields')

  const steps = visibleSteps(role)
  const stepId = steps[stepIndex]
  const trimmedRoleOther = roleOther.trim()

  async function attachPhoto(file: File | Blob) {
    if (!(await attach(file))) setError('Could not upload photo')
  }

  function goBack() {
    if (stepIndex === 0) return
    setDirection(-1)
    setStepIndex((i) => i - 1)
  }

  function goNext() {
    setDirection(1)
    if (stepIndex < steps.length - 1) {
      setStepIndex((i) => i + 1)
      return
    }
    void finish()
  }

  async function finish() {
    if (preview) {
      setPhase('complete')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await updateProfile({
        name: `${firstName.trim()} ${lastName.trim()}`.trim(),
        email: email.trim(),
        avatarUrl: avatarUrl ?? undefined,
        newsletterSubscribed,
        role,
        roleOther: role === 'other' ? trimmedRoleOther : undefined,
        kids: role === 'family' ? kidGrades.map((grade) => ({ grade })) : undefined,
      })
      setPhase('complete')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile')
    } finally {
      setSubmitting(false)
    }
  }

  async function continueFromComplete() {
    if (!preview) await refresh()
    onSaved?.()
  }

  if (phase === 'complete') {
    return (
      <IonContent fullscreen className="ion-padding">
        <div
          style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            gap: 8,
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              background: 'var(--ion-color-success)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 8,
            }}
          >
            <IonIcon icon={checkmark} style={{ fontSize: 36, color: '#fff' }} />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>You're all set{firstName ? `, ${firstName}` : ''}!</h2>
          <p style={{ color: 'var(--ion-color-medium)', maxWidth: '30ch' }}>
            Your profile is ready. One last thing — want to find some friends?
          </p>
          <IonButton expand="block" style={{ width: '100%', marginTop: 24, marginBottom: 72 }} onClick={continueFromComplete}>
            Continue
          </IonButton>
        </div>
      </IonContent>
    )
  }

  const shellProps = {
    stepNumber: stepIndex + 1,
    totalSteps: steps.length,
    onBack: stepIndex > 0 ? goBack : null,
    direction,
  }

  if (stepId === 'name') {
    return (
      <StepShell
        {...shellProps}
        headline="What should we call you?"
        subcopy="Your name helps other Nettelhorst neighbors recognize you."
        onContinue={goNext}
        continueDisabled={!isNameValid(firstName, lastName)}
      >
        <IonInput
          label="First name"
          labelPlacement="floating"
          fill="outline"
          value={firstName}
          onIonInput={(e) => setFirstName(capitalizeWords(e.detail.value ?? ''))}
          autocomplete="given-name"
          autofocus
          style={{ marginBottom: 16 }}
        />
        <IonInput
          label="Last name"
          labelPlacement="floating"
          fill="outline"
          value={lastName}
          onIonInput={(e) => setLastName(capitalizeWords(e.detail.value ?? ''))}
          autocomplete="family-name"
        />
      </StepShell>
    )
  }

  if (stepId === 'email') {
    return (
      <StepShell
        {...shellProps}
        headline="What's your email?"
        subcopy="For the weekly newsletter and important updates. Never shown to other members."
        onContinue={goNext}
        continueDisabled={!isEmailValid(email)}
      >
        <IonInput
          type="email"
          label="Email"
          labelPlacement="floating"
          fill="outline"
          value={email}
          onIonInput={(e) => setEmail(e.detail.value ?? '')}
          autocomplete="email"
          autofocus
        />
      </StepShell>
    )
  }

  if (stepId === 'role') {
    return (
      <StepShell
        {...shellProps}
        headline="Which best describes you?"
        subcopy="This helps us tailor what you see — like suggesting parents with kids in the same grade."
        onContinue={goNext}
        continueDisabled={!isRoleValid(role, roleOther)}
      >
        <RoleStepCards
          value={role}
          onSelect={(value) => {
            setRole(value)
            // Pre-selected to one kid, never zero (feedback, 2026-08-14) —
            // the count picker on the Kids step only offers 1-5.
            if (value === 'family' && kidGrades.length === 0) setKidGrades([GRADE_OPTIONS[0].value])
          }}
        />
        {role === 'other' && (
          <IonInput
            label="Please describe your relationship to Nettelhorst"
            labelPlacement="floating"
            fill="outline"
            value={roleOther}
            onIonInput={(e) => setRoleOther(e.detail.value ?? '')}
            style={{ marginTop: 4 }}
          />
        )}
      </StepShell>
    )
  }

  if (stepId === 'kids') {
    return (
      <StepShell
        {...shellProps}
        headline="How many kids do you have at Nettelhorst?"
        subcopy="Helps us suggest friends with kids in the same grade. Never shown to other members."
        onContinue={goNext}
        continueDisabled={!isKidsValid(role, kidGrades)}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28, margin: '4px 0 20px' }}>
          <IonButton
            fill="outline"
            shape="round"
            disabled={kidGrades.length <= 1}
            onClick={() => setKidGrades((prev) => prev.slice(0, prev.length - 1))}
            aria-label="Fewer kids"
            data-testid="kid-count-minus"
          >
            −
          </IonButton>
          <span style={{ fontSize: '2rem', fontWeight: 700, minWidth: '2ch', textAlign: 'center' }}>{kidGrades.length}</span>
          <IonButton
            fill="outline"
            shape="round"
            disabled={kidGrades.length >= 5}
            onClick={() => setKidGrades((prev) => [...prev, GRADE_OPTIONS[0].value])}
            aria-label="More kids"
            data-testid="kid-count-plus"
          >
            +
          </IonButton>
        </div>
        {kidGrades.map((grade, index) => (
          <IonItem key={index}>
            <IonLabel position="stacked">Kid {index + 1} grade</IonLabel>
            <IonSelect
              interface="action-sheet"
              value={grade}
              onIonChange={(e) => setKidGrades((prev) => prev.map((g, i) => (i === index ? e.detail.value : g)))}
            >
              {GRADE_OPTIONS.map((option) => (
                <IonSelectOption key={option.value} value={option.value}>
                  {option.label}
                </IonSelectOption>
              ))}
            </IonSelect>
          </IonItem>
        ))}
      </StepShell>
    )
  }

  if (stepId === 'photo') {
    return (
      <StepShell
        {...shellProps}
        headline="Add your photo"
        subcopy="A real photo of you — not a logo or a pet."
        onContinue={goNext}
        continueDisabled={!isPhotoValid(avatarUrl)}
        helperText={!isPhotoValid(avatarUrl) ? REQUIRED_FIELDS_EXPLANATION : undefined}
        error={error}
      >
        <div style={{ textAlign: 'center' }}>
          {/* ionic-exception: Ionic has no file-picker component; a hidden
              native file input triggered by a real button is the standard
              pattern (see the IonButton below). */}
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
          {/* A real IonButton, not a hand-rolled `<div onClick>` (2026-08-22
              audit — see InstitutionBanner.tsx's own comment for the fuller
              story): `--border-radius` is Ionic's own exposed custom
              property for the button's actual rendered shape (plain `border`
              still has to go on the host style directly — Ionic exposes no
              `--border` equivalent for a *dashed* border specifically). */}
          <IonButton
            fill="clear"
            onClick={() => fileInputRef.current?.click()}
            style={
              {
                ...unstyledButtonStyle,
                width: '10.5rem',
                height: '10.5rem',
                margin: '12px auto',
                display: 'flex',
                border: '2px dashed var(--ion-color-medium)',
                borderRadius: '50%',
                overflow: 'hidden',
                '--border-radius': '50%',
              } as React.CSSProperties
            }
          >
            {uploading && <IonSpinner name="dots" />}
            {!uploading && avatarUrl && (
              <img src={`${API_URL}${avatarUrl}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            )}
            {!uploading && !avatarUrl && <IonIcon icon={camera} style={{ fontSize: 40, color: 'var(--ion-color-medium)' }} />}
          </IonButton>
          <p style={{ fontWeight: 600, fontSize: '0.8125rem' }}>{avatarUrl ? 'Tap to retake' : 'Tap to add photo'}</p>
        </div>
      </StepShell>
    )
  }

  // 'newsletter' — the last field step.
  return (
    <StepShell
      {...shellProps}
      headline="Stay in the loop?"
      subcopy="A weekly digest of what's happening at Nettelhorst. You can unsubscribe anytime."
      continueLabel="Finish"
      onContinue={goNext}
      continueDisabled={submitting || uploading}
      error={error}
    >
      <IonItem
        lines="none"
        style={{ '--background': 'var(--ion-color-light, #f4f5f8)', borderRadius: 16 } as React.CSSProperties}
      >
        <IonLabel className="ion-text-wrap">
          <h3 style={{ fontWeight: 700 }}>Weekly newsletter</h3>
          <p>Camps, events, and community news — every Sunday night.</p>
        </IonLabel>
        <IonToggle
          slot="end"
          checked={newsletterSubscribed}
          onIonChange={(e) => setNewsletterSubscribed(e.detail.checked)}
        />
      </IonItem>
    </StepShell>
  )
}
