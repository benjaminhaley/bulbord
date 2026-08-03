import { http, HttpResponse } from 'msw'

import { API_URL } from '../src/config'

// Covers only what the JoinGate stories exercise: ProfileSetupScreen's
// submit path. InviteAcceptCard needs no handler — it takes its `invite`
// data as a prop, not via fetch (see JoinGate.tsx's own comment on why it's
// built that way).
export const mswHandlers = [
  http.patch(`${API_URL}/auth/me`, async ({ request }) => {
    const body = (await request.json()) as { name?: string; email?: string; avatarUrl?: string }
    return HttpResponse.json({
      data: {
        id: 'story-user',
        name: body.name ?? 'New Member',
        email: body.email ?? null,
        avatarUrl: body.avatarUrl ?? null,
        profileComplete: true,
      },
    })
  }),
]
