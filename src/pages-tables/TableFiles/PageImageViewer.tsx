// عارض الصور لملفات المستودع — يحل رابط الملف عبر المستودع ويعرضه محلياً.
// يعيد استخدام أصناف `.pdf-viewer` نفسها (رأس/إطار/تذييل) فيتبع الفاتح/الداكن بلا CSS جديد.
import { useEffect, useState } from 'react'
import { Download, Expand, Minimize, ZoomIn, ZoomOut } from 'lucide-react'
import { useLanguage } from '../../language/LanguageContext'
import { Tooltip } from '../../components/Tooltip'

type PageImageViewerProps = {
  fileName: string
  title: string
  resolveFileUrl: (fileName: string) => Promise<string>
}

type SavePickerHandle = {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>
    close: () => Promise<void>
  }>
}

type WindowWithSavePicker = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string
    types: { description: string; accept: Record<string, string[]> }[]
  }) => Promise<SavePickerHandle>
}

export default function PageImageViewer({ fileName, title, resolveFileUrl }: PageImageViewerProps) {
  const { t } = useLanguage()
  const [docUrl, setDocUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)
  /** تكبير الصورة (1–3 بخطوة 0.5) — التمرير للتجوال عند التكبير. */
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    setZoom(1)
  }, [fileName])

  useEffect(() => {
    let active = true
    setDocUrl(null)
    setLoadError('')
    setIsLoading(true)
    resolveFileUrl(fileName)
      .then((url) => {
        if (active) {
          setDocUrl(url)
          setIsLoading(false)
        }
      })
      .catch(() => {
        if (active) {
          setIsLoading(false)
          setLoadError(t('documentLibrary.loadDocError'))
        }
      })
    return () => {
      active = false
    }
  }, [fileName, resolveFileUrl, t])

  useEffect(() => {
    if (!isFullscreen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.body.classList.add('is-pdf-fullscreen')
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setIsFullscreen(false)
    }
    window.addEventListener('keydown', handleEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.body.classList.remove('is-pdf-fullscreen')
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isFullscreen])

  const saveOriginal = async () => {
    try {
      if (!docUrl) throw new Error('No document')
      const response = await fetch(docUrl)
      if (!response.ok) throw new Error('Document not found')
      const blob = await response.blob()
      const showSaveFilePicker = (window as WindowWithSavePicker).showSaveFilePicker
      if (showSaveFilePicker) {
        const extension = fileName.slice(fileName.lastIndexOf('.'))
        const handle = await showSaveFilePicker.call(window, {
          suggestedName: fileName,
          types: [{ description: title, accept: { [blob.type || 'image/*']: [extension] } }],
        })
        const writable = await handle.createWritable()
        await writable.write(blob)
        await writable.close()
      } else {
        const objectUrl = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = objectUrl
        link.download = fileName
        link.click()
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
      }
      setSaveMessage(t('documentLibrary.savedFileMsg', { fileName }))
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setSaveMessage(t('documentLibrary.saveError'))
    }
  }

  return (
    <section className={`pdf-viewer${isFullscreen ? ' is-fullscreen' : ''}`} aria-label={t('documentLibrary.imageViewerAria')}>
      <header className="pdf-viewer-header" dir="ltr">
        <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[0.8125rem] font-semibold" dir="auto">{title}</span>
        <div className="pdf-actions">
          <Tooltip content={isFullscreen ? t('documentLibrary.exitFullscreenTitle') : t('documentLibrary.fullscreenTitle')}>
            <button
              type="button"
              className="pdf-action"
              onClick={() => setIsFullscreen((previous) => !previous)}
              aria-label={isFullscreen ? t('documentLibrary.exitFullscreenTitle') : t('documentLibrary.fullscreenTitle')}
              aria-pressed={isFullscreen}
            >
              {isFullscreen ? <Minimize size={17} /> : <Expand size={17} />}
            </button>
          </Tooltip>
          <Tooltip content={t('documentLibrary.saveFileTitle')}>
            <button
              type="button"
              className="pdf-action"
              onClick={() => void saveOriginal()}
              disabled={!docUrl}
              aria-label={t('documentLibrary.saveFileTitle')}
            >
              <Download size={17} />
            </button>
          </Tooltip>
        </div>
      </header>

      <div className="pdf-canvas-frame">
        {isLoading && <div className="pdf-loading" role="status">{t('documentLibrary.loadingPage')}</div>}
        {loadError && !isLoading && <div className="pdf-error" role="alert">{loadError}</div>}
        {docUrl && !loadError && (
          <img
            src={docUrl}
            alt={title}
            className="pdf-canvas"
            style={{ maxWidth: '100%', height: 'auto', objectFit: 'contain', transform: `scale(${zoom})`, transformOrigin: 'center center' }}
            onError={() => setLoadError(t('documentLibrary.loadDocError'))}
          />
        )}
        {docUrl && !loadError && (
          <div className="pdf-zoom-fab" role="group" aria-label={t('documentLibrary.zoomGroupAria')}>
            <Tooltip content={t('documentLibrary.zoomOutTitle')}>
            <button
              type="button"
              disabled={zoom <= 1}
              onClick={() => setZoom((z) => Math.max(1, +(z - 0.5).toFixed(1)))}
              aria-label={t('documentLibrary.zoomOutTitle')}
            >
              <ZoomOut size={20} />
            </button>
            </Tooltip>
            <Tooltip content={t('documentLibrary.zoomInTitle')}>
            <button
              type="button"
              disabled={zoom >= 3}
              onClick={() => setZoom((z) => Math.min(3, +(z + 0.5).toFixed(1)))}
              aria-label={t('documentLibrary.zoomInTitle')}
            >
              <ZoomIn size={20} />
            </button>
            </Tooltip>
          </div>
        )}
      </div>

      <footer className="pdf-viewer-footer" aria-live="polite">
        <span className={`viewer-status-dot${loadError ? ' is-error' : ''}`} />
        <span>{saveMessage || (loadError ? loadError : t('documentLibrary.localPreview'))}</span>
      </footer>
    </section>
  )
}
