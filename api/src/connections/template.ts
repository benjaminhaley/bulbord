function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// The one email this feature sends (feedback #83's "alert the other person
// so they can friend back") — deliberately plain, unlike the newsletter's
// full table-based layout (newsletter/template.ts), since it's a single
// short notice rather than a multi-event digest.
export function connectionAlertSubject(adderName: string): string {
  return `${adderName} added you as a friend on Nettelhorst Bulbord`
}

export function connectionAlertHtml(adderName: string, friendsUrl: string): string {
  const name = escapeHtml(adderName)
  return `
    <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#111111;font-size:16px;line-height:1.5;">
      <p><strong>${name}</strong> added you as a friend on Nettelhorst Bulbord.</p>
      <p><a href="${friendsUrl}" style="color:#2c2c2c;">Add them back</a></p>
    </div>
  `
}
