import type { ReactNode } from 'react'

import { API_URL } from '../config'
import { mapUrl, shortAddress } from '../format'
import { factLineStyle } from '../theme/layout'
import { formatWhen } from './format'

// The real production event body — the exact same fields, functions
// (formatWhen/shortAddress/mapUrl), and factLineStyle rhythm
// EventDetailPage's own body has always used — pulled out into its own
// component so a second real caller (the admin Pipeline Review page) can
// render "the event itself" identically rather than a hand-copied
// approximation (Ben, 2026-09-06: "you should probably use the same
// engine with just a couple options set"). `slots` is that "couple
// options": optional content injected directly after a given field —
// Pipeline Review uses it to show the check(s) that judge each field, right
// where they're about; a real member's own detail page passes no slots at
// all, so its rendered output is unchanged from before this file existed.
export interface EventBodyFields {
  image_url: string | null
  start_date: string
  start_time: string | null
  end_time?: string | null
  all_day: boolean
  location_name: string | null
  address: string | null
  description: string | null
}

export interface EventBodySlots {
  afterTitle?: ReactNode
  afterImage?: ReactNode
  afterWhen?: ReactNode
  afterLocationName?: ReactNode
  afterAddress?: ReactNode
  afterDescription?: ReactNode
}

// A real member never sees this — EventDetailPage relies on the toolbar's
// own IonTitle for the event name, which this file's header comment already
// explains. `title`/`titleHref` exist only for a caller with no per-item
// toolbar of its own (Pipeline Review's scrolling list of many events) and
// are opt-in: omitted, this renders exactly as before. Styled to read as a
// plain page title — not a hyperlink — even when titleHref makes it
// clickable, so "the same component, one more option" doesn't visually
// introduce something a real page never shows (Ben, 2026-09-06: "they
// should look the same... use the same code paths and components").
const TITLE_STYLE = { margin: '0 0 12px', fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.3 } as const
const PLAIN_LINK_STYLE = { color: 'inherit', textDecoration: 'none' } as const

export function EventBody({
  event,
  title,
  titleHref,
  slots = {},
}: {
  event: EventBodyFields
  title?: string
  titleHref?: string
  slots?: EventBodySlots
}) {
  return (
    <>
      {title && <h1 style={TITLE_STYLE}>{titleHref ? <a href={titleHref} style={PLAIN_LINK_STYLE}>{title}</a> : title}</h1>}
      {slots.afterTitle}
      {event.image_url && <img src={`${API_URL}${event.image_url}`} alt="" style={{ width: '100%', borderRadius: 12, marginBottom: 16 }} />}
      {slots.afterImage}
      <p style={factLineStyle}>
        {formatWhen(
          { startDate: event.start_date, startTime: event.start_time, endTime: event.end_time ?? null, allDay: event.all_day },
          undefined,
          'detailed',
        )}
      </p>
      {slots.afterWhen}
      {event.location_name && <p style={factLineStyle}>{event.location_name}</p>}
      {slots.afterLocationName}
      {event.address && (
        <p style={factLineStyle}>
          <a href={mapUrl(event.address)} target="_blank" rel="noreferrer">
            {shortAddress(event.address)}
          </a>
        </p>
      )}
      {slots.afterAddress}
      {event.description && <p style={factLineStyle}>{event.description}</p>}
      {slots.afterDescription}
    </>
  )
}
