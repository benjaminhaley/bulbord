// Camps' first filter UI at all (feedback #103, 2026-08-19) — a single Age
// chip, following the same chip-opens-a-sheet-modal pattern Events/Sports &
// Clubs already settled on (CLAUDE.md), but a lean, Camps-only copy rather
// than importing SportsClubFilterChips' internals — this tab only needs one
// chip today, and Camps stays a fresh, non-shared clone by convention.
import { IonButton, IonCheckbox, IonChip, IonContent, IonIcon, IonItem, IonLabel, IonModal } from '@ionic/react'
import { chevronDownOutline } from 'ionicons/icons'
import { useState } from 'react'

const AGE_OPTIONS = Array.from({ length: 19 }, (_, i) => i) // 0-18

// Default-on, unlike Events'/Sports & Clubs' chips which default to "off"
// (empty selection) — feedback #103 explicitly asked for this filter to
// start pre-applied to the viewer's own kids' ages, not to be discovered
// and turned on manually. An empty selection here still means "show
// everything" (same convention as every other chip in this app), reachable
// via this sheet's own Clear button for a member who wants to see
// everything regardless of age.
function ageChipLabel(ages: number[]): string {
  if (ages.length === 0) return 'Age'
  if (ages.length <= 3) return `Ages ${ages.join(', ')}`
  return `${ages.length} ages`
}

export function CampFilterChips({ ages, onChange }: { ages: number[]; onChange: (next: number[]) => void }) {
  const [sheetOpen, setSheetOpen] = useState(false)

  function toggle(age: number, checked: boolean) {
    onChange(checked ? [...ages, age].sort((a, b) => a - b) : ages.filter((a) => a !== age))
  }

  return (
    <div style={{ display: 'flex', gap: 8, padding: '6px 12px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <IonChip
        outline={ages.length === 0}
        color={ages.length > 0 ? 'primary' : 'medium'}
        onClick={() => setSheetOpen(true)}
        style={{ flexShrink: 0 }}
      >
        <IonLabel style={{ whiteSpace: 'nowrap' }}>{ageChipLabel(ages)}</IonLabel>
        <IonIcon icon={chevronDownOutline} />
      </IonChip>

      <IonModal isOpen={sheetOpen} onDidDismiss={() => setSheetOpen(false)} breakpoints={[0, 0.6, 0.9]} initialBreakpoint={0.6} handle>
        <div style={{ padding: '8px 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: '0 0 8px' }}>Age</h2>
          {ages.length > 0 && (
            <IonButton fill="clear" size="small" onClick={() => onChange([])}>
              Clear
            </IonButton>
          )}
        </div>
        <IonContent className="ion-padding-horizontal">
          {AGE_OPTIONS.map((age) => (
            <IonItem key={age} lines="none" style={{ '--padding-start': '0' } as React.CSSProperties}>
              <IonCheckbox checked={ages.includes(age)} onIonChange={(e) => toggle(age, e.detail.checked)}>
                {age}
              </IonCheckbox>
            </IonItem>
          ))}
        </IonContent>
      </IonModal>
    </div>
  )
}
