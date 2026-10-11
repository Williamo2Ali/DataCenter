// محرر جهة اتصال مضمّن (بدل المودال) — نموذج متحكَّم به بالكامل من الصفحة.
// الحفظ/الإلغاء يعيشان في منطقة أزرار الصفحة، وهذا المكوّن عرض حقول فقط.
// أعمدة الهواتف (جوال/عمل/منزل/رئيسي/أخرى) تُجمَّع آخر الكارد في قسم قابل للطي.
import { useState } from 'react'
import { ChevronDown, Phone } from 'lucide-react'
import { ClearTextArea, ClearTextInput } from '../../components/ClearTextInput'
import ExtraInputs from '../../components/ExtraInputs'
import { useLanguage } from '../../language/LanguageContext'
import { recordName, recordRelation } from '../../lib/records'
import type { PhysicalFieldDef } from '../../lib/physicalTables'
import type { RepoPerson } from '../../repos/repoService'

export type ContactFormValues = {
  name: string
  nameEn: string
  ownerId: string
  phone: string
  email: string
  address: string
  addressEn: string
}

export const EMPTY_CONTACT_FORM: ContactFormValues = {
  name: '',
  nameEn: '',
  ownerId: '',
  phone: '',
  email: '',
  address: '',
  addressEn: '',
}

type ContactEditorProps = {
  values: ContactFormValues
  /** أفراد المستودع — لمنتقي مالك الجهة (إجباري). */
  members: RepoPerson[]
  extraDefs: PhysicalFieldDef[]
  extraValues: Record<string, string>
  busy?: boolean
  onChange: (key: keyof ContactFormValues, value: string) => void
  onExtraChange: (key: string, value: string) => void
}

/** مفاتيح أعمدة الهواتف الافتراضية — تُجمَّع آخر الكارد في قسم قابل للطي. */
const PHONE_EXTRA_KEYS = ['mobile', 'work', 'home', 'main', 'other']

export default function ContactEditor({
  values,
  members,
  extraDefs,
  extraValues,
  busy,
  onChange,
  onExtraChange,
}: ContactEditorProps) {
  const { t, lang } = useLanguage()
  const set = (key: keyof ContactFormValues) => (e: { target: { value: string } }) =>
    onChange(key, e.target.value)
  const phoneDefs = extraDefs.filter((def) => PHONE_EXTRA_KEYS.includes(def.key))
  const restDefs = extraDefs.filter((def) => !PHONE_EXTRA_KEYS.includes(def.key))
  /** مفتوح افتراضياً عند وجود أرقام مدخلة — وإلا مطوي. */
  const [phonesOpen, setPhonesOpen] = useState(
    () => phoneDefs.some((def) => (extraValues[def.key] ?? '').trim() !== ''),
  )

  return (
    <div className="field-form">
      <div className="modal-field">
        <label htmlFor="contact-edit-name" className="modal-label">{t('modalContact.nameLabel')}</label>
        <ClearTextInput
          id="contact-edit-name"
          type="text"
          className="modal-input"
          value={values.name}
          onChange={set('name')}
          placeholder={t('modalContact.namePh')}
          autoComplete="off"
          maxLength={80}
          dir="auto"
        />
      </div>
      <div className="modal-field">
        <label htmlFor="contact-edit-name-en" className="modal-label">{t('modalContact.nameEnLabel')}</label>
        <ClearTextInput
          id="contact-edit-name-en"
          type="text"
          className="modal-input"
          lang="en"
          value={values.nameEn}
          onChange={set('nameEn')}
          placeholder={t('modalContact.nameEnPh')}
          autoComplete="off"
          maxLength={80}
          dir="ltr"
        />
      </div>
      <div className="modal-field">
        <label htmlFor="contact-edit-owner" className="modal-label">{t('modalContact.ownerLabel')}</label>
        <select
          id="contact-edit-owner"
          className="modal-input"
          value={values.ownerId}
          disabled={busy}
          onChange={(e) => onChange('ownerId', e.target.value)}
        >
          {[...members].sort((a, b) => a.sortOrder - b.sortOrder).map((m) => (
            <option key={m.id} value={m.id}>{recordName(m, lang)}{recordRelation(m, lang) ? ` — ${recordRelation(m, lang)}` : ''}</option>
          ))}
        </select>
      </div>
      <div className="modal-field">
        <label htmlFor="contact-edit-phone" className="modal-label">{t('modalContact.phoneLabel')}</label>
        <ClearTextInput
          id="contact-edit-phone"
          type="tel"
          className="modal-input"
          lang="en"
          value={values.phone}
          onChange={set('phone')}
          placeholder={t('modalContact.phonePh')}
          autoComplete="off"
          maxLength={40}
          dir="ltr"
        />
      </div>
      <div className="modal-field">
        <label htmlFor="contact-edit-email" className="modal-label">{t('modalContact.emailLabel')}</label>
        <ClearTextInput
          id="contact-edit-email"
          type="email"
          className="modal-input"
          lang="en"
          value={values.email}
          onChange={set('email')}
          placeholder={t('modalContact.emailPh')}
          autoComplete="off"
          maxLength={120}
          dir="ltr"
        />
      </div>
      <div className="modal-field">
        <label htmlFor="contact-edit-address" className="modal-label">{t('modalContact.addressLabel')}</label>
        <ClearTextArea
          id="contact-edit-address"
          className="modal-input"
          value={values.address}
          onChange={set('address')}
          placeholder={t('modalContact.addressPh')}
          dir="auto"
        />
      </div>
      <ExtraInputs defs={restDefs} values={extraValues} busy={busy} onChange={onExtraChange} />
      {phoneDefs.length > 0 && (
        <div>
          <div aria-hidden="true" className="my-1 h-px" style={{ background: 'var(--line)' }} />
          <button
            type="button"
            onClick={() => setPhonesOpen((v) => !v)}
            aria-expanded={phonesOpen}
            className="flex w-full items-center gap-2 px-1 py-2"
            style={{ color: 'var(--ink)' }}
          >
            <Phone size={16} aria-hidden="true" style={{ color: 'var(--green)' }} />
            <span className="min-w-0 flex-1 truncate text-right font-semibold" dir="auto">{t('modalContact.phonesGroupTitle')}</span>
            <ChevronDown
              size={16}
              aria-hidden="true"
              className={`shrink-0 transition-transform duration-200${phonesOpen ? ' rotate-180' : ''}`}
              style={{ color: 'var(--muted)' }}
            />
          </button>
          {phonesOpen && (
            <ExtraInputs defs={phoneDefs} values={extraValues} busy={busy} onChange={onExtraChange} />
          )}
        </div>
      )}
    </div>
  )
}
