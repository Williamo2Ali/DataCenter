// صفحة معاينة الملف — تحل محل شبكة المحفوظات عند فتح معاينة: شريط علوي
// (رجوع + عنوان + حفظ/مشاركة على الديسكتوب؛ الأزرار في هيدر الموبايل)
// والمحتوى مباشر بلا كارد داخلية (PDF/صور/فيديو عارية).
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, Download, Play, Share2 } from 'lucide-react'
import { useToast } from 'react-theme-toast'
import { Tooltip } from '../../components/Tooltip'
import { useLanguage } from '../../language/LanguageContext'
import { fileKindOf, formatSize, isAudioFile, isHtmlFile, isOfficeFile, isVideoFile, PREVIEW_MAX_BYTES, sniffFileExtension, TEXT_PREVIEW_MAX_BYTES, VIDEO_PREVIEW_BYTES } from '../../lib/documents'
import { isAndroidPlatform, usePlatform } from '../../lib/platform'
import { readHeadBytes } from '../../lib/fileCopy'
import { repoFileAbsPath, resolveRepoFileUrl, type RepoDocument } from '../../repos/repoService'
import FileSoundPlayer from './FileSoundPlayer'
import TextFileViewer from './TextFileViewer'
import HtmlFileViewer from './HtmlFileViewer'
import VideoThumbnail from './VideoThumbnail'

const PagePDFViewer = lazy(() => import('./PagePDFViewer'))
const PageImageViewer = lazy(() => import('./PageImageViewer'))
const PageVideoViewer = lazy(() => import('./PageVideoViewer'))

type FilePreviewPageProps = {
  doc: RepoDocument
  repoId: string
  ownerName: string
  busy: boolean
  /** صور شريط المصغرات (صور العرض الحالي وإلا كل الصور) + التبديل بينها. */
  thumbs: PreviewThumb[]
  onSelectThumb: (id: string) => void
  onBack: () => void
  onSave: () => void
  onShare: () => void
  /** حفظ بايتات مولّدة (صفحة PNG/PDF) — من PageTableFiles (مسار زر الهيدر نفسه). */
  onSaveBytes: (bytes: Uint8Array, fileName: string) => void
}

export type PreviewThumb = { id: string; title: string; fileName: string; sizeBytes: number }

/** زر مصغرة واحدة — يحل رابطه بنفسه. */
function ThumbButton({ active, title, fileName, sizeBytes, resolveFileUrl, activeRef, onSelect }: {
  active: boolean
  title: string
  fileName: string
  sizeBytes: number
  resolveFileUrl: (fileName: string) => Promise<string>
  activeRef: Ref<HTMLButtonElement>
  onSelect: () => void
}) {
  const isVideo = isVideoFile(fileName)
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    resolveFileUrl(fileName).then((u) => { if (live) setUrl(u) }).catch(() => {})
    return () => { live = false }
  }, [fileName, resolveFileUrl])
  return (
    <button
      type="button"
      ref={active ? activeRef : undefined}
      className={`thumb-item${active ? ' is-active' : ''}`}
      aria-label={title}
      aria-current={active || undefined}
      onClick={onSelect}
    >
      {isVideo ? (
        url ? (
          <VideoThumbnail key={fileName} src={url} fileName={fileName} sizeBytes={sizeBytes} />
        ) : (
          <span className="thumb-fallback" aria-hidden="true">{title.trim().slice(0, 1) || '…'}</span>
        )
      ) : url ? (
        <img src={url} alt="" aria-hidden="true" loading="lazy" />
      ) : (
        <span className="thumb-fallback" aria-hidden="true">{title.trim().slice(0, 1) || '…'}</span>
      )}
      {isVideo && (
        <span className="thumb-play" aria-hidden="true"><Play size={16} /></span>
      )}
    </button>
  )
}

