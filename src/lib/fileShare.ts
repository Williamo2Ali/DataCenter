// واجهة ملحق مشاركة الملفات (ورقة نظام أندرويد) — استدعاء مباشر بلا حزمة npm،
// بنفس أسلوب deviceContacts.ts. المسارات داخل مجلدات التطبيق حصراً.
import { invoke } from '@tauri-apps/api/core'

const PLUGIN = 'plugin:file-share'

export interface ShareFilesOptions {
  title?: string
  subject?: string
  text?: string
  /** تجاوز MIME — لا يستخدمه التطبيق (Kotlin يكشف النوع من الامتداد). */
  mimeType?: string
}

/** فتح ورقة المشاركة لمسار واحد أو أكثر (داخل كاش/ملفات التطبيق). */
export async function shareFiles(paths: string[], options: ShareFilesOptions = {}): Promise<void> {
  await invoke(`${PLUGIN}|share_files`, { payload: { paths, ...options } })
}

export async function shareFile(path: string, options: ShareFilesOptions = {}): Promise<void> {
  return shareFiles([path], options)
}
