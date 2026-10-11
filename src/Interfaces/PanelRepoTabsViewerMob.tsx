// نسخة الموبايل من لوحة تبويبات المستودع — مستقلة تماماً عن
// PanelRepoTabsViewer (الديسكتوب/التابلت) حتى لا يتأثرا ببعضهما.
// البنية ثلاثة أقسام ثابتة: header (إغلاق + بحث) / body (قائمة + تمرير
// عمودي) / footer (إغلاق المستودع) — وتُعرض داخل درج محصور بين هيدر
// الموبايل والشريط السفلي، فلا يختفي منها شيء تحتهما.

import { useMemo } from 'react'
import { ChevronsLeft, ChevronsRight, Database, ListX, Search, X } from 'lucide-react'
import { useLanguage } from '../language/LanguageContext'
import { ClearTextInput } from '../components/ClearTextInput'
import { Tooltip } from '../components/Tooltip'
import { needsEnglishTitle, tabTitle } from '../lib/tabTitle'
import type { RepoTab } from '../repos/repoService'

/** ملف أيقونة التبويب PNG من `public/tabs` — والمخصصة Database. */
const TAB_ICON_FILE: Record<string, string> = {
  peoples: 'People.png',
  passports: 'Passport.png',
  civil: 'CivilRecord.png',
  national_ids: 'Identification Documents.png',
  study: 'Diploma.png',
  files: 'Filing Cabinet.png',
  accounts: 'Wallet.png',
  contacts: 'Contacts.png',
}

const tabIconSrc = (tabId: string): string => {
  const base = import.meta.env.BASE_URL || '/'
  return `${base}tabs/${encodeURIComponent(TAB_ICON_FILE[tabId] ?? 'Database.png')}`
}

const tabIcon = (tabId: string) => (
  <img src={tabIconSrc(tabId)} alt="" aria-hidden="true" draggable={false} width={22} height={22} className="object-contain" />
)

const peoplesIcon = (
  <img src={`${import.meta.env.BASE_URL || '/'}tabs/${encodeURIComponent('People.png')}`} alt="" aria-hidden="true" draggable={false} width={22} height={22} className="object-contain" />
)

type PanelRepoTabsViewerMobProps = {
  tabs: RepoTab[]
  activeSection: string
  closedTabIds: string[]
  query: string
  onQueryChange: (query: string) => void
  onOpenTab: (id: string) => void
  onCloseTab: (id: string) => void
  onEditTabTitle: (tabId: string) => void
  onCloseRepo: () => void
  onClose: () => void
  /** إغلاق كل التبويبات المفتوحة دفعة واحدة (زر بجانب إغلاق المستودع). */
  onCloseAllTabs: () => void
  /** تبويب الأشخاص الاصطناعي أولاً — فتح/إغلاق كغيره من التبويبات. */
  onOpenPeoples: () => void
  onClosePeoples: () => void
  peoplesActive: boolean
}

