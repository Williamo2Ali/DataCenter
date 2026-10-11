// مودال مزامنة جهات الهاتف — خياران Radio (استيراد/تصدير) + موافق/إلغاء.
// (أندرويد فقط — التنفيذ الفعلي في صفحة جهات الاتصال بعد الاختيار.)
import { useEffect, useState } from 'react'
import { Save, X } from 'lucide-react'
import { Tooltip } from '../components/Tooltip'
import { useLanguage } from '../language/LanguageContext'

export type ContactSyncMode = 'import' | 'export'

type ModalContactSyncProps = {
  isOpen: boolean
  busy?: boolean
  onClose: () => void
  onSubmit: (mode: ContactSyncMode) => void
}

export default function ModalContactSync({ isOpen, busy, onClose, onSubmit }: ModalContactSyncProps) {
  const { t } = useLanguage()
  const [mode, setMode] = useState<ContactSyncMode>('import')

  useEffect(() => {
    if (isOpen) setMode('import')
  }, [isOpen])

  if (!isOpen) return null

  const option = (value: ContactSyncMode, id: string, labelKey: string) => (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-[#e8ede9] bg-[#f8faf8] p-3 dark:border-[#3b3b41] dark:bg-[#242428]"
    >
      <input
        id={id}
        type="radio"
        name="contact-sync-mode"
        className="size-4 flex-none accent-green"
        checked={mode === value}
        disabled={busy}
        onChange={() => setMode(value)}
      />
      <span className="text-[0.875rem] font-semibold" dir="auto">{t(labelKey)}</span>
    </label>
  )

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="contact-sync-title">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2 id="contact-sync-title">{t('modalContact.devicePickerTitle')}</h2>
          <Tooltip content={t('modalContact.closeAria')}>
          <button type="button" className="modal-close" onClick={onClose} disabled={busy} aria-label={t('modalContact.closeAria')}>
            <X size={18} />
          </button>
          </Tooltip>
        </header>
        <div className="modal-body">
          <div className="flex flex-col gap-2" role="radiogroup" aria-label={t('modalContact.devicePickerTitle')}>
            {option('import', 'sync-mode-import', 'modalContact.deviceImportBtn')}
            {option('export', 'sync-mode-export', 'modalContact.deviceExportBtn')}
          </div>
        </div>
        <footer className="modal-footer equal-btns">
          <button type="button" className="modal-btn modal-btn-secondary" onClick={onClose} disabled={busy}>
            <X size={16} /> {t('modalContact.cancelBtn')}
          </button>
          <button
            type="button"
            className="modal-btn modal-btn-primary"
            disabled={busy}
            onClick={() => onSubmit(mode)}
          >
            <Save size={16} /> {t('modalContact.syncOkBtn')}
          </button>
        </footer>
      </div>
    </div>
  )
}
