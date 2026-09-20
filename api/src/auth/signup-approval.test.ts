import { describe, expect, it, vi } from 'vitest'

vi.mock('../db/client.js', () => ({ db: {} }))
vi.mock('../env.js', () => ({ requireEnv: (k: string) => `https://${k}` }))
vi.mock('../newsletter/mailer.js', () => ({ sendEmail: vi.fn() }))
vi.mock('../notifications/service.js', () => ({ createNotification: vi.fn() }))

const { signupPendingHtml, signupPendingSubject } = await import('./signup-approval.js')

describe('signup approval email', () => {
  it('names the applicant and links to the admin review page', () => {
    expect(signupPendingSubject('Anna Haley')).toBe('Anna Haley wants to join Nettelhorst Bulbord')
    const html = signupPendingHtml(
      { name: 'Anna Haley', email: 'anna@example.com', role: 'family', roleOther: null, avatarUrl: '/uploads/a.jpg' },
      'https://api',
      'https://web/admin/users',
    )
    expect(html).toContain('Anna Haley')
    expect(html).toContain('anna@example.com')
    expect(html).toContain('https://api/uploads/a.jpg')
    expect(html).toContain('href="https://web/admin/users"')
  })

  it('escapes HTML in an applicant-supplied name', () => {
    const html = signupPendingHtml(
      { name: '<script>x</script>', email: null, role: 'other', roleOther: '<b>', avatarUrl: null },
      'https://api',
      'https://web',
    )
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
