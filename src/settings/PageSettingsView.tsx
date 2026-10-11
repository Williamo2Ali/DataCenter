import { useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { ListChecks, Monitor, RotateCcw, SlidersHorizontal, Table, Tags, UserRound, X } from 'lucide-react'
import TabProfile from './TabProfile'
// مؤجلة لاحقاً: كلمة مرور التطبيق — الاستيراد معطّل مؤقتاً لا محذوف.
// import TabSecurity from './TabSecurity'
import TabGeneral from './TabGeneral'
import TabApperance from './TabApperance'
import TabTables from './TabTables'
import TabFields from './TabFields'
import TabCategories from './TabCategories'
import { MOBILE_BTN } from '../components/AppHeaderMobile'
import { Tooltip } from "../components/Tooltip"
import type { AppSettings } from '../lib/appSettings'
import { defaultAppearance, defaultSettings } from '../lib/appSettings'
import { defaultGeneral, type ProfileGeneral } from '../lib/profileStore'
import type { RepoData } from '../repos/repoService'
import { useLanguage } from '../language/LanguageContext'

// صفحة الحساب — تبويبات جانبية (Mobile-First: صف علوي في الموبايل، عمود يساري في الشاشات الأكبر).
// كل تبويب في ملف مستقل داخل ./accounts، وهذا الملف يجمعها فقط:
// ترتيب التبويبات: حسابي (بروفايل) ← عام ← العرض ← الجداول ← الحقول ← التصنيفات.
// تبويب الجداول يعرض جداول المستودع المفتوح — يُخفى من القائمة بلا مستودع مفتوح.
// تبويب الحقول كذلك (حقول جداول المستودع) — يُخفى أيضاً بلا مستودع.
// الأنماط أدوات Tailwind؛ القواعد المقابلة حُذفت من index.css.

export type AccountTab = 'account' | 'general' | 'display' | 'tabs' | 'fields' | 'cats'

type PageSettingsViewProps = {
  settings: AppSettings
  onChange: (settings: AppSettings) => void
  /** القيم العامة (اللغة والمظهر) من ملف البروفايل. */
  general: ProfileGeneral
  onGeneralChange: (patch: Partial<ProfileGeneral>) => void
  onClose: () => void
  /** المستودع المفتوح — تديره صفحة الجداول (غيابه يعطّلها مع تلميح). */
  repo: RepoData | null
  repoPassword: string | null
  onRepoUpdated: (data: RepoData) => void
  /** التبويب المفتوح عند الدخول — يُستخدم عند القدوم من دعوة «اضغط للتعديل». */
  initialTab?: AccountTab
  /** التبويب الذي يُركَّز عليه حقله الإنكليزي. */
  focusTabId?: string
  /** قفزة من العارض: يفتح إدارة هذا الجدول مباشرة. */
  manageTabId?: string | null
  /** أزرار هيدر الموبايل (CommonButtonsArea): زر الإغلاق يعيش هناك بدل الصفحة. */
  onHeaderActionChange: (node: ReactNode) => void
}

type IconComponent = ComponentType<{ size?: number; 'aria-hidden'?: boolean | 'true' | 'false' }>

type TabDef = {
  id: AccountTab
  labelKey: string
  icon: IconComponent
}

const TABS: TabDef[] = [
  { id: 'account', labelKey: 'pageAccountView.accountTab', icon: UserRound },
  { id: 'general', labelKey: 'pageAccountView.generalTab', icon: SlidersHorizontal },
  { id: 'display', labelKey: 'pageAccountView.displayTab', icon: Monitor },
  { id: 'tabs', labelKey: 'pageAccountView.tabsTab', icon: Table },
  { id: 'fields', labelKey: 'pageAccountView.fieldsTab', icon: ListChecks },
  { id: 'cats', labelKey: 'pageAccountView.catsTab', icon: Tags },
]

// حاوية القسم — مظهر .settings-panel بلا ترويسة داخلية ولا شريط تبويبات
// (فتبويبات الصفحة في .account-tabs أعلاه).
const PANEL_BASE = 'animate-reveal overflow-hidden rounded-md border border-[#e1e7e2] bg-white dark:border-[#3b3b41] dark:bg-paper'

const CLOSE =
  'grid size-[33px] flex-none cursor-pointer place-items-center rounded border border-[#dfe6e0] bg-white text-[#61736b] ' +
  'transition-[color,background-color,border-color] duration-[130ms] ' +
  'hover:border-[#e5b8b0] hover:bg-[#fdf3f1] hover:text-[#c8443c] ' +
  'focus-visible:outline-2 focus-visible:outline-orange focus-visible:outline-offset-2 ' +
  'dark:border-[#404046] dark:bg-[#2a2a2f] dark:text-[#d0d0d4] dark:hover:border-[#5a3632] dark:hover:bg-[#3a2a28] dark:hover:text-[#e88d86]'

// شريط التبويبات: صف أفقي بأيقونات فقط تحت 1024px، عمود ثابت من 1024px.
// (الحشو الجانبي على مستوى الصفحة max-lg:px-3.5.)
const TABLIST =
  'flex flex-row gap-1.5 overflow-x-auto scrollbar-thin lg:flex-[0_0_200px] lg:flex-col lg:overflow-visible'

const TAB =
  'inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded border border-transparent ' +
  'bg-transparent px-3.5 text-[0.8125rem] text-[#63716d] ' +
  'transition-[color,background-color,border-color] duration-[130ms] ' +
  'max-lg:min-h-11 max-lg:flex-1 ' +
  'lg:justify-start ' +
  'hover:bg-[#f4f7f4] hover:text-ink focus-visible:outline-2 focus-visible:outline-orange focus-visible:outline-offset-2 ' +
  'aria-pressed:border-[#d5e6da] aria-pressed:bg-[#edf4ef] aria-pressed:font-semibold aria-pressed:text-green ' +
  'hover:aria-pressed:text-green ' +
  'dark:text-[#b4c1b9] dark:hover:bg-[#2a2a2f] dark:hover:text-[#f1f1f3] ' +
  'dark:aria-pressed:border-[#4a4a50] dark:aria-pressed:bg-[#333338] dark:aria-pressed:text-[#a5d4b9] ' +
  'dark:hover:aria-pressed:text-[#a5d4b9]'

function SectionCard({ children, auto }: { children: ReactNode; auto?: boolean }) {
  return <div className={PANEL_BASE + (auto ? '' : ' min-h-[500px]')}>{children}</div>
}

// حاوية أزرار تبويبات الإعدادات — بلا حدود أو خلفية (مظهرها الحالي)،
// والمعرّف card-settings-tabs ثابت لأي تنسيق لاحق.
function CardSettingsTabs({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav id="card-settings-tabs" dir="rtl" aria-label={label} className={TABLIST}>
      {children}
    </nav>
  )
}

export default function PageSettingsView({ settings, onChange, general, onGeneralChange, onClose, repo, repoPassword, onRepoUpdated, initialTab, focusTabId, manageTabId, onHeaderActionChange }: PageSettingsViewProps) {
  const { t } = useLanguage()
  const [tab, setTab] = useState<AccountTab>(initialTab ?? 'account')

  // أزرار الهيدر (موبايل): الإغلاق دائماً + إعادة ضبط للصفحة المعروضة
  // (عام/العرض فقط — البروفايل وبقية التبويبات بلا زر).
  // ضبط العام يعيد اللغة والمظهر والفرز واسم مجلد Drive معاً (كل قيم التبويب).
  useEffect(() => {
    const resetGeneral = () => {
      onGeneralChange({ ...defaultGeneral })
      onChange({ ...settings, repoSort: 'oldest', driveFolderName: defaultSettings.driveFolderName, driveFolderId: '' })
    }
    const resetAction =
      tab === 'general'
        ? resetGeneral
        : tab === 'display'
          ? () => onChange({ ...settings, ...defaultAppearance })
          : null
    onHeaderActionChange(
      <>
        <Tooltip content={t('pageAccountView.closeTitle')}>
        <button
          type="button"
          className={MOBILE_BTN}
          aria-label={t('pageAccountView.closeAria')}
          onClick={onClose}
        >
          <X size={19} strokeWidth={1.7} />
        </button>
        </Tooltip>
        {resetAction && (
          <Tooltip content={t('settingsPanel.resetBtn')}>
            <button
              type="button"
              className={MOBILE_BTN}
              aria-label={t('settingsPanel.resetBtn')}
              onClick={resetAction}
            >
              <RotateCcw size={19} strokeWidth={1.7} />
            </button>
          </Tooltip>
        )}
      </>,
    )
    return () => onHeaderActionChange(null)
  }, [onClose, onHeaderActionChange, t, tab, settings, onChange, onGeneralChange])

  // القدوم من دعوة «اضبط الاسم» يفتح التبويب المطلوب تلقائياً.
  // بلا مستودع مفتوح: تبويب الجداول مخفي — والعالق عليه يعود لحسابي.
  useEffect(() => {
    if (initialTab) setTab(initialTab)
  }, [initialTab])

  useEffect(() => {
    if (!repo && (tab === 'tabs' || tab === 'fields')) setTab('account')
  }, [repo, tab])

  const repoTabs: AccountTab[] = ['tabs', 'fields']
  const visibleTabs = repo ? TABS : TABS.filter(({ id }) => !repoTabs.includes(id))

  return (
    <section
      aria-label={t('pageAccountView.accountAria')}
      className="flex animate-reveal flex-col gap-3 max-lg:px-3.5 lg:flex-row lg:flex-wrap lg:items-start"
    >
      <header className="hidden items-start justify-end gap-3 pt-1 lg:flex lg:basis-full">
        <Tooltip content={t('pageAccountView.closeTitle')}>
        <button type="button" className={CLOSE} aria-label={t('pageAccountView.closeAria')} onClick={onClose}>
          <X size={16} strokeWidth={2.1} />
        </button>
        </Tooltip>
      </header>

      <CardSettingsTabs label={t('pageAccountView.accountTabsAria')}>
        {visibleTabs.map(({ id, labelKey, icon: Icon }) => (
          <Tooltip key={`tip-${id}`} content={t(labelKey)}>
          <button
            key={id}
            type="button"
            className={TAB}
            aria-pressed={tab === id}
            aria-label={t(labelKey)}
            onClick={() => setTab(id)}
          >
            <Icon size={15} aria-hidden="true" />
            {/* أيقونات فقط تحت 1024px — تتسع كل التبويبات بلا سكرول أفقي. */}
            <span className="hidden lg:inline">{t(labelKey)}</span>
          </button>
          </Tooltip>
        ))}
      </CardSettingsTabs>

      <div className="min-w-0 flex-1">
        {tab === 'account' && (
          <div className="flex min-w-0 flex-1 flex-col">
            <TabProfile />
            {/* مؤجلة لاحقاً: كلمة مرور التطبيق — مخفية من الصفحة فقط، المكوّن موجود.
            <div className="mx-auto mt-[15px] w-[95%]">
              <SectionCard auto><TabSecurity /></SectionCard>
            </div>
            */}
          </div>
        )}
        {tab === 'general' && <SectionCard><TabGeneral
          general={general}
          onChange={onGeneralChange}
          repoSort={settings.repoSort ?? 'oldest'}
          onRepoSortChange={(repoSort) => onChange({ ...settings, repoSort })}
          driveFolderName={settings.driveFolderName ?? defaultSettings.driveFolderName}
          onDriveFolderNameChange={(driveFolderName) => onChange({
            ...settings,
            driveFolderName,
            // الاسم الجديد = مجلد جديد لاحقاً — معرّف القديم لا يصلح له.
            driveFolderId: driveFolderName === settings.driveFolderName ? settings.driveFolderId : '',
          })}
        /></SectionCard>}
        {tab === 'display' && <SectionCard><TabApperance settings={settings} onChange={onChange} /></SectionCard>}
        {tab === 'tabs' && repo && <SectionCard><TabTables
          repo={repo}
          repoPassword={repoPassword}
          onRepoUpdated={onRepoUpdated}
          focusTabId={focusTabId}
        /></SectionCard>}
        {tab === 'fields' && repo && <SectionCard><TabFields
          repo={repo}
          repoPassword={repoPassword}
          onRepoUpdated={onRepoUpdated}
          fieldLang={settings.fieldLang ?? 'ar'}
          initialSelectedTabId={manageTabId}
        /></SectionCard>}
        {tab === 'cats' && <SectionCard><TabCategories settings={settings} onChange={onChange} /></SectionCard>}
      </div>
    </section>
  )
}