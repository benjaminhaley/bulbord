import { IonApp, IonIcon, IonLabel, IonRouterOutlet, IonTabBar, IonTabButton, IonTabs } from '@ionic/react'
import { IonReactRouter } from '@ionic/react-router'
import { Redirect, Route } from 'react-router-dom'
import { calendarOutline, sunnyOutline } from 'ionicons/icons'

import { EventsPage } from '../events/EventsPage'
import { EventDetailPage } from '../events/EventDetailPage'
import { SourcesPage } from '../events/SourcesPage'
import { CampsPage } from '../camps/CampsPage'

export function App() {
  return (
    <IonApp>
      <IonReactRouter>
        <IonTabs>
          <IonRouterOutlet>
            <Route exact path="/events" component={EventsPage} />
            <Route exact path="/event-sources" component={SourcesPage} />
            <Route exact path="/events/:id" component={EventDetailPage} />
            <Route exact path="/camps" component={CampsPage} />
            <Redirect exact path="/" to="/events" />
          </IonRouterOutlet>
          <IonTabBar slot="bottom">
            <IonTabButton tab="events" href="/events">
              <IonIcon icon={calendarOutline} />
              <IonLabel>Events</IonLabel>
            </IonTabButton>
            <IonTabButton tab="camps" href="/camps">
              <IonIcon icon={sunnyOutline} />
              <IonLabel>Camps</IonLabel>
            </IonTabButton>
          </IonTabBar>
        </IonTabs>
      </IonReactRouter>
    </IonApp>
  )
}
