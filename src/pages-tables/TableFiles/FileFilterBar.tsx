// شريط البحث وفلاتر النوع لمتصفح ملفات المستودع (التصنيف عبر مودال زر الهيدر).
import type { ReactNode } from 'react'
import TextSearch from '../../components/Custom/TextSearch'
import { useLanguage } from '../../language/LanguageContext'
import type { FileKind } from '../../lib/documents'

export type FileKindFilter = 'all' | FileKind | 'audio' | 'archive'

export const FILE_KIND_KEYS: FileKindFilter[] = ['all', 'pdf', 'image', 'text', 'other']

type FileFilterBarProps = {
  kind: FileKindFilter
  onKindChange: (kind: FileKindFilter) => void
  /** مرشح خارجي نشط (امتداد الهيدر) — يُلغي تحديد كل أزرار النوع لصالح زر الامتداد. */
  externalActive?: boolean
  /** محتوى يُرسَم مباشرة تحت أزرار النوع وفوق البحث (زر الامتداد النشط). */
  belowKindsSlot?: ReactNode
  search: string
  onSearchChange: (value: string) => void
  onApplySearch: () => void
  onClearSearch: () => void
  searching: boolean
}

export default function FileFilterBar({
  kind,
  onKindChange,
  externalActive,
  belowKindsSlot,
  search,
  onSearchChange,
  onApplySearch,
  onClearSearch,
  searching,
}: FileFilterBarProps) {
  const { t } = useLanguage()
  return (
    <>
      <div className="viewer-actions-col file-kind-col">
        <div className="viewer-actions-row file-kind-row" role="group" aria-label={t('documentManager.typeFilterAria')}>
          {FILE_KIND_KEYS.map((key) => {
            const isActive = !externalActive && kind === key
            return (
            <button
              key={key}
              type="button"
              className={`add-field-btn${isActive ? ' is-active' : ''}`}
              aria-pressed={isActive}
              onClick={() => onKindChange(key)}
            >
              {t(`documentManager.kind_${key}`)}
            </button>
            )
          })}
        </div>
      </div>
      {belowKindsSlot}

      <div className="mb-2">
        <div className="min-w-0">
          <span className="sr-only">{t('documentManager.searchPh')}</span>
          <TextSearch
            value={search}
            onChange={onSearchChange}
            onSearch={onApplySearch}
            onClear={onClearSearch}
            searching={searching}
            placeholder={t('documentManager.searchPh')}
            className="min-w-0"
          />
        </div>
      </div>
    </>
  )
}
