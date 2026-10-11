// عارض PDF لملفات المستودع — المكوّن الوحيد لمعاينة الوثائق (تحميل كسول).
// (نُقل من Interfaces/DocumentLibrary بأسماء أوضح — العارضات القادمة بجانبه).
import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../../language/LanguageContext'
import { useToast } from 'react-theme-toast'
import { save as saveDialog } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'
import { FileText, Search } from 'lucide-react'
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist'
import { ClearTextInput } from '../../components/ClearTextInput'
import PdfViewerHeader from './PdfViewerHeader'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export type DocumentEntry = {
  id: string
  fileName: string
  title: string
  owner?: string
  category: string
}

// مفتاح الترجمة لكل تصنيف — القيم المخزنة مفاتيح مُدارة (passport…)
// تطابق DOC_CATEGORIES في lib/documents، والعرض يمر عبر t().
const categories = [
  { key: 'documentLibrary.categoryAll', value: 'all' },
  { key: 'documentLibrary.categoryPassports', value: 'passport' },
  { key: 'documentLibrary.categoryCivilRecords', value: 'civil_id' },
  { key: 'documentLibrary.categoryCertificates', value: 'certificate' },
  { key: 'documentLibrary.categoryOther', value: 'other' },
] as const

type PagePDFViewerProps = {
  documents: DocumentEntry[]
  resolveFileUrl: (fileName: string) => Promise<string>
  onSelectedTitleChange: (title: string) => void
  /** وضع المعاينة (FilePreviewPage): بلا شريط جانبي ولا تذييل ولا زر ملء شاشة ولا أزرار حفظ مكررة. */
  bare?: boolean
  /** مشاركة الملف الأصلي من قائمة المعاينة (تُمرَّر من FilePreviewPage). */
  onShareOriginal?: () => void
  /** حفظ الملف الأصلي عبر زر الهيدر المجرّب (معاينة الموبايل) بدل المنطق الداخلي. */
  onSaveOriginalFile?: () => void
  /** حفظ بايتات مولّدة (صفحة PNG/PDF) عبر مسار الهيدر نفسه. */
  onSaveBytes?: (bytes: Uint8Array, fileName: string) => void
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

export default function PagePDFViewer({ documents, resolveFileUrl, onSelectedTitleChange, bare = false, onShareOriginal, onSaveOriginalFile, onSaveBytes }: PagePDFViewerProps) {
  const { t } = useLanguage()
  const toast = useToast()
  const [category, setCategory] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(documents[0]?.id ?? '')
  const [docUrl, setDocUrl] = useState<string | null>(null)
  /* في صفحة المعاينة (bare) الافتراضي "كل الصفحات" لأن زرّي التبديل مخفيان على الموبايل.
     في مكتبة الملفات يبقى الافتراضي "صفحة واحدة". */
  const [viewMode, setViewMode] = useState<'single' | 'all'>(bare ? 'all' : 'single')
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [viewerWidth, setViewerWidth] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const viewerSectionRef = useRef<HTMLElement>(null)
  const viewerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pageElements = useRef(new Map<number, HTMLElement>())
  const pageCanvases = useRef(new Map<number, HTMLCanvasElement>())
  // وجهة التنقل المبرمج (أسهم/Enter) — يُجمَّد العدّاد عليها أثناء التمرير حتى لا يتراقص.
  const navTarget = useRef<number | null>(null)
  const navTimer = useRef<number | null>(null)
  const selectedDocument = documents.find((document) => document.id === selectedId) ?? documents[0] ?? null
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const visibleDocuments = documents.filter((document) => {
    const matchesCategory = category === 'all' || document.category === category
    const matchesSearch = !normalizedSearch ||
      `${document.title} ${document.owner ?? ''} ${document.fileName}`.toLocaleLowerCase().includes(normalizedSearch)
    return matchesCategory && matchesSearch
  })

  useEffect(() => {
    if (selectedDocument) {
      onSelectedTitleChange(`${selectedDocument.title} · ${selectedDocument.owner ?? ''}`)
    }
    return () => onSelectedTitleChange('')
  }, [selectedDocument, onSelectedTitleChange])

  // حل رابط الملف من المستودع (asset) — يُعاد حله عند تبديل الوثيقة
  useEffect(() => {
    let active = true
    setDocUrl(null)
    setPageError('')
    if (!selectedDocument) return
    resolveFileUrl(selectedDocument.fileName)
      .then((url) => {
        if (active) setDocUrl(url)
      })
      .catch(() => {
        if (active) {
          setIsLoading(false)
          setPageError(t('documentLibrary.loadDocError'))
        }
      })
    return () => {
      active = false
    }
  }, [selectedDocument, resolveFileUrl])

  useEffect(() => {
    const element = viewerRef.current
    if (!element) return

    const observer = new ResizeObserver(([entry]) => {
      setViewerWidth(Math.floor(entry.contentRect.width))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!isFullscreen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.body.classList.add('is-pdf-fullscreen')
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      // خروج داخل التطبيق فقط — لا نستخدم fullscreen الخاص بنظام التشغيل أو المتصفح
      // حتى لا يملأ شاشة الجهاز (F11) بل يبقى داخل نافذة Tauri فقط.
      setIsFullscreen(false)
    }
    window.addEventListener('keydown', handleEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.body.classList.remove('is-pdf-fullscreen')
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isFullscreen])

  useEffect(() => {
    const frameEl = viewerRef.current
    if (viewMode !== 'all' || !frameEl || !pageCount) return

    // نحتفظ بنسبة ظهور كل صفحة — لا نعتمد على عناصر الإشعار وحده،
    // لأن الإشعار يحمل فقط ما تغيّر (نمو صفحة أثناء الرسم كان يقلب العدّاد خطأً).
    const ratios = new Map<Element, number>()
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        ratios.set(entry.target, entry.isIntersecting ? entry.intersectionRatio : 0)
      }
      // أثناء التمرير المبرمج (أسهم/Enter) الوجهة معروضة سلفاً — لا نلتقط العابرة.
      if (navTarget.current !== null) return
      let bestPage = 0
      let bestRatio = 0
      ratios.forEach((ratio, element) => {
        if (ratio <= bestRatio) return
        const number = Number(element.getAttribute('data-page-number'))
        if (number) {
          bestRatio = ratio
          bestPage = number
        }
      })
      if (bestPage) {
        setPageNumber(bestPage)
      }
    }, { root: frameEl, threshold: [0.25, 0.5, 0.75] })

    // نهاية أي تمرير (مبرمج أو يدوي) تحرّر التجميد — والخريطة محدّثة فيبقى الرقم صحيحاً.
    const clearNavTarget = () => { navTarget.current = null }
    frameEl.addEventListener('scrollend', clearNavTarget)

    pageElements.current.forEach((element) => observer.observe(element))
    return () => {
      observer.disconnect()
      frameEl.removeEventListener('scrollend', clearNavTarget)
      if (navTimer.current !== null) window.clearTimeout(navTimer.current)
      navTarget.current = null
    }
  }, [viewMode, pdf, pageCount])

  useEffect(() => {
    if (!docUrl) return
    let isCurrent = true
    const loadingTask = getDocument({ url: docUrl })
    setPdf(null)
    setPageCount(0)
    setPageNumber(1)
    setIsLoading(true)
    setPageError('')
    setSaveMessage('')

    loadingTask.promise.then((loadedPdf) => {
      if (!isCurrent) {
        return
      }
      setPdf(loadedPdf)
      setPageCount(loadedPdf.numPages)
    }).catch(() => {
      if (isCurrent) {
        setIsLoading(false)
        setPageError(t('documentLibrary.openPdfError'))
      }
    })

    return () => {
      isCurrent = false
      void loadingTask.destroy()
    }
  }, [docUrl])

  useEffect(() => {
    if (viewMode === 'all') {
      setIsLoading(false)
      return
    }
    if (!pdf || !canvasRef.current || viewerWidth < 80) return

    let cancelled = false
    let activeRender: ReturnType<PDFPageProxy['render']> | undefined
    setIsLoading(true)
    setPageError('')

    const renderPage = async () => {
      try {
        const page = await pdf.getPage(pageNumber)
        if (cancelled || !canvasRef.current) return

        const unitViewport = page.getViewport({ scale: 1 })
        const fitMargin = bare ? 0 : 40
        const fitScale = Math.min((viewerWidth - fitMargin) / unitViewport.width, bare ? 3 : 1.5)
        const viewport = page.getViewport({ scale: fitScale * zoom })
        const canvas = canvasRef.current
        const context = canvas.getContext('2d', { alpha: false })
        if (!context) throw new Error('Canvas context unavailable')

        const outputScale = Math.min(window.devicePixelRatio || 1, 2)
        canvas.width = Math.ceil(viewport.width * outputScale)
        canvas.height = Math.ceil(viewport.height * outputScale)
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`
        context.setTransform(outputScale, 0, 0, outputScale, 0, 0)
        activeRender = page.render({ canvasContext: context, viewport, canvas })
        await activeRender.promise
      } catch (error) {
        const wasCancelled = error instanceof Error && error.name === 'RenderingCancelledException'
        if (!cancelled && !wasCancelled) setPageError(t('documentLibrary.pageLoadError'))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void renderPage()
    return () => {
      cancelled = true
      activeRender?.cancel()
    }
  }, [pdf, pageNumber, viewerWidth, zoom, viewMode])

  const saveBlob = async (blob: Blob, fileName: string, mimeType: string, description: string) => {
    // رسالة الخطأ الأصلية كما تصل (لا ابتلاع) — مقصوصة (220) كنمط بقية الصفحات.
    const failText = (cause: unknown): string => {
      let text = t('documentLibrary.saveError')
      if (cause instanceof Error && cause.message) text = cause.message
      else if (typeof cause === 'string' && cause.trim()) text = cause
      return text.length > 220 ? `${text.slice(0, 220)}…` : text
    }
    const done = (message: string) => {
      // التذييل مخفي في المعاينة — فالتغذية عبر التوست هناك، وعبر السطر في المكتبة.
      if (bare) toast.success(message)
      else setSaveMessage(message)
    }
    const failed = (cause: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[PagePDFViewer] saveBlob failed:', cause)
      if (bare) toast.error(failText(cause))
      else setSaveMessage(failText(cause))
    }
    try {
      const showSaveFilePicker = (window as WindowWithSavePicker).showSaveFilePicker
      if (showSaveFilePicker) {
        const extension = fileName.slice(fileName.lastIndexOf('.'))
        const handle = await showSaveFilePicker.call(window, {
          suggestedName: fileName,
          types: [{ description, accept: { [mimeType]: [extension] } }],
        })
        const writable = await handle.createWritable()
        await writable.write(blob)
        await writable.close()
      } else {
        // Tauri (موبايل وديسكتوب): تنزيل المتصفح لا يعمل في WebView —
        // حوار حفظ أصلي + كتابة الملحق (نفس نمط تصدير القاعدة والملفات).
        const dot = fileName.lastIndexOf('.')
        const ext = dot > 0 ? fileName.slice(dot + 1) : ''
        const dest = await saveDialog({
          defaultPath: fileName,
          filters: ext ? [{ name: description, extensions: [ext] }] : undefined,
        })
        if (!dest) return
        await writeFile(dest, new Uint8Array(await blob.arrayBuffer()))
      }
      done(t('documentLibrary.savedFileMsg', { fileName }))
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      failed(error)
    }
  }

  const saveOriginalPdf = async () => {
    // في المعاينة: نفس كود زر حفظ الهيدر (مجرّب ويعمل) بدل المنطق الداخلي.
    if (onSaveOriginalFile) {
      onSaveOriginalFile()
      return
    }
    try {
      if (!docUrl || !selectedDocument) throw new Error('No document')
      const response = await fetch(docUrl)
      if (!response.ok) throw new Error('Document not found')
      const blob = await response.blob()
      await saveBlob(blob, selectedDocument.fileName, 'application/pdf', t('documentLibrary.savePdfTitle'))
    } catch {
      if (bare) toast.error(t('documentLibrary.loadPdfError'))
      else setSaveMessage(t('documentLibrary.loadPdfError'))
    }
  }

  const saveCurrentPage = () => {
    if (!selectedDocument) return
    const canvas = viewMode === 'single' ? canvasRef.current : pageCanvases.current.get(pageNumber) ?? null
    if (isLoading) return
    if (!canvas) {
      if (bare) toast.info(t('documentLibrary.pageLoadNotice'))
      else setSaveMessage(t('documentLibrary.pageLoadNotice'))
      return
    }

    canvas.toBlob((blob) => {
      if (!blob) {
        if (bare) toast.error(t('documentLibrary.imageExtractError'))
        else setSaveMessage(t('documentLibrary.imageExtractError'))
        return
      }
      const fileName = `${selectedDocument.fileName.replace(/\.pdf$/i, '')}-page-${pageNumber}.png`
      // في المعاينة: البايتات عبر مسار حفظ الهيدر نفسه (حوار + كتابة).
      if (onSaveBytes) {
        void blob.arrayBuffer().then(
          (buffer) => onSaveBytes(new Uint8Array(buffer), fileName),
          () => {
            if (bare) toast.error(t('documentLibrary.imageExtractError'))
            else setSaveMessage(t('documentLibrary.imageExtractError'))
          },
        )
        return
      }
      void saveBlob(blob, fileName, 'image/png', t('documentLibrary.savePagePngTitle'))
    }, 'image/png')
  }

  const saveCurrentPageAsPdf = async () => {
    if (!pdf || !docUrl || !selectedDocument) {
      if (bare) toast.info(t('documentLibrary.waitPdfLoad'))
      else setSaveMessage(t('documentLibrary.waitPdfLoad'))
      return
    }

    try {
      const { PDFDocument } = await import('pdf-lib')
      const response = await fetch(docUrl)
      if (!response.ok) throw new Error('Could not load the original PDF')
      const sourceBytes = new Uint8Array(await response.arrayBuffer())
      const sourcePdf = await PDFDocument.load(sourceBytes)
      const outputPdf = await PDFDocument.create()
      const [page] = await outputPdf.copyPages(sourcePdf, [pageNumber - 1])
      if (!page) throw new Error('The selected page is unavailable')
      outputPdf.addPage(page)
      const pdfBytes = await outputPdf.save()
      const safeBytes = new Uint8Array(pdfBytes.length)
      safeBytes.set(pdfBytes)
      const fileName = `${selectedDocument.fileName.replace(/\.pdf$/i, '')}-page-${pageNumber}.pdf`
      // في المعاينة: البايتات عبر مسار حفظ الهيدر نفسه (حوار + كتابة).
      if (onSaveBytes) {
        onSaveBytes(safeBytes, fileName)
        return
      }
      const blob = new Blob([safeBytes.buffer], { type: 'application/pdf' })
      await saveBlob(blob, fileName, 'application/pdf', t('documentLibrary.savePagePdfTitle'))
    } catch {
      if (bare) toast.error(t('documentLibrary.createPdfError'))
      else setSaveMessage(t('documentLibrary.createPdfError'))
    }
  }

  const toggleFullscreen = () => {
    // ملء شاشة داخل التطبيق فقط (توسيع الكارد داخل نافذة Tauri)
    // بدون setFullscreen من Tauri وبدون requestFullscreen من المتصفح
    // حتى لا يتحول لنمط F11 الذي يملأ شاشة الجهاز بالكامل.
    setIsFullscreen((previous) => !previous)
  }

  const goToPage = (requestedPage: number) => {
    const nextPage = Math.max(1, Math.min(pageCount, requestedPage))
    setPageNumber(nextPage)
    if (viewMode === 'all') {
      // تجميد العدّاد على الوجهة أثناء التمرير المبرمج — حتى لا يتراقص بين الصفحات العابرة.
      // (التمرير اليدوي يبقى حياً لأن العلم لا يُرفع إلا هنا.)
      navTarget.current = nextPage
      if (navTimer.current !== null) window.clearTimeout(navTimer.current)
      // احتياط إن لم تصل scrollend (متصفح قديم): تحرير بعد ثانية.
      navTimer.current = window.setTimeout(() => { navTarget.current = null }, 1000)
      // تمرير إطار العارض فقط — scrollIntoView كان يحرّك الصفحة كلها
      // فيختفي الهيدر اللاصق خارج الشاشة (خاصة على الموبايل حيث الإطار أطول من المتبقي).
      requestAnimationFrame(() => {
        const frame = viewerRef.current
        const element = pageElements.current.get(nextPage)
        if (!frame || !element) return
        const top = element.getBoundingClientRect().top - frame.getBoundingClientRect().top + frame.scrollTop
        frame.scrollTo({ top, behavior: 'smooth' })
      })
    }
  }

  if (selectedDocument === null) {
    return (
      <section className="document-library" aria-label={t('documentLibrary.libraryAria')}>
        <p className="documents-empty">{t('documentLibrary.emptyDocuments')}</p>
      </section>
    )
  }

  return (
    <section className="document-library" aria-label={t('documentLibrary.libraryAria')}>
      {!bare && (
      <aside className="documents-sidebar">
        <div className="documents-sidebar-heading">
          <div>
            <p className="documents-kicker">{t('documentLibrary.kicker')}</p>
            <h2>{t('documentLibrary.title')}</h2>
          </div>
          <span className="documents-total">{documents.length.toString().padStart(2, '0')}</span>
        </div>

        <label className="document-search">
          <Search size={16} aria-hidden="true" />
          <ClearTextInput
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('documentLibrary.searchPlaceholder')}
            aria-label={t('documentLibrary.searchAria')}
          />
        </label>

        <div className="document-categories" aria-label={t('documentLibrary.categoriesAria')}>
          {categories.map((item) => (
            <button
              className={`document-category${category === item.value ? ' is-active' : ''}`}
              type="button"
              key={item.key}
              aria-pressed={category === item.value}
              onClick={() => setCategory(item.value)}
            >
              {t(item.key)}
              {item.value === 'all' && <span>{documents.length}</span>}
            </button>
          ))}
        </div>

        <div className="document-list" aria-live="polite">
          {visibleDocuments.length ? visibleDocuments.map((document) => (
            <button
              className={`document-item${selectedId === document.id ? ' is-active' : ''}`}
              type="button"
              key={document.id}
              aria-current={selectedId === document.id ? 'true' : undefined}
              onClick={() => setSelectedId(document.id)}
            >
              <span className="document-item-icon"><FileText size={17} strokeWidth={1.7} /></span>
              <span className="document-item-copy">
                <span className="document-item-title">{document.title}</span>
                <span className="document-item-owner">{document.owner ?? ''} <span>·</span> {document.category}</span>
              </span>
            </button>
          )) : <p className="documents-empty">{t('documentLibrary.noMatchingFiles')}</p>}
        </div>
        <p className="documents-location">{t('documentLibrary.sourceLabel')} <span dir="ltr">{t('documentLibrary.sourceFolder')}</span></p>
      </aside>
      )}

      <section ref={viewerSectionRef} className={`pdf-viewer${isFullscreen ? ' is-fullscreen' : ''}`} aria-label={t('documentLibrary.pdfViewerAria')}>
        <PdfViewerHeader
          bare={bare}
          pageNumber={pageNumber}
          pageCount={pageCount}
          onGoToPage={goToPage}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          zoom={zoom}
          onZoomChange={setZoom}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          onSaveOriginal={() => void saveOriginalPdf()}
          onSavePageImage={saveCurrentPage}
          onSavePagePdf={() => void saveCurrentPageAsPdf()}
          onShareOriginal={onShareOriginal}
          actionsDisabled={isLoading || !pdf}
        />

        <div className={`pdf-canvas-frame${viewMode === 'all' ? ' is-all-pages' : ''}`} ref={viewerRef}>
          {viewMode === 'single' ? (
            <div className="pdf-canvas-stage">
              <canvas ref={canvasRef} className="pdf-canvas" aria-label={t('documentLibrary.canvasAria', { title: selectedDocument.title, page: pageNumber })} />
              {isLoading && <div className="pdf-loading" role="status">{t('documentLibrary.loadingPage')}</div>}
              {pageError && <div className="pdf-error" role="alert">{pageError}</div>}
            </div>
          ) : pdf && Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
            <PdfScrollPage
              key={`${selectedDocument.id}-${number}`}
              pdf={pdf}
              pageNumber={number}
              viewerWidth={viewerWidth}
              zoom={zoom}
              bare={bare}
              elements={pageElements.current}
              canvases={pageCanvases.current}
              scrollRoot={viewerRef.current}
              setPageError={setPageError}
              t={t}
            />
          ))}
          {pageError && viewMode === 'all' && <div className="pdf-error pdf-scroll-error" role="alert">{pageError}</div>}
        </div>

        {!bare && (
        <footer className="pdf-viewer-footer" aria-live="polite">
          <span className={`viewer-status-dot${pageError ? ' is-error' : ''}`} />
          <span>{saveMessage || (pageError ? pageError : t('documentLibrary.localPreview'))}</span>
          <span className="pdf-footer-format">PDF <span>→</span> PNG</span>
        </footer>
        )}
      </section>
    </section>
  )
}

type TranslateFn = (key: string, vars?: Record<string, string | number>) => string

type PdfScrollPageProps = {
  pdf: PDFDocumentProxy
  pageNumber: number
  viewerWidth: number
  zoom: number
  bare?: boolean
  elements: Map<number, HTMLElement>
  canvases: Map<number, HTMLCanvasElement>
  scrollRoot: HTMLDivElement | null
  setPageError: (message: string) => void
  t: TranslateFn
}

function PdfScrollPage({ pdf, pageNumber, viewerWidth, zoom, bare = false, elements, canvases, scrollRoot, setPageError, t }: PdfScrollPageProps) {
  const containerRef = useRef<HTMLElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isNearViewport, setIsNearViewport] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !scrollRoot) {
      setIsNearViewport(true)
      return
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setIsNearViewport(true)
    }, { root: scrollRoot, rootMargin: '500px 0px' })
    observer.observe(container)
    return () => observer.disconnect()
  }, [scrollRoot])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!isNearViewport || !canvas || viewerWidth < 80) return

    let cancelled = false
    let renderTask: ReturnType<PDFPageProxy['render']> | undefined
    setIsLoading(true)

    const renderPage = async () => {
      try {
        const page = await pdf.getPage(pageNumber)
        if (cancelled || !canvasRef.current) return

        const unitViewport = page.getViewport({ scale: 1 })
        const fitMargin = bare ? 0 : 40
        const fitScale = Math.min((viewerWidth - fitMargin) / unitViewport.width, bare ? 3 : 1.5)
        const viewport = page.getViewport({ scale: fitScale * zoom })
        const context = canvas.getContext('2d', { alpha: false })
        if (!context) throw new Error('Canvas context unavailable')

        const outputScale = Math.min(window.devicePixelRatio || 1, 2)
        canvas.width = Math.ceil(viewport.width * outputScale)
        canvas.height = Math.ceil(viewport.height * outputScale)
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`
        context.setTransform(outputScale, 0, 0, outputScale, 0, 0)
        renderTask = page.render({ canvasContext: context, viewport, canvas })
        await renderTask.promise
      } catch (error) {
        const wasCancelled = error instanceof Error && error.name === 'RenderingCancelledException'
        if (!cancelled && !wasCancelled) setPageError(t('documentLibrary.pageLoadError'))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void renderPage()
    return () => {
      cancelled = true
      renderTask?.cancel()
    }
  }, [pdf, pageNumber, viewerWidth, zoom, isNearViewport, setPageError, t])

  return (
    <article
      className="pdf-scroll-page"
      data-page-number={pageNumber}
      ref={(element) => {
        containerRef.current = element
        if (element) elements.set(pageNumber, element)
        else elements.delete(pageNumber)
      }}
    >
      <p className="pdf-scroll-page-label">{t('documentLibrary.scrollPageLabel', { page: pageNumber })}</p>
      <div className="pdf-scroll-page-body">
        <canvas
          className="pdf-canvas"
          aria-label={t('documentLibrary.pageAria', { page: pageNumber })}
          ref={(canvas) => {
            canvasRef.current = canvas
            if (canvas) canvases.set(pageNumber, canvas)
            else canvases.delete(pageNumber)
          }}
        />
        {isLoading && <span className="pdf-scroll-page-loading" role="status">{t('documentLibrary.loadingPage')}</span>}
      </div>
    </article>
  )
}