// واجهة ملحق نسخ الملفات أصلياً (tauri-plugin-file-copy) — قرص→قرص بمقاطع.
// البايتات لا تعبر IPC إلى JS إطلاقاً، فلا تجمّد الواجهة مع الملفات الكبيرة.
// بنفس أسلوب fileShare.ts: استدعاء مباشر بلا حزمة npm.
import { invoke } from '@tauri-apps/api/core'

const PLUGIN = 'plugin:file-copy'

/** قراءة أول N بايت من المصدر (مسار ملف أو content://) — لكشف الامتداد من البصمة. */
export async function readHeadBytes(src: string, len = 64): Promise<Uint8Array> {
  const res = await invoke<{ head: number[] }>(`${PLUGIN}|read_head`, { src, len })
  return Uint8Array.from(res.head)
}

/** الاسم المعروض للمصدر — DISPLAY_NAME من النظام لروابط content:// (أندرويد)،
    واسم الملف من المسار على الديسكتوب. null عند التعذر (يُستخدم الاسم القاعدي). */
export async function getDisplayName(src: string): Promise<string | null> {
  try {
    const res = await invoke<{ name: string }>(`${PLUGIN}|display_name`, { src })
    const name = res.name?.trim()
    return name ? name : null
  } catch {
    return null
  }
}

/** نسخ المصدر إلى الوجهة أصلياً — يعيد عدد البايتات المنسوخة. */
export async function copyStagedFile(src: string, dest: string): Promise<number> {
  const res = await invoke<{ bytes: number }>(`${PLUGIN}|copy_file`, { src, dest })
  return res.bytes
}

/** تصدير ملف محفوظ إلى وجهة حرة (مسار نظامي أو content://) أصلياً — يعيد عدد البايتات. */
export async function exportFile(src: string, dest: string): Promise<number> {
  const res = await invoke<{ bytes: number }>(`${PLUGIN}|export_file`, { src, dest })
  return res.bytes
}
