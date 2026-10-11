// تبويب «الحقول» المستقل — قائمة الجداول (أساسية + مخصصة) ثم عرض حقول
// الجدول المختار (ثابتة + إضافية) مع التحرير الكامل.
// يُفتَح مباشرة أو بقفزة من العارض/الجداول (تحديد مسبق لجدول واحد).
// الترويسة داخل العرض: رجوع + لغة فلترة الأعمدة (AR/EN) + إضافة بعرض كامل.
import { useEffect, useState } from 'react'
import { Plus, SlidersHorizontal } from 'lucide-react'
import { Tooltip } from "../components/Tooltip"
import { tabTitle } from '../lib/tabTitle'
import TabFieldsManager from './TabFieldsManager'
import type { FieldLang } from '../lib/appSettings'
import type { RepoData } from '../repos/repoService'
import { useLanguage } from '../language/LanguageContext'

type TabFieldsProps = {
  repo: RepoData | null
  repoPassword: string | null
  onRepoUpdated: (data: RepoData) => void
  fieldLang: FieldLang
  /** قفزة من العارض/الجداول: يعرض حقول هذا الجدول مباشرة. */
  initialSelectedTabId?: string | null
  /** رجوع إضافي لقائمة الجداول — عند التضمين داخل تبويب الجداول فقط. */
  onExitTable?: () => void
}

type DisplayLang = 'ar' | 'en'

const VIEW = 'pt-[18px] px-7 max-[860px]:px-[18px] max-[560px]:px-3.5'
const NOTE = 'm-0 mb-3.5 text-[0.75rem] text-[#7c8984]'
const EMPTY =
  'm-0 rounded border border-dashed border-[#dfe6e0] bg-[#f8faf8] px-[18px] py-[18px] text-center text-[0.75rem] ' +
  'text-[#84908d] dark:border-[#404046] dark:bg-[#242428] dark:text-[#b0b0b6]'

const TABLE_WRAP = 'overflow-x-auto rounded border border-[#e8ede9] bg-[#f8faf8] dark:border-[#3b3b41] dark:bg-[#242428]'
const TABLE = 'w-full border-collapse text-[0.8125rem]'
const TH =
  'px-2.5 py-2 text-start text-[0.6875rem] font-bold whitespace-nowrap text-[#63716d] ' +
  'border-b border-[#e2e9e4] bg-[#f1f5f2] dark:border-[#3b3b41] dark:bg-[#2b2b30] dark:text-[#b0b0b6]'
const TH_ORDER = 'w-11 text-center'
const TH_ACTIONS = 'w-px whitespace-nowrap'
const TD = 'px-2 py-1.5 align-middle border-b border-[#eef2ef] dark:border-[#333338]'
const TD_ORDER = 'text-center text-[0.687rem] text-[#84908c] [font-family:DM_Mono,monospace] dark:text-[#a9a9af]'
const CELL =
  'block overflow-hidden py-[7px] px-0.5 text-[0.8125rem] leading-[1.35] text-ellipsis whitespace-nowrap ' +
  'text-[#2e413c] ar:text-right en:text-left dark:text-[#e6e6ea]'
const CELL_EMPTY = 'text-[#c0a97e] dark:text-[#9c8452]'
const TD_ACTIONS = 'px-3 py-2 align-middle border-b border-[#eef2ef] dark:border-[#333338]'

const CARDS = 'grid grid-cols-1 gap-2.5 min-[560px]:grid-cols-2 min-[861px]:hidden'
const CARD =
  'flex items-center gap-2.5 rounded border border-[#e8ede9] bg-[#f8faf8] p-3 ' +
  'dark:border-[#3b3b41] dark:bg-[#242428]'
const CARD_ORDER =
  'grid size-8 flex-none place-items-center rounded bg-[#eef3ee] text-[0.687rem] text-[#6b8b79] [font-family:DM_Mono,monospace] ' +
  'dark:bg-[#303035] dark:text-[#a4ceb4]'
