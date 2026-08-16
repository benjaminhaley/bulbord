import { beforeEach, describe, expect, it, vi } from 'vitest'

// Same db/client.js mocking shape as impersonation.test.ts's own — no real
// Postgres needed, just enough of the query builder to record what
// deleteMember tried to do.
const selectResults: Record<string, unknown>[] = []
const updateCalls: { set: Record<string, unknown> }[] = []
const insertCalls: Record<string, unknown>[] = []

vi.mock('../db/client.js', () => {
  const builder: Record<string, unknown> = {}
  Object.assign(builder, {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(selectResults),
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updateCalls.push({ set: values })
        return { where: () => Promise.resolve() }
      },
    }),
    insert: () => ({
      values: (row: Record<string, unknown>) => {
        insertCalls.push(row)
        return Promise.resolve()
      },
    }),
  })
  return { db: builder }
})

beforeEach(() => {
  selectResults.length = 0
  updateCalls.length = 0
  insertCalls.length = 0
})

describe('deleteMember', () => {
  it("refuses to let an admin delete their own account, without touching the database", async () => {
    const { deleteMember } = await import('./memberDeletion.js')
    const result = await deleteMember('admin-1', 'admin-1')
    expect(result).toEqual({ error: 'not_self' })
    expect(updateCalls).toHaveLength(0)
    expect(insertCalls).toHaveLength(0)
  })

  it('returns not_found for an unknown or already-deleted target', async () => {
    const { deleteMember } = await import('./memberDeletion.js')
    const result = await deleteMember('missing-user', 'admin-1')
    expect(result).toEqual({ error: 'not_found' })
    expect(updateCalls).toHaveLength(0)
  })

  it('soft-deletes the target and writes a distinct audit log entry', async () => {
    selectResults.push({ id: 'user-1', name: 'Test Account' })

    const { deleteMember } = await import('./memberDeletion.js')
    const result = await deleteMember('user-1', 'admin-1')

    expect(result).toEqual({ ok: true })

    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0]!.set.deletedAt).toBeInstanceOf(Date)

    expect(insertCalls).toEqual([
      expect.objectContaining({
        actor: 'admin-1',
        action: 'user_deleted',
        metadata: expect.objectContaining({ targetUserId: 'user-1', targetName: 'Test Account' }),
      }),
    ])
  })
})
