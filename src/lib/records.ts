// أسماء الأشخاص ثنائية اللغة — العرض حسب لغة التطبيق مع رجوع للغة الأخرى عند الفراغ.
import type { RepoPerson } from '../repos/repoService'
import type { Language } from '../language/index'

/** اسم الفرد حسب لغة التطبيق (ar → العربي، en → الإنكليزي) — مع رجوع تلقائي. */
export function recordName(rec: Pick<RepoPerson, 'name' | 'nameEn'>, lang: Language): string {
  if (lang === 'en') return rec.nameEn.trim() || rec.name
  return rec.name.trim() || rec.nameEn
}

/** صفة الفرد حسب لغة التطبيق — مع رجوع تلقائي. */
export function recordRelation(rec: Pick<RepoPerson, 'relation' | 'relationEn'>, lang: Language): string {
  if (lang === 'en') return rec.relationEn.trim() || rec.relation
  return rec.relation.trim() || rec.relationEn
}
