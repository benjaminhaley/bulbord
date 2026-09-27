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
  IonPage,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { addOutline, closeOutline } from 'ionicons/icons'
import { useEffect, useState } from 'react'

import { createEventSource, fetchEventSourceSummary, updateEventSource, type EventSourceSummary, type SourceCounts, type SourceDomain } from './api'
import { tableDetailStyle, tableNameStyle } from '../theme/layout'
import { domainCheckedCell, type CheckedCell } from './sourceChecked'
import { EVENT_SOURCE_TYPE_OPTIONS } from './sourceTypes'

// Admin-only (see App.tsx's AdminRoute) — sources used to only be added by
// hand-run seed scripts (feedback, 2026-08-17, "consolidate these icons":
// moved off the member-facing Events toolbar into Developer Tools, and kept
// admin-only since a junk source would otherwise silently feed the
// Claude-driven "re-run event sourcing" tool).
function AddSourceForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [type, setType] = useState('website')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = name.trim() && url.trim() && type

  async function submit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      await createEventSource({ name: name.trim(), url: url.trim(), type, notes: notes.trim() })
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add this source')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <IonList inset>
      <IonItem>
        <IonInput label="Name" labelPlacement="stacked" value={name} onIonInput={(e) => setName(e.detail.value ?? '')} />
      </IonItem>
      <IonItem>
        <IonInput label="URL" labelPlacement="stacked" value={url} onIonInput={(e) => setUrl(e.detail.value ?? '')} />
      </IonItem>
      <IonItem>
        <IonSelect label="Type" labelPlacement="stacked" interface="action-sheet" value={type} onIonChange={(e) => setType(e.detail.value)}>
          {EVENT_SOURCE_TYPE_OPTIONS.map((option) => (
            <IonSelectOption key={option.value} value={option.value}>
              {option.label}
            </IonSelectOption>
          ))}
        </IonSelect>
      </IonItem>
      <IonItem lines="none">
        <IonTextarea label="Notes" labelPlacement="stacked" placeholder="Optional" value={notes} onIonInput={(e) => setNotes(e.detail.value ?? '')} />
      </IonItem>
      {error && (
        <IonText color="danger">
          <p className="ion-padding-horizontal">{error}</p>
        </IonText>
      )}
      <div style={{ display: 'flex', gap: 8, padding: '8px 16px' }}>
        <IonButton fill="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </IonButton>
        <IonButton disabled={!canSubmit || submitting} onClick={submit}>
          {submitting ? <IonSpinner name="dots" /> : 'Add Source'}
        </IonButton>
      </div>
    </IonList>
  )
}

// Feedback #178: fixed-width right-aligned columns so the list reads as a
// table (Name / Past / Future / Checked). A zero is red, since a source
// with nothing past or nothing upcoming may have a problem worth a look.
const COUNT_COLUMN_WIDTH = 44
// Wider: fits the "Checked" header and "today"/"never" on one line.
const CHECKED_COLUMN_WIDTH = 56

function CountCell({ value, bold, red, width = COUNT_COLUMN_WIDTH }: { value: number | string; bold?: boolean; red?: boolean; width?: number }) {
  return (
    <span
      style={{
        width,
        whiteSpace: 'nowrap',
        textAlign: 'right',
        fontWeight: bold ? 600 : undefined,
        color: red || value === 0 ? 'var(--ion-color-danger)' : undefined,
      }}
    >
      {value}
    </span>
  )
}

// `checked` is the "Checked" column (see sourceChecked.ts) — omitted on the
// Manual/Total rows, which leave that column blank.
export function CountColumns({ counts, checked, bold }: { counts: SourceCounts; checked?: CheckedCell; bold?: boolean }) {
  return (
    <div slot="end" style={{ display: 'flex', fontSize: 14 }}>
      <CountCell value={counts.past_count} bold={bold} />
      <CountCell value={counts.future_count} bold={bold} />
      <CountCell value={checked?.label ?? ''} red={checked?.stale} width={CHECKED_COLUMN_WIDTH} />
    </div>
  )
}

export function CountColumnHeaders({ label }: { label: string }) {
  return (
    <IonItem lines="full">
      <IonLabel color="medium" style={{ fontSize: 12 }}>
        {label}
      </IonLabel>
      <div slot="end" style={{ display: 'flex', fontSize: 12, color: 'var(--ion-color-medium)' }}>
        <span style={{ width: COUNT_COLUMN_WIDTH, textAlign: 'right', whiteSpace: 'nowrap' }}>Past</span>
        <span style={{ width: COUNT_COLUMN_WIDTH, textAlign: 'right', whiteSpace: 'nowrap' }}>Future</span>
        <span style={{ width: CHECKED_COLUMN_WIDTH, textAlign: 'right', whiteSpace: 'nowrap' }}>Checked</span>
      </div>
    </IonItem>
  )
}

// One row per domain, titled by its source name(s) (deduped — a domain can
// hold two same-named sources), sorted by that title.
function rowsByName(domains: SourceDomain[]): { group: SourceDomain; title: string }[] {
  return domains
    .map((group) => ({ group, title: [...new Set(group.sources.map((source) => source.name))].join(' · ') }))
    .sort((a, b) => a.title.localeCompare(b.title))
}

