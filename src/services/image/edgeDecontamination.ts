const clamp = (value: number) => Math.max(0, Math.min(1, value))

/**
 * Corrige a cor misturada com o antigo fundo nos pixels semitransparentes.
 * O alpha nunca é alterado: somente RGB é aproximado da borda interna.
 */
export function decontaminateTransparentEdges(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  let image = context.getImageData(0, 0, width, height)

  for (let pass = 0; pass < 2; pass += 1) {
    const source = image.data
    const output = new Uint8ClampedArray(source)

    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = (y * width + x) * 4
        const alpha = source[index + 3]
        if (alpha <= 2 || alpha >= 250) continue

        let best = -1
        let bestAlpha = alpha
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            if (offsetX === 0 && offsetY === 0) continue
            const candidate = ((y + offsetY) * width + x + offsetX) * 4
            const candidateAlpha = source[candidate + 3]
            if (candidateAlpha > bestAlpha) {
              bestAlpha = candidateAlpha
              best = candidate
            }
          }
        }

        if (best < 0 || bestAlpha - alpha < 10) continue
        const strength = clamp((bestAlpha - alpha) / 170) * 0.72
        for (let channel = 0; channel < 3; channel += 1) {
          output[index + channel] = source[index + channel] * (1 - strength) + source[best + channel] * strength
        }
      }
    }

    image = new ImageData(output, width, height)
  }

  context.putImageData(image, 0, 0)
}
