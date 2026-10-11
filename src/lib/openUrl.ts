// فتح رابط خارجي في متصفح/تطبيق النظام — لا داخل WebView التطبيق.
// أندرويد/ديسكتوب (Tauri): عبر plugin-opener. الويب: تبويب جديد.
import { isTauri } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'

export async function openExternalUrl(raw: string): Promise<void> {
  let url = raw.trim()
  if (!url) throw new Error('empty url')
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url)) url = `https://${url}`
  if (isTauri()) {
    await openUrl(url)
  } else if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}
