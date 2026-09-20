import type { FastifyReply, FastifyRequest } from 'fastify'

// Feedback #175: the listing tabs are browsable without an account, but the
// people attached to a listing (who's interested, who posted it) are PII and
// stay behind login. Rather than trusting every serializer/query for those
// routes to remember to omit them, this scrubs the finished response body
// for any request without an approved member behind it — one place, deep,
// so a new nested list-of-events shape can't reintroduce a leak by accident.
// Counts (`interested_count`) intentionally survive.
const PII_KEYS_TO_EMPTY: Record<string, unknown> = {
  interested_people: [],
  submitted_by: null,
  interest_status: null,
  can_edit: false,
  can_delete: false,
}

export function scrubPeople<T>(value: T): T {
  if (Array.isArray(value)) return value.map(scrubPeople) as T
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {}
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = key in PII_KEYS_TO_EMPTY ? PII_KEYS_TO_EMPTY[key] : scrubPeople(inner)
    }
    return out as T
  }
  return value
}

// Route option for a read endpoint that's public but person-scrubbed for
// anonymous/pending visitors. Use in place of `preHandler: requireAuth`.
export const publicRead = {
  preSerialization: async (request: FastifyRequest, _reply: FastifyReply, payload: unknown) =>
    request.currentUser ? payload : scrubPeople(payload),
}
