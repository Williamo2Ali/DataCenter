// مودال ترشيح امتداد الملفات — يُفتَح من زر «خيارات الفرز» في الصف الثاني تحت أزرار النوع.
// قائمة امتدادات شائعة + صف «الكل» + حقل حر لأي امتداد خاص.
// يُرسَم عبر portal (كـ FileCategoryModal) لأن section.records-section المتحرك
// (animation يُبقي transform) يحبس position:fixed داخله فيخرج المودال عن الشاشة.
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, FileType, Files, X } from 'lucide-react'
import { ClearTextInput } from '../../components/ClearTextInput'
import { Tooltip } from '../../components/Tooltip'
import { useLanguage } from '../../language/LanguageContext'

/** مجموعات الامتدادات (تسمياتها عبر `documentManager.extGroup_<id>`) —
   بدل سرد الامتدادات خاماً: كل صف يعرض اسماً مفهوماً مع أمثلته. */
export const EXTENSION_GROUPS: { id: string; exts: string[] }[] = [
  { id: 'office', exts: ['doc', 'docx', 'docm', 'xls', 'xlsx', 'xlsm', 'ppt', 'pptx', 'pptm'] },
  { id: 'word', exts: ['doc', 'docx', 'docm'] },
  { id: 'excel', exts: ['xls', 'xlsx', 'xlsm'] },
  { id: 'powerpoint', exts: ['ppt', 'pptx', 'pptm'] },
  { id: 'audio', exts: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'amr'] },
  { id: 'archive', exts: ['zip', 'rar', '7z', 'tar', 'gz'] },
  { id: 'code', exts: ['txt', 'rtf', 'md', 'csv', 'json', 'xml', 'js', 'ts', 'tsx'] },
]

/** تطبيع امتداد حر: قصّ الفراغات والنقطة البادئة وتوحيد الحالة. */
export const normalizeExtension = (value: string): string =>
  value.trim().toLowerCase().replace(/^\.+/, '')

type FileExtensionModalProps = {
  isOpen: boolean
  onClose: () => void
  /** المعرف النشط ('all' | معرّف مجموعة | `ext:<امتداد>`). */
  activeId: string
  allLabel: string
  onSelect: (id: string, exts: string[] | null) => void
}

export default function FileExtensionModal({
  isOpen,
  onClose,
  activeId,
  allLabel,
  onSelect,
}: FileExtensionModalProps) {
  const { t } = useLanguage()
  const [custom, setCustom] = useState('')

  if (!isOpen || typeof document === 'undefined') return null

  const pick = (id: string, exts: string[] | null) => {
    onSelect(id, exts)
    onClose()
  }

  const applyCustom = () => {
    const ext = normalizeExtension(custom)
    if (!ext) return
    setCustom('')
    pick(`ext:${ext}`, [ext])
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="file-extension-title">
      <div className="modal-card file-category-modal no-icon-scale" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2 id="file-extension-title">{t('documentManager.extFilter')}</h2>
          <Tooltip content={t('pageRepoViewer.closeAria')}>
          <button type="button" className="modal-close" onClick={onClose} aria-label={t('pageRepoViewer.closeAria')}>
            <X size={22} style={{ color: '#c8443c' }} />
          </button>
          </Tooltip>
        </header>
        <div className="modal-body">
          <button
            type="button"
            className={`document-item${activeId === 'all' ? ' is-active' : ''}`}
            aria-pressed={activeId === 'all'}
            onClick={() => pick('all', null)}
          >
            <span className="document-item-icon">
              <Files size={20} strokeWidth={1.7} aria-hidden="true" />
            </span>
            <span className="document-item-copy">
              <span className="document-item-title">{allLabel}</span>
            </span>
            {activeId === 'all' && <Check size={18} strokeWidth={2.2} aria-hidden="true" />}
          </button>
          {EXTENSION_GROUPS.map((group) => {
            const isActive = activeId === group.id
            return (
              <button
                key={group.id}
                type="button"
                className={`document-item${isActive ? ' is-active' : ''}`}
                aria-pressed={isActive}
                onClick={() => pick(group.id, group.exts)}
              >
                <span className="document-item-icon">
                  <FileType size={20} strokeWidth={1.7} aria-hidden="true" />
                </span>
                <span className="document-item-copy">
                  <span className="document-item-title">{t(`documentManager.extGroup_${group.id}`)}</span>
                  <span className="document-item-owner" dir="ltr">{group.exts.map((e) => `.${e}`).join(' ')}</span>
                </span>
                {isActive && <Check size={18} strokeWidth={2.2} aria-hidden="true" />}
              </button>
            )
          })}
          <div className="modal-field">
            <label className="modal-label" htmlFor="file-ext-custom">{t('documentManager.extCustomLabel')}</label>
            <div className="viewer-actions-row">
              <ClearTextInput
                id="file-ext-custom"
                type="text"
                className="modal-input"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') applyCustom() }}
                placeholder={t('documentManager.extCustomPh')}
                autoComplete="off"
                maxLength={12}
                dir="ltr"
              />
              <button
                type="button"
                className="modal-btn modal-btn-primary"
                disabled={!normalizeExtension(custom)}
                onClick={applyCustom}
              >
                <Check size={16} /> {t('documentManager.extApply')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
