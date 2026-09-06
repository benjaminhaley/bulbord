import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonPage,
  IonSpinner,
  IonText,
  IonTitle,
  IonToast,
  IonToggle,
  IonToolbar,
} from '@ionic/react'
import { addOutline, checkmarkOutline, imageOutline, refreshOutline, trashOutline } from 'ionicons/icons'
import { useCallback, useEffect, useState } from 'react'

import { formatRelativeDateTime } from '../format'
import { sectionDividerStyle } from '../theme/layout'
import {
  addPipelineRejectionAnyway,
  agreePipelineRejection,
  approvePipelineEvent,
  fetchPipelineReview,
  removePipelineEvent,
  retryPipelineEventImage,
  sendTestPipelineReviewEmail,
  type PipelineKeptCandidate,
  type PipelineQualityChecks,
  type PipelineRejectedCandidate,
} from './api'

function QualityBadge({ label, check }: { label: string; check: { pass: boolean; reason: string } }) {
  return (
    <span style={{ marginRight: 10, color: check.pass ? 'var(--ion-color-success)' : 'var(--ion-color-danger)' }} title={check.reason}>
      {check.pass ? '✓' : '✗'} {label}
    </span>
  )
}

function QualityChecksLine({ checks }: { checks: PipelineQualityChecks | null }) {
  if (!checks) return null
  return (
    <p style={{ margin: '4px 0', fontSize: '0.8125rem' }}>
      <QualityBadge label="Title" check={checks.titleQuality} />
      <QualityBadge label="Description" check={checks.descriptionQuality} />
      <QualityBadge label="Location" check={checks.locationQuality} />
    </p>
  )
}

function imageOutcomeLabel(trace: PipelineKeptCandidate['image_trace']): string {
  if (!trace || trace.length === 0) return 'No image search recorded'
  const chosen = trace.find((t) => t.outcome === 'chosen')
  if (chosen) return `Image found (${trace.length} candidate${trace.length === 1 ? '' : 's'} tried)`
  return `No usable image found (${trace.length} candidate${trace.length === 1 ? '' : 's'} tried)`
}

// A short, plain-English account of the pipeline this page is reviewing —
// feedback #138's own ask ("give a description of the pipeline... spell out
// all of those checks"). Kept as static prose here rather than fetched from
// anywhere, since it describes code behavior, not data.
function HowThisWorks() {
  return (
    <IonList inset>
      <IonListHeader>
        <IonLabel>How this pipeline works</IonLabel>
      </IonListHeader>
      <IonItem lines="none">
        <IonLabel className="ion-text-wrap">
          <p style={{ margin: '4px 0' }}>
            Events come from two sources: a weekly scrape of every active event source (Wednesday mornings), and inbound email
            forwarded to Bulbord's own address. Each candidate is extracted by an LLM call that already screens out
            clearly-irrelevant listings (bar crawls, adult-only events, vague locations).
          </p>
          <p style={{ margin: '4px 0' }}>
            A second, independent LLM pass re-checks relevance on the structured fields alone, and separately judges title,
            description, and location quality — these three never block publishing, they're for your review only.
          </p>
          <p style={{ margin: '4px 0' }}>
            Every surviving candidate is checked against already-approved events on the same date (exact match and a fuzzy
            same-day match) before being kept. A kept event still gets a real photo search — page images, then a web image
            search, then an org logo as a last resort — each candidate scored for size/quality and, for real photos, whether it
            actually matches the event's own description.
          </p>
          <p style={{ margin: '4px 0', color: 'var(--ion-color-medium)' }}>
            Known gap: a candidate the extraction step silently decides isn't relevant at all never appears here — only
            candidates that made it into the model's output, then were kept or rejected, are visible below.
          </p>
        </IonLabel>
      </IonItem>
    </IonList>
  )
}

