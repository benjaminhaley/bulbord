import type { Meta, StoryObj } from '@storybook/react-vite'

import { StyleGuide } from './StyleGuide'

const meta = {
  title: 'Style Guide',
  component: StyleGuide,
  tags: ['ai-generated'],
} satisfies Meta<typeof StyleGuide>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
