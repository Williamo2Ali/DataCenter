// نموذج تحرير صف فيزيائي 1-1 — يبنيه من `PHYSICAL_TABLES` حصراً.
// الأنواع: نص (ClearTextInput) / طويل (ClearTextArea) / تاريخ (date) /
// عدد (number) / قائمة (select). الحفظ يمرر القيم خاماً والمستدعي يضيف recordId.
import { useState } from 'react'
import { Save, X } from 'lucide-react'
import { ClearTextArea, ClearTextInput } from './ClearTextInput'
import YearSelect from './Calendar/YearSelect'
import { useLanguage } from '../language/LanguageContext'
import {
  physicalLabel, validatePhysicalValue,
  type PhysicalFieldDef,
} from '../lib/physicalTables'

type PhysicalFormProps = {
  defs: PhysicalFieldDef[]
  /** القيم الحالية (خام DTO — النصوص والعدد). */
  initial: Record<string, unknown>
  busy: boolean
  onSubmit: (values: Record<string, string | number | null>) => void
  onCancel: () => void
}

const toStr = (v: unknown): string => {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return typeof v === 'string' ? v : ''
}

export default function PhysicalForm({ defs, initial, busy, onSubmit, onCancel }: PhysicalFormProps) {
  const { t, lang } = useLanguage()
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(defs.map((d) => [d.key, toStr(initial[d.key])])),
  )
  const [error, setError] = useState('')

  const set = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    if (error) setError('')
  }

  const submit = () => {
    for (const def of defs) {
      const bad = validatePhysicalValue(def, values[def.key] ?? '')
      if (bad) {
        setError(t(`physicalForm.${bad}`, { label: physicalLabel(def, lang === 'en' ? 'en' : 'ar') }))
        return
      }
    }
    const out: Record<string, string | number | null> = {}
    for (const def of defs) {
      const v = (values[def.key] ?? '').trim()
      out[def.key] = (def.type === 'number' || def.type === 'year') ? (v === '' ? null : Number(v)) : v
    }
    onSubmit(out)
  }

  return (
    <div className="field-form">
      {error && <p className="modal-error" role="alert">{error}</p>}
      {defs.map((def) => {
        const label = physicalLabel(def, lang === 'en' ? 'en' : 'ar')
        const value = values[def.key] ?? ''
        const inputId = `physical-${def.key}`
        return (
          <div className="modal-field" key={def.key}>
            <label htmlFor={inputId} className="modal-label">{label}</label>
            {def.type === 'long' ? (
              <ClearTextArea
                id={inputId}
                className="modal-input"
                lang={def.key.endsWith('En') ? 'en' : undefined}
                value={value}
                onChange={(e) => set(def.key, e.target.value)}
                dir="auto"
              />
            ) : def.type === 'select' ? (
              <select
                id={inputId}
                className="modal-input"
                value={value}
                disabled={busy}
                onChange={(e) => set(def.key, e.target.value)}
              >
                <option value="">{t('physicalForm.emptyOption')}</option>
                {(def.options ?? []).map((o) => (
                  <option key={o.key} value={o.key}>{lang === 'en' ? o.en : o.ar}</option>
                ))}
              </select>
            ) : def.type === 'year' ? (
              // سنة التخرج برقمية التخزين — مكون السنوات المخصص، وتُحفَظ السنة فقط.
              <YearSelect
                value={/^\d{4}$/.test(value) ? value : ''}
                onChange={(year) => set(def.key, year)}
                disabled={busy}
                minYear={1900}
                maxYear={2100}
                className="modal-input"
              />
            ) : def.type === 'date' ? (
              <input
                id={inputId}
                className="modal-input"
                type="date"
                value={value}
                disabled={busy}
                onChange={(e) => set(def.key, e.target.value)}
              />
            ) : def.type === 'number' ? (
              <input
                id={inputId}
                className="modal-input"
                type="number"
                inputMode="numeric"
                min={1900}
                max={2100}
                value={value}
                disabled={busy}
                onChange={(e) => set(def.key, e.target.value)}
                dir="ltr"
              />
            ) : (
              <ClearTextInput
                id={inputId}
                type="text"
                className="modal-input"
                lang={def.key.endsWith('En') ? 'en' : undefined}
                value={value}
                onChange={(e) => set(def.key, e.target.value)}
                autoComplete="off"
                maxLength={80}
                dir="auto"
              />
            )}
          </div>
        )
      })}
      <div className="field-edit-actions">
        <button type="button" className="vault-primary vault-small" disabled={busy} onClick={submit}>
          <Save size={15} /> {t('physicalForm.saveBtn')}
        </button>
        <button type="button" className="vault-secondary vault-small" disabled={busy} onClick={onCancel}>
          <X size={15} /> {t('physicalForm.cancelBtn')}
        </button>
      </div>
    </div>
  )
}
