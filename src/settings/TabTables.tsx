// جداول المستودع الحالي — لكل جدول صف: الاسم العربي، الاسم الإنكليزي، والإجراءات.
// العزل: كل العمليات على المستودع المفتوح فقط (لا سجل عام). الحذف نهائي بتأكيد،
// والنقل فوري. إدارة الحقول في تبويب «الحقول» حصراً — لا عرض مضمّن هنا.
// الأنماط أدوات Tailwind؛ القواعد المقابلة حُذفت من index.css.

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import {
  createCustomTab, deleteCoreTab, deleteRepoTab, moveRepoTab, renameRepoTab, restoreCoreTab, restoreRepoDefaults, setTabHidden,
  type RepoData, type RepoTab,
} from '../repos/repoService'
import MoadAddField, { type TabValues } from '../modals/MoadAddField'
import { Tooltip } from "../components/Tooltip"
import { useToast } from 'react-theme-toast'
import { useLanguage } from '../language/LanguageContext'

type TabTablesProps = {
  /** المستودع المفتوح — غيابه يعطّل كل شيء مع تلميح. */
  repo: RepoData | null
  repoPassword: string | null
  onRepoUpdated: (data: RepoData) => void
  /** معرّف جدول نريد تركيز حقله الإنكليزي فور فتح هذه الصفحة. */
  focusTabId?: string
}

type DialogState = { mode: 'add' } | { mode: 'edit'; index: number; values: TabValues } | null

const VIEW = 'pt-[18px] px-7 max-[860px]:px-[18px] max-[560px]:px-3.5'
const NOTE = 'm-0 text-[0.75rem] text-[#7c8984]'
const HINT = 'mt-1 mb-0 text-[0.6875rem] text-[#9aa49f] dark:text-[#8f8f96]'
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

// خلايا الاسم نصٌّ صِرف — لا حقل إدخال. التعديل من زر القلم وحده.
// الميلان يتبع lang (لغة التطبيق) لا dir (اتجاه النص) — انظر plan/Finished/header-layout-ar.md §6
const CELL =
  'block overflow-hidden py-[7px] px-0.5 text-[0.8125rem] leading-[1.35] text-ellipsis whitespace-nowrap ' +
  'text-[#2e413c] ar:text-right en:text-left dark:text-[#e6e6ea]'
const CELL_EMPTY = 'text-[#c0a97e] dark:text-[#9c8452]'

const ROW_ACTIONS = 'flex justify-end gap-2'

// خلية الإجراءات بحشو أوسع من بقية الخلايا لتنفّس الأزرار الأكبر.
const TD_ACTIONS = 'px-3 py-2 align-middle border-b border-[#eef2ef] dark:border-[#333338]'

// كارد الموبايل: بديل الجدول تحت 861px — صف كامل على الصغيرة وكاردان
// في الصف على المتوسطة (min-[560px]).
const CARDS = 'grid grid-cols-1 gap-2.5 min-[560px]:grid-cols-2 min-[861px]:hidden'
const CARD =
  'flex flex-col gap-2.5 rounded border border-[#e8ede9] bg-[#f8faf8] p-3 ' +
  'dark:border-[#3b3b41] dark:bg-[#242428]'
const CARD_ORDER =
  'grid size-8 flex-none place-items-center rounded bg-[#eef3ee] text-[0.6875rem] text-[#6b8b79] [font-family:DM_Mono,monospace] ' +
  'dark:bg-[#303035] dark:text-[#a4ceb4]'
const CARD_NAME = 'overflow-hidden text-ellipsis whitespace-nowrap text-[0.8125rem] font-semibold text-[#2e413c] dark:text-[#e6e6ea]'

type RowActionsProps = {
  tab: RepoTab
  index: number
  isFirst: boolean
  isLast: boolean
  saving: boolean
  onMove: (index: number, delta: -1 | 1) => void
  onEdit: () => void
  onRemove: () => void
  onToggleHidden: () => void
  onRestore: () => void
}

