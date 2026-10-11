// تبويب «البروفايل» — الصورة والاسم والمعلومات الأساسية.
// يُحفظ في ملف `profile.json` عبر profileStore (localStorage بديل تطوير فقط).
// كلمة مرور التطبيق مؤجلة لاحقاً ولا تُخزَّن هنا إطلاقاً.
//
// الأنماط أدوات Tailwind؛ القواعد المقابلة حُذفت من index.css.

import { useEffect, useRef, useState } from 'react'
import { Camera, Check, Trash2, UserRound } from 'lucide-react'
import { loadProfileFile, saveProfileFileData, type ProfileData } from '../lib/profileStore'
import { useLanguage } from '../language/LanguageContext'
import { useToast } from 'react-theme-toast'
import { Tooltip } from "../components/Tooltip"
import { ClearTextInput, ClearTextArea } from '../components/ClearTextInput'

// الغلاف: بلا حدّ أقصى عرضي — يملأ الحاوية كبطاقة القسم في التبويبات الأخرى
// (نفس عرض SectionCard في صفحة الإعدادات، بلا هوامش إضافية تحت أي عرض).
const PAGE =
  'flex w-full max-w-none animate-reveal flex-col gap-3.5 rounded-xl border border-line bg-paper px-2.5 ' +
  'pt-[18px] pb-2 min-[700px]:pt-6 min-[700px]:pb-3 ' +
  'dark:border-[#3b3b41]'

const SECTION =
  'flex flex-col gap-2.5 border-t border-line pt-3.5 dark:border-[#3b3b41]'

const SECTION_TITLE =
  'm-0 flex items-center gap-[7px] text-[0.9375rem] font-bold text-ink dark:text-[#e4e4e8]'

const AVATAR =
  'grid size-[88px] flex-none place-items-center overflow-hidden rounded-full border border-[#d8e5dc] ' +
  'bg-[#edf4ef] text-green dark:border-[#45454b] dark:bg-[#303035] dark:text-[#a2d3b6]'

// تجاوزات على أصناف مشتركة لم تُرحَّل بعد (.modal-input) — تُطبَّق بـ style
// لأن قواعد index.css غير المُطبَّقة على طبقة تتقدّم على أدوات Tailwind.
const TEXTAREA_STYLE = {
  minHeight: '76px',
  height: 'auto',
  padding: '10px 12px',
  resize: 'vertical',
  fontFamily: 'inherit',
} as const

function downscalePhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        const size = 256
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('canvas')
        const side = Math.min(img.width, img.height)
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      } catch (e) {
        reject(e instanceof Error ? e : new Error('تعذر معالجة الصورة.'))
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('تعذر قراءة الصورة.'))
    }
    img.src = url
  })
}

