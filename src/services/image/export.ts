import { assertThreeByFour } from './autoCrop'

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]
const PNG_RGBA_COLOR_TYPE = 6

function validateCanvas(canvas: HTMLCanvasElement) {
  assertThreeByFour({ width: canvas.width, height: canvas.height })
  const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true })
  if (!context) throw new Error('Este navegador não oferece suporte à exportação em Canvas.')

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
  let hasVisiblePixel = false
  let hasFullyTransparentPixel = false
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] > 0) hasVisiblePixel = true
    if (pixels[index] === 0) hasFullyTransparentPixel = true
    if (hasVisiblePixel && hasFullyTransparentPixel) return
  }

  if (!hasVisiblePixel) throw new Error('A composição final está vazia.')
  throw new Error('A composição não contém transparência real. Tente processar outra fotografia.')
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Não foi possível gerar o arquivo PNG.')),
      'image/png',
    )
  })
}

async function validateRgbaPng(blob: Blob) {
  if (blob.type !== 'image/png') throw new Error('O navegador não gerou um arquivo PNG válido.')
  const header = new Uint8Array(await blob.slice(0, 29).arrayBuffer())
  const validSignature = PNG_SIGNATURE.every((byte, index) => header[index] === byte)
  if (!validSignature || header.length < 26) throw new Error('O arquivo exportado não possui uma assinatura PNG válida.')

  // No cabeçalho IHDR, color type 6 representa pixels RGBA truecolor + alpha.
  if (header[25] !== PNG_RGBA_COLOR_TYPE) {
    throw new Error('O navegador não preservou o PNG no formato RGBA esperado.')
  }
}

export async function createTransparentPng(canvas: HTMLCanvasElement) {
  validateCanvas(canvas)
  const blob = await canvasToBlob(canvas)
  await validateRgbaPng(blob)
  return blob
}

export async function downloadTransparentPng(canvas: HTMLCanvasElement, fileName: string) {
  const blob = await createTransparentPng(canvas)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.download = fileName.endsWith('.png') ? fileName : `${fileName}.png`
  link.href = url
  try {
    document.body.appendChild(link)
    link.click()
  } finally {
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
