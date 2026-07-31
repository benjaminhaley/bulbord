import sharp from 'sharp'

const PALETTE = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#4d7c0f']

function colorFor(seed: string): string {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

function escapeXml(text: string): string {
  const escapes: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' }
  return text.replace(/[&<>]/g, (char) => escapes[char])
}

// Fallback event image for when a source page has no og:image (or is
// unreachable) — a simple colored card with the event's initial, deterministic
// per title, so every event always has something to show in list/detail views.
export async function generatePlaceholderImage(title: string): Promise<Buffer> {
  const color = colorFor(title)
  const initial = escapeXml(title.trim().charAt(0).toUpperCase() || '?')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450">
    <rect width="800" height="450" fill="${color}" />
    <text x="400" y="225" font-family="sans-serif" font-size="180" fill="white" fill-opacity="0.85"
      text-anchor="middle" dominant-baseline="central">${initial}</text>
  </svg>`

  return sharp(Buffer.from(svg)).png().toBuffer()
}
