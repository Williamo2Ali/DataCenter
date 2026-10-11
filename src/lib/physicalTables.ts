// تعريف الجداول الفيزيائية 1-1 — مصدر واحد للعرض والتحرير والتحقق.
// كل جدول: قائمة أعمدة (المفتاح = اسم الحقل في DTO وبارامتر أمر upsert)،
// التسميتان، النوع، وخيارات القوائم. أي تعديل مستقبلي على الأعمدة يتم هنا فقط.
import type { FieldLang } from './appSettings'
import type { RepoData } from '../repos/repoService'

export type PhysicalTableId = 'passports' | 'civil' | 'national_ids' | 'study'

export type PhysicalFieldType = 'text' | 'long' | 'date' | 'number' | 'select' | 'year'

export type PhysicalOption = { key: string; ar: string; en: string }

export type PhysicalFieldDef = {
  /** مفتاح الحقل في DTO وبارامتر الـ upsert (camelCase). */
  key: string
  labelAr: string
  labelEn: string
  type: PhysicalFieldType
  options?: PhysicalOption[]
}

export const SEX_OPTIONS: PhysicalOption[] = [
  { key: 'male', ar: 'ذكر', en: 'Male' },
  { key: 'female', ar: 'أنثى', en: 'Female' },
]

export const GRADE_OPTIONS: PhysicalOption[] = [
  { key: 'kg', ar: 'روضة', en: 'KG' },
  { key: 'g1', ar: 'الصف الأول', en: 'Grade 1' },
  { key: 'g2', ar: 'الصف الثاني', en: 'Grade 2' },
  { key: 'g3', ar: 'الصف الثالث', en: 'Grade 3' },
  { key: 'g4', ar: 'الصف الرابع', en: 'Grade 4' },
  { key: 'g5', ar: 'الصف الخامس', en: 'Grade 5' },
  { key: 'g6', ar: 'الصف السادس', en: 'Grade 6' },
  { key: 'g7', ar: 'الصف السابع', en: 'Grade 7' },
  { key: 'g8', ar: 'الصف الثامن', en: 'Grade 8' },
  { key: 'g9', ar: 'الصف التاسع', en: 'Grade 9' },
  { key: 'g10', ar: 'الصف العاشر', en: 'Grade 10' },
  { key: 'g11', ar: 'الصف الحادي عشر', en: 'Grade 11' },
  { key: 'g12', ar: 'الصف الثاني عشر', en: 'Grade 12' },
  { key: 'university', ar: 'جامعة', en: 'University' },
  { key: 'master', ar: 'ماجستير', en: "Master's" },
  { key: 'phd', ar: 'دكتوراه', en: 'Ph.D.' },
  { key: 'professor', ar: 'بروفسور', en: 'Professor' },
]

const T = (key: string, labelAr: string, labelEn: string): PhysicalFieldDef =>
  ({ key, labelAr, labelEn, type: 'text' })
const TE = (keyAr: string, keyEn: string, labelAr: string, labelEn: string): PhysicalFieldDef[] => [
  { key: keyAr, labelAr, labelEn, type: 'text' },
  { key: keyEn, labelAr: `${labelAr} (إنكليزي)`, labelEn: `${labelEn} (English)`, type: 'text' },
]

