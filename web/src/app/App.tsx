import { IonApp, IonIcon, IonLabel, IonRouterOutlet, IonTabBar, IonTabButton, IonTabs } from '@ionic/react'
import { IonReactRouter } from '@ionic/react-router'
import { Redirect, Route } from 'react-router-dom'
import { calendarOutline, chatbubbleOutline, sunnyOutline } from 'ionicons/icons'

import { AdminRoute } from '../admin/AdminRoute'
import { UsersPage } from '../admin/UsersPage'
import { AuthProvider } from '../auth/AuthContext'
import { AccountPage } from '../auth/AccountPage'
import { JoinGate } from '../auth/JoinGate'
import { EventsPage } from '../events/EventsPage'
import { EventDetailPage } from '../events/EventDetailPage'
import { SourcesPage } from '../events/SourcesPage'
import { SourceDetailPage } from '../events/SourceDetailPage'
import { CampsPage } from '../camps/CampsPage'
import { FeedbackPage } from '../feedback/FeedbackPage'
import { ShareButton } from '../sharing/ShareButton'

export function App() {
  return (
    <IonApp>
      <AuthProvider>
        <IonReactRouter>
          <JoinGate>
            <IonTabs>
              <IonRouterOutlet>
                <Route exact path="/events" component={EventsPage} />
                <Route exact path="/event-sources" component={SourcesPage} />
                <Route exact path="/event-sources/:id" component={SourceDetailPage} />
                <Route exact path="/events/:id" component={EventDetailPage} />
                <Route exact path="/camps" component={CampsPage} />
                <Route exact path="/feedback" component={FeedbackPage} />
                <Route exact path="/account" component={AccountPage} />
                <AdminRoute exact path="/admin/users" component={UsersPage} />
                <Redirect exact path="/" to="/events" />
              </IonRouterOutlet>
              <IonTabBar slot="bottom" id="main-tab-bar">
                <IonTabButton tab="events" href="/events">
                  <IonIcon icon={calendarOutline} />
                  <IonLabel>Events</IonLabel>
                </IonTabButton>
                <IonTabButton tab="camps" href="/camps">
                  <IonIcon icon={sunnyOutline} />
                  <IonLabel>Camps</IonLabel>
                </IonTabButton>
                <IonTabButton tab="feedback" href="/feedback">
                  <IonIcon icon={chatbubbleOutline} />
                  <IonLabel>Feedback</IonLabel>
                </IonTabButton>
              </IonTabBar>
            </IonTabs>
            <ShareButton />
          </JoinGate>
        </IonReactRouter>
      </AuthProvider>
    </IonApp>
  )
}
