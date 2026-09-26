import type { ProcessedPhoto } from '../../types/photo'

export function clearCanvas(canvas: HTMLCanvasElement | null) {
  if (!canvas) return
  const context = canvas.getContext('2d')
  context?.clearRect(0, 0, canvas.width, canvas.height)
  canvas.width = 0
  canvas.height = 0
}

export function disposeProcessedPhoto(photo: ProcessedPhoto | null) {
  if (!photo) return
  clearCanvas(photo.foreground)
}
