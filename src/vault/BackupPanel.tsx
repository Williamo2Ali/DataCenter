import { useState } from 'react'
import { ArchiveRestore, Download, Eye, EyeOff, FolderOpen, PackagePlus } from 'lucide-react'
import { createBackup, formatDateTime, inspectBackup, restoreBackup, suggestBackupFileName, type BackupInfo } from './backupService'
import { formatBytes } from './types'
import { newVaultId, saveStoredVault } from './vaultStore'
import { useLanguage } from '../language/LanguageContext'
import { ClearTextInput } from '../components/ClearTextInput'
import { Tooltip } from '../components/Tooltip'
import { open, save } from '@tauri-apps/plugin-dialog'
import { downloadDir, join } from '@tauri-apps/api/path'

type Props = {
  onRegistryChanged: () => void | Promise<void>
}

/**
 * النسخ الاحتياطي اليدوي والاستعادة — يعمل على ويندوز وأندرويد.
 * لا شيء تلقائي: كل عملية بضغطة زر صريحة من المستخدم.
 */
export default function BackupPanel({ onRegistryChanged }: Props) {
  const { t, lang } = useLanguage()
  // إنشاء
  const [backupPass, setBackupPass] = useState('')
  const [backupConfirm, setBackupConfirm] = useState('')
  const [showBackupPass, setShowBackupPass] = useState(false)
  // استعادة
  const [restorePath, setRestorePath] = useState('')
  const [restoreFileName, setRestoreFileName] = useState('')
  const [restorePass, setRestorePass] = useState('')
  const [showRestorePass, setShowRestorePass] = useState(false)
  const [inspected, setInspected] = useState<BackupInfo | null>(null)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const pickSaveTarget = async (): Promise<string | null> => {
    const fileName = suggestBackupFileName()
    const defaultPath = await join(await downloadDir(), fileName)
    return save({ defaultPath, filters: [{ name: t('backupPanel.fileFilter'), extensions: ['dcbackup'] }] })
  }

  const pickBackupFile = async (): Promise<{ path: string; fileName: string } | null> => {
    const picked = await open({ multiple: false, directory: false, filters: [{ name: t('backupPanel.fileFilter'), extensions: ['dcbackup'] }] })
    if (typeof picked !== 'string') return null
    const fileName = picked.split(/[\\/]/).pop() ?? picked
    return { path: picked, fileName }
  }

  const handleCreate = async () => {
    setError('')
    setNotice('')
    if (backupPass.length < 4) {
      setError(t('backupPanel.shortPassError'))
      return
    }
    if (backupPass !== backupConfirm) {
      setError(t('backupPanel.passwordMismatchError'))
      return
    }
    setBusy(true)
    try {
      const target = await pickSaveTarget()
      if (!target) return // ألغى المستخدم
      const result = await createBackup(backupPass, target)
      setBackupPass('')
      setBackupConfirm('')
      setNotice(t('backupPanel.createNotice', { count: result.vaultCount, size: formatBytes(result.size), path: result.filePath }))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('backupPanel.createError'))
    } finally {
      setBusy(false)
    }
  }

  const handlePickForRestore = async () => {
    setError('')
    setNotice('')
    setInspected(null)
    setBusy(true)
    try {
      const picked = await pickBackupFile()
      if (!picked) return
      setRestorePath(picked.path)
      setRestoreFileName(picked.fileName)
    } catch {
      setError(t('backupPanel.pickFileError'))
    } finally {
      setBusy(false)
    }
  }

  const handleInspect = async () => {
    setError('')
    setNotice('')
    if (!restorePath) {
      setError(t('backupPanel.selectFileError'))
      return
    }
    if (!restorePass) {
      setError(t('backupPanel.enterPassError'))
      return
    }
    setBusy(true)
    try {
      setInspected(await inspectBackup(restorePath, restorePass))
    } catch (e) {
      setInspected(null)
      setError(e instanceof Error ? e.message : t('backupPanel.inspectError'))
    } finally {
      setBusy(false)
    }
  }

  const handleRestore = async () => {
    setError('')
    setNotice('')
    if (!restorePath || !restorePass || !inspected) return
    if (!window.confirm(t('backupPanel.restoreConfirm', { count: inspected.vaultCount }))) return
    setBusy(true)
    try {
      const restored = await restoreBackup(restorePath, restorePass)
      for (const v of restored) {
        await saveStoredVault({
          id: newVaultId(),
          name: v.name,
          fileName: v.fileName,
          fullPath: v.fullPath,
          size: v.size,
          updatedAt: Date.now(),
        })
      }
      await onRegistryChanged()
      setInspected(null)
      setRestorePath('')
      setRestoreFileName('')
      setRestorePass('')
      setNotice(t('backupPanel.restoreNotice', { count: restored.length }))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('backupPanel.restoreError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="vault-panel" aria-labelledby="backup-title">
      <header className="vault-heading">
        <div>
          <p className="record-kicker">{t('backupPanel.kicker')}</p>
          <h2 id="backup-title">{t('backupPanel.title')}</h2>
          <p className="vault-sub">{t('backupPanel.sub')}</p>
        </div>
      </header>

      {error && <p className="vault-error" role="alert">{error}</p>}
      {notice && <p className="vault-notice" role="status">{notice}</p>}

      <div className="vault-gate">
        <div className="vault-gate-card">
          <h3><PackagePlus size={15} /> {t('backupPanel.createCardTitle')}</h3>
          <p>{t('backupPanel.createCardDesc')}</p>
          <label className="vault-label" htmlFor="backup-pass">{t('backupPanel.backupPassLabel')}</label>
          <div className="vault-pass-row">
            <input id="backup-pass" className="vault-input" type={showBackupPass ? 'text' : 'password'} autoComplete="new-password" value={backupPass} onChange={(e) => setBackupPass(e.target.value)} placeholder={t('backupPanel.backupPassPlaceholder')} dir="ltr" />
            <Tooltip content={showBackupPass ? t('backupPanel.hide') : t('backupPanel.show')}>
              <button type="button" className="account-action" onClick={() => setShowBackupPass((v) => !v)}>
                {showBackupPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </Tooltip>
          </div>
          <label className="vault-label" htmlFor="vault-backup-confirm">{t('backupPanel.confirmPassLabel')}</label>
          <ClearTextInput id="vault-backup-confirm" className="vault-input" type={showBackupPass ? 'text' : 'password'} autoComplete="new-password" value={backupConfirm} onChange={(e) => setBackupConfirm(e.target.value)} placeholder={t('backupPanel.confirmPassPlaceholder')} dir="ltr" />
          <button type="button" className="vault-primary" disabled={busy} onClick={() => void handleCreate()}>
            <Download size={15} /> {t('backupPanel.createBtn')}
          </button>
        </div>

        <div className="vault-gate-card">
          <h3><ArchiveRestore size={15} /> {t('backupPanel.restoreCardTitle')}</h3>
          <p>{t('backupPanel.restoreCardDesc')}</p>
          <button type="button" className="vault-secondary" disabled={busy} onClick={() => void handlePickForRestore()}>
            <FolderOpen size={15} /> {restoreFileName || t('backupPanel.pickBackupBtn')}
          </button>
          {restorePath && (
            <>
              <label className="vault-label" htmlFor="restore-pass">{t('backupPanel.restorePassLabel')}</label>
              <div className="vault-pass-row">
                <input id="restore-pass" className="vault-input" type={showRestorePass ? 'text' : 'password'} autoComplete="current-password" value={restorePass} onChange={(e) => { setRestorePass(e.target.value); setInspected(null) }} placeholder={t('backupPanel.restorePassPlaceholder')} dir="ltr" />
                <Tooltip content={showRestorePass ? t('backupPanel.hide') : t('backupPanel.show')}>
                  <button type="button" className="account-action" onClick={() => setShowRestorePass((v) => !v)}>
                    {showRestorePass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </Tooltip>
              </div>
              <button type="button" className="vault-secondary" disabled={busy} onClick={() => void handleInspect()}>
                <Eye size={15} /> {t('backupPanel.inspectBtn')}
              </button>
            </>
          )}
          {inspected && (
            <div className="vault-inspect">
              <p>{t('backupPanel.inspectInfo', { date: formatDateTime(inspected.createdAt, lang), count: inspected.vaultCount, size: formatBytes(inspected.totalSize) })}</p>
              <ul>
                {inspected.vaults.map((v) => (
                  <li key={v.fileName} dir="auto">{v.name} <span dir="ltr">({v.fileName} · {formatBytes(v.size)})</span></li>
                ))}
              </ul>
              <button type="button" className="vault-primary" disabled={busy} onClick={() => void handleRestore()}>
                <ArchiveRestore size={15} /> {t('backupPanel.restoreNowBtn')}
              </button>
            </div>
          )}
        </div>
      </div>
      <p className="vault-hint">{t('backupPanel.hint')}</p>
    </section>
  )
}
