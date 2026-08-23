import { beforeEach, describe, expect, it, vi } from 'vitest'

const insertCalls: Record<string, unknown>[] = []
const selectResults: Record<string, unknown>[][] = []

vi.mock('../db/client.js', () => {
  const builder: Record<string, unknown> = {}
  Object.assign(builder, {
    select: () => builder,
    from: () => builder,
    where: () => builder,
    limit: () => Promise.resolve(selectResults.shift() ?? []),
    insert: () => ({
      values: (row: Record<string, unknown>) => {
        insertCalls.push(row)
        return { returning: () => Promise.resolve([{ id: `generated-${insertCalls.length}` }]) }
      },
    }),
  })
  return { db: builder }
})

describe('registerDiscoveredEventSource', () => {
  beforeEach(() => {
    insertCalls.length = 0
    selectResults.length = 0
    vi.resetModules()
  })

  it('inserts a new event_sources row and an events_log entry when the URL is not already known, and returns its id', async () => {
    selectResults.push([]) // no existing source at this URL
    const { registerDiscoveredEventSource } = await import('./source-registration.js')

    const id = await registerDiscoveredEventSource('https://hawthorne.example/events', 'Hawthorne Scholastic Academy', 'user-1')

    expect(id).toBe('generated-1')
    expect(insertCalls).toHaveLength(2)
    expect(insertCalls[0]).toEqual(
      expect.objectContaining({
        name: 'Hawthorne Scholastic Academy',
        url: 'https://hawthorne.example/events',
        type: 'website',
        isActive: true,
      }),
    )
    expect(insertCalls[1]).toEqual(
      expect.objectContaining({
        actor: 'user-1',
        action: 'event_source_created',
        metadata: { sourceId: 'generated-1', discoveredVia: 'photo_extraction' },
      }),
    )
  })

  it('does not duplicate a source already registered under the same URL, and returns the existing id', async () => {
    selectResults.push([{ id: 'existing-source' }])
    const { registerDiscoveredEventSource } = await import('./source-registration.js')

    const id = await registerDiscoveredEventSource('https://hawthorne.example/events', 'Hawthorne Scholastic Academy', 'user-1')

    expect(id).toBe('existing-source')
    expect(insertCalls).toHaveLength(0)
  })
})
