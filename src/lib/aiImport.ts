// تحليل نتائج الذكاء الاصطناعي الملصقة — JSON صارم مع رسائل خطأ تحدد الموضع.
// (الأسوار ```json تُنزَع تلقائياً. الماركداون غير مدعوم — JSON فقط.)
import type { PhysicalFieldDef } from './physicalTables'

/** أنواع القيم المقبولة من الذكاء الاصطناعي. */
const AI_VALUE_TYPES = ['text', 'long', 'number', 'date', 'phone', 'yesno', 'list'] as const

export type AiFieldItem = {
  label: string
  labelEn: string
  value: string
  valueEn: string
  type: string
}

export type AiParseResult =
  | { ok: true; items: AiFieldItem[] }
  | { ok: false; error: string }

const MAX_ITEMS = 100

function stripFences(text: string): string {
  const t = text.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  return t.trim()
}

const asText = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : ''

/** مطابقة اسم وارد مع حقل موجود (بالعربي أو الإنكليزي) — للملء بدل التكرار. */
export function matchExistingLabel(
  item: AiFieldItem,
  existing: { label: string; labelEn: string }[],
): number {
  const a = item.label.trim()
  const e = item.labelEn.trim()
  if (!a && !e) return -1
  return existing.findIndex((f) =>
    (a !== '' && f.label.trim() === a) || (e !== '' && f.labelEn.trim() === e),
  )
}

export function parseAiJson(raw: string): AiParseResult {
  const text = stripFences(raw)
  if (!text) return { ok: false, error: 'empty' }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'invalid' }
  }
  if (!Array.isArray(parsed)) return { ok: false, error: 'notArray' }
  if (parsed.length === 0) return { ok: false, error: 'emptyArray' }
  if (parsed.length > MAX_ITEMS) return { ok: false, error: 'tooMany' }
  const items: AiFieldItem[] = []
  for (let i = 0; i < parsed.length; i++) {
    const o = parsed[i]
    if (typeof o !== 'object' || o === null || Array.isArray(o)) {
      return { ok: false, error: `item:${i}` }
    }
    const rec = o as Record<string, unknown>
    const label = asText(rec.label ?? rec.name, 80)
    if (!label) return { ok: false, error: `label:${i}` }
    const typeRaw = asText(rec.type, 20).toLowerCase()
    items.push({
      label,
      labelEn: asText(rec.labelEn ?? rec.label_en ?? rec.nameEn, 80),
      value: asText(rec.value, 500),
      valueEn: asText(rec.valueEn ?? rec.value_en, 500),
      type: (AI_VALUE_TYPES as readonly string[]).includes(typeRaw) ? typeRaw : 'text',
    })
  }
  return { ok: true, items }
}

export type AiMappedRow = { item: AiFieldItem; def: PhysicalFieldDef; value: string | number | null }

export type AiMatchResult = {
  mapped: AiMappedRow[]
  unmatched: AiFieldItem[]
}

const norm = (s: string): string => s.trim().toLocaleLowerCase()

/** مطابقة عنصر وارد مع عمود فيزيائي (بالتسمية العربية أو الإنكليزية، بأي اتجاه). */
function findColumn(item: AiFieldItem, defs: PhysicalFieldDef[]): PhysicalFieldDef | undefined {
  const labels = [item.label, item.labelEn].map(norm).filter((s) => s !== '')
  if (labels.length === 0) return undefined
  return defs.find((d) => {
    const candidates = [d.labelAr, d.labelEn].map(norm)
    return labels.some((l) => candidates.includes(l))
  })
}

/** حل قيمة عنصر لمفتاح/قيمة العمود: القوائم تُحل لمفاتيحها، والعدد لعدد. */
function resolveValue(item: AiFieldItem, def: PhysicalFieldDef): string | number | null | undefined {
  const raw = item.value.trim() || item.valueEn.trim()
  if (raw === '') return undefined
  if (def.type === 'select' && def.options) {
    const hit = def.options.find((o) =>
      [o.key, o.ar, o.en].some((c) => norm(c) === norm(raw)),
    )
    // عمود حر الخيارات (المرحلة الدراسية) يقبل النص كما هو.
    if (hit) return hit.key
    return def.key === 'educationLevel' ? raw : undefined
  }
  if (def.type === 'number' || def.type === 'year') {
    // السنة: أول مجموعة رباعية (تقبل «2020» وتاريخاً كاملاً)، والعدد: كل الأرقام.
    if (def.type === 'year') {
      const hit = raw.match(/\b\d{4}\b/)
      return !hit ? undefined : Number(hit[0])
    }
    const digits = raw.replace(/[^\d]/g, '')
    return digits === '' ? undefined : Number(digits)
  }
  return raw
}

/** مطابقة عناصر الذكاء مع أعمدة جدول فيزيائي — المجهول يُتجاهَل بصدق (لا تخمين). */
export function matchToPhysicalColumns(items: AiFieldItem[], defs: PhysicalFieldDef[]): AiMatchResult {
  const mapped: AiMappedRow[] = []
  const unmatched: AiFieldItem[] = []
  for (const item of items) {
    const def = findColumn(item, defs)
    if (!def) {
      unmatched.push(item)
      continue
    }
    const value = resolveValue(item, def)
    if (value === undefined) {
      unmatched.push(item)
      continue
    }
    const prev = mapped.findIndex((m) => m.def.key === def.key)
    if (prev >= 0) mapped[prev] = { item, def, value }
    else mapped.push({ item, def, value })
  }
  return { mapped, unmatched }
}
