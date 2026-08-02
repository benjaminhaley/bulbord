import { IonApp, IonButton, IonContent, IonPage } from '@ionic/react'

// Served at the bare platform domain (bulbord.com) — see main.tsx's hostname
// check. Bulbord is the umbrella brand; each institution's community lives
// at its own subdomain (e.g. nettlehorst.bulbord.com). Only Nettlehorst
// exists today, so this is a simple pointer rather than an institution
// picker — add one if/when a second institution is onboarded.
export function LandingPage() {
  return (
    <IonApp>
      <IonPage>
        <IonContent fullscreen className="ion-padding ion-text-center">
          <div style={{ marginTop: '40%' }}>
            <h1>Bulbord</h1>
            <p>A hyper-local hub for school and community groups.</p>
            <IonButton href="https://nettlehorst.bulbord.com">Go to Nettlehorst</IonButton>
          </div>
        </IonContent>
      </IonPage>
    </IonApp>
  )
}
