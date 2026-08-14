import sharp from 'sharp'

import { imageUrl, uploadImage } from './storage.js'

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

// Fallback image for when a source page has no og:image (or is
// unreachable/finds nothing usable) — a simple colored card with the
// title's initial, deterministic per title, so every event/camp always has
// something to show in list/detail views. Reinstated 2026-08-14 (feedback:
// "you're not allowed to create a camp or event without an image") after
// being removed 2026-07-31 — events.image_url/camps.image_url are now
// NOT NULL columns (see db/schema.ts), so this is no longer just a nicer
// UI fallback, it's what every insert path uses to satisfy that constraint
// when no real photo can be found.
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

export interface PlaceholderImage {
  imageUrl: string
  thumbnailUrl: string
}

// Generates and uploads a placeholder through the same storage pipeline as
// any other image (full + thumbnail variants, content-addressed key) —
// the thing every insert path that can't find/isn't given a real photo
// calls to satisfy the NOT NULL image_url/thumbnail_url columns.
export async function uploadPlaceholderImage(title: string, folder: string): Promise<PlaceholderImage> {
  const buffer = await generatePlaceholderImage(title)
  const { key, thumbnailKey } = await uploadImage(buffer, folder)
  const full = imageUrl(key)
  const thumb = imageUrl(thumbnailKey)
  if (!full || !thumb) {
    throw new Error('Failed to generate placeholder image URLs')
  }
  return { imageUrl: full, thumbnailUrl: thumb }
}
