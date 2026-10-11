// أنواع الحاوية المشفرة — لا منطق هنا، فقط عقود مشتركة.
import { tr } from '../language/index'

export type VaultFileMeta = {
  name: string
  size: number
  lastModified: number
  mime: string
}

export type VaultStatus =
  | { kind: 'empty' } // لا حاوية محملة بعد
  | { kind: 'locked'; hasBlob: boolean } // يوجد ملف مشفر يحتاج كلمة مرور
  | { kind: 'unlocked'; fileCount: number }

export const VAULT_FILE_EXTENSION = '.vault'
export const VAULT_MIME = 'application/octet-stream'

export function guessMime(fileName: string): string {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  return 'application/octet-stream'
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} ${tr('vaultTypes.bytesUnit')}`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ${tr('vaultTypes.kbUnit')}`
  return `${(bytes / 1024 / 1024).toFixed(2)} ${tr('vaultTypes.mbUnit')}`
}
