import { describe, expect, it, vi } from 'vitest'

vi.mock('../db/client.js', () => ({ db: {} }))

const { anonymousActor } = await import('./service.js')

// Feedback #175: logged-out visitors are recorded in analytics under a
// browser-generated random id. It goes straight into events_log.actor, so
// only a well-formed UUID is accepted.
describe('anonymousActor', () => {
  it('prefixes a valid visitor id, lowercased', () => {
    expect(anonymousActor('3F2504E0-4F89-41D3-9A0C-0305E82C3301')).toBe('anon:3f2504e0-4f89-41d3-9a0c-0305e82c3301')
  })

  it('rejects anything that is not a UUID', () => {
    expect(anonymousActor('')).toBeNull()
    expect(anonymousActor("x'; drop table users;--")).toBeNull()
    expect(anonymousActor('system:newsletter-cron')).toBeNull()
    expect(anonymousActor('anon:3f2504e0-4f89-41d3-9a0c-0305e82c3301')).toBeNull()
  })
})
