// مودال اختيار نوع النص — يُفتَح من عنصر «النوع» في قائمة BottomList لعارض النصوص.
// اختيار واحد فقط (تلقائي + الأنواع الثمانية)، والنشط موسوم بـ Check.
// يُرسَم عبر portal (كـ FileExtensionModal) لأن section.records-section المتحرك
// (animation يُبقي transform) يحبس position:fixed داخله فيخرج المودال عن الشاشة.
import { createPortal } from 'react-dom'
import { Check, FileText, X } from 'lucide-react'
import { Tooltip } from '../../components/Tooltip'
import { useLanguage } from '../../language/LanguageContext'
import type { TextKind } from './TextFileViewer'

type TextKindModalProps = {
  isOpen: boolean
  onClose: () => void
  kinds: readonly TextKind[]
  /** النشط حالياً ('auto' أو نوع صريح). */
  activeKind: 'auto' | TextKind
  title: string
  autoLabel: string
  kindLabel: (kind: TextKind) => string
  onSelect: (kind: 'auto' | TextKind) => void
}

export default function TextKindModal({
  isOpen,
  onClose,
  kinds,
  activeKind,
  title,
  autoLabel,
  kindLabel,
  onSelect,
}: TextKindModalProps) {
  const { t } = useLanguage()

  if (!isOpen || typeof document === 'undefined') return null

  const pick = (kind: 'auto' | TextKind) => {
    onSelect(kind)
    onClose()
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="text-kind-title">
      <div className="modal-card text-kind-modal no-icon-scale" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2 id="text-kind-title">{title}</h2>
          <Tooltip content={t('pageRepoViewer.closeAria')}>
          <button type="button" className="modal-close" onClick={onClose} aria-label={t('pageRepoViewer.closeAria')}>
            <X size={22} style={{ color: '#c8443c' }} />
          </button>
          </Tooltip>
        </header>
        <div className="modal-body">
          <button
            type="button"
            className={`document-item${activeKind === 'auto' ? ' is-active' : ''}`}
            aria-pressed={activeKind === 'auto'}
            onClick={() => pick('auto')}
          >
            <span className="document-item-icon">
              <FileText size={20} strokeWidth={1.7} aria-hidden="true" />
            </span>
            <span className="document-item-copy">
              <span className="document-item-title">{autoLabel}</span>
            </span>
            {activeKind === 'auto' && <Check size={18} strokeWidth={2.2} aria-hidden="true" />}
          </button>
          {kinds.map((kind) => {
            const isActive = activeKind === kind
            return (
              <button
                key={kind}
                type="button"
                className={`document-item${isActive ? ' is-active' : ''}`}
                aria-pressed={isActive}
                onClick={() => pick(kind)}
              >
                <span className="document-item-icon">
                  <FileText size={20} strokeWidth={1.7} aria-hidden="true" />
                </span>
                <span className="document-item-copy">
                  <span className="document-item-title">{kindLabel(kind)}</span>
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
