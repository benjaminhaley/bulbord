import type { Grade } from './api'

// Constants and pure validation rules shared between ProfileSetupScreen (the
// single-page form EditProfilePage.tsx reuses for editing an existing
// profile — see CLAUDE.md's Login section, "keep single-page for editing")
// and ProfileSetupWizard (the stepped screen new members go through,
// feedback #88). Kept as plain data/pure functions rather than a shared
// stateful hook — the two components' interaction models (one long scroll
// vs. one field per screen) differ enough that their own state/JSX aren't
// worth forcing through one abstraction, but the actual validation *rules*
// (what makes a role/kids selection valid) are genuinely the same rule in
// both places and would silently drift if hand-copied twice.

export type Role = 'staff' | 'family' | 'other'

export const ROLE_OPTIONS: { value: Role; label: string; detail: string }[] = [
  { value: 'staff', label: 'Staff', detail: 'You work at Nettelhorst.' },
  { value: 'family', label: 'Family', detail: 'You are family of a kid at Nettelhorst.' },
  { value: 'other', label: 'Other', detail: 'Someone else in the Nettelhorst community.' },
]

export const GRADE_OPTIONS: { value: Grade; label: string }[] = [
  { value: 'pre-k', label: 'Pre-K' },
  { value: 'k', label: 'Kindergarten' },
  { value: '1', label: '1st Grade' },
  { value: '2', label: '2nd Grade' },
  { value: '3', label: '3rd Grade' },
  { value: '4', label: '4th Grade' },
  { value: '5', label: '5th Grade' },
  { value: '6', label: '6th Grade' },
  { value: '7', label: '7th Grade' },
  { value: '8', label: '8th Grade' },
]

// 1-5, never 0 (feedback, 2026-08-14) — the "Kids at Nettelhorst" count
// picker's own options, so a zero-kid state isn't selectable at all.
export const KID_COUNT_OPTIONS = [1, 2, 3, 4, 5]

// Nettelhorst Bulbord is invite-only (feedback #82) — this is why a photo
// (and every other required field) is required, and the wording other
// members would actually see explained back to them if they're missing
// something.
export const REQUIRED_FIELDS_EXPLANATION =
  'Nettelhorst Bulbord is only for members of the Nettelhorst community — this information lets others verify that you are.'

// Every profile-setup field is mandatory except the photo — marked visually
// so that's obvious at a glance rather than only enforced invisibly by
// canSubmit/validateProfileUpdate (feedback: "make sure all fields except
// image are mandatory in sign up").
export function RequiredMark() {
  return (
    <span aria-hidden="true" style={{ color: 'var(--ion-color-danger)' }}>
      {' '}
      *
    </span>
  )
}

export function capitalizeFirst(value: string) {
  return value.length ? value[0].toUpperCase() + value.slice(1) : value
}

export function isNameValid(firstName: string, lastName: string) {
  return !!firstName.trim() && !!lastName.trim()
}

export function isEmailValid(email: string) {
  return email.trim().includes('@')
}

export function isRoleValid(role: Role | undefined, roleOther: string) {
  return !!role && (role !== 'other' || !!roleOther.trim())
}

export function isKidsValid(role: Role | undefined, kidGrades: Grade[]) {
  return role !== 'family' || kidGrades.length > 0
}

export function isPhotoValid(avatarUrl: string | null) {
  return !!avatarUrl
}

// Prefills the form for an already-onboarded member editing their own
// profile later (EditProfilePage.tsx, feedback 2026-08-14: "I should be
// able to see and edit who my kids are (and all onboarding information) in
// my profile") — kept as a separate type rather than reusing CurrentUser
// directly so this component doesn't depend on the auth API's response
// shape, just plain form values the caller is responsible for deriving
// (e.g. splitting `name` into first/last).
export interface ProfileSetupInitialValues {
  firstName: string
  lastName: string
  email: string
  avatarUrl: string | null
  newsletterSubscribed: boolean
  role: Role | undefined
  roleOther: string
  kidGrades: Grade[]
}
