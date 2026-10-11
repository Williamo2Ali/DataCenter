// تبويب «الأمان» — إنشاء/تغيير/إزالة كلمة مرور التطبيق.
// انتقلت هنا من صفحة البروفايل، ويتقاسم السجل معها عبر profileStore.
//
// الأنماط أدوات Tailwind؛ القواعد المقابلة حُذفت من index.css.
// كان هذا القسم يعيد استعمال .profile-section داخل بطاقة القسم، فتُلغى
// حدّه العلوي وتُضاف الحشوة — والآن هو الجذر نفسه فلا حاجة لمُحدِّد أب.

import { useState } from 'react'
import { Check, Lock, Trash2 } from 'lucide-react'
import { loadProfile, saveProfile, sha256Hex, type UserProfile } from '../lib/profileStore'
import { useLanguage } from '../language/LanguageContext'
import Textpassword from '../components/Custom/Textpassword'

// جذر القسم: بلا حدّ علوي (لأنه أول وأقسم عنصر في البطاقة) وبحشوة كاملة.
const SECTION =
  'flex flex-col gap-2.5 px-7 py-[18px] max-[860px]:px-[18px] max-[560px]:px-3.5'

const TITLE =
  'm-0 flex items-center gap-[7px] text-[0.9375rem] font-bold text-ink dark:text-[#e4e4e8]'

const PASS_ACTIONS = 'flex flex-wrap items-center gap-2'

export default function TabSecurity() {
  const { t, lang } = useLanguage()
  const [profile, setProfile] = useState<UserProfile>(loadProfile)
  const [currentPass, setCurrentPass] = useState('')
  const [newPass, setNewPass] = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const hasPassword = profile.passwordHash !== null

  const persist = (next: UserProfile) => {
    setProfile(next)
    if (!saveProfile(next)) setError(t('pageProfile.storageError'))
  }

  const clearFields = () => {
    setCurrentPass('')
    setNewPass('')
    setConfirmPass('')
  }

  const handleSavePassword = async () => {
    setError('')
    setNotice('')
    if (profile.passwordHash) {
      if (!currentPass) {
        setError(t('pageProfile.enterCurrentPassError'))
        return
      }
      const currentHash = await sha256Hex(currentPass)
      if (currentHash !== profile.passwordHash) {
        setError(t('pageProfile.currentPassIncorrectError'))
        return
      }
    }
    if (newPass.length < 4) {
      setError(t('pageProfile.newPassShortError'))
      return
    }
    if (newPass !== confirmPass) {
      setError(t('pageProfile.passwordMismatchError'))
      return
    }
    setBusy(true)
    try {
      const hash = await sha256Hex(newPass)
      persist({ ...profile, passwordHash: hash })
      clearFields()
      setNotice(t('pageProfile.passwordSavedNotice'))
    } catch {
      setError(t('pageProfile.savePassError'))
    } finally {
      setBusy(false)
    }
  }

  const handleRemovePassword = async () => {
    if (!profile.passwordHash) return
    if (!window.confirm(t('pageProfile.removePassConfirm'))) return
    persist({ ...profile, passwordHash: null })
    clearFields()
    setNotice(t('pageProfile.passRemovedNotice'))
  }

  return (
    <div className={SECTION}>
      <h3 className={TITLE}>
        <Lock size={15} /> {t('pageProfile.appPassTitle')}{' '}
        {hasPassword ? t('pageProfile.appPassEnabled') : t('pageProfile.appPassDisabled')}
      </h3>
      <p className="vault-hint" style={{ padding: 0 }}>{t('pageProfile.appPassHint')}</p>

      {error && <p className="vault-error" role="alert">{error}</p>}
      {notice && <p className="vault-notice" role="status">{notice}</p>}

      {hasPassword && (
        <div className="modal-field">
          <label htmlFor="security-current-pass" className="modal-label">{t('pageProfile.currentPassLabel')}</label>
          <Textpassword
            id="security-current-pass"
            value={currentPass}
            onChange={setCurrentPass}
            autoComplete="current-password"
            dir={lang === 'ar' ? 'rtl' : 'ltr'}
            showLabel={t('pageProfile.show')}
            hideLabel={t('pageProfile.hide')}
          />
        </div>
      )}

      <div className="modal-field">
        <label htmlFor="security-new-pass" className="modal-label">
          {hasPassword ? t('pageProfile.newPassLabel') : t('pageProfile.passLabel')}
        </label>
        <Textpassword
          id="security-new-pass"
          value={newPass}
          onChange={setNewPass}
          autoComplete="new-password"
          placeholder={t('pageProfile.passPlaceholder')}
          dir={lang === 'ar' ? 'rtl' : 'ltr'}
          showLabel={t('pageProfile.show')}
          hideLabel={t('pageProfile.hide')}
        />
      </div>

      <div className="modal-field">
        <label htmlFor="security-confirm-pass" className="modal-label">{t('pageProfile.confirmPassLabel')}</label>
        <Textpassword
          id="security-confirm-pass"
          value={confirmPass}
          onChange={setConfirmPass}
          autoComplete="new-password"
          placeholder={t('pageProfile.confirmPassPlaceholder')}
          dir={lang === 'ar' ? 'rtl' : 'ltr'}
          showLabel={t('pageProfile.show')}
          hideLabel={t('pageProfile.hide')}
        />
      </div>

      <div className={PASS_ACTIONS}>
        <button type="button" className="vault-primary" disabled={busy} onClick={() => void handleSavePassword()}>
          <Check size={15} /> {t('pageProfile.savePassBtn')}
        </button>
        {hasPassword && (
          <button type="button" className="vault-ghost-danger" disabled={busy} onClick={() => void handleRemovePassword()}>
            <Trash2 size={15} /> {t('pageProfile.removePassBtn')}
          </button>
        )}
      </div>
    </div>
  )
}