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
  // The feedback post's own attached photos (feedback_images) — replies
  // themselves don't support photo attachments today, only the top-level
  // post does, so this is the full set of images that could exist on this
  // thread. Shown for context (so the email is readable standalone, without
  // opening the app to see what the reply is about), not because they're
  // new with this reply.
  postImageUrls: string[]
  apiUrl: string
  linkUrl: string
}

// avatarUrl/postImageUrls are raw relative paths (e.g. "/uploads/x.jpg") —
// apiUrl turns them into absolute URLs an email client can actually load,
// same as newsletter/template.ts's own thumbnail images.
export function feedbackReplyHtml(params: FeedbackReplyEmailParams): string {
  const name = escapeHtml(params.replierName)
  const title = escapeHtml(params.feedbackTitle)
  const body = escapeHtml(params.replyBody)
  const avatar = params.replierAvatarUrl
    ? `<img src="${params.apiUrl}${params.replierAvatarUrl}" width="40" height="40" style="display:block;width:40px;height:40px;object-fit:cover;border-radius:50%;margin-bottom:8px;" alt="" />`
    : ''
  const postImages = params.postImageUrls.length
    ? `<div style="margin:12px 0;">${params.postImageUrls
        .map(
          (url) =>
            `<img src="${params.apiUrl}${url}" width="120" height="120" style="display:inline-block;width:120px;height:120px;object-fit:cover;border-radius:8px;margin:0 8px 8px 0;" alt="" />`,
        )
        .join('')}</div>`
    : ''
  return `
    <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#111111;font-size:16px;line-height:1.5;">
      ${avatar}
      <p style="margin:0 0 4px;color:#666666;font-size:14px;">#${params.feedbackNumber} · ${title}</p>
      <p style="margin:0 0 4px;"><strong>${name}</strong> replied:</p>
      <p style="white-space:pre-wrap;margin:0 0 8px;">${body}</p>
      ${postImages}
      <p><a href="${params.linkUrl}" style="color:#2c2c2c;">View and reply</a></p>
    </div>
  `
}
