// عارض الفيديو لملفات المستودع — عنصر <video> أصلي بلا مكتبات.
// يعيد استخدام أصناف `.pdf-viewer` نفسها (رأس/إطار/تذييل) فيتبع الفاتح/الداكن بلا CSS جديد.
import { useEffect, useState } from 'react'
import { Download, Expand, Minimize } from 'lucide-react'
import { useLanguage } from '../../language/LanguageContext'
import { Tooltip } from '../../components/Tooltip'

type PageVideoViewerProps = {
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

const VIDEO_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
}

const mimeOfFileName = (name: string): string => {
  const ext = name.split('.').pop()?.trim().toLowerCase() ?? ''
  return VIDEO_MIME[ext] ?? 'video/*'
}

export default function PageVideoViewer({ fileName, title, resolveFileUrl }: PageVideoViewerProps) {
  const { t } = useLanguage()
  const [docUrl, setDocUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [progress, setProgress] = useState(0)
  const [loadError, setLoadError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    let active = true
    let objectUrl: string | null = null
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
    setDocUrl(null)
    setLoadError('')
    setProgress(0)
    setIsLoading(true)
    resolveFileUrl(fileName)
      .then(async (url) => {
        const response = await fetch(url)
        if (!response.ok) throw new Error('fetch failed')
        const total = Number(response.headers.get('content-length')) || 0
        // بلا طول معروف: تحميل مفرد (ملفات صغيرة عادةً).
        if (!response.body || !total) {
          const blob = await response.blob()
          if (!active) return
          const typed = blob.type ? blob : new Blob([blob], { type: mimeOfFileName(fileName) })
          objectUrl = URL.createObjectURL(typed)
          setDocUrl(objectUrl)
          return
        }
        // تحميل متدفق بنسبة مئوية — اللودر يتحرك بدل التجميد الغامض.
        reader = response.body.getReader()
        const chunks: Uint8Array<ArrayBuffer>[] = []
        let received = 0
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          if (!active) {
            await reader.cancel().catch(() => {})
            return
          }
          if (value) {
            // نسخة بمخزن ArrayBuffer خالص (يقبلها BlobPart في فحص tsc الصارم).
            chunks.push(value.slice())
            received += value.length
            setProgress(Math.min(99, Math.round((received / total) * 100)))
          }
        }
        if (!active) return
        objectUrl = URL.createObjectURL(new Blob(chunks, { type: mimeOfFileName(fileName) }))
        setProgress(100)
        setDocUrl(objectUrl)
      })
      .catch(() => {
        if (active) {
          setIsLoading(false)
          setLoadError(t('documentLibrary.loadDocError'))
        }
      })
    return () => {
      active = false
      reader?.cancel().catch(() => {})
      if (objectUrl) URL.revokeObjectURL(objectUrl)
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
          types: [{ description: title, accept: { [blob.type || 'video/*']: [extension] } }],
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
    <section className={`pdf-viewer${isFullscreen ? ' is-fullscreen' : ''}`} aria-label={t('documentLibrary.videoViewerAria')}>
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
        {isLoading && (
          <div className="pdf-loading" role="status">
            {progress > 0 ? t('documentManager.loadingPercent', { percent: progress }) : t('documentLibrary.loadingPage')}
          </div>
        )}
        {loadError && !isLoading && <div className="pdf-error" role="alert">{loadError}</div>}
        {docUrl && !loadError && (
          <video
            src={docUrl}
            controls
            preload="auto"
            playsInline
            style={{ maxWidth: '100%', maxHeight: '100%', width: '100%' }}
            onCanPlay={() => setIsLoading(false)}
            onPlaying={() => setIsLoading(false)}
            onWaiting={() => setIsLoading(true)}
            onError={() => { setIsLoading(false); setLoadError(t('documentLibrary.loadDocError')) }}
          />
        )}
      </div>

      <footer className="pdf-viewer-footer" aria-live="polite">
        <span className={`viewer-status-dot${loadError ? ' is-error' : ''}`} />
        <span>{saveMessage || (loadError ? loadError : t('documentLibrary.localPreview'))}</span>
      </footer>
    </section>
  )
}
