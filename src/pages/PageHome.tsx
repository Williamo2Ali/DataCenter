import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Check, ChevronDown, ChevronUp, Database, Pencil, Plus, Star, Trash2, Lock, LockOpen, RefreshCw, FolderOpen, KeyRound, Eye, EyeOff, X } from 'lucide-react'
import { listRepos, deleteRepo, renameRepo, repoSize, toggleFavorite, verifyRepoPassword, setRepoPassword, lockRepo, type RepoMeta } from '../repos/repoService'
import type { RepoSortMode } from '../lib/appSettings'
import { formatSize } from '../lib/documents'
import ModalCreateRepos from '../modals/ModalCreateRepos'
import ModalMessages from '../modals/ModalMessages'
import { ClearTextInput } from '../components/ClearTextInput'
import { Tooltip } from "../components/Tooltip"
import { useLanguage } from '../language/LanguageContext'

type PageHomeProps = {
  onOpenRepo: (repo: RepoMeta, password?: string) => void
  /** ترتيب العرض من الإعدادات (تبويب عام) — الافتراضي الأقدم. */
  repoSort: RepoSortMode
  /** عرض المفضلة فقط (زر النجمة في الشريط السفلي). */
  favOnly: boolean
}

type UnlockState = { repo: RepoMeta; password: string; show: boolean; error: string; busy: boolean } | null
type DeleteState = { repo: RepoMeta; password: string; show: boolean; error: string; busy: boolean } | null
type LockState = { repo: RepoMeta; mode: 'lock' | 'unlock' | 'change'; current: string; next: string; confirm: string; showNext: boolean; error: string; busy: boolean } | null
type RenameState = { repo: RepoMeta; name: string; password: string; show: boolean; error: string; busy: boolean } | null

function formatDate(tsSeconds: number, locale: string): string {
  try {
    return new Date(tsSeconds * 1000).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return ''
  }
}

