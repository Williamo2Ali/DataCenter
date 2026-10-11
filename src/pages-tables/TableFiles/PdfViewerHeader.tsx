// هيدر عارض PDF — المكوّن الوحيد للبار العلوي (يُستخدم من PagePDFViewer).
// يستقبل حالة العارض (الصفحة/الوضع/التكبير) وينفّذ الإجراءات عبر callbacks،
// ويملك منطق حقل رقم الصفحة (المسودة + الالتزام) داخلياً.
import { useEffect, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Download,
  Expand,
  FileText,
  Files,
  ImageDown,
  Menu,
  Minimize,
  Share2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { Tooltip } from '../../components/Tooltip'
import { BottomList, type BottomListItem } from '../../components/BottomList/BottomList'
import { useLanguage } from '../../language/LanguageContext'

/** حدود التكبير المدعومة وخطوته — المطابقة لما يتوقّعه العارض عند الرسم. */
const MIN_ZOOM = 0.6
const MAX_ZOOM = 2.2
const ZOOM_STEP = 0.2

type PdfViewerHeaderProps = {
  /** وضع المعاينة (bare): بلا أزرار إجراءات (ملء شاشة/حفظ). */
  bare?: boolean
  /** الصفحة الحالية (1-based). */
  pageNumber: number
  /** عدد الصفحات (0 حتى يُحمَّل الملف). */
  pageCount: number
  /** الانتقال إلى صفحة (يُقيَّد داخل العارض). */
  onGoToPage: (page: number) => void
  viewMode: 'single' | 'all'
  onViewModeChange: (mode: 'single' | 'all') => void
  zoom: number
  onZoomChange: (zoom: number) => void
  /** أزرار الإجراءات (وضع المكتبة فقط). */
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
  onSaveOriginal?: () => void
  onSavePageImage?: () => void
  onSavePagePdf?: () => void
  /** مشاركة الملف الأصلي (وضع المعاينة — تمرَّر من صفحة المعاينة). */
  onShareOriginal?: () => void
  /** تعطيل زرّي حفظ الصفحة/PDF أثناء التحميل أو قبل جاهزية الملف. */
  actionsDisabled?: boolean
}

export default function PdfViewerHeader({
  bare = false,
  pageNumber,
  pageCount,
  onGoToPage,
  viewMode,
  onViewModeChange,
  zoom,
  onZoomChange,
  isFullscreen = false,
  onToggleFullscreen,
  onSaveOriginal,
  onSavePageImage,
  onSavePagePdf,
  onShareOriginal,
  actionsDisabled = false,
}: PdfViewerHeaderProps) {
  const { t } = useLanguage()
  const [pageDraft, setPageDraft] = useState(String(pageNumber))
  // قائمة الأزرار المخفية على الموبايل (وضع المعاينة فقط) — تُعرض عبر BottomList.
  const [menuOpen, setMenuOpen] = useState(false)

  // مزامنة المسودة مع الصفحة الفعلية (قد تتغير بالتمرير أو بأزرار التنقل).
  useEffect(() => {
    setPageDraft(String(pageNumber))
  }, [pageNumber])

  const pagesReady = pageCount > 0
  const prevDisabled = pageNumber <= 1 || !pagesReady
  const nextDisabled = pageNumber >= pageCount || !pagesReady

  const commitPageDraft = () => {
    const requested = Number.parseInt(pageDraft, 10)
    if (!Number.isFinite(requested) || !pagesReady) {
      setPageDraft(String(pageNumber))
      return
    }
    onGoToPage(requested)
  }

  // عناصر قائمة المعاينة على الموبايل — وضعا العرض أولاً ثم أزرار الحفظ، بنصوصها الكاملة.
  // (بلا ملء الشاشة: لا عرض Full Screen على الموبايل.)
  // الوضع النشط معطّل (إشارة بصرية للحالي — واختياره أصلاً بلا أثر).
  const menuItems: readonly BottomListItem[] = [
    {
      id: 'view-single',
      label: t('documentLibrary.singlePageViewTitle'),
      icon: <FileText size={20} />,
      disabled: viewMode === 'single',
    },
    {
      id: 'view-all',
      label: t('documentLibrary.allPagesViewTitle'),
      icon: <Files size={20} />,
      disabled: viewMode === 'all',
    },
    {
      id: 'save-original',
      label: t('documentLibrary.savePdfTitle'),
      icon: <Download size={20} />,
    },
    {
      id: 'save-png',
      label: t('documentLibrary.savePagePngTitle'),
      icon: <ImageDown size={20} />,
      disabled: actionsDisabled,
    },
    {
      id: 'save-pdf',
      label: t('documentLibrary.savePagePdfTitle'),
      icon: <FileText size={20} />,
      disabled: actionsDisabled,
    },
    {
      id: 'share',
      label: t('documentManager.shareBtn'),
      icon: <Share2 size={20} />,
    },
  ]

  const handleMenuSelect = (item: BottomListItem) => {
    if (item.id === 'view-single') onViewModeChange('single')
    else if (item.id === 'view-all') onViewModeChange('all')
    else if (item.id === 'save-original') onSaveOriginal?.()
    else if (item.id === 'save-png') onSavePageImage?.()
    else if (item.id === 'save-pdf') onSavePagePdf?.()
    else if (item.id === 'share') onShareOriginal?.()
  }

  return (
    <header className="pdf-viewer-header no-icon-scale" dir="ltr">
      <div className="pdf-view-tools">
        {/* مجموعة التنقل بين الصفحات */}
        <div className="pdf-page-controls">
          {/* أسهم عمودية محايدة الاتجاه: للأعلى = السابق، للأسفل = التالي —
             سلوك واحد في العربية والإنجليزية بلا تفرعات. */}
          <Tooltip content={t('documentLibrary.prevPageTitle')}>
            <button
              type="button"
              className="viewer-icon-button"
              onClick={() => onGoToPage(pageNumber - 1)}
              disabled={prevDisabled}
              aria-label={t('documentLibrary.prevPageTitle')}
            >
              <ChevronUp size={22} />
            </button>
          </Tooltip>
          <label className="pdf-page-count" dir="rtl">
            <span className="pdf-page-word">{t('documentLibrary.pageLabel')}</span>
            <input
              className="pdf-page-input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pageDraft}
              aria-label={t('documentLibrary.pageInputAria')}
              onChange={(event) => setPageDraft(event.target.value.replace(/[^0-9]/g, ''))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  commitPageDraft()
                }
              }}
              onBlur={() => setPageDraft(String(pageNumber))}
            />
            <span className="pdf-page-of">
              <span className="pdf-page-of-word">{t('documentLibrary.pageOfWord')} </span>
              {pageCount || '—'}
            </span>
          </label>
          <Tooltip content={t('documentLibrary.nextPageTitle')}>
            <button
              type="button"
              className="viewer-icon-button"
              onClick={() => onGoToPage(pageNumber + 1)}
              disabled={nextDisabled}
              aria-label={t('documentLibrary.nextPageTitle')}
            >
              <ChevronDown size={22} />
            </button>
          </Tooltip>
        </div>

        {/* مجموعة أوضاع العرض */}
        <div className="pdf-view-modes" role="group" aria-label={t('documentLibrary.viewModeGroupAria')} dir="rtl">
          <Tooltip content={t('documentLibrary.singlePageViewTitle')}>
            <button
              className={`pdf-view-mode${viewMode === 'single' ? ' is-active' : ''}`}
              type="button"
              aria-label={t('documentLibrary.singlePageViewTitle')}
              aria-pressed={viewMode === 'single'}
              onClick={() => onViewModeChange('single')}
            >
              <FileText size={22} />
            </button>
          </Tooltip>
          <Tooltip content={t('documentLibrary.allPagesViewTitle')}>
            <button
              className={`pdf-view-mode${viewMode === 'all' ? ' is-active' : ''}`}
              type="button"
              aria-label={t('documentLibrary.allPagesViewTitle')}
              aria-pressed={viewMode === 'all'}
              onClick={() => onViewModeChange('all')}
            >
              <Files size={22} />
            </button>
          </Tooltip>
        </div>

        {/* مجموعة التكبير/التصغير */}
        <div className="pdf-zoom-controls" role="group" aria-label={t('documentLibrary.zoomGroupAria')}>
          <Tooltip content={t('documentLibrary.zoomOutTitle')}>
            <button
              type="button"
              className="viewer-icon-button"
              onClick={() => onZoomChange(Math.max(MIN_ZOOM, Number((zoom - ZOOM_STEP).toFixed(1))))}
              disabled={zoom <= MIN_ZOOM}
              aria-label={t('documentLibrary.zoomOutTitle')}
            >
              <ZoomOut size={22} />
            </button>
          </Tooltip>
          <span className="pdf-zoom-label">{Math.round(zoom * 100)}%</span>
          <Tooltip content={t('documentLibrary.zoomInTitle')}>
            <button
              type="button"
              className="viewer-icon-button"
              onClick={() => onZoomChange(Math.min(MAX_ZOOM, Number((zoom + ZOOM_STEP).toFixed(1))))}
              disabled={zoom >= MAX_ZOOM}
              aria-label={t('documentLibrary.zoomInTitle')}
            >
              <ZoomIn size={22} />
            </button>
          </Tooltip>
        </div>
        {/* زر قائمة الإجراءات المخفية — وضع المعاينة (bare) فقط، ويُعرض على الموبايل عبر CSS */}
        {bare && (
          <Tooltip content={t('documentLibrary.pdfActionsMenuTitle')}>
            <button
              type="button"
              className="viewer-icon-button pdf-menu-btn"
              onClick={() => setMenuOpen(true)}
              aria-label={t('documentLibrary.pdfActionsMenuTitle')}
              aria-haspopup="dialog"
            >
              <Menu size={22} />
            </button>
          </Tooltip>
        )}
      </div>

      {/* أزرار الإجراءات — لا تظهر في وضع المعاينة (bare) */}
      {!bare && (
        <div className="pdf-actions">
          <Tooltip content={isFullscreen ? t('documentLibrary.exitFullscreenTitle') : t('documentLibrary.fullscreenTitle')}>
            <button
              type="button"
              className="pdf-action"
              onClick={onToggleFullscreen}
              aria-label={isFullscreen ? t('documentLibrary.exitFullscreenTitle') : t('documentLibrary.fullscreenTitle')}
              aria-pressed={isFullscreen}
            >
              {isFullscreen ? <Minimize size={22} /> : <Expand size={22} />}
            </button>
          </Tooltip>
          <Tooltip content={t('documentLibrary.savePdfTitle')}>
            <button type="button" className="pdf-action" onClick={onSaveOriginal} aria-label={t('documentLibrary.savePdfTitle')}>
              <Download size={22} />
            </button>
          </Tooltip>
          <Tooltip content={t('documentLibrary.savePagePngTitle')}>
            <button
              type="button"
              className="pdf-action pdf-action-primary"
              onClick={onSavePageImage}
              disabled={actionsDisabled}
              aria-label={t('documentLibrary.savePageAsImageAria')}
            >
              <ImageDown size={22} />
            </button>
          </Tooltip>
          <Tooltip content={t('documentLibrary.savePagePdfTitle')}>
            <button
              type="button"
              className="pdf-action"
              onClick={onSavePagePdf}
              disabled={actionsDisabled}
              aria-label={t('documentLibrary.savePagePdfTitle')}
            >
              <FileText size={22} />
            </button>
          </Tooltip>
        </div>
      )}
      {bare && (
        <BottomList
          open={menuOpen}
          items={menuItems}
          onClose={() => setMenuOpen(false)}
          onSelect={handleMenuSelect}
          title={t('documentLibrary.pdfActionsMenuTitle')}
          ariaLabel={t('documentLibrary.pdfActionsMenuTitle')}
        />
      )}
    </header>
  )
}
