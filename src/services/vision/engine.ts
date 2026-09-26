import {
  FaceDetector,
  FilesetResolver,
  ImageSegmenter,
  type Detection,
} from '@mediapipe/tasks-vision'
import type { DetectedFace, Point, ProcessedPhoto, ProcessingStep } from '../../types/photo'
import { decodeOrientedImage } from '../image/decode'
import { clearCanvas } from '../image/dispose'
import { refinePersonMask } from './maskRefinement'

const MAX_INFERENCE_EDGE = 1024
const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`

let enginePromise: Promise<{ faceDetector: FaceDetector; segmenter: ImageSegmenter }> | null = null

async function loadEngine() {
  if (!enginePromise) {
    enginePromise = (async () => {
      const files = await FilesetResolver.forVisionTasks(asset('wasm'))
      const [faceDetector, segmenter] = await Promise.all([
        FaceDetector.createFromOptions(files, {
          baseOptions: {
            modelAssetPath: asset('models/blaze_face_short_range.tflite'),
            delegate: 'CPU',
          },
          runningMode: 'IMAGE',
          minDetectionConfidence: 0.45,
        }),
        ImageSegmenter.createFromOptions(files, {
          baseOptions: {
            modelAssetPath: asset('models/selfie_segmenter.tflite'),
            delegate: 'CPU',
          },
          runningMode: 'IMAGE',
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        }),
      ])
      return { faceDetector, segmenter }
    })().catch((error) => {
      enginePromise = null
      throw error
    })
  }
  return enginePromise
}

function inferenceCanvas(source: HTMLCanvasElement) {
  const scale = Math.min(1, MAX_INFERENCE_EDGE / Math.max(source.width, source.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(source.width * scale))
  canvas.height = Math.max(1, Math.round(source.height * scale))
  const context = canvas.getContext('2d')!
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

function bestFace(
  detections: Detection[],
  scaleX: number,
  scaleY: number,
  sourceWidth: number,
  sourceHeight: number,
): DetectedFace | null {
  const detection = detections
    .filter((item) => item.boundingBox)
    .sort((a, b) => (b.boundingBox!.width * b.boundingBox!.height) - (a.boundingBox!.width * a.boundingBox!.height))[0]

  if (!detection?.boundingBox) return null
  const box = detection.boundingBox
  const point = (index: number): Point | undefined => {
    const keypoint = detection.keypoints[index]
    return keypoint ? { x: keypoint.x * sourceWidth, y: keypoint.y * sourceHeight } : undefined
  }
  const firstEye = point(0)
  const secondEye = point(1)
  const eyes = firstEye && secondEye ? [firstEye, secondEye].sort((a, b) => a.x - b.x) : []
  const firstEar = point(4)
  const secondEar = point(5)
  const ears = firstEar && secondEar ? [firstEar, secondEar].sort((a, b) => a.x - b.x) : []

  return {
    box: {
      x: box.originX * scaleX,
      y: box.originY * scaleY,
      width: box.width * scaleX,
      height: box.height * scaleY,
    },
    leftEye: eyes[0],
    rightEye: eyes[1],
    eyeCenter: eyes.length === 2 ? {
      x: (eyes[0].x + eyes[1].x) / 2,
      y: (eyes[0].y + eyes[1].y) / 2,
    } : undefined,
    leftEar: ears[0],
    rightEar: ears[1],
  }
}

export async function processPhoto(
  file: File,
  onStep: (step: ProcessingStep) => void,
  signal?: AbortSignal,
): Promise<ProcessedPhoto> {
  if (!file.type.startsWith('image/')) throw new Error('Selecione um arquivo de imagem válido.')
  if (file.size > 20 * 1024 * 1024) throw new Error('A imagem deve ter no máximo 20 MB.')

  const checkCancelled = () => {
    if (signal?.aborted) throw new DOMException('Processamento cancelado.', 'AbortError')
  }
  let source: HTMLCanvasElement | null = null
  let input: HTMLCanvasElement | null = null
  let refinedCanvas: HTMLCanvasElement | null = null

  try {
    checkCancelled()
    onStep('Lendo a fotografia…')
    source = await decodeOrientedImage(file)
    checkCancelled()
    onStep('Corrigindo a orientação…')
    input = inferenceCanvas(source)

    onStep('Carregando os modelos locais…')
    const { faceDetector, segmenter } = await loadEngine()
    checkCancelled()
    onStep('Detectando o rosto…')
    const faceResult = faceDetector.detect(input)
    const face = bestFace(
      faceResult.detections,
      source.width / input.width,
      source.height / input.height,
      source.width,
      source.height,
    )

    checkCancelled()
    onStep('Removendo o fundo…')
    const segmentation = segmenter.segment(input)
    const mask = segmentation.confidenceMasks?.[0]
    if (!mask) throw new Error('Não foi possível identificar a pessoa. Tente outra fotografia com o rosto e os ombros visíveis.')
    const confidence = mask.getAsFloat32Array()
    onStep('Refinando cabelo e contornos…')
    let refined: ReturnType<typeof refinePersonMask>
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      checkCancelled()
      refined = refinePersonMask(source, confidence, mask.width, mask.height)
      refinedCanvas = refined.canvas
    } finally {
      mask.close()
    }

    if (!refined.subject || refined.coverage < 0.012 || refined.coverage > 0.985) {
      throw new Error('A segmentação não encontrou uma pessoa com segurança. Tente outra foto com melhor iluminação e contraste com o fundo.')
    }

    checkCancelled()
    const foreground = document.createElement('canvas')
    foreground.width = source.width
    foreground.height = source.height
    const context = foreground.getContext('2d', { alpha: true })!
    context.drawImage(source, 0, 0)
    context.globalCompositeOperation = 'destination-in'
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(refined.canvas, 0, 0, source.width, source.height)
    context.globalCompositeOperation = 'source-over'

    onStep('Preparando a foto 3x4…')
    return { foreground, face, subject: refined.subject, width: source.width, height: source.height }
  } finally {
    clearCanvas(source)
    clearCanvas(input)
    clearCanvas(refinedCanvas)
  }
}
