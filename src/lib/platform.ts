import { useEffect, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { platform } from '@tauri-apps/plugin-os'

// طبقة المنصة — المصدر الوحيد للحقيقة حول أين يعمل التطبيق.
// المنصات المدعومة: windows / linux (ديسكتوب) و android (موبايل/تابلت).
// المتصفح العادي (وضع التطوير) يُعامل كديسكتوب.

export type AppPlatform = 'windows' | 'linux' | 'android' | 'web' | 'unknown'

export function isDesktopPlatform(platform: AppPlatform): boolean {
  return platform === 'windows' || platform === 'linux' || platform === 'web' || platform === 'unknown'
}

export function isAndroidPlatform(platform: AppPlatform): boolean {
  return platform === 'android'
}

async function detectPlatform(): Promise<AppPlatform> {
  if (!isTauri()) return 'web'
  try {
    const name = await platform()
    if (name === 'android' || name === 'windows' || name === 'linux') return name
    // أي منصة أخرى غير مدعومة رسمياً — نعاملها كديسكتوب افتراضياً
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * يكشف المنصة مرة واحدة عند بدء التطبيق ويضعها على
 * `document.documentElement.dataset.platform` ليستخدمها CSS.
 * القيمة الابتدائية 'unknown' (تُعامل كديسكتوب) حتى لا يتغير
 * سلوك ويندوز الحالي أثناء الكشف.
 */
export function usePlatform(): AppPlatform {
  const [platform, setPlatform] = useState<AppPlatform>('unknown')

  useEffect(() => {
    let cancelled = false
    void detectPlatform().then((name) => {
      if (cancelled) return
      setPlatform(name)
      try {
        document.documentElement.dataset.platform = name
      } catch {
        return
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  return platform
}
