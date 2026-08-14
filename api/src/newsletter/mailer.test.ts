import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendMock = vi.fn()

vi.mock('resend', () => {
  class MockResend {
    emails = { send: sendMock }
  }
  return { Resend: MockResend }
})

beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', 'test-key')
  vi.stubEnv('RESEND_FROM_EMAIL', 'Nettelhorst <newsletter@bulbord.com>')
  sendMock.mockReset()
})

describe('sendEmail', () => {
  it('sends with the configured from address', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null })
    const { sendEmail } = await import('./mailer.js')

    await sendEmail('ben@example.com', 'This week on Nettelhorst', '<p>hi</p>')

    expect(sendMock).toHaveBeenCalledWith({
      from: 'Nettelhorst <newsletter@bulbord.com>',
      to: 'ben@example.com',
      subject: 'This week on Nettelhorst',
      html: '<p>hi</p>',
    })
  })

  it('throws when Resend returns an error', async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: 'invalid recipient' } })
    const { sendEmail } = await import('./mailer.js')

    await expect(sendEmail('bad@example.com', 'subject', '<p>hi</p>')).rejects.toThrow('invalid recipient')
  })
})
