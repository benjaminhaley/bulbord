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

import { formatRelativeDateTime } from '../format'
import { EventBody } from '../events/EventBody'
import { factLineStyle, headingContentGap, sectionDividerStyle } from '../theme/layout'
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

// What each check actually means and what it takes to pass — this is
// general, per-check reference text (see HowThisWorks' glossary below), not
// per-instance reasoning. Ben, 2026-09-06: "for the checks just show the
// name of the check with the checkmark and somewhere else... describe
// exactly what the check means and how it passes" — a passing check's own
// reason text was usually just a restatement of this same definition,
// repeated identically across dozens of events, which is what made the page
// read as a wall of near-duplicate green text.
const CHECK_DESCRIPTIONS: Record<keyof PipelineChecks, string> = {
  titleQuality: 'A clear, complete event title — not garbled, truncated, or vague.',
  descriptionQuality: 'The description actually conveys what will happen, not filler text.',
  locationLabelQuality: 'A short, human-readable venue or location name.',
  addressQuality: 'A real, specific street address or bounded area that a map can actually resolve.',
  dateQuality: 'A real, plausible date — not in the past, not implausibly far in the future.',
  timeQuality: 'Either a specific start time is stated, or the event is genuinely all-day — never silently defaulted.',
  imageQuality: "The chosen photo is large and well-proportioned enough to use (a real size/aspect-ratio check, not just 'an image exists').",
  imageRelevance: 'The chosen photo was scored as an actual match for this specific event, or is a last-resort org logo (which is exempt from this scoring).',
  duplicateCheck: 'No already-approved event matches this one on the same date.',
}

const CHECK_LABELS = Object.fromEntries(PIPELINE_CHECK_LABELS.map(({ key, label }) => [key, label])) as Record<keyof PipelineChecks, string>

// A passing check is compressed to just its name + checkmark — the specific
// "why" for a pass is almost always the same generic sentence every time
// (now in CHECK_DESCRIPTIONS above instead), so repeating it per event was
// pure clutter. A failing check keeps its full, instance-specific reason
// inline (Ben, earlier: "if something failed, you should have a clear
// reason why... so the person reading it can debug" — that's still real
// debugging value a generic description can't provide). attempts: 0 is this
// module's "not applicable" sentinel (a rejected candidate's image checks,
// which never actually ran a search) — shown neutrally, with its reason,
// since neither a green check nor a red X would be honest there.
function CheckLine({ label, check }: { label: string; check: { pass: boolean; reason: string; attempts: number } }) {
  const notApplicable = check.attempts === 0
  const color = notApplicable ? 'var(--ion-color-medium)' : check.pass ? 'var(--ion-color-success)' : 'var(--ion-color-danger)'
  const icon = notApplicable ? '–' : check.pass ? '✓' : '✗'
  const style = { ...factLineStyle, fontSize: '0.8125rem', color }
  if (check.pass && !notApplicable) {
    return (
      <p style={style}>
        {icon} <strong>{label}</strong>
      </p>
    )
  }
  return (
    <p style={style}>
      {icon} <strong>{label}:</strong> {check.reason}
      {check.attempts > 1 ? ` (after ${check.attempts} attempts)` : ''}
    </p>
  )
}

