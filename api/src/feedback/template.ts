function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// The one email feedback #98 sends (added after Ben reversed the original
// "in-app only, no email" decision): "if I reply to someone else's
// feedback, [the author] should get an email... including the reply, and
// any images that were posted... so ideally they can read it even before
// clicking back into the app." Deliberately plain, mirroring
// connections/template.ts's own single-notice shape rather than the
// newsletter's full table-based layout.
export function feedbackReplySubject(replierName: string, feedbackTitle: string): string {
  return `${replierName} replied to your feedback: ${feedbackTitle}`
}

export interface FeedbackReplyEmailParams {
  replierName: string
  replierAvatarUrl: string | null
  replyBody: string
  feedbackTitle: string
  feedbackNumber: number
  // This specific reply's own attached photos (feedback_comment_images,
  // feedback #98's photo-attachment follow-up) — the actual "images that
  // were posted" with this reply, not the original post's own photos
  // (those are still reachable via the link below).
  replyImageUrls: string[]
  apiUrl: string
  linkUrl: string
}

// Content-width cap for the whole email (feedback, 2026-08-17: "about phone
// width would be ideal... on a desktop that would get too wide") — 480px
// approximates a large phone's own CSS viewport width, wide enough to read
// comfortably on a phone (where this is checked "even before clicking back
// into the app" — see the header comment above) while capping how wide the
// reply photo stretches in a desktop mail client's much wider reading pane.
// Set on both the outer container (in case a client does honor an inline
// div width) and directly on each <img> (the more reliably-supported of the
// two across real email clients), same redundant-but-safe posture as
// email HTML generally needs.
const EMAIL_MAX_WIDTH = 480

// avatarUrl/replyImageUrls are raw relative paths (e.g. "/uploads/x.jpg") —
// apiUrl turns them into absolute URLs an email client can actually load,
// same as newsletter/template.ts's own thumbnail images.
export function feedbackReplyHtml(params: FeedbackReplyEmailParams): string {
  const name = escapeHtml(params.replierName)
  const title = escapeHtml(params.feedbackTitle)
  const body = escapeHtml(params.replyBody)
  const avatar = params.replierAvatarUrl
    ? `<img src="${params.apiUrl}${params.replierAvatarUrl}" width="40" height="40" style="display:block;width:40px;height:40px;object-fit:cover;border-radius:50%;margin-bottom:8px;" alt="" />`
    : ''
  // Full (capped) width, stacked vertically, not a row of small side-by-side
  // thumbnails — the actual photo content matters more here than fitting
  // several into view at once, and stacking is what stays legible at phone
  // width regardless of how many photos a reply has.
  const replyImages = params.replyImageUrls.length
    ? `<div style="margin:12px 0;">${params.replyImageUrls
        .map(
          (url) =>
            `<img src="${params.apiUrl}${url}" width="${EMAIL_MAX_WIDTH}" style="display:block;width:100%;max-width:${EMAIL_MAX_WIDTH}px;height:auto;border-radius:8px;margin:0 0 8px;" alt="" />`,
        )
        .join('')}</div>`
    : ''
  return `
    <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#111111;font-size:16px;line-height:1.5;max-width:${EMAIL_MAX_WIDTH}px;margin:0 auto;">
      ${avatar}
      <p style="margin:0 0 4px;color:#666666;font-size:14px;">#${params.feedbackNumber} · ${title}</p>
      <p style="margin:0 0 4px;"><strong>${name}</strong> replied:</p>
      <p style="white-space:pre-wrap;margin:0 0 8px;">${body}</p>
      ${replyImages}
      <p><a href="${params.linkUrl}" style="color:#2c2c2c;">View and reply</a></p>
    </div>
  `
}
