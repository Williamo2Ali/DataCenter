// أنواع إعدادات التطبيق ومقاييسها الافتراضية — في ملف مستقل عن أي مكوّن
// حتى تستورده تبويبات صفحة الحساب دون أن يتحمّل أحدٌ مسؤولية إعادة تصديره.
// لغة التطبيق ومظهره يعيشان في ملف البروفايل (profile.json) لا هنا.

export type ThemeMode = 'light' | 'dark'

/** لغة عرض الحقول — عربي أو إنكليزي فقط (مستقلة عن لغة التطبيق). */
export type FieldLang = 'ar' | 'en'

/** ترتيب عرض المستودعات في الرئيسية — الافتراضي الأقدم (الترتيب الحالي نفسه). */
export type RepoSortMode = 'oldest' | 'newest' | 'nameAsc' | 'nameDesc' | 'lastUsed' | 'mostUsed' | 'favorites'

/** تصنيف ملفات مخصص — يُضاف للافتراضيات الأربعة. */
export type DocCategoryCustom = {
  key: string
  ar: string
  en: string
}

export type AppSettings = {
  fontSize: number
  /** حجم خط حقول الإدخال فقط — مستقل عن خط التطبيق العام. */
  inputFontSize: number
  /** حجم النص داخل الأزرار — سيطرة عامة فوق كل الأحجام المدمجة. */
  buttonFontSize: number
  /** حجم أيقونات الأزرار (lucide داخل button فقط). */
  buttonIconSize: number
  fontFamily: string
  displayZoom: number
  fieldLang: FieldLang
  repoSort: RepoSortMode
  docCategories: DocCategoryCustom[]
  /** اسم مجلد المزامنة في Drive — يحرره المستخدم، ولا يكون فارغاً أبداً. */
  driveFolderName: string
  /** معرّف المجلد — يكتبه التطبيق نفسه بعد الإنشاء، ولا يظهر في الواجهة. */
  driveFolderId: string
}

/** اسم مجلد المزامنة الافتراضي — يُستعاد عند المسح. */
export const DEFAULT_DRIVE_FOLDER_NAME = 'DataCenter Sync'

/** تطبيع اسم المجلد: تقليم + سقف 120 حرفاً + الفارغ يعود للافتراضي. */
export function normalizeDriveFolderName(value: string): string {
  const trimmed = value.trim().slice(0, 120)
  return trimmed === '' ? DEFAULT_DRIVE_FOLDER_NAME : trimmed
}

export const defaultSettings: AppSettings = {
  fontSize: 17,
  inputFontSize: 16,
  buttonFontSize: 15,
  buttonIconSize: 16,
  fontFamily: 'Cairo',
  displayZoom: 100,
  fieldLang: 'ar',
  repoSort: 'oldest',
  docCategories: [],
  driveFolderName: DEFAULT_DRIVE_FOLDER_NAME,
  driveFolderId: '',
}

/** افتراضيات تبويب العرض فقط (مأخوذة من قيم الهاتف الحالية) — لزر إعادة الضبط.
// لا تشمل التصنيفات المخصصة (تُدار من تبويب التصنيفات). */
export const defaultAppearance = {
  fontSize: 17,
  inputFontSize: 16,
  buttonFontSize: 15,
  buttonIconSize: 16,
  fontFamily: 'Cairo',
  displayZoom: 100,
  fieldLang: 'ar',
} as const