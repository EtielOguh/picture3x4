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
  maxExposureEv: 0.08,
  maxWhiteBalanceGain: 0.02,
  maxContrastAdjustment: 0.02,
  maxSaturationAdjustment: 0.015,
  maxSharpenAmount: 0.05,
  maxNoiseReduction: 0.025,
})
