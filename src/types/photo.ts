export type FaceBox = {
  x: number
  y: number
  width: number
  height: number
}

export type Point = {
  x: number
  y: number
}

export type DetectedFace = {
  box: FaceBox
  leftEye?: Point
  rightEye?: Point
  eyeCenter?: Point
  leftEar?: Point
  rightEar?: Point
}

export type SubjectBox = FaceBox

export type ProcessedPhoto = {
  foreground: HTMLCanvasElement
  face: DetectedFace | null
  subject: SubjectBox
  width: number
  height: number
}

export type FrameAdjustments = {
  zoom: number
  offsetX: number
  offsetY: number
  rotation: number
}

export type ProcessingStep =
  | 'Lendo a fotografia…'
  | 'Corrigindo a orientação…'
  | 'Carregando os modelos locais…'
  | 'Detectando o rosto…'
  | 'Removendo o fundo…'
  | 'Refinando cabelo e contornos…'
  | 'Preparando a foto 3x4…'
  | 'Aplicando correções técnicas…'
