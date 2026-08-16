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
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { useEffect, useState } from 'react'

import { formatRelativeDateTime } from '../format'
import { secondaryTextStyle, sectionDividerStyle } from '../theme/layout'
import { Avatar } from '../uploads/Avatar'
import { fetchAnalyticsSummary, type AnalyticsSummary } from './api'
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

  useEffect(() => {
    fetchAnalyticsSummary()
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load analytics'))
  }, [])

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
            {summary.recent_log.length === 0 && <p style={secondaryTextStyle}>No activity logged yet.</p>}
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
