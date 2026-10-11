import type { Language } from '../language/index'
import type { RepoTab } from '../repos/repoService'

// عناوين التبويبات لغتان، والواجهة تختار حسب اللغة المختارة.
// الإنكليزية قد تكون فارغة (لم يملأها المستخدم بعد) — نُرجع '' ليتولّى
// المستدعي عرض دعوة «اضغط للتعديل» بدل نص مخترع.

// العنوان الفارغ إنكليزياً ليس خطأ — نُبقيه فارغاً عمداً.
export function tabTitle(tab: Pick<RepoTab, 'title' | 'titleEn'>, lang: Language): string {
  return lang === 'ar' ? tab.title : tab.titleEn
}

/** هل يحتاج هذا التبويب إلى دعوة لتعبئة عنوانه الإنكليزي؟ */
export function needsEnglishTitle(tab: Pick<RepoTab, 'title' | 'titleEn'>, lang: Language): boolean {
  return lang === 'en' && tab.titleEn.trim().length === 0
}