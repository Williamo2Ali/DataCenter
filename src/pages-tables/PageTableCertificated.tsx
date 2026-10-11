// صفحة جدول الشهادات الدراسية — العرض الفيزيائي 1-1: قائمة الأفراد + هيدر الفرد + تحرير مدمج.
// مكوّن مستقل، والعارض يستدعيه عبر الراوتر فقط.
import { useEffect, useState } from 'react'
import { Check, Copy, Pencil, Plus, UserRound } from 'lucide-react'
import PhysicalForm from '../components/ValueEditorForm'
import RepoTabsHeaderControl from '../components/RepoTabsHeaderControl'
import TableViewerActions from '../components/TableViewerActions'
import { Tooltip } from '../components/Tooltip'
import { ReadonlyInput } from '../components/ReadonlyInput'
import { useLanguage } from '../language/LanguageContext'
import { tabTitle } from '../lib/tabTitle'
import { recordName, recordRelation } from '../lib/records'
import type { FieldLang } from '../lib/appSettings'
import {
  applyBaseLabels,
  customColumnToDef,
  getPhysicalRow,
  physicalDisplayValue,
  physicalLabel,
  PHYSICAL_TABLES,
  type PhysicalTableId,
} from '../lib/physicalTables'
import {
  updateCoreExtra,
  upsertStudy,
  type RepoData,
  type RepoPerson,
} from '../repos/repoService'

export type PageTableCertificatedProps = {
  repo: RepoData
  repoPassword: string | null
  members: RepoPerson[]
  activeMemberId: string
  currentMember: RepoPerson
  fieldLang: FieldLang
  mutBusy: boolean
  mutError: string
  setMutError: (msg: string) => void
  runMutation: (op: () => Promise<RepoData>, done?: () => void) => void
  onSelectMember: (id: string) => void
  onAddMember: () => void
  onRenameMember: () => void
  onDeleteMember: () => void
  onManageFields: (tabId: string) => void
  onFieldLangChange: (lang: FieldLang) => void
}

