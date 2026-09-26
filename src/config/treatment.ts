export type ConservativeTreatmentConfig = {
  maxExposureEv: number
  maxWhiteBalanceGain: number
  maxContrastAdjustment: number
  maxSaturationAdjustment: number
  maxSharpenAmount: number
  maxNoiseReduction: number
}

/** Limites técnicos deliberadamente discretos; não são parâmetros de beleza. */
export const CONSERVATIVE_TREATMENT_CONFIG: Readonly<ConservativeTreatmentConfig> = Object.freeze({
  maxExposureEv: 0.18,
  maxWhiteBalanceGain: 0.035,
  maxContrastAdjustment: 0.045,
  maxSaturationAdjustment: 0.035,
  maxSharpenAmount: 0.18,
  maxNoiseReduction: 0.08,
})
