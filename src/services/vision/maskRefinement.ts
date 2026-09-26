import type { SubjectBox } from '../../types/photo'

const MAX_REFINEMENT_EDGE = 1600
const COLOR_SIGMA_SQUARED = 2 * 30 * 30

type RefinedMask = {
  canvas: HTMLCanvasElement
  subject: SubjectBox | null
  coverage: number
}

const clamp = (value: number) => Math.max(0, Math.min(1, value))

function rawMaskCanvas(data: Float32Array, width: number, height: number) {
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
    pixels.data[pixel + 3] = Math.round(clamp(data[index]) * 255)
  }
  context.putImageData(pixels, 0, 0)
  return canvas
}

function jointBilateralPass(
  alpha: Float32Array,
  colors: Uint8ClampedArray,
  width: number,
  height: number,
) {
  const output = new Float32Array(alpha.length)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      const centerAlpha = alpha[index]

      // Áreas seguramente internas ou externas não precisam ser suavizadas.
      if (centerAlpha <= 0.003 || centerAlpha >= 0.997) {
        output[index] = centerAlpha
        continue
      }

      const colorIndex = index * 4
      const red = colors[colorIndex]
      const green = colors[colorIndex + 1]
      const blue = colors[colorIndex + 2]
      let weightedAlpha = 0
      let totalWeight = 0

      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        const sampleY = Math.max(0, Math.min(height - 1, y + offsetY))
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const sampleX = Math.max(0, Math.min(width - 1, x + offsetX))
          const sampleIndex = sampleY * width + sampleX
          const sampleColor = sampleIndex * 4
          const deltaRed = red - colors[sampleColor]
          const deltaGreen = green - colors[sampleColor + 1]
          const deltaBlue = blue - colors[sampleColor + 2]
          const colorDistance = deltaRed * deltaRed + deltaGreen * deltaGreen + deltaBlue * deltaBlue
          const spatialWeight = offsetX === 0 && offsetY === 0 ? 1.35 : offsetX === 0 || offsetY === 0 ? 1 : 0.72
          const weight = spatialWeight * Math.exp(-colorDistance / COLOR_SIGMA_SQUARED)
          weightedAlpha += alpha[sampleIndex] * weight
          totalWeight += weight
        }
      }
      output[index] = weightedAlpha / totalWeight
    }
  }
  return output
}

function finalizeAlpha(raw: number, filtered: number) {
  if (raw <= 0.004 && filtered < 0.025) return 0
  if (raw >= 0.992 || filtered >= 0.997) return 1

  // Mantém sinais finos do modelo (como fios de cabelo), mas contrai o halo
  // de baixa confiança e deixa somente uma faixa curta de feathering.
  let value = filtered * 0.72 + raw * 0.28
  if (raw > 0.07 && raw < 0.52) value = Math.max(value, raw * 0.82)
  value = clamp((value - 0.018) / 0.962)
  value = value * value * (3 - 2 * value)
  return Math.pow(value, 1.045)
}

function findSubject(alpha: Float32Array, width: number, height: number, sourceWidth: number, sourceHeight: number) {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  let count = 0

  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      if (alpha[y * width + x] >= 0.42) {
        count += 1
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }
  }

  const sampledPixels = Math.ceil(width / 2) * Math.ceil(height / 2)
  const coverage = count / sampledPixels
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
    },
  }
}

export function refinePersonMask(
  source: HTMLCanvasElement,
  confidence: Float32Array,
  maskWidth: number,
  maskHeight: number,
): RefinedMask {
  const scale = Math.min(1, MAX_REFINEMENT_EDGE / Math.max(source.width, source.height))
  const width = Math.max(1, Math.round(source.width * scale))
  const height = Math.max(1, Math.round(source.height * scale))

  const guideCanvas = document.createElement('canvas')
  guideCanvas.width = width
  guideCanvas.height = height
  const guideContext = guideCanvas.getContext('2d', { willReadFrequently: true })!
  guideContext.imageSmoothingEnabled = true
  guideContext.imageSmoothingQuality = 'high'
  guideContext.drawImage(source, 0, 0, width, height)
  const colors = guideContext.getImageData(0, 0, width, height).data

  const scaledMask = document.createElement('canvas')
  scaledMask.width = width
  scaledMask.height = height
  const scaledContext = scaledMask.getContext('2d', { willReadFrequently: true })!
  scaledContext.imageSmoothingEnabled = true
  scaledContext.imageSmoothingQuality = 'high'
  scaledContext.drawImage(rawMaskCanvas(confidence, maskWidth, maskHeight), 0, 0, width, height)
  const scaledPixels = scaledContext.getImageData(0, 0, width, height)
  const rawAlpha = new Float32Array(width * height)
  for (let index = 0; index < rawAlpha.length; index += 1) rawAlpha[index] = scaledPixels.data[index * 4 + 3] / 255

  const firstPass = jointBilateralPass(rawAlpha, colors, width, height)
  const filtered = jointBilateralPass(firstPass, colors, width, height)
  const finalAlpha = new Float32Array(rawAlpha.length)
  const outputPixels = scaledContext.createImageData(width, height)

  for (let index = 0; index < finalAlpha.length; index += 1) {
    const value = finalizeAlpha(rawAlpha[index], filtered[index])
    finalAlpha[index] = value
    const pixel = index * 4
    outputPixels.data[pixel] = 255
    outputPixels.data[pixel + 1] = 255
    outputPixels.data[pixel + 2] = 255
    outputPixels.data[pixel + 3] = Math.round(value * 255)
  }
  scaledContext.putImageData(outputPixels, 0, 0)

  const { subject, coverage } = findSubject(finalAlpha, width, height, source.width, source.height)
  return { canvas: scaledMask, subject, coverage }
}
