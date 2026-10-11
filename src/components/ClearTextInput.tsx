// حقل تحرير بزر مسح (X) — للوضع الطبيعي قراءة/كتابة فقط.
// X يظهر متى وُجدت قيمة (بلا شرط تركيز)، ويمسح النص كاملاً بضغطة
// واحدة دون لمس لوحة المفاتيح. بلا أي منطق حاوية — تمرير مباشر.
import { type ChangeEvent, type InputHTMLAttributes, type ReactNode, type Ref, type TextareaHTMLAttributes } from 'react'
import { X } from 'lucide-react'
import { useLanguage } from '../language/LanguageContext'
import { Tooltip } from './Tooltip'

type ClearTextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
  ref?: Ref<HTMLInputElement>
  /** زر إضافي بجانب زر المسح — يظهر معه (عند وجود قيمة فقط) على نفس الجهة. */
  endAction?: ReactNode
}

// اتجاه المحتوى الفعلي (أول حرف قوي) — الزر والحشوة يتبعانه دائماً،
// لا لغة الحقل الوصفية. يُطبَّق نفسه على الغلاف والحقل معاً حتى
// تتطابق جهة inset-inline-end للزر مع جهة نهاية النص.
const RTL_RE = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC\u0750-\u077F]/
const LTR_RE = /[A-Za-z\u00C0-\u024F\u0370-\u03FF]/

function detectContentDir(value: string): 'rtl' | 'ltr' | null {
  for (const ch of value) {
    if (RTL_RE.test(ch)) return 'rtl'
    if (LTR_RE.test(ch)) return 'ltr'
  }
  return null
}

export function ClearTextInput({ value, onChange, onFocus, onBlur, ref, lang, dir, endAction, ...rest }: ClearTextInputProps) {
  const { t } = useLanguage()
  const show = value !== ''
  // المحتوى أولاً، ثم dir الممرر (ltr القسري لكلمات المرور/الأرقام)، ثم auto.
  const contentDir = detectContentDir(value)
  const baseDir = dir === 'rtl' || dir === 'ltr' ? dir : 'auto'
  const resolvedDir = contentDir ?? baseDir
  return (
    <span className={`cleartext-wrap${value !== '' ? ' has-value' : ''}${value !== '' && endAction ? ' has-action' : ''}`} dir={resolvedDir}>
      <input
        {...rest}
        ref={ref}
        lang={lang}
        dir={resolvedDir}
        value={value}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      {show && (
        <span className="cleartext-actions">
          {endAction && <span className="cleartext-action">{endAction}</span>}
          <Tooltip content={t('common.clearInput')}>
            <button
              type="button"
              tabIndex={-1}
              className="cleartext-x"
              aria-label={t('common.clearInput')}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onChange({ target: { value: '' } } as unknown as ChangeEvent<HTMLInputElement>)}
            >
              <X size={14} strokeWidth={2.2} />
            </button>
          </Tooltip>
        </span>
      )}
    </span>
  )
}

type ClearTextAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void
}

export function ClearTextArea({ value, onChange, onFocus, onBlur, lang, dir, ...rest }: ClearTextAreaProps) {
  const { t } = useLanguage()
  const show = value !== ''
  const contentDir = detectContentDir(value)
  const baseDir = dir === 'rtl' || dir === 'ltr' ? dir : 'auto'
  const resolvedDir = contentDir ?? baseDir
  return (
    <span className={`cleartext-wrap${value !== '' ? ' has-value' : ''}`} dir={resolvedDir}>
      <textarea
        {...rest}
        lang={lang}
        dir={resolvedDir}
        value={value}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      {show && (
        <span className="cleartext-actions is-top">
          <Tooltip content={t('common.clearInput')}>
            <button
              type="button"
              tabIndex={-1}
              className="cleartext-x"
              aria-label={t('common.clearInput')}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onChange({ target: { value: '' } } as unknown as ChangeEvent<HTMLTextAreaElement>)}
            >
              <X size={14} strokeWidth={2.2} />
            </button>
          </Tooltip>
        </span>
      )}
    </span>
  )
}
