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
  IonNote,
  IonPage,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { logoFacebook, shieldCheckmarkOutline } from 'ionicons/icons'
import { useState } from 'react'

import { useAuth } from './AuthContext'
import { facebookLoginUrl, passwordLogin } from './api'
import { setToken } from './token'

function PasswordLogin() {
  const { refresh } = useAuth()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      const token = await passwordLogin(password)
      setToken(token)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <IonList inset>
      <IonItem>
        <IonLabel position="stacked">Temporary admin password</IonLabel>
        <IonInput
          type="password"
          value={password}
          onIonInput={(e) => setPassword(e.detail.value ?? '')}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
      </IonItem>
      {error && (
        <IonText color="danger">
          <p className="ion-padding-start">{error}</p>
        </IonText>
      )}
      <IonItem lines="none">
        <IonButton fill="outline" disabled={submitting || !password} onClick={submit}>
          Log in
        </IonButton>
      </IonItem>
    </IonList>
  )
}

export function AccountPage() {
  const { user, isLoading, isAdmin, logout } = useAuth()

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/events" />
          </IonButtons>
          <IonTitle>Account</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen className="ion-padding">
        {isLoading && (
          <div className="coming-soon">
            <IonSpinner name="dots" />
          </div>
        )}

        {!isLoading && !user && (
          <div className="account-fallback">
            <IonButton href={facebookLoginUrl()}>
              <IonIcon slot="start" icon={logoFacebook} />
              Log in with Facebook
            </IonButton>
            <IonNote>Facebook login is temporarily down. Use the admin password below instead.</IonNote>
            <PasswordLogin />
          </div>
        )}

        {!isLoading && user && (
          <IonList>
            <IonItem lines="none">
              <IonLabel>
                <h2>{user.name}</h2>
                {user.email && <IonNote>{user.email}</IonNote>}
              </IonLabel>
            </IonItem>
            {isAdmin && (
              <IonItem lines="none">
                <IonIcon slot="start" icon={shieldCheckmarkOutline} color="primary" />
                <IonLabel>Administrator</IonLabel>
              </IonItem>
            )}
            <IonItem lines="none">
              <IonButton fill="outline" color="medium" onClick={logout}>
                Log out
              </IonButton>
            </IonItem>
          </IonList>
        )}
      </IonContent>
    </IonPage>
  )
}
