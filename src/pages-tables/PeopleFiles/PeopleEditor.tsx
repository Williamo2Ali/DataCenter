// مودال الأشخاص (إضافة/تعديل) — مفصول من `PageTablePeople`.
// عرض فقط: الحالة والحوارات تعيش في الصفحة، وهذا المكوّن يرسم المودال.
import { Save, X } from 'lucide-react'
import { Tooltip } from '../../components/Tooltip'
import { ClearTextInput } from '../../components/ClearTextInput'
import { useLanguage } from '../../language/LanguageContext'

export type PeopleDialogState = {
  mode: 'add' | 'edit'
  id?: string
  name: string
  nameEn: string
  relation: string
  relationEn: string
}

type PeopleEditorProps = {
  dialog: PeopleDialogState
  busy: boolean
  onClose: () => void
  onChange: (patch: Partial<PeopleDialogState>) => void
  onSubmit: () => void
}

export default function PeopleEditor({ dialog, busy, onClose, onChange, onSubmit }: PeopleEditorProps) {
  const { t } = useLanguage()

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="peoples-dialog-title">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2 id="peoples-dialog-title">{dialog.mode === 'add' ? t('peoples.addTitle') : t('peoples.editTitle')}</h2>
          <Tooltip content={t('peoples.closeAria')}>
          <button type="button" className="modal-close" onClick={onClose} disabled={busy} aria-label={t('peoples.closeAria')}>
            <X size={18} />
          </button>
          </Tooltip>
        </header>
        <div className="modal-body">
          <div className="modal-field">
            <label htmlFor="peoples-name" className="modal-label">{t('peoples.nameLabel')}</label>
            <ClearTextInput
              id="peoples-name"
              type="text"
              className="modal-input"
              value={dialog.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder={t('peoples.namePlaceholder')}
              autoComplete="off"
              maxLength={80}
              dir="auto"
              autoFocus
            />
          </div>
          <div className="modal-field">
            <label htmlFor="peoples-name-en" className="modal-label">{t('peoples.nameEnLabel')}</label>
            <ClearTextInput
              id="peoples-name-en"
              type="text"
              className="modal-input"
              lang="en"
              value={dialog.nameEn}
              onChange={(e) => onChange({ nameEn: e.target.value })}
              placeholder={t('peoples.nameEnPlaceholder')}
              autoComplete="off"
              maxLength={80}
              dir="ltr"
            />
          </div>
          <div className="modal-field">
            <label htmlFor="peoples-relation" className="modal-label">{t('peoples.relationLabel')}</label>
            <ClearTextInput
              id="peoples-relation"
              type="text"
              className="modal-input"
              value={dialog.relation}
              onChange={(e) => onChange({ relation: e.target.value })}
              placeholder={t('peoples.relationPlaceholder')}
              autoComplete="off"
              maxLength={80}
              dir="auto"
            />
          </div>
          <div className="modal-field">
            <label htmlFor="peoples-relation-en" className="modal-label">{t('peoples.relationEnLabel')}</label>
            <ClearTextInput
              id="peoples-relation-en"
              type="text"
              className="modal-input"
              lang="en"
              value={dialog.relationEn}
              onChange={(e) => onChange({ relationEn: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') onSubmit() }}
              placeholder={t('peoples.relationEnPlaceholder')}
              autoComplete="off"
              maxLength={80}
              dir="ltr"
            />
          </div>
        </div>
        <footer className="modal-footer equal-btns">
          <button type="button" className="modal-btn modal-btn-secondary" onClick={onClose} disabled={busy}>
            <X size={16} /> {t('peoples.cancel')}
          </button>
          <button
            type="button"
            className="modal-btn modal-btn-primary"
            onClick={onSubmit}
            disabled={busy || !dialog.name.trim() || !dialog.nameEn.trim()}
          >
            <Save size={16} /> {dialog.mode === 'add' ? t('peoples.saveAdd') : t('peoples.saveEdit')}
          </button>
        </footer>
      </div>
    </div>
  )
}
