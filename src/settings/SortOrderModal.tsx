// مودال اختيار ترتيب المستودعات — يُفتَح من زر TextSelectButton في التبويب العام.
// اختيار واحد من 7 أوضاع، والنشط موسوم بـ Check.
// يُرسَم عبر portal كبقية مودالات التطبيق حتى لا يحبسه أي transform أب.
import { createPortal } from 'react-dom'
import { ArrowDownUp, Check, X } from 'lucide-react'
import { Tooltip } from '../components/Tooltip'
import { useLanguage } from '../language/LanguageContext'
import type { RepoSortMode } from '../lib/appSettings'

type SortOrderModalProps = {
  isOpen: boolean
  onClose: () => void
  options: readonly RepoSortMode[]
  activeValue: RepoSortMode
  title: string
  optionLabel: (mode: RepoSortMode) => string
  onSelect: (mode: RepoSortMode) => void
}

export default function SortOrderModal({
  isOpen,
  onClose,
  options,
  activeValue,
  title,
  optionLabel,
  onSelect,
}: SortOrderModalProps) {
  const { t } = useLanguage()

  if (!isOpen || typeof document === 'undefined') return null

  const pick = (mode: RepoSortMode) => {
    onSelect(mode)
    onClose()
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="sort-order-title">
      <div className="modal-card no-icon-scale" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2 id="sort-order-title">{title}</h2>
          <Tooltip content={t('pageRepoViewer.closeAria')}>
          <button type="button" className="modal-close" onClick={onClose} aria-label={t('pageRepoViewer.closeAria')}>
            <X size={22} style={{ color: '#c8443c' }} />
          </button>
          </Tooltip>
        </header>
        <div className="modal-body">
          {options.map((mode) => {
            const isActive = activeValue === mode
            return (
              <button
                key={mode}
                type="button"
                className={`document-item${isActive ? ' is-active' : ''}`}
                aria-pressed={isActive}
                onClick={() => pick(mode)}
              >
                <span className="document-item-icon">
                  <ArrowDownUp size={20} strokeWidth={1.7} aria-hidden="true" />
                </span>
                <span className="document-item-copy">
                  <span className="document-item-title">{optionLabel(mode)}</span>
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
