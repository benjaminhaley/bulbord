import { IonApp, IonIcon, IonLabel, IonRouterOutlet, IonTabBar, IonTabButton, IonTabs } from '@ionic/react'
import { IonReactRouter } from '@ionic/react-router'
import { Redirect, Route } from 'react-router-dom'
import { calendarOutline, chatbubbleOutline, ribbonOutline, sunnyOutline } from 'ionicons/icons'

import { AdminRoute } from '../admin/AdminRoute'
import { AnalyticsPage } from '../admin/AnalyticsPage'
import { DataFreshnessProvider } from '../admin/DataFreshnessContext'
import { DevToolsPage } from '../admin/DevToolsPage'
import { FriendsPreviewPage } from '../admin/FriendsPreviewPage'
import { InvitePreviewPage } from '../admin/InvitePreviewPage'
import { ProfileSetupPreviewPage } from '../admin/ProfileSetupPreviewPage'
import { UsersPage } from '../admin/UsersPage'
import { AuthProvider } from '../auth/AuthContext'
import { AboutPage } from '../auth/AboutPage'
import { AccountPage } from '../auth/AccountPage'
import { EditProfilePage } from '../auth/EditProfilePage'
import { JoinGate } from '../auth/JoinGate'
import { AddFriendsPage } from '../connections/AddFriendsPage'
import { FriendsPage } from '../connections/FriendsPage'
import { EventsPage } from '../events/EventsPage'
import { EventDetailPage } from '../events/EventDetailPage'
import { SourcesPage } from '../events/SourcesPage'
import { SourceDetailPage } from '../events/SourceDetailPage'
import { CampsPage } from '../camps/CampsPage'
import { CampDetailPage } from '../camps/CampDetailPage'
import { CampSourcesPage } from '../camps/CampSourcesPage'
import { CampSourceDetailPage } from '../camps/CampSourceDetailPage'
import { SportsClubsPage } from '../sports-clubs/SportsClubsPage'
import { SportsClubDetailPage } from '../sports-clubs/SportsClubDetailPage'
import { SportsClubSourcesPage } from '../sports-clubs/SportsClubSourcesPage'
import { SportsClubSourceDetailPage } from '../sports-clubs/SportsClubSourceDetailPage'
import { FeedbackDetailPage } from '../feedback/FeedbackDetailPage'
import { FeedbackPage } from '../feedback/FeedbackPage'
import { NotificationSettingsPage } from '../notifications/NotificationSettingsPage'
import { NotificationsPage } from '../notifications/NotificationsPage'
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
                  <AdminRoute exact path="/event-sources" component={SourcesPage} />
                  <AdminRoute exact path="/event-sources/:id" component={SourceDetailPage} />
                  <Route exact path="/events/:id" component={EventDetailPage} />
                  <Route exact path="/camps" component={CampsPage} />
                  <AdminRoute exact path="/camp-sources" component={CampSourcesPage} />
                  <AdminRoute exact path="/camp-sources/:id" component={CampSourceDetailPage} />
                  <Route exact path="/camps/:id" component={CampDetailPage} />
                  <Route exact path="/sports-clubs" component={SportsClubsPage} />
                  <AdminRoute exact path="/sports-club-sources" component={SportsClubSourcesPage} />
                  <AdminRoute exact path="/sports-club-sources/:id" component={SportsClubSourceDetailPage} />
                  <Route exact path="/sports-clubs/:id" component={SportsClubDetailPage} />
                  <Route exact path="/feedback" component={FeedbackPage} />
                  <Route exact path="/feedback/:id" component={FeedbackDetailPage} />
                  <Route exact path="/account" component={AccountPage} />
                  <Route exact path="/account/edit" component={EditProfilePage} />
                  <Route exact path="/account/notification-settings" component={NotificationSettingsPage} />
                  <Route exact path="/about" component={AboutPage} />
                  <Route exact path="/friends" component={FriendsPage} />
                  <Route exact path="/friends/add" component={AddFriendsPage} />
                  <Route exact path="/notifications" component={NotificationsPage} />
                  <AdminRoute exact path="/admin/users" component={UsersPage} />
                  <AdminRoute exact path="/admin/dev-tools" component={DevToolsPage} />
                  <AdminRoute exact path="/admin/invite-preview" component={InvitePreviewPage} />
                  <AdminRoute exact path="/admin/profile-setup-preview" component={ProfileSetupPreviewPage} />
                  <AdminRoute exact path="/admin/friends-preview" component={FriendsPreviewPage} />
                  <AdminRoute exact path="/admin/analytics" component={AnalyticsPage} />
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
                  <IonTabButton tab="sports-clubs" href="/sports-clubs">
                    <IonIcon icon={ribbonOutline} />
                    <IonLabel>Sports & Clubs</IonLabel>
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
