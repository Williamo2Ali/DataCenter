import { invoke, convertFileSrc } from '@tauri-apps/api/core'
import { generateId } from '@/utils/helpers'

// طبقة الوصول للمستودعات — المكان الوحيد المسموح فيه بـ invoke لهذا المجال.
// المعرفات: UUID v4 مقسّم (36 حرفاً) — الواجهة تولّد عبر `generateId` والخلفية تتحقق.

export type RepoMeta = {
  id: string
  name: string
  path: string
  createdAt: number
  isLocked: boolean
  isFavorite: boolean
  lastOpenedAt: number
  openCount: number
}

export type RepoTab = {
  id: string
  /** العنوان المعروض عند اختيار اللغة العربية. */
  title: string
  /** العنوان المعروض عند اختيار اللغة الإنجليزية — قد يكون فارغاً. */
  titleEn: string
  /** نوع التبويب: أساسي (`core`) أو مخصص (`custom` — جدول فيزيائي لحظي). */
  kind: string
  /** اسم الجدول الفيزيائي المقابل. */
  tableName: string | null
  sortOrder: number
  /** المخفي مستثنى من كل العروض والعدّادات — يُدار من صفحة الجداول فقط. */
  isHidden: boolean
  /** حذف ناعم: البيانات ممسوحة والتبويب مستثنى من كل العروض — يُستعاد فارغاً. */
  isDeleted: boolean
  createdAt: number
  updatedAt: number
}

/** تبويبات العرض فقط — المخفي والمحذوف ناعماً مستثنيان دائماً. */
export function visibleTabs(tabs: RepoTab[]): RepoTab[] {
  return tabs.filter((tab) => !tab.isHidden && !tab.isDeleted)
}