// Renders just the check line(s) for the given keys, directly beneath
// whatever field they judge (Ben, 2026-09-06: "the checks just appear
// beneath the relevant fields") — placed inside an EventBody slot for a
// kept/rejected item's own event fields, or as a plain sibling for
// title/duplicate (which aren't one of EventBody's own fields). checks is
// null for an item that predates this system, in which case nothing renders
// rather than a misleading placeholder.
function Checks({ checks, keys }: { checks: PipelineChecks | null; keys: (keyof PipelineChecks)[] }) {
  if (!checks) return null
  return (
    <>
      {keys.map((key) => (
        <CheckLine key={key} label={CHECK_LABELS[key]} check={checks[key]} />
      ))}
    </>
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
              <ul style={{ margin: '2px 0', paddingLeft: 20 }}>
                {PIPELINE_CHECK_LABELS.map(({ key, label }) => (
                  <li key={key}>
                    <strong>{label}:</strong> {CHECK_DESCRIPTIONS[key]}
                  </li>
                ))}
              </ul>
              <p style={{ margin: '2px 0' }}>Every check is recorded, with a reason, whether it passes or fails — a passing check just shows its name below; a failing one shows the specific reason.</p>
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
  // Defaults to the latest run only (Ben, 2026-09-06: "each pipeline review
  // should be fixed on just that pipeline") — 'all' is the escape hatch back
  // to every unreviewed candidate across all time, for a missed week's
  // leftovers. includeReviewed only has an effect in 'all' scope — the
  // latest run always shows every item it produced regardless of review
  // status, same static-snapshot posture as the digest email itself.
  const [scope, setScope] = useState<'latest_run' | 'all'>('latest_run')
  const [runStartedAt, setRunStartedAt] = useState<string | null>(null)
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
    fetchPipelineReview(includeReviewed, scope)
      .then((data) => {
        setKept(data.kept)
        setRejected(data.rejected)
        setRunStartedAt(data.runStartedAt)
        setError(null)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load pipeline review'))
      .finally(() => setLoading(false))
  }, [includeReviewed, scope])

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
          <IonLabel className="ion-text-wrap">
            {scope === 'latest_run' ? (
              <>Reviewing the latest run{runStartedAt ? ` — ${new Date(runStartedAt).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}</>
            ) : (
              'Reviewing every unreviewed candidate, all time'
            )}
          </IonLabel>
          <IonButton slot="end" size="small" fill="clear" onClick={() => setScope(scope === 'latest_run' ? 'all' : 'latest_run')}>
            {scope === 'latest_run' ? 'See previous runs' : 'Back to latest run'}
          </IonButton>
        </IonItem>
        {scope === 'all' && (
          <IonItem lines="none" style={{ '--padding-start': 0 } as React.CSSProperties}>
            <IonLabel>Show already-reviewed items too</IonLabel>
            <IonToggle checked={includeReviewed} onIonChange={(e) => setIncludeReviewed(e.detail.checked)} />
          </IonItem>
        )}
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
                  <IonLabel className="ion-text-wrap" style={{ marginTop: 8, marginBottom: 8 }}>
                    {/* The event itself renders through the exact same
                        component its real detail page uses (Ben, 2026-09-06:
                        "use the same engine with just a couple options
                        set") — EventBody, parameterized with slots that
                        inject the check(s) judging each field directly
                        beneath it, rather than a separate dumped list. */}
                    <EventBody
                      event={{
                        image_url: item.image_url,
                        start_date: item.start_date,
                        start_time: item.start_time,
                        end_time: null,
                        all_day: item.all_day,
                        location_name: item.location_name,
                        address: item.address,
                        description: item.description,
                      }}
                      slots={{
                        afterImage: (
                          <>
                            <Checks checks={item.checks} keys={['imageQuality', 'imageRelevance']} />
                            <IonNote color="medium">
                              {item.source_name ?? 'Unknown source'} · {formatRelativeDateTime(item.created_at)}
                            </IonNote>
                            <h2 style={headingContentGap}>
                              <a href={`/events/${item.id}`}>{item.title}</a>
                              {item.status === 'pending' && (
                                <span style={{ marginLeft: 6, fontSize: '0.75rem', color: 'var(--ion-color-danger)' }}>HELD FOR REVIEW</span>
                              )}
                            </h2>
                            {item.relevance_reason && <p style={factLineStyle}>Why relevant: {item.relevance_reason}</p>}
                            <Checks checks={item.checks} keys={['titleQuality', 'duplicateCheck']} />
                          </>
                        ),
                        afterWhen: <Checks checks={item.checks} keys={['dateQuality', 'timeQuality']} />,
                        afterLocationName: <Checks checks={item.checks} keys={['locationLabelQuality']} />,
                        afterAddress: <Checks checks={item.checks} keys={['addressQuality']} />,
                        afterDescription: <Checks checks={item.checks} keys={['descriptionQuality']} />,
                      }}
                    />
                    {!item.checks && <IonNote color="medium">No checks recorded (predates this feature)</IonNote>}
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
                  <IonLabel className="ion-text-wrap" style={{ marginTop: 8, marginBottom: 8 }}>
                    {/* Same EventBody engine as a kept item above, plus the
                        same full 9-check suite (Ben, 2026-09-06: "every
                        event should have a full suite of checks... so I can
                        see why they were rejected") — image_url is always
                        null here (a rejected candidate never gets a real
                        image search), so EventBody simply renders no image,
                        and the not-applicable image checks show that
                        honestly rather than as a pass or fail. */}
                    <EventBody
                      event={{
                        image_url: null,
                        start_date: item.candidate_data.start_date,
                        start_time: item.candidate_data.start_time,
                        end_time: null,
                        all_day: item.candidate_data.all_day,
                        location_name: item.candidate_data.location_name,
                        address: item.candidate_data.address,
                        description: item.candidate_data.description,
                      }}
                      slots={{
                        afterImage: (
                          <>
                            <Checks checks={item.checks} keys={['imageQuality', 'imageRelevance']} />
                            <IonNote color="medium">
                              {item.source_name ?? 'Unknown source'} · {formatRelativeDateTime(item.created_at)} · {item.rejection_type === 'duplicate' ? 'Duplicate' : 'Not relevant'}
                            </IonNote>
                            <h2 style={headingContentGap}>{item.title}</h2>
                            <p style={factLineStyle}>{item.rejection_reason}</p>
                            {item.duplicate_of_event_id && (
                              <p style={factLineStyle}>
                                Matched: <a href={`/events/${item.duplicate_of_event_id}`}>{item.duplicate_of_event_title ?? 'view event'}</a>
                              </p>
                            )}
                            <Checks checks={item.checks} keys={['titleQuality', 'duplicateCheck']} />
                          </>
                        ),
                        afterWhen: <Checks checks={item.checks} keys={['dateQuality', 'timeQuality']} />,
                        afterLocationName: <Checks checks={item.checks} keys={['locationLabelQuality']} />,
                        afterAddress: <Checks checks={item.checks} keys={['addressQuality']} />,
                        afterDescription: <Checks checks={item.checks} keys={['descriptionQuality']} />,
                      }}
                    />
                    {!item.checks && <IonNote color="medium">No checks recorded (predates this feature)</IonNote>}
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