// أزرار الإجراءات مشتركة بين صف الجدول (ديسكتوب) والكارد (موبايل).
// المحذوف ناعماً: زر استعادة فقط — بلا نقل/تعديل/إخفاء/حذف.
function RowActions({
  tab, index, isFirst, isLast, saving,
  onMove, onEdit, onRemove, onToggleHidden, onRestore,
}: RowActionsProps) {
  const { t } = useLanguage()
  if (tab.isDeleted) {
    return (
      <div className={ROW_ACTIONS}>
        <Tooltip content={t('settingsPanel.restoreTabTitle', { title: tab.title })}>
        <button
          type="button"
          className="viewer-icon-button viewer-icon-action"
          aria-label={t('settingsPanel.restoreTabAria', { title: tab.title })}
          disabled={saving}
          onClick={onRestore}
        >
          <RotateCcw size={14} />
        </button>
        </Tooltip>
      </div>
    )
  }
  return (
    <div className={ROW_ACTIONS}>
      <Tooltip content={t('settingsPanel.moveUpTitle')}>
      <button
        type="button"
        className="viewer-icon-button viewer-icon-action"
        aria-label={t('settingsPanel.moveUpAria', { title: tab.title })}
        disabled={isFirst || saving}
        onClick={() => onMove(index, -1)}
      >
        <ArrowUp size={14} />
      </button>
      </Tooltip>
      <Tooltip content={t('settingsPanel.moveDownTitle')}>
      <button
        type="button"
        className="viewer-icon-button viewer-icon-action"
        aria-label={t('settingsPanel.moveDownAria', { title: tab.title })}
        disabled={isLast || saving}
        onClick={() => onMove(index, 1)}
      >
        <ArrowDown size={14} />
      </button>
      </Tooltip>
      <Tooltip content={t('settingsPanel.editTabTitle')}>
      <button
        type="button"
        className="viewer-icon-button viewer-icon-action"
        aria-label={t('settingsPanel.editTabAria', { title: tab.title })}
        disabled={saving}
        onClick={onEdit}
      >
        <Pencil size={14} />
      </button>
      </Tooltip>
      <Tooltip content={tab.isHidden ? t('settingsPanel.showTabTitle') : t('settingsPanel.hideTabTitle')}>
      <button
        type="button"
        className="viewer-icon-button viewer-icon-action"
        aria-label={tab.isHidden ? t('settingsPanel.showTabAria', { title: tab.title }) : t('settingsPanel.hideTabAria', { title: tab.title })}
        aria-pressed={tab.isHidden}
        disabled={saving}
        onClick={onToggleHidden}
      >
        {tab.isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
      </Tooltip>
      <Tooltip content={t('settingsPanel.deleteTabTitle')} tone="danger">
      <button
        type="button"
        className="viewer-icon-button vault-danger"
        aria-label={t('settingsPanel.deleteTabAria', { title: tab.title })}
        disabled={saving}
        onClick={onRemove}
      >
        <Trash2 size={14} />
      </button>
      </Tooltip>
    </div>
  )
}

export default function TabTables({ repo, repoPassword, onRepoUpdated, focusTabId }: TabTablesProps) {
  const { t, lang } = useLanguage()
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [dialog, setDialog] = useState<DialogState>(null)
  /** لغة عرض أسماء الجداول في القائمة: عربي فقط أو إنكليزي فقط (بدل الاثنين معاً). */
  const [displayLang, setDisplayLang] = useState<'ar' | 'en'>(lang === 'en' ? 'en' : 'ar')

  const tabs = [...(repo?.tabs ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)

  // ——— السحب والإفلات لإعادة الترتيب (لمس + ماوس عبر Pointer Events) ———
  // المقبض وحده يبدأ السحب (touch-action:none) فلا يتعارض مع تمرير الصفحة،
  // والأسهم تبقى بديلاً. الإفلات يُحسَم لموضع صف (فوق/تحت) داخل القائمة حصراً.
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const rowEls = useRef(new Map<string, HTMLElement>())
  const dragRef = useRef<{ id: string; pointerId: number } | null>(null)
  const dropRef = useRef<number | null>(null)

  /** أقرب موضع إفلات لإحداثي Y: أول صف منتصفه تحت المؤشر، وإلا الأخير. */
  const indexFromY = (y: number): number => {
    for (let i = 0; i < tabs.length; i++) {
      const el = rowEls.current.get(tabs[i].id)
      if (!el) continue
      const rect = el.getBoundingClientRect()
      if (rect.height <= 0) continue
      if (y < rect.top + rect.height / 2) return i
    }
    return tabs.length - 1
  }

  /** نقل لموضع محدد عبر تكرار أمر الخطوة الواحدة (صامت) ثم تنبيه واحد. */
  const moveTo = async (from: number, to: number) => {
    if (!repo || saving || from < 0 || to < 0 || from >= tabs.length || to >= tabs.length || from === to) return
    const id = tabs[from].id
    const step = (to > from ? 1 : -1) as -1 | 1
    setSaving(true)
    try {
      let data = null as Awaited<ReturnType<typeof moveRepoTab>> | null
      for (let i = 0; i < Math.abs(to - from); i++) {
        data = await moveRepoTab(repo.meta.id, repoPassword, id, step)
      }
      if (data) onRepoUpdated(data)
      toast.success(t('settingsPanel.savedStatus'))
    } catch (cause: unknown) {
      toast.error(cause instanceof Error ? cause.message : t('settingsPanel.saveTabsError'))
    } finally {
      setSaving(false)
    }
  }

  const endDrag = (pointerId: number) => {
    const active = dragRef.current
    if (!active || active.pointerId !== pointerId) return
    dragRef.current = null
    const from = tabs.findIndex((entry) => entry.id === active.id)
    const to = dropRef.current
    setDragId(null)
    setDropIndex(null)
    dropRef.current = null
    if (from >= 0 && to !== null && to !== from) void moveTo(from, to)
  }

  /** خاصيات مقبض السحب لصف/كارد — تُنشر على العنصر مباشرة. */
  const gripProps = (id: string, index: number) => ({
    role: 'button' as const,
    tabIndex: -1,
    'aria-label': t('settingsPanel.dragHandleTitle'),
    style: { touchAction: 'none' } as const,
    className: 'grid size-8 flex-none cursor-grab place-items-center text-[#84908c] active:cursor-grabbing dark:text-[#a9a9af]',
    onPointerDown: (e: ReactPointerEvent) => {
      if (saving || !id) return
      e.preventDefault()
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // لا التقاط — يستمر التتبع على العنصر نفسه.
      }
      dragRef.current = { id, pointerId: e.pointerId }
      dropRef.current = index
      setDragId(id)
      setDropIndex(index)
    },
    onPointerMove: (e: ReactPointerEvent) => {
      const active = dragRef.current
      if (!active || active.pointerId !== e.pointerId || active.id !== id) return
      const next = indexFromY(e.clientY)
      dropRef.current = next
      setDropIndex(next)
    },
    onPointerUp: (e: ReactPointerEvent) => endDrag(e.pointerId),
    onPointerCancel: (e: ReactPointerEvent) => endDrag(e.pointerId),
  })

  const registerRow = (id: string) => (el: HTMLElement | null) => {
    if (el) rowEls.current.set(id, el)
    else rowEls.current.delete(id)
  }

  // قفزة من دعوة «اضغط هنا»: تفتح مودال التعديل على هذا الجدول تحديداً.
  useEffect(() => {
    if (!focusTabId) return
    const index = tabs.findIndex((tab) => tab.id === focusTabId)
    if (index < 0) return
    const target = tabs[index]
    setDialog({ mode: 'edit', index, values: { title: target.title, titleEn: target.titleEn } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTabId])

  /** تنفيذ عملية على المستودع الحالي ثم تبنّي البيانات العائدة — النتيجة عبر التوست. */
  const runOp = async (op: () => Promise<RepoData>, message?: string): Promise<boolean> => {
    if (!repo || saving) return false
    setSaving(true)
    try {
      const data = await op()
      onRepoUpdated(data)
      if (message) toast.success(message)
      return true
    } catch (cause: unknown) {
      toast.error(cause instanceof Error ? cause.message : t('settingsPanel.saveTabsError'))
      return false
    } finally {
      setSaving(false)
    }
  }

  // النقل فوري (تبادل مع الجار في الخلفية) — بلا حالة معلقة.
  const move = (index: number, delta: -1 | 1) => {
    const target = tabs[index]
    if (!target) return
    void runOp(
      () => moveRepoTab(repo!.meta.id, repoPassword, target.id, delta),
      t('settingsPanel.savedStatus'),
    )
  }

  // الحذف: للأساسي حذف ناعم (مسح البيانات + وسم — بتأكيد يحذّر من عدم الرجعة)،
  // وللمخصص إسقاط الجدول الفيزيائي. المحذوف ناعماً يُستعاد فارغاً (بلا تأكيد).
  const remove = (index: number) => {
    const target = tabs[index]
    if (!target || target.isDeleted) return
    if (target.kind === 'core') {
      if (!window.confirm(t('settingsPanel.deleteCoreConfirm', { title: target.title }))) return
      void runOp(
        () => deleteCoreTab(repo!.meta.id, repoPassword, target.id),
        t('settingsPanel.deletedStatus'),
      )
      return
    }
    if (!window.confirm(t('settingsPanel.deleteTabFinalConfirm', { title: target.title }))) return
    void runOp(
      () => deleteRepoTab(repo!.meta.id, repoPassword, target.id),
      t('settingsPanel.deletedStatus'),
    )
  }

  const restoreDeleted = (id: string) => {
    void runOp(
      () => restoreCoreTab(repo!.meta.id, repoPassword, id),
      t('settingsPanel.restoredStatus'),
    )
  }

  const restore = () => {
    if (!window.confirm(t('settingsPanel.restoreDefaultsConfirm'))) return
    void runOp(
      () => restoreRepoDefaults(repo!.meta.id, repoPassword),
      t('settingsPanel.restoredStatus'),
    )
  }

  const handleDialogSubmit = async (values: TabValues) => {
    const mode = dialog?.mode
    const index = dialog?.mode === 'edit' ? dialog.index : -1
    setDialog(null)
    if (!mode || !repo) return
    if (mode === 'add') {
      // تبويب مخصص = جدول فيزيائي فوري (بلا أعمدة أولاً) — يبقى في القائمة،
      // وإدارة حقوله من تبويب «الحقول» حصراً.
      setSaving(true)
      try {
        const data = await createCustomTab(repo.meta.id, repoPassword, values.title, values.titleEn, [])
        onRepoUpdated(data)
        toast.success(t('settingsPanel.addedStatus'))
      } catch (cause: unknown) {
        toast.error(cause instanceof Error ? cause.message : t('settingsPanel.saveTabsError'))
      } finally {
        setSaving(false)
      }
      return
    }
    const target = tabs[index]
    if (!target) return
    await runOp(
      () => renameRepoTab(repo.meta.id, repoPassword, target.id, values.title, values.titleEn),
      t('settingsPanel.savedStatus'),
    )
  }

  if (!repo) {
    return (
      <div className={VIEW}>
        <p className={EMPTY}>{t('settingsPanel.openRepoFirstHint')}</p>
        <div className="h-5" aria-hidden="true" />
      </div>
    )
  }

  const rowActions = (tab: RepoTab, index: number) => (
    <RowActions
      tab={tab}
      index={index}
      isFirst={index === 0}
      isLast={index === tabs.length - 1}
      saving={saving}
      onMove={move}
      onEdit={() => setDialog({ mode: 'edit', index, values: { title: tab.title, titleEn: tab.titleEn } })}
      onRemove={() => remove(index)}
      onRestore={() => restoreDeleted(tab.id)}
      onToggleHidden={() => {
        void runOp(
          () => setTabHidden(repo!.meta.id, repoPassword, tab.id, !tab.isHidden),
          tab.isHidden ? t('settingsPanel.shownStatus') : t('settingsPanel.hiddenStatus'),
        )
      }}
    />
  )

  return (
    <div className={VIEW}>
      <div className="mb-3">
        <p className={NOTE}>{t('settingsPanel.tabsNote')}</p>
        <p className={HINT}>{t('settingsPanel.tabsDualLangHint')}</p>
      </div>
      <div className="mb-2.5 flex gap-2">
        <button
          type="button"
          className="vault-secondary vault-small flex-1"
          disabled={saving}
          onClick={restore}
        >
          <RotateCcw size={15} /> {t('settingsPanel.restoreDefaultsBtn')}
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
        disabled={saving}
        onClick={() => setDialog({ mode: 'add' })}
      >
        <Plus size={15} /> {t('settingsPanel.addTabBtn')}
      </button>

      {tabs.length === 0 ? (
        <p className={EMPTY}>{t('settingsPanel.emptyTabs')}</p>
      ) : (
        <>
        <div className={`${TABLE_WRAP} max-[860px]:hidden${dragId ? ' select-none' : ''}`}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col" className={`${TH} ${TH_ORDER}`}>{t('settingsPanel.tableOrderHeader')}</th>
                {displayLang === 'ar' && <th scope="col" className={TH}>{t('settingsPanel.tableArabicHeader')}</th>}
                {displayLang === 'en' && <th scope="col" className={TH}>{t('settingsPanel.tableEnglishHeader')}</th>}
                <th scope="col" className={`${TH} ${TH_ACTIONS}`}>{t('settingsPanel.tableActionsHeader')}</th>
                <th scope="col" className={`${TH} w-8`}><span className="sr-only">{t('settingsPanel.dragHandleTitle')}</span></th>
              </tr>
            </thead>
            <tbody className="[&>tr:hover]:bg-white [&>tr:last-child>td]:border-b-0 dark:[&>tr:hover]:bg-[#2a2a2f]">
              {tabs.map((tab, index) => (
                <tr
                  key={tab.id || `new-${index}`}
                  ref={registerRow(tab.id)}
                  className={`${tab.isHidden ? 'opacity-60' : ''}${dragId === tab.id ? ' opacity-40' : ''}${dragId && dropIndex === index && dragId !== tab.id ? ' ring-2 ring-inset ring-green' : ''}`}
                >
                  <td className={`${TD} ${TD_ORDER}`}>{String(index + 1).padStart(2, '0')}</td>
                  {displayLang === 'ar' && (
                  <td className={TD}>
                    <Tooltip content={tab.title}>
                    <span className={CELL} dir="auto">{tab.title}{tab.isHidden ? ` · ${t('settingsPanel.hiddenBadge')}` : ''}{tab.isDeleted ? ` · ${t('settingsPanel.deletedBadge')}` : ''}</span>
                    </Tooltip>
                  </td>
                  )}
                  {displayLang === 'en' && (
                  <td className={TD}>
                    {tab.titleEn.trim() ? (
                      <span className={CELL} dir="ltr">{tab.titleEn}{tab.isHidden ? ` · ${t('settingsPanel.hiddenBadge')}` : ''}{tab.isDeleted ? ` · ${t('settingsPanel.deletedBadge')}` : ''}</span>
                    ) : (
                      <Tooltip content={t('moadAddField.englishRequiredError')}>
                      <span
                        className={`${CELL} ${CELL_EMPTY}`}
                        dir="ltr"
                      >
                        &mdash;
                      </span>
                      </Tooltip>
                    )}
                  </td>
                  )}
                  <td className={`${TD_ACTIONS} ${TH_ACTIONS}`}>
                    {rowActions(tab, index)}
                  </td>
                  <td className={`${TD} w-8`}>
                    <Tooltip content={t('settingsPanel.dragHandleTitle')}>
                    <span {...gripProps(tab.id, index)}>
                      <GripVertical size={14} />
                    </span>
                    </Tooltip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={`${CARDS}${dragId ? ' select-none' : ''}`} role="list">
          {tabs.map((tab, index) => (
            <article
              key={tab.id || `card-${index}`}
              ref={registerRow(tab.id)}
              className={`${CARD}${tab.isHidden ? ' opacity-60' : ''}${dragId === tab.id ? ' opacity-40' : ''}${dragId && dropIndex === index && dragId !== tab.id ? ' ring-2 ring-inset ring-green' : ''}`}
            >
              <div className="flex min-w-0 items-center gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <span className={CARD_ORDER}>{String(index + 1).padStart(2, '0')}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  {displayLang === 'ar' && (
                  <Tooltip content={tab.title}>
                  <span className={CARD_NAME} dir="auto">{tab.title}{tab.isHidden ? ` · ${t('settingsPanel.hiddenBadge')}` : ''}{tab.isDeleted ? ` · ${t('settingsPanel.deletedBadge')}` : ''}</span>
                  </Tooltip>
                  )}
                  {displayLang === 'en' && (
                  tab.titleEn.trim() ? (
                    <span className={CARD_NAME} dir="ltr">{tab.titleEn}{tab.isHidden ? ` · ${t('settingsPanel.hiddenBadge')}` : ''}{tab.isDeleted ? ` · ${t('settingsPanel.deletedBadge')}` : ''}</span>
                  ) : (
                    <span className={`${CARD_NAME} ${CELL_EMPTY}`} dir="ltr">&mdash;</span>
                  )
                  )}
                </div>
              </div>
              <Tooltip content={t('settingsPanel.dragHandleTitle')}>
              <span {...gripProps(tab.id, index)}>
                <GripVertical size={14} />
              </span>
              </Tooltip>
              </div>
              {rowActions(tab, index)}
            </article>
          ))}
        </div>
        </>
      )}

      <MoadAddField
        isOpen={dialog !== null}
        mode={dialog?.mode ?? 'add'}
        initial={dialog?.mode === 'edit' ? dialog.values : undefined}
        onClose={() => setDialog(null)}
        onSubmit={handleDialogSubmit}
      />
      <div className="h-5" aria-hidden="true" />
    </div>
  )
}
