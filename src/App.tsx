import { useEffect, useRef, useState } from 'react'
import { ImageInput } from './components/ImageInput'
import { OUTPUT_CONFIG } from './config/output'
import { clearCanvas, disposeProcessedPhoto } from './services/image/dispose'
import { downloadTransparentPng } from './services/image/export'
import { DEFAULT_ADJUSTMENTS, renderPhoto } from './services/image/render'
import { processPhoto } from './services/vision/engine'
import type { FrameAdjustments, ProcessedPhoto, ProcessingStep } from './types/photo'

const BRAND_LOGO = `${import.meta.env.BASE_URL}brand/gilana-presentes.jpeg`
const PROCESSING_LABELS = [
  'Detectando pessoa...',
  'Removendo fundo...',
  'Ajustando enquadramento...',
  'Finalizando...',
]

const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 20h14" />
  </svg>
)

const AdjustIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6" />
  </svg>
)

const NewIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M20 7v5h-5M4 17v-5h5M6.2 8.5A7 7 0 0 1 18 7l2 5M4 12l2 5a7 7 0 0 0 11.8-1.5" />
  </svg>
)

type Status = 'idle' | 'processing' | 'ready' | 'error'

function simpleStage(step: ProcessingStep) {
  if (step === 'Removendo o fundo…' || step === 'Refinando cabelo e contornos…') return 1
  if (step === 'Preparando a foto 3x4…') return 2
  if (step === 'Aplicando correções técnicas…') return 3
  return 0
}

function Adjustment({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <label className="simple-adjustment">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  )
}

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value))

