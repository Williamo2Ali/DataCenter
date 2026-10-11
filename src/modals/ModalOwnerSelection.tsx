// مودال اختيار المالك — مشترك لكل التبويبات.
// الوضع المفرد: اختيار فرد نشط واحد (بقية التبويبات كما كانت).
// الوضع المتعدد: تحديد 1 أو 2 أو 3 أو الكل — لصفحة الملفات فقط.
// يُرسَم عبر portal لأن الأقسام المتحركة (transform مُبقاة) تحبس position:fixed.
import { createPortal } from 'react-dom'
import { useMemo } from 'react'
import { Check, UserRound, Users, X } from 'lucide-react'
import { Tooltip } from '../components/Tooltip'
import { useLanguage } from '../language/LanguageContext'
import { recordName, recordRelation } from '../lib/records'
import type { RepoPerson } from '../repos/repoService'

/** حالة التحديد المتعدد — يملكها الأب (PageRepoViewer) وتُمرَّر للصفحة والمودال معاً. */
export type OwnerMultiState = {
  selectedIds: Set<string>
  showAll: boolean
  onToggleMember: (id: string) => void
  onToggleAll: () => void
}

type ModalOwnerSelectionProps = {
  isOpen: boolean
  onClose: () => void
  members: RepoPerson[]
  mode: 'single' | 'multi'
  /** الوضع المفرد: المالك النشط حالياً. */
  selectedId?: string
  /** الوضع المفرد: اختيار فرد (الأب يغلق المودال بعده). */
  onSelect?: (id: string) => void
  /** الوضع المتعدد: الحالة المشتركة. */
  multi?: OwnerMultiState
  /** نص زر الكل — الافتراضي documentManager.kind_all. */
  allLabel?: string
}

export default function ModalOwnerSelection({
  isOpen,
  onClose,
  members,
  mode,
  selectedId,
  onSelect,
  multi,
  allLabel,
}: ModalOwnerSelectionProps) {
  const { t, lang } = useLanguage()
  const ordered = useMemo(
    () => [...members].sort((a, b) => a.sortOrder - b.sortOrder),
    [members],
  )

  if (!isOpen || typeof document === 'undefined') return null

  const allText = allLabel ?? t('documentManager.kind_all')
  /** زر التأكيد يظهر في المتعدد فقط بعد تحديد واحد على الأقل (مالك أو الكل). */
  const canConfirm = mode === 'multi' && multi !== undefined && (multi.showAll || multi.selectedIds.size > 0)

  return createPortal(
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="owner-selection-title">
      <div className="modal-card no-icon-scale" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2 id="owner-selection-title">{t('pageRepoViewer.membersListTitle')}</h2>
          <div className="flex items-center gap-1.5">
            {canConfirm && (
              <Tooltip content={t('pageRepoViewer.doneBtn')}>
              <button type="button" className="modal-close" onClick={onClose} aria-label={t('pageRepoViewer.doneBtn')}>
                <Check size={22} style={{ color: 'var(--green)' }} />
              </button>
              </Tooltip>
            )}
            <Tooltip content={t('pageRepoViewer.closeAria')}>
            <button type="button" className="modal-close" onClick={onClose} aria-label={t('pageRepoViewer.closeAria')}>
              <X size={22} style={{ color: '#c8443c' }} />
            </button>
            </Tooltip>
          </div>
        </header>
        <div className="modal-body">
          {mode === 'multi' && multi && (
            <>
              <button
                type="button"
                className={`document-item${multi.showAll ? ' is-active' : ''}`}
                aria-pressed={multi.showAll}
                onClick={multi.onToggleAll}
              >
                <span className="document-item-icon">
                  <Users size={20} strokeWidth={1.7} aria-hidden="true" />
                </span>
                <span className="document-item-copy">
                  <span className="document-item-title">{allText}</span>
                </span>
                {multi.showAll && <Check size={18} strokeWidth={2.2} aria-hidden="true" />}
              </button>
            </>
          )}
          {ordered.map((member) => {
            const isActive = mode === 'multi'
              ? (multi?.showAll || multi?.selectedIds.has(member.id) || false)
              : member.id === selectedId
            return (
              <button
                key={member.id}
                type="button"
                className={`document-item${isActive ? ' is-active' : ''}`}
                aria-current={isActive}
                disabled={mode === 'multi' && multi?.showAll}
                onClick={() => {
                  if (mode === 'multi') multi?.onToggleMember(member.id)
                  else onSelect?.(member.id)
                }}
              >
                <span className="document-item-icon">
                  <UserRound size={20} strokeWidth={1.7} aria-hidden="true" />
                </span>
                <span className="document-item-copy">
                  <span className="document-item-title">{recordName(member, lang)}</span>
                  <span className="document-item-owner">{recordRelation(member, lang) || '—'}</span>
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
