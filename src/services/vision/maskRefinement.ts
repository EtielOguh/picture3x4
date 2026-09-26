import type { SubjectBox } from '../../types/photo'

const MAX_MASK_EDGE = 2048

type RefinedMask = {
  canvas: HTMLCanvasElement
  subject: SubjectBox | null
  coverage: number
}

const clamp = (value: number) => Math.max(0, Math.min(1, value))

function refineAlpha(value: number) {
  const alpha = clamp(value)
  if (alpha <= 0.012) return 0
  if (alpha >= 0.992) return 1

  // O MODNet já entrega um matte contínuo. Apenas encurta as caudas de baixa
  // confiança; não há blur nem erosão que apague fios de cabelo.
  const normalized = clamp((alpha - 0.012) / 0.98)
  return Math.pow(normalized, 1.025)
}

function maskCanvas(data: Float32Array, width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')!
  const pixels = context.createImageData(width, height)

  for (let index = 0; index < data.length; index += 1) {
    const pixel = index * 4
    pixels.data[pixel] = 255
    pixels.data[pixel + 1] = 255
    pixels.data[pixel + 2] = 255
    pixels.data[pixel + 3] = Math.round(refineAlpha(data[index]) * 255)
  }
  context.putImageData(pixels, 0, 0)
  return canvas
}

function analyzeMask(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
  sourceWidth: number,
  sourceHeight: number,
) {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  let count = 0
  let samples = 0

  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      samples += 1
      if (alpha[(y * width + x) * 4 + 3] < 107) continue
      count += 1
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  const coverage = samples ? count / samples : 0
  if (maxX < minX || maxY < minY) return { subject: null, coverage }

  const scaleX = sourceWidth / width
  const scaleY = sourceHeight / height
  return {
    coverage,
    subject: {
      x: minX * scaleX,
      y: minY * scaleY,
      width: Math.max(1, (maxX - minX + 1) * scaleX),
      height: Math.max(1, (maxY - minY + 1) * scaleY),
    } satisfies SubjectBox,
  }
}

export function refinePersonMask(
  source: HTMLCanvasElement,
  matte: Float32Array,
  matteWidth: number,
  matteHeight: number,
): RefinedMask {
  const scale = Math.min(1, MAX_MASK_EDGE / Math.max(source.width, source.height))
  const width = Math.max(1, Math.round(source.width * scale))
  const height = Math.max(1, Math.round(source.height * scale))
  const raw = maskCanvas(matte, matteWidth, matteHeight)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(raw, 0, 0, width, height)
  raw.width = 0
  raw.height = 0

  const pixels = context.getImageData(0, 0, width, height)
  const { subject, coverage } = analyzeMask(pixels.data, width, height, source.width, source.height)
  return { canvas, subject, coverage }
}