// Pipeline Review (feedback #138, 2026-09-06): a post-hoc admin audit of the
// sourcing pipeline, reached from Dev Tools or the weekly digest email/
// notification. Events still publish immediately — this is for looking back
// at what the pipeline did and fixing what it got wrong, not a pre-publish
// approval gate.
export function PipelineReviewPage() {
  const [includeReviewed, setIncludeReviewed] = useState(false)
  const [kept, setKept] = useState<PipelineKeptCandidate[]>([])
  const [rejected, setRejected] = useState<PipelineRejectedCandidate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
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

  function noteInput(id: string) {
    return (
      <IonInput
        placeholder="Optional note"
        value={notes[id] ?? ''}
        style={{ '--padding-start': 0, fontSize: '0.8125rem', marginTop: 4 } as React.CSSProperties}
        onIonInput={(e) => setNotes((prev) => ({ ...prev, [id]: e.detail.value ?? '' }))}
      />
    )
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
                    <h2>
                      <a href={`/events/${item.id}`}>{item.title}</a>
                    </h2>
                    <IonNote color="medium">
                      {item.source_name ?? 'Unknown source'} · {formatRelativeDateTime(item.created_at)}
                    </IonNote>
                    {item.relevance_reason && <p style={{ margin: '4px 0', fontSize: '0.8125rem' }}>{item.relevance_reason}</p>}
                    <QualityChecksLine checks={item.quality_checks} />
                    <p style={{ margin: '4px 0', fontSize: '0.8125rem', color: 'var(--ion-color-medium)' }}>
                      <IonIcon icon={imageOutline} style={{ verticalAlign: '-2px', marginInlineEnd: 4 }} />
                      {imageOutcomeLabel(item.image_trace)}
                    </p>
                    {item.reviewed_at ? (
                      <IonNote color="medium">
                        Reviewed by {item.reviewed_by_name ?? 'an admin'} {formatRelativeDateTime(item.reviewed_at)}
                        {item.review_note ? ` — "${item.review_note}"` : ''}
                      </IonNote>
                    ) : (
                      <>
                        {noteInput(item.id)}
                        <div style={{ marginTop: 6 }}>
                          <IonButton
                            size="small"
                            fill="outline"
                            disabled={busyId === item.id}
                            onClick={() => runAction(item.id, () => approvePipelineEvent(item.id, notes[item.id]), 'Approved')}
                          >
                            <IonIcon slot="start" icon={checkmarkOutline} />
                            Approve
                          </IonButton>
                          <IonButton
                            size="small"
                            fill="outline"
                            color="danger"
                            disabled={busyId === item.id}
                            onClick={() => runAction(item.id, () => removePipelineEvent(item.id, notes[item.id]), 'Removed')}
                          >
                            <IonIcon slot="start" icon={trashOutline} />
                            Remove
                          </IonButton>
                          <IonButton
                            size="small"
                            fill="outline"
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
                            <IonIcon slot="start" icon={refreshOutline} />
                            Retry image
                          </IonButton>
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
                      {item.source_name ?? 'Unknown source'} · {formatRelativeDateTime(item.created_at)} ·{' '}
                      {item.rejection_type === 'duplicate' ? 'Duplicate' : 'Not relevant'}
                    </IonNote>
                    <p style={{ margin: '4px 0', fontSize: '0.8125rem' }}>{item.rejection_reason}</p>
                    {item.duplicate_of_event_id && (
                      <p style={{ margin: '4px 0', fontSize: '0.8125rem' }}>
                        Matched:{' '}
                        <a href={`/events/${item.duplicate_of_event_id}`}>{item.duplicate_of_event_title ?? 'view event'}</a>
                      </p>
                    )}
                    {item.reviewed_at ? (
                      <IonNote color="medium">
                        {item.review_action === 'added_anyway' ? 'Added anyway' : 'Agreed with rejection'} by{' '}
                        {item.reviewed_by_name ?? 'an admin'} {formatRelativeDateTime(item.reviewed_at)}
                        {item.review_note ? ` — "${item.review_note}"` : ''}
                        {item.added_as_event_id && (
                          <>
                            {' — '}
                            <a href={`/events/${item.added_as_event_id}`}>view event</a>
                          </>
                        )}
                      </IonNote>
                    ) : (
                      <>
                        {noteInput(item.id)}
                        <div style={{ marginTop: 6 }}>
                          <IonButton
                            size="small"
                            fill="outline"
                            disabled={busyId === item.id}
                            onClick={() => runAction(item.id, () => agreePipelineRejection(item.id, notes[item.id]), 'Agreed')}
                          >
                            <IonIcon slot="start" icon={checkmarkOutline} />
                            Agree
                          </IonButton>
                          <IonButton
                            size="small"
                            fill="outline"
                            disabled={busyId === item.id}
                            onClick={async () => {
                              setBusyId(item.id)
                              try {
                                const result = await addPipelineRejectionAnyway(item.id, notes[item.id])
                                setToast(result.deduped ? 'Already exists as another event — not added again' : 'Added')
                                load()
                              } catch (err) {
                                setToast(err instanceof Error ? err.message : 'Could not add')
                              } finally {
                                setBusyId(null)
                              }
                            }}
                          >
                            <IonIcon slot="start" icon={addOutline} />
                            Add anyway
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
