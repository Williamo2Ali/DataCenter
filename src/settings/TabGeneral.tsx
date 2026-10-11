// تبويب «عام» — لغة التطبيق + المظهر (فاتح/داكن).
// يُحفَظ في ملف البروفايل (profile.json) لا في الإعدادات.
// الأنماط أدوات Tailwind؛ القواعد المقابلة حُذفت من index.css.
// حالة الاختيار على `aria-pressed` لا على صنف `is-active`.

import { useEffect, useState } from 'react'
import { ArrowDownUp, Cloud, Languages, Moon, RotateCcw, Sun } from 'lucide-react'
import { useToast } from 'react-theme-toast'
import { DEFAULT_DRIVE_FOLDER_NAME, normalizeDriveFolderName } from '../lib/appSettings'
import { defaultGeneral, type ProfileGeneral } from '../lib/profileStore'
import type { RepoSortMode } from '../lib/appSettings'
import { ClearTextInput } from '../components/ClearTextInput'
import TextSelectButton from '../components/Custom/TextSelectButton'
import SortOrderModal from './SortOrderModal'
import { useLanguage } from '../language/LanguageContext'

type TabGeneralProps = {
  general: ProfileGeneral
  onChange: (patch: Partial<ProfileGeneral>) => void
  repoSort: RepoSortMode
  onRepoSortChange: (repoSort: RepoSortMode) => void
  driveFolderName: string
  onDriveFolderNameChange: (name: string) => void
}

// صف إعداد: عنوان وأيقونة على اليمين/اليسار، والتحكّم على الطرف الآخر.
const ROW =
  'grid min-h-28 grid-cols-[minmax(0,1fr)_minmax(260px,400px)] items-center gap-7 border-b border-[#edf0ed] ' +
  'max-[860px]:min-h-0 max-[860px]:grid-cols-[minmax(0,1fr)] max-[860px]:gap-[13px] max-[860px]:py-[18px] ' +
  'dark:border-[#3b3b41]'

const LABEL_GROUP = 'flex items-center gap-3'
const LABEL_ICON = 'grid size-[38px] flex-none place-items-center rounded bg-[#edf4ef] text-green dark:bg-[#303035] dark:text-[#a2d3b6]'
const LABEL_COPY = 'flex flex-col gap-1'
const LABEL_TEXT = 'text-[0.9375rem] font-semibold text-[#2e413c] dark:text-[#e4e4e8]'
const LABEL_DESC = 'text-[0.75rem] text-[#85908c] dark:text-[#b0b0b6]'

const SEGMENTED =
  'inline-flex min-h-[42px] items-center gap-[3px] rounded border border-[#e0e7e1] bg-[#f1f5f2] p-[3px] ' +
  'max-[860px]:w-full dark:border-[#3f3f45] dark:bg-[#141416]'

// خيار داخل المجموعة. `hover:aria-pressed:` يجعل لون التحديد يغلب لون
// التحويم — كان ذلك معتمداً على ترتيب المصدر في CSS.
const OPTION =
  'inline-flex min-h-[34px] min-w-[94px] cursor-pointer items-center justify-center gap-[7px] rounded border ' +
  'border-transparent bg-transparent px-3 text-[0.8125rem] text-[#75827c] transition-colors duration-[140ms] ' +
  'max-[860px]:flex-1 ' +
  'hover:text-ink hover:aria-pressed:text-green ' +
  'focus-visible:outline-2 focus-visible:outline-orange focus-visible:outline-offset-2 ' +
  'aria-pressed:border-[#dce5de] aria-pressed:bg-white aria-pressed:font-semibold aria-pressed:text-green ' +
  'aria-pressed:shadow-[0_1px_3px_#1d34300a] ' +
  'dark:text-[#b3b3b9] dark:aria-pressed:border-[#4a4a50] dark:aria-pressed:bg-[#333338] ' +
  'dark:aria-pressed:text-[#e4e4e8] dark:hover:aria-pressed:text-[#e4e4e8]'

const FOOTER =
  'flex min-h-[76px] items-center justify-between gap-[15px] px-7 py-[15px] ' +
  'max-[860px]:flex-col max-[860px]:items-start max-[860px]:px-[18px] max-[560px]:px-3.5 max-[560px]:py-3'

const SORT_OPTIONS: RepoSortMode[] = ['oldest', 'newest', 'nameAsc', 'nameDesc', 'lastUsed', 'mostUsed', 'favorites']

function sortLabelKey(mode: RepoSortMode): string {
  switch (mode) {
    case 'newest': return 'settingsPanel.sortNewest'
    case 'nameAsc': return 'settingsPanel.sortNameAsc'
    case 'nameDesc': return 'settingsPanel.sortNameDesc'
    case 'lastUsed': return 'settingsPanel.sortLastUsed'
    case 'mostUsed': return 'settingsPanel.sortMostUsed'
    case 'favorites': return 'settingsPanel.sortFavorites'
    case 'oldest':
    default: return 'settingsPanel.sortOldest'
  }
}

