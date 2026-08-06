import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { InviteAcceptCard } from './JoinGate'

// Previews of the invite/join screen (feedback #44) — real component code,
// not a hand-copied mockup, same rationale as the existing InvitePreviewPage
// dev tool (feedback #38) but viewable without being signed in as admin.
// ProfileSetupScreen (the next step) has its own story file since it's a
// different component — see ProfileSetupScreen.stories.tsx.
const meta = {
  component: InviteAcceptCard,
  tags: ['ai-generated'],
} satisfies Meta<typeof InviteAcceptCard>

export default meta
type Story = StoryObj<typeof meta>

export const InvitedByAMember: Story = {
  args: {
    invite: { name: 'Sam Rivera', avatarUrl: null },
    busy: false,
    error: null,
    onAccept: () => {},
    onSignIn: () => {},
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Sam Rivera invited you')).toBeVisible()
  },
}

// The very first account (no inviter yet) — see JoinGate.tsx's ROOT_INVITE_SECRET path.
export const RootBootstrap: Story = {
  args: {
    invite: null,
    busy: false,
    error: null,
    onAccept: () => {},
    onSignIn: () => {},
  },
}

// The real "a passkey ceremony is in flight" loading state (JoinScreen.tsx
// passes busy={true} while registerPasskey/loginWithPasskey is pending) —
// not what InvitePreviewPage.tsx's admin dev tool renders, which keeps
// busy={false} so its buttons stay genuinely clickable (see JoinGate.tsx's
// InviteAcceptCard doc comment).
export const BusyDuringRealCeremony: Story = {
  args: {
    invite: { name: 'Ben Haley', avatarUrl: null },
    busy: true,
    error: null,
    onAccept: () => {},
    onSignIn: () => {},
  },
}

export const WithError: Story = {
  args: {
    invite: null,
    busy: false,
    error: 'Could not create your passkey',
    onAccept: () => {},
    onSignIn: () => {},
  },
}

// One CssCheck for the whole project (per Storybook AI setup guidance):
// BrandHeader's logo backing is a hardcoded dark chip (#2c2c2c) behind
// otherwise-invisible white-on-transparent logo art (see JoinGate.tsx's own
// comment on nettelhorst-logo.png) — a real regression if this ever
// silently reverted to a transparent/light background.
export const CssCheck: Story = {
  args: {
    invite: null,
    busy: false,
    error: null,
    onAccept: () => {},
    onSignIn: () => {},
  },
  play: async ({ canvasElement }) => {
    const logoBacking = canvasElement.querySelector('img[src="/nettelhorst-logo.png"]')?.parentElement
    await expect(logoBacking).toBeTruthy()
    await expect(getComputedStyle(logoBacking!).backgroundColor).toBe('rgb(44, 44, 44)')
  },
}
