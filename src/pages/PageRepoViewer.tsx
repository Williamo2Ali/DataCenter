import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Download, Pencil, Plus, Save, Share2, Tag, Trash2, UserRound, Users, X } from 'lucide-react'
import type { FileManagerApi } from '../pages-tables/PageTableFiles'
import type { ContactsApi } from '../pages-tables/PageTableContacts'
import type { DocCategoryCustom } from '../lib/appSettings'
import TablesRouter, { TABLE_SECTION_IDS } from '../pages-tables/TablesRouter'
import type { AccountsApi } from '../pages-tables/PageTableAccounts'
import PanelWelcomeRepo from '../Interfaces/PanelWelcomeRepo'
import ModalMessages from '../modals/ModalMessages'
import ModalOwnerSelection, { type OwnerMultiState } from '../modals/ModalOwnerSelection'
import { open, save } from '@tauri-apps/plugin-dialog'
import { downloadDir, join } from '@tauri-apps/api/path'
import { readFile, writeFile } from '@tauri-apps/plugin-fs'
import PhysicalForm from '../components/ValueEditorForm'
import RepoTabsHeaderControl from '../components/RepoTabsHeaderControl'
import { MOBILE_BTN } from '../components/AppHeaderMobile'
import { Tooltip } from "../components/Tooltip"
import { ClearTextInput } from '../components/ClearTextInput'
import { ReadonlyInput } from '../components/ReadonlyInput'
import VaultPanel from '../vault/VaultPanel'
import { useLanguage } from '../language/LanguageContext'
import { useToast } from 'react-theme-toast'
import { tabTitle } from '../lib/tabTitle'
import { recordName, recordRelation } from '../lib/records'
import type { FieldLang } from '../lib/appSettings'
import {
  customColumnToDef, physicalDisplayValue, physicalLabel,
} from '../lib/physicalTables'
import {
  addPeople,
  deleteCustomRow,
  deletePeople,
  exportRepoDb,
  exportRepoBytes,
  importRepoBytes,
  importRepoDb,
  restoreCoreTab,
  updatePeople,
  upsertCustomRow,
  type RepoCustomTable,
  type RepoData,
} from '../repos/repoService'

type PageRepoViewerProps = {
  repo: RepoData
  activeSection: string
  setActiveSection: (section: string) => void
  activeMemberId: string
  setActiveMemberId: (id: string) => void
  closedTabIds: string[]
  repoPassword: string | null
  onRepoUpdated: (data: RepoData) => void
  /** فتح قائمة التبويبات من صفحة الاستقبال (درج الهواتف أو توسيع اللوحة). */
  onOpenTabsPanel: () => void
  /** إغلاق المستودع من صفحة الاستقبال والعودة للقائمة. */
  onCloseRepo: () => void
  /** منطقة هيدر الموبايل المخصصة: تبويبات السجلات تعرض زر إضافة فرد هنا. */
  onHeaderActionChange: (node: ReactNode) => void
  /** لغة عرض القيم (مستقلة عن لغة التطبيق). */
  fieldLang: FieldLang
  /** تصنيفات الملفات المخصصة من الإعدادات. */
  docCategories: DocCategoryCustom[]
  /** تبديل لغة العرض من زر العارض — تُحفَظ في الإعدادات. */
  onFieldLangChange: (lang: FieldLang) => void
  /** زر «إدارة الحقول» المختصر: يقفز لإدارة هذا الجدول. */
  onManageFields: (tabId: string) => void
  /** معاينة ملف مفتوحة؟ (تملكها App — تُخفي زر لوحة الموبايل). */
  filesPreviewOpen: boolean
  onFilesPreviewChange: (open: boolean, isMedia: boolean) => void
}

/** التبويبات الفيزيائية 1-1 (صف واحد لكل فرد). */
const PROFILE_TABS: readonly string[] = ['passports', 'civil', 'national_ids', 'study']

type CustomTabSectionProps = {
  repo: RepoData
  table: RepoCustomTable
  memberId: string
  repoPassword: string | null
  fieldLang: FieldLang
  mutBusy: boolean
  runMutation: (op: () => Promise<RepoData>, done?: () => void) => void
}

