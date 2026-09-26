import type { AutoCropConfig } from '../../config/crop'
import type { DetectedFace, FaceBox, ProcessedPhoto } from '../../types/photo'

export type OutputSize = {
  width: number
  height: number
}

export type AutoPlacement = {
  scale: number
  x: number
  y: number
}

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value))

export function createThreeByFourSize(targetHeight: number): OutputSize {
  const height = Math.max(4, Math.round(targetHeight / 4) * 4)
  return { width: (height / 4) * 3, height }
}

export function assertThreeByFour(size: OutputSize) {
  if (!Number.isInteger(size.width) || !Number.isInteger(size.height) || size.width * 4 !== size.height * 3) {
    throw new Error('A resolução de saída deve ter proporção exata 3:4 (largura/altura = 0,75).')
  }
}

function validateConfig(config: AutoCropConfig) {
  if (config.headScale <= 0 || config.headScale > 1) throw new Error('headScale deve estar entre 0 e 1.')
  if (config.faceVerticalPosition <= 0 || config.faceVerticalPosition >= 1) throw new Error('faceVerticalPosition deve estar entre 0 e 1.')
  if (config.topMargin < 0 || config.topMargin >= 0.5) throw new Error('topMargin deve estar entre 0 e 0,5.')
  if (config.faceVerticalPosition <= config.topMargin) throw new Error('faceVerticalPosition deve ficar abaixo de topMargin.')
  if (config.horizontalCenter < 0 || config.horizontalCenter > 1) throw new Error('horizontalCenter deve estar entre 0 e 1.')
}

function estimateHead(face: DetectedFace, subject: FaceBox, photoWidth: number, photoHeight: number): FaceBox {
  const box = face.box
  const centerX = face.eyeCenter?.x ?? box.x + box.width / 2
  const visualTop = box.y - box.height * 0.32
  const earliestPlausibleTop = box.y - box.height * 0.62
  const segmentedTop = clamp(subject.y, earliestPlausibleTop, visualTop)
  const top = clamp(Math.min(visualTop, segmentedTop), 0, photoHeight)
  const bottom = clamp(box.y + box.height * 1.18, top + 1, photoHeight)

  const earSpan = face.leftEar && face.rightEar
    ? Math.abs(face.rightEar.x - face.leftEar.x) * 1.16
    : 0
  const width = Math.min(photoWidth, Math.max(box.width * 1.28, earSpan))
  return {
    x: clamp(centerX - width / 2, 0, Math.max(0, photoWidth - width)),
    y: top,
    width,
    height: bottom - top,
  }
}

function placementWithoutFace(
  photo: ProcessedPhoto,
  output: OutputSize,
  config: AutoCropConfig,
): AutoPlacement {
  const subjectScale = Math.min(
    (output.width * 0.9) / photo.subject.width,
    (output.height * (1 - config.topMargin)) / photo.subject.height,
  )
  const scale = Math.max(0.01, subjectScale)
  const subjectCenter = photo.subject.x + photo.subject.width / 2
  return {
    scale,
    x: output.width * config.horizontalCenter - subjectCenter * scale,
    y: output.height * config.topMargin - photo.subject.y * scale,
  }
}

export function calculateAutoPlacement(
  photo: ProcessedPhoto,
  output: OutputSize,
  config: AutoCropConfig,
): AutoPlacement {
  assertThreeByFour(output)
  validateConfig(config)
  if (!photo.face) return placementWithoutFace(photo, output, config)

  const head = estimateHead(photo.face, photo.subject, photo.width, photo.height)
  const eyeAnchor = photo.face.eyeCenter ?? {
    x: photo.face.box.x + photo.face.box.width / 2,
    y: photo.face.box.y + photo.face.box.height * 0.43,
  }

  const scaleForHead = (output.height * config.headScale) / head.height
  const anchorDistance = Math.max(1, eyeAnchor.y - head.y)
  const scaleForVerticalAnchors = (
    output.height * (config.faceVerticalPosition - config.topMargin)
  ) / anchorDistance
  const visuallyBalancedScale = scaleForHead * 0.68 + scaleForVerticalAnchors * 0.32

  const headWidthLimit = (output.width * 0.9) / head.width
  const bodyWidthLimit = (output.width * 1.55) / photo.subject.width
  const bodyInfluencedLimit = Math.max(scaleForHead * 0.82, bodyWidthLimit)
  const scale = Math.max(0.01, Math.min(visuallyBalancedScale, headWidthLimit, bodyInfluencedLimit))

  const faceCenterX = eyeAnchor.x
  const bodyCenterX = photo.subject.x + photo.subject.width / 2
  const combinedCenterX = faceCenterX * 0.78 + bodyCenterX * 0.22
  let x = output.width * config.horizontalCenter - combinedCenterX * scale

  // Mantém a cabeça dentro da área útil sem distorcer nem alterar o scale X/Y.
  const sideMargin = output.width * 0.045
  const headLeft = head.x * scale + x
  const headRight = (head.x + head.width) * scale + x
  if (headLeft < sideMargin) x += sideMargin - headLeft
  if (headRight > output.width - sideMargin) x -= headRight - (output.width - sideMargin)

  const yFromEyes = output.height * config.faceVerticalPosition - eyeAnchor.y * scale
  const yFromTopMargin = output.height * config.topMargin - head.y * scale
  let y = yFromEyes * 0.72 + yFromTopMargin * 0.28
  const currentTop = head.y * scale + y
  if (currentTop < output.height * config.topMargin) {
    y += output.height * config.topMargin - currentTop
  }

  return { scale, x, y }
}