export default function TabGeneral({ general, onChange, repoSort, onRepoSortChange, driveFolderName, onDriveFolderNameChange }: TabGeneralProps) {
  const { t } = useLanguage()
  const toast = useToast()
  // مسودة محلية: الحفظ الفعلي عند فقد التركيز فقط (لا كتابة ملف مع كل حرف).
  const [draft, setDraft] = useState(driveFolderName)
  const [sortOpen, setSortOpen] = useState(false)
  useEffect(() => { setDraft(driveFolderName) }, [driveFolderName])

  const commitDraft = () => {
    const next = normalizeDriveFolderName(draft)
    if (draft.trim() === '' && next === DEFAULT_DRIVE_FOLDER_NAME) {
      toast.info(t('settingsPanel.driveFolderEmpty'))
    }
    setDraft(next)
    if (next !== driveFolderName) onDriveFolderNameChange(next)
  }

  return (
    <div className="px-7 max-[860px]:px-[18px] max-[560px]:px-3.5">
      <div className={ROW}>
        <div className={LABEL_GROUP}>
          <span className={LABEL_ICON}><Languages size={18} /></span>
          <span className={LABEL_COPY}>
            <span className={LABEL_TEXT}>{t('settingsPanel.languageLabel')}</span>
            <span className={LABEL_DESC}>{t('settingsPanel.languageDesc')}</span>
          </span>
        </div>
        <div role="group" aria-label={t('settingsPanel.languageLabel')} className={SEGMENTED}>
          <button type="button" aria-pressed={general.language === 'ar'} onClick={() => onChange({ language: 'ar' })} className={OPTION}>
            العربية
          </button>
          <button type="button" aria-pressed={general.language === 'en'} onClick={() => onChange({ language: 'en' })} className={OPTION}>
            English
          </button>
        </div>
      </div>

      <div className={ROW}>
        <div className={LABEL_GROUP}>
          <span className={LABEL_ICON}>{general.theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}</span>
          <span className={LABEL_COPY}>
            <span className={LABEL_TEXT}>{t('settingsPanel.themeLabel')}</span>
            <span className={LABEL_DESC}>{t('settingsPanel.themeDesc')}</span>
          </span>
        </div>
        <div role="group" aria-label={t('settingsPanel.themeGroupAria')} className={SEGMENTED}>
          <button type="button" aria-pressed={general.theme === 'light'} onClick={() => onChange({ theme: 'light' })} className={OPTION}>
            <Sun size={16} /> {t('settingsPanel.lightTheme')}
          </button>
          <button type="button" aria-pressed={general.theme === 'dark'} onClick={() => onChange({ theme: 'dark' })} className={OPTION}>
            <Moon size={16} /> {t('settingsPanel.darkTheme')}
          </button>
        </div>
      </div>

      <div className={ROW}>
        <div className={LABEL_GROUP}>
          <span className={LABEL_ICON}><ArrowDownUp size={18} /></span>
          <span className={LABEL_COPY}>
            <span className={LABEL_TEXT}>{t('settingsPanel.repoSortLabel')}</span>
            <span className={LABEL_DESC}>{t('settingsPanel.repoSortDesc')}</span>
          </span>
        </div>
        <TextSelectButton
          ariaLabel={t('settingsPanel.repoSortLabel')}
          open={sortOpen}
          onClick={() => setSortOpen(true)}
        >
          {t(sortLabelKey(repoSort))}
        </TextSelectButton>
        <SortOrderModal
          isOpen={sortOpen}
          onClose={() => setSortOpen(false)}
          options={SORT_OPTIONS}
          activeValue={repoSort}
          title={t('settingsPanel.repoSortLabel')}
          optionLabel={(mode) => t(sortLabelKey(mode))}
          onSelect={onRepoSortChange}
        />
      </div>

      <div className={ROW}>
        <div className={LABEL_GROUP}>
          <span className={LABEL_ICON}><Cloud size={18} /></span>
          <span className={LABEL_COPY}>
            <span className={LABEL_TEXT}>{t('settingsPanel.driveFolderLabel')}</span>
            <span className={LABEL_DESC}>{t('settingsPanel.driveFolderDesc')}</span>
          </span>
        </div>
        <ClearTextInput
          type="text"
          className="modal-input"
          value={draft}
          maxLength={120}
          placeholder={t('settingsPanel.driveFolderPh')}
          aria-label={t('settingsPanel.driveFolderLabel')}
          dir="auto"
          autoComplete="off"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        />
      </div>

      <footer className={FOOTER}>
        <button type="button" onClick={() => { onChange({ ...defaultGeneral }); onRepoSortChange('oldest'); setDraft(DEFAULT_DRIVE_FOLDER_NAME); onDriveFolderNameChange(DEFAULT_DRIVE_FOLDER_NAME) }} className="vault-secondary max-lg:hidden">
          <RotateCcw size={15} /> {t('settingsPanel.resetBtn')}
        </button>
      </footer>
    </div>
  )
}