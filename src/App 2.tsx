import { useRef, useState } from 'react'

const UploadIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
  </svg>
)

const ShieldIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3 5 6v5c0 4.7 2.9 8 7 10 4.1-2 7-5.3 7-10V6l-7-3Z" />
    <path d="m9.2 12 1.8 1.8 3.8-4" />
  </svg>
)

function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [fileName, setFileName] = useState('')

  const chooseFile = (file?: File) => {
    if (file?.type.startsWith('image/')) setFileName(file.name)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="./" aria-label="Foto 3x4 — início">
          <span className="brand-mark">3×4</span>
          <span>Foto 3x4</span>
        </a>
        <span className="privacy-pill"><ShieldIcon /> Processamento local e privado</span>
      </header>

      <main>
        <section className="hero">
          <div className="eyebrow"><span /> PRONTO EM INSTANTES</div>
          <h1>Sua foto 3x4,<br /><em>sem complicação.</em></h1>
          <p>Recorte, enquadramento e fundo transparente feitos automaticamente — com toda a privacidade.</p>
        </section>

        <section className="workspace-card" aria-label="Enviar fotografia">
          <div className="step-heading">
            <span className="step-number">1</span>
            <div><h2>Selecione uma foto</h2><p>Escolha uma imagem nítida, de frente e com boa iluminação.</p></div>
          </div>

          <div
            className={`dropzone ${dragging ? 'is-dragging' : ''}`}
            onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              chooseFile(event.dataTransfer.files[0])
            }}
          >
            <div className="upload-icon"><UploadIcon /></div>
            <h3>{fileName || 'Arraste sua foto para cá'}</h3>
            <p>{fileName ? 'Foto selecionada. O processamento será iniciado em seguida.' : 'ou selecione um arquivo do computador'}</p>
            <button className="primary-button" type="button" onClick={() => inputRef.current?.click()}>
              <UploadIcon /> Selecionar foto
            </button>
            <input
              ref={inputRef}
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => chooseFile(event.target.files?.[0])}
            />
            <small>JPG, PNG ou WEBP · até 20 MB</small>
          </div>

          <div className="tips">
            <span className="tips-icon">✦</span>
            <div><strong>Para um resultado melhor</strong><p>Use uma foto com o rosto visível, sem acessórios que cubram a face e com espaço ao redor da cabeça.</p></div>
          </div>
        </section>

        <section className="process-strip" aria-label="Etapas do processo">
          {['Removemos o fundo', 'Ajustamos o enquadramento', 'Você baixa o PNG'].map((label, index) => (
            <div className="process-item" key={label}>
              <span>{index + 1}</span><p>{label}</p>{index < 2 && <i>→</i>}
            </div>
          ))}
        </section>
      </main>

      <footer><ShieldIcon /> Sua foto não é enviada nem armazenada. Tudo acontece neste dispositivo.</footer>
    </div>
  )
}

export default App
