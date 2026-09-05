import { beforeEach, describe, expect, it, vi } from 'vitest'

const getImageObjectMock = vi.fn()
const selectResult: { id: string; title: string; imageUrl: string; thumbnailUrl: string }[] = []

vi.mock('../uploads/storage.js', () => ({ getImageObject: getImageObjectMock }))
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
    getImageObjectMock.mockReset()
    selectResult.length = 0
  })

  it('reports nothing when every event\'s image and thumbnail resolve', async () => {
    selectResult.push({ id: 'event-1', title: 'Good Event', imageUrl: '/uploads/events/a.jpg', thumbnailUrl: '/uploads/events/a-thumb.jpg' })
    getImageObjectMock.mockResolvedValue({ body: {}, contentType: 'image/jpeg' })
    const { checkImageHealth } = await import('./image-health.js')

    const broken = await checkImageHealth()

    expect(broken).toEqual([])
    expect(getImageObjectMock).toHaveBeenCalledWith('events/a.jpg')
    expect(getImageObjectMock).toHaveBeenCalledWith('events/a-thumb.jpg')
  })

  it('flags an event whose stored image key does not actually resolve', async () => {
    // The real 2026-09-05 incident this exists to catch: a script reported
    // success and the database row looked correct, but the object was
    // never reachable through the same getImageObject() the live
    // GET /uploads/* route calls.
    selectResult.push({ id: 'event-1', title: 'Broken Event', imageUrl: '/uploads/events/missing.png', thumbnailUrl: '/uploads/events/missing-thumb.jpg' })
    getImageObjectMock.mockResolvedValue(null)
    const { checkImageHealth } = await import('./image-health.js')

    const broken = await checkImageHealth()

    expect(broken).toEqual([{ eventId: 'event-1', title: 'Broken Event', imageUrl: '/uploads/events/missing.png' }])
  })

  it('flags an event when only the thumbnail is missing', async () => {
    selectResult.push({ id: 'event-1', title: 'Half-Broken Event', imageUrl: '/uploads/events/a.jpg', thumbnailUrl: '/uploads/events/a-thumb.jpg' })
    getImageObjectMock.mockImplementation((key: string) => Promise.resolve(key.endsWith('-thumb.jpg') ? null : { body: {} }))
    const { checkImageHealth } = await import('./image-health.js')

    const broken = await checkImageHealth()

    expect(broken).toHaveLength(1)
    expect(broken[0].eventId).toBe('event-1')
  })
})
