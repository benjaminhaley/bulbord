import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useState } from 'react'

import { CropModal } from './CropModal'

// A generated placeholder photo (no bundled test asset exists in this repo)
// so the story is fully self-contained — a colored canvas with some shapes,
// enough to see the crop/pan/zoom behavior working against a real image.
function makeTestPhotoFile(): Promise<File> {
  const canvas = document.createElement('canvas')
  canvas.width = 800
  canvas.height = 500
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#3b82f6'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#fbbf24'
  ctx.beginPath()
  ctx.arc(250, 250, 150, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ef4444'
  ctx.fillRect(550, 100, 200, 300)
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(new File([blob!], 'test-photo.png', { type: 'image/png' })), 'image/png')
  })
}

function CropModalHarness() {
  const [file, setFile] = useState<File | null>(null)
  useEffect(() => {
    void makeTestPhotoFile().then(setFile)
  }, [])
  return <CropModal file={file} onCancel={() => {}} onCropped={() => {}} />
}

const meta = {
  component: CropModalHarness,
  tags: ['ai-generated'],
} satisfies Meta<typeof CropModalHarness>

export default meta
type Story = StoryObj<typeof meta>

export const Open: Story = {}