export const PHYSICAL_TABLES: Record<PhysicalTableId, PhysicalFieldDef[]> = {
  passports: [
    ...TE('surname', 'surnameEn', 'الكنية / اسم العائلة', 'Surname'),
    ...TE('givenName', 'givenNameEn', 'الاسم الأول', 'Given Name'),
    ...TE('fullName', 'fullNameEn', 'الاسم الكامل', 'Full Name'),
    ...TE('fatherName', 'fatherNameEn', 'اسم الأب', "Father's Name"),
    ...TE('motherName', 'motherNameEn', 'اسم الأم', "Mother's Name"),
    { key: 'sex', labelAr: 'الجنس', labelEn: 'Sex', type: 'select', options: SEX_OPTIONS },
    { key: 'birthDate', labelAr: 'تاريخ الولادة', labelEn: 'Date of Birth', type: 'date' },
    ...TE('birthPlace', 'birthPlaceEn', 'مكان الولادة', 'Place of Birth'),
    T('nationalNumber', 'الرقم الوطني', 'National Number'),
    T('passportNumber', 'رقم جواز السفر', 'Passport Number'),
    ...TE('passportType', 'passportTypeEn', 'نوع الجواز', 'Passport Type'),
    T('countryCode', 'رمز البلد', 'Country Code'),
    ...TE('countryOfIssue', 'countryOfIssueEn', 'بلد الإصدار', 'Country of Issue'),
    ...TE('placeOfIssue', 'placeOfIssueEn', 'مكان الإصدار', 'Place of Issue'),
    { key: 'issueDate', labelAr: 'تاريخ الإصدار', labelEn: 'Date of Issue', type: 'date' },
    { key: 'expiryDate', labelAr: 'تاريخ انتهاء الصلاحية', labelEn: 'Date of Expiry', type: 'date' },
  ],
  civil: [
    ...TE('firstName', 'firstNameEn', 'الاسم', 'First Name'),
    ...TE('fatherName', 'fatherNameEn', 'اسم الأب', "Father's Name"),
    ...TE('motherName', 'motherNameEn', 'اسم الأم', "Mother's Name"),
    ...TE('lastName', 'lastNameEn', 'الكنية', 'Last Name'),
    { key: 'gender', labelAr: 'الجنس', labelEn: 'Gender', type: 'select', options: SEX_OPTIONS },
    { key: 'birthDate', labelAr: 'تاريخ الولادة', labelEn: 'Date of Birth', type: 'date' },
    ...TE('birthPlace', 'birthPlaceEn', 'مكان الولادة', 'Place of Birth'),
    ...TE('registryNumber', 'registryNumberEn', 'رقم القيد', 'Registry Number'),
    ...TE('religion', 'religionEn', 'الديانة', 'Religion'),
    ...TE('maritalStatus', 'maritalStatusEn', 'الحالة الاجتماعية', 'Marital Status'),
    T('nationalId', 'الرقم الوطني', 'National Number'),
  ],
  national_ids: [
    ...TE('firstName', 'firstNameEn', 'الاسم', 'First Name'),
    ...TE('lastName', 'lastNameEn', 'الكنية', 'Last Name'),
    ...TE('fatherName', 'fatherNameEn', 'اسم الأب', "Father's Name"),
    ...TE('motherName', 'motherNameEn', 'اسم الأم', "Mother's Name"),
    ...TE('birthPlace', 'birthPlaceEn', 'مكان الولادة', 'Place of Birth'),
    { key: 'birthDate', labelAr: 'تاريخ الولادة', labelEn: 'Date of Birth', type: 'date' },
    T('nationalId', 'الرقم الوطني', 'National Number'),
    ...TE('registryOffice', 'registryOfficeEn', 'الأمانة / الخانة', 'Registry Office / Box'),
    ...TE('registryRecord', 'registryRecordEn', 'القيد', 'Registry Record'),
    { key: 'gender', labelAr: 'الجنس', labelEn: 'Gender', type: 'select', options: SEX_OPTIONS },
    ...TE('faceColor', 'faceColorEn', 'لون الوجه', 'Face Color'),
    ...TE('eyeColor', 'eyeColorEn', 'لون العينين', 'Eye Color'),
    { key: 'distinctiveMarks', labelAr: 'العلامات المميزة', labelEn: 'Distinctive Marks', type: 'long' },
    { key: 'distinctiveMarksEn', labelAr: 'العلامات المميزة (إنكليزي)', labelEn: 'Distinctive Marks (English)', type: 'long' },
    { key: 'issueDate', labelAr: 'تاريخ المنح', labelEn: 'Date of Issue', type: 'date' },
  ],
  study: [
    { key: 'educationLevel', labelAr: 'المرحلة الدراسية', labelEn: 'Education Level', type: 'select', options: GRADE_OPTIONS },
    { key: 'graduationYear', labelAr: 'سنة التخرج', labelEn: 'Graduation Year', type: 'year' },
    ...TE('major', 'majorEn', 'الفرع / التخصص', 'Major'),
    ...TE('school', 'schoolEn', 'الجامعة / المدرسة', 'University / School'),
    { key: 'notes', labelAr: 'ملاحظات', labelEn: 'Notes', type: 'long' },
    { key: 'notesEn', labelAr: 'ملاحظات (إنكليزي)', labelEn: 'Notes (English)', type: 'long' },
  ],
}

