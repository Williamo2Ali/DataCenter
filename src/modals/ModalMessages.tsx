// مودال رسائل عام بثيم التطبيق (فاتح/داكن) — بديل window.confirm:
// 5 أنواع × 1-3 أزرار، حبس تركيز، إغلاق Esc/خلفية، ورسم portal خارج الأقسام المتحركة.
// (اعتُمد بعد توحيد ثيمه على متغيرات index.css وإزالة الكلاسز الدخيلة).
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Info,
  OctagonAlert,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Tooltip } from '../components/Tooltip'
import { useLanguage, type TranslateFn } from '../language/LanguageContext'

export type ModalMessagesVariant = 'success' | 'danger' | 'warning' | 'info' | 'question'

export type ModalMessagesButtonVariant =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'success'
  | 'ghost'

export interface ModalMessagesButton {
  /** معرّف اختياري يصل مع حدث الضغط */
  id?: string | undefined
  /** نص الزر */
  label: string
  /** نمط ألوان الزر (يُطابَق على أزرار التطبيق) */
  variant?: ModalMessagesButtonVariant
  /** أيقونة اختيارية داخل الزر */
  icon?: ReactNode
  /** هل يُغلق المودال بعد الضغط؟ (افتراضيًا نعم) */
  closeOnClick?: boolean
  /** هل يتركّز عليه عند الفتح؟ */
  autoFocus?: boolean
  disabled?: boolean
  onClick?: (info: ModalMessagesClickInfo) => void
}

export interface ModalMessagesClickInfo {
  id?: string | undefined
  label: string
  index: number
  button: ModalMessagesButton
}

export interface ModalMessagesProps {
  isOpen: boolean
  onClose: () => void
  /** نص الترويسة */
  title?: string
  /** النص الرئيسي داخل المودال */
  message?: ReactNode
  /** سطر تفصيلي ثانوي تحت النص الرئيسي */
  details?: ReactNode
  /** نوع الرسالة: يحدد الأيقونة واللون */
  variant?: ModalMessagesVariant
  /** الأزرار — الحد الأدنى 1 والحد الأقصى 3 */
  buttons?: ModalMessagesButton[]
  /** حدث عام يُستدعى عند ضغط أي زر */
  onButtonClicked?: (info: ModalMessagesClickInfo) => void
  /** إظهار زر الإغلاق X في الترويسة */
  showCloseButton?: boolean
  /** الإغلاق بالضغط على الخلفية */
  closeOnBackdrop?: boolean
  /** الإغلاق بمفتاح Esc */
  closeOnEsc?: boolean
  /** عرض المودال */
  size?: 'sm' | 'md' | 'lg'
  /** محتوى إضافي (حقول، جداول، ...) */
  children?: ReactNode
  /** استبدال الأيقونة الافتراضية */
  icon?: ReactNode
  /** إظهار أيقونة النوع داخل جسم المودال */
  showIcon?: boolean
  /** نص بديل للترويسة يُقرأ من قارئ الشاشة */
  ariaLabel?: string
}

export const MESSAGE_MODAL_MAX_BUTTONS = 3

/** لون التمييز لكل نوع — من متغيرات الثيم فقط (يتبع الفاتح والداكن). */
const VARIANT_META: Record<ModalMessagesVariant, { Icon: LucideIcon; color: string }> = {
  success: { Icon: CheckCircle2, color: 'var(--green)' },
  danger: { Icon: OctagonAlert, color: '#c8443c' },
  warning: { Icon: AlertTriangle, color: 'var(--orange)' },
  info: { Icon: Info, color: 'var(--green)' },
  question: { Icon: HelpCircle, color: 'var(--ink)' },
}

/** مطابقة أنماط الأزرار على أزرار التطبيق (modal-btn-*). */
function buttonClassName(variant: ModalMessagesButtonVariant = 'secondary'): string {
  switch (variant) {
    case 'primary':
    case 'success':
      return 'modal-btn modal-btn-primary'
    case 'danger':
      return 'modal-btn modal-btn-danger'
    default:
      return 'modal-btn modal-btn-secondary'
  }
}

const SIZE_MAX_WIDTH: Record<NonNullable<ModalMessagesProps['size']>, number> = {
  sm: 340,
  md: 420,
  lg: 560,
}

