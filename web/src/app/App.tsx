import { IonApp, IonIcon, IonLabel, IonRouterOutlet, IonTabBar, IonTabButton, IonTabs } from '@ionic/react'
import { IonReactRouter } from '@ionic/react-router'
import { Redirect, Route } from 'react-router-dom'
import { calendarOutline, chatbubbleOutline, sunnyOutline } from 'ionicons/icons'

import { AdminRoute } from '../admin/AdminRoute'
import { DataFreshnessProvider } from '../admin/DataFreshnessContext'
import { DevToolsPage } from '../admin/DevToolsPage'
import { InvitePreviewPage } from '../admin/InvitePreviewPage'
import { ProfileSetupPreviewPage } from '../admin/ProfileSetupPreviewPage'
import { UsersPage } from '../admin/UsersPage'
import { AuthProvider } from '../auth/AuthContext'
import { AboutPage } from '../auth/AboutPage'
import { AccountPage } from '../auth/AccountPage'
import { JoinGate } from '../auth/JoinGate'
import { EventsPage } from '../events/EventsPage'
import { EventDetailPage } from '../events/EventDetailPage'
import { SourcesPage } from '../events/SourcesPage'
import { SourceDetailPage } from '../events/SourceDetailPage'
import { CampsPage } from '../camps/CampsPage'
import { CampDetailPage } from '../camps/CampDetailPage'
import { CampSourcesPage } from '../camps/CampSourcesPage'
import { CampSourceDetailPage } from '../camps/CampSourceDetailPage'
import { FeedbackPage } from '../feedback/FeedbackPage'
import { ShareButton } from '../sharing/ShareButton'

export function App() {
  return (
    <IonApp>
      <AuthProvider>
        <DataFreshnessProvider>
          <IonReactRouter>
            <JoinGate>
              <IonTabs>
                <IonRouterOutlet>
                  <Route exact path="/events" component={EventsPage} />
                  <Route exact path="/event-sources" component={SourcesPage} />
                  <Route exact path="/event-sources/:id" component={SourceDetailPage} />
                  <Route exact path="/events/:id" component={EventDetailPage} />
                  <Route exact path="/camps" component={CampsPage} />
                  <Route exact path="/camp-sources" component={CampSourcesPage} />
                  <Route exact path="/camp-sources/:id" component={CampSourceDetailPage} />
                  <Route exact path="/camps/:id" component={CampDetailPage} />
                  <Route exact path="/feedback" component={FeedbackPage} />
                  <Route exact path="/account" component={AccountPage} />
                  <Route exact path="/about" component={AboutPage} />
                  <AdminRoute exact path="/admin/users" component={UsersPage} />
                  <AdminRoute exact path="/admin/dev-tools" component={DevToolsPage} />
                  <AdminRoute exact path="/admin/invite-preview" component={InvitePreviewPage} />
                  <AdminRoute exact path="/admin/profile-setup-preview" component={ProfileSetupPreviewPage} />
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
        </DataFreshnessProvider>
      </AuthProvider>
    </IonApp>
  )
}
