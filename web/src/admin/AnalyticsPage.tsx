import {
  IonBackButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCol,
  IonContent,
  IonGrid,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonRow,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { useEffect, useState } from 'react'

import { formatRelativeDateTime } from '../format'
import { secondaryTextStyle, sectionDividerStyle } from '../theme/layout'
import { Avatar } from '../uploads/Avatar'
import { fetchAdminUsers, fetchAnalyticsSummary, type AdminUser, type AnalyticsActorFilter, type AnalyticsSummary } from './api'
import { DauChart } from './DauChart'

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <IonCol size="6">
      <IonCard style={{ margin: 4 }}>
        <IonCardContent style={{ padding: 12 }}>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, lineHeight: 1.1 }}>{value}</div>
          <div style={secondaryTextStyle}>{label}</div>
        </IonCardContent>
      </IonCard>
    </IonCol>
  )
}

// "who did what, when" — a plain, human label for a stored action string
// (event_viewed -> "Event viewed") rather than a hand-maintained lookup
// table per action, since the naming convention (snake_case, verb-ish
// suffix) is consistent enough across every logged action to make one work.
function actionLabel(action: string): string {
  const words = action.split('_')
  return words.map((w, i) => (i === 0 ? w[0].toUpperCase() + w.slice(1) : w)).join(' ')
}

// Admin-only (feedback #96) — "the basics like daily active visitors, last
// active by member, number of people viewing events, who is sharing... a
// simple logging layer for all the key actions." See
// api/src/analytics/service.ts for what's tracked and the recent-activity
// allowlist. Reached from Developer Tools, same low-visibility entry point
// as every other admin view.
export function AnalyticsPage() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [members, setMembers] = useState<AdminUser[]>([])
  // Feedback #101: "make it easy to include or exclude a person" from the
  // recent-activity log below — undefined actorId means no filter (the
  // default, everyone shown), matching every other list on this page.
  const [actorId, setActorId] = useState<string | undefined>(undefined)
  const [actorMode, setActorMode] = useState<AnalyticsActorFilter['mode']>('include')

  useEffect(() => {
    fetchAdminUsers()
      .then(setMembers)
      .catch(() => {
        /* the person filter is a nice-to-have on top of the log — a failed
           member-list fetch shouldn't block the rest of this page */
      })
  }, [])

  // Refetches the whole summary on a filter change rather than a
  // log-only endpoint — the stat tiles/DAU chart/last-active list stay on
  // screen from the previous response while the new one loads (no
  // full-page flash to a spinner), since only the recent-activity log
  // below is actually affected by this filter.
  useEffect(() => {
    fetchAnalyticsSummary(actorId ? { actorId, mode: actorMode } : undefined)
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load analytics'))
  }, [actorId, actorMode])

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/admin/dev-tools" />
          </IonButtons>
          <IonTitle>Analytics</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen className="ion-padding">
        {!summary && !error && <IonSpinner name="dots" />}
        {error && (
          <IonText color="danger">
            <p>{error}</p>
          </IonText>
        )}
        {summary && (
          <>
            <IonGrid style={{ padding: 0 }}>
              <IonRow>
                <StatTile value={summary.active_today} label="Active today" />
                <StatTile value={summary.active_this_week} label="Active this week" />
                <StatTile value={summary.event_viewers_7d} label="Viewing events (7d)" />
                <StatTile value={summary.camp_viewers_7d} label="Viewing camps (7d)" />
                <StatTile value={summary.sharers_7d} label="Sharing (7d)" />
              </IonRow>
            </IonGrid>

            <h2 style={{ marginTop: 24 }}>Daily active, last 30 days</h2>
            <DauChart data={summary.dau} />

            <hr style={sectionDividerStyle} />
            <h2>Last active by member</h2>
            {summary.last_active_by_member.length === 0 && <p style={secondaryTextStyle}>No activity logged yet.</p>}
            <IonList inset>
              {summary.last_active_by_member.map((m) => (
                <IonItem key={m.user_id}>
                  <Avatar slot="start" url={m.avatar_url} name={m.name} size={28} />
                  <IonLabel>{m.name}</IonLabel>
                  <IonText slot="end" style={secondaryTextStyle}>
                    {formatRelativeDateTime(m.last_active_at)}
                  </IonText>
                </IonItem>
              ))}
            </IonList>

            <hr style={sectionDividerStyle} />
            <h2>Recent activity</h2>
            <IonItem lines="none" style={{ '--padding-start': 0 } as React.CSSProperties}>
              <IonLabel>Filter by person</IonLabel>
              <IonSelect
                slot="end"
                interface="action-sheet"
                placeholder="Everyone"
                value={actorId ?? ''}
                onIonChange={(e) => setActorId((e.detail.value as string) || undefined)}
              >
                <IonSelectOption value="">Everyone</IonSelectOption>
                {members.map((m) => (
                  <IonSelectOption key={m.id} value={m.id}>
                    {m.name}
                  </IonSelectOption>
                ))}
              </IonSelect>
            </IonItem>
            {actorId && (
              <IonSegment
                value={actorMode}
                onIonChange={(e) => setActorMode(e.detail.value as AnalyticsActorFilter['mode'])}
                style={{ marginBottom: 8 }}
              >
                <IonSegmentButton value="include">
                  <IonLabel>Only them</IonLabel>
                </IonSegmentButton>
                <IonSegmentButton value="exclude">
                  <IonLabel>Hide them</IonLabel>
                </IonSegmentButton>
              </IonSegment>
            )}
            {summary.recent_log.length === 0 && <p style={secondaryTextStyle}>No activity logged{actorId ? ' for this filter' : ' yet'}.</p>}
            <IonList inset>
              {summary.recent_log.map((entry) => (
                <IonItem key={entry.id}>
                  <IonLabel className="ion-text-wrap">
                    <p style={{ margin: 0 }}>
                      <strong>{entry.actor_name}</strong> — {actionLabel(entry.action)}
                    </p>
                  </IonLabel>
                  <IonText slot="end" style={{ ...secondaryTextStyle, whiteSpace: 'nowrap' }}>
                    {formatRelativeDateTime(entry.created_at)}
                  </IonText>
                </IonItem>
              ))}
            </IonList>
          </>
        )}
      </IonContent>
    </IonPage>
  )
}
