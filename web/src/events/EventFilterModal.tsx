import {
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { closeOutline } from 'ionicons/icons'
import { useEffect, useState } from 'react'

import { EVENT_TOPIC_OPTIONS } from './topics'

// Feedback #97: topic (fixed picker) + a "hide anything starting after
// HH:MM" time-of-day cutoff, applied to both the list and calendar views of
// the Events tab. A real IonModal (not an IonActionSheet — this needs
// checkboxes and a time input, not a flat list of one-tap actions).
export function EventFilterModal({
  isOpen,
  topics,
  beforeTime,
  onApply,
  onDismiss,
}: {
  isOpen: boolean
  topics: string[]
  beforeTime: string
  onApply: (topics: string[], beforeTime: string) => void
  onDismiss: () => void
}) {
  const [selectedTopics, setSelectedTopics] = useState<string[]>(topics)
  const [cutoff, setCutoff] = useState(beforeTime)

  // Re-sync local draft state whenever the modal is (re)opened, so a
  // dismissed-without-applying edit doesn't linger into the next open.
  useEffect(() => {
    if (isOpen) {
      setSelectedTopics(topics)
      setCutoff(beforeTime)
    }
  }, [isOpen, topics, beforeTime])

  function toggleTopic(topic: string, checked: boolean) {
    setSelectedTopics((prev) => (checked ? [...prev, topic] : prev.filter((t) => t !== topic)))
  }

  function apply() {
    onApply(selectedTopics, cutoff)
    onDismiss()
  }

  function clear() {
    setSelectedTopics([])
    setCutoff('')
    onApply([], '')
    onDismiss()
  }

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onDismiss}>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Filters</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onDismiss}>
              <IonIcon slot="icon-only" icon={closeOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <IonList inset>
          <IonItem lines="none">
            <IonLabel>
              <h2>Topic</h2>
            </IonLabel>
          </IonItem>
          {EVENT_TOPIC_OPTIONS.map((topic) => (
            <IonItem key={topic}>
              <IonCheckbox
                checked={selectedTopics.includes(topic)}
                onIonChange={(e) => toggleTopic(topic, e.detail.checked)}
              >
                {topic}
              </IonCheckbox>
            </IonItem>
          ))}
        </IonList>
        <IonList inset>
          <IonItem lines="none">
            <IonLabel position="stacked">Hide events starting after</IonLabel>
            <input
              type="time"
              value={cutoff}
              onChange={(e) => setCutoff(e.target.value)}
              style={{ border: 'none', font: 'inherit', width: '100%', padding: '8px 0', background: 'transparent' }}
            />
          </IonItem>
        </IonList>
        <div style={{ display: 'flex', gap: 8, padding: '8px 16px' }}>
          <IonButton expand="block" onClick={apply} style={{ flex: 1 }}>
            Apply
          </IonButton>
          <IonButton expand="block" fill="outline" color="medium" onClick={clear} style={{ flex: 1 }}>
            Clear
          </IonButton>
        </div>
      </IonContent>
    </IonModal>
  )
}
