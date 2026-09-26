import { useRef, useState } from 'react'

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_FILE_BYTES = 20 * 1024 * 1024

const PhotoIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="2" />
    <path d="m4 17 4.5-4 3.2 3 2.4-2.2L20 19" />
  </svg>
)

type ImageInputProps = {
  error?: string
  onSelect: (file: File) => void
}

export function ImageInput({ error, onSelect }: ImageInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [localError, setLocalError] = useState('')

  const choose = (file?: File) => {
    if (!file) return
    if (!ACCEPTED_TYPES.has(file.type)) {
      setLocalError('Use uma imagem JPEG, PNG ou WebP.')
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setLocalError('A fotografia deve ter no máximo 20 MB.')
      return
    }
    setLocalError('')
    onSelect(file)
  }

  const openPicker = () => {
    if (inputRef.current) inputRef.current.value = ''
    inputRef.current?.click()
  }

  return (
    <div
      className={`simple-input ${dragging ? 'dragging' : ''}`}
      onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        choose(event.dataTransfer.files[0])
      }}
    >
      {(localError || error) && <div className="simple-error" role="alert">{localError || error}</div>}
      <button className="select-photo-button" type="button" onClick={openPicker}>
        <PhotoIcon /> SELECIONAR FOTO
      </button>
      <small>ou arraste a foto para esta área</small>
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        onChange={(event) => choose(event.target.files?.[0])}
      />
    </div>
  )
}