export function SourcesPage() {
  const [summary, setSummary] = useState<EventSourceSummary | null>(null)
  const [error, setError] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [reactivatingId, setReactivatingId] = useState<string | null>(null)
  const [reactivateError, setReactivateError] = useState<string | null>(null)

  async function reactivate(id: string) {
    setReactivatingId(id)
    setReactivateError(null)
    try {
      await updateEventSource(id, { is_active: true })
      setSummary(await fetchEventSourceSummary())
    } catch (err) {
      setReactivateError(err instanceof Error ? err.message : 'Could not reactivate this source')
    } finally {
      setReactivatingId(null)
    }
  }

  function load() {
    fetchEventSourceSummary()
      .then(setSummary)
      .catch(() => setError(true))
  }

  useEffect(load, [])

  const now = new Date()
  const sumOfRows = summary && {
    past_count: summary.domains.reduce((n, d) => n + d.past_count, summary.manual.past_count),
    future_count: summary.domains.reduce((n, d) => n + d.future_count, summary.manual.future_count),
  }
  const rowsMatchTotals =
    !!summary && sumOfRows!.past_count === summary.totals.past_count && sumOfRows!.future_count === summary.totals.future_count

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/admin/dev-tools" />
          </IonButtons>
          <IonTitle>Sources</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={() => setShowForm((v) => !v)} aria-label="Add source">
              <IonIcon slot="icon-only" icon={showForm ? closeOutline : addOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen>
        {/* A brief scope guide for whoever (human or AI) is deciding what belongs
            here — feedback #71: the sources list itself doesn't otherwise say
            what makes an event appropriate to add. */}
        <p className="ion-padding-horizontal ion-padding-top" style={{ color: 'var(--ion-color-medium)' }}>
          Events for the Nettelhorst community. The ideal event is close to the school, open to the community, and
          focused on people, not profit — think about what families are talking about when they drop their kids off.
          Those are the events that belong here.
        </p>
        {showForm && (
          <AddSourceForm
            onCreated={() => {
              setShowForm(false)
              load()
            }}
            onCancel={() => setShowForm(false)}
          />
        )}
        {summary === null && !error && (
          <div className="coming-soon">
            <IonSpinner name="dots" />
          </div>
        )}
        {error && (
          <div className="coming-soon">
            <p>Couldn't load sources</p>
          </div>
        )}
        {summary && (
          <IonList>
            <CountColumnHeaders label="Source" />
            {/* Rows show only the source name(s) — the domain appears once
                tapped through (SourceDomainPage's title). Sorted by the name
                shown, not the hidden domain. */}
            {rowsByName(summary.domains).map(({ group, title }) => {
              const only = group.sources.length === 1 ? group.sources[0] : null
              return (
                <IonItem
                  key={group.domain}
                  button
                  routerLink={only ? `/event-sources/${only.id}` : `/event-sources/domain/${encodeURIComponent(group.domain)}`}
                >
                  <IonLabel className="ion-text-wrap">
                    <h2 style={tableNameStyle}>{title}</h2>
                  </IonLabel>
                  <CountColumns counts={group} checked={domainCheckedCell(group.sources, now)} />
                </IonItem>
              )
            })}
            <IonItem>
              <IonLabel className="ion-text-wrap">
                <h2 style={tableNameStyle}>Manual</h2>
                <p style={tableDetailStyle}>Posted in the app with no source</p>
              </IonLabel>
              <CountColumns counts={summary.manual} />
            </IonItem>
            <IonItem lines="none">
              <IonLabel className="ion-text-wrap">
                <h2 style={tableNameStyle}>
                  <strong>Total</strong>
                </h2>
                <p style={tableDetailStyle}>
                  {rowsMatchTotals
                    ? 'Every approved event, each date counted once'
                    : `Rows add up to ${sumOfRows!.past_count} / ${sumOfRows!.future_count} — some events aren't accounted for`}
                </p>
              </IonLabel>
              <CountColumns counts={summary.totals} bold />
            </IonItem>
          </IonList>
        )}
        {summary && (
          // 72px bottom margin clears the persistent share FAB (index.css's
          // .share-fab), which otherwise covers the last row.
          <IonList style={{ marginBottom: 72 }}>
            <IonListHeader>
              <IonLabel>Deactivated</IonLabel>
            </IonListHeader>
            {reactivateError && (
              <IonText color="danger">
                <p className="ion-padding-horizontal">{reactivateError}</p>
              </IonText>
            )}
            {summary.deactivated.length === 0 && (
              <IonItem lines="none">
                <IonLabel color="medium">No deactivated sources</IonLabel>
              </IonItem>
            )}
            {summary.deactivated.map((source) => (
              <IonItem key={source.id}>
                <IonLabel className="ion-text-wrap">
                  <h2>{source.name}</h2>
                  <p style={{ wordBreak: 'break-all' }}>{source.url}</p>
                </IonLabel>
                <IonButton
                  slot="end"
                  fill="outline"
                  size="small"
                  disabled={reactivatingId !== null}
                  onClick={() => reactivate(source.id)}
                >
                  {reactivatingId === source.id ? <IonSpinner name="dots" /> : 'Reactivate'}
                </IonButton>
              </IonItem>
            ))}
          </IonList>
        )}
      </IonContent>
    </IonPage>
  )
}
