// محرر حساب الايميل المضمن (بدل المودال) — حقول فقط بلا كروم مودال.
// الحفظ/الإلغاء يعيشان في منطقة أزرار الصفحة، وهذا المكوّن عرض حقول فقط.
import { ClearTextInput } from '../../components/ClearTextInput'
import { EmailSuggestInput } from '../../components/EmailSuggestInput'
import AccountExtraInputs from '../../components/ExtraInputs'
import { useLanguage } from '../../language/LanguageContext'
import type { PhysicalFieldDef } from '../../lib/physicalTables'

export type AccountValues = {
  title: string
  email: string
  accountName: string
  username: string
  recoveryEmail: string
  passwordValue: string
}

export const EMPTY_ACCOUNT_VALUES: AccountValues = {
  title: '',
  email: '',
  accountName: '',
  username: '',
  recoveryEmail: '',
  passwordValue: '',
}

type AccountEditorProps = {
  values: AccountValues
  extraDefs: PhysicalFieldDef[]
  extraValues: Record<string, string>
  busy?: boolean
  onChange: (key: keyof AccountValues, value: string) => void
  onExtraChange: (key: string, value: string) => void
}

export default function AccountEditor({
  values,
  extraDefs,
  extraValues,
  busy,
  onChange,
  onExtraChange,
}: AccountEditorProps) {
  const { t } = useLanguage()
  const set = (key: keyof AccountValues) => (e: { target: { value: string } }) =>
    onChange(key, e.target.value)

  const field = (
    id: string,
    labelKey: string,
    placeholderKey: string,
    key: keyof AccountValues,
    extra?: { lang?: 'en'; dir?: 'ltr'; type?: string; maxLength?: number; emailSuggest?: boolean },
  ) => (
    <div className="modal-field">
      <label htmlFor={id} className="modal-label">{t(labelKey)}</label>
      {extra?.emailSuggest ? (
        <EmailSuggestInput
          id={id}
          className="modal-input"
          value={values[key]}
          onChange={set(key)}
          placeholder={t(placeholderKey)}
          autoComplete="off"
          maxLength={extra?.maxLength ?? 120}
          disabled={busy}
        />
      ) : (
        <ClearTextInput
          id={id}
          type={extra?.type ?? 'text'}
          className="modal-input"
          lang={extra?.lang}
          value={values[key]}
          onChange={set(key)}
          placeholder={t(placeholderKey)}
          autoComplete="off"
          maxLength={extra?.maxLength ?? 120}
          dir={extra?.dir ?? 'auto'}
        />
      )}
    </div>
  )

  return (
    <div className="field-form">
      {field('account-title', 'modalAccount.titleLabel', 'modalAccount.titlePh', 'title', { maxLength: 80 })}
      {field('account-email', 'modalAccount.emailLabel', 'modalAccount.emailPh', 'email', { emailSuggest: true, maxLength: 120 })}
      {field('account-name', 'modalAccount.accountNameLabel', 'modalAccount.accountNamePh', 'accountName', { lang: 'en', dir: 'ltr' })}
      {field('account-username', 'modalAccount.usernameLabel', 'modalAccount.usernamePh', 'username', { lang: 'en', dir: 'ltr' })}
      {field('account-recovery', 'modalAccount.recoveryLabel', 'modalAccount.recoveryPh', 'recoveryEmail', { emailSuggest: true, maxLength: 120 })}
      {field('account-password', 'modalAccount.passwordLabel', 'modalAccount.passwordPh', 'passwordValue', { lang: 'en', dir: 'ltr', type: 'password' })}
      <AccountExtraInputs defs={extraDefs} values={extraValues} busy={busy} onChange={onExtraChange} />
    </div>
  )
}
