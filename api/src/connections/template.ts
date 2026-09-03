function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// The one email this feature sends (feedback #83's "alert the other person
// so they can friend back", reworded by feedback #127 into real
// friend-request language rather than "added you as a friend") —
// deliberately plain, unlike the newsletter's full table-based layout
// (newsletter/template.ts), since it's a single short notice rather than a
// multi-event digest.
export function connectionRequestSubject(requesterName: string): string {
  return `${requesterName} sent you a friend request on Nettelhorst Bulbord`
}

// requesterAvatarUrl is the raw path from users.avatar_url (e.g.
// "/uploads/profiles/x.jpg") — apiUrl turns it into the absolute URL an
// email client can actually load, same as newsletter/template.ts's own
// thumbnail images. Omitted entirely when null (an account predating the
// now-required signup photo) rather than a broken/placeholder image.
export function connectionRequestHtml(requesterName: string, requesterAvatarUrl: string | null, apiUrl: string, friendsUrl: string): string {
  const name = escapeHtml(requesterName)
  const photo = requesterAvatarUrl
    ? `<img src="${apiUrl}${requesterAvatarUrl}" width="64" height="64" style="display:block;width:64px;height:64px;object-fit:cover;border-radius:50%;margin-bottom:12px;" alt="" />`
    : ''
  return `
    <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#111111;font-size:16px;line-height:1.5;">
      ${photo}
      <p><strong>${name}</strong> sent you a friend request on Nettelhorst Bulbord.</p>
      <p><a href="${friendsUrl}" style="color:#2c2c2c;">Accept or decline</a></p>
    </div>
  `
}
