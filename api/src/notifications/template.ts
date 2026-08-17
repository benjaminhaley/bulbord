function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Phone-width-first, capped for a wider desktop reading pane — same
// convention feedback/template.ts's feedbackReplyHtml already established.
const EMAIL_MAX_WIDTH = 480

// Feedback #100's new "notify me when someone comments on something I
// created" — covers both Events and Camps (one shared email shape, since
// it's the same notification concept on two content types; see
// events/comments.ts and camps/comments.ts). Deliberately plain, mirroring
// connections/template.ts's single-notice shape rather than the
// newsletter's table layout.
export function contentCommentSubject(commenterName: string, contentTitle: string): string {
  return `${commenterName} commented on ${contentTitle}`
}

export function contentCommentHtml(params: {
  commenterName: string
  commenterAvatarUrl: string | null
  commentBody: string
  contentKind: 'event' | 'camp'
  contentTitle: string
  apiUrl: string
  linkUrl: string
}): string {
  const name = escapeHtml(params.commenterName)
  const title = escapeHtml(params.contentTitle)
  const body = escapeHtml(params.commentBody)
  const photo = params.commenterAvatarUrl
    ? `<img src="${params.apiUrl}${params.commenterAvatarUrl}" width="64" height="64" style="display:block;width:64px;height:64px;object-fit:cover;border-radius:50%;margin-bottom:12px;" alt="" />`
    : ''
  return `
    <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#111111;font-size:16px;line-height:1.5;max-width:${EMAIL_MAX_WIDTH}px;margin:0 auto;">
      ${photo}
      <p><strong>${name}</strong> commented on your ${params.contentKind}, <strong>${title}</strong>:</p>
      <p style="white-space:pre-wrap;">${body}</p>
      <p><a href="${params.linkUrl}" style="color:#2c2c2c;">View comment</a></p>
    </div>
  `
}
