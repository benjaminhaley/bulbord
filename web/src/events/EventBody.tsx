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
  afterImage?: ReactNode
  afterWhen?: ReactNode
  afterLocationName?: ReactNode
  afterAddress?: ReactNode
  afterDescription?: ReactNode
}

export function EventBody({ event, slots = {} }: { event: EventBodyFields; slots?: EventBodySlots }) {
  return (
    <>
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
