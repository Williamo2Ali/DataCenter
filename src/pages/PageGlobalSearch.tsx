// صفحة البحث العام عن الأشخاص (فهرس people_index.json — plan/GlobalSearch.md).
// حقل TextSearch (كتابة منفصلة عن المطبَّق) + نتائج (الاسمان + المستودع + فتح).
// المقفل يمر بنافذة كلمة المرور نفسها قبل الفتح.
// أزرار هيدر الموبايل عبر المنطقة المشتركة (كصفحة الحساب): إغلاق X في الطرف ثم ترس الحساب.
import { useEffect, useState, type ReactNode } from 'react'
import { Eye, EyeOff, FolderOpen, LockOpen, Settings, User, X } from 'lucide-react'
import { useToast } from 'react-theme-toast'
import TextSearch from '../components/Custom/TextSearch'
import { MOBILE_BTN } from '../components/AppHeaderMobile'
import { Tooltip } from '../components/Tooltip'
import { useLanguage } from '../language/LanguageContext'
import { recordName } from '../lib/records'
import { listRepos, searchPeopleIndex, verifyRepoPassword, type PeopleHit, type RepoMeta } from '../repos/repoService'

type PageGlobalSearchProps = {
  onClose: () => void
  onOpenAccount: () => void
  onOpenRepo: (repo: RepoMeta, password?: string) => void
  /** أزرار هيدر الموبايل (CommonButtonsArea): تعيش هناك بدل الصفحة. */
  onHeaderActionChange: (node: ReactNode) => void
}

type UnlockState = { repo: RepoMeta; password: string; show: boolean; error: string; busy: boolean } | null

export default function PageGlobalSearch({ onClose, onOpenAccount, onOpenRepo, onHeaderActionChange }: PageGlobalSearchProps) {
  const { t, lang } = useLanguage()
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [applied, setApplied] = useState('')
  const [hits, setHits] = useState<PeopleHit[]>([])
  const [busy, setBusy] = useState(false)
  const [unlock, setUnlock] = useState<UnlockState>(null)

  useEffect(() => {
    onHeaderActionChange(
      <>
        <Tooltip content={t('pageAccountView.closeTitle')} position="bottom">
          <button
            type="button"
            className={MOBILE_BTN}
            aria-label={t('pageAccountView.closeAria')}
            onClick={onClose}
          >
            <X size={19} strokeWidth={1.7} />
          </button>
        </Tooltip>
        <Tooltip content={t('appHeader.account')} position="bottom">
          <button
            type="button"
            className={MOBILE_BTN}
            aria-label={t('appHeader.account')}
            onClick={onOpenAccount}
          >
            <Settings size={19} strokeWidth={1.7} />
          </button>
        </Tooltip>
      </>,
    )
    return () => onHeaderActionChange(null)
  }, [onClose, onOpenAccount, onHeaderActionChange, t])

  const runSearch = (raw: string) => {
    const q = raw.trim()
    setApplied(q)
    if (q === '') {
      setHits([])
      return
    }
    setBusy(true)
    void searchPeopleIndex(q).then(
      (res) => {
        setHits(res)
        setBusy(false)
      },
      () => {
        setHits([])
        setBusy(false)
        toast.error(t('globalSearch.searchError'))
      },
    )
  }

  const openHit = (hit: PeopleHit) => {
    void (async () => {
      try {
        const list = await listRepos()
        const meta = list.find((r) => r.id === hit.repoId)
        if (!meta) {
          toast.error(t('globalSearch.searchError'))
          return
        }
        if (meta.isLocked) {
          setUnlock({ repo: meta, password: '', show: false, error: '', busy: false })
        } else {
          onOpenRepo(meta)
        }
      } catch {
        toast.error(t('globalSearch.searchError'))
      }
    })()
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

  return (
    <section aria-label={t('mobileNav.searchBtn')} className="records-section">
      <TextSearch
        value={query}
        onChange={setQuery}
        onSearch={() => runSearch(query)}
        onClear={() => { setQuery(''); setApplied(''); setHits([]) }}
        searching={applied !== ''}
        placeholder={t('mobileNav.searchBtn')}
        className="w-full"
      />

      {applied === '' ? (
        <p className="vault-empty">{t('globalSearch.hint')}</p>
      ) : busy ? (
        <p className="vault-empty">{t('pageHome.loading')}</p>
      ) : hits.length === 0 ? (
        <p className="vault-empty">{t('globalSearch.empty')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {hits.map((hit, i) => (
            <article key={`${hit.repoId}-${i}`} className="repo-card repo-card--row">
              <div className="repo-card-main">
                <span className="repo-card-icon">
                  <User size={26} strokeWidth={1.7} aria-hidden="true" />
                </span>
                <div className="repo-card-title-wrap">
                  <h3 className="repo-card-name" dir="auto">{recordName(hit, lang)}</h3>
                  <span className="account-sub" dir="auto">{t('globalSearch.inRepo', { name: hit.repoName })}</span>
                </div>
                <span className="repo-head-actions">
                  <Tooltip content={t('pageHome.openRepo')} position="bottom">
                    <button
                      type="button"
                      className="repo-head-btn repo-head-btn--open"
                      aria-label={t('pageHome.openRepo')}
                      onClick={() => openHit(hit)}
                    >
                      <FolderOpen size={18} />
                    </button>
                  </Tooltip>
                </span>
              </div>
            </article>
          ))}
        </div>
      )}

      {unlock && (
        <div className="modal-overlay" onClick={() => setUnlock(null)} role="dialog" aria-modal="true" aria-labelledby="search-unlock-title">
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h2 id="search-unlock-title">{t('pageHome.unlockModalTitle')}<span dir="auto">{unlock.repo.name}</span></h2>
              <Tooltip content={t('pageHome.close')}>
              <button type="button" className="modal-close" onClick={() => setUnlock(null)} aria-label={t('pageHome.close')}>
                <X size={18} />
              </button>
              </Tooltip>
            </header>
            <div className="modal-body">
              {unlock.error && <p className="modal-error" role="alert">{unlock.error}</p>}
              <div className="modal-field">
                <label htmlFor="search-unlock-pass" className="modal-label">{t('pageHome.repoPassLabel')}</label>
                <div className="vault-pass-row">
                  <input
                    id="search-unlock-pass"
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
    </section>
  )
}
