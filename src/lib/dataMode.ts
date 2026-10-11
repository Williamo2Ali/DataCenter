// قاعدة ظهور «وضع نقل البيانات».
//
// المستودع يحوي قاعدة SQLite (نص) إلى جانب الملفات. التبويبات الأساسية تمثلها
// الصفوف الفيزيائية، والملفات في `documents`.
// وضع النقل يضيّق النافذة ليُنسخ النص بسرعة — فلا معنى له بلا نص معروض.
//
// القاعدة: المستودع مفتوح، والتبويب النشط فيه قيمة نصية واحدة على الأقل
// غير فارغة للفرد الحالي (أو مشتركة).

import type { RepoData } from '../repos/repoService'

const hasText = (v: unknown): boolean => typeof v === 'string' && v.trim() !== ''

function rowValues(row: object | undefined, skip: readonly string[]): boolean {
  if (!row) return false
  return Object.entries(row).some(([k, v]) => !skip.includes(k) && hasText(v))
}

const SKIP = ['id', 'recordId', 'sortOrder', 'createdAt', 'updatedAt', 'sizeBytes', 'modifiedAt', 'fileName'] as const

export function hasCopyableData(repo: RepoData | null, tabId: string | null, memberId: string | null): boolean {
  if (!repo || !tabId) return false
  switch (tabId) {
    case 'passports':
      return rowValues(repo.passports.find((r) => r.recordId === memberId), SKIP)
    case 'study':
      return rowValues(repo.studies.find((r) => r.recordId === memberId), SKIP)
    case 'national_ids':
      return rowValues(repo.nationalIds.find((r) => r.recordId === memberId), SKIP)
    case 'civil':
      return rowValues(repo.civils.find((r) => r.recordId === memberId), SKIP)
    case 'accounts':
      return repo.accounts.some((a) => a.recordId === memberId && rowValues(a, SKIP))
    case 'contacts':
      return repo.contacts.some((c) => (c.recordId ?? null) === (memberId ?? null) && rowValues(c, SKIP))
    case 'files':
      return repo.documents.some((d) => hasText(d.title))
    default:
      return false
  }
}