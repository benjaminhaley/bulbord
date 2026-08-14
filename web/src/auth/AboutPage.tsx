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
        <h2>About Nettelhorst Bulbord</h2>
        <p>
          See things relevant to the Nettelhorst community — neighborhood events, day off camps, the type of things
          people talk about during drop off.
        </p>
        <h2>About the Author</h2>
        <img
          src="/ben-family-photo.png"
          alt="Ben, Anna, Sebron, and Parker"
          style={{ width: '100%', maxWidth: 360, display: 'block', margin: '4px auto 12px' }}
        />
        <p>
          I'm Ben Haley. Anna Piepmeyer and I are parents to two kids at Nettelhorst — Sebron in third grade and
          Parker in pre-K. You'll see me riding around town in a cargo bike, often with the whole family loaded in.
        </p>
        <p>
          I'm building this app as a fun side project. I designed it to help us come together more frequently, for
          the good of our kids and families.
        </p>
        <p>
          Feedback welcome! <a href="mailto:benjamin.haley@gmail.com">benjamin.haley@gmail.com</a> ·{' '}
          <a href="tel:+16302979831">630-297-9831</a>
        </p>
      </IonContent>
    </IonPage>
  )
}
