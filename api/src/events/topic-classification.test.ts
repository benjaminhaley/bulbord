import { describe, expect, it, vi } from 'vitest'

const createMock = vi.fn()
vi.mock('../claude.js', () => ({ getAnthropicClient: () => ({ messages: { create: createMock } }) }))

const { classifyTopic } = await import('./topic-classification.js')
const reply = (text: string) => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn' })

describe('classifyTopic', () => {
  it('returns a listed topic, matching case-insensitively', async () => {
    createMock.mockResolvedValueOnce(reply('volunteering'))
    expect(await classifyTopic({ title: 'Monday Meal Mitzvah' })).toBe('Volunteering')
  })

  it('returns null for "none", an unlisted answer, or an error', async () => {
    createMock.mockResolvedValueOnce(reply('none'))
    expect(await classifyTopic({ title: 'x' })).toBeNull()
    createMock.mockResolvedValueOnce(reply('Cooking'))
    expect(await classifyTopic({ title: 'x' })).toBeNull()
    createMock.mockRejectedValueOnce(new Error('down'))
    expect(await classifyTopic({ title: 'x' })).toBeNull()
  })
})