/** قسم تبويب مخصص: صفوف الفرد + المشتركة (عرض/إضافة/تعديل/حذف). */
function CustomTabSection({ repo, table, memberId, repoPassword, fieldLang, mutBusy, runMutation }: CustomTabSectionProps) {
  const { t } = useLanguage()
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const defs = table.columns.map(customColumnToDef)
  const rows = table.rows.filter((r) => {
    const pid = (r as Record<string, unknown>).people_id
    return pid === memberId || pid == null
  })

  const submitRow = (rowId: string | null, values: Record<string, string | number | null>) => {
    void runMutation(
      () => upsertCustomRow(repo.meta.id, repoPassword, table.tabId, rowId, memberId, values),
      () => setEditingId(null),
    )
  }

  const [pendingDeleteRow, setPendingDeleteRow] = useState<string | null>(null)

  const askDeleteRow = (id: string) => {
    setPendingDeleteRow(id)
  }

  return (
    <div>
      <div className="viewer-actions-col">
        <button
          type="button"
          className="add-field-btn"
          disabled={mutBusy}
          onClick={() => setEditingId('new')}
        >
          <Plus size={15} /> {t('customTabs.addRowBtn')}
        </button>
      </div>
      {editingId === 'new' && (
        <PhysicalForm
          defs={defs}
          initial={{}}
          busy={mutBusy}
          onSubmit={(values) => submitRow(null, values)}
          onCancel={() => setEditingId(null)}
        />
      )}
      {rows.length === 0 && editingId !== 'new' && (
        <p className="vault-empty">{t('customTabs.noRows')}</p>
      )}
      <div className="fields-grid">
        {rows.map((raw) => {
          const r = raw as Record<string, unknown>
          const id = typeof r.id === 'string' ? r.id : ''
          if (editingId === id) {
            return (
              <div className="field-row" key={id}>
                <PhysicalForm
                  defs={defs}
                  initial={r}
                  busy={mutBusy}
                  onSubmit={(values) => submitRow(id, values)}
                  onCancel={() => setEditingId(null)}
                />
              </div>
            )
          }
          return (
            <div className="field-row" key={id}>
              {defs.map((def) => {
                const text = physicalDisplayValue(r, def, fieldLang) || '—'
                return (
                  <div key={def.key}>
                    <label className="field-label">{physicalLabel(def, fieldLang)}</label>
                    <div className="field-control">
                      <ReadonlyInput className="field-value" type="text" value={text} dir="auto" actions={[]} />
                    </div>
                  </div>
                )
              })}
              <div className="field-edit-actions">
                <button
                  type="button" className="vault-secondary vault-small" disabled={mutBusy}
                  onClick={() => setEditingId(id)}
                >
                  <Pencil size={15} /> {t('customTabs.editRowBtn')}
                </button>
                <button
                  type="button" className="vault-secondary vault-small" disabled={mutBusy}
                  onClick={() => askDeleteRow(id)}
                >
                  <Trash2 size={14} /> {t('customTabs.deleteRowBtn')}
                </button>
              </div>
            </div>
          )
        })}
      </div>
      {pendingDeleteRow && (
        <ModalMessages
          isOpen
          variant="danger"
          title={t('modalMessages.deleteTitle')}
          message={t('customTabs.deleteRowConfirm')}
          buttons={[
            { id: 'cancel', label: t('modalMessages.cancelBtn'), variant: 'secondary' },
            { id: 'confirm', label: t('modalMessages.deleteBtn'), variant: 'danger' },
          ]}
          onButtonClicked={(info) => {
            if (info.id === 'confirm') void runMutation(() => deleteCustomRow(repo.meta.id, repoPassword, table.tabId, pendingDeleteRow))
          }}
          onClose={() => setPendingDeleteRow(null)}
        />
      )}
    </div>
  )
}

