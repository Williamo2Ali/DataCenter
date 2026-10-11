// لائحة تبويبات المستودع — كل منطقها انتقل إلى هنا من PageMother.
// تُغلَّف بـ PanelEmpty (فتح/طيّ/إخفاء)، وهذه تتولّى محتواها بالكامل:
// البحث، قائمة التبويبات، دعوة الاسم الإنكليزي الناقص، وأزرار الإغلاق.

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronsLeft, ChevronsRight, ChevronDown, ChevronUp, Database, PanelLeftOpen, PanelRightOpen, Search, X } from 'lucide-react'
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
  <img src={tabIconSrc(tabId)} alt="" aria-hidden="true" draggable={false} width={20} height={20} className="object-contain" />
)

const peoplesIcon = (
  <img src={`${import.meta.env.BASE_URL || '/'}tabs/${encodeURIComponent('People.png')}`} alt="" aria-hidden="true" draggable={false} width={20} height={20} className="object-contain" />
)

type PanelRepoTabsViewerProps = {
  tabs: RepoTab[]
  activeSection: string
  closedTabIds: string[]
  query: string
  /** شريط أيقونات ضيّق — يُخفي النصوص والبحث. */
  collapsed: boolean
  onQueryChange: (query: string) => void
  onOpenTab: (id: string) => void
  onCloseTab: (id: string) => void
  onEditTabTitle: (tabId: string) => void
  onCloseRepo: () => void
  onCollapse: () => void
  /** صفحة الأشخاص كتبويب أول اصطناعي (ديسكتوب فقط — بلا إغلاق). */
  onOpenPeoples: () => void
  /** إغلاق تبويب الأشخاص كغيره من التبويبات. */
  onClosePeoples: () => void
  peoplesActive: boolean
  /** في درج الهواتف يتحول زر state إلى إغلاق (X) بدل الطي. */
  stateButtonMode?: 'collapse' | 'close'
}

// شريط أيقونات التبويب داخل الشريط المطوي.
const RAIL_ITEM =
  'grid size-9 shrink-0 place-items-center rounded border border-transparent bg-transparent ' +
  'text-[#6b8b79] transition-colors duration-[130ms] hover:bg-[#eef4ef] ' +
  'dark:bg-[#242428] dark:text-[#a4ceb4] dark:border-[#3b3b41] dark:hover:bg-[#36363b]'

const RAIL_ITEM_ACTIVE = 'is-open bg-[#edf4ef] border-[#b9d0c3] dark:bg-[#36363b] dark:border-[#515158]'

// زرّا تمرير الشريط المطوي — كامل العرض بشكل مستطيل بلا حواف مستديرة.
// العلوي بحد سفلي والسفلي بحد علوي (#3b3b41) يفصلانهما عن القائمة.
const RAIL_SCROLL_UP_BTN =
  'grid h-[22px] w-full flex-none shrink-0 cursor-pointer place-items-center rounded-none border-0 border-b-2 border-b-[#3b3b41] bg-transparent ' +
  'text-[#6b8b79] transition-colors duration-[130ms] hover:bg-[#eef4ef] ' +
  'disabled:pointer-events-none disabled:opacity-30 ' +
  'dark:text-[#a4ceb4] dark:hover:bg-[#36363b]'

// زر التمرير للأسفل — حدّ علوي سميك واضح يفصله عن القائمة فوقه.
const RAIL_SCROLL_DOWN_BTN =
  'grid h-[22px] w-full flex-none shrink-0 cursor-pointer place-items-center rounded-none border-0 border-t-2 border-t-[#3b3b41] bg-transparent ' +
  'text-[#6b8b79] transition-colors duration-[130ms] hover:bg-[#eef4ef] ' +
  'disabled:pointer-events-none disabled:opacity-30 ' +
  'dark:text-[#a4ceb4] dark:hover:bg-[#36363b]'

