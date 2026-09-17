import { IonButton } from '@ionic/react'
import type { ReactNode } from 'react'

import { AddToCalendarButton } from '../calendar/AddToCalendarButton'
import { leadingButtonGap } from '../theme/layout'
import { EventBody, type EventBodyDraft, type EventBodyFields, type EventBodySlots } from './EventBody'

// Feedback #171 (2026-09-17): Pipeline Review's own candidate preview
// rendered EventBody (the post itself) but always stopped there — the real
// detail page's "Add to Calendar"/"View source" buttons never existed on
// this page at all, a genuine gap rather than a styling drift. Pulling
// those two buttons out of EventDetailPage.tsx into this one shared
// component (alongside EventBody) is what makes "renders the same as the
// real post" actually true for the whole post, not just its text fields —
// and means a future third button added to the real page can't be
// forgotten here again the way these two were.
export interface EventPostViewFields extends EventBodyFields {
  title: string
  source_url: string | null
}

export function EventPostView({
  event,
  titleHref,
  showTitle = true,
  showActions = true,
  calendarUrl,
  slots,
  editing = false,
  draft,
  onFieldChange,
  highlightFields,
  imageEditor,
}: {
  event: EventPostViewFields
  titleHref?: string
  // EventDetailPage doesn't pass its own title through EventBody at all —
  // the page's IonTitle in the toolbar already shows it (see EventBody.tsx's
  // own header comment) — but a caller with no per-item toolbar (Pipeline
  // Review's scrolling list) needs EventBody to render it inline.
  showTitle?: boolean
  // Hidden while editing (both real callers already do this) — Add to
  // Calendar/View source describe the *saved* event, not an in-progress draft.
  showActions?: boolean
  // The URL these buttons should treat as "this event's own page" — a real
  // permalink when one exists (the live detail page's own href, or a kept
  // Pipeline Review candidate's `/events/:id`), otherwise omitted rather
  // than pointing at the admin review page itself.
  calendarUrl?: string
  slots?: EventBodySlots
  editing?: boolean
  draft?: EventBodyDraft
  onFieldChange?: <K extends keyof EventBodyDraft>(key: K, value: EventBodyDraft[K]) => void
  highlightFields?: Set<string>
  imageEditor?: ReactNode
}) {
  return (
    <>
      <EventBody
        event={event}
        title={showTitle ? event.title : undefined}
        titleHref={titleHref}
        slots={slots}
        editing={editing}
        draft={draft}
        onFieldChange={onFieldChange}
        highlightFields={highlightFields}
        imageEditor={imageEditor}
      />
      {showActions && !editing && (
        <>
          <AddToCalendarButton
            event={{
              title: event.title,
              description: event.description,
              location: event.location_name ?? event.address,
              url: calendarUrl,
              startDate: event.start_date,
              startTime: event.start_time,
              allDay: event.all_day,
            }}
            filename={`${event.title}.ics`}
            style={leadingButtonGap}
          />
          {event.source_url && (
            <IonButton expand="block" href={event.source_url} target="_blank" rel="noreferrer" style={leadingButtonGap}>
              View source
            </IonButton>
          )}
        </>
      )}
    </>
  )
}
