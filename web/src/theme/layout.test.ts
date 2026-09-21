import { describe, expect, it } from 'vitest'

import { unstyledButtonStyle } from './layout'

// ion-button's inner .button-native is line-height: 1 with overflow hidden by
// default; with this style's zero padding/auto height that clips descenders
// ("g", "y") off text-only buttons (feedback, 2026-09-21). See the comment on
// unstyledButtonStyle for the full mechanism.
describe('unstyledButtonStyle', () => {
  it('does not clip text that hangs below the line box', () => {
    expect(unstyledButtonStyle['--overflow']).toBe('visible')
  })
})
