// مدير أعمدة الجداول المخصصة — تعريف الأعمدة فقط (القيم تُحرَّر من العارض).
// إضافة عمود (ALTER TABLE حقيقي) + إعادة تسمية التسميتين + حذف نهائي.
// التبويبات الأساسية: أعمدتها ثابتة — رسالة توجيه للعارض.
import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, Pencil, RotateCcw, Save, Trash2, Undo2, X } from 'lucide-react'
import { ClearTextArea, ClearTextInput } from '../components/ClearTextInput'
import { tabTitle } from '../lib/tabTitle'
import { PHYSICAL_TABLES, ACCOUNT_FIELD_DEFS, CONTACT_FIELD_DEFS, applyBaseLabels, type PhysicalFieldDef, type PhysicalTableId } from '../lib/physicalTables'
import { useLanguage } from '../language/LanguageContext'
import { Tooltip } from "../components/Tooltip"
import ModalMessages from '../modals/ModalMessages'
import { useToast } from 'react-theme-toast'
import {
  addCustomColumn, deleteCustomColumn, hideBaseColumn, renameCustomColumn, resetBaseColumnLabel, restoreBaseColumn, setBaseColumnLabel, softDeleteBaseColumn, unhideBaseColumn,
  type CustomColumnInput, type RepoCustomColumn, type RepoData, type RepoTab,
} from '../repos/repoService'

/** وضع عرض التسميات في صفحة الحقول: عربي فقط / إنكليزي فقط / اللغتان معاً. */
export type FieldDisplayMode = 'ar' | 'en' | 'both'

type TabFieldsManagerProps = {
  repo: RepoData
  repoPassword: string | null
  tab: RepoTab
  fieldLang: 'ar' | 'en'
  onRepoUpdated: (data: RepoData) => void
  onBack: () => void
  /** وضع مضمّن: يتخطى الترويسة والحشوة الخارجية (المضيّف TabFields يقدّمهما). */
  bare?: boolean
  /** وضع عرض التسميات — الافتراضي اللغتان معاً. */
  displayMode?: FieldDisplayMode
  /** نموذج الإضافة مُدار من المضيّف (زر بعرض الصف في TabFields). */
  showAdd: boolean
  onShowAddChange: (visible: boolean) => void
}

const FTYPES = ['text', 'long', 'number', 'date', 'phone', 'yesno', 'list'] as const

/** سطور «key | ar | en» → JSON خيارات القائمة. */
function linesToOptions(text: string): { ok: true; json: string } | { ok: false } {
  const rows = text.split('\n').map((l) => l.trim()).filter((l) => l !== '')
  if (rows.length === 0) return { ok: false }
  const arr = []
  for (const row of rows) {
    const [key, ar, en] = row.split('|').map((s) => s.trim())
    if (!key) return { ok: false }
    arr.push({ key, ar: ar || key, en: en || ar || key })
  }
  return { ok: true, json: JSON.stringify(arr) }
}

const inputCls = 'modal-input'

