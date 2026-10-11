// الملف الشخصي — المصدر الوحيد في Tauri هو ملف `profile.json` عبر الأوامر
// (read_profile/save_profile). خارج Tauri (وضع التطوير في المتصفح) يُستخدَم
// localStorage كبديل محلي فقط.
// بلا أي حقل سري: كلمة مرور التطبيق مؤجلة لاحقاً ولا تُخزَّن في الملف إطلاقاً.

import { isTauri } from '@tauri-apps/api/core'
import { readProfile, saveProfileFile, type ProfileJson } from '../repos/repoService'
import { notifyProfileChanged } from './profilePhoto'
import type { Language } from '../language/index'
import type { ThemeMode } from './appSettings'

export type UserProfile = {
  name: string
  info: string
  photo: string | null
  phone: string
  email: string
  city: string
  country: string
  notes: string
  /** مؤجلة لاحقاً: لا تُحفَظ في الملف إطلاقاً — تُتجاهَل عند الكتابة. */
  passwordHash: string | null
}

/** بيانات الملف — بلا أي حقل سري. */
export type ProfileData = {
  name: string
  photo: string | null
  phone: string
  email: string
  city: string
  country: string
  notes: string
  /** لغة التطبيق (تبويب عام) — الافتراضي العربية. */
  language: Language
  /** مظهر التطبيق (تبويب عام) — الافتراضي الفاتح. */
  theme: ThemeMode
}

/** القيم العامة الافتراضية (عربية/فاتح). */
export const defaultGeneral = { language: 'ar', theme: 'light' } as const

export const profileStorageKey = 'idata-profile'

const emptyData = (): ProfileData => ({ name: '', photo: null, phone: '', email: '', city: '', country: '', notes: '', language: 'ar', theme: 'light' })

function asLanguage(v: unknown): Language {
  return v === 'en' ? 'en' : 'ar'
}

function asTheme(v: unknown): ThemeMode {
  return v === 'dark' ? 'dark' : 'light'
}

function fromJson(p: ProfileJson): ProfileData {
  const str = (v: unknown): string => (typeof v === 'string' ? v : '')
  return {
    name: str(p.name),
    photo: typeof p.photo === 'string' ? p.photo : null,
    phone: str(p.phone),
    email: str(p.email),
    city: str(p.city),
    country: str(p.country),
    notes: str(p.notes),
    language: asLanguage(p.language),
    theme: asTheme(p.theme),
  }
}

function toJson(d: ProfileData): ProfileJson {
  return { name: d.name, phone: d.phone, email: d.email, city: d.city, country: d.country, notes: d.notes, photo: d.photo, language: d.language, theme: d.theme }
}

// ---------- المسار القديم (localStorage) ----------
// يُستخدَم كبديل خارج Tauri، وكمصدر للهجرة لمرة واحدة داخل Tauri.
// تبويب الأمان المخفي (مؤجل) ما زال يعتمد عليه — لا تحذفه.

function readLegacy(): ProfileData | null {
  try {
    const raw = localStorage.getItem(profileStorageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<UserProfile>
    const str = (v: unknown): string => (typeof v === 'string' ? v : '')
    return {
      name: str(parsed.name),
      photo: typeof parsed.photo === 'string' ? parsed.photo : null,
      phone: str(parsed.phone),
      email: str(parsed.email),
      city: str(parsed.city),
      country: str(parsed.country),
      notes: str(parsed.notes),
      language: 'ar',
      theme: 'light',
    }
  } catch {
    return null
  }
}

function hasAnyData(d: ProfileData): boolean {
  return !!(d.name || d.phone || d.email || d.city || d.country || d.notes || d.photo)
}

// ---------- الهجرة لمرة واحدة: localStorage → profile.json ----------
// تُنفَّذ بعد نجاح الكتابة والتحقق منها فقط — الفشل يُبقي القديم ولا يفقد شيئاً.

let migration: Promise<void> | null = null

function ensureMigrated(): Promise<void> {
  if (!isTauri()) return Promise.resolve()
  if (!migration) {
    migration = (async () => {
      const legacy = readLegacy()
      if (!legacy || !hasAnyData(legacy)) return
      try {
        const saved = await saveProfileFile(toJson(legacy))
        const verify = await readProfile()
        if (JSON.stringify(fromJson(verify)) === JSON.stringify(fromJson(saved))) {
          try {
            localStorage.removeItem(profileStorageKey)
          } catch {
            return
          }
        }
      } catch {
        return
      }
    })()
  }
  return migration
}

// ---------- الواجهة الجديدة (ملف) ----------

/** القيم العامة (تبويب عام) — اللغة والمظهر فقط. */
export type ProfileGeneral = Pick<ProfileData, 'language' | 'theme'>

/** ترقيع اللغة/المظهر فوق الملف الكامل — لا يمس الاسم والصورة وبقية الحقول. */
export async function patchProfileGeneral(patch: Partial<ProfileGeneral>): Promise<ProfileGeneral> {
  const current = await loadProfileFile()
  const saved = await saveProfileFileData({ ...current, ...patch })
  return { language: saved.language, theme: saved.theme }
}
/** تحميل الملف الشخصي من `profile.json` (مع هجرة القديم أولاً). */
export async function loadProfileFile(): Promise<ProfileData> {
  if (!isTauri()) return readLegacy() ?? emptyData()
  await ensureMigrated()
  try {
    return fromJson(await readProfile())
  } catch {
    return readLegacy() ?? emptyData()
  }
}

/** حفظ الملف الشخصي في `profile.json` ثم إطلاق حدث التغيير (يحدّث الصورة). */
export async function saveProfileFileData(next: ProfileData): Promise<ProfileData> {
  if (!isTauri()) {
    try {
      localStorage.setItem(profileStorageKey, JSON.stringify({ ...next, info: '', passwordHash: null }))
    } catch {
      throw new Error('storage')
    }
    notifyProfileChanged()
    return next
  }
  await ensureMigrated()
  const saved = fromJson(await saveProfileFile(toJson(next)))
  notifyProfileChanged()
  return saved
}

// ---------- القديم المتزامن (لتبويب الأمان المؤجل فقط) ----------

export function loadProfile(): UserProfile {
  const str = (v: unknown): string => (typeof v === 'string' ? v : '')
  const empty: UserProfile = { name: '', info: '', photo: null, phone: '', email: '', city: '', country: '', notes: '', passwordHash: null }
  try {
    const raw = localStorage.getItem(profileStorageKey)
    if (!raw) return empty
    const parsed = JSON.parse(raw) as Partial<UserProfile>
    return {
      name: str(parsed.name),
      info: str(parsed.info),
      photo: typeof parsed.photo === 'string' ? parsed.photo : null,
      phone: str(parsed.phone),
      email: str(parsed.email),
      city: str(parsed.city),
      country: str(parsed.country),
      notes: str(parsed.notes),
      passwordHash: typeof parsed.passwordHash === 'string' ? parsed.passwordHash : null,
    }
  } catch {
    return empty
  }
}

/** حفظ السجل كاملاً ثم إطلاق حدث التغيير (يحدّث صورة الهيدر). */
export function saveProfile(next: UserProfile): boolean {
  try {
    localStorage.setItem(profileStorageKey, JSON.stringify(next))
  } catch {
    return false
  }
  notifyProfileChanged()
  return true
}

/** مؤجلة لاحقاً مع كلمة مرور التطبيق — تُستخدَم من تبويب الأمان المخفي فقط. */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
