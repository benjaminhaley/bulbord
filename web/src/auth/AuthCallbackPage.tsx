import { IonContent, IonPage, IonSpinner } from '@ionic/react'
import { useEffect, useRef, useState } from 'react'
import { useHistory, useLocation } from 'react-router-dom'

import { useAuth } from './AuthContext'
import { exchangeLoginCode } from './api'
import { setToken } from './token'

export function AuthCallbackPage() {
  const location = useLocation()
  const history = useHistory()
  const { refresh } = useAuth()
  const [error, setError] = useState(false)
  const hasRun = useRef(false)

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    const params = new URLSearchParams(location.search)
    const code = params.get('code')
    const err = params.get('error')

    if (err || !code) {
      setError(true)
      return
    }

    exchangeLoginCode(code)
      .then(async (token) => {
        setToken(token)
        await refresh()
        history.replace('/account')
      })
      .catch(() => setError(true))
  }, [location.search, refresh, history])

  return (
    <IonPage>
      <IonContent fullscreen className="ion-padding">
        <div className="coming-soon">
          {error ? <p>Login failed. Please try again.</p> : <IonSpinner name="dots" />}
        </div>
      </IonContent>
    </IonPage>
  )
}