export default function PanelRepoTabsViewerMob({
  tabs,
  activeSection,
  closedTabIds,
  query,
  onQueryChange,
  onOpenTab,
  onCloseTab,
  onEditTabTitle,
  onCloseRepo,
  onClose,
  onCloseAllTabs,
  onOpenPeoples,
  onClosePeoples,
  peoplesActive,
}: PanelRepoTabsViewerMobProps) {
  const { t, lang } = useLanguage()
  const isRTL = lang === 'ar'
  const peoplesLabel = t('peoples.navTitle')

  // البحث يطابق الاسمين معاً حتى يجد المستخدم التبويب بأي لغة.
  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q) return tabs
    return tabs.filter((tab) => tab.title.includes(q) || tab.titleEn.includes(q))
  }, [tabs, query])

  const peoplesVisible = peoplesLabel.includes(query.trim())
  const peoplesClosed = closedTabIds.includes('peoples')
  /** بلا تبويبات مفتوحة يتحول الزر لطيّ الدرج (سهم للداخل) بدل التعطيل. */
  const anyOpen = !peoplesClosed || tabs.some((tab) => !closedTabIds.includes(tab.id))

  return (
    <>
      {/* ===== القسم العلوي header: إغلاق الدرج + بحث (ثابت) ===== */}
      <div className="flex flex-none items-center gap-2 border-b border-line px-2.5 py-2">
        <Tooltip content={t('pageMother.closePanelTitle')}>
        <button
          type="button"
          className="grid size-11 flex-none cursor-pointer place-items-center rounded-lg text-[#61736b] transition-colors duration-[130ms] active:bg-[#f4f7f4] dark:text-[#d0d0d4] dark:active:bg-[#2a2a2f]"
          aria-label={t('pageMother.closePanelAria')}
          onClick={onClose}
        >
          <X size={20} />
        </button>
        </Tooltip>
        <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#e7ebe7] bg-[#f7f9f7] px-3 text-[#8a9690] dark:border-[#3b3b41] dark:bg-[#242428] dark:text-[#b0b0b6]">
          <Search size={16} aria-hidden="true" className="flex-none" />
          <ClearTextInput
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t('pageMother.searchTabsPlaceholder')}
            aria-label={t('pageMother.searchTabsAria')}
            className="min-w-0 flex-1 border-0 bg-transparent text-[0.875rem] text-ink outline-0 placeholder:text-[#9aa4a0] dark:text-[#e6e6ea] dark:placeholder:text-[#6f6f77]"
          />
        </div>
      </div>

      {/* ===== القسم الأوسط body: قائمة التبويبات — التمرير العمودي هنا فقط ===== */}
      <div role="list" aria-label={t('pageMother.allTabsListAria')} className="mob-body-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto p-2.5">
        {filtered.length === 0 && !peoplesVisible && <p className="vault-empty">{t('pageMother.noMatchingTabs')}</p>}
        {peoplesVisible && (
          <div
            role="listitem"
            className={`flex w-full flex-none items-center gap-2.5 rounded-lg border border-[#e8ede9] bg-[#f8faf8] dark:border-[#3b3b41] dark:bg-[#242428] ${peoplesActive ? 'border-[#76a68c] bg-[#edf4ef] dark:border-[#8cc5a4] dark:bg-[#2c3530]' : ''} ${peoplesClosed ? 'opacity-70' : ''}`}
          >
            <Tooltip content={peoplesClosed ? t('pageMother.openTabTitle', { title: peoplesLabel }) : t('pageMother.viewTabTitle', { title: peoplesLabel })} className="w-full">
            <button
              type="button"
              className="flex min-h-[52px] min-w-0 flex-1 cursor-pointer items-center gap-2.5 bg-transparent p-2.5 text-start"
              aria-label={t('pageMother.tabStateAria', { title: peoplesLabel, state: peoplesActive ? t('pageMother.activeNow') : peoplesClosed ? t('pageMother.closedStateAria') : t('pageMother.openStatus') })}
              onClick={onOpenPeoples}
            >
              <span className="grid size-9 flex-none place-items-center rounded bg-[#eef3ee] text-[#6b8b79] dark:bg-[#303035] dark:text-[#a4ceb4]">
                {peoplesIcon}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-px">
                <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[0.875rem] font-semibold text-[#344542] dark:text-[#e4e4e8]">{peoplesLabel}</span>
                <span className="text-[0.75rem] text-[#84908c] dark:text-[#b0b0b6]">{peoplesActive ? t('pageMother.activeNow') : peoplesClosed ? t('pageMother.closedStatus') : t('pageMother.openStatus')}</span>
              </span>
            </button>
            </Tooltip>
            {!peoplesClosed && (
              <Tooltip content={t('pageMother.closeTabTitle', { title: peoplesLabel })} tone="danger">
              <button
                type="button"
                className="me-2 grid size-10 flex-none cursor-pointer place-items-center rounded-lg text-[#98a5a1] transition-colors duration-[120ms] active:bg-[#fbeae8] active:text-[#c8443c]"
                aria-label={t('pageMother.closeTabTitle', { title: peoplesLabel })}
                onClick={onClosePeoples}
              >
                <X size={16} />
              </button>
              </Tooltip>
            )}
          </div>
        )}
        {filtered.map((tab) => {
          const isClosed = closedTabIds.includes(tab.id)
          const isActive = activeSection === tab.id
          const stateShort = isActive
            ? t('pageMother.activeNow')
            : isClosed
              ? t('pageMother.closedStatus')
              : t('pageMother.openStatus')
          const stateLong = isActive || !isClosed ? stateShort : t('pageMother.closedStateAria')
          const missingEn = needsEnglishTitle(tab, lang)
          const label = missingEn ? t('pageMother.missingEnTitle') : tabTitle(tab, lang)
          return (
            <div
              key={tab.id}
              role="listitem"
              className={`flex w-full flex-none items-center gap-2.5 rounded-lg border border-[#e8ede9] bg-[#f8faf8] dark:border-[#3b3b41] dark:bg-[#242428] ${isActive ? 'border-[#76a68c] bg-[#edf4ef] dark:border-[#8cc5a4] dark:bg-[#2c3530]' : ''} ${isClosed ? 'opacity-70' : ''}`}
            >
              <Tooltip content={isClosed ? t('pageMother.openTabTitle', { title: label }) : t('pageMother.viewTabTitle', { title: label })} className="w-full">
              <button
                type="button"
                className="flex min-h-[52px] min-w-0 flex-1 cursor-pointer items-center gap-2.5 bg-transparent p-2.5 text-start"
                aria-label={t('pageMother.tabStateAria', { title: label, state: stateLong })}
                onClick={() => onOpenTab(tab.id)}
              >
                <span className="grid size-9 flex-none place-items-center rounded bg-[#eef3ee] text-[#6b8b79] dark:bg-[#303035] dark:text-[#a4ceb4]">
                  {tabIcon(tab.id)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-px">
                  {missingEn ? (
                    <span
                      role="button"
                      tabIndex={0}
                      className="block w-full cursor-pointer border-b border-dashed border-[#d8c39a] bg-none text-[0.875rem] font-semibold text-[#b07f2a]"
                      onClick={(event) => {
                        event.stopPropagation()
                        onEditTabTitle(tab.id)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          event.stopPropagation()
                          onEditTabTitle(tab.id)
                        }
                      }}
                    >
                      {t('pageMother.missingEnTitle')}
                    </span>
                  ) : (
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[0.875rem] font-semibold text-[#344542] dark:text-[#e4e4e8]">{label}</span>
                  )}
                  <span className="text-[0.75rem] text-[#84908c] dark:text-[#b0b0b6]">{stateShort}</span>
                </span>
              </button>
              </Tooltip>
              {!isClosed && (
                <Tooltip content={t('pageMother.closeTabTitle', { title: label })} tone="danger">
                <button
                  type="button"
                  className="me-2 grid size-10 flex-none cursor-pointer place-items-center rounded-lg text-[#98a5a1] transition-colors duration-[120ms] active:bg-[#fbeae8] active:text-[#c8443c]"
                  aria-label={t('pageMother.closeTabTitle', { title: label })}
                  onClick={() => onCloseTab(tab.id)}
                >
                  <X size={16} />
                </button>
                </Tooltip>
              )}
            </div>
          )
        })}
      </div>

      {/* ===== القسم السفلي footer: إغلاق المستودع (ثابت، بحجم محتواه) ===== */}
      {/* بلا safe-area-inset: الدرج محصور بين الهيدر والشريط السفلي ولا يصل
          لحافة الشاشة — حشوة النظام ملك الشريط السفلي وحده. */}
      <div className="flex flex-none items-center gap-2 border-t border-line px-3 py-2.5">
        <Tooltip content={t('pageMother.closeRepoTitle')} className="min-w-0 flex-1">
        <button
          type="button"
          id="closerepo"
          className="vault-secondary min-h-11 w-full"
          onClick={onCloseRepo}
        >
          <Database size={16} className="text-[#c8443c] dark:text-[#e88d86]" /> {t('pageMother.closeRepoBtn')}
        </button>
        </Tooltip>
        {anyOpen ? (
          <Tooltip content={t('pageMother.closeAllTabsTitle')}>
          <button
            type="button"
            className="vault-secondary grid min-h-11 w-11 flex-none cursor-pointer place-items-center"
            style={{ paddingInline: 0 }}
            aria-label={t('pageMother.closeAllTabsTitle')}
            onClick={onCloseAllTabs}
          >
            <ListX size={18} />
          </button>
          </Tooltip>
        ) : (
          <Tooltip content={t('pageMother.closePanelTitle')}>
          <button
            type="button"
            className="vault-secondary grid min-h-11 w-11 flex-none cursor-pointer place-items-center"
            style={{ paddingInline: 0 }}
            aria-label={t('pageMother.closePanelAria')}
            onClick={onClose}
          >
            {isRTL ? <ChevronsLeft size={18} /> : <ChevronsRight size={18} />}
          </button>
          </Tooltip>
        )}
      </div>
    </>
  )
}
