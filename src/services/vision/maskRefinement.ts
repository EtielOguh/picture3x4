import type { DetectedFace, SubjectBox } from '../../types/photo'

const MAX_MASK_EDGE = 2400
const SEMANTIC_DILATION_RADIUS = 0
const COMPONENT_THRESHOLD = 0.055

type RefinedMask = {
  canvas: HTMLCanvasElement
  subject: SubjectBox | null
  coverage: number
}

const clamp = (value: number) => Math.max(0, Math.min(1, value))

function smoothstep(minimum: number, maximum: number, value: number) {
  const normalized = clamp((value - minimum) / (maximum - minimum))
  return normalized * normalized * (3 - 2 * normalized)
}

function resampleMask(data: Float32Array, width: number, height: number, targetWidth: number, targetHeight: number) {
  const source = document.createElement('canvas')
  source.width = width
  source.height = height
  const sourceContext = source.getContext('2d')!
  const sourcePixels = sourceContext.createImageData(width, height)

  for (let index = 0; index < data.length; index += 1) {
    const pixel = index * 4
    sourcePixels.data[pixel] = 255
    sourcePixels.data[pixel + 1] = 255
    sourcePixels.data[pixel + 2] = 255
    sourcePixels.data[pixel + 3] = Math.round(clamp(data[index]) * 255)
  }
  sourceContext.putImageData(sourcePixels, 0, 0)

  const target = document.createElement('canvas')
  target.width = targetWidth
  target.height = targetHeight
  const targetContext = target.getContext('2d', { willReadFrequently: true })!
  targetContext.imageSmoothingEnabled = true
  targetContext.imageSmoothingQuality = 'high'
  targetContext.drawImage(source, 0, 0, targetWidth, targetHeight)
  source.width = 0
  source.height = 0

  const pixels = targetContext.getImageData(0, 0, targetWidth, targetHeight).data
  const alpha = new Float32Array(targetWidth * targetHeight)
  for (let index = 0; index < alpha.length; index += 1) alpha[index] = pixels[index * 4 + 3] / 255
  target.width = 0
  target.height = 0
  return alpha
}

function dilateMask(alpha: Float32Array, width: number, height: number, radius: number) {
  const horizontal = new Float32Array(alpha.length)
  const output = new Float32Array(alpha.length)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let maximum = 0
      for (let offset = -radius; offset <= radius; offset += 1) {
        maximum = Math.max(maximum, alpha[y * width + Math.max(0, Math.min(width - 1, x + offset))])
      }
      horizontal[y * width + x] = maximum
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let maximum = 0
      for (let offset = -radius; offset <= radius; offset += 1) {
        maximum = Math.max(maximum, horizontal[Math.max(0, Math.min(height - 1, y + offset)) * width + x])
      }
      output[y * width + x] = maximum
    }
  }
  return output
}

function tightenAlpha(value: number) {
  if (value <= 0.035) return 0
  if (value >= 0.9) return 1
  return smoothstep(0.035, 0.9, value)
}

function fuseMasks(matte: Float32Array, semantic: Float32Array, width: number, height: number) {
  const support = dilateMask(semantic, width, height, SEMANTIC_DILATION_RADIUS)
  const fused = new Float32Array(matte.length)

  for (let index = 0; index < fused.length; index += 1) {
    // A máscara semântica decide se a região pode pertencer a uma pessoa;
    // o MODNet continua responsável pelo detalhe fino dentro dessa região.
    const gate = smoothstep(0.32, 0.72, support[index])
    fused[index] = tightenAlpha(clamp(matte[index]) * gate)
  }
  return fused
}

