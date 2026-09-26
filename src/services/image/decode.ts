import { orientation as readOrientation } from 'exifr'

const MAX_SOURCE_EDGE = 4096

function orientedSize(width: number, height: number, orientation: number) {
  return orientation >= 5 && orientation <= 8
    ? { width: height, height: width }
    : { width, height }
}

function applyOrientation(
  context: CanvasRenderingContext2D,
  orientation: number,
  width: number,
  height: number,
) {
  const matrices: Record<number, [number, number, number, number, number, number]> = {
    2: [-1, 0, 0, 1, width, 0],
    3: [-1, 0, 0, -1, width, height],
    4: [1, 0, 0, -1, 0, height],
    5: [0, 1, 1, 0, 0, 0],
    6: [0, 1, -1, 0, height, 0],
    7: [0, -1, -1, 0, height, width],
    8: [0, -1, 1, 0, 0, width],
  }

  const matrix = matrices[orientation]
  if (matrix) context.transform(...matrix)
}

export async function decodeOrientedImage(file: File): Promise<HTMLCanvasElement> {
  let exifOrientation = 1
  try {
    exifOrientation = (await readOrientation(file)) ?? 1
  } catch {
    // Arquivos sem EXIF são tratados com a orientação padrão.
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'none' })
  } catch {
    bitmap = await createImageBitmap(file)
    exifOrientation = 1
  }

  const natural = orientedSize(bitmap.width, bitmap.height, exifOrientation)
  const scale = Math.min(1, MAX_SOURCE_EDGE / Math.max(natural.width, natural.height))
  const outputWidth = Math.max(1, Math.round(natural.width * scale))
  const outputHeight = Math.max(1, Math.round(natural.height * scale))
  const sourceScale = exifOrientation >= 5 && exifOrientation <= 8
    ? outputHeight / bitmap.width
    : outputWidth / bitmap.width

  const canvas = document.createElement('canvas')
  canvas.width = outputWidth
  canvas.height = outputHeight
  const context = canvas.getContext('2d', { alpha: true })
  if (!context) throw new Error('Este navegador não oferece suporte ao Canvas 2D.')

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.scale(sourceScale, sourceScale)
  applyOrientation(context, exifOrientation, bitmap.width, bitmap.height)
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  return canvas
}