export default function PanelRepoTabsViewer({
  tabs,
  activeSection,
  closedTabIds,
  query,
  collapsed,
  onQueryChange,
  onOpenTab,
  onCloseTab,
  onEditTabTitle,
  onCloseRepo,
  onCollapse,
  onOpenPeoples,
  onClosePeoples,
  peoplesActive,
  stateButtonMode = 'collapse',
}: PanelRepoTabsViewerProps) {
  const { t, lang } = useLanguage()
  const isRTL = lang === 'ar'
  const peoplesLabel = t('peoples.navTitle')

  // البحث يطابق الاسمين معاً حتى يجد المستخدم التبويب بأي لغة.
  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q) return tabs
    return tabs.filter((tab) => tab.title.includes(q) || tab.titleEn.includes(q))
  }, [tabs, query])

  // تبويب الأشخاص الاصطناعي أولاً — يخضع للبحث كغيره، وحالته من المغلقة.
  const peoplesVisible = peoplesLabel.includes(query.trim())
  const peoplesClosed = closedTabIds.includes('peoples')

  /* planscrollrail: حالة ومرجع تمرير الشريط المطوي بدون سكرول أصلي.
     للتراجع: احذف هذا الكتلة (حتى planscrollrail-hooks-end) مع زرّي التمرير
     وصنف rail-no-scrollbar، وأعد حاوية القائمة كما كانت. */
  const railListRef = useRef<HTMLDivElement | null>(null)
  const [railCanUp, setRailCanUp] = useState(false)
  const [railCanDown, setRailCanDown] = useState(false)

  const updateRailScrollState = () => {
    const el = railListRef.current
    if (!el) return
    setRailCanUp(el.scrollTop > 4)
    setRailCanDown(el.scrollTop + el.clientHeight < el.scrollHeight - 4)
  }

  useEffect(() => {
    // planscrollrail: قياس فوري + مراقبة حجم القائمة (تكبير/تصغير النافذة أو
    // الزوم يغيّر overflow دون إطلاق حدث scroll، فكان الزرّان يتأخران).
    updateRailScrollState()
    const el = railListRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => updateRailScrollState())
    observer.observe(el)
    return () => observer.disconnect()
  }, [filtered.length, collapsed])

  const scrollRail = (direction: 1 | -1) => {
    // صفّان لكل ضغطة (زر 36px + فجوة 8px).
    railListRef.current?.scrollBy({ top: direction * 88, behavior: 'smooth' })
  }
  /* planscrollrail-hooks-end */

  // ——— الشريط المطوي: أيقونات فقط، وزرّان في نهايته ———
  if (collapsed) {
    const railScrollable = railCanUp || railCanDown
    return (
      <>
        {/* planscrollrail: زر التمرير للأعلى — يظهر فقط عند وجود فائض.
            للتراجع: احذفه مع زر الأسفل وصنف rail-no-scrollbar. */}
        {railScrollable && (
          <div className="flex flex-none justify-center">
            <Tooltip content={t('pageMother.railScrollUpAria')} className="w-full">
            <button
              type="button"
              className={RAIL_SCROLL_UP_BTN}
              aria-label={t('pageMother.railScrollUpAria')}
              disabled={!railCanUp}
              onClick={() => scrollRail(-1)}
            >
              <ChevronUp size={14} />
            </button>
            </Tooltip>
          </div>
        )}
        {/* planclosetab: حشو أفقي px-2 يستوعب بروز شارة X (6px) + مثبت سكرول
            [scrollbar-gutter:stable] حتى لا تنزلق الأزرار تحت الشريط العمودي
            ولا تصطدم بحافة اللوحة — جزء من نفس الخطة، يُحذف مع التراجع. */}
        <div
          ref={railListRef}
          onScroll={updateRailScrollState}
          className="rail-no-scrollbar flex min-h-0 flex-1 flex-col items-center gap-2 overflow-x-hidden overflow-y-auto px-2 py-2"
        >
          {peoplesVisible && (
            <div className="relative shrink-0">
              <Tooltip content={peoplesLabel}>
              <button
                type="button"
                className={`${RAIL_ITEM} ${!peoplesClosed ? RAIL_ITEM_ACTIVE : ''} ${peoplesActive ? 'ring-2 ring-[#76a68c]' : ''} ${!peoplesClosed ? '' : 'opacity-60'}`}
                aria-label={peoplesLabel}
                aria-current={peoplesActive ? 'true' : undefined}
                onClick={onOpenPeoples}
              >
                {peoplesIcon}
              </button>
              </Tooltip>
              {!peoplesClosed && (
                <Tooltip content={t('pageMother.closeTabTitle', { title: peoplesLabel })} tone="danger">
                <button
                  type="button"
                  className="absolute -top-1.5 -end-1.5 grid size-5 cursor-pointer place-items-center rounded-full border border-[#e5a49f] bg-[#fbeae8] text-[#c8443c] transition-colors duration-[120ms] hover:bg-[#c8443c] hover:text-white focus-visible:outline-2 focus-visible:outline-orange focus-visible:outline-offset-1 dark:border-[#6b3a35] dark:bg-[#3a2a28] dark:text-[#e88d86] dark:hover:bg-[#c8443c] dark:hover:text-white"
                  aria-label={t('pageMother.closeTabTitle', { title: peoplesLabel })}
                  onClick={(event) => {
                    event.stopPropagation()
                    onClosePeoples()
                  }}
                >
                  <X size={12} />
                </button>
                </Tooltip>
              )}
            </div>
          )}
          {filtered.map((tab) => {
            const isOpen = !closedTabIds.includes(tab.id)
            const isActive = activeSection === tab.id
            const label = needsEnglishTitle(tab, lang) ? t('pageMother.missingEnTitle') : tabTitle(tab, lang)
            return (
              /* planclosetab: غلاف نسبي + زر X أحمر لإغلاق التبويب من الشريط المطوي.
                 للتراجع: احذف هذا الغلاف <div className="relative ..."> وزر الإغلاق
                 بداخله، وأعد زر التبويب وحده كما كان (planclosetab-end). */
              <div key={tab.id} className="relative shrink-0">
                <Tooltip content={label}>
                <button
                  type="button"
                  className={`${RAIL_ITEM} ${isOpen ? RAIL_ITEM_ACTIVE : ''} ${isActive ? 'ring-2 ring-[#76a68c]' : ''} ${isOpen ? '' : 'opacity-60'}`}
                  aria-label={label}
                  aria-current={isActive ? 'true' : undefined}
                  onClick={() => onOpenTab(tab.id)}
                >
                  {tabIcon(tab.id)}
                </button>
                </Tooltip>
                {isOpen && (
                  <Tooltip content={t('pageMother.closeTabTitle', { title: label })} tone="danger">
                  <button
                    type="button"
                    className="absolute -top-1.5 -end-1.5 grid size-5 cursor-pointer place-items-center rounded-full border border-[#e5a49f] bg-[#fbeae8] text-[#c8443c] transition-colors duration-[120ms] hover:bg-[#c8443c] hover:text-white focus-visible:outline-2 focus-visible:outline-orange focus-visible:outline-offset-1 dark:border-[#6b3a35] dark:bg-[#3a2a28] dark:text-[#e88d86] dark:hover:bg-[#c8443c] dark:hover:text-white"
                    aria-label={t('pageMother.closeTabTitle', { title: label })}
                    onClick={(event) => {
                      event.stopPropagation()
                      onCloseTab(tab.id)
                    }}
                  >
                    <X size={12} />
                  </button>
                  </Tooltip>
                )}
              </div>
              /* planclosetab-end */
            )
          })}
        </div>
        {/* planscrollrail: زر التمرير للأسفل — يظهر فقط عند وجود فائض.
            للتراجع: احذفه مع زر الأعلى وصنف rail-no-scrollbar. */}
        {railScrollable && (
          <div className="flex flex-none justify-center">
            <Tooltip content={t('pageMother.railScrollDownAria')} className="w-full">
            <button
              type="button"
              className={RAIL_SCROLL_DOWN_BTN}
              aria-label={t('pageMother.railScrollDownAria')}
              disabled={!railCanDown}
              onClick={() => scrollRail(1)}
            >
              <ChevronDown size={14} />
            </button>
            </Tooltip>
          </div>
        )}
        <div className="sticky bottom-0 z-10 flex flex-none shrink-0 flex-col items-center gap-1.5 border-t border-line py-1.5">
          <Tooltip content={t('pageMother.expandPanelTitle')}>
          <button
            type="button"
            id="state"
            className={RAIL_ITEM}
            aria-label={t('pageMother.expandPanelAria')}
            onClick={onCollapse}
          >
            {isRTL ? <PanelLeftOpen size={16} /> : <PanelRightOpen size={16} />}
          </button>
          </Tooltip>
          <Tooltip content={t('pageMother.closeRepoTitle')}>
          <button
            type="button"
            id="closerepo"
            className={`${RAIL_ITEM} text-[#c8443c] dark:text-[#e88d86]`}
            aria-label={t('pageMother.closeRepoTitle')}
            onClick={onCloseRepo}
          >
            <Database size={16} />
          </button>
          </Tooltip>
        </div>
      </>
    )
  }

  // ——— العرض الكامل بثلاثة أقسام: header (بحث) / body (قائمة + تمرير) / footer (زرّان) ———
  return (
    <>
      {/* ===== القسم العلوي header: البحث (ثابت، بلا تمرير) ===== */}
      {/* محاذاة الحشو مع عناصر القائمة (p-2.5) حتى لا يبدو أعرض منها. */}
      <div className="mx-2.5 my-2.5 flex h-8 flex-none items-center gap-2 rounded border border-[#e7ebe7] bg-[#f7f9f7] px-2.5 text-[#8a9690] dark:border-[#3b3b41] dark:bg-[#242428] dark:text-[#b0b0b6]">
        <Search size={14} aria-hidden="true" className="flex-none" />
        <ClearTextInput
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t('pageMother.searchTabsPlaceholder')}
          aria-label={t('pageMother.searchTabsAria')}
          className="min-w-0 flex-1 border-0 bg-transparent text-[0.75rem] text-ink outline-0 placeholder:text-[#9aa4a0] dark:text-[#e6e6ea] dark:placeholder:text-[#6f6f77]"
        />
      </div>

      {/* ===== القسم الأوسط body: قائمة التبويبات — التمرير هنا فقط =====
          عمودي عند الحاجة (ودائم على الهواتف max-sm)، والأفقي — إن ظهر —
          محصور داخل body ولا يخرج عنه. */}
      <div role="list" aria-label={t('pageMother.allTabsListAria')} className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-x-auto overflow-y-auto p-2.5 scrollbar-thin max-sm:overflow-y-scroll">
        {filtered.length === 0 && !peoplesVisible && <p className="vault-empty">{t('pageMother.noMatchingTabs')}</p>}
        {peoplesVisible && (
          <div
            role="listitem"
            className={`relative flex w-full items-center gap-2.5 rounded border border-[#e8ede9] bg-[#f8faf8] transition-[background-color,border-color,box-shadow] duration-[130ms] hover:border-[#76a68c] hover:bg-[#eef4ef] hover:shadow-[0_0_0_2px_#16715f24] dark:border-[#3b3b41] dark:bg-[#242428] dark:hover:border-[#8cc5a4] dark:hover:bg-[#36363b] ${peoplesActive ? 'border-[#b9d0c3] bg-[#edf4ef] dark:border-[#515158] dark:bg-[#36363b]' : ''} ${peoplesClosed ? 'opacity-70' : ''}`}
          >
            <Tooltip content={peoplesClosed ? t('pageMother.openTabTitle', { title: peoplesLabel }) : t('pageMother.viewTabTitle', { title: peoplesLabel })} className="w-full">
            <button
              type="button"
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 bg-transparent p-2.5 text-start focus-visible:outline-2 focus-visible:outline-orange focus-visible:outline-offset-[-2px]"
              aria-label={t('pageMother.tabStateAria', { title: peoplesLabel, state: peoplesActive ? t('pageMother.activeNow') : peoplesClosed ? t('pageMother.closedStateAria') : t('pageMother.openStatus') })}
              onClick={onOpenPeoples}
            >
              <span className="grid size-[30px] flex-none place-items-center rounded-[3px] bg-[#eef3ee] text-[#6b8b79] dark:bg-[#303035] dark:text-[#a4ceb4]">
                {peoplesIcon}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-px">
                <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[0.75rem] font-semibold text-[#344542] dark:text-[#e4e4e8]">{peoplesLabel}</span>
                <span className="text-[0.6875rem] text-[#84908c] dark:text-[#b0b0b6]">{peoplesActive ? t('pageMother.activeNow') : peoplesClosed ? t('pageMother.closedStatus') : t('pageMother.openStatus')}</span>
              </span>
            </button>
            </Tooltip>
            {!peoplesClosed && (
              <Tooltip content={t('pageMother.closeTabTitle', { title: peoplesLabel })} tone="danger">
              <button
                type="button"
                className="me-1.5 grid size-[26px] flex-none cursor-pointer place-items-center rounded text-[#98a5a1] transition-colors duration-[120ms] hover:bg-[#fbeae8] hover:text-[#c8443c] dark:hover:bg-[#3a2a28] dark:hover:text-[#e88d86]"
                aria-label={t('pageMother.closeTabTitle', { title: peoplesLabel })}
                onClick={onClosePeoples}
              >
                <X size={14} />
              </button>
              </Tooltip>
            )}
          </div>
        )}
        {filtered.map((tab, index) => {
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
              className={`relative flex w-full animate-[tabs-item-in_260ms_ease_both] items-center gap-2.5 rounded border border-[#e8ede9] bg-[#f8faf8] transition-[background-color,border-color,box-shadow] duration-[130ms] hover:border-[#76a68c] hover:bg-[#eef4ef] hover:shadow-[0_0_0_2px_#16715f24] dark:border-[#3b3b41] dark:bg-[#242428] dark:hover:border-[#8cc5a4] dark:hover:bg-[#36363b] ${isActive ? 'border-[#b9d0c3] bg-[#edf4ef] dark:border-[#515158] dark:bg-[#36363b]' : ''} ${isClosed ? 'opacity-70' : ''}`}
              style={{ animationDelay: `${70 + index * 40}ms` }}
            >
              <Tooltip content={isClosed ? t('pageMother.openTabTitle', { title: label }) : t('pageMother.viewTabTitle', { title: label })} className="w-full">
              <button
                type="button"
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 bg-transparent p-2.5 text-start focus-visible:outline-2 focus-visible:outline-orange focus-visible:outline-offset-[-2px]"
                aria-label={t('pageMother.tabStateAria', { title: label, state: stateLong })}
                onClick={() => onOpenTab(tab.id)}
              >
                <span className="grid size-[30px] flex-none place-items-center rounded-[3px] bg-[#eef3ee] text-[#6b8b79] dark:bg-[#303035] dark:text-[#a4ceb4]">
                  {tabIcon(tab.id)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-px">
                  {missingEn ? (
                    <span
                      role="button"
                      tabIndex={0}
                      className="block w-full cursor-pointer border-b border-dashed border-[#d8c39a] bg-none text-[0.75rem] font-semibold text-[#b07f2a] hover:text-[#8a5f16] focus-visible:outline-2 focus-visible:outline-orange focus-visible:outline-offset-1"
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
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[0.75rem] font-semibold text-[#344542] dark:text-[#e4e4e8]">{label}</span>
                  )}
                  <span className="text-[0.6875rem] text-[#84908c] dark:text-[#b0b0b6]">{stateShort}</span>
                </span>
              </button>
              </Tooltip>
              {!isClosed && (
                <Tooltip content={t('pageMother.closeTabTitle', { title: label })} tone="danger">
                <button
                  type="button"
                  className="me-1.5 grid size-[26px] flex-none cursor-pointer place-items-center rounded text-[#98a5a1] transition-colors duration-[120ms] hover:bg-[#fbeae8] hover:text-[#c8443c] dark:hover:bg-[#3a2a28] dark:hover:text-[#e88d86]"
                  aria-label={t('pageMother.closeTabTitle', { title: label })}
                  onClick={() => onCloseTab(tab.id)}
                >
                  <X size={14} />
                </button>
                </Tooltip>
              )}
            </div>
          )
        })}
      </div>

      {/* ===== القسم السفلي footer: زرّا النهاية state + closerepo (ثابت) =====
          في الوضع الكامل جنباً إلى جنب، وفي المطوي فوق بعضهما. */}
      <div className="sticky bottom-0 z-10 flex flex-none shrink-0 items-center gap-2 border-t border-line px-2.5 pt-2.5 pb-3">
        <Tooltip content={t('pageMother.closeRepoTitle')} className="w-full">
        <button
          type="button"
          id="closerepo"
          className="vault-secondary min-w-0 flex-1"
          onClick={onCloseRepo}
        >
          <Database size={15} className="flex-none text-[#c8443c] dark:text-[#e88d86]" /> <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{t('pageMother.closeRepoBtn')}</span>
        </button>
        </Tooltip>
        {/* في الوضع الكامل: طيّ اللوحة، لا إزالتها — وفي درج الهواتف
            يتحول الزر إلى إغلاق (X).
            الأيقونة تدلّ على ما سيحدث (طيّ)، فاتجاهها نحو حافة الشاشة:
            يميناً في LTR ويساراً في RTL. */}
        <Tooltip content={stateButtonMode === 'close' ? t('pageMother.closePanelTitle') : t('pageMother.collapsePanelTitle')}>
        <button
          type="button"
          id="state"
          className="grid size-[38px] flex-none cursor-pointer place-items-center rounded border border-[#dfe6e0] bg-white text-[#61736b] transition-colors duration-[130ms] hover:bg-[#f4f7f4] hover:text-[#2e413c] dark:border-[#404046] dark:bg-[#29292d] dark:text-[#d0d0d4] dark:hover:bg-[#2a2a2f] dark:hover:text-[#f0f0f2]"
          aria-label={stateButtonMode === 'close' ? t('pageMother.closePanelAria') : t('pageMother.collapsePanelAria')}
          onClick={onCollapse}
        >
          {stateButtonMode === 'close' ? <X size={16} /> : isRTL ? <ChevronsLeft size={16} /> : <ChevronsRight size={16} />}
        </button>
        </Tooltip>
      </div>
    </>
  )
}