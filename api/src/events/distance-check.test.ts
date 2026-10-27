import { describe, expect, it, vi } from 'vitest'

vi.mock('../claude.js', () => ({ createWithServerTools: vi.fn(async () => null), parseFinalJson: vi.fn() }))
const fetchWithTimeoutMock = vi.fn()
vi.mock('../uploads/fetch-with-timeout.js', () => ({ fetchWithTimeout: fetchWithTimeoutMock }))

const { checkDistance, distanceVerdict, milesFromNettelhorst, withChicagoDefault } = await import('./distance-check.js')

describe('milesFromNettelhorst', () => {
  it('is ~0 at the school and ~1.4 mi at Lincoln Park Zoo', () => {
    expect(milesFromNettelhorst({ lat: 41.94167, lng: -87.64472 })).toBeLessThan(0.01)
    const zoo = milesFromNettelhorst({ lat: 41.9214, lng: -87.6336 })
    expect(zoo).toBeGreaterThan(1.3)
    expect(zoo).toBeLessThan(1.6)
  })
})

describe('distanceVerdict', () => {
  it('passes within 1 mile, fails beyond it, and passes an exempt source', () => {
    expect(distanceVerdict(0.4, false, 'x').pass).toBe(true)
    expect(distanceVerdict(1.4, false, 'x')).toMatchObject({ pass: false, reason: expect.stringContaining('over the 1 mile limit') })
    expect(distanceVerdict(1.4, true, 'x')).toMatchObject({ pass: true, reason: expect.stringContaining('allowed beyond 1 mile') })
    expect(distanceVerdict(0.05, false, 'x').reason).toContain('under 0.1 mi')
  })
})

describe('withChicagoDefault', () => {
  it('adds Chicago only when no state or ZIP is given', () => {
    expect(withChicagoDefault('3252 N Broadway')).toBe('3252 N Broadway, Chicago, IL')
    expect(withChicagoDefault('3252 N Broadway, Chicago, IL')).toBe('3252 N Broadway, Chicago, IL')
    expect(withChicagoDefault('3252 N Broadway 60657')).toBe('3252 N Broadway 60657')
  })
})

describe('checkDistance', () => {
  it('uses stored coordinates without any lookup', async () => {
    fetchWithTimeoutMock.mockClear()
    const result = await checkDistance({ title: 't', latitude: '41.9214', longitude: '-87.6336', exempt: false })
    expect(result.check.pass).toBe(false)
    expect(fetchWithTimeoutMock).not.toHaveBeenCalled()
  })

  it('fails (held for review) when the event cannot be located', async () => {
    fetchWithTimeoutMock.mockResolvedValue(null)
    const result = await checkDistance({ title: 't', address: 'nowhere', exempt: false })
    expect(result.check).toMatchObject({ pass: false, reason: expect.stringContaining("Couldn't find where this is") })
  })
})
