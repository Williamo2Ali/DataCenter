// أزرار عارض الجداول الفيزيائية: إدارة الحقول + تبديل لغة العرض + تعديل القيم.
// مكون مشترك للصفحات الأربع (جوازات/سجل مدني/هويات/شهادات).
// الصف الأول: إدارة الحقول 60% + تبديل اللغة 40% — عبر صنفي الغلاف
// (Tooltip يغلّف بزرقه داخل span فيكون الغلاف هو عنصر الـ flex).
import { Pencil } from 'lucide-react'
import { Tooltip } from './Tooltip'
import { useLanguage } from '../language/LanguageContext'
import type { FieldLang } from '../lib/appSettings'

type TableViewerActionsProps = {
  mutBusy: boolean
  fieldLang: FieldLang
  editingProfile: boolean
  onManageFields: () => void
  onFieldLangChange: (lang: FieldLang) => void
  onEditValues: () => void
}

export default function TableViewerActions({
  mutBusy,
  fieldLang,
  editingProfile,
  onManageFields,
  onFieldLangChange,
  onEditValues,
}: TableViewerActionsProps) {
  const { t } = useLanguage()
  return (
    <>
      <div className="viewer-actions-col">
        <div className="viewer-actions-row table-actions-row">
          <Tooltip className="table-actions-manage" content={t('pageRepoViewer.manageFieldsBtn')}>
            <button
              type="button"
              className="add-field-btn"
              disabled={mutBusy}
              onClick={onManageFields}
            >
              {t('pageRepoViewer.manageFieldsBtn')}
            </button>
          </Tooltip>
          <Tooltip
            className="table-actions-lang"
            content={fieldLang === 'ar' ? t('pageRepoViewer.showEnglishBtn') : t('pageRepoViewer.showArabicBtn')}
          >
            <button
              type="button"
              className="add-field-btn"
              disabled={mutBusy}
              onClick={() => onFieldLangChange(fieldLang === 'ar' ? 'en' : 'ar')}
            >
              {fieldLang === 'ar' ? t('pageRepoViewer.showEnglishBtn') : t('pageRepoViewer.showArabicBtn')}
            </button>
          </Tooltip>
        </div>
      </div>
      {!editingProfile && (
        <div className="viewer-actions-col">
          <button
            type="button"
            className="add-field-btn"
            disabled={mutBusy}
            onClick={onEditValues}
          >
            <Pencil size={15} /> {t('pageRepoViewer.editValuesBtn')}
          </button>
        </div>
      )}
    </>
  )
}