/**
 * الحقول الأساسية القابلة للإدارة في جدول الحسابات (1-كثير).
 * المفتاح = اسم العمود الفيزيائي (snake_case) ليطابق وسوم الإخفاء/الحذف/التسميات.
 * المستثنى عمداً (محمي في الخلفية): id/record_id/title/password/kind والطوابع —
 * العنوان هوية البطاقة، وكلمة المرور والنوع يحكمان منطق العرض.
 */
export const ACCOUNT_FIELD_DEFS: PhysicalFieldDef[] = [
  { key: 'email', labelAr: 'البريد الإلكتروني', labelEn: 'Email', type: 'text' },
  { key: 'account_name', labelAr: 'اسم الحساب', labelEn: 'Account Name', type: 'text' },
  { key: 'username', labelAr: 'المستخدم', labelEn: 'Username', type: 'text' },
  { key: 'recovery_email', labelAr: 'بريد الاسترجاع', labelEn: 'Recovery Email', type: 'text' },
  { key: 'url', labelAr: 'الرابط', labelEn: 'URL', type: 'text' },
]

/**
 * الحقول الأساسية القابلة للإدارة في جدول جهات الاتصال (1-كثير).
 * المفتاح = اسم العمود الفيزيائي (snake_case) ليطابق وسوم الإخفاء/الحذف/التسميات.
 * المستثنى عمداً: name/nameEn (هوية البطاقة، محمية) وrelation (محذوفة من الواجهة).
 */
export const CONTACT_FIELD_DEFS: PhysicalFieldDef[] = [
  { key: 'phone', labelAr: 'الهاتف', labelEn: 'Phone', type: 'text' },
  { key: 'email', labelAr: 'البريد الإلكتروني', labelEn: 'Email', type: 'text' },
  { key: 'address', labelAr: 'العنوان', labelEn: 'Address', type: 'long' },
  { key: 'address_en', labelAr: 'العنوان (إنكليزي)', labelEn: 'Address (English)', type: 'long' },
]

/** خيارات عمود قائمة مخصص (JSON) — الفاسد يُعرض كنص حر. */
export function parseCustomOptions(foptions: string): PhysicalOption[] {
  try {
    const parsed: unknown = JSON.parse(foptions)
    if (!Array.isArray(parsed)) return []
    return (parsed as { key?: unknown; ar?: unknown; en?: unknown }[])
      .map((o) => ({
        key: typeof o.key === 'string' ? o.key : '',
        ar: typeof o.ar === 'string' ? o.ar : '',
        en: typeof o.en === 'string' ? o.en : '',
      }))
      .filter((o) => o.key !== '')
  } catch {
    return []
  }
}

export const YESNO_OPTIONS: PhysicalOption[] = [
  { key: 'yes', ar: 'نعم', en: 'Yes' },
  { key: 'no', ar: 'لا', en: 'No' },
]

/** تجاوز تسمية عمود أساسي — الاسم الفيزيائي ثابت، والمعروض حر. */
export type BaseLabelOverride = {
  columnName: string
  label: string
  labelEn: string
}

