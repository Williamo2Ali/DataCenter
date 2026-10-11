import { useEffect, useRef, useState } from 'react'
import { Download, Eye, EyeOff, FileText, FolderOpen, Image as ImageIcon, Lock, Plus, Save, Trash2, Unlock, Upload } from 'lucide-react'
import { VaultSession } from './vaultService'
import BackupPanel from './BackupPanel'
import { formatBytes } from './types'
import { isNative, readVaultFile, revealVaultFile, toSafeVaultFileName, uniqueVaultPath, vaultsDir, verifyAndDeleteVaultFile, writeSecureVaultFile, writeVaultFile } from './nativeVaultFiles'
import { deleteStoredVault, getStoredRecord, listStoredVaults, newVaultId, saveStoredVault, type StoredVaultMeta } from './vaultStore'
import { useLanguage } from '../language/LanguageContext'
import { ClearTextInput } from '../components/ClearTextInput'
import { Tooltip } from '../components/Tooltip'
import { open, save } from '@tauri-apps/plugin-dialog'
import { downloadDir, join } from '@tauri-apps/api/path'
import { readFile, writeFile } from '@tauri-apps/plugin-fs'

const NATIVE = isNative()

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function formatDate(ts: number, locale: string): string {
  try {
    return new Date(ts).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return ''
  }
}

/** حوار حفظ أصلي (ويندوز) — يعيد المسار المختار أو null عند الإلغاء. */
async function nativeSaveDialog(fileName: string, filterLabel: string): Promise<string | null> {
  const defaultPath = await join(await downloadDir(), fileName)
  return save({ defaultPath, filters: [{ name: filterLabel, extensions: ['vault'] }] })
}

/** حوار فتح ملف .vault أصلي (ويندوز). */
async function nativeOpenDialog(filterLabel: string): Promise<string | null> {
  const picked = await open({ multiple: false, directory: false, filters: [{ name: filterLabel, extensions: ['vault'] }] })
  return typeof picked === 'string' ? picked : null
}