function applyPortraitShapePrior(
  alpha: Float32Array,
  width: number,
  height: number,
  sourceWidth: number,
  sourceHeight: number,
  face: DetectedFace | null,
) {
  if (!face) return alpha

  const faceWidth = face.box.width
  const faceHeight = face.box.height
  const centerX = face.eyeCenter?.x ?? face.box.x + faceWidth / 2
  const hairTop = face.box.y - faceHeight * 0.48
  const shoulderStart = face.box.y + faceHeight * 0.95
  const shoulderEnd = face.box.y + faceHeight * 1.65
  const feather = faceWidth * 0.025
  const faceSideFeather = faceWidth * 0.012
  const neckHalfWidth = faceWidth * 0.39
  const shoulderSlopeLength = faceWidth * 1.05
  const shoulderFeather = faceHeight * 0.012

  for (let y = 0; y < height; y += 1) {
    const sourceY = y / height * sourceHeight
    let verticalGate = 1
    if (sourceY < hairTop + faceHeight * 0.01) {
      verticalGate = smoothstep(hairTop - faceHeight * 0.015, hairTop + faceHeight * 0.01, sourceY)
    }

    if (sourceY > shoulderEnd || verticalGate === 0) {
      if (verticalGate === 0) {
        const row = y * width
        for (let x = 0; x < width; x += 1) alpha[row + x] = 0
      }
      continue
    }

    const progress = sourceY <= shoulderStart
      ? 0
      : clamp((sourceY - shoulderStart) / (shoulderEnd - shoulderStart))
    const halfWidth = sourceY <= shoulderStart
      ? faceWidth * 0.76
      : faceWidth * (0.48 + progress * 0.88)
    const row = y * width

    for (let x = 0; x < width; x += 1) {
      const sourceX = x / width * sourceWidth
      const distance = Math.abs(sourceX - centerX)
      const horizontalGate = 1 - smoothstep(halfWidth, halfWidth + feather, distance)
      let faceSideGate = 1
      const sideStart = face.box.y + faceHeight * 0.12
      const sideEnd = face.box.y + faceHeight
      if (sourceY >= sideStart && sourceY <= sideEnd) {
        const sideProgress = clamp((sourceY - sideStart) / (sideEnd - sideStart))
        const leftEar = (face.leftEar?.x ?? centerX - faceWidth * 0.5) - faceWidth * 0.045
        const rightEar = (face.rightEar?.x ?? centerX + faceWidth * 0.5) + faceWidth * 0.045
        const leftBoundary = sideProgress < 0.3
          ? centerX - faceWidth * 0.66
            + (leftEar - (centerX - faceWidth * 0.66)) * (sideProgress / 0.3)
          : leftEar
            + (centerX - faceWidth * 0.4 - leftEar) * ((sideProgress - 0.3) / 0.7)
        const rightBoundary = sideProgress < 0.3
          ? centerX + faceWidth * 0.66
            + (rightEar - (centerX + faceWidth * 0.66)) * (sideProgress / 0.3)
          : rightEar
            + (centerX + faceWidth * 0.4 - rightEar) * ((sideProgress - 0.3) / 0.7)
        faceSideGate = smoothstep(leftBoundary - faceSideFeather, leftBoundary + faceSideFeather, sourceX)
          * (1 - smoothstep(rightBoundary - faceSideFeather, rightBoundary + faceSideFeather, sourceX))
      }
      let shoulderGate = 1
      if (distance > neckHalfWidth && sourceY > face.box.y + faceHeight * 0.78) {
        const shoulderProgress = clamp((distance - neckHalfWidth) / shoulderSlopeLength)
        const shoulderBoundary = face.box.y
          + faceHeight * (1.02 + 0.62 * shoulderProgress ** 0.85)
        shoulderGate = smoothstep(
          shoulderBoundary - shoulderFeather,
          shoulderBoundary + shoulderFeather,
          sourceY,
        )
      }
      alpha[row + x] *= horizontalGate * faceSideGate * verticalGate * shoulderGate
    }
  }
  return alpha
}

function keepLargestComponent(alpha: Float32Array, width: number, height: number) {
  const visited = new Uint8Array(alpha.length)
  const queue = new Int32Array(alpha.length)
  let largestSeed = -1
  let largestSize = 0

  for (let seed = 0; seed < alpha.length; seed += 1) {
    if (visited[seed] || alpha[seed] < COMPONENT_THRESHOLD) continue
    let head = 0
    let tail = 0
    let size = 0
    queue[tail++] = seed
    visited[seed] = 1

    while (head < tail) {
      const index = queue[head++]
      size += 1
      const x = index % width
      const y = Math.floor(index / width)
      const neighbors = [
        x > 0 ? index - 1 : -1,
        x + 1 < width ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y + 1 < height ? index + width : -1,
      ]
      for (const neighbor of neighbors) {
        if (neighbor < 0 || visited[neighbor] || alpha[neighbor] < COMPONENT_THRESHOLD) continue
        visited[neighbor] = 1
        queue[tail++] = neighbor
      }
    }

    if (size > largestSize) {
      largestSize = size
      largestSeed = seed
    }
  }

  if (largestSeed < 0) return alpha
  const keep = new Uint8Array(alpha.length)
  let head = 0
  let tail = 0
  queue[tail++] = largestSeed
  keep[largestSeed] = 1

  while (head < tail) {
    const index = queue[head++]
    const x = index % width
    const y = Math.floor(index / width)
    const neighbors = [
      x > 0 ? index - 1 : -1,
      x + 1 < width ? index + 1 : -1,
      y > 0 ? index - width : -1,
      y + 1 < height ? index + width : -1,
    ]
    for (const neighbor of neighbors) {
      if (neighbor < 0 || keep[neighbor] || alpha[neighbor] < COMPONENT_THRESHOLD) continue
      keep[neighbor] = 1
      queue[tail++] = neighbor
    }
  }

  for (let index = 0; index < alpha.length; index += 1) {
    if (!keep[index]) alpha[index] = 0
  }
  return alpha
}

function createMaskCanvas(data: Float32Array, width: number, height: number) {
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
    pixels.data[pixel + 3] = Math.round(data[index] * 255)
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
  semantic: Float32Array,
  semanticWidth: number,
  semanticHeight: number,
  face: DetectedFace | null,
): RefinedMask {
  const semanticAtMatteSize = resampleMask(
    semantic,
    semanticWidth,
    semanticHeight,
    matteWidth,
    matteHeight,
  )
  const fused = keepLargestComponent(
    applyPortraitShapePrior(
      fuseMasks(matte, semanticAtMatteSize, matteWidth, matteHeight),
      matteWidth,
      matteHeight,
      source.width,
      source.height,
      face,
    ),
    matteWidth,
    matteHeight,
  )

  const scale = Math.min(1, MAX_MASK_EDGE / Math.max(source.width, source.height))
  const width = Math.max(1, Math.round(source.width * scale))
  const height = Math.max(1, Math.round(source.height * scale))
  const raw = createMaskCanvas(fused, matteWidth, matteHeight)
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