/** دمج تجاوزات التسميات فوق تعريفات الكود — الأصل يُحفَظ عند غياب التجاوز. */
export function applyBaseLabels(
  defs: PhysicalFieldDef[],
  overrides: BaseLabelOverride[],
): PhysicalFieldDef[] {
  if (overrides.length === 0) return defs
  const byKey = new Map(overrides.map((o) => [o.columnName, o]))
  return defs.map((def) => {
    const o = byKey.get(def.key)
    if (!o) return def
    return {
      ...def,
      labelAr: o.label.trim() ? o.label : def.labelAr,
      labelEn: o.labelEn.trim() ? o.labelEn : def.labelEn,
    }
  })
}

export type CustomColumnLike = {
  columnName: string
  label: string
  labelEn: string
  ftype: string
  foptions: string
}

/** محوّل عمود مخصص (سجل التعريف) → تعريف نموذج فيزيائي (لإعادة استخدام PhysicalForm). */
export function customColumnToDef(col: CustomColumnLike): PhysicalFieldDef {
  const base = { key: col.columnName, labelAr: col.label, labelEn: col.labelEn || col.label }
  switch (col.ftype) {
    case 'number': return { ...base, type: 'number' }
    case 'date': return { ...base, type: 'date' }
    case 'long': return { ...base, type: 'long' }
    case 'list': {
      const options = parseCustomOptions(col.foptions)
      return options.length > 0
        ? { ...base, type: 'select', options }
        : { ...base, type: 'text' }
    }
    case 'yesno': return { ...base, type: 'select', options: YESNO_OPTIONS }
    default: return { ...base, type: 'text' }
  }
}
export function getPhysicalRow(repo: RepoData, tabId: PhysicalTableId, memberId: string): Record<string, unknown> | undefined {
  switch (tabId) {
    case 'passports': return repo.passports.find((r) => r.recordId === memberId) as unknown as Record<string, unknown> | undefined
    case 'civil': return repo.civils.find((r) => r.recordId === memberId) as unknown as Record<string, unknown> | undefined
    case 'national_ids': return repo.nationalIds.find((r) => r.recordId === memberId) as unknown as Record<string, unknown> | undefined
    case 'study': return repo.studies.find((r) => r.recordId === memberId) as unknown as Record<string, unknown> | undefined
  }
}

const rawOf = (row: Record<string, unknown> | undefined, key: string): string => {
  if (!row) return ''
  const v = row[key]
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return typeof v === 'string' ? v : ''
}

/** القيمة المعروضة لحقل (مفتاح القائمة يُترجَم، مع رجوع للعربي). */
export function physicalDisplayValue(row: Record<string, unknown> | undefined, def: PhysicalFieldDef, fieldLang: FieldLang): string {
  const raw = rawOf(row, def.key).trim()
  if (raw === '') return ''
  if (def.type === 'select' && def.options) {
    const opt = def.options.find((o) => o.key === raw)
    if (opt) return fieldLang === 'en' ? opt.en : opt.ar
  }
  return raw
}

/** التسمية المعروضة للحقل حسب لغة العرض. */
export function physicalLabel(def: PhysicalFieldDef, fieldLang: FieldLang): string {
  return fieldLang === 'en' ? def.labelEn : def.labelAr
}

/** هل الصف مملوء (قيمة واحدة على الأقل)؟ — للعدّادات. */
export function isRowFilled(row: Record<string, unknown> | undefined, defs: PhysicalFieldDef[]): boolean {
  if (!row) return false
  return defs.some((d) => rawOf(row, d.key).trim() !== '')
}

/** تحقق الواجهة (يطابق الخلفية): تاريخ ISO أو فارغ، سنة فارغة أو 1900–2100. */
export function validatePhysicalValue(def: PhysicalFieldDef, value: string): 'invalidDate' | 'invalidYear' | null {
  const v = value.trim()
  if (def.type === 'date' && v !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'invalidDate'
  if ((def.type === 'number' || def.type === 'year') && v !== '') {
    const n = Number(v)
    if (!Number.isInteger(n) || n < 1900 || n > 2100) return 'invalidYear'
  }
  return null
}
