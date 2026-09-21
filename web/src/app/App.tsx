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
import { PipelineReviewPage } from '../admin/PipelineReviewPage'
import { ProfileSetupPreviewPage } from '../admin/ProfileSetupPreviewPage'
import { UsersPage } from '../admin/UsersPage'
import { AuthProvider } from '../auth/AuthContext'
import { AboutPage } from '../auth/AboutPage'
import { AccountPage } from '../auth/AccountPage'
import { EditProfilePage } from '../auth/EditProfilePage'
import { JoinGate } from '../auth/JoinGate'
import { LoginPage, requiresLogin } from '../auth/LoginPrompt'
import { LabsPage } from '../labs/LabsPage'
import { AddFriendsPage } from '../connections/AddFriendsPage'
import { FriendsPage } from '../connections/FriendsPage'
import { EventsPage } from '../events/EventsPage'
import { EventDetailPage } from '../events/EventDetailPage'
import { EventHistoryPage } from '../events/EventHistoryPage'
import { EventHistoryVersionPage } from '../events/EventHistoryVersionPage'
import { SourcesPage } from '../events/SourcesPage'
import { SourceDetailPage } from '../events/SourceDetailPage'
import { CampsPage } from '../camps/CampsPage'
import { CampDetailPage } from '../camps/CampDetailPage'
import { CampHistoryPage } from '../camps/CampHistoryPage'
import { CampHistoryVersionPage } from '../camps/CampHistoryVersionPage'
import { CampSourcesPage } from '../camps/CampSourcesPage'
import { CampSourceDetailPage } from '../camps/CampSourceDetailPage'
import { SportsClubsPage } from '../sports-clubs/SportsClubsPage'
import { SportsClubDetailPage } from '../sports-clubs/SportsClubDetailPage'
import { SportsClubHistoryPage } from '../sports-clubs/SportsClubHistoryPage'
import { SportsClubHistoryVersionPage } from '../sports-clubs/SportsClubHistoryVersionPage'
import { SportsClubSourcesPage } from '../sports-clubs/SportsClubSourcesPage'
import { SportsClubSourceDetailPage } from '../sports-clubs/SportsClubSourceDetailPage'
import { FeedbackDetailPage } from '../feedback/FeedbackDetailPage'
import { FeedbackPage } from '../feedback/FeedbackPage'
import { CalendarSyncPage } from '../calendar/CalendarSyncPage'
import { NotificationSettingsPage } from '../notifications/NotificationSettingsPage'
import { NotificationsPage } from '../notifications/NotificationsPage'
import { ShareButton } from '../sharing/ShareButton'

const GatedFeedbackPage = requiresLogin(FeedbackPage, 'Sign in to read and post feedback')
const GatedFeedbackDetailPage = requiresLogin(FeedbackDetailPage, 'Sign in to read and post feedback')
const GatedAccountPage = requiresLogin(AccountPage, 'Sign in to see your account')
const GatedEditProfilePage = requiresLogin(EditProfilePage, 'Sign in to edit your profile')
const GatedNotificationSettingsPage = requiresLogin(NotificationSettingsPage, 'Sign in to change notification settings')
const GatedCalendarSyncPage = requiresLogin(CalendarSyncPage, 'Sign in to sync your calendar')
const GatedFriendsPage = requiresLogin(FriendsPage, 'Sign in to see your friends')
const GatedAddFriendsPage = requiresLogin(AddFriendsPage, 'Sign in to add friends')
const GatedNotificationsPage = requiresLogin(NotificationsPage, 'Sign in to see your notifications')
const GatedEventHistoryPage = requiresLogin(EventHistoryPage, 'Sign in to see edit history')
const GatedEventHistoryVersionPage = requiresLogin(EventHistoryVersionPage, 'Sign in to see edit history')
const GatedCampHistoryPage = requiresLogin(CampHistoryPage, 'Sign in to see edit history')
const GatedCampHistoryVersionPage = requiresLogin(CampHistoryVersionPage, 'Sign in to see edit history')
const GatedSportsClubHistoryPage = requiresLogin(SportsClubHistoryPage, 'Sign in to see edit history')
const GatedSportsClubHistoryVersionPage = requiresLogin(SportsClubHistoryVersionPage, 'Sign in to see edit history')

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
                  <Route exact path="/events/:id/history" component={GatedEventHistoryPage} />
                  <Route exact path="/events/:id/history/:editId" component={GatedEventHistoryVersionPage} />
                  <Route exact path="/camps" component={CampsPage} />
                  <AdminRoute exact path="/camp-sources" component={CampSourcesPage} />
                  <AdminRoute exact path="/camp-sources/:id" component={CampSourceDetailPage} />
                  <Route exact path="/camps/:id" component={CampDetailPage} />
                  <Route exact path="/camps/:id/history" component={GatedCampHistoryPage} />
                  <Route exact path="/camps/:id/history/:editId" component={GatedCampHistoryVersionPage} />
                  <Route exact path="/sports-clubs" component={SportsClubsPage} />
                  <AdminRoute exact path="/sports-club-sources" component={SportsClubSourcesPage} />
                  <AdminRoute exact path="/sports-club-sources/:id" component={SportsClubSourceDetailPage} />
                  <Route exact path="/sports-clubs/:id" component={SportsClubDetailPage} />
                  <Route exact path="/sports-clubs/:id/history" component={GatedSportsClubHistoryPage} />
                  <Route exact path="/sports-clubs/:id/history/:editId" component={GatedSportsClubHistoryVersionPage} />
                  <Route exact path="/feedback" component={GatedFeedbackPage} />
                  <Route exact path="/feedback/:id" component={GatedFeedbackDetailPage} />
                  <Route exact path="/account" component={GatedAccountPage} />
                  <Route exact path="/account/edit" component={GatedEditProfilePage} />
                  <Route exact path="/account/notification-settings" component={GatedNotificationSettingsPage} />
                  <Route exact path="/account/calendar-sync" component={GatedCalendarSyncPage} />
                  <Route exact path="/about" component={AboutPage} />
                  <Route exact path="/login" component={LoginPage} />
                  <Route exact path="/labs" component={LabsPage} />
                  <Route exact path="/friends" component={GatedFriendsPage} />
                  <Route exact path="/friends/add" component={GatedAddFriendsPage} />
                  <Route exact path="/notifications" component={GatedNotificationsPage} />
                  <AdminRoute exact path="/admin/users" component={UsersPage} />
                  <AdminRoute exact path="/admin/dev-tools" component={DevToolsPage} />
                  <AdminRoute exact path="/admin/invite-preview" component={InvitePreviewPage} />
                  <AdminRoute exact path="/admin/profile-setup-preview" component={ProfileSetupPreviewPage} />
                  <AdminRoute exact path="/admin/friends-preview" component={FriendsPreviewPage} />
                  <AdminRoute exact path="/admin/analytics" component={AnalyticsPage} />
                  <AdminRoute exact path="/admin/pipeline-review" component={PipelineReviewPage} />
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
