// محرر بيانات الملف مضمّن داخل الكارد (بدل مودال التعديل) — العنوان + المالك
// (إجباري) + التصنيف، مع حفظ/إلغاء. الحالة داخلية تُصفَّر مع كل ملف عبر key.
import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { ClearTextInput } from '../../components/ClearTextInput'
import TextSelectButton from '../../components/Custom/TextSelectButton'
import { useLanguage } from '../../language/LanguageContext'
import { allCategories, categoryLabel } from '../../lib/documents'
import { recordName, recordRelation } from '../../lib/records'
import type { DocCategoryCustom, FieldLang } from '../../lib/appSettings'
import type { RepoDocument, RepoPerson } from '../../repos/repoService'
import FileCategoryModal from './FileCategoryModal'
import ModalOwnerSelection from '../../modals/ModalOwnerSelection'

export type DocumentValues = {
  title: string
  ownerRecordId: string | null
  category: string
}

type FileCardEditorProps = {
  doc: RepoDocument
  records: RepoPerson[]
  customs: DocCategoryCustom[]
  fieldLang: FieldLang
  busy?: boolean
  onCancel: () => void
  onSave: (values: DocumentValues) => void
}

export default function FileCardEditor({ doc, records, customs, fieldLang, busy, onCancel, onSave }: FileCardEditorProps) {
  const { t, lang } = useLanguage()
  const [title, setTitle] = useState(doc.title)
  const [ownerId, setOwnerId] = useState(doc.ownerRecordId ?? '')
  const [category, setCategory] = useState(doc.category)
  const [catOpen, setCatOpen] = useState(false)
  const [ownerOpen, setOwnerOpen] = useState(false)
  const cats = allCategories(customs)
  const catLabel = (key: string): string =>
    categoryLabel(key, fieldLang, customs, (k) => t(`documentManager.category_${k}`))
  const ordered = [...records].sort((a, b) => a.sortOrder - b.sortOrder)
  const ownerRec = ordered.find((rec) => rec.id === ownerId) ?? null
  const ownerText = ownerRec
    ? `${recordName(ownerRec, lang)}${recordRelation(ownerRec, lang) ? ` — ${recordRelation(ownerRec, lang)}` : ''}`
    : t('modalDocument.ownerLabel')
  const valid = title.trim() !== '' && ownerId !== ''

  return (
    <article className="account-card">
      <div className="modal-field">
        <label htmlFor={`file-edit-title-${doc.id}`} className="modal-label">{t('modalDocument.titleLabel')}</label>
        <ClearTextInput
          id={`file-edit-title-${doc.id}`}
          className="modal-input"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          dir="auto"
          maxLength={80}
          autoComplete="off"
          disabled={busy}
        />
      </div>
      <div className="modal-field">
        <label htmlFor={`file-edit-owner-${doc.id}`} className="modal-label">{t('modalDocument.ownerLabel')}</label>
        <TextSelectButton
          id={`file-edit-owner-${doc.id}`}
          ariaLabel={t('modalDocument.ownerLabel')}
          disabled={busy}
          open={ownerOpen}
          onClick={() => setOwnerOpen(true)}
        >
          {ownerText}
        </TextSelectButton>
        <ModalOwnerSelection
          isOpen={ownerOpen}
          onClose={() => setOwnerOpen(false)}
          members={records}
          mode="single"
          selectedId={ownerId}
          onSelect={(id) => { setOwnerId(id); setOwnerOpen(false) }}
        />
      </div>
      <div className="modal-field">
        <label htmlFor={`file-edit-category-${doc.id}`} className="modal-label">{t('modalDocument.categoryLabel')}</label>
        <TextSelectButton
          id={`file-edit-category-${doc.id}`}
          ariaLabel={t('modalDocument.categoryLabel')}
          disabled={busy}
          open={catOpen}
          onClick={() => setCatOpen(true)}
        >
          {catLabel(category)}
        </TextSelectButton>
        <FileCategoryModal
          isOpen={catOpen}
          onClose={() => setCatOpen(false)}
          cats={cats}
          activeKey={category}
          showAll={false}
          allLabel={t('documentManager.category_all')}
          catLabel={catLabel}
          onSelect={setCategory}
        />
      </div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className="modal-btn modal-btn-secondary flex-1"
          disabled={busy}
          onClick={onCancel}
        >
          <X size={16} /> {t('modalDocument.cancelBtn')}
        </button>
        <button
          type="button"
          className="modal-btn modal-btn-primary flex-1"
          disabled={busy || !valid}
          onClick={() => onSave({ title: title.trim(), ownerRecordId: ownerId, category })}
        >
          <Check size={16} /> {t('modalDocument.saveBtn')}
        </button>
      </div>
    </article>
  )
}
