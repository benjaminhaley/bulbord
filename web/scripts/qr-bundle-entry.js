// Entry point for build-soccer-math-qr-bundle.mjs — wraps the real
// `qrcode` npm package (the same one web/src/sharing/useQrDataUrl.ts uses
// for the main app's own ShareButton) as a standalone browser global, so
// public/soccer-math/index.html — a static page with no build step of its
// own — can generate a real QR code without hand-rolling the algorithm or
// reaching for a third-party CDN.
import QRCode from 'qrcode'

window.BulbordQRCode = {
  toDataURL: function (text, opts) {
    return QRCode.toDataURL(text, opts || { width: 320, margin: 1 })
  },
}
