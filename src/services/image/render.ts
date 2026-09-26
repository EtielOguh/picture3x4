import { AUTO_CROP_CONFIG, type AutoCropConfig } from '../../config/crop'
import { OUTPUT_CONFIG } from '../../config/output'
import type { FrameAdjustments, ProcessedPhoto } from '../../types/photo'
import {
  assertThreeByFour,
  calculateAutoPlacement,
  createThreeByFourSize,
  type OutputSize,
} from './autoCrop'
import { applyConservativeTreatment } from './treatment'

export const DEFAULT_OUTPUT_SIZE = createThreeByFourSize(OUTPUT_CONFIG.targetHeight)
export const OUTPUT_WIDTH = DEFAULT_OUTPUT_SIZE.width
export const OUTPUT_HEIGHT = DEFAULT_OUTPUT_SIZE.height

export const DEFAULT_ADJUSTMENTS: FrameAdjustments = {
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
}

export function renderPhoto(
  canvas: HTMLCanvasElement,
  photo: ProcessedPhoto,
  adjustments: FrameAdjustments,
  output: OutputSize = DEFAULT_OUTPUT_SIZE,
  cropConfig: AutoCropConfig = AUTO_CROP_CONFIG,
) {
  assertThreeByFour(output)
  canvas.width = output.width
  canvas.height = output.height
  const context = canvas.getContext('2d', { alpha: true })!
  context.clearRect(0, 0, output.width, output.height)

  const placement = calculateAutoPlacement(photo, output, cropConfig)
  const scale = placement.scale * adjustments.zoom
  const centerX = output.width / 2
  const centerY = output.height / 2
  const drawX = placement.x + adjustments.offsetX * output.width
  const drawY = placement.y + adjustments.offsetY * output.height

  context.save()
  context.translate(centerX, centerY)
  context.rotate((adjustments.rotation * Math.PI) / 180)
  context.translate(-centerX, -centerY)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  // A fonte é sempre o recorte segmentado de maior qualidade. O canvas já
  // renderizado nunca é reutilizado como entrada, evitando perdas cumulativas.
  context.drawImage(photo.foreground, drawX, drawY, photo.width * scale, photo.height * scale)
  context.restore()
  applyConservativeTreatment(context, output.width, output.height)
}
