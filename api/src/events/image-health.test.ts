import { beforeEach, describe, expect, it, vi } from 'vitest'

const objectExistsMock = vi.fn()
const selectResult: { id: string; title: string; imageUrl: string; thumbnailUrl: string }[] = []

vi.mock('../uploads/storage.js', () => ({ objectExists: objectExistsMock }))
vi.mock('../db/client.js', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(selectResult),
      }),
    }),
  },
}))

describe('checkImageHealth', () => {
  beforeEach(() => {
    objectExistsMock.mockReset()
    selectResult.length = 0
  })

  it('reports nothing when every event\'s image and thumbnail resolve', async () => {
    selectResult.push({ id: 'event-1', title: 'Good Event', imageUrl: '/uploads/events/a.jpg', thumbnailUrl: '/uploads/events/a-thumb.jpg' })
    objectExistsMock.mockResolvedValue(true)
    const { checkImageHealth } = await import('./image-health.js')

    const broken = await checkImageHealth()

    expect(broken).toEqual([])
    expect(objectExistsMock).toHaveBeenCalledWith('events/a.jpg')
    expect(objectExistsMock).toHaveBeenCalledWith('events/a-thumb.jpg')
  })

  it('flags an event whose stored image key does not actually resolve', async () => {
    // The real 2026-09-05 incident this exists to catch: a script reported
    // success and the database row looked correct, but the object was
    // never reachable through the live GET /uploads/* route's own bucket
    // connection.
    selectResult.push({ id: 'event-1', title: 'Broken Event', imageUrl: '/uploads/events/missing.png', thumbnailUrl: '/uploads/events/missing-thumb.jpg' })
    objectExistsMock.mockResolvedValue(false)
    const { checkImageHealth } = await import('./image-health.js')

    const broken = await checkImageHealth()

    expect(broken).toEqual([{ eventId: 'event-1', title: 'Broken Event', imageUrl: '/uploads/events/missing.png' }])
  })

  it('flags an event when only the thumbnail is missing', async () => {
    selectResult.push({ id: 'event-1', title: 'Half-Broken Event', imageUrl: '/uploads/events/a.jpg', thumbnailUrl: '/uploads/events/a-thumb.jpg' })
    objectExistsMock.mockImplementation((key: string) => Promise.resolve(!key.endsWith('-thumb.jpg')))
    const { checkImageHealth } = await import('./image-health.js')

    const broken = await checkImageHealth()

    expect(broken).toHaveLength(1)
    expect(broken[0].eventId).toBe('event-1')
  })

  it('checks many events concurrently rather than one at a time', async () => {
    // Found by actually calling this against production with ~160 events:
    // a fully sequential check risked the request itself timing out before
    // finishing. This doesn't assert on timing directly, just that the
    // function completes and correctly handles a batch larger than one.
    for (let i = 0; i < 40; i++) {
      selectResult.push({ id: `event-${i}`, title: `Event ${i}`, imageUrl: `/uploads/events/${i}.jpg`, thumbnailUrl: `/uploads/events/${i}-thumb.jpg` })
    }
    objectExistsMock.mockResolvedValue(true)
    const { checkImageHealth } = await import('./image-health.js')

    const broken = await checkImageHealth()

    expect(broken).toEqual([])
    expect(objectExistsMock).toHaveBeenCalledTimes(80)
  })
})
