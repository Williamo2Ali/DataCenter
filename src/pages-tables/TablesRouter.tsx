// راوتر صفحات الجداول — يحوّل معرّف القسم النشط إلى صفحة الجدول المستقلة.
// يستدعيه PageRepoViewer بدل الفروع المضمنة (المخصص بلا ملف — يبقى في العارض).
import type { Ref } from 'react'
import PageTableAccounts, { type AccountsApi } from './PageTableAccounts'
import PageTableCertificated from './PageTableCertificated'
import PageTableCilvilRegistry from './PageTableCilvilRegistry'
import PageTableContacts from './PageTableContacts'
import PageTableFiles from './PageTableFiles'
import PageTableIDs from './PageTableIDs'
import PageTablePassport from './PageTablePassport'
import type { FileManagerApi } from './PageTableFiles'
import type { ContactsApi } from './PageTableContacts'
import type { OwnerMultiState } from '../modals/ModalOwnerSelection'
import { useLanguage } from '../language/LanguageContext'
import type { DocCategoryCustom, FieldLang } from '../lib/appSettings'
import type { RepoData } from '../repos/repoService'

/** أقسام الجداول التي يوجّهها الراوتر. */
export const TABLE_SECTION_IDS: readonly string[] = [
  'passports', 'national_ids', 'civil', 'study', 'accounts', 'contacts', 'files',
]

export type TableContext = {
  repo: RepoData
  repoPassword: string | null
  activeMemberId: string
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
  onRepoUpdated: (data: RepoData) => void
  filesApiRef: Ref<FileManagerApi>
  accountsApiRef: Ref<AccountsApi>
  contactsApiRef: Ref<ContactsApi>
  fileCategories: DocCategoryCustom[]
  onStagingChange: (count: number) => void
  /** إشعار فتح/إغلاق معاينة الملفات (لأزرار الهيدر وإخفاء الشريط السفلي للوسائط). */
  onPreviewChange: (open: boolean, isMedia: boolean) => void
  /** التحديد المتعدد للملاك — للملفات (يزامن تبويبات الصفحة ومودال المالك). */
  fileOwners: OwnerMultiState
  /** التحديد المتعدد للملاك — لجهات الاتصال (الكل/متعدد/مفرد، بلا مشتركة). */
  contactOwners: OwnerMultiState
}

export default function TablesRouter({ section, ...ctx }: { section: string } & TableContext) {
  const { t } = useLanguage()
  const members = ctx.repo?.peoples ?? []
  const currentMember = members.find((member) => member.id === ctx.activeMemberId) ?? null
  const noMember = <p className="vault-empty">{t('pageRepoViewer.noRecords')}</p>

  if (section === 'accounts') {
    return (
      <PageTableAccounts
        repo={ctx.repo}
        repoPassword={ctx.repoPassword}
        activeMemberId={ctx.activeMemberId}
        ref={ctx.accountsApiRef}
        onEditMember={ctx.onRenameMember}
        onDeleteMember={ctx.onDeleteMember}
        onRepoUpdated={ctx.onRepoUpdated}
        onManageFields={ctx.onManageFields}
      />
    )
  }
  if (section === 'contacts') {
    return (
      <PageTableContacts
        ref={ctx.contactsApiRef}
        repo={ctx.repo}
        repoPassword={ctx.repoPassword}
        fieldLang={ctx.fieldLang}
        onRepoUpdated={ctx.onRepoUpdated}
        onManageFields={ctx.onManageFields}
        owners={ctx.contactOwners}
      />
    )
  }
  if (section === 'files') {
    return (
      <PageTableFiles
        ref={ctx.filesApiRef}
        repo={ctx.repo}
        repoPassword={ctx.repoPassword}
        onRepoUpdated={ctx.onRepoUpdated}
        defaultOwnerId={ctx.activeMemberId || null}
        activeMemberId={ctx.activeMemberId}
        onSelectMember={ctx.onSelectMember}
        onAddMember={ctx.onAddMember}
        onRenameMember={ctx.onRenameMember}
        onDeleteMember={ctx.onDeleteMember}
        fieldLang={ctx.fieldLang}
        categories={ctx.fileCategories}
        onStagingChange={ctx.onStagingChange}
        onPreviewChange={ctx.onPreviewChange}
        owners={ctx.fileOwners}
      />
    )
  }

  // التبويبات الفيزيائية 1-1 — تتطلب فرداً نشطاً.
  if (!currentMember) return noMember
  const profileShared = {
    repo: ctx.repo,
    repoPassword: ctx.repoPassword,
    members,
    activeMemberId: ctx.activeMemberId,
    fieldLang: ctx.fieldLang,
    mutBusy: ctx.mutBusy,
    mutError: ctx.mutError,
    setMutError: ctx.setMutError,
    runMutation: ctx.runMutation,
    onSelectMember: ctx.onSelectMember,
    onAddMember: ctx.onAddMember,
    onRenameMember: ctx.onRenameMember,
    onDeleteMember: ctx.onDeleteMember,
    onManageFields: ctx.onManageFields,
    onFieldLangChange: ctx.onFieldLangChange,
  }
  switch (section) {
    case 'passports': return <PageTablePassport {...profileShared} currentMember={currentMember} />
    case 'national_ids': return <PageTableIDs {...profileShared} currentMember={currentMember} />
    case 'civil': return <PageTableCilvilRegistry {...profileShared} currentMember={currentMember} />
    case 'study': return <PageTableCertificated {...profileShared} currentMember={currentMember} />
    default: return null
  }
}