export default function TabProfile() {
  const { t } = useLanguage()
  const toast = useToast()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  const [notes, setNotes] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // التحميل من الملف (مع هجرة القديم لمرة واحدة) — الحقول معطّلة حتى يكتمل.
  useEffect(() => {
    let cancelled = false
    void loadProfileFile().then((p) => {
      if (cancelled) return
      setProfile(p)
      setName(p.name)
      setPhone(p.phone)
      setEmail(p.email)
      setCity(p.city)
      setCountry(p.country)
      setNotes(p.notes)
      setPhoto(p.photo)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const persist = async (next: ProfileData) => {
    try {
      setProfile(await saveProfileFileData(next))
    } catch {
      toast.error(t('pageProfile.storageError'))
    }
  }

  const handlePhotoPicked = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      const dataUrl = await downscalePhoto(file)
      setPhoto(dataUrl)
      toast.info(t('pageProfile.photoReadyNotice'))
    } catch {
      toast.error(t('pageProfile.readImageTryOtherError'))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleSaveProfile = () => {
    if (!profile) return
    void persist({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      city: city.trim(),
      country: country.trim(),
      notes: notes.trim(),
      photo,
      language: profile.language,
      theme: profile.theme,
    }).then(() => toast.success(t('pageProfile.profileSavedNotice')))
  }

  return (
    <section aria-label={t('pageProfile.title')} className={PAGE}>

      <div className="flex flex-wrap items-center gap-3.5">
        <span className={AVATAR} aria-hidden="true">
          {photo
            ? <img src={photo} alt="" className="size-full object-cover" />
            : <UserRound size={44} strokeWidth={1.4} />}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            aria-label={t('pageProfile.selectPhotoAria')}
            onChange={(e) => void handlePhotoPicked(e.target.files?.[0])}
          />
          <button type="button" className="vault-secondary vault-small" disabled={busy || !profile} onClick={() => fileRef.current?.click()}>
            <Camera size={14} /> {photo ? t('pageProfile.changePhoto') : t('pageProfile.addPhoto')}
          </button>
          {photo && (
            <Tooltip content={t('pageProfile.removePhotoTitle')} tone="danger">
            <button type="button" className="viewer-icon-button vault-danger" aria-label={t('pageProfile.removePhotoAria')} disabled={busy} onClick={() => setPhoto(null)}>
              <Trash2 size={15} />
            </button>
            </Tooltip>
          )}
        </div>
      </div>

      <div className={SECTION}>
        <h3 className={SECTION_TITLE}>{t('pageProfile.basicInfoTitle')}</h3>
        <div className="modal-field">
          <label htmlFor="profile-name" className="modal-label">{t('pageProfile.nameLabel')}</label>
          <ClearTextInput
            id="profile-name"
            type="text"
            className="modal-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('pageProfile.namePlaceholder')}
            autoComplete="name"
            maxLength={60}
            dir="auto"
          />
        </div>
      </div>

      <div className={SECTION} style={{ borderTop: 'none', paddingTop: 0 }}>
        <h3 className={SECTION_TITLE}>{t('pageProfile.phoneTitle')}</h3>
        <div className="modal-field">
          <label htmlFor="profile-phone" className="modal-label">{t('pageProfile.phoneLabel')}</label>
          <ClearTextInput
            id="profile-phone"
            type="tel"
            className="modal-input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t('pageProfile.phonePlaceholder')}
            autoComplete="tel"
            maxLength={20}
            dir="ltr"
          />
        </div>
      </div>

      <div className={SECTION}>
        <h3 className={SECTION_TITLE}>{t('pageProfile.contactTitle')}</h3>
        <div className="modal-field">
          <label htmlFor="profile-email" className="modal-label">{t('pageProfile.emailLabel')}</label>
          <ClearTextInput
            id="profile-email"
            type="email"
            className="modal-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('pageProfile.emailPlaceholder')}
            autoComplete="email"
            maxLength={80}
            dir="ltr"
          />
        </div>
        <div className="modal-field">
          <label htmlFor="profile-city" className="modal-label">{t('pageProfile.cityLabel')}</label>
          <ClearTextInput
            id="profile-city"
            type="text"
            className="modal-input"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder={t('pageProfile.cityPlaceholder')}
            maxLength={60}
            dir="auto"
          />
        </div>
        <div className="modal-field">
          <label htmlFor="profile-country" className="modal-label">{t('pageProfile.countryLabel')}</label>
          <ClearTextInput
            id="profile-country"
            type="text"
            className="modal-input"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder={t('pageProfile.countryPlaceholder')}
            maxLength={60}
            dir="auto"
          />
        </div>
        <div className="modal-field">
          <label htmlFor="profile-notes" className="modal-label">{t('pageProfile.notesLabel')}</label>
          <ClearTextArea
            id="profile-notes"
            className="modal-input"
            style={TEXTAREA_STYLE}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('pageProfile.notesPlaceholder')}
            maxLength={500}
            dir="auto"
            rows={3}
          />
        </div>
        <button type="button" className="vault-primary w-full lg:w-1/2 lg:self-center" disabled={busy || !profile} onClick={handleSaveProfile}>
          <Check size={15} /> {t('pageProfile.saveProfileBtn')}
        </button>
      </div>
    </section>
  )
}