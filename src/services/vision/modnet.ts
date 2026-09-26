import * as ort from 'onnxruntime-web/wasm'

const REFERENCE_EDGE = 512
const MAX_INFERENCE_EDGE = 1024
const MODEL_STRIDE = 32

export type PortraitMatte = {
  data: Float32Array
  width: number
  height: number
}

const asset = (path: string) => new URL(`${import.meta.env.BASE_URL}${path}`, window.location.href).href

let sessionPromise: Promise<ort.InferenceSession> | null = null

function loadSession() {
  if (!sessionPromise) {
    // GitHub Pages não envia os cabeçalhos de isolamento necessários para
    // SharedArrayBuffer. Uma thread mantém o WASM compatível sem enviar dados.
    ort.env.wasm.numThreads = 1
    ort.env.wasm.proxy = false
    ort.env.wasm.wasmPaths = asset('ort/')

    sessionPromise = ort.InferenceSession.create(asset('models/modnet.onnx'), {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    }).catch((error) => {
      sessionPromise = null
      throw error
    })
  }
  return sessionPromise
}

function roundToStride(value: number) {
  return Math.max(MODEL_STRIDE, Math.round(value / MODEL_STRIDE) * MODEL_STRIDE)
}

function inferenceSize(width: number, height: number) {
  const shortest = Math.min(width, height)
  const longest = Math.max(width, height)
  const scale = Math.min(REFERENCE_EDGE / shortest, MAX_INFERENCE_EDGE / longest)

  return {
    width: roundToStride(width * scale),
    height: roundToStride(height * scale),
  }
}

function createInput(source: HTMLCanvasElement, width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, 0, 0, width, height)
  const pixels = context.getImageData(0, 0, width, height).data
  const plane = width * height
  const channels = new Float32Array(plane * 3)

  // MODNet espera RGB NCHW normalizado de [0, 255] para [-1, 1].
  for (let index = 0; index < plane; index += 1) {
    const pixel = index * 4
    channels[index] = pixels[pixel] / 127.5 - 1
    channels[plane + index] = pixels[pixel + 1] / 127.5 - 1
    channels[plane * 2 + index] = pixels[pixel + 2] / 127.5 - 1
  }

  canvas.width = 0
  canvas.height = 0
  return new ort.Tensor('float32', channels, [1, 3, height, width])
}

export async function createPortraitMatte(
  source: HTMLCanvasElement,
  signal?: AbortSignal,
): Promise<PortraitMatte> {
  const session = await loadSession()
  if (signal?.aborted) throw new DOMException('Processamento cancelado.', 'AbortError')

  const size = inferenceSize(source.width, source.height)
  const input = createInput(source, size.width, size.height)
  let output: ort.Tensor | undefined

  try {
    const results = await session.run({ [session.inputNames[0]]: input })
    if (signal?.aborted) throw new DOMException('Processamento cancelado.', 'AbortError')
    output = results[session.outputNames[0]]
    if (!output || output.type !== 'float32') {
      throw new Error('O modelo local não retornou uma máscara compatível.')
    }

    const dims = output.dims
    const height = Number(dims[dims.length - 2])
    const width = Number(dims[dims.length - 1])
    const values = output.data as Float32Array
    if (!width || !height || values.length !== width * height) {
      throw new Error('O modelo local retornou uma máscara com dimensões inválidas.')
    }

    // Copia antes de liberar o tensor do runtime.
    return { data: new Float32Array(values), width, height }
  } finally {
    input.dispose()
    output?.dispose()
  }
}