export default function PageRepoViewer({
  repo,
  activeSection,
  setActiveSection,
  activeMemberId,
  setActiveMemberId,
  closedTabIds,
  repoPassword,
  onRepoUpdated,
  onOpenTabsPanel,
  onCloseRepo,
  onHeaderActionChange,
  fieldLang,
  docCategories,
  onFieldLangChange,
  onManageFields,
  filesPreviewOpen,
  onFilesPreviewChange,
}: PageRepoViewerProps) {
  const { t, lang } = useLanguage()
  const toast = useToast()
  const closedTabsKey = (repoId: string) => `repo-closed-tabs:${repoId}`

  // تصدير/استيراد قاعدة بيانات المستودع النشط — يستدعيهما PanelWelcomeRepo
  // (مربعات الحوار والتأكيد والإشعارات تبقى هنا كما في تدفق الكارد بالرئيسية).
  // وجهات content:// (منتقي أندرويد): البايتات تُنقَل في الواجهة لأن Rust
  // لا يكتب المسارات الخام في التخزين المشترك (scoped storage).
  const handleExportDb = async (repoId: string, password: string | null) => {
    try {
      const base = repo.meta.name.trim() || 'repo'
      const dest = await save({
        defaultPath: await join(await downloadDir(), `${base}.db`),
        filters: [{ name: t('pageHome.exportDbFilter'), extensions: ['db', 'sqlite'] }],
      })
      if (!dest) return
      if (dest.startsWith('content://')) {
        const bytes = await exportRepoBytes(repoId, password)
        await writeFile(dest, bytes)
      } else {
        await exportRepoDb(repoId, password, dest)
      }
      toast.success(t('pageHome.exportedNotice', { name: repo.meta.name }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('pageHome.exportDbError'))
    }
  }

  const handleImportDb = async (repoId: string, password: string | null) => {
    try {
      const picked = await open({
        multiple: false,
        directory: false,
        filters: [{ name: t('pageHome.importDbFilter'), extensions: ['db', 'sqlite'] }],
      })
      const src = Array.isArray(picked) ? picked[0] : picked
      if (!src) return
      if (!window.confirm(t('pageHome.importDbConfirm', { name: repo.meta.name }))) return
      if (src.startsWith('content://')) {
        const bytes = await readFile(src)
        const data = await importRepoBytes(repoId, password, bytes)
        onRepoUpdated(data)
      } else {
        const data = await importRepoDb(repoId, password, src)
        onRepoUpdated(data)
      }
      toast.success(t('pageHome.importedNotice', { name: repo.meta.name }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('pageHome.importDbError'))
    }
  }

  // حفظ التبويبات المغلقة لكل مستودع + تصحيح القسم النشط إن أُغلق/أُخفي/حُذف ناعماً
  useEffect(() => {
    if (!repo) return
    try {
      localStorage.setItem(closedTabsKey(repo.meta.id), JSON.stringify(closedTabIds))
    } catch {
      return
    }
    const activeGone = repo.tabs.some((tab) => tab.id === activeSection && (tab.isHidden || tab.isDeleted))
    if ((!['vault', 'settings'].includes(activeSection) && closedTabIds.includes(activeSection)) || activeGone) {
      const first = repo.tabs.find((tab) => !tab.isHidden && !tab.isDeleted && !closedTabIds.includes(tab.id))
      setActiveSection(first ? first.id : '__empty__')
    }
  }, [closedTabIds, repo, activeSection])

  // الزر السياقي لهيدر الموبايل — يُركَّب بعد تعريف الحالات أدناه (بحاجة currentMember/mutBusy).
  const filesApi = useRef<FileManagerApi>(null)
  const accountsApi = useRef<AccountsApi>(null)
  const contactsApi = useRef<ContactsApi>(null)
  const [, setStagedCount] = useState(0)

  const records = repo?.peoples ?? []
  const currentMember = records.find((member) => member.id === activeMemberId) ?? records[0] ?? null
  const activeTab = repo?.tabs.find((tab) => tab.id === activeSection) ?? null
  const isProfileTab = PROFILE_TABS.includes(activeSection)
  const customTable = !isProfileTab ? repo.customTables.find((ct) => ct.tabId === activeSection) ?? null : null

  // ——— التحرير الكامل: أفراد (القيم الفيزيائية تُحرَّر من نماذج المرحلة 5) ———
  const [mutError, setMutError] = useState('')
  const [mutBusy, setMutBusy] = useState(false)
  const [memberDialog, setMemberDialog] = useState<{ mode: 'add' | 'rename'; name: string; nameEn: string; relation: string; relationEn: string } | null>(null)
  // مودال قائمة الأفراد (بطاقة لكل فرد: الاسم + الصفة) — بديل صف الأزرار على الهواتف.
  const [membersOpen, setMembersOpen] = useState(false)
  /** التحديد المتعدد للملاك — للملفات: يزامن تبويبات الأفراد المضمنة في الصفحة. */
  const [fileSelMembers, setFileSelMembers] = useState<Set<string>>(
    () => new Set(activeMemberId ? [activeMemberId] : []),
  )
  const [fileShowAll, setFileShowAll] = useState(false)
  /** التحديد المتعدد للملاك — لجهات الاتصال: الكل/متعدد/مفرد (بلا مشتركة). */
  const [contactSelMembers, setContactSelMembers] = useState<Set<string>>(
    () => new Set(activeMemberId ? [activeMemberId] : []),
  )
  const [contactShowAll, setContactShowAll] = useState(false)
  /** مزامنة التحديدين مع اختيار الفرد العام — تُتجاهَل القيمة الابتدائية. */
  const syncedOwner = useRef<string | null>(null)
  useEffect(() => {
    if (syncedOwner.current === null) {
      syncedOwner.current = activeMemberId
      return
    }
    if (activeMemberId && activeMemberId !== syncedOwner.current) {
      syncedOwner.current = activeMemberId
      setFileSelMembers(new Set([activeMemberId]))
      setFileShowAll(false)
      setContactSelMembers(new Set([activeMemberId]))
      setContactShowAll(false)
    }
  }, [activeMemberId])
  const toggleFileMember = (id: string) => {
    if (fileShowAll) {
      setFileShowAll(false)
      setFileSelMembers(new Set([id]))
      return
    }
    setFileSelMembers((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const fileOwners: OwnerMultiState = {
    selectedIds: fileSelMembers,
    showAll: fileShowAll,
    onToggleMember: toggleFileMember,
    onToggleAll: () => setFileShowAll((v) => !v),
  }
  const toggleContactMember = (id: string) => {
    if (contactShowAll) {
      setContactShowAll(false)
      setContactSelMembers(new Set([id]))
      return
    }
    setContactSelMembers((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const contactOwners: OwnerMultiState = {
    selectedIds: contactSelMembers,
    showAll: contactShowAll,
    onToggleMember: toggleContactMember,
    onToggleAll: () => setContactShowAll((v) => !v),
  }
  /** حذف فرد مؤكد عبر مودال الرسائل (بدل window.confirm). */
  const [pendingDeleteMember, setPendingDeleteMember] = useState<{ id: string; name: string } | null>(null)
  // الزر السياقي لهيدر الموبايل: تبويبات السجلات زرّا الأفراد والإضافة،
  // الملفات زرّا الأفراد والفلتر (مودال التصنيفات — التجهيز والحفظ في الصفحة نفسها)،
  // والحسابات زر الأفراد،
  // وجهات الاتصال زرّا الأفراد وحذف الكل (مالك المنطقة بدل الترس).
  // باقي الأقسام: بلا أزرار.
  useEffect(() => {
    if (activeSection === 'files') {
      // أثناء المعاينة: إغلاق/حفظ/مشاركة بدل الأفراد والفلتر.
      if (filesPreviewOpen) {
        onHeaderActionChange(
          <>
            <Tooltip content={t('pageRepoViewer.closeAria')} position="bottom">
            <button
              type="button"
              className={MOBILE_BTN}
              aria-label={t('pageRepoViewer.closeAria')}
              onClick={() => filesApi.current?.closePreview()}
            >
              <X size={19} strokeWidth={1.7} />
            </button>
            </Tooltip>
            <Tooltip content={t('documentLibrary.saveFileTitle')} position="bottom">
            <button
              type="button"
              className={MOBILE_BTN}
              aria-label={t('documentLibrary.saveFileTitle')}
              onClick={() => filesApi.current?.savePreview()}
            >
              <Download size={19} strokeWidth={1.7} />
            </button>
            </Tooltip>
            <Tooltip content={t('documentManager.shareBtn')} position="bottom">
            <button
              type="button"
              className={MOBILE_BTN}
              aria-label={t('documentManager.shareBtn')}
              onClick={() => filesApi.current?.sharePreview()}
            >
              <Share2 size={19} strokeWidth={1.7} />
            </button>
            </Tooltip>
          </>,
        )
        return () => onHeaderActionChange(null)
      }
      onHeaderActionChange(
        <>
          <Tooltip content={t('pageRepoViewer.membersListBtn')} position="bottom">
          <button
            type="button"
            className={MOBILE_BTN}
            aria-label={t('pageRepoViewer.membersListBtn')}
            onClick={() => setMembersOpen(true)}
          >
            <Users size={19} strokeWidth={1.7} />
          </button>
          </Tooltip>
          <Tooltip content={t('documentManager.categoryFilter')} position="bottom">
          <button
            type="button"
            className={MOBILE_BTN}
            aria-label={t('documentManager.categoryFilter')}
            onClick={() => filesApi.current?.openCategoryFilter()}
          >
            <Tag size={19} strokeWidth={1.7} />
          </button>
          </Tooltip>
        </>,
      )
      return () => onHeaderActionChange(null)
    }
    // تبويب الحسابات مالك المنطقة المشتركة: زر اختيار الفرد فقط —
    // زرّا الإضافة (فرد/ايميل) موجودان في الصفحة نفسها فلا يُكرَّران هنا.
    if (activeSection === 'accounts') {
      onHeaderActionChange(
        <Tooltip content={t('pageRepoViewer.membersListBtn')} position="bottom">
        <button
          type="button"
          className={MOBILE_BTN}
          aria-label={t('pageRepoViewer.membersListBtn')}
          onClick={() => setMembersOpen(true)}
        >
          <Users size={19} strokeWidth={1.7} />
        </button>
        </Tooltip>,
      )
      return () => onHeaderActionChange(null)
    }
    // تبويب جهات الاتصال مالك المنطقة المشتركة: زرّا اختيار المالك وحذف الكل —
    // الحذف بتأكيد مودال الرسائل وعلى مستوى التحديد الحالي.
    if (activeSection === 'contacts') {
      onHeaderActionChange(
        <>
          <Tooltip content={t('pageRepoViewer.membersListBtn')} position="bottom">
          <button
            type="button"
            className={MOBILE_BTN}
            aria-label={t('pageRepoViewer.membersListBtn')}
            onClick={() => setMembersOpen(true)}
          >
            <Users size={19} strokeWidth={1.7} />
          </button>
          </Tooltip>
          <Tooltip content={t('modalContact.deleteAllBtn')} position="bottom">
          <button
            type="button"
            className={MOBILE_BTN}
            aria-label={t('modalContact.deleteAllBtn')}
            onClick={() => contactsApi.current?.requestDeleteAll()}
          >
            <Trash2 size={19} strokeWidth={1.7} />
          </button>
          </Tooltip>
        </>,
      )
      return () => onHeaderActionChange(null)
    }
    if (['vault', 'files', '__empty__'].includes(activeSection)) {
      onHeaderActionChange(null)
      return
    }
    onHeaderActionChange(
      <>
        <Tooltip content={t('pageRepoViewer.membersListBtn')}>
        <button
          type="button"
          className={MOBILE_BTN}
          aria-label={t('pageRepoViewer.membersListBtn')}
          onClick={() => setMembersOpen(true)}
        >
          <Users size={19} strokeWidth={1.7} />
        </button>
        </Tooltip>
        <Tooltip content={t('pageRepoViewer.addMemberTitle')}>
        <button
          type="button"
          className={MOBILE_BTN}
          aria-label={t('pageRepoViewer.addMemberTitle')}
          onClick={() => setMemberDialog({ mode: 'add', name: '', nameEn: '', relation: '', relationEn: '' })}
        >
          <Plus size={19} strokeWidth={1.7} />
        </button>
        </Tooltip>
      </>,
    )
    return () => onHeaderActionChange(null)
  }, [activeSection, filesPreviewOpen, t, onHeaderActionChange, mutBusy, currentMember])

  const runMutation = async (op: () => Promise<RepoData>, done?: () => void) => {
    if (mutBusy) return
    setMutError('')
    setMutBusy(true)
    try {
      const data = await op()
      onRepoUpdated(data)
      done?.()
    } catch (e) {
      setMutError(e instanceof Error ? e.message : t('pageRepoViewer.saveChangeError'))
    } finally {
      setMutBusy(false)
    }
  }

  const submitMemberDialog = () => {
    if (!memberDialog || !memberDialog.name.trim() || !memberDialog.nameEn.trim()) return
    const { mode, name, nameEn, relation, relationEn } = memberDialog
    if (mode === 'add') {
      void runMutation(
        () => addPeople(repo.meta.id, repoPassword, name.trim(), nameEn.trim(), relation.trim(), relationEn.trim()),
        () => setMemberDialog(null),
      )
    } else if (currentMember) {
      void runMutation(
        () => updatePeople(repo.meta.id, repoPassword, currentMember.id, name.trim(), nameEn.trim(), relation.trim(), relationEn.trim()),
        () => setMemberDialog(null),
      )
    }
  }

  const askDeleteMember = () => {
    if (!currentMember) return
    setPendingDeleteMember({ id: currentMember.id, name: recordName(currentMember, lang) })
  }

  // سياق الراوتر: كل ما تحتاجه صفحات الجداول (تشتق الفرد من repo+activeMemberId داخلياً).
  const tableCtx = {
    repo,
    repoPassword,
    activeMemberId,
    fieldLang,
    mutBusy,
    mutError,
    setMutError,
    runMutation,
    onSelectMember: setActiveMemberId,
    onAddMember: () => setMemberDialog({ mode: 'add', name: '', nameEn: '', relation: '', relationEn: '' }),
    onRenameMember: () => {
      if (currentMember) setMemberDialog({ mode: 'rename', name: currentMember.name, nameEn: currentMember.nameEn, relation: currentMember.relation, relationEn: currentMember.relationEn })
    },
    onDeleteMember: askDeleteMember,
    onManageFields,
    onFieldLangChange,
    onRepoUpdated,
    filesApiRef: filesApi,
    accountsApiRef: accountsApi,
    contactsApiRef: contactsApi,
    fileCategories: docCategories,
    onStagingChange: setStagedCount,
    onPreviewChange: onFilesPreviewChange,
    fileOwners,
    contactOwners,
  }

  return (
    <>
        {activeTab?.isDeleted ? (
          <section className="records-section" aria-label={t('pageRepoViewer.deletedTabAria')}>
            <div className="tabs-empty-state" role="status">
              <p>{t('pageRepoViewer.deletedTabMsg', { title: tabTitle(activeTab, lang) })}</p>
              <div className="viewer-actions-col">
                <button
                  type="button"
                  className="add-field-btn"
                  disabled={mutBusy}
                  onClick={() => {
                    if (!window.confirm(t('pageRepoViewer.restoreTabConfirm', { title: tabTitle(activeTab, lang) }))) return
                    void runMutation(() => restoreCoreTab(repo.meta.id, repoPassword, activeTab.id))
                  }}
                >
                  <Plus size={15} /> {t('pageRepoViewer.restoreTabBtn')}
                </button>
              </div>
            </div>
            {mutError && <p className="vault-error" role="alert">{mutError}</p>}
          </section>
        ) : activeSection === 'vault' ? (
          <VaultPanel />
        ) : TABLE_SECTION_IDS.includes(activeSection) ? (
          <TablesRouter section={activeSection} {...tableCtx} />
        ) : activeSection === '__empty__' ? <PanelWelcomeRepo repo={repo} onOpenTabsPanel={onOpenTabsPanel} onCloseRepo={onCloseRepo} repoPassword={repoPassword} onExportDb={handleExportDb} onImportDb={handleImportDb} /> : currentMember === null ? (
          <p className="vault-empty">{t('pageRepoViewer.noRecords')}</p>
        ) : (
          <section className="records-section" aria-label={t('pageRepoViewer.familyDataAria')}>
            <div className="member-tabs">
              <div className="member-tabs-head">
                <span>{t('pageRepoViewer.membersCount', { count: String(records.length).padStart(2, '0') })}</span>
                <Tooltip content={t('pageRepoViewer.addMemberTitle')}>
                <button
                  type="button"
                  className="member-add-btn"
                  aria-label={t('pageRepoViewer.addMemberTitle')}
                  disabled={mutBusy}
                  onClick={() => setMemberDialog({ mode: 'add', name: '', nameEn: '', relation: '', relationEn: '' })}
                >
                  <Plus size={15} />
                </button>
                </Tooltip>
              </div>
              <div className="member-tablist" role="tablist" aria-label={t('pageRepoViewer.memberTablistAria')}>
              {records.map((member, index) => {
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
                      setActiveMemberId(member.id)
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
                fieldCountText={t('pageRepoViewer.fieldCount', { count: '00' })}
                editTitle={t('pageRepoViewer.editMemberTitle')}
                editAria={t('pageRepoViewer.editMemberAria', { name: recordName(currentMember, lang) })}
                deleteTitle={t('pageRepoViewer.deleteMemberTitle')}
                deleteAria={t('pageRepoViewer.deleteMemberAria', { name: recordName(currentMember, lang) })}
                editDisabled={mutBusy}
                deleteDisabled={mutBusy}
                onEdit={() => setMemberDialog({ mode: 'rename', name: currentMember.name, nameEn: currentMember.nameEn, relation: currentMember.relation, relationEn: currentMember.relationEn })}
                onDelete={askDeleteMember}
              />

              {mutError && <p className="vault-error" role="alert">{mutError}</p>}

              <div className="viewer-actions-col">
                <div className="viewer-actions-row">
                  <Tooltip content={t('pageRepoViewer.manageFieldsBtn')}>
                  <button
                    type="button"
                    className="add-field-btn"
                    disabled={mutBusy}
                    onClick={() => onManageFields(activeSection)}
                  >
                    {t('pageRepoViewer.manageFieldsBtn')}
                  </button>
                  </Tooltip>
                  <Tooltip content={fieldLang === 'ar' ? t('pageRepoViewer.showEnglishBtn') : t('pageRepoViewer.showArabicBtn')}>
                  <button
                    type="button"
                    className="add-field-btn"
                    disabled={mutBusy}
                    onClick={() => onFieldLangChange(fieldLang === 'ar' ? 'en' : 'ar')}
                  >
                    {fieldLang === 'ar' ? t('pageRepoViewer.showEnglishBtn') : t('pageRepoViewer.showArabicBtn')}
                  </button>
                  </Tooltip>
                </div>
              </div>

              {customTable ? (
                <CustomTabSection
                  repo={repo}
                  table={customTable}
                  memberId={currentMember.id}
                  repoPassword={repoPassword}
                  fieldLang={fieldLang}
                  mutBusy={mutBusy}
                  runMutation={runMutation}
                />
              ) : (
                <p className="vault-empty">{t('pageRepoViewer.customTabSoon')}</p>
              )}

              <div className="record-footer" aria-live="polite">
                <span className="footer-mark" />
                {t('pageRepoViewer.footerHint')}
              </div>
            </div>
          </section>
        )}

        {pendingDeleteMember && (
          <ModalMessages
            isOpen
            variant="danger"
            title={t('modalMessages.deleteTitle')}
            message={t('pageRepoViewer.deleteMemberConfirm', { name: pendingDeleteMember.name })}
            buttons={[
              { id: 'cancel', label: t('modalMessages.cancelBtn'), variant: 'secondary' },
              { id: 'confirm', label: t('modalMessages.deleteBtn'), variant: 'danger' },
            ]}
            onButtonClicked={(info) => {
              if (info.id === 'confirm') void runMutation(() => deletePeople(repo.meta.id, repoPassword, pendingDeleteMember.id))
            }}
            onClose={() => setPendingDeleteMember(null)}
          />
        )}

        {memberDialog && (
          <div className="modal-overlay" onClick={() => setMemberDialog(null)} role="dialog" aria-modal="true" aria-labelledby="member-dialog-title">
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <header className="modal-header">
                <h2 id="member-dialog-title">{memberDialog.mode === 'add' ? t('pageRepoViewer.addModalTitle') : t('pageRepoViewer.editModalTitle')}</h2>
                <Tooltip content={t('pageRepoViewer.closeAria')}>
                <button type="button" className="modal-close" onClick={() => setMemberDialog(null)} disabled={mutBusy} aria-label={t('pageRepoViewer.closeAria')}>
                  <X size={18} />
                </button>
                </Tooltip>
              </header>
              <div className="modal-body">
                {mutError && <p className="modal-error" role="alert">{mutError}</p>}
                <div className="modal-field">
                  <label htmlFor="member-name" className="modal-label">{t('pageRepoViewer.memberNameLabel')}</label>
                  <ClearTextInput
                    id="member-name"
                    type="text"
                    className="modal-input"
                    value={memberDialog.name}
                    onChange={(e) => setMemberDialog({ ...memberDialog, name: e.target.value })}
                    placeholder={t('pageRepoViewer.memberNamePlaceholder')}
                    autoComplete="off"
                    maxLength={80}
                    dir="auto"
                    autoFocus
                  />
                </div>
                <div className="modal-field">
                  <label htmlFor="member-name-en" className="modal-label">{t('pageRepoViewer.memberNameEnLabel')}</label>
                  <ClearTextInput
                    id="member-name-en"
                    type="text"
                    className="modal-input"
                    lang="en"
                    value={memberDialog.nameEn}
                    onChange={(e) => setMemberDialog({ ...memberDialog, nameEn: e.target.value })}
                    placeholder={t('pageRepoViewer.memberNameEnPlaceholder')}
                    autoComplete="off"
                    maxLength={80}
                    dir="ltr"
                  />
                </div>
                <div className="modal-field">
                  <label htmlFor="member-relation" className="modal-label">{t('pageRepoViewer.memberRelationLabel')}</label>
                  <ClearTextInput
                    id="member-relation"
                    type="text"
                    className="modal-input"
                    value={memberDialog.relation}
                    onChange={(e) => setMemberDialog({ ...memberDialog, relation: e.target.value })}
                    placeholder={t('pageRepoViewer.memberRelationPlaceholder')}
                    autoComplete="off"
                    maxLength={80}
                    dir="auto"
                  />
                </div>
                <div className="modal-field">
                  <label htmlFor="member-relation-en" className="modal-label">{t('pageRepoViewer.memberRelationEnLabel')}</label>
                  <ClearTextInput
                    id="member-relation-en"
                    type="text"
                    className="modal-input"
                    lang="en"
                    value={memberDialog.relationEn}
                    onChange={(e) => setMemberDialog({ ...memberDialog, relationEn: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') submitMemberDialog() }}
                    placeholder={t('pageRepoViewer.memberRelationEnPlaceholder')}
                    autoComplete="off"
                    maxLength={80}
                    dir="ltr"
                  />
                </div>
              </div>
              <footer className="modal-footer equal-btns">
                <button type="button" className="modal-btn modal-btn-secondary" onClick={() => setMemberDialog(null)} disabled={mutBusy}>
                  <X size={16} /> {t('pageRepoViewer.cancel')}
                </button>
                <button type="button" className="modal-btn modal-btn-primary" onClick={submitMemberDialog} disabled={mutBusy || !memberDialog.name.trim() || !memberDialog.nameEn.trim()}>
                  <Save size={16} /> {memberDialog.mode === 'add' ? t('pageRepoViewer.addMemberBtn') : t('pageRepoViewer.saveEditBtn')}
                </button>
              </footer>
            </div>
          </div>
        )}

        {membersOpen && (
          <ModalOwnerSelection
            isOpen
            onClose={() => setMembersOpen(false)}
            members={records}
            mode={activeSection === 'files' || activeSection === 'contacts' ? 'multi' : 'single'}
            selectedId={activeMemberId}
            onSelect={(id) => {
              setActiveMemberId(id)
              setMembersOpen(false)
            }}
            multi={activeSection === 'contacts' ? contactOwners : fileOwners}
          />
        )}

    </>
  )
}
