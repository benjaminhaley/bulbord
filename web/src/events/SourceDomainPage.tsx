import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import { fetchEventSourceSummary, type SourceDomain } from './api'
import { CountColumnHeaders, CountColumns } from './SourcesPage'

// Feedback #178: the Sources list shows one row per domain; this is where
// a domain with several specific sources is broken out, and where each
// source's URL is shown.
export function SourceDomainPage() {
  const { domain } = useParams<{ domain: string }>()
  const [group, setGroup] = useState<SourceDomain | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetchEventSourceSummary()
      .then((summary) => {
        const found = summary.domains.find((d) => d.domain === domain)
        if (found) setGroup(found)
        else setError(true)
      })
      .catch(() => setError(true))
  }, [domain])

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/event-sources" />
          </IonButtons>
          <IonTitle>{domain}</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen>
        {group === null && !error && (
          <div className="coming-soon">
            <IonSpinner name="dots" />
          </div>
        )}
        {error && (
          <div className="coming-soon">
            <p>Couldn't load this domain's sources</p>
          </div>
        )}
        {group && (
          // 72px bottom margin clears the persistent share FAB (index.css's
          // .share-fab), which otherwise covers the Total row's numbers.
          <IonList style={{ marginBottom: 72 }}>
            <CountColumnHeaders label="Source" />
            {group.sources.map((source) => (
              <IonItem key={source.id} button routerLink={`/event-sources/${source.id}`}>
                <IonLabel className="ion-text-wrap">
                  <h2>{source.name}</h2>
                  <p style={{ wordBreak: 'break-all' }}>{source.url}</p>
                  {!source.is_active && <p>Inactive</p>}
                </IonLabel>
                <CountColumns counts={source} />
              </IonItem>
            ))}
            <IonItem lines="none">
              <IonLabel>
                <h2>
                  <strong>Total</strong>
                </h2>
              </IonLabel>
              <CountColumns counts={group} bold />
            </IonItem>
          </IonList>
        )}
      </IonContent>
    </IonPage>
  )
}
