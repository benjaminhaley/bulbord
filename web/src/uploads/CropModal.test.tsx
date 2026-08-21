import { render, screen, waitFor } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CropModal } from './CropModal'

// Regression coverage for a real onboarding-blocking bug found 2026-08-21 on
// Safari/iOS (reported as "no way to actually submit the picture" — see
// CropModal.tsx's own comment for the full mechanism): this modal's <img>
// can fire 'load' before the browser has flushed layout for it (IonModal's
// open animation still in flight), so a single getBoundingClientRect() read
// right on 'load' can legitimately come back 0x0. The fix retries on the
// next animation frame rather than computing a crop against a degenerate
// box — this test locks that retry behavior in, since the real WebKit race
// itself isn't reproducible in jsdom (no real layout engine).
describe('CropModal', () => {
  it('keeps "Use Photo" disabled while the image has not been laid out yet, and enables it once it has', async () => {
    const rects = [{ width: 0, height: 0 }, { width: 0, height: 0 }, { width: 300, height: 400 }]
    const getBoundingClientRect = vi
      .spyOn(HTMLImageElement.prototype, 'getBoundingClientRect')
      .mockImplementation(() => (rects.length > 1 ? rects.shift() : rects[0]) as DOMRect)

    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' })
    render(<CropModal file={file} onCancel={() => {}} onCropped={() => {}} />)

    const usePhotoButton = await screen.findByText('Use Photo')
    const img = document.querySelector('.ReactCrop img') as HTMLImageElement
    fireEvent.load(img)

    // Still mid-retry (bounding rect still reads 0x0) — must not enable yet.
    expect(usePhotoButton.closest('ion-button')).toHaveAttribute('disabled')

    await waitFor(() => expect(usePhotoButton.closest('ion-button')).not.toHaveAttribute('disabled'))

    getBoundingClientRect.mockRestore()
  })
})