export default function PageTableCertificated({
  repo,
  repoPassword,
  members,
  activeMemberId,
  currentMember,
  fieldLang,
  mutBusy,
  mutError,
  setMutError,
  runMutation,
  onSelectMember,
  onAddMember,
  onRenameMember,
  onDeleteMember,
  onManageFields,
  onFieldLangChange,
}: PageTableCertificatedProps) {
  const tabId: PhysicalTableId = 'study'
  const { t, lang } = useLanguage()
  const activeTab = repo?.tabs.find((tab) => tab.id === tabId) ?? null
  /** الأعمدة المخفية والمحذوفة ناعماً مستثناة من كل العروض والعدادات والنماذج. */
  const hiddenKeys = new Set([
    ...(repo.customTables.find((ct) => ct.tabId === tabId)?.hidden ?? []),
    ...(repo.customTables.find((ct) => ct.tabId === tabId)?.deleted ?? []),
  ])
  const profileDefs = applyBaseLabels(
    PHYSICAL_TABLES[tabId],
    repo.customTables.find((ct) => ct.tabId === tabId)?.labels ?? [],
  ).filter((d) => !hiddenKeys.has(d.key))
  const profileRow = getPhysicalRow(repo, tabId, currentMember.id)
  /** تعريفات الأعمدة الإضافية (من مدير الأعمدة) — تُعرض وتُحرَّر مع الأساسية. */
  const extraDefs = (repo.customTables.find((ct) => ct.tabId === tabId)?.columns ?? []).map(customColumnToDef)
  const allDefs = [...profileDefs, ...extraDefs]
  /** الصف الكامل: الأساسية + قيم الإضافيات (مفتاحها اسم العمود الفيزيائي). */
  const fullRow: Record<string, unknown> = {
    ...(profileRow ?? {}),
    ...((profileRow as Record<string, unknown> | undefined)?.extra as Record<string, unknown> ?? {}),
  }
  const filledDefs = allDefs.filter((d) => physicalDisplayValue(fullRow, d, fieldLang).trim() !== '')
  /** صفوف العرض المنطقية: التسمية العربية/الإنكليزية المزدوجة في صف واحد
      يعرض لغة واحدة فقط (حسب زر العرض) لتقليل التزاحم. */
  const displayRows = (() => {
    const rows: { key: string; base: (typeof allDefs)[number]; en?: (typeof allDefs)[number] }[] = []
    const consumed = new Set<string>()
    for (const def of allDefs) {
      if (consumed.has(def.key)) continue
      const enDef = allDefs.find((d) => d.key === `${def.key}En`)
      if (enDef) consumed.add(enDef.key)
      consumed.add(def.key)
      rows.push({ key: def.key, base: def, en: enDef })
    }
    return rows
  })()
  /** قيمة صف العرض: لغة واحدة فقط مع رجوع تلقائي للأخرى عند الفراغ. */
  const displayRowValue = (row: { base: (typeof allDefs)[number]; en?: (typeof allDefs)[number] }): string => {
    if (!row.en) return physicalDisplayValue(fullRow, row.base, fieldLang).trim()
    const ar = physicalDisplayValue(fullRow, row.base, 'ar').trim()
    const en = physicalDisplayValue(fullRow, row.en, 'en').trim()
    return fieldLang === 'en' ? (en || ar) : (ar || en)
  }

  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [copyError, setCopyError] = useState(false)
  // تحرير الصف الفيزيائي 1-1 (نموذج PhysicalForm — الحفظ عبر أوامر upsert_*).
  const [editingProfile, setEditingProfile] = useState(false)
  // التحرير المفرد: مفتاح حقل منطقي واحد (يحرر لغتيه معاً كما كان الكارد سابقاً).
  const [editingSingle, setEditingSingle] = useState<string | null>(null)
  useEffect(() => {
    setEditingProfile(false)
    setEditingSingle(null)
    setCopiedField(null)
    setCopyError(false)
  }, [tabId, activeMemberId])

  const submitProfile = (values: Record<string, string | number | null>) => {
    // دمج مع القيم الحالية — أوامر upsert تتطلب كل البارامترات.
    // الإضافيات تُحفَظ بأمرها الخاص (تُفصَل عن الأساسية).
    const extraKeys = new Set(extraDefs.map((d) => d.key))
    const baseValues: Record<string, string | number | null> = {}
    const extraValues: Record<string, string | number | null> = {}
    for (const [k, v] of Object.entries(values)) {
      if (extraKeys.has(k)) extraValues[k] = v
      else baseValues[k] = v
    }
    const input = { ...(profileRow ?? {}), ...baseValues, recordId: currentMember.id }
    delete (input as Record<string, unknown>).createdAt
    delete (input as Record<string, unknown>).updatedAt
    delete (input as Record<string, unknown>).extra
    const op = async () => {
      let data: RepoData = await upsertStudy(repo.meta.id, repoPassword, input)
      if (Object.keys(extraValues).length > 0) {
        data = await updateCoreExtra(repo.meta.id, repoPassword, tabId, currentMember.id, extraValues as Record<string, unknown>)
      }
      return data
    }
    void runMutation(op, () => {
      setEditingProfile(false)
      setEditingSingle(null)
    })
  }

  const handleCopy = async (text: string, fieldKey: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(fieldKey)
      setCopyError(false)
      window.setTimeout(() => setCopiedField(null), 1800)
    } catch {
      setCopyError(true)
      setCopiedField(null)
    }
  }

  return (
    <section className="records-section" aria-label={t('pageRepoViewer.familyDataAria')}>
      <div className="member-tabs">
        <div className="member-tabs-head">
          <span>{t('pageRepoViewer.membersCount', { count: String(members.length).padStart(2, '0') })}</span>
          <Tooltip content={t('pageRepoViewer.addMemberTitle')}>
          <button
            type="button"
            className="member-add-btn"
            aria-label={t('pageRepoViewer.addMemberTitle')}
            disabled={mutBusy}
            onClick={onAddMember}
          >
            <Plus size={15} />
          </button>
          </Tooltip>
        </div>
        <div className="member-tablist" role="tablist" aria-label={t('pageRepoViewer.memberTablistAria')}>
        {members.map((member, index) => {
          const isActive = member.id === activeMemberId
          return (
            <button
              key={member.id}
              id={`tab-${member.id}`}
              className={`member-tab${isActive ? ' is-active' : ''}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls="member-panel"
              tabIndex={isActive ? 0 : -1}
              onClick={() => {
                onSelectMember(member.id)
                setCopiedField(null)
                setCopyError(false)
              }}
            >
              <span className="tab-index">0{index + 1}</span>
              <span className="tab-text">
                <span className="tab-name">{recordName(member, lang)}</span>
                <span className="tab-relation">{recordRelation(member, lang)}</span>
              </span>
              <UserRound className="tab-icon" size={17} strokeWidth={1.7} aria-hidden="true" />
            </button>
          )
        })}
        </div>
      </div>

      <div className="record-panel" id="member-panel" role="tabpanel" aria-labelledby={`tab-${currentMember.id}`}>
        <RepoTabsHeaderControl
          kicker={tabTitle(activeTab ?? { title: '', titleEn: '' }, lang) || t('pageMother.missingEnTitle')}
          title={recordName(currentMember, lang)}
          subtitle={recordRelation(currentMember, lang) || '—'}
          fieldCountText={t('pageRepoViewer.fieldCount', { count: String(filledDefs.length).padStart(2, '0') })}
          editTitle={t('pageRepoViewer.editMemberTitle')}
          editAria={t('pageRepoViewer.editMemberAria', { name: recordName(currentMember, lang) })}
          deleteTitle={t('pageRepoViewer.deleteMemberTitle')}
          deleteAria={t('pageRepoViewer.deleteMemberAria', { name: recordName(currentMember, lang) })}
          editDisabled={mutBusy}
          deleteDisabled={mutBusy}
          onEdit={onRenameMember}
          onDelete={onDeleteMember}
        />

        {mutError && <p className="vault-error" role="alert">{mutError}</p>}

        <TableViewerActions
          mutBusy={mutBusy}
          fieldLang={fieldLang}
          editingProfile={editingProfile}
          onManageFields={() => onManageFields(tabId)}
          onFieldLangChange={onFieldLangChange}
          onEditValues={() => {
            setMutError('')
            setEditingProfile(true)
          }}
        />

        {editingProfile ? (
          <PhysicalForm
            defs={allDefs}
            initial={fullRow}
            busy={mutBusy}
            onSubmit={submitProfile}
            onCancel={() => setEditingProfile(false)}
          />
        ) : (
          <>
          <div className="fields-grid">
            {displayRows.map((row) => {
              const text = displayRowValue(row) || '—'
              const fieldKey = `${currentMember.id}-${tabId}-${row.key}`
              const isCopied = copiedField === fieldKey
              const label = physicalLabel(row.base, fieldLang)
              if (editingSingle === row.key) {
                const singleDefs = row.en ? [row.base, row.en] : [row.base]
                return (
                  <div className="field-row" id="cardeditparent" key={fieldKey}>
                    <PhysicalForm
                      defs={singleDefs}
                      initial={fullRow}
                      busy={mutBusy}
                      onSubmit={submitProfile}
                      onCancel={() => setEditingSingle(null)}
                    />
                  </div>
                )
              }
              return (
                <div className="field-row" key={fieldKey}>
                  <label className="field-label" htmlFor={`field-${fieldKey}`}>{label}</label>
                  <div className="field-control">
                    <ReadonlyInput
                      id={`field-${fieldKey}`}
                      className="field-value has-actions"
                      type="text"
                      value={text}
                      dir="auto"
                      actions={[
                        <Tooltip content={isCopied ? t('pageRepoViewer.copyTitle') : t('pageRepoViewer.copyFieldTitle')}>
                        <button
                          className={`copy-button${isCopied ? ' is-copied' : ''}`}
                          type="button"
                          aria-label={isCopied ? t('accountsPanel.copiedLabel', { label }) : t('accountsPanel.copyLabel', { label })}
                          onClick={() => void handleCopy(text, fieldKey)}
                        >
                          {isCopied ? <Check size={16} strokeWidth={2.2} /> : <Copy size={15} strokeWidth={1.8} />}
                        </button>
                        </Tooltip>,
                        <Tooltip content={t('pageRepoViewer.editFieldTitle')}>
                        <button
                          className="edit-button"
                          type="button"
                          aria-label={t('pageRepoViewer.editFieldAria', { label })}
                          disabled={mutBusy}
                          onClick={() => {
                            setMutError('')
                            setEditingSingle(row.key)
                          }}
                        >
                          <Pencil size={14} />
                        </button>
                        </Tooltip>,
                      ]}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          </>
        )}

        <div className="record-footer" aria-live="polite">
          <span className={`footer-mark${copyError ? ' has-error' : ''}`} />
          {copyError ? t('pageRepoViewer.clipboardError') : copiedField ? t('pageRepoViewer.fieldCopied') : t('pageRepoViewer.footerHint')}
        </div>
      </div>
    </section>
  )
}