export default function TabFieldsManager({ repo, repoPassword, tab, onRepoUpdated, onBack, bare = false, displayMode = 'both', showAdd, onShowAddChange }: TabFieldsManagerProps) {
  const { t, lang } = useLanguage()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ label: '', labelEn: '', name: '', ftype: 'text', options: '' })
  const [renaming, setRenaming] = useState<{ columnName: string; label: string; labelEn: string } | null>(null)
  /** حذف مؤكد عبر مودال الرسائل (بدل window.confirm — لا يعمل native على أندرويد). */
  const [pendingDeleteCustom, setPendingDeleteCustom] = useState<RepoCustomColumn | null>(null)
  const [pendingDeleteBase, setPendingDeleteBase] = useState<{ key: string; label: string } | null>(null)
  const addFormRef = useRef<HTMLDivElement | null>(null)

  // كشف النموذج من زر المضيّف العلوي: تمرير إليه لئلا يبقى خارج الشاشة.
  useEffect(() => {
    if (showAdd) addFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [showAdd])

  // الأعمدة الثابتة للجداول القابلة للتمديد تُمدَّد هنا (تُحرَّر قيمها من العارض).
  // ملفات: بنيتها ثابتة ولا تمديد لها — رسالة توجيه فقط.
  if (tab.kind === 'core' && !['passports', 'civil', 'national_ids', 'study', 'accounts', 'contacts'].includes(tab.id)) {
    return (
      <div className={bare ? undefined : 'pt-[18px] px-7 max-[860px]:px-[18px] max-[560px]:px-3.5'}>
        <p className="m-0 text-[0.9375rem] font-semibold">{tabTitle(tab, lang)}</p>
        <p className="vault-empty">{t('tabFieldsManager.coreFixed')}</p>
        {!bare && (
          <button type="button" className="vault-secondary vault-small" onClick={onBack}>
            {t('tabFieldsManager.backBtn')}
          </button>
        )}
      </div>
    )
  }

  // الأعمدة الثابتة من مصدر التعريف الوحيد — قراءة فقط هنا.
  const table = repo.customTables.find((ct) => ct.tabId === tab.id)
  const baseOverrides = table?.labels ?? []
  const baseTableDefs = tab.id === 'accounts'
    ? ACCOUNT_FIELD_DEFS
    : tab.id === 'contacts'
      ? CONTACT_FIELD_DEFS
      : (PHYSICAL_TABLES[tab.id as PhysicalTableId] ?? [])
  const fixedDefs: PhysicalFieldDef[] = tab.kind === 'core'
    ? applyBaseLabels(baseTableDefs, baseOverrides)
    : []
  const overriddenKeys = new Set(baseOverrides.map((o) => o.columnName))
  const columns: RepoCustomColumn[] = [...(table?.columns ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
  const hiddenList: string[] = table?.hidden ?? []

  // السطر الرئيسي يتبع وضع الفلتر نفسه: عربي في AR وإنكليزي في EN —
  // فصف الأعمدة الإنجليزية يعرض "Name" لا "الاسم (إنكليزي)".
  const names = (ar: string, en: string): { main: string; rest: string } => {
    const enEff = en.trim() ? en : ar
    return displayMode === 'ar'
      ? { main: ar, rest: '' }
      : displayMode === 'en'
        ? { main: enEff, rest: '' }
        : lang === 'ar'
          ? { main: ar, rest: enEff }
          : { main: enEff, rest: ar }
  }

  /**
   * لغة قيم العمود لفلترة زر العرض: النصية تُصنَّف بلاحقة المفتاح (`En`/`_en`
   * للإنجليزية)، وغير النصية (تاريخ/عدد/قائمة/نعم-لا/هاتف) محايدة تظهر في الوضعين.
   */
  const columnBucket = (key: string, ftype: string): 'ar' | 'en' | 'neutral' => {
    if (ftype !== 'text' && ftype !== 'long') return 'neutral'
    return key.endsWith('En') || key.endsWith('_en') || key.endsWith('EN') ? 'en' : 'ar'
  }
  const inDisplayMode = (bucket: 'ar' | 'en' | 'neutral'): boolean =>
    displayMode === 'both' ? true : bucket === 'neutral' || bucket === displayMode

  /**
   * تجريد لاحقة التمييز " (English)"/" (إنكليزي)" من التسمية المعروضة —
   * وُضعت في البيانات للتمييز عند عرض اللغتين معاً، ومع فلترة الأعمدة
   * (وضع مفرد) تصبح ضجيجاً: كل الصفوف إنجليزية أصلاً.
   */
  const stripLangSuffix = (s: string): string => s.replace(/\s*\((English|إنكليزي)\)\s*$/, '')

  const runOp = async (op: () => Promise<RepoData>, done?: () => void) => {
    if (busy) return
    setBusy(true)
    try {
      onRepoUpdated(await op())
      done?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('tabFieldsManager.saveError'))
    } finally {
      setBusy(false)
    }
  }

  const submitAdd = () => {
    if (!form.label.trim()) {
      toast.error(t('tabFieldsManager.labelRequired'))
      return
    }
    let foptions = ''
    if (form.ftype === 'list') {
      const parsed = linesToOptions(form.options)
      if (!parsed.ok) {
        toast.error(t('tabFieldsManager.badOptions'))
        return
      }
      foptions = parsed.json
    }
    const input: CustomColumnInput = {
      name: form.name.trim(),
      label: form.label.trim(),
      labelEn: form.labelEn.trim(),
      ftype: form.ftype,
      foptions,
    }
    void runOp(
      () => addCustomColumn(repo.meta.id, repoPassword, tab.id, input),
      () => {
        onShowAddChange(false)
        setForm({ label: '', labelEn: '', name: '', ftype: 'text', options: '' })
      },
    )
  }

  const submitRename = () => {
    if (!renaming || !renaming.label.trim()) return
    void runOp(
      () => renameCustomColumn(repo.meta.id, repoPassword, tab.id, renaming.columnName, renaming.label.trim(), renaming.labelEn.trim()),
      () => setRenaming(null),
    )
  }

  const askDelete = (col: RepoCustomColumn) => {
    setPendingDeleteCustom(col)
  }

  // الإخفاء الماسح للثابتة: تأكيد صريح (مسح البيانات لا رجعة فيه) — الفك بلا تأكيد.
  // الإخفاء: وسم فقط بلا مساس بالبيانات — بلا تأكيد. الفك يعيد الحقل ببياناته.
  const askHideBase = (key: string) => {
    void runOp(() => hideBaseColumn(repo.meta.id, repoPassword, tab.id, key))
  }

  const askUnhideBase = (key: string) => {
    void runOp(() => unhideBaseColumn(repo.meta.id, repoPassword, tab.id, key))
  }

  // الحذف الناعم للثابتة: مسح البيانات + وسم محذوف (تأكيد صريح) — الاستعادة تعيده فارغاً.
  const deletedList: string[] = table?.deleted ?? []

  const askDeleteBase = (key: string, label: string) => {
    setPendingDeleteBase({ key, label })
  }

  const askRestoreBase = (key: string) => {
    void runOp(() => restoreBaseColumn(repo.meta.id, repoPassword, tab.id, key))
  }

  // إعادة تسمية الثابتة: تجاوز عرض فقط — الفيزيائي ثابت في الكود والسكيمة.
  const [renamingBase, setRenamingBase] = useState<{ key: string; label: string; labelEn: string } | null>(null)

  const submitRenameBase = () => {
    if (!renamingBase || !renamingBase.label.trim()) return
    void runOp(
      () => setBaseColumnLabel(repo.meta.id, repoPassword, tab.id, renamingBase.key, renamingBase.label.trim(), renamingBase.labelEn.trim()),
      () => setRenamingBase(null),
    )
  }

  const resetBaseLabel = (key: string) => {
    void runOp(() => resetBaseColumnLabel(repo.meta.id, repoPassword, tab.id, key))
  }

  return (
    <div className={bare ? undefined : 'pt-[18px] px-7 max-[860px]:px-[18px] max-[560px]:px-3.5'}>
      {!bare && (
        <div className="mb-3.5 flex items-start justify-between gap-3.5">
          <div>
            <p className="m-0 text-[0.9375rem] font-semibold text-[#2e413c] dark:text-[#e6e6ea]">
              {t('tabFieldsManager.manageTitle', { title: tabTitle(tab, lang) })}
            </p>
            <p className="m-0 mt-1 text-[0.75rem] text-[#7c8984]">{t('tabFieldsManager.manageHint')}</p>
          </div>
          <button type="button" className="vault-secondary vault-small" onClick={onBack}>
            {t('tabFieldsManager.backBtn')}
          </button>
        </div>
      )}

      {fixedDefs.filter((def) => inDisplayMode(columnBucket(def.key, def.type))).length > 0 && (
        <section aria-label={t('tabFieldsManager.fixedTitle')} className="mt-4">
          <p className="m-0 text-[0.9375rem] font-semibold text-[#2e413c] dark:text-[#e6e6ea]">
            {t('tabFieldsManager.fixedTitle')}
          </p>
          <p className="m-0 mt-1 text-[0.75rem] text-[#7c8984]">{t('tabFieldsManager.fixedHint')}</p>
          <div className="mt-2 flex flex-col gap-2">
            {fixedDefs.filter((def) => inDisplayMode(columnBucket(def.key, def.type))).map((def) => {
              const label = names(stripLangSuffix(def.labelAr), stripLangSuffix(def.labelEn))
              const isHidden = hiddenList.includes(def.key)
              const isDeleted = deletedList.includes(def.key)
              const isOverridden = overriddenKeys.has(def.key)
              const dimmed = isHidden || isDeleted
              return (
                <div key={def.key} className={`rounded border border-[#e8ede9] bg-[#f8faf8] px-3 py-2.5 dark:border-[#3b3b41] dark:bg-[#242428]${dimmed ? ' opacity-60' : ''}`}>
                  {renamingBase !== null && renamingBase.key === def.key ? (
                    <div className="flex flex-col gap-2">
                      <ClearTextInput
                        type="text" className={inputCls} value={renamingBase.label}
                        onChange={(e) => setRenamingBase({ ...renamingBase, label: e.target.value })}
                        maxLength={80} dir="auto" aria-label={t('tabFieldsManager.labelAr')}
                      />
                      <ClearTextInput
                        type="text" className={inputCls} lang="en" value={renamingBase.labelEn}
                        onChange={(e) => setRenamingBase({ ...renamingBase, labelEn: e.target.value })}
                        maxLength={80} dir="ltr" aria-label={t('tabFieldsManager.labelEn')}
                      />
                      <div className="flex flex-wrap gap-1.5">
                        <button type="button" className="vault-primary vault-small" disabled={busy} style={{ flex: '1 1 0' }} onClick={submitRenameBase}>
                          <Save size={15} /> {t('tabFieldsManager.saveBtn')}
                        </button>
                        <button type="button" className="vault-secondary vault-small" disabled={busy} style={{ flex: '1 1 0' }} onClick={() => setRenamingBase(null)}>
                          <X size={15} /> {t('tabFieldsManager.cancelBtn')}
                        </button>
                        {isOverridden && (
                          <Tooltip content={t('tabFieldsManager.resetBaseBtn')}>
                          <button
                            type="button" className="vault-secondary vault-small" disabled={busy}
                            style={{ flex: '0 0 40%' }}
                            aria-label={t('tabFieldsManager.resetBaseBtn')}
                            onClick={() => {
                              resetBaseLabel(def.key)
                              setRenamingBase(null)
                            }}
                          >
                            <RotateCcw size={15} /> {t('tabFieldsManager.defaultBtn')}
                          </button>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  ) : (
                  <div className={`flex items-center gap-2${displayMode === 'en' ? ' [direction:ltr]' : ''}`}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.8125rem] font-semibold" dir="auto">
                        {label.main}{isHidden ? ` · ${t('tabFieldsManager.hiddenBadge')}` : ''}{isDeleted ? ` · ${t('tabFieldsManager.deletedBadge')}` : ''}
                      </span>
                      {[label.rest, displayMode === 'both' ? def.key : ''].some((s) => s !== '') && (
                        <span className="block truncate text-[0.6875rem] text-[#84908c]" dir="auto">
                          {[label.rest, displayMode === 'both' ? def.key : ''].filter((s) => s !== '').join(' · ')}
                        </span>
                      )}
                    </span>
                    <div className="flex flex-none items-center gap-1.5">
                    <Tooltip content={t('tabFieldsManager.renameBtn')}>
                    <button
                      type="button" className="vault-secondary vault-small" disabled={busy}
                      aria-label={t('tabFieldsManager.renameBtn')}
                      onClick={() => setRenamingBase({ key: def.key, label: stripLangSuffix(def.labelAr), labelEn: stripLangSuffix(def.labelEn) })}
                    >
                      <Pencil size={15} />
                    </button>
                    </Tooltip>
                    {isHidden ? (
                      <Tooltip content={t('tabFieldsManager.unhideBtn')}>
                      <button
                        type="button" className="vault-secondary vault-small" disabled={busy}
                        aria-label={t('tabFieldsManager.unhideBtn')}
                        onClick={() => askUnhideBase(def.key)}
                      >
                        <EyeOff size={15} />
                      </button>
                      </Tooltip>
                    ) : (
                      <Tooltip content={t('tabFieldsManager.hideBtn')}>
                      <button
                        type="button" className="vault-secondary vault-small" disabled={busy}
                        aria-label={t('tabFieldsManager.hideBtn')}
                        onClick={() => askHideBase(def.key)}
                      >
                        <Eye size={15} />
                      </button>
                      </Tooltip>
                    )}
                    {isDeleted ? (
                      <Tooltip content={t('tabFieldsManager.restoreBaseBtn')}>
                      <button
                        type="button" className="vault-secondary vault-small" disabled={busy}
                        aria-label={t('tabFieldsManager.restoreBaseBtn')}
                        onClick={() => askRestoreBase(def.key)}
                      >
                        <Undo2 size={15} />
                      </button>
                      </Tooltip>
                    ) : (
                      <Tooltip content={t('tabFieldsManager.deleteBaseBtn')} tone="danger">
                      <button
                        type="button" className="vault-secondary vault-small" disabled={busy}
                        aria-label={t('tabFieldsManager.deleteBaseBtn')}
                        onClick={() => askDeleteBase(def.key, label.main)}
                      >
                        <Trash2 size={15} />
                      </button>
                      </Tooltip>
                    )}
                    </div>
                  </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      <p className="m-0 mt-4 text-[0.9375rem] font-semibold text-[#2e413c] dark:text-[#e6e6ea]">
        {t('tabFieldsManager.extraTitle')}
      </p>

      {showAdd && (
        <div className="field-form add-column-form" ref={addFormRef}>
          <div className="modal-field">
            <label htmlFor="cc-label" className="modal-label">{t('tabFieldsManager.labelAr')}</label>
            <ClearTextInput
              id="cc-label" type="text" className={inputCls}
              value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
              maxLength={80} dir="auto" autoFocus
            />
          </div>
          <div className="modal-field">
            <label htmlFor="cc-label-en" className="modal-label">{t('tabFieldsManager.labelEn')}</label>
            <ClearTextInput
              id="cc-label-en" type="text" className={inputCls} lang="en"
              value={form.labelEn} onChange={(e) => setForm({ ...form, labelEn: e.target.value })}
              maxLength={80} dir="ltr"
            />
          </div>
          <div className="modal-field">
            <label htmlFor="cc-name" className="modal-label">{t('tabFieldsManager.nameHint')}</label>
            <ClearTextInput
              id="cc-name" type="text" className={inputCls} lang="en"
              value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="latin_name" maxLength={40} dir="ltr"
            />
          </div>
          <div className="modal-field">
            <label htmlFor="cc-ftype" className="modal-label">{t('tabFieldsManager.typeLabel')}</label>
            <select
              id="cc-ftype" className={inputCls} value={form.ftype} disabled={busy}
              onChange={(e) => setForm({ ...form, ftype: e.target.value })}
            >
              {FTYPES.map((ft) => <option key={ft} value={ft}>{t(`tabFieldsManager.type_${ft}`)}</option>)}
            </select>
          </div>
          {form.ftype === 'list' && (
            <div className="modal-field">
              <label htmlFor="cc-options" className="modal-label">{t('tabFieldsManager.optionsLabel')}</label>
              <ClearTextArea
                id="cc-options" className={inputCls}
                value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })}
                placeholder={'male | ذكر | Male\nfemale | أنثى | Female'}
                dir="auto"
              />
              <p className="m-0 mt-1 text-[0.6875rem] text-[#9aa49f]">{t('tabFieldsManager.optionsHint')}</p>
            </div>
          )}
          <div className="field-edit-actions">
            <button type="button" className="vault-primary vault-small" disabled={busy} onClick={submitAdd}>
              <Save size={15} /> {t('tabFieldsManager.saveBtn')}
            </button>
            <button type="button" className="vault-secondary vault-small" disabled={busy} onClick={() => onShowAddChange(false)}>
              <X size={15} /> {t('tabFieldsManager.cancelBtn')}
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2">
        {columns.filter((col) => inDisplayMode(columnBucket(col.columnName, col.ftype))).length === 0 && <p className="vault-empty">{t('tabFieldsManager.noColumns')}</p>}
        {columns.filter((col) => inDisplayMode(columnBucket(col.columnName, col.ftype))).map((col) => (
          <div key={col.columnName} className="rounded border border-[#e8ede9] bg-[#f8faf8] px-3 py-2.5 dark:border-[#3b3b41] dark:bg-[#242428]">
            {renaming !== null && renaming.columnName === col.columnName ? (
              <div className="flex flex-col gap-2">
                <ClearTextInput
                  type="text" className={inputCls} value={renaming.label}
                  onChange={(e) => setRenaming({ ...renaming, label: e.target.value })}
                  maxLength={80} dir="auto" aria-label={t('tabFieldsManager.labelAr')}
                />
                <ClearTextInput
                  type="text" className={inputCls} lang="en" value={renaming.labelEn}
                  onChange={(e) => setRenaming({ ...renaming, labelEn: e.target.value })}
                  maxLength={80} dir="ltr" aria-label={t('tabFieldsManager.labelEn')}
                />
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" className="vault-primary vault-small" disabled={busy} onClick={submitRename}>
                    <Save size={15} /> {t('tabFieldsManager.saveBtn')}
                  </button>
                  <button type="button" className="vault-secondary vault-small" disabled={busy} onClick={() => setRenaming(null)}>
                    <X size={15} /> {t('tabFieldsManager.cancelBtn')}
                  </button>
                </div>
              </div>
            ) : (
              <div className={`flex items-center gap-2${displayMode === 'en' ? ' [direction:ltr]' : ''}`}>
                <span className="min-w-0 flex-1">
                  {(() => {
                    const label = names(col.label, col.labelEn)
                    return (
                      <>
                        <span className="block truncate text-[0.8125rem] font-semibold" dir="auto">{label.main}</span>
                        {[label.rest, displayMode === 'both' ? col.columnName : ''].some((s) => s !== '') && (
                          <span className="block truncate text-[0.6875rem] text-[#84908c]" dir="auto">
                            {[label.rest, displayMode === 'both' ? col.columnName : ''].filter((s) => s !== '').join(' · ')}
                          </span>
                        )}
                      </>
                    )
                  })()}
                </span>
                <div className="flex flex-none items-center gap-1.5">
                <Tooltip content={t('tabFieldsManager.renameBtn')}>
                <button
                  type="button" className="vault-secondary vault-small" disabled={busy}
                  onClick={() => setRenaming({ columnName: col.columnName, label: col.label, labelEn: col.labelEn })}
                >
                  <Pencil size={15} />
                </button>
                </Tooltip>
                <Tooltip content={t('tabFieldsManager.deleteBtn')} tone="danger">
                <button
                  type="button" className="vault-secondary vault-small" disabled={busy}
                  onClick={() => askDelete(col)}
                >
                  <Trash2 size={15} />
                </button>
                </Tooltip>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="h-5" aria-hidden="true" />
      {pendingDeleteCustom && (
        <ModalMessages
          isOpen
          variant="danger"
          title={t('modalMessages.deleteTitle')}
          message={t('tabFieldsManager.deleteConfirm', { label: pendingDeleteCustom.label })}
          buttons={[
            { id: 'cancel', label: t('modalMessages.cancelBtn'), variant: 'secondary' },
            { id: 'confirm', label: t('modalMessages.deleteBtn'), variant: 'danger' },
          ]}
          onButtonClicked={(info) => {
            if (info.id === 'confirm') {
              const col = pendingDeleteCustom
              setPendingDeleteCustom(null)
              void runOp(() => deleteCustomColumn(repo.meta.id, repoPassword, tab.id, col.columnName))
            }
          }}
          onClose={() => setPendingDeleteCustom(null)}
        />
      )}
      {pendingDeleteBase && (
        <ModalMessages
          isOpen
          variant="danger"
          title={t('modalMessages.deleteTitle')}
          message={t('tabFieldsManager.deleteBaseConfirm', { label: pendingDeleteBase.label })}
          buttons={[
            { id: 'cancel', label: t('modalMessages.cancelBtn'), variant: 'secondary' },
            { id: 'confirm', label: t('modalMessages.deleteBtn'), variant: 'danger' },
          ]}
          onButtonClicked={(info) => {
            if (info.id === 'confirm') {
              const target = pendingDeleteBase
              setPendingDeleteBase(null)
              void runOp(() => softDeleteBaseColumn(repo.meta.id, repoPassword, tab.id, target.key))
            }
          }}
          onClose={() => setPendingDeleteBase(null)}
        />
      )}
    </div>
  )
}
