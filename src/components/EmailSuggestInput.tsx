// حقل إيميل بزر مزودات (@) بجانب زر المسح — المستخدم يكتب الاسم فقط
// (مثال willia) ثم يفتح الزر مودال المزودات الأشهر، والاختيار يملأ
// الحقل بالإيميل الكامل (willia@gmail.com). بلا قائمة تلقائية أثناء الكتابة.
// يُبنى على ClearTextInput (زر المسح + اتجاه المحتوى).
import { useState, type ChangeEvent, type InputHTMLAttributes } from 'react'
import { AtSign, X } from 'lucide-react'
import { ClearTextInput } from './ClearTextInput'
import { Tooltip } from './Tooltip'
import { useLanguage } from '../language/LanguageContext'

/** مزودات الإيميل الأكثر انتشاراً. */
export const EMAIL_PROVIDERS: readonly string[] = [
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'icloud.com',
  'proton.me',
  'aol.com',
]

type EmailSuggestInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: string
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
}

export function EmailSuggestInput({ value, onChange, disabled, ...rest }: EmailSuggestInputProps) {
  const { t } = useLanguage()
  const [pickerOpen, setPickerOpen] = useState(false)

  // الجزء المحلي: قبل @ إن وُجدت، وإلا القيمة كاملة (بدون فراغات).
  const trimmed = value.trim()
  const at = trimmed.indexOf('@')
  const local = (at === -1 ? trimmed : trimmed.slice(0, at)).replace(/\s+/g, '')

  const pick = (domain: string) => {
    if (!local) return
    onChange({ target: { value: `${local}@${domain}` } } as unknown as ChangeEvent<HTMLInputElement>)
    setPickerOpen(false)
  }

  return (
    <>
      <ClearTextInput
        {...rest}
        type="email"
        lang="en"
        dir="ltr"
        value={value}
        onChange={onChange}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        endAction={
          <Tooltip content={t('emailSuggest.title')}>
            <button
              type="button"
              tabIndex={-1}
              aria-label={t('emailSuggest.title')}
              aria-haspopup="dialog"
              disabled={disabled}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setPickerOpen(true)}
            >
              <AtSign size={14} strokeWidth={2.2} />
            </button>
          </Tooltip>
        }
      />
      {pickerOpen && (
        <div className="modal-overlay modal-overlay-wide" onClick={() => setPickerOpen(false)} role="dialog" aria-modal="true" aria-label={t('emailSuggest.title')}>
          <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h2>{t('emailSuggest.title')}</h2>
              <Tooltip content={t('emailSuggest.close')}>
                <button type="button" className="modal-close" onClick={() => setPickerOpen(false)} aria-label={t('emailSuggest.close')}>
                  <X size={18} />
                </button>
              </Tooltip>
            </header>
            <div className="modal-body">
              {!local && <p className="modal-hint">{t('emailSuggest.typeNameFirst')}</p>}
              <div role="group" aria-label={t('emailSuggest.title')} dir="ltr" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {EMAIL_PROVIDERS.map((domain) => (
                  <button
                    key={domain}
                    type="button"
                    className="modal-btn modal-btn-secondary"
                    disabled={!local}
                    onClick={() => pick(domain)}
                    dir="ltr"
                  >
                    @{domain}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
