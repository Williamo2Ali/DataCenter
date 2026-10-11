import { useEffect, useRef, useState } from 'react'
import { Save, X } from 'lucide-react'
import { useLanguage } from '../language/LanguageContext'
import { Tooltip } from '../components/Tooltip'
import { ClearTextInput } from '../components/ClearTextInput'

// مودال إضافة/تعديل تبويب — الاسم العربي والاسم الإنكليزي كلاهما مطلوب.
// المعرّف (id) يُولَّد من الاسم العربي تلقائياً في Rust، فلا نطلب هنا.

export type TabValues = {
  title: string
  titleEn: string
}

type MoadAddFieldProps = {
  isOpen: boolean
  mode?: 'add' | 'edit'
  /** القيم الحالية عند التعديل. */
  initial?: TabValues
  onClose: () => void
  onSubmit: (values: TabValues) => void
}

export default function MoadAddField({ isOpen, mode = 'add', initial, onClose, onSubmit }: MoadAddFieldProps) {
  const { t } = useLanguage()
  const [title, setTitle] = useState('')
  const [titleEn, setTitleEn] = useState('')
  const [error, setError] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)

  // كل فتح يعيد التهيئة: وضع التعديل يبدأ من القيم الحالية، والإضافة من فراغ.
  useEffect(() => {
    if (!isOpen) return
    setTitle(initial?.title ?? '')
    setTitleEn(initial?.titleEn ?? '')
    setError('')
    const frame = requestAnimationFrame(() => titleRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [isOpen, initial])

  if (!isOpen) return null

  const handleSubmit = (event: { preventDefault: () => void }) => {
    event.preventDefault()
    const ar = title.trim()
    const en = titleEn.trim()
    if (!ar) {
      setError(t('moadAddField.arabicRequiredError'))
      return
    }
    if (!en) {
      setError(t('moadAddField.englishRequiredError'))
      return
    }
    onSubmit({ title: ar, titleEn: en })
  }

  const heading = mode === 'edit' ? t('moadAddField.editTitle') : t('moadAddField.addTitle')

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="add-tab-title">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2 id="add-tab-title">{heading}</h2>
          <Tooltip content={t('moadAddField.closeAria')}>
          <button type="button" className="modal-close" onClick={onClose} aria-label={t('moadAddField.closeAria')}>
            <X size={18} strokeWidth={2} />
          </button>
          </Tooltip>
        </header>

        <form onSubmit={handleSubmit} className="modal-body">
          {error && <p className="modal-error" role="alert">{error}</p>}

          <div className="modal-field">
            <label htmlFor="tab-title-ar" className="modal-label">{t('moadAddField.arabicLabel')}</label>
            <ClearTextInput
              id="tab-title-ar"
              ref={titleRef}
              className="modal-input"
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                if (error) setError('')
              }}
              placeholder={t('moadAddField.arabicPlaceholder')}
              autoComplete="off"
              maxLength={60}
              dir="auto"
            />
          </div>

          <div className="modal-field">
            <label htmlFor="tab-title-en" className="modal-label">{t('moadAddField.englishLabel')}</label>
            <ClearTextInput
              id="tab-title-en"
              className="modal-input"
              type="text"
              value={titleEn}
              onChange={(e) => {
                setTitleEn(e.target.value)
                if (error) setError('')
              }}
              placeholder={t('moadAddField.englishPlaceholder')}
              autoComplete="off"
              maxLength={60}
              dir="ltr"
            />
          </div>
        </form>

        <footer className="modal-footer equal-btns">
          <button type="button" className="modal-btn modal-btn-secondary" onClick={onClose}>
            <X size={16} /> {t('moadAddField.cancelBtn')}
          </button>
          <button type="button" className="modal-btn modal-btn-primary" onClick={handleSubmit}>
            <Save size={16} /> {mode === 'edit' ? t('moadAddField.saveBtn') : t('moadAddField.approveBtn')}
          </button>
        </footer>
      </div>
    </div>
  )
}