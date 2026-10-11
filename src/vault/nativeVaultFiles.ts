import { isTauri, invoke } from '@tauri-apps/api/core'
import { exists, mkdir, readFile, remove, writeFile } from '@tauri-apps/plugin-fs'
import { appDataDir, join } from '@tauri-apps/api/path'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { tr } from '../language/index'

// طبقة الملفات الأصلية — Tauri فقط (ويندوز).
// الحاويات ملفات حقيقية: <AppData>/vaults/<name>.vault
// تُستدعى دوالها فقط عندما isTauri() === true.

export const VAULTS_DIR_NAME = 'vaults'
export const VAULT_EXTENSION = '.vault'

export function isNative(): boolean {
  try {
    return isTauri()
  } catch {
    return false
  }
}

/** تنظيف اسم الحاوية ليصلح اسم ملف ويندوز + فرض امتداد .vault */
export function toSafeVaultFileName(name: string): string {
  let base = (name ?? '').trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').replace(/[. ]+$/g, '')
  if (!base) base = 'vault'
  if (base.toLowerCase().endsWith(VAULT_EXTENSION)) base = base.slice(0, -VAULT_EXTENSION.length) || 'vault'
  return `${base.slice(0, 80)}${VAULT_EXTENSION}`
}

/** مجلد الحاويات (يُنشأ عند الحاجة) ويعيد مساره المطلق. */
export async function vaultsDir(): Promise<string> {
  const dir = await join(await appDataDir(), VAULTS_DIR_NAME)
  if (!(await exists(dir))) await mkdir(dir, { recursive: true })
  return dir
}

/** مسار فريد داخل المجلد (يضيف (2), (3)... عند التعارض) — يتجاهل مسار السجل نفسه عند الحفظ. */
export async function uniqueVaultPath(dir: string, fileName: string, ignorePath?: string | null): Promise<{ fileName: string; fullPath: string }> {
  const dot = fileName.lastIndexOf('.')
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName
  const ext = dot > 0 ? fileName.slice(dot) : VAULT_EXTENSION
  let candidate = fileName
  let counter = 2
  for (;;) {
    const fullPath = await join(dir, candidate)
    if (fullPath === ignorePath || !(await exists(fullPath))) return { fileName: candidate, fullPath }
    candidate = `${stem} (${counter})${ext}`
    counter += 1
  }
}

export async function writeVaultFile(fullPath: string, bytes: ArrayBuffer): Promise<number> {
  const data = new Uint8Array(bytes)
  await writeFile(fullPath, data)
  return data.byteLength
}

export async function readVaultFile(fullPath: string): Promise<ArrayBuffer> {
  try {
    const data = await readFile(fullPath)
    // نسخ إلى ArrayBuffer مستقل (readFile قد يعيد-backed buffer)
    const out = new Uint8Array(data.byteLength)
    out.set(data)
    return out.buffer as ArrayBuffer
  } catch {
    throw new Error(tr('vaultFiles.missingOnDiskError'))
  }
}

/** تطبيق الحماية الكاملة على ملف حاوية (إخفاء + منع حذف — أمر Rust خلفي). */
export async function protectVaultFile(fullPath: string): Promise<void> {
  await invoke('protect_vault_file', { path: fullPath })
}

/** كتابة ملف حاوية جديد + حمايته فوراً (العملية الذرية المعتمدة للإنشاء). */
export async function writeSecureVaultFile(fullPath: string, bytes: ArrayBuffer): Promise<number> {
  const size = await writeVaultFile(fullPath, bytes)
  await protectVaultFile(fullPath)
  return size
}

/**
 * حذف آمن مشروط بكلمة المرور (Rust يتحقق بالفك الفعلي أولاً، ثم يزيل
 * منع الحذف، ثم يحذف — كلمة خاطئة لا تمس أي شيء).
 */
export async function verifyAndDeleteVaultFile(fullPath: string, password: string): Promise<void> {
  await invoke('verify_and_delete_vault', { path: fullPath, password })
}

export async function deleteVaultFile(fullPath: string): Promise<void> {
  if (await exists(fullPath)) await remove(fullPath)
}

/** فتح مجلد الملف وتحديده في مستكشف ويندوز. */
export async function revealVaultFile(fullPath: string): Promise<void> {
  await revealItemInDir(fullPath)
}
