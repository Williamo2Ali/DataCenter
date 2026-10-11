import { useEffect, useRef, useState } from 'react'
import { X, Check, ChevronDown, Loader2, Lock, Eye, EyeOff } from 'lucide-react'
import { createRepo } from '../repos/repoService'
import type { RepoMeta } from '../repos/repoService'
import { useLanguage } from '../language/LanguageContext'
import { ClearTextInput } from '../components/ClearTextInput'
import { Tooltip } from '../components/Tooltip'

type ModalCreateReposProps = {
  isOpen: boolean
  onClose: () => void
  onCreated: (repo: RepoMeta, password?: string) => void
}

export default function ModalCreateRepos({ isOpen, onClose, onCreated }: ModalCreateReposProps) {
  const { t } = useLanguage()
  const [name, setName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [locked, setLocked] = useState(false)
  /** توسيع المجموعة 1 (الاسم/المالك) بعد طيّها التلقائي مع القفل — بلا طي يدوي أبداً. */
  const [idExpanded, setIdExpanded] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  // القالب الافتراضي (افتراضي نعم) أم مستودع فارغ (لمن سيملأ بالاستيراد الذكي).
  const [withDefaults, setWithDefaults] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (isOpen) {
      setName('')
      setLocked(false)
      setPassword('')
      setConfirm('')
      setShowPassword(false)
      setOwnerName('')
      setIdExpanded(false)
      setWithDefaults(true)
      setError('')
      setBusy(false)
      window.requestAnimationFrame(() => inputRef.current?.focus())
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose()
      }
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  /** إلغاء القفل يسحب المجموعة 1 (الاسم/المالك) ويعرضها أعلى الجسم. */
  useEffect(() => {
    if (!locked) {
      setIdExpanded(false)
      bodyRef.current?.scrollTo({ top: 0 })
    }
  }, [locked])

  if (!isOpen) return null

  const passwordError = locked
    ? password.length > 0 && password.length < 4
      ? t('modalCreateRepos.shortPasswordError')
      : confirm.length > 0 && password !== confirm
        ? t('modalCreateRepos.passwordMismatchError')
        : ''
    : ''

  const canSubmit =
    name.trim().length > 0 &&
    ownerName.trim().length > 0 &&
    !busy &&
    (!locked || (password.length >= 4 && password === confirm))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    const owner = ownerName.trim()
    if (!trimmed || !owner || busy) return
    if (locked) {
      if (password.length < 4) {
        setError(t('modalCreateRepos.repoPassShortError'))
        return
      }
      if (password !== confirm) {
        setError(t('modalCreateRepos.passwordMismatchError'))
        return
      }
    }
    setError('')
    setBusy(true)
    try {
      const repo = await createRepo(
        trimmed,
        locked ? password : undefined,
        [owner],
        withDefaults,
      )
      // تمرير الكلمة لجلسة التحرير حتى لا يُطلب فك القفل مجدداً
      onCreated(repo, locked ? password : undefined)
      onClose()
    } catch (err) {
      // رفض invoke يصل نصاً خاماً (Err(String)) لا Error — اعرضه كما هو للتشخيص.
      setError(
        typeof err === 'string' && err.length > 0
          ? err
          : err instanceof Error && err.message
            ? err.message
            : t('modalCreateRepos.defaultCreateError'),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-card create-repo-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2 id="modal-title">{t('modalCreateRepos.title')}</h2>
          <Tooltip content={t('modalCreateRepos.closeAria')}>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            disabled={busy}
            aria-label={t('modalCreateRepos.closeAria')}
          >
            <X size={18} strokeWidth={2} />
          </button>
          </Tooltip>
        </header>
        <form ref={bodyRef} onSubmit={handleSubmit} className="modal-body">
          {error && <p className="modal-error" role="alert">{error}</p>}
          {/* المجموعة 1: الاسم والمالك — تُطوى تلقائياً مع القفل (بلا طي يدوي)، وسهم للأسفل يعرضها. */}
          {(locked && !idExpanded) ? (
            <div className="modal-field">
              <button
                type="button"
                className="modal-btn modal-btn-secondary w-full"
                onClick={() => {
                  // السحب اليدوي يلغي القفل تلقائياً — كلمتا المرور عكس الاسمين دائماً.
                  setIdExpanded(true)
                  setLocked(false)
                }}
                aria-expanded={false}
                aria-label={t('modalCreateRepos.showNamesBtn')}
              >
                <ChevronDown size={16} />
                <span className="min-w-0 flex-1 truncate" dir="auto">
                  {t('modalCreateRepos.showNamesBtn')}
                </span>
              </button>
            </div>
          ) : (
          <>
          <div className="modal-field">
            <label htmlFor="repo-name" className="modal-label">{t('modalCreateRepos.repoNameLabel')}</label>
            <ClearTextInput
              ref={inputRef}
              id="repo-name"
              type="text"
              className="modal-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('modalCreateRepos.repoNamePlaceholder')}
              autoComplete="off"
              disabled={busy}
              maxLength={60}
            />
            <p className="modal-hint">{t('modalCreateRepos.repoNameHint')}</p>
          </div>

          <div className="modal-field">
            <label htmlFor="repo-owner" className="modal-label">{t('modalCreateRepos.ownerNameLabel')}</label>
            <ClearTextInput
              id="repo-owner"
              type="text"
              className="modal-input"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder={t('modalCreateRepos.ownerNamePlaceholder')}
              autoComplete="off"
              disabled={busy}
              maxLength={80}
              dir="auto"
            />
          </div>
          </>
          )}

          {/* المجموعة 2: محتوى المستودع + القفل. */}

          <div className="modal-field">
            <span className="modal-label" id="repo-template-label">{t('modalCreateRepos.templateLabel')}</span>
            <div className="modal-lock-modes" role="group" aria-labelledby="repo-template-label">
              <button
                type="button"
                className={`modal-chip${withDefaults ? ' is-active' : ''}`}
                aria-pressed={withDefaults}
                disabled={busy}
                onClick={() => setWithDefaults(true)}
              >
                {t('modalCreateRepos.templateWith')}
              </button>
              <button
                type="button"
                className={`modal-chip${!withDefaults ? ' is-active' : ''}`}
                aria-pressed={!withDefaults}
                disabled={busy}
                onClick={() => setWithDefaults(false)}
              >
                {t('modalCreateRepos.templateEmpty')}
              </button>
            </div>
            <p className="modal-hint">{t('modalCreateRepos.templateHint')}</p>
          </div>

          <div className="modal-lock-row">
            <Tooltip content={t('modalCreateRepos.lockSwitchAria')}>
            <button
              type="button"
              role="switch"
              aria-checked={locked}
              className={`modal-switch${locked ? ' is-on' : ''}`}
              onClick={() => {
                setLocked((v) => !v)
                setIdExpanded(false)
                setError('')
              }}
              disabled={busy}
              aria-label={t('modalCreateRepos.lockSwitchAria')}
            >
              <span className="modal-switch-knob" />
            </button>
            </Tooltip>
            <span className="modal-lock-copy">
              <span className="modal-lock-title"><Lock size={14} /> {t('modalCreateRepos.lockTitle')}</span>
              <span className="modal-lock-desc">{t('modalCreateRepos.lockDesc')}</span>
            </span>
          </div>

          {locked && (
            /* المجموعة 3: كلمة المرور — العين في الحقلين معاً بنفس الحالة. */
            <div className="modal-pass-grid">
              <div className="modal-field">
                <label htmlFor="repo-pass" className="modal-label">{t('modalCreateRepos.repoPassLabel')}</label>
                <div className="vault-pass-row">
                  <input
                    id="repo-pass"
                    className="modal-input"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('modalCreateRepos.repoPassPlaceholder')}
                    dir="ltr"
                    disabled={busy}
                  />
                  <Tooltip content={showPassword ? t('modalCreateRepos.hidePassAria') : t('modalCreateRepos.showPassAria')}>
                    <button
                      type="button"
                      className="account-action"
                      aria-label={showPassword ? t('modalCreateRepos.hidePassAria') : t('modalCreateRepos.showPassAria')}
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </Tooltip>
                </div>
              </div>
              <div className="modal-field">
                <label htmlFor="repo-pass-confirm" className="modal-label">{t('modalCreateRepos.repoPassConfirmLabel')}</label>
                <div className="vault-pass-row">
                  <input
                    id="repo-pass-confirm"
                    className="modal-input"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder={t('modalCreateRepos.repoPassConfirmPlaceholder')}
                    dir="ltr"
                    disabled={busy}
                  />
                  <Tooltip content={showPassword ? t('modalCreateRepos.hidePassAria') : t('modalCreateRepos.showPassAria')}>
                    <button
                      type="button"
                      className="account-action"
                      aria-label={showPassword ? t('modalCreateRepos.hidePassAria') : t('modalCreateRepos.showPassAria')}
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </Tooltip>
                </div>
              </div>
              {passwordError && <p className="modal-field-error" role="alert">{passwordError}</p>}
            </div>
          )}

        </form>
        <footer className="modal-footer">
          <button type="button" className="modal-btn modal-btn-secondary" onClick={onClose} disabled={busy}>
            {t('modalCreateRepos.cancelBtn')}
          </button>
          <button type="button" className="modal-btn modal-btn-primary" onClick={handleSubmit} disabled={!canSubmit}>
            {busy
              ? <Loader2 size={16} className="spin" />
              : <><Check size={16} /> {locked ? t('modalCreateRepos.createLockedBtn') : t('modalCreateRepos.createOpenBtn')}</>}
          </button>
        </footer>
      </div>
    </div>
  )
}