export default function FilePreviewPage({ doc, repoId, ownerName, busy, thumbs, onSelectThumb, onBack, onSave, onShare, onSaveBytes }: FilePreviewPageProps) {
  const { t } = useLanguage()
  const toast = useToast()
  const isMobile = isAndroidPlatform(usePlatform())
  const kind = fileKindOf(doc.fileName)
  const previewKind = isVideoFile(doc.fileName) ? 'video' : kind
  const officeNoPreview = isOfficeFile(doc.fileName)
  useEffect(() => {
    if (officeNoPreview) toast.info(t('documentManager.officeNoPreview'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id])
  const resolveUrl = useCallback((fileName: string) => resolveRepoFileUrl(repoId, fileName), [repoId])
  const activeThumbRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    document.body.classList.add('is-file-preview')
    return () => document.body.classList.remove('is-file-preview')
  }, [])
  useEffect(() => {
    activeThumbRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [doc.id])
  const showStrip = (kind === 'image' || isVideoFile(doc.fileName)) && thumbs.length > 1
  /** فيديو كبير: نعطّل المعاينة المباشرة (تحميل Blob كامل يجمّد الهاتف) مع إبقاء التنزيل/المشاركة. */
  const tooLargeVideo = isVideoFile(doc.fileName) && (doc.sizeBytes ?? 0) > VIDEO_PREVIEW_BYTES
  /** فيديو ضخم: تنبيه فقط بلا زر معاينة — يُوجَّه للمشاركة إلى مشغّل خارجي. */
  const hugeVideo = isVideoFile(doc.fileName) && (doc.sizeBytes ?? 0) > PREVIEW_MAX_BYTES
  /** نص كبير: يُحمَّل كاملاً في الذاكرة قبل عرضه — فوق 5MB تنبيه فقط. */
  const tooLargeText = kind === 'text' && (doc.sizeBytes ?? 0) > TEXT_PREVIEW_MAX_BYTES
  /** موافقة صريحة على تحميل فيديو كبير رغم المخاطرة — تُصفَّر مع كل ملف. */
  const [forcePreview, setForcePreview] = useState(false)
  useEffect(() => {
    setForcePreview(false)
  }, [doc.id])
  /** رابط الملف النصي (يُحلّ من المستودع — العارض يجلبه بنفسه). */
  const [textUrl, setTextUrl] = useState<string | null>(null)
  useEffect(() => {
    if (fileKindOf(doc.fileName) !== 'text') {
      setTextUrl(null)
      return
    }
    let live = true
    setTextUrl(null)
    resolveRepoFileUrl(repoId, doc.fileName).then((u) => { if (live) setTextUrl(u) }).catch(() => {})
    return () => { live = false }
  }, [repoId, doc.fileName])
  /** ملفات قديمة بلا امتداد (content://): نكشف النوع من بصمة أول 64 بايت أصلياً —
      حتى تُعايَن ملفات الصوت المخزنة قبل دعم الكشف. */
  const [sniffedExt, setSniffedExt] = useState<string | null>(null)
  useEffect(() => {
    if (fileKindOf(doc.fileName) !== 'other' || isVideoFile(doc.fileName) || isAudioFile(doc.fileName)) {
      setSniffedExt(null)
      return
    }
    let live = true
    setSniffedExt(null)
    void (async () => {
      try {
        const abs = await repoFileAbsPath(repoId, doc.fileName)
        const ext = sniffFileExtension(await readHeadBytes(abs, 64))
        if (live) setSniffedExt(ext)
      } catch {
        if (live) setSniffedExt(null)
      }
    })()
    return () => { live = false }
  }, [repoId, doc.fileName])
  const previewIsAudio = isAudioFile(doc.fileName) || (sniffedExt !== null && isAudioFile(`a.${sniffedExt}`))
  /** صوت ضخم: فك الترميز والبث المباشر محفوفان بالمخاطر — تنبيه فقط مع بقاء التنزيل/المشاركة. */
  const hugeAudio = previewIsAudio && (doc.sizeBytes ?? 0) > PREVIEW_MAX_BYTES
  /** رابط الملف الصوتي (يُحلّ من المستودع — المشغل يبثّ مباشرة بلا تحميل كامل). */
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!previewIsAudio) {
      setAudioUrl(null)
      return
    }
    let live = true
    setAudioUrl(null)
    resolveRepoFileUrl(repoId, doc.fileName).then((u) => { if (live) setAudioUrl(u) }).catch(() => {})
    return () => { live = false }
  }, [repoId, doc.fileName, previewIsAudio])
  /** ملفات HTML: تُحلّ من المستودع — العارض يجلبها بنفسه عبر fetch. */
  const previewIsHtml = isHtmlFile(doc.fileName)
  const tooLargeHtml = previewIsHtml && (doc.sizeBytes ?? 0) > TEXT_PREVIEW_MAX_BYTES
  const [htmlUrl, setHtmlUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!previewIsHtml) {
      setHtmlUrl(null)
      return
    }
    let live = true
    setHtmlUrl(null)
    resolveRepoFileUrl(repoId, doc.fileName).then((u) => { if (live) setHtmlUrl(u) }).catch(() => {})
    return () => { live = false }
  }, [repoId, doc.fileName, previewIsHtml])

  return (
    <div className="file-section-card file-preview-page">
      {!isMobile && (
      <div className="preview-bar">
        <Tooltip content={t('documentManager.previewBackBtn')}>
        <button
          type="button"
          className="edit-button"
          aria-label={t('documentManager.previewBackBtn')}
          onClick={onBack}
        >
          <ArrowRight size={18} />
        </button>
        </Tooltip>
        <span className="min-w-0 flex-1 truncate" dir="auto">{doc.title}</span>
        <Tooltip content={t('documentLibrary.saveFileTitle')}>
        <button
          type="button"
          className="edit-button"
          disabled={busy}
          aria-label={t('documentLibrary.saveFileTitle')}
          onClick={onSave}
        >
          <Download size={17} />
        </button>
        </Tooltip>
        <Tooltip content={t('documentManager.shareBtn')}>
        <button
          type="button"
          className="edit-button"
          disabled={busy}
          aria-label={t('documentManager.shareBtn')}
          onClick={onShare}
        >
          <Share2 size={17} />
        </button>
        </Tooltip>
      </div>
      )}
      <div className={`preview-content preview-kind-${previewKind}`}>
        <Suspense fallback={<div className="documents-loading">{t('pageRepoViewer.documentsLoading')}</div>}>
          {kind === 'pdf' ? (
            <PagePDFViewer
              bare
              documents={[{
                id: doc.id,
                fileName: doc.fileName,
                title: doc.title,
                owner: ownerName,
                category: doc.category,
              }]}
              resolveFileUrl={(fileName) => resolveRepoFileUrl(repoId, fileName)}
              onSelectedTitleChange={() => {}}
              onShareOriginal={onShare}
              onSaveOriginalFile={onSave}
              onSaveBytes={onSaveBytes}
            />
          ) : kind === 'image' ? (
            <PageImageViewer
              fileName={doc.fileName}
              title={doc.title}
              resolveFileUrl={(fileName) => resolveRepoFileUrl(repoId, fileName)}
            />
          ) : kind === 'text' ? (
            tooLargeText ? (
              <div className="large-preview-notice">
                <p className="vault-empty">
                  {t('documentManager.textTooLargeNotice', { size: formatSize(doc.sizeBytes) })}
                </p>
              </div>
            ) : textUrl ? (
              <TextFileViewer
                key={doc.id}
                url={textUrl}
                fileName={doc.fileName}
                maxHeight="none"
              />
            ) : (
              <div className="documents-loading">{t('pageRepoViewer.documentsLoading')}</div>
            )
          ) : previewIsAudio ? (
            hugeAudio ? (
              <div className="large-preview-notice">
                <p className="vault-empty">
                  {t('documentManager.audioTooLargeNotice', { size: formatSize(doc.sizeBytes) })}
                </p>
              </div>
            ) : audioUrl ? (
              <FileSoundPlayer
                key={doc.id}
                src={audioUrl}
                fileName={doc.fileName}
                title={doc.title}
              />
            ) : (
              <div className="documents-loading">{t('pageRepoViewer.documentsLoading')}</div>
            )
          ) : isVideoFile(doc.fileName) ? (
            tooLargeVideo && !forcePreview ? (
              <div className="large-preview-notice">
                <p className="vault-empty">
                  {hugeVideo
                    ? t('documentManager.hugePreviewNotice', { size: formatSize(doc.sizeBytes) })
                    : t('documentManager.largePreviewNotice', { size: formatSize(doc.sizeBytes) })}
                </p>
                {!hugeVideo && (
                  <button
                    type="button"
                    className="add-field-btn"
                    onClick={() => setForcePreview(true)}
                  >
                    {t('documentManager.previewAnywayBtn')}
                  </button>
                )}
              </div>
            ) : (
              <PageVideoViewer
                fileName={doc.fileName}
                title={doc.title}
                resolveFileUrl={(fileName) => resolveRepoFileUrl(repoId, fileName)}
              />
            )
          ) : previewIsHtml ? (
            tooLargeHtml ? (
              <div className="large-preview-notice">
                <p className="vault-empty">
                  {t('documentManager.textTooLargeNotice', { size: formatSize(doc.sizeBytes) })}
                </p>
              </div>
            ) : htmlUrl ? (
              <HtmlFileViewer
                key={doc.id}
                url={htmlUrl}
              />
            ) : (
              <div className="documents-loading">{t('pageRepoViewer.documentsLoading')}</div>
            )
          ) : (
            <p className="vault-empty">{t('vaultPanel.noPreview')}</p>
          )}
        </Suspense>
      </div>
      {showStrip && typeof document !== 'undefined' && createPortal(
        <div
          className="thumb-strip thumb-strip-fixed"
          style={{ paddingBottom: 'calc(6px + env(safe-area-inset-bottom, 0px))' }}
          role="group"
          aria-label={t('documentManager.kind_image')}
        >
          {thumbs.map((thumb) => (
            <ThumbButton
              key={thumb.id}
              active={thumb.id === doc.id}
              title={thumb.title}
              fileName={thumb.fileName}
              sizeBytes={thumb.sizeBytes}
              resolveFileUrl={resolveUrl}
              activeRef={activeThumbRef}
              onSelect={() => onSelectThumb(thumb.id)}
            />
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}
