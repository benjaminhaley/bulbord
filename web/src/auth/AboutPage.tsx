import { IonBackButton, IonButtons, IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/react'

// Static, low-maintenance page (feedback #35) — no admin/CMS editing needed,
// content changes rarely enough that a code edit is the right mechanism.
export function AboutPage() {
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/events" />
          </IonButtons>
          <IonTitle>About</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen className="ion-padding">
        <p>
          This app is built by Ben Haley and designed to help our community at Nettelhorst come together more
          frequently, for the good of our kids and their families.
        </p>
        <p>Feedback welcome!</p>
      </IonContent>
    </IonPage>
  )
}
