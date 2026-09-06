import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonPage,
  IonSpinner,
  IonText,
  IonTextarea,
  IonTitle,
  IonToast,
  IonToggle,
  IonToolbar,
} from '@ionic/react'
import { useCallback, useEffect, useState } from 'react'

import { API_URL } from '../config'
import { formatRelativeDateTime } from '../format'
import { sectionDividerStyle } from '../theme/layout'
import {
  approvePipelineEvent,
  approvePipelineRejectedCandidate,
  editPipelineEvent,
  editPipelineRejectedCandidate,
  fetchPipelineReview,
  PIPELINE_CHECK_LABELS,
  rejectPipelineEvent,
  rejectPipelineRejectedCandidate,
  retryPipelineEventImage,
  sendTestPipelineReviewEmail,
  type PipelineChecks,
  type PipelineEditableFields,
  type PipelineKeptCandidate,
  type PipelineRejectedCandidate,
} from './api'

// Every check is always shown as an icon plus its own reason text, inline —
// never a hover tooltip (Ben: "if something failed, you should have a clear
// reason why... so the person reading it can debug" — a tooltip is also
// unreachable on a touch device, which this app is built for).
function ChecklistRows({ checks }: { checks: PipelineChecks | null }) {
  if (!checks) {
    return <IonNote color="medium">No checks recorded (predates this feature)</IonNote>
  }
  return (
    <ul style={{ margin: '4px 0', padding: 0, listStyle: 'none', fontSize: '0.8125rem' }}>
      {PIPELINE_CHECK_LABELS.map(({ key, label }) => {
        const check = checks[key]
        return (
          <li key={key} style={{ margin: '2px 0', color: check.pass ? 'var(--ion-color-success)' : 'var(--ion-color-danger)' }}>
            {check.pass ? '✓' : '✗'} <strong>{label}:</strong> {check.reason}
            {check.attempts > 1 ? ` (after ${check.attempts} attempts)` : ''}
          </li>
        )
      })}
    </ul>
  )
}

// A short, plain-English account of the pipeline this page is reviewing —
// feedback #138's own ask, restructured 2026-09-06 v2 (Ben: "give a few
// quick bullets" instead of a wall of prose) into an always-visible summary
// plus a "Read more" toggle for the fuller breakdown.
function HowThisWorks() {
  const [expanded, setExpanded] = useState(false)
  return (
    <IonList inset>
      <IonListHeader>
        <IonLabel>How this pipeline works</IonLabel>
      </IonListHeader>
      <IonItem lines="none">
        <IonLabel className="ion-text-wrap">
          <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
            <li>Events come from a weekly source scrape and inbound email.</li>
            <li>Every candidate goes through a full checklist (see below) before it counts as clean.</li>
            <li>A candidate that fails a check is held back until it's fixed or you Approve it — a clean one publishes right away.</li>
          </ul>
          {expanded && (
            <>
              <p style={{ margin: '8px 0 2px' }}>
                <strong>Sources</strong>
              </p>
              <p style={{ margin: '2px 0' }}>A weekly scrape of every active event source (Wednesday mornings), and inbound email forwarded to Bulbord's own address.</p>
              <p style={{ margin: '8px 0 2px' }}>
                <strong>Extraction &amp; relevance</strong>
              </p>
              <p style={{ margin: '2px 0' }}>An LLM call extracts candidates and already screens out clearly-irrelevant listings (bar crawls, adult-only events, vague locations). A second, independent pass re-checks relevance on the structured fields alone.</p>
              <p style={{ margin: '8px 0 2px' }}>
                <strong>The checklist</strong>
              </p>
              <p style={{ margin: '2px 0' }}>Title, description, a short human-readable location name, a real mappable address, a plausible date, a coherent time, image size/quality, image relevance to the description, and a duplicate check. Every check is recorded, with a reason, whether it passes or fails.</p>
              <p style={{ margin: '8px 0 2px' }}>
                <strong>Self-healing</strong>
              </p>
              <p style={{ margin: '2px 0' }}>A failing text check (title/description/location/address) gets one automatic retry against the real source text before giving up. Image search tries page images, then a broadening web search, then an org logo as a last resort.</p>
              <p style={{ margin: '8px 0 2px' }}>
                <strong>Duplicates</strong>
              </p>
              <p style={{ margin: '2px 0' }}>Every surviving candidate is checked against already-approved events on the same date (an exact match, and a fuzzier same-day match) — a real duplicate is rejected outright, never held as pending.</p>
              <p style={{ margin: '8px 0 2px', color: 'var(--ion-color-medium)' }}>
                <strong>Known gap</strong>
              </p>
              <p style={{ margin: '2px 0', color: 'var(--ion-color-medium)' }}>A candidate the extraction step silently decides isn't relevant at all never appears here — only candidates that made it into the model's output, then were kept or rejected, are visible below.</p>
            </>
          )}
          <IonButton fill="clear" size="small" style={{ marginTop: 4, marginLeft: -8 }} onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Show less' : 'Read more'}
          </IonButton>
        </IonLabel>
      </IonItem>
    </IonList>
  )
}

