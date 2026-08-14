import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'

// Shared by ShareButton (the app's invite/page-share QR) and
// ImpersonateModal (an admin's demo sign-in QR, feedback #87) — both need
// the same "generate once, cache per-URL, avoid regenerating on every
// re-render" behavior, not just the same `.share-qr` styling.
export function useQrDataUrl(url: string | null): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const cache = useRef<{ url: string; dataUrl: string } | null>(null)

  useEffect(() => {
    if (!url) {
      setDataUrl(null)
      return
    }
    if (cache.current?.url === url) {
      setDataUrl(cache.current.dataUrl)
      return
    }
    let cancelled = false
    QRCode.toDataURL(url, { width: 320, margin: 1 }).then((generated) => {
      cache.current = { url, dataUrl: generated }
      if (!cancelled) setDataUrl(generated)
    })
    return () => {
      cancelled = true
    }
  }, [url])

  return dataUrl
}