const CARD_NAME = 'overflow-hidden text-ellipsis whitespace-nowrap text-[0.8125rem] font-semibold text-[#2e413c] dark:text-[#e6e6ea]'
const CARD_NAME_EN = 'overflow-hidden text-ellipsis whitespace-nowrap text-[0.75rem] text-[#84908c] dark:text-[#b0b0b6]'

export default function TabFields({ repo, repoPassword, onRepoUpdated, fieldLang, initialSelectedTabId, onExitTable }: TabFieldsProps) {
  const { t, lang } = useLanguage()
  const [selectedTabId, setSelectedTabId] = useState<string | null>(initialSelectedTabId ?? null)
  const [displayLang, setDisplayLang] = useState<DisplayLang>(lang === 'en' ? 'en' : 'ar')
  const [showAdd, setShowAdd] = useState(false)

  // قفزة من العارض/الجداول: تحديد الجدول المطلوب وعرض حقوله مباشرة.
  useEffect(() => {
    if (initialSelectedTabId) {
      setSelectedTabId(initialSelectedTabId)
      setShowAdd(false)
    }
  }, [initialSelectedTabId])

  const tabs = [...(repo?.tabs ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
  const selectedTab = selectedTabId && repo
    ? repo.tabs.find((tb) => tb.id === selectedTabId) ?? null
    : null
  useEffect(() => {
    if (selectedTabId && repo && !selectedTab) setSelectedTabId(null)
  }, [selectedTabId, repo, selectedTab])

  if (!repo) {
    return (
      <div className={VIEW}>
        <p className={EMPTY}>{t('settingsPanel.openRepoFirstHint')}</p>
        <div className="h-5" aria-hidden="true" />
      </div>
    )
  }

  // ——— عرض حقول الجدول المختار ———
  if (selectedTab) {
    return (
      <div className={VIEW}>
        <div className="mb-3">
          <p className="m-0 text-[0.9375rem] font-semibold text-[#2e413c] dark:text-[#e6e6ea]">
            {t('tabFieldsManager.manageTitle', { title: tabTitle(selectedTab, lang) })}
          </p>
          <p className="m-0 mt-1 text-[0.75rem] text-[#7c8984]">{t('settingsPanel.fieldsTabNote')}</p>
        </div>
        <div className="mb-2.5 flex gap-2">
          <button type="button" className="vault-secondary vault-small flex-1" onClick={() => { setSelectedTabId(null); setShowAdd(false) }}>
            {t('tabFieldsManager.backBtn')}
          </button>
          <button
            type="button"
            className="vault-secondary vault-small min-w-16"
            aria-label={displayLang === 'ar' ? t('tabFieldsManager.langEn') : t('tabFieldsManager.langAr')}
            onClick={() => setDisplayLang((prev) => (prev === 'ar' ? 'en' : 'ar'))}
          >
            <span dir="ltr">{displayLang === 'ar' ? 'EN' : 'AR'}</span>
          </button>
        </div>
        <button
          type="button"
          className="vault-primary vault-small mb-3.5 w-full"
          onClick={() => setShowAdd((prev) => !prev)}
          aria-expanded={showAdd}
        >
          <Plus size={15} /> {t('tabFieldsManager.addBtn')}
        </button>
        <TabFieldsManager
          repo={repo}
          repoPassword={repoPassword}
          tab={selectedTab}
          fieldLang={fieldLang}
          onRepoUpdated={onRepoUpdated}
          onBack={() => { setSelectedTabId(null); setShowAdd(false) }}
          displayMode={displayLang}
          showAdd={showAdd}
          onShowAddChange={setShowAdd}
          bare
        />
        <div className="h-5" aria-hidden="true" />
      </div>
    )
  }

  // ——— قائمة الجداول للاختيار ———
  const manageBtn = (tabId: string, title: string) => (
    <Tooltip content={t('settingsPanel.manageTabTitle')}>
    <button
      type="button"
      className="viewer-icon-button viewer-icon-action"
      aria-label={t('settingsPanel.manageTabAria', { title })}
      onClick={() => { setSelectedTabId(tabId); setShowAdd(false) }}
    >
      <SlidersHorizontal size={14} />
    </button>
    </Tooltip>
  )

  return (
    <div className={VIEW}>
      <div className="mb-3.5 flex items-start justify-between gap-3.5">
        <p className={NOTE}>{t('settingsPanel.fieldsTabNote')}</p>
        {onExitTable && (
          <button type="button" className="vault-secondary vault-small flex-none" onClick={onExitTable}>
            {t('tabFieldsManager.backBtn')}
          </button>
        )}
      </div>

      {tabs.length === 0 ? (
        <p className={EMPTY}>{t('settingsPanel.emptyTabs')}</p>
      ) : (
        <>
        <div className={`${TABLE_WRAP} max-[860px]:hidden`}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col" className={`${TH} ${TH_ORDER}`}>{t('settingsPanel.tableOrderHeader')}</th>
                <th scope="col" className={TH}>{t('settingsPanel.tableArabicHeader')}</th>
                <th scope="col" className={TH}>{t('settingsPanel.tableEnglishHeader')}</th>
                <th scope="col" className={`${TH} ${TH_ACTIONS}`}>{t('settingsPanel.tableActionsHeader')}</th>
              </tr>
            </thead>
            <tbody className="[&>tr:hover]:bg-white [&>tr:last-child>td]:border-b-0 dark:[&>tr:hover]:bg-[#2a2a2f]">
              {tabs.map((tab, index) => (
                <tr key={tab.id || `new-${index}`} className={tab.isHidden ? 'opacity-60' : undefined}>
                  <td className={`${TD} ${TD_ORDER}`}>{String(index + 1).padStart(2, '0')}</td>
                  <td className={TD}>
                    <Tooltip content={tab.title}>
                    <span className={CELL} dir="auto">{tab.title}{tab.isHidden ? ` · ${t('settingsPanel.hiddenBadge')}` : ''}{tab.isDeleted ? ` · ${t('settingsPanel.deletedBadge')}` : ''}</span>
                    </Tooltip>
                  </td>
                  <td className={TD}>
                    {tab.titleEn.trim() ? (
                      <span className={CELL} dir="ltr">{tab.titleEn}</span>
                    ) : (
                      <span className={`${CELL} ${CELL_EMPTY}`} dir="ltr">&mdash;</span>
                    )}
                  </td>
                  <td className={`${TD_ACTIONS} ${TH_ACTIONS}`}>
                    {!tab.isDeleted && (
                      <div className="flex justify-end gap-2">{manageBtn(tab.id, tab.title)}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={CARDS} role="list">
          {tabs.map((tab, index) => (
            <article key={tab.id || `card-${index}`} className={`${CARD}${tab.isHidden ? ' opacity-60' : ''}`}>
              <span className={CARD_ORDER}>{String(index + 1).padStart(2, '0')}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <Tooltip content={tab.title}>
                <span className={CARD_NAME} dir="auto">{tab.title}{tab.isHidden ? ` · ${t('settingsPanel.hiddenBadge')}` : ''}{tab.isDeleted ? ` · ${t('settingsPanel.deletedBadge')}` : ''}</span>
                </Tooltip>
                {tab.titleEn.trim() ? (
                  <span className={CARD_NAME_EN} dir="ltr">{tab.titleEn}</span>
                ) : (
                  <span className={`${CARD_NAME_EN} ${CELL_EMPTY}`} dir="ltr">&mdash;</span>
                )}
              </div>
              {!tab.isDeleted && manageBtn(tab.id, tab.title)}
            </article>
          ))}
        </div>
        </>
      )}
      <div className="h-5" aria-hidden="true" />
    </div>
  )
}
