export type OutputConfig = {
  /** A largura é sempre derivada desta altura para preservar 3:4 exato. */
  targetHeight: number
  fileName: `${string}.png`
}

export const OUTPUT_CONFIG: Readonly<OutputConfig> = Object.freeze({
  targetHeight: 1800,
  fileName: 'foto-3x4.png',
})
