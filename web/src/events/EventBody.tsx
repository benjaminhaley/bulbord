import type { ReactNode } from 'react'

import { API_URL } from '../config'
import { mapUrl, shortAddress } from '../format'
import {
  InlineCheckboxInput,
  InlineDateInput,
  InlineField,
  InlineSelectInput,
  InlineTextInput,
  InlineTextareaInput,
  InlineTimeInput,
} from '../edit-history/InlineField'
import { formatWhen } from './format'
import { EVENT_TOPIC_OPTIONS } from './topics'

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

// A real member never sees this in read mode — EventDetailPage relies on
// the toolbar's own IonTitle for the event name (this file's header comment
// already explains why). `title`/`titleHref` exist for a caller with no
// per-item toolbar of its own (Pipeline Review's scrolling list of many
// events); while `editing` is true (feedback #141) the title becomes a real
// inline field shown here regardless of caller, since that's the only place
// on the page a member editing their own event can actually change it.
const TITLE_STYLE = { margin: '0 0 12px', fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.3 } as const
const PLAIN_LINK_STYLE = { color: 'inherit', textDecoration: 'none' } as const

// Feedback #141 (2026-09-07): the full editable-content shape (matches
// api/src/edit-history/service.ts's EDITABLE_FIELDS.event exactly) — passed
// as `draft` while `editing` is true, with `onFieldChange` applying one
// field's new value in place. Two fields (source_url, topic) have no
// existing read-mode presentation of their own within this component (see
// below), so they only ever appear while editing.
export interface EventBodyDraft {
  title: string
  description: string
  start_date: string
  start_time: string
  end_time: string
  all_day: boolean
  location_name: string
  address: string
  source_url: string
  topic: string
}

export function EventBody({
  event,
  title,
  titleHref,
  slots = {},
  editing = false,
  draft,
  onFieldChange,
  highlightFields,
  imageEditor,
}: {
  event: EventBodyFields
  title?: string
  titleHref?: string
  slots?: EventBodySlots
  // Feedback #141: inline WYSIWYG editing — the same rendering, just with
  // each field's text swapped for a matching input in place (see
  // edit-history/InlineField.tsx's own header for the "one wrapper, no
  // reflow" technique this relies on).
  editing?: boolean
  draft?: EventBodyDraft
  onFieldChange?: <K extends keyof EventBodyDraft>(key: K, value: EventBodyDraft[K]) => void
  // A history-detail page (viewing an old version) passes this instead —
  // the set of field keys that differ from the *current* live event, shown
  // with a red accent via InlineField's own highlighted prop. Never set at
  // the same time as editing.
  highlightFields?: Set<string>
  // Replaces the plain <img> while editing — the caller (EventDetailPage)
  // builds this from its own useEventImageUpload() hook, since that upload
  // state belongs at the page level, not duplicated inside this
  // presentational component. Renders the current/attached photo with a
  // small overlaid "change photo" affordance in the same spot the static
  // image occupies, rather than a separate attach section below the form
  // the old EventForm.tsx used — "same rendering, in place."
  imageEditor?: ReactNode
}) {
  const isHighlighted = (key: string) => highlightFields?.has(key) ?? false
  const set = <K extends keyof EventBodyDraft>(key: K, value: EventBodyDraft[K]) => onFieldChange?.(key, value)

  return (
    <>
      {(title || editing) && (
        <InlineField
          editing={editing}
          hasValue={!!title || !!draft?.title}
          style={TITLE_STYLE}
          highlighted={isHighlighted('title')}
          readContent={title ? titleHref ? <a href={titleHref} style={PLAIN_LINK_STYLE}>{title}</a> : title : null}
          editContent={<InlineTextInput value={draft?.title ?? ''} onChange={(v) => set('title', v)} placeholder="Title" />}
        />
      )}
      {slots.afterTitle}
      {editing && imageEditor
        ? imageEditor
        : event.image_url && <img src={`${API_URL}${event.image_url}`} alt="" style={{ width: '100%', borderRadius: 12, marginBottom: 16 }} />}
      {slots.afterImage}
      <InlineField
        editing={editing}
        hasValue={true}
        highlighted={isHighlighted('start_date') || isHighlighted('start_time') || isHighlighted('end_time') || isHighlighted('all_day')}
        readContent={formatWhen(
          { startDate: event.start_date, startTime: event.start_time, endTime: event.end_time ?? null, allDay: event.all_day },
          undefined,
          'detailed',
        )}
        editContent={
          draft && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <InlineDateInput value={draft.start_date} onChange={(v) => set('start_date', v)} />
              <InlineCheckboxInput checked={draft.all_day} onChange={(v) => set('all_day', v)} label="All day" />
              {!draft.all_day && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <InlineTimeInput value={draft.start_time} onChange={(v) => set('start_time', v)} />
                  <span>–</span>
                  <InlineTimeInput value={draft.end_time} onChange={(v) => set('end_time', v)} />
                </div>
              )}
            </div>
          )
        }
      />
      {slots.afterWhen}
      <InlineField
        editing={editing}
        hasValue={!!event.location_name || !!draft?.location_name}
        highlighted={isHighlighted('location_name')}
        readContent={event.location_name}
        editContent={<InlineTextInput value={draft?.location_name ?? ''} onChange={(v) => set('location_name', v)} placeholder="Location name (optional)" />}
      />
      {slots.afterLocationName}
      <InlineField
        editing={editing}
        hasValue={!!event.address || !!draft?.address}
        highlighted={isHighlighted('address')}
        readContent={
          event.address && (
            <a href={mapUrl(event.address)} target="_blank" rel="noreferrer">
              {shortAddress(event.address)}
            </a>
          )
        }
        editContent={<InlineTextInput value={draft?.address ?? ''} onChange={(v) => set('address', v)} placeholder="Address" />}
      />
      {slots.afterAddress}
      <InlineField
        editing={editing}
        hasValue={!!event.description || !!draft?.description}
        highlighted={isHighlighted('description')}
        readContent={event.description}
        editContent={<InlineTextareaInput value={draft?.description ?? ''} onChange={(v) => set('description', v)} placeholder="Description (optional)" />}
      />
      {slots.afterDescription}
      {/* topic/source_url have no read-mode presentation on a real member's
          detail page today (topic only ever drives the Events tab's own
          filter chip; source_url is shown as the separate "View source"
          button EventDetailPage.tsx renders outside this component) — so
          these two fields only ever appear here while editing. */}
      {editing && draft && (
        <>
          <InlineField
            editing
            hasValue
            highlighted={isHighlighted('topic')}
            readContent={null}
            editContent={
              <InlineSelectInput
                value={draft.topic}
                onChange={(v) => set('topic', v)}
                placeholder="Topic (optional)"
                options={[{ value: '', label: 'None' }, ...EVENT_TOPIC_OPTIONS.map((t) => ({ value: t, label: t }))]}
              />
            }
          />
          <InlineField
            editing
            hasValue
            highlighted={isHighlighted('source_url')}
            readContent={null}
            editContent={<InlineTextInput type="url" value={draft.source_url} onChange={(v) => set('source_url', v)} placeholder="Source URL (optional)" />}
          />
        </>
      )}
    </>
  )
}
