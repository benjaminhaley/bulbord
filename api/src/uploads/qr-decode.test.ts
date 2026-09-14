import { describe, expect, it } from 'vitest'

import { decodeQrCode } from './qr-decode.js'

// A real, decodable 120x120 PNG QR code encoding "https://example.com/e" —
// generated once via the `qrcode` npm package, embedded here rather than
// checked in as a separate binary fixture file. This deliberately exercises
// the real sharp+jsqr decode path end to end (feedback #165 follow-up,
// 2026-09-14: a live test against Claude's vision confirmed it cannot
// reliably decode a QR code from pixels — this real decoder is what
// replaced that unreliable approach), not a mocked one.
const QR_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAHgAAAB4CAYAAAA5ZDbSAAAAAklEQVR4AewaftIAAAOHSURBVO3BW45cKwIAwUx09r/lnPuJkNW4yv2wGSLsP1zHGlxHG1xHG1xHG1xHe/gFlZ9SMVNZVeyo7FTMVFYVr1L5KRWzwXW0wXW0wXW0h99Q8VVUPlKxUtmpeFXFjsqsYqfiq6h8ZHAdbXAdbXAdbXAd7eFNKq+q+AwVM5UdlXdUfAWVV1W8anAdbXAdbXAd7eEAFZ+h4jSD62iD62iD62iD62gP/yCVWcVKZVaxUpmprCr+ZYPraIPraIPraA9vqvgpFTOVVcVMZVUxU/kuFd9hcB1tcB1tcB1tcB3t4Teo/BSVVcW/ROWnDK6jDa6jDa6jPfxCxb9OZVaxUplVrFReVfG3GFxHG1xHG1xHe/gFlZ2KmcpOxUplVjGrWKl8hoqdipnKjsqs4quozCpmg+tog+tog+tog+to9h82VHYqdlRWFTOVWcVKZVaxo/JdKmYqX6XiI4PraIPraIPraA+/oDKrWKnsqMwqViofUVlVzFR2KlYqs4qVyk+p2FGZVcwG19EG19EG19EG19Ee3lQxU3lHxUxlVrFSeZXKqmKmsqr4iMpKZadiprJS+VOD62iD62iD62gPX6hiprJTMVPZqVipvKpipfKRipXKqyreofKRwXW0wXW0wXW0wXW0hzep7KjMKj5DxU7FjspXqNhRmVXsqKwqPjK4jja4jja4jvbwG1R2Kt6hMquYVaxUZhUrlZ+iMqvYUXmHyqxiNriONriONriONriO9vAbKlYqOyqzilXFTGVWsaqYqexUfAWVHZVVxUxlp2Kl8pHBdbTBdbTBdbSHb6TyXSpepbKqmKl8BpVZxUplprKq+MjgOtrgOtrgOtrDL1TsVOxU/CmVVcWsYqXyqopXVbxD5TsMrqMNrqMNrqMNrqM9/ILKT6mYVeyo7FR8F5VZxTsqdlRmFbPBdbTBdbTBdbSH31DxVVRepbJTMVNZVcxUPkPFV1B51eA62uA62uA62uA62sObVF5V8SqVnYp3qPwplb/Z4Dra4Dra4Draw/+Jih2VVcVM5VUVP2VwHW1wHW1wHW1wHe3hL1exo7KqmKmsKnZUZhUzlVXFjsp3GFxHG1xHG1xHe3hTxXdQWVW8quIrVOyo7FSsVP7U4Dra4Dra4Dra4Draw29Q+ZuozCreobJTMVOZVaxUZhU7KquKHZWPDK6jDa6jDa6j2X+4jjW4jja4jja4jvY/D+CBG/TCeowAAAAASUVORK5CYII='

describe('decodeQrCode', () => {
  it('decodes a real QR code embedded in an image', async () => {
    const result = await decodeQrCode(Buffer.from(QR_PNG_BASE64, 'base64'))
    expect(result).toBe('https://example.com/e')
  })

  it('returns null for an image with no QR code', async () => {
    // A tiny, real 1x1 PNG — decodable as an image, but has no QR code.
    const onePixelPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    )
    expect(await decodeQrCode(onePixelPng)).toBeNull()
  })

  it('fails open (null) for a corrupted/non-image buffer', async () => {
    expect(await decodeQrCode(Buffer.from('this is not an image'))).toBeNull()
  })
})
