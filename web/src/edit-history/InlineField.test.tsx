import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { InlineField } from './InlineField'

describe('InlineField', () => {
  it('renders nothing when not editing and there is no value (matches every optional field convention elsewhere in this app)', () => {
    const { container } = render(<InlineField editing={false} hasValue={false} readContent="ignored" editContent="ignored" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the read content when not editing and a value is present', () => {
    render(<InlineField editing={false} hasValue readContent="Hawthorne Scholastic Academy Turf" editContent={<input />} />)
    expect(screen.getByText('Hawthorne Scholastic Academy Turf')).toBeInTheDocument()
  })

  it('renders the edit content while editing, even with no current value — a member filling in a previously-empty field', () => {
    render(<InlineField editing hasValue={false} readContent={null} editContent={<input placeholder="Address" />} />)
    expect(screen.getByPlaceholderText('Address')).toBeInTheDocument()
  })

  it('applies a red-accent highlight style when highlighted, for the history-detail "what changed" view', () => {
    const { container } = render(<InlineField editing={false} hasValue readContent="Changed value" editContent={<input />} highlighted />)
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.style.borderLeft).toContain('var(--ion-color-danger)')
  })

  it('does not apply the highlight style by default', () => {
    const { container } = render(<InlineField editing={false} hasValue readContent="Unchanged value" editContent={<input />} />)
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.style.borderLeft).toBe('')
  })
})