export default function VaultPanel() {
  const { t, lang } = useLanguage()
  const [registry, setRegistry] = useState<StoredVaultMeta[]>([])
  const [registryLoading, setRegistryLoading] = useState(true)

  const [currentId, setCurrentId] = useState<string | null>(null)
  const [currentName, setCurrentName] = useState('')
  const [currentPath, setCurrentPath] = useState<string | null>(null)
  const [currentFileName, setCurrentFileName] = useState('')
  const [session, setSession] = useState<VaultSession | null>(null)

  const [vaultName, setVaultName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [openTarget, setOpenTarget] = useState<StoredVaultMeta | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<StoredVaultMeta | null>(null)
  const [deletePassword, setDeletePassword] = useState('')
  const [importBlob, setImportBlob] = useState<ArrayBuffer | null>(null)
  const [importFileName, setImportFileName] = useState('')

  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [previewName, setPreviewName] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const importFileRef = useRef<HTMLInputElement>(null)
  const addFileRef = useRef<HTMLInputElement>(null)
  const openPassRef = useRef<HTMLInputElement>(null)
  const deletePassRef = useRef<HTMLInputElement>(null)

  const isOpen = session !== null
  const files = session?.list() ?? []
  const previewEntry = previewName ? (session?.get(previewName) ?? null) : null

  const refreshRegistry = async () => {
    setRegistryLoading(true)
    try {
      setRegistry(await listStoredVaults())
    } catch (e) {
      setError(e instanceof Error ? e.message : t('vaultPanel.loadRegistryError'))
    } finally {
      setRegistryLoading(false)
    }
  }

  useEffect(() => {
    void refreshRegistry()
  }, [])

  useEffect(() => {
    if (!previewEntry) {
      setPreviewUrl(null)
      return
    }
    const blob = new Blob([previewEntry.data as unknown as BlobPart], { type: previewEntry.mime })
    const url = URL.createObjectURL(blob)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [previewName, version]) // eslint-disable-line react-hooks/exhaustive-deps

  const clearGate = () => {
    setVaultName('')
    setPassword('')
    setConfirm('')
    setError('')
    setOpenTarget(null)
    setDeleteTarget(null)
    setDeletePassword('')
    setImportBlob(null)
    setImportFileName('')
  }

  const enterSession = (id: string, name: string, fileName: string, fullPath: string | null, next: VaultSession) => {
    setCurrentId(id)
    setCurrentName(name)
    setCurrentFileName(fileName)
    setCurrentPath(fullPath)
    setSession(next)
    setPreviewName(null)
    setVersion((v) => v + 1)
    clearGate()
  }

  // ——— إنشاء حاوية جديدة: ملف .vault حقيقي بمسار معلوم ———
  const handleCreate = async () => {
    setError('')
    setNotice('')
    const name = vaultName.trim()
    if (!name) {
      setError(t('vaultPanel.nameRequiredError'))
      return
    }
    if (password.length < 4) {
      setError(t('vaultPanel.shortPassError'))
      return
    }
    if (password !== confirm) {
      setError(t('vaultPanel.passwordMismatchError'))
      return
    }
    setBusy(true)
    try {
      const next = await VaultSession.create(password)
      const id = newVaultId()
      if (NATIVE) {
        const dir = await vaultsDir()
        const fileName = toSafeVaultFileName(name)
        const { fileName: finalName, fullPath } = await uniqueVaultPath(dir, fileName)
        const blob = await next.save()
        const size = await writeSecureVaultFile(fullPath, blob)
        await saveStoredVault({ id, name, fileName: finalName, fullPath, size, updatedAt: Date.now() })
        enterSession(id, name, finalName, fullPath, next)
        setNotice(t('vaultPanel.createdFileNotice', { fileName: finalName }))
      } else {
        const blob = await next.save()
        const fileName = toSafeVaultFileName(name)
        await saveStoredVault({ id, name, fileName, fullPath: null, size: blob.byteLength, updatedAt: Date.now(), blob })
        enterSession(id, name, fileName, null, next)
        setNotice(t('vaultPanel.createdNotice', { name }))
      }
      await refreshRegistry()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('vaultPanel.createError'))
    } finally {
      setBusy(false)
    }
  }

  // ——— فتح حاوية من السجل ———
  const handleOpenStored = async () => {
    setError('')
    setNotice('')
    if (!openTarget) {
      setError(t('vaultPanel.pickStoredFirstError'))
      return
    }
    if (!password) {
      setError(t('vaultPanel.enterVaultPassError'))
      return
    }
    setBusy(true)
    try {
      const record = await getStoredRecord(openTarget.id)
      let next: VaultSession
      if (NATIVE && record.fullPath) {
        const blob = await readVaultFile(record.fullPath)
        next = await VaultSession.open(blob, password)
        enterSession(record.id, record.name, record.fileName, record.fullPath, next)
      } else if (record.blob) {
        next = await VaultSession.open(record.blob, password)
        if (NATIVE) {
          // ترحيل تلقائي: سجل داخلي قديم → ملف حقيقي
          const dir = await vaultsDir()
          const { fileName, fullPath } = await uniqueVaultPath(dir, toSafeVaultFileName(record.name))
          const fresh = await next.save()
          await writeSecureVaultFile(fullPath, fresh)
          await saveStoredVault({ ...record, fileName, fullPath, size: fresh.byteLength, blob: undefined })
          enterSession(record.id, record.name, fileName, fullPath, next)
          setNotice(t('vaultPanel.migratedNotice'))
        } else {
          enterSession(record.id, record.name, record.fileName, null, next)
        }
      } else {
        throw new Error(t('vaultPanel.missingMetadataError'))
      }
      await refreshRegistry()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('vaultPanel.openError'))
    } finally {
      setBusy(false)
    }
  }

  // ——— استيراد ملف .vault إلى مجلد الحاويات ———
  const handleNativeImportPick = async () => {
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const picked = await nativeOpenDialog(t('vaultPanel.encryptedVaultFilter'))
      if (!picked) return
      const data = await readFile(picked)
      const out = new Uint8Array(data.byteLength)
      out.set(data)
      setImportBlob(out.buffer as ArrayBuffer)
      const base = picked.split(/[\\/]/).pop() ?? picked
      setImportFileName(base)
      if (!vaultName.trim()) setVaultName(base.replace(/\.vault$/i, ''))
    } catch {
      setError(t('vaultPanel.readError'))
    } finally {
      setBusy(false)
    }
  }

  const handleImportPickedLegacy = async (file: File) => {
    setError('')
    setBusy(true)
    try {
      setImportBlob(await file.arrayBuffer())
      setImportFileName(file.name)
      if (!vaultName.trim()) setVaultName(file.name.replace(/\.vault$/i, ''))
    } catch {
      setError(t('vaultPanel.readError'))
    } finally {
      setBusy(false)
    }
  }

  const handleImportOpen = async () => {
    setError('')
    setNotice('')
    if (!importBlob) {
      setError(t('vaultPanel.pickImportFileError'))
      return
    }
    const name = vaultName.trim() || importFileName.replace(/\.vault$/i, '') || t('vaultPanel.defaultImportName')
    if (!password) {
      setError(t('vaultPanel.enterVaultPassError'))
      return
    }
    setBusy(true)
    try {
      const next = await VaultSession.open(importBlob, password)
      const id = newVaultId()
      if (NATIVE) {
        const dir = await vaultsDir()
        const { fileName, fullPath } = await uniqueVaultPath(dir, toSafeVaultFileName(name))
        await writeSecureVaultFile(fullPath, importBlob)
        await saveStoredVault({ id, name, fileName, fullPath, size: importBlob.byteLength, updatedAt: Date.now() })
        enterSession(id, name, fileName, fullPath, next)
      } else {
        const fileName = toSafeVaultFileName(name)
        await saveStoredVault({ id, name, fileName, fullPath: null, size: importBlob.byteLength, updatedAt: Date.now(), blob: importBlob })
        enterSession(id, name, fileName, null, next)
      }
      await refreshRegistry()
      setNotice(t('vaultPanel.importedNotice', { name }))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('vaultPanel.openVaultError'))
    } finally {
      setBusy(false)
    }
  }

  // ——— عمليات داخل الجلسة ———
  const handleAddPicked = async (picked: FileList | null) => {
    if (!session || !picked || picked.length === 0) return
    setError('')
    setNotice('')
    setBusy(true)
    try {
      await session.addFiles([...picked])
      setVersion((v) => v + 1)
      setNotice(t('vaultPanel.filesAddedNotice'))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('vaultPanel.addFilesError'))
    } finally {
      setBusy(false)
      if (addFileRef.current) addFileRef.current.value = ''
    }
  }

  const handleDeleteEntry = (name: string) => {
    if (!session) return
    if (!window.confirm(t('vaultPanel.deleteEntryConfirm', { name }))) return
    session.remove(name)
    if (previewName === name) setPreviewName(null)
    setVersion((v) => v + 1)
  }

  const handleDownloadEntry = (name: string) => {
    const entry = session?.get(name)
    if (!entry) return
    downloadBlob(new Blob([entry.data as unknown as BlobPart], { type: entry.mime }), entry.name)
  }

  const handlePersist = async () => {
    if (!session || !currentId) return
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const blob = await session.save()
      if (NATIVE && currentPath) {
        const size = await writeVaultFile(currentPath, blob)
        await saveStoredVault({ id: currentId, name: currentName, fileName: currentFileName, fullPath: currentPath, size, updatedAt: Date.now() })
      } else {
        await saveStoredVault({ id: currentId, name: currentName, fileName: currentFileName, fullPath: null, size: blob.byteLength, updatedAt: Date.now(), blob })
      }
      setVersion((v) => v + 1)
      await refreshRegistry()
      setNotice(t('vaultPanel.savedNotice', { name: currentName }))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('vaultPanel.saveError'))
    } finally {
      setBusy(false)
    }
  }

  const handleExportCurrent = async () => {
    if (!session) return
    setError('')
    setBusy(true)
    try {
      const blob = await session.save()
      if (NATIVE) {
        const target = await nativeSaveDialog(currentFileName || 'vault.vault', t('vaultPanel.encryptedVaultFilter'))
        if (!target) return
        await writeFile(target, new Uint8Array(blob))
        setNotice(t('vaultPanel.exportedToPathNotice'))
      } else {
        downloadBlob(new Blob([blob], { type: 'application/octet-stream' }), currentFileName || 'vault.vault')
        setNotice(t('vaultPanel.downloadedNotice'))
      }
      setVersion((v) => v + 1)
      await refreshRegistry()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('vaultPanel.exportError'))
    } finally {
      setBusy(false)
    }
  }

  const handleExportStored = async (meta: StoredVaultMeta) => {
    setError('')
    try {
      if (NATIVE && meta.fullPath) {
        const blob = await readVaultFile(meta.fullPath)
        const target = await nativeSaveDialog(meta.fileName, t('vaultPanel.encryptedVaultFilter'))
        if (!target) return
        await writeFile(target, new Uint8Array(blob))
      } else {
        const record = await getStoredRecord(meta.id)
        if (!record.blob) throw new Error(t('vaultPanel.missingExportError'))
        downloadBlob(new Blob([record.blob], { type: 'application/octet-stream' }), meta.fileName)
      }
      setNotice(t('vaultPanel.exportedNotice', { name: meta.name }))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('vaultPanel.exportError'))
    }
  }

  const handleReveal = async (meta: StoredVaultMeta) => {
    setError('')
    try {
      if (!meta.fullPath) throw new Error(t('vaultPanel.oldVaultError'))
      await revealVaultFile(meta.fullPath)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('vaultPanel.pathError'))
    }
  }

  /** الحذف النهائي المشروط بكلمة المرور: Rust يتحقق بالفك الفعلي أولاً،
   *  ثم يزيل منع الحذف ويحذف الملف — كلمة خاطئة لا تمس أي شيء. */
  const handleConfirmDelete = async () => {
    const meta = deleteTarget
    setError('')
    setNotice('')
    if (!meta) return
    if (!deletePassword) {
      setError(t('vaultPanel.deletePassRequiredError'))
      return
    }
    setBusy(true)
    try {
      const record = await getStoredRecord(meta.id)
      if (NATIVE && record.fullPath) {
        await verifyAndDeleteVaultFile(record.fullPath, deletePassword)
      } else if (record.blob) {
        await VaultSession.open(record.blob, deletePassword) // تحقق فقط
      }
      // else: سجل يتيم بلا ملف ولا محتوى — يُحذف سجله فقط
      await deleteStoredVault(meta.id)
      if (openTarget?.id === meta.id) {
        setOpenTarget(null)
        setPassword('')
      }
      if (currentId === meta.id) {
        session?.clearPassword()
        setSession(null)
        setCurrentId(null)
        setCurrentName('')
        setCurrentPath(null)
        setCurrentFileName('')
        setPreviewName(null)
      }
      setDeleteTarget(null)
      setDeletePassword('')
      await refreshRegistry()
      setNotice(t('vaultPanel.deletedNotice', { name: meta.name }))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('vaultPanel.deleteError'))
    } finally {
      setBusy(false)
    }
  }

  const askDelete = (meta: StoredVaultMeta) => {
    setDeleteTarget(meta)
    setDeletePassword('')
    setError('')
    setNotice('')
    window.setTimeout(() => deletePassRef.current?.focus(), 50)
  }

  /** حذف الحاوية المفتوحة حالياً: قفل الجلسة ثم طلب كلمة المرور للتأكيد. */
  const handleDeleteCurrent = () => {
    const meta = registry.find((r) => r.id === currentId)
    if (!meta) {
      setError(t('vaultPanel.currentNotInRegistryError'))
      return
    }
    if (session?.isDirty() && !window.confirm(t('vaultPanel.unsavedChangesDeleteConfirm'))) return
    session?.clearPassword()
    setSession(null)
    setCurrentId(null)
    setCurrentName('')
    setCurrentPath(null)
    setCurrentFileName('')
    setPreviewName(null)
    clearGate()
    setNotice('')
    askDelete(meta)
  }

  const handleLock = () => {
    if (session?.isDirty() && !window.confirm(t('vaultPanel.unsavedChangesLockConfirm'))) return
    session?.clearPassword()
    setSession(null)
    setCurrentId(null)
    setCurrentName('')
    setCurrentPath(null)
    setCurrentFileName('')
    setPreviewName(null)
    clearGate()
    setNotice('')
  }

  // ================= شاشة السجل والبوابة =================
  if (!isOpen) {
    return (
      <section className="vault-panel" aria-labelledby="vault-title">
        <header className="vault-heading">
          <div>
            <p className="record-kicker">{t('vaultPanel.kickerEncrypted')}</p>
            <h2 id="vault-title">{t('vaultPanel.titleEncrypted')}</h2>
            <p className="vault-sub">{NATIVE ? t('vaultPanel.subEncryptedNative') : t('vaultPanel.subEncryptedWeb')}</p>
          </div>
          <span className="vault-lock-badge"><Lock size={16} /></span>
        </header>

        <div className="vault-registry">
          <h3>{t('vaultPanel.myVaultsTitle', { count: registry.length })}</h3>
          {registryLoading && <p className="vault-empty">{t('vaultPanel.loadingRegistry')}</p>}
          {!registryLoading && registry.length === 0 && (
            <p className="vault-empty">{t('vaultPanel.emptyRegistry')}</p>
          )}
          {registry.map((meta) => (
            <div key={meta.id} className={`vault-item vault-reg${openTarget?.id === meta.id ? ' is-active' : ''}`}>
              <span className="vault-item-icon"><Lock size={16} /></span>
              <span className="vault-item-copy">
                <span className="vault-item-title" dir="auto">{meta.name}</span>
                <span className="vault-item-meta">{formatBytes(meta.size)} · {formatDate(meta.updatedAt, lang)}</span>
                <Tooltip content={meta.fullPath ?? t('vaultPanel.internalVaultTitle')}><span className="vault-path" dir="ltr">{meta.fullPath ?? t('vaultPanel.internalVault')}</span></Tooltip>
                <Tooltip content={t('vaultPanel.fullFileNameTitle')}><span className="vault-path" dir="ltr">{meta.fileName}</span></Tooltip>
              </span>
              <span className="vault-row-actions">
                <button
                  type="button"
                  className="vault-secondary vault-small"
                  onClick={() => {
                    setOpenTarget(meta)
                    setError('')
                    setNotice('')
                    window.setTimeout(() => openPassRef.current?.focus(), 50)
                  }}
                >
                  <Unlock size={14} /> {t('vaultPanel.openBtn')}
                </button>
                {NATIVE && meta.fullPath && (
                  <Tooltip content={t('vaultPanel.revealTooltip')}>
                    <button type="button" className="viewer-icon-button" aria-label={t('vaultPanel.revealAria', { name: meta.name })} onClick={() => void handleReveal(meta)}>
                      <FolderOpen size={15} />
                    </button>
                  </Tooltip>
                )}
                <Tooltip content={t('vaultPanel.exportTooltip')}>
                  <button type="button" className="viewer-icon-button" aria-label={t('vaultPanel.exportAria', { name: meta.name })} onClick={() => void handleExportStored(meta)}>
                    <Download size={15} />
                  </button>
                </Tooltip>
                <Tooltip content={t('vaultPanel.deleteTooltip')} tone="danger">
                  <button type="button" className="viewer-icon-button vault-danger" aria-label={t('vaultPanel.deleteAria', { name: meta.name })} onClick={() => askDelete(meta)}>
                    <Trash2 size={15} />
                  </button>
                </Tooltip>
              </span>
            </div>
          ))}

          {openTarget && (
            <div className="vault-inline-pass">
              <label className="vault-label" htmlFor="vault-open-pass">{t('vaultPanel.openPassLabel', { name: openTarget.name })}</label>
              <div className="vault-pass-row">
                <input
                  id="vault-open-pass"
                  ref={openPassRef}
                  className="vault-input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  dir="ltr"
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleOpenStored()
                  }}
                  placeholder={t('vaultPanel.openPassPlaceholder')}
                />
                <Tooltip content={showPassword ? t('vaultPanel.hide') : t('vaultPanel.show')}>
                  <button type="button" className="account-action" onClick={() => setShowPassword((v) => !v)}>
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </Tooltip>
              </div>
              <button type="button" className="vault-primary" disabled={busy} onClick={() => void handleOpenStored()}>
                <Unlock size={15} /> {t('vaultPanel.decryptBtn')}
              </button>
            </div>
          )}

          {deleteTarget && (
            <div className="vault-delete-box" role="alertdialog" aria-label={t('vaultPanel.deleteConfirmAria')}>
              <h4>{t('vaultPanel.deleteConfirmTitle', { name: deleteTarget.name })}</h4>
              <p>{t('vaultPanel.deleteConfirmDesc')}</p>
              <label className="vault-label" htmlFor="vault-delete-pass">{t('vaultPanel.deletePassLabel')}</label>
              <div className="vault-pass-row">
                <input
                  id="vault-delete-pass"
                  ref={deletePassRef}
                  className="vault-input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={deletePassword}
                  dir="ltr"
                  onChange={(e) => setDeletePassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleConfirmDelete()
                  }}
                  placeholder={t('vaultPanel.deletePassPlaceholder')}
                />
                <Tooltip content={showPassword ? t('vaultPanel.hide') : t('vaultPanel.show')}>
                  <button type="button" className="account-action" onClick={() => setShowPassword((v) => !v)}>
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </Tooltip>
              </div>
              <div className="vault-delete-actions">
                <button type="button" className="vault-confirm-delete" disabled={busy} onClick={() => void handleConfirmDelete()}>
                  <Trash2 size={15} /> {t('vaultPanel.confirmDeleteBtn')}
                </button>
                <button type="button" className="vault-secondary" disabled={busy} onClick={() => { setDeleteTarget(null); setDeletePassword(''); setError('') }}>
                  {t('vaultPanel.cancelBtn')}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="vault-gate">
          <div className="vault-gate-card">
            <h3>{t('vaultPanel.createCardTitle')}</h3>
            <p>{t('vaultPanel.createCardDesc')}</p>
            <label className="vault-label" htmlFor="vault-new-name">{t('vaultPanel.newNameLabel')}</label>
            <ClearTextInput id="vault-new-name" className="vault-input" type="text" value={vaultName} onChange={(e) => setVaultName(e.target.value)} placeholder={t('vaultPanel.newNamePlaceholder')} dir="auto" />
            <label className="vault-label" htmlFor="vault-new-pass">{t('vaultPanel.newPassLabel')}</label>
            <div className="vault-pass-row">
              <input id="vault-new-pass" className="vault-input" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('vaultPanel.newPassPlaceholder')} dir="ltr" />
              <Tooltip content={showPassword ? t('vaultPanel.hide') : t('vaultPanel.show')}><button type="button" className="account-action" onClick={() => setShowPassword((v) => !v)}>{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button></Tooltip>
            </div>
            <label className="vault-label" htmlFor="vault-new-confirm">{t('vaultPanel.confirmPassLabel')}</label>
            <ClearTextInput id="vault-new-confirm" className="vault-input" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={t('vaultPanel.confirmPassPlaceholder')} dir="ltr" />
            <button type="button" className="vault-primary" disabled={busy} onClick={() => void handleCreate()}><Plus size={15} /> {t('vaultPanel.createVaultBtn')}</button>
          </div>

          <div className="vault-gate-card">
            <h3>{t('vaultPanel.importCardTitle')}</h3>
            <p>{t('vaultPanel.importCardDesc')}</p>
            {!NATIVE && <input ref={importFileRef} type="file" accept=".vault,application/octet-stream" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImportPickedLegacy(f) }} />}
            <button type="button" className="vault-secondary" disabled={busy} onClick={() => { if (NATIVE) void handleNativeImportPick(); else importFileRef.current?.click() }}>
              <Upload size={15} /> {importFileName || t('vaultPanel.pickFileBtn')}
            </button>
            {importBlob && (
              <>
                <label className="vault-label" htmlFor="vault-import-name">{t('vaultPanel.importNameLabel')}</label>
                <ClearTextInput id="vault-import-name" className="vault-input" type="text" value={vaultName} onChange={(e) => setVaultName(e.target.value)} dir="auto" />
                <label className="vault-label" htmlFor="vault-import-pass">{t('vaultPanel.importPassLabel')}</label>
                <ClearTextInput id="vault-import-pass" className="vault-input" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('vaultPanel.importPassPlaceholder')} dir="ltr" />
                <button type="button" className="vault-primary" disabled={busy} onClick={() => void handleImportOpen()}><Unlock size={15} /> {t('vaultPanel.importOpenBtn')}</button>
              </>
            )}
          </div>
        </div>

        {error && <p className="vault-error" role="alert">{error}</p>}
        {notice && <p className="vault-notice" role="status">{notice}</p>}
        <p className="vault-hint">{t('vaultPanel.securityHint')}</p>

        <div className="vault-backup-wrap">
          <BackupPanel onRegistryChanged={() => void refreshRegistry()} />
        </div>
      </section>
    )
  }

  // ================= شاشة المحتويات (مفتوحة) =================
  return (
    <section className="vault-panel" aria-labelledby="vault-title">
      <header className="vault-heading">
        <div>
          <p className="record-kicker">{t('vaultPanel.memoryOpenKicker', { status: session?.isDirty() ? t('vaultPanel.statusDirty') : t('vaultPanel.statusSaved') })}</p>
          <h2 id="vault-title" dir="auto">{currentName} ({files.length})</h2>
          <p className="vault-sub">{t('vaultPanel.totalSize', { size: formatBytes(session?.totalSize() ?? 0) })}</p>
          {currentPath && <Tooltip content={currentPath}><p className="vault-path" dir="ltr">{currentPath}</p></Tooltip>}
        </div>
        <div className="vault-actions">
          <input ref={addFileRef} type="file" multiple hidden accept="image/*,application/pdf" onChange={(e) => void handleAddPicked(e.target.files)} />
          <button type="button" className="vault-secondary" disabled={busy} onClick={() => addFileRef.current?.click()}><Plus size={15} /> {t('vaultPanel.addFileBtn')}</button>
          <button type="button" className="vault-primary" disabled={busy} onClick={() => void handlePersist()}><Save size={15} /> {t('vaultPanel.saveBtn')}</button>
          <button type="button" className="vault-secondary" disabled={busy} onClick={() => void handleExportCurrent()}><Download size={15} /> {t('vaultPanel.exportBtn')}</button>
          {NATIVE && currentPath && (
            <button type="button" className="vault-secondary" disabled={busy} onClick={() => { if (currentPath) void revealVaultFile(currentPath).catch((e: unknown) => setError(e instanceof Error ? e.message : t('vaultPanel.pathOpenError'))) }}>
              <FolderOpen size={15} /> {t('vaultPanel.pathBtn')}
            </button>
          )}
          <button type="button" className="vault-ghost" disabled={busy} onClick={handleLock}><Lock size={15} /> {t('vaultPanel.lockBtn')}</button>
          <button type="button" className="vault-ghost-danger" disabled={busy} onClick={handleDeleteCurrent}><Trash2 size={15} /> {t('vaultPanel.deleteFinalBtn')}</button>
        </div>
      </header>

      {error && <p className="vault-error" role="alert">{error}</p>}
      {notice && <p className="vault-notice" role="status">{notice}</p>}

      <div className="vault-body">
        <div className="vault-list" role="list" aria-label={t('vaultPanel.filesListAria')}>
          {files.length === 0 && <p className="vault-empty">{t('vaultPanel.emptyVault')}</p>}
          {files.map((f) => {
            const isImage = f.mime.startsWith('image/')
            const isPdf = f.mime === 'application/pdf'
            return (
              <div key={f.name} role="listitem" className={`vault-item${previewName === f.name ? ' is-active' : ''}`}>
                <span className="vault-item-icon">{isImage ? <ImageIcon size={17} /> : isPdf ? <FileText size={17} /> : <FileText size={17} />}</span>
                <span className="vault-item-copy">
                  <span className="vault-item-title" dir="auto">{f.name}</span>
                  <span className="vault-item-meta">{formatBytes(f.size)}</span>
                </span>
                <Tooltip content={t('vaultPanel.previewTooltip')}><button type="button" className="viewer-icon-button" aria-label={t('vaultPanel.previewAria', { name: f.name })} onClick={() => setPreviewName(f.name)}><Eye size={15} /></button></Tooltip>
                <Tooltip content={t('vaultPanel.downloadTooltip')}><button type="button" className="viewer-icon-button" aria-label={t('vaultPanel.downloadAria', { name: f.name })} onClick={() => handleDownloadEntry(f.name)}><Download size={15} /></button></Tooltip>
                <Tooltip content={t('vaultPanel.deleteEntryTooltip')} tone="danger"><button type="button" className="viewer-icon-button vault-danger" aria-label={t('vaultPanel.deleteEntryAria', { name: f.name })} onClick={() => handleDeleteEntry(f.name)}><Trash2 size={15} /></button></Tooltip>
              </div>
            )
          })}
        </div>

        <div className="vault-preview" aria-live="polite">
          {!previewEntry && <p className="vault-empty">{t('vaultPanel.emptyPreview')}</p>}
          {previewEntry && previewUrl && previewEntry.mime.startsWith('image/') && (
            <figure className="vault-preview-figure">
              <img src={previewUrl} alt={previewEntry.name} />
              <figcaption dir="auto">{previewEntry.name} · {formatBytes(previewEntry.size)}</figcaption>
            </figure>
          )}
          {previewEntry && previewUrl && previewEntry.mime === 'application/pdf' && (
            <iframe title={previewEntry.name} src={previewUrl} className="vault-preview-pdf" />
          )}
          {previewEntry && !previewEntry.mime.startsWith('image/') && previewEntry.mime !== 'application/pdf' && (
            <p className="vault-empty">{t('vaultPanel.noPreview')}</p>
          )}
        </div>
      </div>
    </section>
  )
}
