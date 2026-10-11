import { invoke } from '@tauri-apps/api/core'

// طبقة استدعاء أوامر النسخ الاحتياطي — المكان الوحيد المسموح فيه بـ invoke هنا.
// لا تُمرر أي بايتات ملفات عبر IPC: فقط مسارات + كلمات مرور + نتائج وصفية.

export type BackupVaultInfo = {
  name: string
  fileName: string
  size: number
}

export type BackupInfo = {
  vaultCount: number
  totalSize: number
  createdAt: number
  vaults: BackupVaultInfo[]
}

export type BackupCreated = {
  filePath: string
  fileName: string
  vaultCount: number
  size: number
}

export type RestoredVault = {
  name: string
  fileName: string
  fullPath: string
  size: number
}

export async function createBackup(password: string, targetPath: string): Promise<BackupCreated> {
  return invoke<BackupCreated>('create_backup', { password, targetPath })
}

export async function inspectBackup(path: string, password: string): Promise<BackupInfo> {
  return invoke<BackupInfo>('inspect_backup', { path, password })
}

export async function restoreBackup(path: string, password: string): Promise<RestoredVault[]> {
  return invoke<RestoredVault[]>('restore_backup', { path, password })
}

/** اسم مقترح لملف النسخة: DataCenter-backup-YYYYMMDD-HHmm.dcbackup */
export function suggestBackupFileName(now = new Date()): string {
  const p = (n: number, l = 2) => String(n).padStart(l, '0')
  return `DataCenter-backup-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.dcbackup`
}

export function formatDateTime(tsSeconds: number, locale: string): string {
  try {
    return new Date(tsSeconds * 1000).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return ''
  }
}