export default function ModalMessages({
  isOpen,
  onClose,
  title,
  message,
  details,
  variant = 'info',
  buttons,
  onButtonClicked,
  showCloseButton = true,
  closeOnBackdrop = true,
  closeOnEsc = true,
  size = 'md',
  children,
  icon,
  showIcon = true,
  ariaLabel,
}: ModalMessagesProps) {
  const { t } = useLanguage()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const resolvedTitle = title ?? t('modalMessages.defaultTitle')
  const closeLabel = t('modalMessages.close')

  const resolvedButtons = useMemo(() => {
    const list = (buttons ?? [])
      .filter((button) => button && typeof button.label === 'string' && button.label.length > 0)
      .slice(0, MESSAGE_MODAL_MAX_BUTTONS)
    return list.length > 0 ? list : [{ id: 'close', label: closeLabel, variant: 'secondary' as const }]
  }, [buttons, closeLabel])

  const meta = VARIANT_META[variant]

  useEffect(() => {
    if (!isOpen) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const dialog = panelRef.current
    // التذييل أولاً: زر الإغلاق في الترويسة مغلف بـ Tooltip فيُظهر تلميحه
    // تلقائياً عند التركيز البرمجي — وأزرار التذييل بلا تلميح.
    const focusTarget =
      dialog?.querySelector<HTMLElement>("[data-autofocus='true']") ??
      dialog?.querySelector<HTMLElement>('.modal-footer button:not(:disabled)') ??
      dialog?.querySelector<HTMLElement>('button:not(:disabled)') ??
      dialog
    focusTarget?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closeOnEsc) {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !dialog) return

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          "button:not(:disabled), [href], input:not(:disabled), select, textarea, [tabindex]:not([tabindex='-1'])",
        ),
      ).filter((element) => element.offsetParent !== null)
      if (focusable.length === 0) return

      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus?.()
    }
  }, [isOpen, closeOnEsc, onClose])

  if (!isOpen || typeof document === 'undefined') return null

  const handleClick = (button: ModalMessagesButton, index: number) => {
    const info: ModalMessagesClickInfo = {
      id: button.id,
      label: button.label,
      index,
      button,
    }
    button.onClick?.(info)
    onButtonClicked?.(info)
    if (button.closeOnClick !== false) onClose()
  }

  const panel = (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={() => {
        if (closeOnBackdrop) onClose()
      }}
    >
      <div
        ref={panelRef}
        className="modal-card"
        style={{ maxWidth: SIZE_MAX_WIDTH[size] }}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? resolvedTitle}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>{resolvedTitle}</h2>
          {showCloseButton ? (
            <Tooltip content={closeLabel}>
            <button type="button" className="modal-close" onClick={onClose} aria-label={closeLabel}>
              <X size={18} />
            </button>
            </Tooltip>
          ) : null}
        </header>
        <div className="modal-body">
          {(showIcon || message || details) && (
            <div className="flex items-start gap-4">
              {showIcon ? (
                <span
                  aria-hidden="true"
                  className="grid size-11 flex-none place-items-center rounded-full border"
                  style={{
                    color: meta.color,
                    background: `color-mix(in srgb, ${meta.color} 10%, var(--paper))`,
                    borderColor: `color-mix(in srgb, ${meta.color} 35%, transparent)`,
                  }}
                >
                  {icon ?? <meta.Icon size={24} aria-hidden="true" />}
                </span>
              ) : null}
              <div className="min-w-0 flex-1">
                {message ? <p className="modal-message">{message}</p> : null}
                {details ? <p className="modal-hint">{details}</p> : null}
              </div>
            </div>
          )}
          {children}
        </div>
        <footer className={`modal-footer${resolvedButtons.length > 1 ? ' equal-btns' : ''}`}>
          {resolvedButtons.map((button, index) => (
            <button
              key={`${button.id ?? button.label}-${index}`}
              type="button"
              data-autofocus={button.autoFocus ? 'true' : undefined}
              disabled={button.disabled}
              onClick={() => handleClick(button, index)}
              className={buttonClassName(button.variant)}
            >
              {button.icon}
              <span>{button.label}</span>
            </button>
          ))}
        </footer>
      </div>
    </div>
  )

  return createPortal(panel, document.body)
}

/* ====== أمثلة جاهزة (presets) — النصوص من لغة التطبيق عبر t ====== */

export const ModalMessagesPresets = {
  save: (t: TranslateFn, overrides: Partial<ModalMessagesProps> = {}): Partial<ModalMessagesProps> => ({
    title: t('modalMessages.saveTitle'),
    variant: 'success',
    message: t('modalMessages.saveMessage'),
    details: t('modalMessages.saveDetails'),
    buttons: [
      { id: 'save', label: t('modalMessages.saveBtn'), variant: 'primary', autoFocus: true },
      { id: 'cancel', label: t('modalMessages.cancelBtn'), variant: 'secondary' },
    ],
    ...overrides,
  }),
  delete: (t: TranslateFn, overrides: Partial<ModalMessagesProps> = {}): Partial<ModalMessagesProps> => ({
    title: t('modalMessages.deleteTitle'),
    variant: 'danger',
    message: t('modalMessages.deleteMessage'),
    details: t('modalMessages.deleteDetails'),
    buttons: [
      { id: 'cancel', label: t('modalMessages.cancelBtn'), variant: 'secondary', autoFocus: true },
      { id: 'delete', label: t('modalMessages.deleteBtn'), variant: 'danger' },
    ],
    ...overrides,
  }),
  notice: (t: TranslateFn, message: string, overrides: Partial<ModalMessagesProps> = {}): Partial<ModalMessagesProps> => ({
    title: t('modalMessages.noticeTitle'),
    variant: 'warning',
    message,
    buttons: [{ id: 'ok', label: t('modalMessages.okBtn'), variant: 'primary', autoFocus: true }],
    ...overrides,
  }),
}
