import { IonActionSheet, IonButton, IonIcon } from '@ionic/react'
import { calendarOutline } from 'ionicons/icons'
import { useState, type CSSProperties } from 'react'

import { downloadIcs, googleCalendarUrl, outlookCalendarUrl, type CalendarEventInput } from './calendarLinks'

// Generic across Events and Camps (feedback #76) — a shared component
// rather than a per-feature copy, the same "truly generic shared infra" bar
// as ShareButton/Avatar/dayLabel.ts (see CLAUDE.md's Camps section). Offers
// the three "standard platforms" Ben asked for: Google Calendar and
// Outlook.com each open a prefilled web composer directly in a new tab; a
// downloaded .ics file covers Apple Calendar, Outlook desktop, and anything
// else that can import one. An IonActionSheet, not a custom modal — this
// app's design system leans on Ionic's own built-in components rather than
// hand-rolled equivalents for exactly this "choose one of a few actions"
// shape (see CLAUDE.md's Design system).
export function AddToCalendarButton({
  event,
  filename = 'event.ics',
  style,
}: {
  event: CalendarEventInput
  filename?: string
  style?: CSSProperties
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <IonButton expand="block" fill="outline" onClick={() => setOpen(true)} style={style}>
        <IonIcon slot="start" icon={calendarOutline} />
        Add to Calendar
      </IonButton>
      <IonActionSheet
        isOpen={open}
        onDidDismiss={() => setOpen(false)}
        header="Add to Calendar"
        buttons={[
          { text: 'Google Calendar', handler: () => window.open(googleCalendarUrl(event), '_blank', 'noopener') },
          { text: 'Outlook.com', handler: () => window.open(outlookCalendarUrl(event), '_blank', 'noopener') },
          { text: 'Download .ics file (Apple Calendar & others)', handler: () => downloadIcs(event, filename) },
          { text: 'Cancel', role: 'cancel' },
        ]}
      />
    </>
  )
}
