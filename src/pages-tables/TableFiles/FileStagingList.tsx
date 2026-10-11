// بطاقات الملفات المجهزة — كارد مؤقت لكل ملف قبل الحفظ الحقيقي:
// عنوان فارغ يكتبه المستخدم + اسم الملف تلقائياً بلا امتداد + تصنيف،
// مع زر حفظ (يحفظ هذا الملف فقط ويخرجه من المؤقتة) وزر إزالة.
// المالك محدد مسبقاً من الهيدر (الفرد النشط) — لا يُختار هنا.
import { Check, Tag, X } from 'lucide-react'
import { ClearTextInput } from '../../components/ClearTextInput'
import { Tooltip } from '../../components/Tooltip'
import { useLanguage } from '../../language/LanguageContext'
import { stemOfFileName } from '../../lib/documents'
import FileTypeIcon from './FileTypeIcon'
export type StagedFile = {
  src: string
  name: string
  /** عنوان يكتبه المستخدم (إجباري — الحفظ يرفض الفارغ بعلامة حمراء). */
  title: string
  category: string
}

export type StagedPatch = Partial<Pick<StagedFile, 'title' | 'category'>>

/** عرض الجذع مفكوك الترميز (أسماء content:// تصل مرمّزة مثل image%3A…). */
function displayStem(name: string): string {
  const stem = stemOfFileName(name)
  try {
    return decodeURIComponent(stem)
  } catch {
    return stem
  }
}

type FileStagingListProps = {
  staged: StagedFile[]
  busy: boolean
  /** ملفات رُفض حفظها لفراغ عنوانها — تُبرَز كروتها بالأحمر. */
  titleErrors: Set<string>
  onPatch: (src: string, patch: StagedPatch) => void
  onUnstage: (src: string) => void
  onSaveOne: (src: string) => void
  /** فتح مودال التصنيفات لهذا الملف المجهز (بدل القائمة المنسدلة). */
  onRequestCategory: (src: string) => void
}

export default function FileStagingList({ staged, busy, titleErrors, onPatch, onUnstage, onSaveOne, onRequestCategory }: FileStagingListProps) {
  const { t } = useLanguage()
  if (staged.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      {staged.map((item) => {
        const titleMissing = titleErrors.has(item.src)
        return (
          <article key={item.src} className="account-card" style={titleMissing ? { borderColor: '#c8443c' } : undefined}>
            <h4 className="account-title">
              <span className="staged-avatar grid size-12 flex-none place-items-center overflow-hidden rounded-lg" aria-hidden="true">
                <FileTypeIcon fileName={item.name} category={item.category} />
              </span>
              <Tooltip content={item.name} className="min-w-0 flex-1">
                <span className="block truncate" dir="auto">{displayStem(item.name)}</span>
              </Tooltip>
            </h4>
            <Tooltip content={item.src} className="min-w-0 w-full">
              <span className="block truncate text-[0.6875rem] text-[var(--muted)]" dir="ltr">{item.src}</span>
            </Tooltip>
            <div className="mt-2 flex flex-col gap-2">
              <div className="flex items-center gap-1">
                {titleMissing && <span aria-hidden="true" className="flex-none text-[1rem] font-bold text-[#c8443c]">*</span>}
                <ClearTextInput
                  className="modal-input"
                  type="text"
                  value={item.title}
                  onChange={(e) => onPatch(item.src, { title: e.target.value })}
                  placeholder={t('documentManager.stagedTitlePh')}
                  aria-label={t('documentManager.stagedTitlePh')}
                  aria-invalid={titleMissing || undefined}
                  autoComplete="off"
                  maxLength={120}
                  dir="auto"
                  disabled={busy}
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="modal-btn modal-btn-primary"
                  disabled={busy}
                  onClick={() => onSaveOne(item.src)}
                >
                  <Check size={15} /> {t('documentManager.saveOneBtn')}
                </button>
                <button
                  type="button"
                  className="modal-btn modal-btn-danger"
                  disabled={busy}
                  onClick={() => onUnstage(item.src)}
                >
                  <X size={15} /> {t('modalMessages.deleteBtn')}
                </button>
                <button
                  type="button"
                  className="modal-btn modal-btn-secondary staging-cat"
                  disabled={busy}
                  onClick={() => onRequestCategory(item.src)}
                >
                  <Tag size={20} strokeWidth={2} aria-hidden="true" /> {t('modalDocument.categoryLabel')}
                </button>
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}