function formatDateTime(date: string, time: string | null, allDay: boolean): string {
  const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  if (allDay || !time) return dateLabel
  const timeLabel = new Date(`${date}T${time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: time.endsWith(':00') ? undefined : '2-digit' })
  return `${dateLabel}, ${timeLabel}`
}

function mapUrl(address: string | null): string | null {
  return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null
}

// The editable fields, shared by both a kept event and a rejected
// candidate's stored snapshot — Edit only ever corrects data, it never
// changes publish state (Approve/Reject are the only two actions that do).
function EditPanel({
  initial,
  onCancel,
  onSave,
  saving,
}: {
  initial: { title: string; description: string; address: string; locationName: string; startDate: string; startTime: string; allDay: boolean }
  onCancel: () => void
  onSave: (fields: PipelineEditableFields) => void
  saving: boolean
}) {
  const [fields, setFields] = useState(initial)
  return (
    <div style={{ marginTop: 8, padding: 8, background: 'var(--ion-color-light)', borderRadius: 8 }}>
      <IonInput label="Title" labelPlacement="stacked" value={fields.title} onIonInput={(e) => setFields((f) => ({ ...f, title: e.detail.value ?? '' }))} />
      <IonTextarea label="Description" labelPlacement="stacked" autoGrow value={fields.description} onIonInput={(e) => setFields((f) => ({ ...f, description: e.detail.value ?? '' }))} />
      <IonInput label="Location name" labelPlacement="stacked" value={fields.locationName} onIonInput={(e) => setFields((f) => ({ ...f, locationName: e.detail.value ?? '' }))} />
      <IonInput label="Address" labelPlacement="stacked" value={fields.address} onIonInput={(e) => setFields((f) => ({ ...f, address: e.detail.value ?? '' }))} />
      <IonInput label="Date" labelPlacement="stacked" type="date" value={fields.startDate} onIonInput={(e) => setFields((f) => ({ ...f, startDate: e.detail.value ?? '' }))} />
      <IonInput label="Time (blank = all day)" labelPlacement="stacked" type="time" value={fields.startTime} onIonInput={(e) => setFields((f) => ({ ...f, startTime: e.detail.value ?? '' }))} />
      <div style={{ marginTop: 8 }}>
        <IonButton
          size="small"
          disabled={saving}
          onClick={() =>
            onSave({
              title: fields.title,
              description: fields.description,
              address: fields.address,
              location_name: fields.locationName,
              start_date: fields.startDate,
              start_time: fields.startTime || null,
              all_day: !fields.startTime,
            })
          }
        >
          Save
        </IonButton>
        <IonButton size="small" fill="clear" disabled={saving} onClick={onCancel}>
          Cancel
        </IonButton>
        {saving && <IonSpinner name="dots" style={{ marginInlineStart: 8 }} />}
      </div>
    </div>
  )
}

function noteField(value: string, onChange: (v: string) => void) {
  return (
    <IonInput
      placeholder="Optional note"
      value={value}
      style={{ '--padding-start': 0, fontSize: '0.8125rem', marginTop: 4 } as React.CSSProperties}
      onIonInput={(e) => onChange(e.detail.value ?? '')}
    />
  )
}

// Pipeline Review (feedback #138, 2026-09-06; extended to a real gate + full
// checklist 2026-09-06 v2 after Ben's first live look): a candidate that
// fails a check is held back until fixed or explicitly Approved — a clean
// candidate still publishes immediately with zero human involvement.
export function PipelineReviewPage() {
  const [includeReviewed, setIncludeReviewed] = useState(false)
  const [kept, setKept] = useState<PipelineKeptCandidate[]>([])
  const [rejected, setRejected] = useState<PipelineRejectedCandidate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [sendingTest, setSendingTest] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    fetchPipelineReview(includeReviewed)
      .then((data) => {
        setKept(data.kept)
        setRejected(data.rejected)
        setError(null)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load pipeline review'))
      .finally(() => setLoading(false))
  }, [includeReviewed])

  useEffect(() => {
    load()
  }, [load])

  async function runAction(id: string, action: () => Promise<void>, successMessage: string) {
    setBusyId(id)
    try {
      await action()
      setToast(successMessage)
      setEditingId(null)
      load()
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusyId(null)
    }
  }

  async function sendTest() {
    setSendingTest(true)
    try {
      await sendTestPipelineReviewEmail()
      setToast('Test email sent')
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Could not send test email')
    } finally {
      setSendingTest(false)
    }
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/admin/dev-tools" />
          </IonButtons>
          <IonTitle>Pipeline Review</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen className="ion-padding">
        <HowThisWorks />

        <IonItem lines="none" style={{ '--padding-start': 0, marginTop: 16 } as React.CSSProperties}>
          <IonLabel>Show already-reviewed items too</IonLabel>
          <IonToggle checked={includeReviewed} onIonChange={(e) => setIncludeReviewed(e.detail.checked)} />
        </IonItem>
        <IonItem lines="none" style={{ '--padding-start': 0 } as React.CSSProperties}>
          <IonButton size="small" disabled={sendingTest} onClick={sendTest}>
            Send yourself a test digest email
          </IonButton>
          {sendingTest && <IonSpinner name="dots" style={{ marginInlineStart: 8 }} />}
        </IonItem>

        {loading && <IonSpinner name="dots" />}
        {error && (
          <IonText color="danger">
            <p>{error}</p>
          </IonText>
        )}

        {!loading && !error && (
          <>
            <hr style={sectionDividerStyle} />
            <IonList inset>
              <IonListHeader>
                <IonLabel>Kept ({kept.length})</IonLabel>
              </IonListHeader>
              {kept.length === 0 && (
                <IonItem lines="none">
                  <IonLabel color="medium">Nothing to review</IonLabel>
                </IonItem>
              )}
              {kept.map((item) => (
                <IonItem key={item.id} lines="full">
                  <IonLabel className="ion-text-wrap">
                    <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                      <img
                        src={`${API_URL}${item.thumbnail_url}`}
                        alt=""
                        style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }}
                      />
                      <div>
                        <h2>
                          <a href={`/events/${item.id}`}>{item.title}</a>
                          {item.status === 'pending' && (
                            <span style={{ marginLeft: 6, fontSize: '0.75rem', color: 'var(--ion-color-danger)' }}>HELD FOR REVIEW</span>
                          )}
                        </h2>
                        <IonNote color="medium">
                          {item.source_name ?? 'Unknown source'} · {formatRelativeDateTime(item.created_at)}
                        </IonNote>
                        <p style={{ margin: '2px 0', fontSize: '0.8125rem' }}>{formatDateTime(item.start_date, item.start_time, item.all_day)}</p>
                        {(item.address || item.location_name) && (
                          <p style={{ margin: '2px 0', fontSize: '0.8125rem' }}>
                            {item.location_name}
                            {item.location_name && item.address ? ' — ' : ''}
                            {item.address && mapUrl(item.address) && (
                              <a href={mapUrl(item.address)!} target="_blank" rel="noreferrer">
                                {item.address}
                              </a>
                            )}
                          </p>
                        )}
                        {item.description && <p style={{ margin: '2px 0', fontSize: '0.8125rem', color: 'var(--ion-color-medium)' }}>{item.description}</p>}
                      </div>
                    </div>
                    {item.relevance_reason && <p style={{ margin: '6px 0 2px', fontSize: '0.8125rem' }}>Why relevant: {item.relevance_reason}</p>}
                    <ChecklistRows checks={item.checks} />
                    {item.reviewed_at ? (
                      <IonNote color="medium">
                        Reviewed by {item.reviewed_by_name ?? 'an admin'} {formatRelativeDateTime(item.reviewed_at)}
                        {item.review_note ? ` — "${item.review_note}"` : ''}
                      </IonNote>
                    ) : editingId === item.id ? (
                      <EditPanel
                        initial={{
                          title: item.title,
                          description: item.description ?? '',
                          address: item.address ?? '',
                          locationName: item.location_name ?? '',
                          startDate: item.start_date,
                          startTime: item.start_time ?? '',
                          allDay: item.all_day,
                        }}
                        saving={busyId === item.id}
                        onCancel={() => setEditingId(null)}
                        onSave={(fields) => runAction(item.id, () => editPipelineEvent(item.id, fields), 'Saved')}
                      />
                    ) : (
                      <>
                        {noteField(notes[item.id] ?? '', (v) => setNotes((prev) => ({ ...prev, [item.id]: v })))}
                        <div style={{ marginTop: 6 }}>
                          <IonButton size="small" fill="outline" disabled={busyId === item.id} onClick={() => runAction(item.id, () => approvePipelineEvent(item.id, notes[item.id]), 'Approved')}>
                            Approve
                          </IonButton>
                          <IonButton size="small" fill="outline" color="danger" disabled={busyId === item.id} onClick={() => runAction(item.id, () => rejectPipelineEvent(item.id, notes[item.id]), 'Rejected')}>
                            Reject
                          </IonButton>
                          <IonButton size="small" fill="outline" disabled={busyId === item.id} onClick={() => setEditingId(item.id)}>
                            Edit
                          </IonButton>
                          {editingId === item.id && (
                            <IonButton
                              size="small"
                              fill="clear"
                              disabled={busyId === item.id}
                              onClick={async () => {
                                setBusyId(item.id)
                                try {
                                  const result = await retryPipelineEventImage(item.id)
                                  setToast(result.found ? 'Found a new image' : 'Still no usable image found')
                                  load()
                                } catch (err) {
                                  setToast(err instanceof Error ? err.message : 'Could not retry image search')
                                } finally {
                                  setBusyId(null)
                                }
                              }}
                            >
                              Retry image
                            </IonButton>
                          )}
                        </div>
                      </>
                    )}
                  </IonLabel>
                  {busyId === item.id && <IonSpinner slot="end" name="dots" />}
                </IonItem>
              ))}
            </IonList>

            <IonList inset>
              <IonListHeader>
                <IonLabel>Rejected ({rejected.length})</IonLabel>
              </IonListHeader>
              {rejected.length === 0 && (
                <IonItem lines="none">
                  <IonLabel color="medium">Nothing rejected</IonLabel>
                </IonItem>
              )}
              {rejected.map((item) => (
                <IonItem key={item.id} lines="full">
                  <IonLabel className="ion-text-wrap">
                    <h2>{item.title}</h2>
                    <IonNote color="medium">
                      {item.source_name ?? 'Unknown source'} · {formatRelativeDateTime(item.created_at)} · {item.rejection_type === 'duplicate' ? 'Duplicate' : 'Not relevant'}
                    </IonNote>
                    <p style={{ margin: '4px 0', fontSize: '0.8125rem' }}>{item.rejection_reason}</p>
                    {item.candidate_data.description && <p style={{ margin: '2px 0', fontSize: '0.8125rem', color: 'var(--ion-color-medium)' }}>{item.candidate_data.description}</p>}
                    {item.duplicate_of_event_id && (
                      <p style={{ margin: '4px 0', fontSize: '0.8125rem' }}>
                        Matched: <a href={`/events/${item.duplicate_of_event_id}`}>{item.duplicate_of_event_title ?? 'view event'}</a>
                      </p>
                    )}
                    {item.reviewed_at ? (
                      <IonNote color="medium">
                        {item.review_action === 'approved' ? 'Approved' : 'Rejected'} by {item.reviewed_by_name ?? 'an admin'} {formatRelativeDateTime(item.reviewed_at)}
                        {item.review_note ? ` — "${item.review_note}"` : ''}
                        {item.added_as_event_id && (
                          <>
                            {' — '}
                            <a href={`/events/${item.added_as_event_id}`}>view event</a>
                          </>
                        )}
                      </IonNote>
                    ) : editingId === item.id ? (
                      <EditPanel
                        initial={{
                          title: item.title,
                          description: item.candidate_data.description ?? '',
                          address: item.candidate_data.address ?? '',
                          locationName: item.candidate_data.location_name ?? '',
                          startDate: item.candidate_data.start_date,
                          startTime: item.candidate_data.start_time ?? '',
                          allDay: item.candidate_data.all_day,
                        }}
                        saving={busyId === item.id}
                        onCancel={() => setEditingId(null)}
                        onSave={(fields) => runAction(item.id, () => editPipelineRejectedCandidate(item.id, fields), 'Saved')}
                      />
                    ) : (
                      <>
                        {noteField(notes[item.id] ?? '', (v) => setNotes((prev) => ({ ...prev, [item.id]: v })))}
                        <div style={{ marginTop: 6 }}>
                          <IonButton
                            size="small"
                            fill="outline"
                            disabled={busyId === item.id}
                            onClick={async () => {
                              setBusyId(item.id)
                              try {
                                const result = await approvePipelineRejectedCandidate(item.id, notes[item.id])
                                setToast(result.deduped ? 'Already exists as another event — not added again' : 'Approved')
                                setEditingId(null)
                                load()
                              } catch (err) {
                                setToast(err instanceof Error ? err.message : 'Could not approve')
                              } finally {
                                setBusyId(null)
                              }
                            }}
                          >
                            Approve
                          </IonButton>
                          <IonButton size="small" fill="outline" color="danger" disabled={busyId === item.id} onClick={() => runAction(item.id, () => rejectPipelineRejectedCandidate(item.id, notes[item.id]), 'Rejected')}>
                            Reject
                          </IonButton>
                          <IonButton size="small" fill="outline" disabled={busyId === item.id} onClick={() => setEditingId(item.id)}>
                            Edit
                          </IonButton>
                        </div>
                      </>
                    )}
                  </IonLabel>
                  {busyId === item.id && <IonSpinner slot="end" name="dots" />}
                </IonItem>
              ))}
            </IonList>
          </>
        )}
      </IonContent>
      <IonToast isOpen={!!toast} message={toast ?? ''} duration={3000} onDidDismiss={() => setToast(null)} />
    </IonPage>
  )
}