function App() {
  const outputRef = useRef<HTMLCanvasElement>(null)
  const processingRequest = useRef(0)
  const activeProcessing = useRef<AbortController | null>(null)
  const originalFile = useRef<File | null>(null)
  const photoMemory = useRef<ProcessedPhoto | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [processingStage, setProcessingStage] = useState(0)
  const [photo, setPhoto] = useState<ProcessedPhoto | null>(null)
  const [adjustments, setAdjustments] = useState<FrameAdjustments>(DEFAULT_ADJUSTMENTS)
  const [showAdjustments, setShowAdjustments] = useState(false)
  const [error, setError] = useState('')
  const [exportError, setExportError] = useState('')
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (status === 'ready' && photo && outputRef.current) {
      renderPhoto(outputRef.current, photo, adjustments)
    }
  }, [status, photo, adjustments])

  useEffect(() => {
    const purgePrivateMemory = () => {
      activeProcessing.current?.abort()
      activeProcessing.current = null
      originalFile.current = null
      disposeProcessedPhoto(photoMemory.current)
      photoMemory.current = null
      clearCanvas(outputRef.current)
    }
    window.addEventListener('pagehide', purgePrivateMemory)
    return () => {
      window.removeEventListener('pagehide', purgePrivateMemory)
      purgePrivateMemory()
    }
  }, [])

  const handleFile = async (file: File) => {
    activeProcessing.current?.abort()
    const controller = new AbortController()
    activeProcessing.current = controller
    const request = ++processingRequest.current
    originalFile.current = file
    setStatus('processing')
    setProcessingStage(0)
    setError('')
    setExportError('')
    setShowAdjustments(false)
    setAdjustments(DEFAULT_ADJUSTMENTS)

    try {
      const result = await processPhoto(file, (step) => {
        if (request === processingRequest.current) setProcessingStage(simpleStage(step))
      }, controller.signal)
      if (request !== processingRequest.current || controller.signal.aborted) {
        disposeProcessedPhoto(result)
        return
      }
      setProcessingStage(3)
      await new Promise((resolve) => window.setTimeout(resolve, 180))
      if (request !== processingRequest.current) return
      photoMemory.current = result
      setPhoto(result)
      setStatus('ready')
    } catch (reason) {
      if (request !== processingRequest.current) return
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setError(reason instanceof Error ? reason.message : 'Não foi possível processar esta foto.')
      setStatus('error')
    } finally {
      if (activeProcessing.current === controller) activeProcessing.current = null
    }
  }

  const reset = () => {
    activeProcessing.current?.abort()
    activeProcessing.current = null
    processingRequest.current += 1
    disposeProcessedPhoto(photoMemory.current)
    photoMemory.current = null
    clearCanvas(outputRef.current)
    setStatus('idle')
    setProcessingStage(0)
    originalFile.current = null
    setPhoto(null)
    setError('')
    setExportError('')
    setShowAdjustments(false)
    setAdjustments(DEFAULT_ADJUSTMENTS)
  }

  const download = async () => {
    if (!outputRef.current) return
    setExporting(true)
    setExportError('')
    try {
      await downloadTransparentPng(outputRef.current, OUTPUT_CONFIG.fileName)
    } catch (reason) {
      setExportError(reason instanceof Error ? reason.message : 'Não foi possível baixar o PNG.')
    } finally {
      setExporting(false)
    }
  }

  const updateAdjustment = (key: keyof FrameAdjustments, value: number) => {
    setAdjustments((current) => ({ ...current, [key]: value }))
  }

  const nudge = (key: 'offsetX' | 'offsetY', amount: number) => {
    setAdjustments((current) => ({ ...current, [key]: clamp(current[key] + amount, -0.25, 0.25) }))
  }

  const changeZoom = (amount: number) => {
    setAdjustments((current) => ({ ...current, zoom: clamp(current.zoom + amount, 0.75, 1.4) }))
  }

  return (
    <div className="simple-app">
      <main className="simple-main">
        {status === 'idle' || status === 'error' ? (
          <section className="simple-card start-card">
            <img className="store-logo" src={BRAND_LOGO} alt="Gilana Presentes" />
            <h1>Foto 3x4</h1>
            <p>Selecione uma foto para processar</p>
            <ImageInput error={status === 'error' ? error : undefined} onSelect={(file) => void handleFile(file)} />
          </section>
        ) : status === 'processing' ? (
          <section className="simple-card processing-screen" aria-live="polite">
            <img className="store-logo compact-logo" src={BRAND_LOGO} alt="Gilana Presentes" />
            <div className="processing-spinner" />
            <h1>Processando foto</h1>
            <div className="simple-steps">
              {PROCESSING_LABELS.map((label, index) => (
                <div className={`simple-step ${index < processingStage ? 'done' : ''} ${index === processingStage ? 'active' : ''}`} key={label}>
                  <span>{index < processingStage ? '✓' : index + 1}</span>
                  <strong>{label}</strong>
                </div>
              ))}
            </div>
            <small>A foto permanece somente neste dispositivo.</small>
          </section>
        ) : (
          <section className="result-screen">
            <img className="store-logo compact-logo" src={BRAND_LOGO} alt="Gilana Presentes" />
            <header className="simple-result-heading">
              <span>✓</span>
              <div><h1>Foto pronta!</h1><p>Confira o resultado antes de baixar.</p></div>
            </header>

            <div className="result-layout">
              <div className={`simple-checkerboard ${showAdjustments ? 'adjust-mode' : ''}`}>
                <canvas ref={outputRef} aria-label="Foto 3x4 com fundo transparente" />
                {showAdjustments && <div className="crop-frame" aria-hidden="true"><span>3:4</span></div>}
              </div>

              <div className="result-actions">
                {exportError && <div className="simple-error" role="alert">{exportError}</div>}
                <button className="action-button primary-action" type="button" disabled={exporting} onClick={() => void download()}>
                  <DownloadIcon /> {exporting ? 'GERANDO PNG...' : 'BAIXAR PNG'}
                </button>
                <button className="action-button secondary-action" type="button" aria-expanded={showAdjustments} onClick={() => setShowAdjustments((visible) => !visible)}>
                  <AdjustIcon /> {showAdjustments ? 'CONCLUIR AJUSTE' : 'AJUSTAR'}
                </button>
                <button className="action-button quiet-action" type="button" onClick={reset}>
                  <NewIcon /> NOVA FOTO
                </button>
              </div>
            </div>

            {showAdjustments && (
              <div className="adjustment-drawer">
                <div className="drawer-heading"><div><strong>Ajustar enquadramento</strong><small>Mova somente o necessário.</small></div><button type="button" onClick={() => setAdjustments(DEFAULT_ADJUSTMENTS)}>REDEFINIR PARA AUTOMÁTICO</button></div>
                <div className="simple-adjust-grid">
                  <div className="movement-control">
                    <span>Mover foto</span>
                    <div className="direction-pad">
                      <button className="move-up" type="button" aria-label="Mover para cima" onClick={() => nudge('offsetY', -0.015)}>↑</button>
                      <button className="move-left" type="button" aria-label="Mover para esquerda" onClick={() => nudge('offsetX', -0.015)}>←</button>
                      <i aria-hidden="true" />
                      <button className="move-right" type="button" aria-label="Mover para direita" onClick={() => nudge('offsetX', 0.015)}>→</button>
                      <button className="move-down" type="button" aria-label="Mover para baixo" onClick={() => nudge('offsetY', 0.015)}>↓</button>
                    </div>
                  </div>
                  <div className="scale-controls">
                    <div className="adjustment-with-buttons">
                      <span>Zoom</span>
                      <div><button type="button" aria-label="Diminuir zoom" onClick={() => changeZoom(-0.03)}>−</button><input aria-label="Zoom" type="range" min={0.75} max={1.4} step={0.01} value={adjustments.zoom} onChange={(event) => updateAdjustment('zoom', Number(event.target.value))} /><button type="button" aria-label="Aumentar zoom" onClick={() => changeZoom(0.03)}>+</button></div>
                    </div>
                    <Adjustment label="Pequena rotação" value={adjustments.rotation} min={-8} max={8} step={0.2} onChange={(value) => updateAdjustment('rotation', value)} />
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </main>
      <footer>Foto 3x4 · processamento local e privado</footer>
    </div>
  )
}

export default App
