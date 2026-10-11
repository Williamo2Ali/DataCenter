import { useEffect, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'

// صورة الملف الشخصي — في Tauri تُقرأ من ملف `profile.json`،
// وخارجها (وضع التطوير) من مفتاح البروفايل القديم.
// تُحدَّث لحظياً عبر حدث مخصص عند كل حفظ (مع دعم تبويبات المتصفح عبر storage).

const profileStorageKey = 'idata-profile'
const profileChangedEvent = 'idata-profile-changed'

export function readProfilePhoto(): string | null {
  try {
    const raw = localStorage.getItem(profileStorageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { photo?: unknown }
    return typeof parsed.photo === 'string' ? parsed.photo : null
  } catch {
    return null
  }
}

async function readProfilePhotoAsync(): Promise<string | null> {
  try {
    const { readProfile } = await import('../repos/repoService')
    const profile = await readProfile()
    return typeof profile.photo === 'string' ? profile.photo : null
  } catch {
    return readProfilePhoto()
  }
}

export function notifyProfileChanged(): void {
  try {
    window.dispatchEvent(new Event(profileChangedEvent))
  } catch {
    return
  }
}

export function useProfilePhoto(): string | null {
  const [photo, setPhoto] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      if (isTauri()) {
        void readProfilePhotoAsync().then((p) => {
          if (!cancelled) setPhoto(p)
        })
      } else {
        setPhoto(readProfilePhoto())
      }
    }
    refresh()
    window.addEventListener(profileChangedEvent, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      cancelled = true
      window.removeEventListener(profileChangedEvent, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  return photo
}
