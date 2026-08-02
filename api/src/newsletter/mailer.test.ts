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
  vi.stubEnv('RESEND_FROM_EMAIL', 'Campy <newsletter@campcampy.com>')
  sendMock.mockReset()
})

describe('sendNewsletterEmail', () => {
  it('sends with the configured from address', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null })
    const { sendNewsletterEmail } = await import('./mailer.js')

    await sendNewsletterEmail('ben@example.com', 'This week on Campy', '<p>hi</p>')

    expect(sendMock).toHaveBeenCalledWith({
      from: 'Campy <newsletter@campcampy.com>',
      to: 'ben@example.com',
      subject: 'This week on Campy',
      html: '<p>hi</p>',
    })
  })

  it('throws when Resend returns an error', async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: 'invalid recipient' } })
    const { sendNewsletterEmail } = await import('./mailer.js')

    await expect(sendNewsletterEmail('bad@example.com', 'subject', '<p>hi</p>')).rejects.toThrow('invalid recipient')
  })
})
