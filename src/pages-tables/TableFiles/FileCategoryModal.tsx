// مودال ترشيح التصنيف للملفات — يُفتَح من أيقونة الفلتر في هيدر الموبايل.
// اختيار واحد (أو الكل) يضبط categoryFilter في الصفحة ثم يغلق.
// يُرسَم عبر portal (كـ ModalMessages) لأن section.records-section المتحرك
// (animation يُبقي transform) يحبس position:fixed داخله فيخرج المودال عن الشاشة.
import { createPortal } from 'react-dom'
import { Check, Tag, Tags, X } from 'lucide-react'
import { Tooltip } from '../../components/Tooltip'
import { useLanguage } from '../../language/LanguageContext'

type FileCategoryModalProps = {
  isOpen: boolean
  onClose: () => void
  cats: { key: string }[]
  activeKey: string
  /** إظهار صف «الكل» — يُخفى عند اختيار تصنيف ملف مجهز (لا تصنيف «كل» هناك). */
  showAll?: boolean
  allLabel: string
  catLabel: (key: string) => string
  onSelect: (key: string) => void
}

export default function FileCategoryModal({
  isOpen,
  onClose,
  cats,
  activeKey,
  showAll = true,
  allLabel,
  catLabel,
  onSelect,
}: FileCategoryModalProps) {
  const { t } = useLanguage()

  if (!isOpen || typeof document === 'undefined') return null

  const pick = (key: string) => {
    onSelect(key)
    onClose()
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="file-category-title">
      <div className="modal-card file-category-modal no-icon-scale" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2 id="file-category-title">{t('documentManager.categoryFilter')}</h2>
          <Tooltip content={t('pageRepoViewer.closeAria')}>
          <button type="button" className="modal-close" onClick={onClose} aria-label={t('pageRepoViewer.closeAria')}>
            <X size={22} style={{ color: '#c8443c' }} />
          </button>
          </Tooltip>
        </header>
        <div className="modal-body">
          {showAll && (
          <button
            type="button"
            className={`document-item${activeKey === 'all' ? ' is-active' : ''}`}
            aria-pressed={activeKey === 'all'}
            onClick={() => pick('all')}
          >
            <span className="document-item-icon">
              <Tags size={20} strokeWidth={1.7} aria-hidden="true" />
            </span>
            <span className="document-item-copy">
              <span className="document-item-title">{allLabel}</span>
            </span>
            {activeKey === 'all' && <Check size={18} strokeWidth={2.2} aria-hidden="true" />}
          </button>
          )}
          {cats.map((cat) => {
            const isActive = activeKey === cat.key
            return (
              <button
                key={cat.key}
                type="button"
                className={`document-item${isActive ? ' is-active' : ''}`}
                aria-pressed={isActive}
                onClick={() => pick(cat.key)}
              >
                <span className="document-item-icon">
                  <Tag size={20} strokeWidth={1.7} aria-hidden="true" />
                </span>
                <span className="document-item-copy">
                  <span className="document-item-title">{catLabel(cat.key)}</span>
                </span>
                {isActive && <Check size={18} strokeWidth={2.2} aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      </div>
    </div>,
    document.body,
  )
}
