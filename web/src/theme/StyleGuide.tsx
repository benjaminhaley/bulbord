import { IonBadge, IonButton, IonContent, IonItem, IonLabel, IonList, IonPage } from '@ionic/react'

import { factLineStyle, secondaryTextStyle, sectionDividerStyle } from './layout'

// The visual counterpart to STYLE_GUIDE.md — every token/pattern rendered
// so it can be checked by eye, not just read as a number. Browsable via
// Storybook ("Style Guide" in the sidebar) rather than a real app route,
// same posture as this app's other pure-reference screens (see
// InvitePreviewPage) — nothing here is live product UI.

const SPACING_SCALE: Array<[name: string, cssVar: string]> = [
  ['2xs', '--space-2xs'],
  ['xs', '--space-xs'],
  ['sm', '--space-sm'],
  ['md', '--space-md'],
  ['lg', '--space-lg'],
  ['xl', '--space-xl'],
  ['2xl', '--space-2xl'],
  ['3xl', '--space-3xl'],
]

const COLOR_ROLES = ['primary', 'secondary', 'tertiary', 'success', 'warning', 'danger', 'medium', 'light', 'dark']

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2>{title}</h2>
      {children}
    </section>
  )
}

export function StyleGuide() {
  return (
    <IonPage>
      <IonContent fullscreen className="ion-padding">
        <h1>Bulbord Style Guide</h1>
        <p style={factLineStyle}>
          Visual reference for the tokens/patterns in <code>STYLE_GUIDE.md</code>. Inherited from Material Design 3 —
          see that doc for the full rationale.
        </p>

        <Section title="Spacing scale (theme/tokens.css)">
          <p style={secondaryTextStyle}>Material's 4dp grid. Each bar is drawn at its own token width.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {SPACING_SCALE.map(([name, cssVar]) => (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <code style={{ width: 90 }}>
                  {cssVar} <span style={secondaryTextStyle}>({name})</span>
                </code>
                <div style={{ background: 'var(--ion-color-primary)', height: 16, width: `var(${cssVar})` }} />
              </div>
            ))}
          </div>
        </Section>

        <Section title="Typography — secondary/label roles">
          <p style={{ fontSize: 'var(--type-body-size)', lineHeight: 'var(--type-body-line-height)', margin: '4px 0' }}>
            Body (16/24) — ordinary paragraph text; Ionic's own defaults already cover this.
          </p>
          <p
            style={{
              fontSize: 'var(--type-body-secondary-size)',
              lineHeight: 'var(--type-body-secondary-line-height)',
              margin: '4px 0',
              color: 'var(--ion-color-medium)',
            }}
          >
            Body secondary (14/20) — secondaryTextStyle. Dates, "Posted by", meta lines.
          </p>
          <p
            style={{
              fontSize: 'var(--type-label-size)',
              lineHeight: 'var(--type-label-line-height)',
              margin: '4px 0',
              color: 'var(--ion-color-medium)',
            }}
          >
            Label (12/16) — table headers, fine print, badges.
          </p>
        </Section>

        <Section title="Fact lines &amp; section dividers">
          <p style={factLineStyle}>Fri, Sep 25</p>
          <p style={factLineStyle}>9 am – 3:30 pm</p>
          <p style={factLineStyle}>$150/day · Ages: 5-12 · 2.3 mi</p>
          <hr style={sectionDividerStyle} />
          <h2>Next section</h2>
          <p style={secondaryTextStyle}>sectionDividerStyle marks a real section boundary, like the rule above.</p>
        </Section>

        <Section title="Color roles (Ionic --ion-color-*, Material's color-role system)">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {COLOR_ROLES.map((role) => (
              <IonBadge key={role} color={role}>
                {role}
              </IonBadge>
            ))}
          </div>
        </Section>

        <Section title="Component gallery (Ionic built-ins — don't hand-roll these)">
          <IonList inset>
            <IonItem>
              <IonLabel>
                <h2>List item</h2>
                <p>Secondary line</p>
              </IonLabel>
            </IonItem>
          </IonList>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <IonButton>Solid</IonButton>
            <IonButton fill="outline">Outline</IonButton>
            <IonButton fill="clear">Clear</IonButton>
          </div>
        </Section>
      </IonContent>
    </IonPage>
  )
}