export type RepoPerson = {
  id: string
  name: string
  /** الاسم الإنكليزي. */
  nameEn: string
  relation: string
  /** الصفة الإنكليزية. */
  relationEn: string
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export type RepoAccount = {
  id: string
  recordId: string
  title: string
  email: string | null
  accountName: string | null
  username: string | null
  recoveryEmail: string | null
  password: string
  /** نوع الحساب: `email` ايميل أو `site` اشتراك موقع. */
  kind: string
  /** رابط الموقع لاشتراكات المواقع فقط. */
  url: string | null
  sortOrder: number
  createdAt: number
  updatedAt: number
  /** قيم الأعمدة الإضافية (من مدير الأعمدة) — خارج البنية الأساسية. */
  extra: Record<string, unknown>
}

export type RepoDocument = {
  id: string
  fileName: string
  title: string
  /** نوع الملف: `file` عام أو `image` صورة. */
  kind: string
  category: string
  /** ربط حقيقي بسجل الفرد — null = ملف عائلي/مشترك. بلا اسم مجمد. */
  ownerRecordId: string | null
  /** مسار المصدر لحظة الإضافة (قد يقدم — للمرجعية فقط). */
  sourcePath: string
  /** امتداد الملف صغيراً ('' بلا امتداد). */
  filetype: string
  sizeBytes: number
  modifiedAt: number
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export type RepoPassport = {
  recordId: string
  surname: string
  surnameEn: string
  givenName: string
  givenNameEn: string
  fullName: string
  fullNameEn: string
  fatherName: string
  fatherNameEn: string
  motherName: string
  motherNameEn: string
  sex: string
  birthDate: string
  birthPlace: string
  birthPlaceEn: string
  nationalNumber: string
  passportNumber: string
  passportType: string
  passportTypeEn: string
  countryCode: string
  countryOfIssue: string
  countryOfIssueEn: string
  placeOfIssue: string
  placeOfIssueEn: string
  issueDate: string
  expiryDate: string
  createdAt: number
  updatedAt: number
  /** قيم الأعمدة الإضافية (من مدير الأعمدة) — خارج البنية الأساسية. */
  extra: Record<string, unknown>
}

export type RepoStudy = {
  recordId: string
  educationLevel: string
  graduationYear: number | null
  major: string
  majorEn: string
  school: string
  schoolEn: string
  notes: string
  notesEn: string
  createdAt: number
  updatedAt: number
  /** قيم الأعمدة الإضافية (من مدير الأعمدة) — خارج البنية الأساسية. */
  extra: Record<string, unknown>
}

export type RepoNationalId = {
  recordId: string
  authority: string
  authorityEn: string
  docType: string
  docTypeEn: string
  firstName: string
  firstNameEn: string
  lastName: string
  lastNameEn: string
  fatherName: string
  fatherNameEn: string
  motherName: string
  motherNameEn: string
  birthPlace: string
  birthPlaceEn: string
  birthDate: string
  nationalId: string
  registryOffice: string
  registryOfficeEn: string
  registryRecord: string
  registryRecordEn: string
  gender: string
  faceColor: string
  faceColorEn: string
  eyeColor: string
  eyeColorEn: string
  address: string
  addressEn: string
  distinctiveMarks: string
  distinctiveMarksEn: string
  issueDate: string
  createdAt: number
  updatedAt: number
  /** قيم الأعمدة الإضافية (من مدير الأعمدة) — خارج البنية الأساسية. */
  extra: Record<string, unknown>
}

export type RepoCivil = {
  recordId: string
  firstName: string
  firstNameEn: string
  fatherName: string
  fatherNameEn: string
  motherName: string
  motherNameEn: string
  lastName: string
  lastNameEn: string
  gender: string
  birthDate: string
  birthPlace: string
  birthPlaceEn: string
  registryNumber: string
  registryNumberEn: string
  religion: string
  religionEn: string
  maritalStatus: string
  maritalStatusEn: string
  nationalId: string
  createdAt: number
  updatedAt: number
  /** قيم الأعمدة الإضافية (من مدير الأعمدة) — خارج البنية الأساسية. */
  extra: Record<string, unknown>
}

export type RepoContact = {
  id: string
  recordId: string | null
  name: string
  nameEn: string
  phone: string
  email: string
  address: string
  addressEn: string
  relation: string
  relationEn: string
  sortOrder: number
  createdAt: number
  updatedAt: number
  /** قيم الأعمدة الإضافية (من مدير الأعمدة) — خارج البنية الأساسية. */
  extra: Record<string, unknown>
}

export type RepoData = {
  meta: RepoMeta
  tabs: RepoTab[]
  peoples: RepoPerson[]
  accounts: RepoAccount[]
  documents: RepoDocument[]
  passports: RepoPassport[]
  studies: RepoStudy[]
  nationalIds: RepoNationalId[]
  civils: RepoCivil[]
  contacts: RepoContact[]
  customTables: RepoCustomTable[]
}

export type CustomColumnInput = {
  name: string
  label: string
  labelEn: string
  ftype: string
  foptions: string
}

export type RepoCustomColumn = {
  tableName: string
  columnName: string
  label: string
  labelEn: string
  ftype: string
  foptions: string
  sortOrder: number
}

export type RepoCustomTable = {
  tabId: string
  tableName: string
  columns: RepoCustomColumn[]
  rows: Record<string, unknown>[]
  hidden: string[]
  deleted: string[]
  labels: BaseColumnLabel[]
}

export type BaseColumnLabel = {
  columnName: string
  label: string
  labelEn: string
}

export async function listRepos(): Promise<RepoMeta[]> {
  return invoke<RepoMeta[]>('list_repos')
}

/** حجم المستودع الكلي بالبايت (مجلده كاملاً — بلا فتح). */
export async function repoSize(repoId: string): Promise<number> {
  return invoke<number>('repo_size', { repoId })
}

export async function createRepo(name: string, password?: string, members?: string[], withDefaults = true): Promise<RepoMeta> {
  return invoke<RepoMeta>('create_repo', {
    name,
    password: password && password.length > 0 ? password : null,
    members: members && members.length > 0 ? members : null,
    withDefaults,
  })
}

export async function openRepo(id: string, password?: string): Promise<RepoData> {
  return invoke<RepoData>('open_repo', { id, password: password && password.length > 0 ? password : null })
}

export async function verifyRepoPassword(id: string, password: string): Promise<void> {
  return invoke<void>('verify_repo_password', { id, password })
}

/** إغلاق الجلسة الخلفية (إسقاط الذاكرة) — الأفضل جهداً قبل تصفير الحالة. */
export async function closeRepo(id: string): Promise<void> {
  return invoke<void>('close_repo', { id })
}

export async function setRepoPassword(id: string, currentPassword?: string | null, newPassword?: string | null): Promise<RepoMeta> {
  return invoke<RepoMeta>('set_repo_password', {
    id,
    currentPassword: currentPassword && currentPassword.length > 0 ? currentPassword : null,
    newPassword: newPassword && newPassword.length > 0 ? newPassword : null,
  })
}

/** قفل مستودع نصي: تحويل مشفر كامل بالكلمة الجديدة — يُستدعَى بعد تأكيد المودال فقط. */
export async function lockRepo(id: string, password: string, currentPassword?: string | null): Promise<RepoMeta> {
  return invoke<RepoMeta>('lock_repo', {
    id,
    currentPassword: currentPassword && currentPassword.length > 0 ? currentPassword : null,
    password,
  })
}

/** تبديل المفضلة — في الفهرس فقط. */
export async function toggleFavorite(id: string): Promise<RepoMeta> {
  return invoke<RepoMeta>('toggle_favorite', { id })
}

// ================= جداول المستودع (لكل مستودع على حدة — لا مزامنة عامة) =================

export async function addRepoTab(repoId: string, password: string | null, title: string, titleEn: string): Promise<RepoData> {
  return invoke<RepoData>('add_repo_tab', { repoId, password, title, titleEn })
}

export async function renameRepoTab(repoId: string, password: string | null, id: string, title: string, titleEn: string): Promise<RepoData> {
  return invoke<RepoData>('rename_repo_tab', { repoId, password, id, title, titleEn })
}

export async function deleteRepoTab(repoId: string, password: string | null, id: string): Promise<RepoData> {
  return invoke<RepoData>('delete_repo_tab', { repoId, password, id })
}

export async function deleteCoreTab(repoId: string, password: string | null, id: string): Promise<RepoData> {
  return invoke<RepoData>('delete_core_tab', { repoId, password, id })
}

export async function restoreCoreTab(repoId: string, password: string | null, id: string): Promise<RepoData> {
  return invoke<RepoData>('restore_core_tab', { repoId, password, id })
}

export async function moveRepoTab(repoId: string, password: string | null, id: string, direction: -1 | 1): Promise<RepoData> {
  return invoke<RepoData>('move_repo_tab', { repoId, password, id, direction })
}

/** استعادة الافتراضي للمستودع الحالي: دمج الجداول الناقصة فقط. */
export async function restoreRepoDefaults(repoId: string, password: string | null): Promise<RepoData> {
  return invoke<RepoData>('restore_repo_defaults', { repoId, password })
}

/** إظهار/إخفاء جدول — المخفي مستثنى من كل العروض (لا يُحذَف). */
export async function setTabHidden(repoId: string, password: string | null, id: string, hidden: boolean): Promise<RepoData> {
  return invoke<RepoData>('set_tab_hidden', { repoId, password, id, hidden })
}

/** تغيير اسم عرض المستودع — المعرف الفيزيائي ثابت. المقفل يتطلب كلمة مروره. */
export async function renameRepo(id: string, name: string, password?: string): Promise<RepoMeta> {
  return invoke<RepoMeta>('rename_repo', { id, password: password && password.length > 0 ? password : null, name })
}

// ================= ملفات المستودع (فهرس + كتل) =================

/** مسار مجلد ملفات المستودع — لتنسخ الواجهة إليه (plugin-fs). المقفل يتطلب كلمة مروره. */
export async function repoFilesDir(repoId: string, password: string | null): Promise<string> {
  return invoke<string>('repo_files_dir', { repoId, password })
}

/** تسجيل صف ملف نُسخ مسبقاً للوجهة — الـ ID مولّد من الواجهة. */
export async function registerDocument(
  repoId: string,
  password: string | null,
  fileName: string,
  title: string,
  kind: string,
  ownerRecordId: string | null,
  category: string,
  sourcePath: string | null,
  filetype: string | null,
): Promise<RepoData> {
  return invoke<RepoData>('register_document', { repoId, password, id: generateId(), fileName, title, kind, ownerRecordId, category, sourcePath, filetype })
}

export type RegisterDocumentItem = {
  fileName: string
  title: string
  kind: string
  ownerRecordId: string | null
  category: string
  sourcePath: string | null
  filetype: string | null
}

export type RegisterDocumentFailure = {
  index: number
  reason: string
}

/** تسجيل دفعة ملفات نُسخت مسبقاً — بوابة واحدة وفتح واحد؛ الفاشل لا يحجب الناجح. */
export async function registerDocuments(
  repoId: string,
  password: string | null,
  items: RegisterDocumentItem[],
): Promise<{ data: RepoData; failed: RegisterDocumentFailure[] }> {
  return invoke<{ data: RepoData; failed: RegisterDocumentFailure[] }>('register_documents', { repoId, password, items })
}

export async function updateDocumentMetadata(
  repoId: string,
  password: string | null,
  id: string,
  title: string,
  kind: string,
  ownerRecordId: string | null,
  category: string,
): Promise<RepoData> {
  return invoke<RepoData>('update_document_metadata', { repoId, password, id, title, kind, ownerRecordId, category })
}

export async function deleteDocument(repoId: string, password: string | null, id: string): Promise<RepoData> {
  return invoke<RepoData>('delete_document', { repoId, password, id })
}

export async function addPeople(repoId: string, password: string | null, name: string, nameEn: string, relation: string, relationEn: string): Promise<RepoData> {
  return invoke<RepoData>('add_people', { repoId, password, id: generateId(), name, nameEn, relation, relationEn })
}

export async function updatePeople(repoId: string, password: string | null, id: string, name: string, nameEn: string, relation: string, relationEn: string): Promise<RepoData> {
  return invoke<RepoData>('update_people', { repoId, password, id, name, nameEn, relation, relationEn })
}

export async function deletePeople(repoId: string, password: string | null, id: string): Promise<RepoData> {
  return invoke<RepoData>('delete_people', { repoId, password, id })
}

/** تصدير قاعدة بيانات المستودع (SQLite) إلى مسار يختاره المستخدم. */
export async function exportRepoDb(id: string, password: string | null, destPath: string): Promise<void> {
  return invoke<void>('export_repo_db', { id, password, destPath })
}

/** بايتات قاعدة البيانات بعد دمج WAL — لوجهات content:// في أندرويد. */
export async function exportRepoBytes(id: string, password: string | null): Promise<Uint8Array> {
  const arr = await invoke<number[]>('export_repo_bytes', { id, password })
  return Uint8Array.from(arr)
}

/** استيراد نسخة قاعدة بيانات لتحل محل بيانات المستودع — يعيد البيانات الجديدة. */
export async function importRepoDb(id: string, password: string | null, srcPath: string): Promise<RepoData> {
  return invoke<RepoData>('import_repo_db', { id, password, srcPath })
}

/** تثبيت نسخة من بايتات (مصادر content:// في أندرويد) — نفس الفحوصات. */
export async function importRepoBytes(id: string, password: string | null, data: Uint8Array): Promise<RepoData> {
  return invoke<RepoData>('import_repo_bytes', { id, password, data: Array.from(data) })
}

export async function deleteContact(repoId: string, password: string | null, id: string): Promise<RepoData> {
  return invoke<RepoData>('delete_contact', { repoId, password, id })
}

export type AccountInput = {
  title: string
  email: string | null
  accountName: string | null
  username: string | null
  recoveryEmail: string | null
  passwordValue: string
  kind: string
  url: string | null
}

export async function addAccount(repoId: string, password: string | null, recordId: string, input: AccountInput, id?: string): Promise<RepoData> {
  return invoke<RepoData>('add_account', { repoId, password, id: id ?? generateId(), recordId, ...input })
}

export async function updateAccount(repoId: string, password: string | null, id: string, input: AccountInput): Promise<RepoData> {
  return invoke<RepoData>('update_account', { repoId, password, id, ...input })
}

/** حفظ القيم الإضافية لحساب واحد (بمفتاح id) — بعد الإضافة/التعديل عند وجود أعمدة إضافية. */
export async function updateAccountExtra(repoId: string, password: string | null, accountId: string, values: Record<string, unknown>): Promise<RepoData> {
  return invoke<RepoData>('update_account_extra', { repoId, password, accountId, valuesJson: JSON.stringify(values) })
}

export async function deleteAccount(repoId: string, password: string | null, id: string): Promise<RepoData> {
  return invoke<RepoData>('delete_account', { repoId, password, id })
}

export type ContactInput = {
  recordId: string | null
  name: string
  nameEn: string
  phone: string
  email: string
  address: string
  addressEn: string
  relation: string
  relationEn: string
}

export async function addContact(repoId: string, password: string | null, input: ContactInput, id?: string): Promise<RepoData> {
  return invoke<RepoData>('add_contact', { repoId, password, id: id ?? generateId(), ...input })
}

export async function updateContact(repoId: string, password: string | null, id: string, input: ContactInput): Promise<RepoData> {
  return invoke<RepoData>('update_contact', { repoId, password, id, ...input })
}

/** حفظ القيم الإضافية لجهة واحدة (بمفتاح id) — بعد الإضافة/التعديل عند وجود أعمدة إضافية. */
export async function updateContactExtra(repoId: string, password: string | null, contactId: string, values: Record<string, unknown>): Promise<RepoData> {
  return invoke<RepoData>('update_contact_extra', { repoId, password, contactId, valuesJson: JSON.stringify(values) })
}

export async function upsertPassport(repoId: string, password: string | null, input: Record<string, unknown>): Promise<RepoData> {
  return invoke<RepoData>('upsert_passport', { repoId, password, ...input })
}

export async function upsertStudy(repoId: string, password: string | null, input: Record<string, unknown>): Promise<RepoData> {
  return invoke<RepoData>('upsert_study', { repoId, password, ...input })
}

export async function upsertNationalId(repoId: string, password: string | null, input: Record<string, unknown>): Promise<RepoData> {
  return invoke<RepoData>('upsert_national_id', { repoId, password, ...input })
}

export async function upsertCivil(repoId: string, password: string | null, input: Record<string, unknown>): Promise<RepoData> {
  return invoke<RepoData>('upsert_civil', { repoId, password, ...input })
}

export async function createCustomTab(repoId: string, password: string | null, title: string, titleEn: string, columns: CustomColumnInput[]): Promise<RepoData> {
  return invoke<RepoData>('create_custom_tab', { repoId, password, title, titleEn, columns })
}

export async function addCustomColumn(repoId: string, password: string | null, tabId: string, column: CustomColumnInput): Promise<RepoData> {
  return invoke<RepoData>('add_custom_column', { repoId, password, tabId, column })
}

export async function renameCustomColumn(repoId: string, password: string | null, tabId: string, columnName: string, label: string, labelEn: string): Promise<RepoData> {
  return invoke<RepoData>('rename_custom_column', { repoId, password, tabId, columnName, label, labelEn })
}

export async function deleteCustomColumn(repoId: string, password: string | null, tabId: string, columnName: string): Promise<RepoData> {
  return invoke<RepoData>('delete_custom_column', { repoId, password, tabId, columnName })
}

export async function hideBaseColumn(repoId: string, password: string | null, tabId: string, columnName: string): Promise<RepoData> {
  return invoke<RepoData>('hide_base_column', { repoId, password, tabId, columnName })
}

export async function unhideBaseColumn(repoId: string, password: string | null, tabId: string, columnName: string): Promise<RepoData> {
  return invoke<RepoData>('unhide_base_column', { repoId, password, tabId, columnName })
}

export async function softDeleteBaseColumn(repoId: string, password: string | null, tabId: string, columnName: string): Promise<RepoData> {
  return invoke<RepoData>('soft_delete_base_column', { repoId, password, tabId, columnName })
}

export async function restoreBaseColumn(repoId: string, password: string | null, tabId: string, columnName: string): Promise<RepoData> {
  return invoke<RepoData>('restore_base_column', { repoId, password, tabId, columnName })
}

export async function setBaseColumnLabel(repoId: string, password: string | null, tabId: string, columnName: string, label: string, labelEn: string): Promise<RepoData> {
  return invoke<RepoData>('set_base_column_label', { repoId, password, tabId, columnName, label, labelEn })
}

export async function resetBaseColumnLabel(repoId: string, password: string | null, tabId: string, columnName: string): Promise<RepoData> {
  return invoke<RepoData>('reset_base_column_label', { repoId, password, tabId, columnName })
}

export async function upsertCustomRow(repoId: string, password: string | null, tabId: string, id: string | null, peopleId: string | null, values: Record<string, unknown>): Promise<RepoData> {
  return invoke<RepoData>('upsert_custom_row', { repoId, password, tabId, id, peopleId, valuesJson: JSON.stringify(values) })
}

export async function deleteCustomRow(repoId: string, password: string | null, tabId: string, id: string): Promise<RepoData> {
  return invoke<RepoData>('delete_custom_row', { repoId, password, tabId, id })
}

export async function updateCoreExtra(repoId: string, password: string | null, tabId: string, recordId: string, values: Record<string, unknown>): Promise<RepoData> {
  return invoke<RepoData>('update_core_extra', { repoId, password, tabId, recordId, valuesJson: JSON.stringify(values) })
}

export async function deleteRepo(id: string, password?: string): Promise<void> {
  return invoke<void>('delete_repo', { id, password: password && password.length > 0 ? password : null })
}

// التبويبات عامة لكل المستودعات — تُدار من الإعدادات.
export async function listDefaultTabs(): Promise<RepoTab[]> {
  return invoke<RepoTab[]>('list_default_tabs')
}

export async function saveDefaultTabs(tabs: { id: string; title: string; titleEn: string }[]): Promise<RepoTab[]> {
  return invoke<RepoTab[]>('save_default_tabs', { tabs })
}

const fileUrlCache = new Map<string, string>()

/** المسار المطلق لملف داخل المستودع → رابط asset صالح لـ pdfjs/fetch. */
export async function resolveRepoFileUrl(repoId: string, fileName: string): Promise<string> {
  const key = `${repoId}/${fileName}`
  const cached = fileUrlCache.get(key)
  if (cached) return cached
  const absPath = await invoke<string>('resolve_repo_file', { id: repoId, fileName })
  const url = convertFileSrc(absPath)
  fileUrlCache.set(key, url)
  return url
}

/** المسار المطلق لملف داخل المستودع — للتصدير الأصلي (لا يمر بأي بايت في JS). */
export async function repoFileAbsPath(repoId: string, fileName: string): Promise<string> {
  return invoke<string>('resolve_repo_file', { id: repoId, fileName })
}

// ================= إعدادات التطبيق (ملف settings.json في AppData) =================

export type AppSettingsJson = {
  fontSize: number
  inputFontSize: number
  buttonFontSize: number
  buttonIconSize: number
  fontFamily: string
  displayZoom: number
  fieldLang: string
  repoSort: string
  docCategories: { key: string; ar: string; en: string }[]
  driveFolderName: string
  driveFolderId: string
}

/** قراءة الإعدادات من الملف (تُنشأ بالافتراضيات عند الغياب). */
export async function readAppSettings(): Promise<AppSettingsJson> {
  return invoke<AppSettingsJson>('read_app_settings')
}

/** حفظ الإعدادات في الملف — يعيد النسخة المعتمدة بعد الدمج والتحقق. */
export async function saveAppSettings(settings: AppSettingsJson): Promise<AppSettingsJson> {
  return invoke<AppSettingsJson>('save_app_settings', { settings })
}

// ================= البحث العام عن الأشخاص (فهرس people_index.json) =================

export type PeopleHit = {
  name: string
  nameEn: string
  repoId: string
  repoName: string
}

/** بحث عام: مطابقة جزئية على الاسمين — الفارغ يعيد فراغاً. */
export async function searchPeopleIndex(query: string): Promise<PeopleHit[]> {
  return invoke<PeopleHit[]>('search_people_index', { query })
}

// ================= الملف الشخصي (ملف profile.json في AppData — بلا أي حقل سري) =================

export type ProfileJson = {
  name: string
  phone: string
  email: string
  city: string
  country: string
  notes: string
  photo: string | null
  /** لغة التطبيق — الافتراضي العربية. */
  language: string
  /** مظهر التطبيق — الافتراضي الفاتح. */
  theme: string
}

/** قراءة الملف الشخصي من الملف (يُنشأ فارغاً عند الغياب). */
export async function readProfile(): Promise<ProfileJson> {
  return invoke<ProfileJson>('read_profile')
}

/** حفظ الملف الشخصي في الملف — يعيد النسخة المعتمدة بعد الدمج والتحقق. */
export async function saveProfileFile(profile: ProfileJson): Promise<ProfileJson> {
  return invoke<ProfileJson>('save_profile', { profile })
}
