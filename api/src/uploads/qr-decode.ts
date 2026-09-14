import sharp from 'sharp'
import jsQrDefault from 'jsqr'
import type { QRCode } from 'jsqr'

// jsqr's published package.json splits "main" (a UMD bundle whose
// module.exports IS the function itself — verified directly, and by a live
// smoke test: `import jsQR from 'jsqr'` really does decode a real QR code
// correctly at runtime) from "types" (an ambient .d.ts using
// `export default`, which — under this project's moduleResolution:
// NodeNext — TypeScript's esModuleInterop synthesis resolves to a
// non-callable namespace type instead of the real function, a known
// interop quirk for a CJS package with no `export =`). The import itself
// is correct and matches real runtime behavior; only the inferred TYPE is
// wrong, so this is a narrow, targeted cast onto that one binding — not a
// broad `any` — rather than restructuring a working import to chase a
// type-only false alarm.
const jsQR = jsQrDefault as unknown as (data: Uint8ClampedArray, width: number, height: number) => QRCode | null

// Real QR-code decoding — not a vision-model guess. Feedback #165
// (2026-09-14) asked for a retry note like "go grab the information and
// link from the QR code" to actually work; the first attempt at that just
// told the vision model to "try harder" reading the pixels directly, which
// turned out to be a real, verified-unreliable capability gap (tested
// live against a freshly-generated, clean QR code: Claude's own answer was
// "my best direct read isn't trustworthy enough to state as fact"). This
// decodes it for real via jsqr against raw pixel data — deterministic,
// fast, no LLM call — so the model gets an actual, correct URL instead of
// an unreliable guess.
//
// Fails open (null) on any error — an image with no real QR code, a
// corrupted file, or a decode failure all just mean "no QR code found
// here," never a thrown error up the call stack (same posture as every
// other best-effort step in this pipeline).
export async function decodeQrCode(imageBuffer: Buffer): Promise<string | null> {
  try {
    const { data, info } = await sharp(imageBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const result = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), info.width, info.height)
    return result?.data || null
  } catch {
    return null
  }
}
