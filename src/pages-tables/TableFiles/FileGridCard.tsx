// بطاقة ملف واحدة — بأسلوب كارد جهة الاتصال: أفاتار بأيقونة نوع الملف
// + العنوان + أزرار (معاينة/معلومات/تعديل/حذف)، وسطر الحجم والمالك والتصنيف.
// في وضع التحديد تُخفى الأزرار الأربعة ويظهر زر تشيك مخصص فقط.
import { useRef, useState } from 'react'
import { Check, Eye, Info, Pencil, Trash2 } from 'lucide-react'
import { Tooltip } from '../../components/Tooltip'
import { useLanguage } from '../../language/LanguageContext'
import { formatSize } from '../../lib/documents'
import type { RepoDocument } from '../../repos/repoService'
import FileTypeIcon from './FileTypeIcon'
import FileInfoModal from './FileInfoModal'

type FileGridCardProps = {
  doc: RepoDocument
  isPreview: boolean
  busy: boolean
  ownerName: string
  categoryName: string
  onPreview: () => void
  onEdit: () => void
  onDelete: () => void
  /** وضع التحديد: إخفاء الأزرار الأربعة وعرض زر التشيك فقط. */
  selectMode?: boolean
  selected?: boolean
  onToggleSelect?: () => void
  /** الضغط المطول على البطاقة: دخول وضع التحديد مع تحديد هذا الملف. */
  onLongPressSelect?: () => void
}

export default function FileGridCard({
  doc,
  isPreview,
  busy,
  ownerName,
  categoryName,
  onPreview,
  onEdit,
  onDelete,
  selectMode = false,
  selected = false,
  onToggleSelect,
  onLongPressSelect,
}: FileGridCardProps) {
  const { t } = useLanguage()
  const [infoOpen, setInfoOpen] = useState(false)
  /** مؤقت الضغط المطول (500ms) + راية لابتلاع النقرة التي تليه. */
  const pressTimer = useRef<number | null>(null)
  const longFired = useRef(false)
  const clearPress = () => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }
  const startPress = () => {
    if (selectMode || busy || !onLongPressSelect) return
    longFired.current = false
    clearPress()
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null
      longFired.current = true
      onLongPressSelect()
    }, 500)
  }
  return (
    <article
      role="listitem"
      className={`account-card${isPreview || selected ? ' border-[#76a68c] bg-[#edf4ef] dark:border-[#4a5a52] dark:bg-[#242428]' : ''}`}
      onTouchStart={startPress}
      onTouchMove={clearPress}
      onTouchEnd={clearPress}
      onTouchCancel={clearPress}
      onMouseDown={startPress}
      onMouseUp={clearPress}
      onMouseLeave={clearPress}
      onClickCapture={(e) => {
        if (longFired.current) {
          longFired.current = false
          e.preventDefault()
          e.stopPropagation()
        }
      }}
    >
      <FileInfoModal isOpen={infoOpen} onClose={() => setInfoOpen(false)} doc={doc} ownerName={ownerName} categoryName={categoryName} />
      <h4 className="account-title">
        <span className="grid size-12 flex-none place-items-center overflow-hidden rounded-lg" aria-hidden="true">
          <FileTypeIcon fileName={doc.fileName} category={doc.category} />
        </span>
        <Tooltip content={doc.title} className="min-w-0 flex-1">
          <span className="block truncate" dir="auto">{doc.title}</span>
        </Tooltip>
        {selectMode ? (
          <Tooltip content={selected ? t('documentManager.cancelSelectBtn') : t('documentManager.selectBtn')}>
            <button
              type="button"
              className="flex-none"
              disabled={busy}
              aria-label={doc.title}
              aria-pressed={selected}
              onClick={onToggleSelect}
              style={{ background: 'transparent', border: 'none', padding: 0, cursor: busy ? 'default' : 'pointer' }}
            >
              <span
                aria-hidden="true"
                className="grid size-5 place-items-center rounded border transition-colors"
                style={{
                  borderColor: selected ? '#16715f' : 'var(--line)',
                  background: selected ? '#16715f' : 'transparent',
                  color: '#fff',
                }}
              >
                {selected && <Check size={14} strokeWidth={3} color="#fff" />}
              </span>
            </button>
          </Tooltip>
        ) : (
        <>
        <Tooltip content={t('documentManager.previewBtn')}>
        <button
          type="button"
          className="edit-button"
          disabled={busy}
          aria-label={t('documentManager.previewBtn')}
          aria-pressed={isPreview}
          onClick={onPreview}
        >
          <Eye size={14} />
        </button>
        </Tooltip>
        <Tooltip content={t('documentManager.infoBtn')}>
        <button
          type="button"
          className="edit-button"
          disabled={busy}
          aria-label={t('documentManager.infoBtn')}
          onClick={() => setInfoOpen(true)}
        >
          <Info size={14} />
        </button>
        </Tooltip>
        <Tooltip content={t('documentManager.editBtn')}>
        <button
          type="button"
          className="edit-button"
          disabled={busy}
          aria-label={t('documentManager.editBtn')}
          onClick={onEdit}
        >
          <Pencil size={14} />
        </button>
        </Tooltip>
        <Tooltip content={t('documentManager.deleteBtn')} tone="danger">
        <button
          type="button"
          className="edit-button"
          disabled={busy}
          aria-label={t('documentManager.deleteBtn')}
          onClick={onDelete}
        >
          <Trash2 size={14} />
        </button>
        </Tooltip>
        </>
        )}
      </h4>
      <p className="mt-1 truncate text-[0.6875rem] text-[#84908c] dark:text-[#b0b0b6]" dir="auto">
        {formatSize(doc.sizeBytes)} · {ownerName} · {categoryName}
      </p>
    </article>
  )
}
