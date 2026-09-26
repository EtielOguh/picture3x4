import {
  CONSERVATIVE_TREATMENT_CONFIG,
  type ConservativeTreatmentConfig,
} from '../../config/treatment'

type Analysis = {
  exposureGain: number
  whiteBalance: [number, number, number]
  blackPoint: number
  whitePoint: number
  levelsBlend: number
  contrast: number
  saturation: number
  noiseReduction: number
}

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value))
const luminance = (red: number, green: number, blue: number) => red * 0.2126 + green * 0.7152 + blue * 0.0722

function percentile(histogram: Uint32Array, total: number, target: number) {
  const threshold = total * target
  let accumulated = 0
  for (let index = 0; index < histogram.length; index += 1) {
    accumulated += histogram[index]
    if (accumulated >= threshold) return index / 255
  }
  return 1
}

function estimateNoise(data: Uint8ClampedArray, width: number, height: number) {
  let difference = 0
  let samples = 0

  for (let y = 2; y < height - 2; y += 4) {
    for (let x = 2; x < width - 2; x += 4) {
      const index = (y * width + x) * 4
      if (data[index + 3] < 245) continue
      const center = luminance(data[index], data[index + 1], data[index + 2])
      const neighbors = [index - 4, index + 4, index - width * 4, index + width * 4]
      const values = neighbors.map((neighbor) => luminance(data[neighbor], data[neighbor + 1], data[neighbor + 2]))
      const maximumDelta = Math.max(...values.map((value) => Math.abs(value - center)))
      if (maximumDelta > 18) continue
      difference += Math.abs(center - values.reduce((sum, value) => sum + value, 0) / values.length)
      samples += 1
    }
  }
  return samples ? difference / samples : 0
}

function analyze(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  config: ConservativeTreatmentConfig,
): Analysis {
  const histogram = new Uint32Array(256)
  let redTotal = 0
  let greenTotal = 0
  let blueTotal = 0
  let neutralSamples = 0
  let saturationTotal = 0
  let samples = 0

  for (let pixel = 0; pixel < width * height; pixel += 3) {
    const index = pixel * 4
    const alpha = data[index + 3]
    if (alpha < 160) continue
    const red = data[index]
    const green = data[index + 1]
    const blue = data[index + 2]
    const light = luminance(red, green, blue)
    histogram[Math.round(light)] += 1
    const maximum = Math.max(red, green, blue)
    const minimum = Math.min(red, green, blue)
    const chroma = (maximum - minimum) / 255
    saturationTotal += chroma
    samples += 1

    if (light > 48 && light < 224 && chroma < 0.24) {
      redTotal += red
      greenTotal += green
      blueTotal += blue
      neutralSamples += 1
    }
  }

  if (!samples) {
    return {
      exposureGain: 1,
      whiteBalance: [1, 1, 1],
      blackPoint: 0,
      whitePoint: 1,
      levelsBlend: 0,
      contrast: 1,
      saturation: 1,
      noiseReduction: 0,
    }
  }

  const median = percentile(histogram, samples, 0.5)
  const low = percentile(histogram, samples, 0.02)
  const p10 = percentile(histogram, samples, 0.1)
  const p90 = percentile(histogram, samples, 0.9)
  const high = percentile(histogram, samples, 0.995)
  let exposureEv = clamp(Math.log2(0.47 / Math.max(0.08, median)), -config.maxExposureEv, config.maxExposureEv)
  if (exposureEv > 0 && high > 0.92) {
    const highlightHeadroom = clamp((0.99 - high) / 0.07, 0.12, 1)
    exposureEv *= highlightHeadroom
  }

  let whiteBalance: [number, number, number] = [1, 1, 1]
  if (neutralSamples > 100) {
    const means = [redTotal / neutralSamples, greenTotal / neutralSamples, blueTotal / neutralSamples]
    const target = (means[0] + means[1] + means[2]) / 3
    whiteBalance = means.map((mean) => clamp(target / Math.max(1, mean), 1 - config.maxWhiteBalanceGain, 1 + config.maxWhiteBalanceGain)) as [number, number, number]
  }

  const dynamicRange = p90 - p10
  const contrastAdjustment = dynamicRange < 0.48
    ? config.maxContrastAdjustment * clamp((0.48 - dynamicRange) / 0.25, 0, 1)
    : dynamicRange > 0.76
      ? -config.maxContrastAdjustment * 0.45
      : 0
  const averageSaturation = saturationTotal / samples
  const saturationAdjustment = averageSaturation < 0.2
    ? config.maxSaturationAdjustment * clamp((0.2 - averageSaturation) / 0.16, 0, 1)
    : averageSaturation > 0.46
      ? -config.maxSaturationAdjustment * clamp((averageSaturation - 0.46) / 0.2, 0, 1)
      : 0
  const noise = estimateNoise(data, width, height)

  return {
    exposureGain: 2 ** exposureEv,
    whiteBalance,
    blackPoint: Math.min(low * 0.2, 0.025),
    whitePoint: Math.max(0.965, 1 - (1 - high) * 0.18),
    levelsBlend: 0.08,
    contrast: 1 + contrastAdjustment,
    saturation: 1 + saturationAdjustment,
    noiseReduction: clamp((noise - 1.4) / 20, 0, config.maxNoiseReduction),
  }
}

