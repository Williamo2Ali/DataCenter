// مودال معلومات الملف — يُفتَح من زر (i) في بطاقة الملف:
// الاسم والعنوان والنوع والحجم والمالك والتصنيف وتواريخ الإضافة/التعديل.
// يُرسَم عبر portal (كبقية المودالات) لأن section.records-section المتحرك يحبس position:fixed.
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Tooltip } from '../../components/Tooltip'
import { useLanguage } from '../../language/LanguageContext'
import { formatSize, fileTypeGroup } from '../../lib/documents'
import type { RepoDocument } from '../../repos/repoService'
import FileTypeIcon from './FileTypeIcon'

function formatDate(tsSeconds: number, locale: string): string {
  if (!Number.isFinite(tsSeconds) || tsSeconds <= 0) return '—'
  try {
    return new Date(tsSeconds * 1000).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return ''
  }
}

type FileInfoModalProps = {
  isOpen: boolean
  onClose: () => void
  doc: RepoDocument
  ownerName: string
  categoryName: string
}

export default function FileInfoModal({ isOpen, onClose, doc, ownerName, categoryName }: FileInfoModalProps) {
  const { t, lang } = useLanguage()

  if (!isOpen || typeof document === 'undefined') return null

  const dot = doc.fileName.lastIndexOf('.')
  const ext = dot > 0 ? doc.fileName.slice(dot + 1).trim().toLowerCase() : ''
  const rows: Array<[string, string, boolean?, boolean?]> = [
    [t('documentManager.infoTitleRow'), doc.title],
    [t('documentManager.infoNameRow'), doc.fileName, true],
    [t('documentManager.infoTypeRow'), ext ? ext.toUpperCase() : t('documentManager.infoNoExt')],
    [t('documentManager.infoFileTypeRow'), t(`documentManager.fileTypeLabel_${fileTypeGroup(doc.filetype ?? '')}`)],
    [t('documentManager.infoSourceRow'), doc.sourcePath || '—', true, true],
    [t('documentManager.infoSizeRow'), formatSize(doc.sizeBytes)],
    [t('documentManager.infoOwnerRow'), ownerName],
    [t('documentManager.infoCategoryRow'), categoryName],
    [t('documentManager.infoCreatedRow'), formatDate(doc.createdAt, lang)],
    [t('documentManager.infoModifiedRow'), formatDate(doc.modifiedAt, lang)],
  ]

  return createPortal(
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="file-info-title">
      <div className="modal-card no-icon-scale" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2 id="file-info-title">{t('documentManager.infoTitle')}</h2>
          <Tooltip content={t('pageRepoViewer.closeAria')}>
          <button type="button" className="modal-close" onClick={onClose} aria-label={t('pageRepoViewer.closeAria')}>
            <X size={22} style={{ color: '#c8443c' }} />
          </button>
          </Tooltip>
        </header>
        <div className="modal-body">
          <div className="mb-2 flex items-center gap-2">
            <FileTypeIcon fileName={doc.fileName} category={doc.category} />
          </div>
          <dl className="flex flex-col gap-1.5">
            {rows.map(([label, value, ltr, wrap]) => (
              <div key={label} className="flex items-baseline justify-between gap-3">
                <dt className="flex-none text-[0.75rem] text-[var(--muted)]">{label}</dt>
                <dd
                  className={`min-w-0 flex-1 text-end text-[0.8125rem]${wrap ? '' : ' truncate'}`}
                  style={wrap ? { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } : undefined}
                  dir={ltr ? 'ltr' : 'auto'}
                >
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>,
    document.body,
  )
}
