import { beforeEach, describe, expect, it, vi } from 'vitest'

// Same db/client.js mocking shape as admin/memberDeletion.test.ts and
// events/pipeline-review-service.test.ts — no real Postgres needed.
const insertCalls: Record<string, unknown>[] = []
let selectResult: Record<string, unknown>[] = []

vi.mock('../db/client.js', () => {
  const chain = {
    from: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    orderBy: () => Promise.resolve(selectResult),
    limit: () => Promise.resolve(selectResult),
  }
  const builder: Record<string, unknown> = {
    select: () => chain,
    insert: () => ({
      values: (row: Record<string, unknown>) => {
        insertCalls.push(row)
        return Promise.resolve()
      },
    }),
  }
  return { db: builder }
})

beforeEach(() => {
  insertCalls.length = 0
  selectResult = []
})

describe('recordEdit', () => {
  it('no-ops (no insert) when nothing in the editable-field allow-list actually changed', async () => {
    const { recordEdit } = await import('./service.js')

    await recordEdit({
      entityType: 'event',
      entityId: 'event-1',
      actorUserId: 'user-1',
      before: { title: 'Fall Festival', address: '123 Main St' },
      after: { title: 'Fall Festival', address: '123 Main St' },
    })

    expect(insertCalls).toHaveLength(0)
  })

  it('inserts one row with the correct changed_fields when something in the allow-list differs', async () => {
    const { recordEdit } = await import('./service.js')

    await recordEdit({
      entityType: 'event',
      entityId: 'event-1',
      actorUserId: 'user-1',
      before: { title: 'Fall Festival', address: '123 Main St', topic: null },
      after: { title: 'Fall Carnival', address: '123 Main St', topic: 'Community & Social' },
    })

    expect(insertCalls).toHaveLength(1)
    expect(insertCalls[0]).toEqual(
      expect.objectContaining({
        entityType: 'event',
        entityId: 'event-1',
        actorUserId: 'user-1',
        changedFields: expect.arrayContaining(['title', 'topic']),
      }),
    )
    expect((insertCalls[0].changedFields as string[]).sort()).toEqual(['title', 'topic'])
  })

  it("ignores a difference in a field that isn't part of this entity type's editable allow-list", async () => {
    const { recordEdit } = await import('./service.js')

    // 'status' is a real events column but a workflow field, not part of
    // EDITABLE_FIELDS.event — a diff there should never leak into history.
    await recordEdit({
      entityType: 'event',
      entityId: 'event-1',
      actorUserId: 'user-1',
      before: { title: 'Fall Festival', status: 'pending' },
      after: { title: 'Fall Festival', status: 'approved' },
    })

    expect(insertCalls).toHaveLength(0)
  })

  it('treats a null and an empty/undefined value in the same field as unchanged', async () => {
    const { recordEdit } = await import('./service.js')

    await recordEdit({
      entityType: 'event',
      entityId: 'event-1',
      actorUserId: 'user-1',
      before: { title: 'Fall Festival', description: null },
      after: { title: 'Fall Festival', description: undefined },
    })

    expect(insertCalls).toHaveLength(0)
  })

  it('diffs an array field (option_list) by value, not by reference', async () => {
    const { recordEdit } = await import('./service.js')

    const options = [{ label: 'Day camp', start_time: null, end_time: null, price: '85', age_min: null, age_max: null, note: null }]
    await recordEdit({
      entityType: 'camp',
      entityId: 'camp-1',
      actorUserId: 'user-1',
      before: { options: JSON.parse(JSON.stringify(options)) },
      after: { options: JSON.parse(JSON.stringify(options)) },
    })

    expect(insertCalls).toHaveLength(0)

    await recordEdit({
      entityType: 'camp',
      entityId: 'camp-1',
      actorUserId: 'user-1',
      before: { options },
      after: { options: [{ ...options[0], price: '95' }] },
    })

    expect(insertCalls).toHaveLength(1)
    expect(insertCalls[0].changedFields).toEqual(['options'])
  })

  it('records a system actor via actorLabel, with no actorUserId', async () => {
    const { recordEdit } = await import('./service.js')

    await recordEdit({
      entityType: 'event',
      entityId: 'event-1',
      actorLabel: 'system:image-enrichment',
      before: { image_url: 'https://old.example.com/img.jpg' },
      after: { image_url: 'https://new.example.com/img.jpg' },
    })

    expect(insertCalls[0]).toEqual(expect.objectContaining({ actorUserId: null, actorLabel: 'system:image-enrichment' }))
  })
})

describe('EDITABLE_FIELDS', () => {
  it("includes camps' four fields feedback #141 opened from seed-only to member-editable", async () => {
    const { EDITABLE_FIELDS } = await import('./service.js')
    expect(EDITABLE_FIELDS.camp).toEqual(
      expect.arrayContaining(['price_is_estimated', 'options', 'booking_status', 'prep_items']),
    )
  })

  it("includes sports clubs' two fields feedback #141 opened from seed-only to member-editable", async () => {
    const { EDITABLE_FIELDS } = await import('./service.js')
    expect(EDITABLE_FIELDS.sports_club).toEqual(expect.arrayContaining(['options', 'signup_status']))
  })

  it('never includes an internal workflow column (status, submittedByUserId) for any entity type', async () => {
    const { EDITABLE_FIELDS } = await import('./service.js')
    for (const fields of Object.values(EDITABLE_FIELDS)) {
      expect(fields).not.toEqual(expect.arrayContaining(['status', 'submitted_by_user_id', 'pipeline_reviewed_at']))
    }
  })
})

describe('describeSystemActor', () => {
  it('maps a known system label to a friendly description', async () => {
    const { describeSystemActor } = await import('./service.js')
    expect(describeSystemActor('system:image-enrichment')).toBe('Automatic photo update')
  })

  it('falls back to the raw label for an unrecognized one, rather than erroring', async () => {
    const { describeSystemActor } = await import('./service.js')
    expect(describeSystemActor('system:some-future-thing')).toBe('system:some-future-thing')
  })
})

describe('listEditHistory / getEditHistoryEntry actor resolution', () => {
  it('resolves a member actor to {type: "member", name, avatar_url}', async () => {
    selectResult = [
      {
        id: 'edit-1',
        actorUserId: 'user-1',
        actorLabel: null,
        actorName: 'Maria Chen',
        actorAvatarUrl: '/uploads/avatar.jpg',
        createdAt: new Date('2026-09-07T12:00:00Z'),
        changedFields: ['title'],
      },
    ]
    const { listEditHistory } = await import('./service.js')

    const [entry] = await listEditHistory('event', 'event-1')

    expect(entry.actor).toEqual({ type: 'member', name: 'Maria Chen', avatar_url: '/uploads/avatar.jpg', description: null })
  })

  it('resolves a system actor to a friendly description, no avatar', async () => {
    selectResult = [
      {
        id: 'edit-1',
        actorUserId: null,
        actorLabel: 'system:image-enrichment',
        actorName: null,
        actorAvatarUrl: null,
        createdAt: new Date('2026-09-07T12:00:00Z'),
        changedFields: ['image_url'],
      },
    ]
    const { listEditHistory } = await import('./service.js')

    const [entry] = await listEditHistory('event', 'event-1')

    expect(entry.actor).toEqual({ type: 'system', name: 'Automatic photo update', avatar_url: null, description: 'system:image-enrichment' })
  })
})