export default function PageHome({ onOpenRepo, repoSort, favOnly }: PageHomeProps) {
  const { t, lang } = useLanguage()
  const [repoList, setRepoList] = useState<RepoMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [unlock, setUnlock] = useState<UnlockState>(null)
  const [deleteDialog, setDeleteDialog] = useState<DeleteState>(null)
  const [lockDialog, setLockDialog] = useState<LockState>(null)
  /** تأكيد التحويل المشفر (مودال، لا window.confirm) — بعد جمع الكلمة الجديدة. */
  const [lockConfirm, setLockConfirm] = useState<{ repo: RepoMeta; password: string; busy: boolean; error: string } | null>(null)
  // تغيير اسم العرض — المعرف الفيزيائي ثابت ولا يُمس أي ملف آخر.
  const [renameDialog, setRenameDialog] = useState<RenameState>(null)
  /** البطاقات الموسّعة — الافتراضي مطوية (الأيقونة + الاسم + السهم فقط). */
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())
  /** أحجام المستودعات بالبايت (lazily عند التوسيع — -1 = تعذّر القراءة). */
  const [sizes, setSizes] = useState<Record<string, number>>({})

  const requestSize = (id: string) => {
    setSizes((prev) => {
      if (prev[id] !== undefined) return prev
      void repoSize(id).then(
        (bytes) => setSizes((cur) => ({ ...cur, [id]: bytes })),
        () => setSizes((cur) => ({ ...cur, [id]: -1 })),
      )
      return prev
    })
  }

  const toggleExpanded = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else {
        next.add(id)
        requestSize(id)
      }
      return next
    })
  }

  const sizeText = (id: string): string => {
    const v = sizes[id]
    if (v === undefined) return '…'
    if (v < 0) return '—'
    return formatSize(v)
  }

  const refresh = async () => {
    setLoading(true)
    setError('')
    try {
      const list = await listRepos()
      setRepoList(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('pageHome.loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  // عرض مرتّب حسب إعداد المستخدم — القائمة الأصلية بترتيب الخلفية (الأقدم).
  const sortedRepos = useMemo(() => {
    const list = [...repoList]
    const byName = (a: RepoMeta, b: RepoMeta) => a.name.localeCompare(b.name, lang === 'ar' ? 'ar' : 'en')
    switch (repoSort) {
      case 'newest':
        list.sort((a, b) => b.createdAt - a.createdAt)
        break
      case 'nameAsc':
        list.sort(byName)
        break
      case 'nameDesc':
        list.sort((a, b) => byName(b, a))
        break
      case 'lastUsed':
        list.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt || a.createdAt - b.createdAt)
        break
      case 'mostUsed':
        list.sort((a, b) => b.openCount - a.openCount || b.lastOpenedAt - a.lastOpenedAt)
        break
      case 'favorites':
        list.sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || b.createdAt - a.createdAt)
        break
      case 'oldest':
      default:
        break
    }
    return list
  }, [repoList, repoSort, lang])

  // عرض المفضلة فقط عند تفعيل الفلتر — فوق الترتيب المختار.
  const displayedRepos = favOnly ? sortedRepos.filter((r) => r.isFavorite) : sortedRepos

  const toggleStar = (repo: RepoMeta) => {
    void (async () => {
      try {
        await toggleFavorite(repo.id)
        await refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : t('pageHome.loadError'))
      }
    })()
  }

  const handleCreated = (meta: RepoMeta, password?: string) => {
    setIsCreateModalOpen(false)
    void refresh()
    onOpenRepo(meta, password)
  }

  const askDeleteRepo = (repo: RepoMeta) => {
    // المقفل بكلمة مرور: لا حذف نهائياً دونها — مودال تحقق وتنبيه صريح.
    if (repo.isLocked) {
      setDeleteDialog({ repo, password: '', show: false, error: '', busy: false })
      return
    }
    if (!window.confirm(t('pageHome.confirmDeletePrompt', { repoName: repo.name }))) return
    setError('')
    void (async () => {
      try {
        await deleteRepo(repo.id)
        await refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : t('pageHome.deleteError'))
      }
    })()
  }

  const submitDeleteLocked = async () => {
    if (!deleteDialog || deleteDialog.busy || !deleteDialog.password) return
    setDeleteDialog({ ...deleteDialog, busy: true, error: '' })
    try {
      await deleteRepo(deleteDialog.repo.id, deleteDialog.password)
      setDeleteDialog(null)
      await refresh()
    } catch (e) {
      setDeleteDialog({ ...deleteDialog, busy: false, error: e instanceof Error ? e.message : t('pageHome.deleteError') })
    }
  }

  const submitRename = async () => {
    if (!renameDialog || renameDialog.busy || !renameDialog.name.trim()) return
    // المقفل: لا تعديل — حتى الاسم — دون كلمة المرور.
    if (renameDialog.repo.isLocked && !renameDialog.password) return
    setRenameDialog({ ...renameDialog, busy: true, error: '' })
    try {
      await renameRepo(
        renameDialog.repo.id,
        renameDialog.name.trim(),
        renameDialog.repo.isLocked ? renameDialog.password : undefined,
      )
      setRenameDialog(null)
      await refresh()
    } catch (e) {
      setRenameDialog({ ...renameDialog, busy: false, error: e instanceof Error ? e.message : t('pageHome.renameError') })
    }
  }

  const handleOpenClick = (repo: RepoMeta) => {
    if (repo.isLocked) {
      setUnlock({ repo, password: '', show: false, error: '', busy: false })
    } else {
      onOpenRepo(repo)
    }
  }

  const submitUnlock = async () => {
    if (!unlock || unlock.busy || !unlock.password) return
    setUnlock({ ...unlock, busy: true, error: '' })
    try {
      await verifyRepoPassword(unlock.repo.id, unlock.password)
      const target = unlock.repo
      const pass = unlock.password
      setUnlock(null)
      onOpenRepo(target, pass)
    } catch (e) {
      setUnlock({ ...unlock, busy: false, error: e instanceof Error ? e.message : t('pageHome.unlockError') })
    }
  }

  const openLockDialog = (repo: RepoMeta) => {
    setLockDialog({
      repo,
      mode: repo.isLocked ? 'unlock' : 'lock',
      current: '',
      next: '',
      confirm: '',
      showNext: false,
      error: '',
      busy: false,
    })
  }

  const submitLockDialog = async () => {
    if (!lockDialog || lockDialog.busy) return
    const { repo, mode, current, next, confirm } = lockDialog
    if (mode === 'lock' || mode === 'change') {
      if (next.length < 4) {
        setLockDialog({ ...lockDialog, error: t('pageHome.shortNewPassError') })
        return
      }
      if (next !== confirm) {
        setLockDialog({ ...lockDialog, error: t('pageHome.passwordMismatchError') })
        return
      }
    }
    if ((mode === 'unlock' || mode === 'change') && !current) {
      setLockDialog({ ...lockDialog, error: t('pageHome.enterCurrentPassError') })
      return
    }
    // القفل الجديد تحويل مشفر كامل — يمر بموافقة صريحة أولاً (مودال التأكيد أدناه).
    if (mode === 'lock') {
      setLockConfirm({ repo, password: next, busy: false, error: '' })
      return
    }
    setLockDialog({ ...lockDialog, busy: true, error: '' })
    try {
      const updated = await setRepoPassword(
        repo.id,
        current,
        mode === 'unlock' ? null : next,
      )
      setLockDialog(null)
      await refresh()
      if (updated.isLocked) {
        setUnlock({ repo: updated, password: '', show: false, error: '', busy: false })
      }
    } catch (e) {
      setLockDialog({ ...lockDialog, busy: false, error: e instanceof Error ? e.message : t('pageHome.updateLockError') })
    }
  }

  const submitLockConvert = async () => {
    if (!lockConfirm || lockConfirm.busy) return
    setLockConfirm({ ...lockConfirm, busy: true, error: '' })
    try {
      await lockRepo(lockConfirm.repo.id, lockConfirm.password)
      setLockConfirm(null)
      setLockDialog(null)
      await refresh()
    } catch (e) {
      setLockConfirm({ ...lockConfirm, busy: false, error: e instanceof Error ? e.message : t('pageHome.updateLockError') })
    }
  }

  return (
    <section className="dashboard" aria-label={t('pageHome.dashboardAria')}>
      <header className="dashboard-header">
        <div className="dashboard-title-group">
          <h1 className="dashboard-title">{favOnly ? t('pageHome.favoritesBtn') : t('pageHome.title')}</h1>
          <p className="dashboard-subtitle">
            {displayedRepos.length === 0
              ? t('pageHome.subtitleEmpty')
              : t('pageHome.subtitleCount', {
                  count: displayedRepos.length,
                  countPlural: displayedRepos.length === 1 ? t('pageHome.repoCountPlural1') : t('pageHome.repoCountPlural2'),
                })}
          </p>
        </div>
        <button
          type="button"
          className="btn-create-repo"
          onClick={() => setIsCreateModalOpen(true)}
          aria-label={t('pageHome.createRepoBtn')}
        >
          <Plus size={18} /> {t('pageHome.createRepoBtn')}
        </button>
      </header>

      {loading ? (
        <div className="repo-empty-state">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <div className="spin" style={{ width: '32px', height: '32px', border: '3px solid var(--line)', borderTopColor: 'var(--green)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <p>{t('pageHome.loading')}</p>
          </div>
        </div>
      ) : error ? (
        <div className="repo-empty-state repo-empty-error">
          <p>{error}</p>
          <button type="button" className="vault-secondary vault-small" onClick={() => void refresh()}>
            <RefreshCw size={14} /> {t('pageHome.retry')}
          </button>
        </div>
      ) : repoList.length === 0 ? (
        <div className="repo-empty-state">
          <Database size={48} />
          <p>{t('pageHome.emptyStateTitle')}</p>
          <span>{t('pageHome.emptyStateDesc')}</span>
        </div>
      ) : displayedRepos.length === 0 ? (
        <div className="repo-empty-state">
          <Star size={48} />
          <p>{t('pageHome.favEmptyTitle')}</p>
          <span>{t('pageHome.favEmptyDesc')}</span>
        </div>
      ) : (
        <div className="repos-grid" role="list" aria-label={t('pageHome.reposGridAria')}>
          {displayedRepos.map((repoMeta, index) => (
            <article
              key={repoMeta.id}
              className="repo-card repo-card--row"
              role="listitem"
              style={{ '--i': index } as CSSProperties}
            >
              <div className="repo-card-main">
                <span className={`repo-card-icon${repoMeta.isLocked ? ' is-locked' : ''}`}>
                  {repoMeta.isLocked ? <Lock size={22} /> : <Database size={22} />}
                </span>
                <div className="repo-card-title-wrap">
                  <h3 className="repo-card-name" dir="auto">{repoMeta.name}</h3>
                </div>
                <span className="repo-head-actions">
                <Tooltip content={repoMeta.isFavorite ? t('pageHome.favoriteRemoveTitle') : t('pageHome.favoriteAddTitle')}>
                <button
                  type="button"
                  className="repo-head-btn"
                  aria-label={repoMeta.isFavorite ? t('pageHome.favoriteRemoveTitle') : t('pageHome.favoriteAddTitle')}
                  aria-pressed={repoMeta.isFavorite}
                  onClick={() => toggleStar(repoMeta)}
                >
                  <Star size={18} className={repoMeta.isFavorite ? 'fill-[#eab308] text-[#eab308]' : undefined} />
                </button>
                </Tooltip>
                <Tooltip content={t('pageHome.openRepo')}>
                <button
                  type="button"
                  className="repo-head-btn repo-head-btn--open"
                  aria-label={t('pageHome.openRepo')}
                  onClick={() => handleOpenClick(repoMeta)}
                >
                  <FolderOpen size={18} />
                </button>
                </Tooltip>
                <Tooltip content={expandedIds.has(repoMeta.id) ? t('accountsPanel.collapseDetails') : t('accountsPanel.expandDetails')}>
                <button
                  type="button"
                  className="repo-head-btn"
                  aria-expanded={expandedIds.has(repoMeta.id)}
                  aria-controls={`repo-card-body-${repoMeta.id}`}
                  aria-label={expandedIds.has(repoMeta.id) ? t('accountsPanel.collapseDetails') : t('accountsPanel.expandDetails')}
                  onClick={() => toggleExpanded(repoMeta.id)}
                >
                  {expandedIds.has(repoMeta.id) ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
                </Tooltip>
                </span>
              </div>

              {expandedIds.has(repoMeta.id) && (
              <div id={`repo-card-body-${repoMeta.id}`}>
              <dl className="repo-card-fields">
                <div className="repo-field">
                  <dt>{t('pageHome.createdAt')}</dt>
                  <dd dir="auto">{formatDate(repoMeta.createdAt, lang)}</dd>
                </div>
                <div className="repo-field">
                  <dt>{t('pageHome.statusLabel')}</dt>
                  <dd>{repoMeta.isLocked ? t('pageHome.repoCardLocked') : t('pageHome.repoCardOpen')}</dd>
                </div>
                <div className="repo-field">
                  <dt>{t('pageHome.sizeLabel')}</dt>
                  <dd dir={lang === 'ar' ? 'rtl' : 'ltr'}>{sizeText(repoMeta.id)}</dd>
                </div>
              </dl>

              <div className="repo-card-actions">
                <button
                  type="button"
                  className="repo-open-btn"
                  onClick={() => handleOpenClick(repoMeta)}
                >
                  <FolderOpen size={16} /> {t('pageHome.openRepo')}
                </button>
                <Tooltip content={repoMeta.isLocked ? t('pageHome.lockMgmtTitle') : t('pageHome.lockTitle')}>
                <button
                  type="button"
                  className="repo-action-btn"
                  aria-label={repoMeta.isLocked ? t('pageHome.lockMgmtAria', { repoName: repoMeta.name }) : t('pageHome.lockAria', { repoName: repoMeta.name })}
                  onClick={() => openLockDialog(repoMeta)}
                >
                  <KeyRound size={16} />
                </button>
                </Tooltip>
                <Tooltip content={t('pageHome.renameTitle')}>
                <button
                  type="button"
                  className="repo-action-btn"
                  aria-label={t('pageHome.renameAria', { repoName: repoMeta.name })}
                  onClick={() => setRenameDialog({ repo: repoMeta, name: repoMeta.name, password: '', show: false, error: '', busy: false })}
                >
                  <Pencil size={16} />
                </button>
                </Tooltip>
                <Tooltip content={t('pageHome.deleteRepoTitle')} tone="danger">
                <button
                  type="button"
                  className="repo-action-btn delete"
                  aria-label={t('pageHome.deleteRepoAria', { repoName: repoMeta.name })}
                  onClick={() => askDeleteRepo(repoMeta)}
                >
                  <Trash2 size={16} />
                </button>
                </Tooltip>
              </div>
              </div>
              )}
            </article>
          ))}
        </div>
      )}

      <ModalCreateRepos
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={handleCreated}
      />

      {renameDialog && (
        <div className="modal-overlay" onClick={() => setRenameDialog(null)} role="dialog" aria-modal="true" aria-labelledby="rename-title">
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h2 id="rename-title">{t('pageHome.renameModalTitle')}</h2>
              <Tooltip content={t('pageHome.close')}>
              <button type="button" className="modal-close" onClick={() => setRenameDialog(null)} aria-label={t('pageHome.close')}>
                <X size={18} />
              </button>
              </Tooltip>
            </header>
            <div className="modal-body">
              {renameDialog.error && <p className="modal-error" role="alert">{renameDialog.error}</p>}
              <div className="modal-field">
                <label htmlFor="rename-input" className="modal-label">{t('pageHome.renameLabel')}</label>
                <ClearTextInput
                  id="rename-input"
                  className="modal-input"
                  type="text"
                  value={renameDialog.name}
                  onChange={(e) => setRenameDialog({ ...renameDialog, name: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') void submitRename() }}
                  maxLength={80}
                  dir="auto"
                  autoFocus
                />
                <p className="modal-hint">{t('pageHome.renameHint')}</p>
              </div>
              {renameDialog.repo.isLocked && (
                <div className="modal-field">
                  <label htmlFor="rename-pass" className="modal-label">{t('pageHome.repoPassLabel')}</label>
                  <div className="vault-pass-row">
                    <input
                      id="rename-pass"
                      className="modal-input"
                      type={renameDialog.show ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={renameDialog.password}
                      onChange={(e) => setRenameDialog({ ...renameDialog, password: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') void submitRename() }}
                      placeholder={t('pageHome.unlockPlaceholder')}
                      dir="ltr"
                    />
                    <Tooltip content={renameDialog.show ? t('pageHome.hide') : t('pageHome.show')}>
                    <button
                      type="button"
                      className="account-action"
                      onClick={() => setRenameDialog({ ...renameDialog, show: !renameDialog.show })}
                      aria-label={renameDialog.show ? t('pageHome.hide') : t('pageHome.show')}
                    >
                      {renameDialog.show ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                    </Tooltip>
                  </div>
                  <p className="modal-hint">{t('pageHome.passNotSavedHint')}</p>
                </div>
              )}
            </div>
            <footer className="modal-footer">
              <button type="button" className="modal-btn modal-btn-secondary" onClick={() => setRenameDialog(null)}>{t('pageHome.cancel')}</button>
              <button type="button" className="modal-btn modal-btn-primary" onClick={() => void submitRename()} disabled={renameDialog.busy || !renameDialog.name.trim() || (renameDialog.repo.isLocked && !renameDialog.password)}>
                <Check size={16} /> {t('pageHome.renameConfirm')}
              </button>
            </footer>
          </div>
        </div>
      )}

      {unlock && (
        <div className="modal-overlay" onClick={() => setUnlock(null)} role="dialog" aria-modal="true" aria-labelledby="unlock-title">
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h2 id="unlock-title">{t('pageHome.unlockModalTitle')}<span dir="auto">{unlock.repo.name}</span></h2>
              <Tooltip content={t('pageHome.close')}>
              <button type="button" className="modal-close" onClick={() => setUnlock(null)} aria-label={t('pageHome.close')}>
                <X size={18} />
              </button>
              </Tooltip>
            </header>
            <div className="modal-body">
              {unlock.error && <p className="modal-error" role="alert">{unlock.error}</p>}
              <div className="modal-field">
                <label htmlFor="unlock-pass" className="modal-label">{t('pageHome.repoPassLabel')}</label>
                <div className="vault-pass-row">
                  <input
                    id="unlock-pass"
                    className="modal-input"
                    type={unlock.show ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={unlock.password}
                    onChange={(e) => setUnlock({ ...unlock, password: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') void submitUnlock() }}
                    placeholder={t('pageHome.unlockPlaceholder')}
                    dir="ltr"
                    autoFocus
                  />
                  <Tooltip content={unlock.show ? t('pageHome.hide') : t('pageHome.show')}>
                  <button
                    type="button"
                    className="account-action"
                    onClick={() => setUnlock({ ...unlock, show: !unlock.show })}
                    aria-label={unlock.show ? t('pageHome.hide') : t('pageHome.show')}
                  >
                    {unlock.show ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                  </Tooltip>
                </div>
                <p className="modal-hint">{t('pageHome.passNotSavedHint')}</p>
              </div>
            </div>
            <footer className="modal-footer">
              <button type="button" className="modal-btn modal-btn-secondary" onClick={() => setUnlock(null)}>{t('pageHome.cancel')}</button>
              <button type="button" className="modal-btn modal-btn-primary" onClick={() => void submitUnlock()} disabled={unlock.busy || !unlock.password}>
                <LockOpen size={16} /> {t('pageHome.unlockAndOpen')}
              </button>
            </footer>
          </div>
        </div>
      )}

      {deleteDialog && (
        <div className="modal-overlay" onClick={() => setDeleteDialog(null)} role="dialog" aria-modal="true" aria-labelledby="delete-title">
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h2 id="delete-title">{t('pageHome.deleteModalTitle')}<span dir="auto">{deleteDialog.repo.name}</span></h2>
              <Tooltip content={t('pageHome.close')}>
              <button type="button" className="modal-close" onClick={() => setDeleteDialog(null)} aria-label={t('pageHome.close')}>
                <X size={18} />
              </button>
              </Tooltip>
            </header>
            <div className="modal-body">
              {deleteDialog.error && <p className="modal-error" role="alert">{deleteDialog.error}</p>}
              <div className="vault-delete-box">
                <h4>{t('pageHome.noReturnTitle')}</h4>
                <p>{t('pageHome.noReturnDesc')}</p>
              </div>
              <div className="modal-field">
                <label htmlFor="delete-pass" className="modal-label">{t('pageHome.deletePassLabel')}</label>
                <div className="vault-pass-row">
                  <input
                    id="delete-pass"
                    className="modal-input"
                    type={deleteDialog.show ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={deleteDialog.password}
                    onChange={(e) => setDeleteDialog({ ...deleteDialog, password: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') void submitDeleteLocked() }}
                    placeholder={t('pageHome.unlockPlaceholder')}
                    dir="ltr"
                    autoFocus
                  />
                  <Tooltip content={deleteDialog.show ? t('pageHome.hide') : t('pageHome.show')}>
                  <button
                    type="button"
                    className="account-action"
                    onClick={() => setDeleteDialog({ ...deleteDialog, show: !deleteDialog.show })}
                    aria-label={deleteDialog.show ? t('pageHome.hide') : t('pageHome.show')}
                  >
                    {deleteDialog.show ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                  </Tooltip>
                </div>
              </div>
            </div>
            <footer className="modal-footer">
              <button type="button" className="modal-btn modal-btn-secondary" onClick={() => setDeleteDialog(null)}>{t('pageHome.back')}</button>
              <button type="button" className="modal-btn modal-btn-danger" onClick={() => void submitDeleteLocked()} disabled={deleteDialog.busy || !deleteDialog.password}>
                <Trash2 size={16} /> {t('pageHome.confirmFinalDelete')}
              </button>
            </footer>
          </div>
        </div>
      )}

      {lockDialog && (
        <div className="modal-overlay" onClick={() => setLockDialog(null)} role="dialog" aria-modal="true" aria-labelledby="lock-title">
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h2 id="lock-title">
                {lockDialog.mode === 'lock' && <>{t('pageHome.lockModalLock')}<span dir="auto">{lockDialog.repo.name}</span> {t('pageHome.lockModalLockSuffix')}</>}
                {lockDialog.mode === 'unlock' && <>{t('pageHome.lockModalUnlock')}<span dir="auto">{lockDialog.repo.name}</span></>}
                {lockDialog.mode === 'change' && <>{t('pageHome.lockModalChange')}<span dir="auto">{lockDialog.repo.name}</span></>}
              </h2>
              <Tooltip content={t('pageHome.close')}>
              <button type="button" className="modal-close" onClick={() => setLockDialog(null)} aria-label={t('pageHome.close')}>
                <X size={18} />
              </button>
              </Tooltip>
            </header>
            <div className="modal-body">
              {lockDialog.error && <p className="modal-error" role="alert">{lockDialog.error}</p>}
              <div className="modal-lock-modes" role="group" aria-label={t('pageHome.operationType')}>
                {(lockDialog.repo.isLocked ? (['unlock', 'change'] as const) : (['lock'] as const)).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`modal-chip${lockDialog.mode === m ? ' is-active' : ''}`}
                    onClick={() => setLockDialog({ ...lockDialog, mode: m, error: '' })}
                  >
                    {m === 'lock' ? t('pageHome.newLock') : m === 'unlock' ? t('pageHome.unlockOp') : t('pageHome.changePassOp')}
                  </button>
                ))}
              </div>
              {lockDialog.mode !== 'lock' && (
                <div className="modal-field">
                  <label htmlFor="lock-current" className="modal-label">{t('pageHome.currentPassLabel')}</label>
                  <ClearTextInput
                    id="lock-current"
                    className="modal-input"
                    type="password"
                    autoComplete="current-password"
                    value={lockDialog.current}
                    onChange={(e) => setLockDialog({ ...lockDialog, current: e.target.value })}
                    placeholder={t('pageHome.currentPassPlaceholder')}
                    dir="ltr"
                  />
                </div>
              )}
              {lockDialog.mode !== 'unlock' && (
                <>
                  <div className="modal-field">
                    <label htmlFor="lock-next" className="modal-label">{t('pageHome.newPassLabel')}</label>
                    <div className="vault-pass-row">
                      <input
                        id="lock-next"
                        className="modal-input"
                        type={lockDialog.showNext ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={lockDialog.next}
                        onChange={(e) => setLockDialog({ ...lockDialog, next: e.target.value })}
                        placeholder={t('pageHome.newPassPlaceholder')}
                        dir="ltr"
                      />
                      <Tooltip content={lockDialog.showNext ? t('pageHome.hide') : t('pageHome.show')}>
                      <button
                        type="button"
                        className="account-action"
                        onClick={() => setLockDialog({ ...lockDialog, showNext: !lockDialog.showNext })}
                        aria-label={lockDialog.showNext ? t('pageHome.hide') : t('pageHome.show')}
                      >
                        {lockDialog.showNext ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                      </Tooltip>
                    </div>
                  </div>
                  <div className="modal-field">
                    <label htmlFor="lock-confirm" className="modal-label">{t('pageHome.confirmNewPassLabel')}</label>
                    <ClearTextInput
                      id="lock-confirm"
                      className="modal-input"
                      type={lockDialog.showNext ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={lockDialog.confirm}
                      onChange={(e) => setLockDialog({ ...lockDialog, confirm: e.target.value })}
                      placeholder={t('pageHome.confirmPassPlaceholder')}
                      dir="ltr"
                    />
                  </div>
                </>
              )}
              {lockDialog.mode === 'unlock' && (
                <p className="modal-hint">{t('pageHome.unlockedHint')}</p>
              )}
            </div>
            <footer className="modal-footer">
              <button type="button" className="modal-btn modal-btn-secondary" onClick={() => setLockDialog(null)}>{t('pageHome.cancel')}</button>
              <button type="button" className="modal-btn modal-btn-primary" onClick={() => void submitLockDialog()} disabled={lockDialog.busy}>
                <KeyRound size={16} /> {t('pageHome.confirm')}
              </button>
            </footer>
          </div>
        </div>
      )}

      {lockConfirm && (
        <ModalMessages
          isOpen
          variant="warning"
          title={t('pageHome.lockConvertTitle')}
          message={t('pageHome.lockConvertMsg', { name: lockConfirm.repo.name })}
          details={lockConfirm.error ? <p className="modal-error" role="alert">{lockConfirm.error}</p> : undefined}
          buttons={[
            { id: 'cancel', label: t('pageHome.cancel'), variant: 'secondary', disabled: lockConfirm.busy },
            { id: 'confirm', label: t('pageHome.lockConvertConfirm'), variant: 'danger', closeOnClick: false, disabled: lockConfirm.busy },
          ]}
          onButtonClicked={(info) => {
            if (info.id === 'confirm') void submitLockConvert()
          }}
          onClose={() => {
            if (!lockConfirm.busy) setLockConfirm(null)
          }}
        />
      )}
    </section>
  )
}
