// مدخلات الأعمدة الإضافية (الحسابات وجهات الاتصال) — تُستخدَم في مودالاتها.
// نفس فروع ValueEditorForm (نص/طويل/تاريخ/عدد/قائمة) بأصناف المودال نفسها.
import { ClearTextArea, ClearTextInput } from './ClearTextInput'
import { useLanguage } from '../language/LanguageContext'
import { physicalLabel, type PhysicalFieldDef } from '../lib/physicalTables'

type ExtraInputsProps = {
  defs: PhysicalFieldDef[]
  values: Record<string, string>
  busy?: boolean
  onChange: (key: string, value: string) => void
}

export default function ExtraInputs({ defs, values, busy, onChange }: ExtraInputsProps) {
  const { t, lang } = useLanguage()
  if (defs.length === 0) return null
  return (
    <>
      {defs.map((def) => {
        const label = physicalLabel(def, lang === 'en' ? 'en' : 'ar')
        const value = values[def.key] ?? ''
        const inputId = `account-extra-${def.key}`
        return (
          <div className="modal-field" key={def.key}>
            <label htmlFor={inputId} className="modal-label">{label}</label>
            {def.type === 'long' ? (
              <ClearTextArea
                id={inputId}
                className="modal-input"
                value={value}
                onChange={(e) => onChange(def.key, e.target.value)}
                dir="auto"
              />
            ) : def.type === 'select' ? (
              <select
                id={inputId}
                className="modal-input"
                value={value}
                disabled={busy}
                onChange={(e) => onChange(def.key, e.target.value)}
              >
                <option value="">{t('physicalForm.emptyOption')}</option>
                {(def.options ?? []).map((o) => (
                  <option key={o.key} value={o.key}>{lang === 'en' ? o.en : o.ar}</option>
                ))}
              </select>
            ) : def.type === 'date' ? (
              <input
                id={inputId}
                className="modal-input"
                type="date"
                value={value}
                disabled={busy}
                onChange={(e) => onChange(def.key, e.target.value)}
              />
            ) : def.type === 'number' ? (
              <input
                id={inputId}
                className="modal-input"
                type="number"
                inputMode="numeric"
                value={value}
                disabled={busy}
                onChange={(e) => onChange(def.key, e.target.value)}
                dir="ltr"
              />
            ) : (
              <ClearTextInput
                id={inputId}
                type="text"
                className="modal-input"
                value={value}
                onChange={(e) => onChange(def.key, e.target.value)}
                autoComplete="off"
                maxLength={2000}
                dir="auto"
              />
            )}
          </div>
        )
      })}
    </>
  )
}