function reduceNoise(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  strength: number,
) {
  if (strength <= 0.002) return data
  const output = new Uint8ClampedArray(data)

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4
      if (data[index + 3] < 248) continue
      const neighbors = [index - 4, index + 4, index - width * 4, index + width * 4]
      if (neighbors.some((neighbor) => data[neighbor + 3] < 248)) continue
      const centerLight = luminance(data[index], data[index + 1], data[index + 2])
      const neighborLights = neighbors.map((neighbor) => luminance(data[neighbor], data[neighbor + 1], data[neighbor + 2]))
      if (Math.max(...neighborLights.map((value) => Math.abs(value - centerLight))) > 16) continue

      for (let channel = 0; channel < 3; channel += 1) {
        const average = neighbors.reduce((sum, neighbor) => sum + data[neighbor + channel], 0) / 4
        output[index + channel] = data[index + channel] * (1 - strength) + average * strength
      }
    }
  }
  return output
}

function srgbToLinear(value: number) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(value: number) {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055
}

function toneChannel(value: number, gain: number, analysis: Analysis) {
  let adjusted = srgbToLinear(value) * analysis.exposureGain * gain
  if (adjusted > 0.9) adjusted = 0.9 + 0.1 * (1 - Math.exp(-(adjusted - 0.9) / 0.1))
  adjusted = clamp(linearToSrgb(adjusted), 0, 1)
  const leveled = clamp((adjusted - analysis.blackPoint) / (analysis.whitePoint - analysis.blackPoint), 0, 1)
  return adjusted * (1 - analysis.levelsBlend) + leveled * analysis.levelsBlend
}

function applyTone(data: Uint8ClampedArray, analysis: Analysis) {
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0) continue
    let red = toneChannel(data[index] / 255, analysis.whiteBalance[0], analysis)
    let green = toneChannel(data[index + 1] / 255, analysis.whiteBalance[1], analysis)
    let blue = toneChannel(data[index + 2] / 255, analysis.whiteBalance[2], analysis)

    red = clamp((red - 0.5) * analysis.contrast + 0.5, 0, 1)
    green = clamp((green - 0.5) * analysis.contrast + 0.5, 0, 1)
    blue = clamp((blue - 0.5) * analysis.contrast + 0.5, 0, 1)
    const light = luminance(red, green, blue)
    red = clamp(light + (red - light) * analysis.saturation, 0, 1)
    green = clamp(light + (green - light) * analysis.saturation, 0, 1)
    blue = clamp(light + (blue - light) * analysis.saturation, 0, 1)

    data[index] = Math.round(red * 255)
    data[index + 1] = Math.round(green * 255)
    data[index + 2] = Math.round(blue * 255)
  }
}

function sharpenOpaquePixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
) {
  const source = new Uint8ClampedArray(data)
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4
      if (source[index + 3] < 250) continue
      const neighbors = [index - 4, index + 4, index - width * 4, index + width * 4]
      if (neighbors.some((neighbor) => source[neighbor + 3] < 250)) continue
      const center = luminance(source[index], source[index + 1], source[index + 2])
      const average = neighbors.reduce((sum, neighbor) => sum + luminance(source[neighbor], source[neighbor + 1], source[neighbor + 2]), 0) / 4
      const detail = clamp(center - average, -16, 16) * amount
      if (Math.abs(detail) < 0.35) continue
      for (let channel = 0; channel < 3; channel += 1) {
        data[index + channel] = clamp(source[index + channel] + detail, 0, 255)
      }
    }
  }
}

export function applyConservativeTreatment(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  config: ConservativeTreatmentConfig = CONSERVATIVE_TREATMENT_CONFIG,
) {
  const image = context.getImageData(0, 0, width, height)
  const analysis = analyze(image.data, width, height, config)
  const denoised = reduceNoise(image.data, width, height, analysis.noiseReduction)
  applyTone(denoised, analysis)
  sharpenOpaquePixels(
    denoised,
    width,
    height,
    config.maxSharpenAmount * (1 - analysis.noiseReduction / Math.max(config.maxNoiseReduction, 0.001)),
  )
  image.data.set(denoised)
  context.putImageData(image, 0, 0)
}
