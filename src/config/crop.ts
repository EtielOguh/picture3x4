export type AutoCropConfig = {
  /** Fração visual da altura final ocupada pela cabeça estimada. */
  headScale: number
  /** Posição vertical desejada para a linha dos olhos (0 = topo, 1 = base). */
  faceVerticalPosition: number
  /** Margem visual mínima acima da cabeça, como fração da altura final. */
  topMargin: number
  /** Alvo horizontal da pessoa (0 = esquerda, 0.5 = centro, 1 = direita). */
  horizontalCenter: number
}

/**
 * Calibração visual inicial da loja. Estes valores não representam regras
 * biométricas universais e podem ser alterados conforme o padrão desejado.
 */
export const AUTO_CROP_CONFIG: Readonly<AutoCropConfig> = Object.freeze({
  headScale: 0.44,
  faceVerticalPosition: 0.3,
  topMargin: 0.07,
  horizontalCenter: 0.5,
})
