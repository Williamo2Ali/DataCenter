// محرر اشتراك الموقع المضمن (بدل المودال) — حقول فقط بلا كروم مودال.
// الحفظ/الإلغاء يعيشان في منطقة أزرار الصفحة، وهذا المكوّن عرض حقول فقط.
import { ClearTextInput } from '../../components/ClearTextInput'
import AccountExtraInputs from '../../components/ExtraInputs'
import TextSelect from '../../components/Custom/TextSelect'
import { useLanguage } from '../../language/LanguageContext'
import type { PhysicalFieldDef } from '../../lib/physicalTables'

export type SiteAccountValues = {
  site: string
  username: string
  passwordValue: string
  url: string
}

export const EMPTY_SITE_VALUES: SiteAccountValues = {
  site: '',
  username: '',
  passwordValue: '',
  url: '',
}

/** شبكات جاهزة: التسمية + الرابط الأساسي الذي يُملأ في حقل الرابط. */
export const SITE_PRESETS: readonly { label: string; url: string }[] = [
  { label: 'Facebook', url: 'https://www.facebook.com/' },
  { label: 'WhatsApp', url: 'https://wa.me/' },
  { label: 'Telegram', url: 'https://t.me/' },
  { label: 'Instagram', url: 'https://www.instagram.com/' },
  { label: 'GitHub', url: 'https://github.com/' },
  { label: 'X', url: 'https://x.com/' },
  { label: 'YouTube', url: 'https://www.youtube.com/' },
  { label: 'TikTok', url: 'https://www.tiktok.com/' },
]

export function normalizeSiteUrl(raw: string): string {
  const url = raw.trim()
  if (!url) return ''
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url)) return url
  return `https://${url}`
}

type SiteAccountEditorProps = {
  values: SiteAccountValues
  extraDefs: PhysicalFieldDef[]
  extraValues: Record<string, string>
  busy?: boolean
  onChange: (key: keyof SiteAccountValues, value: string) => void
  onExtraChange: (key: string, value: string) => void
}

export default function SiteAccountEditor({
  values,
  extraDefs,
  extraValues,
  busy,
  onChange,
  onExtraChange,
}: SiteAccountEditorProps) {
  const { t } = useLanguage()
  const set = (key: keyof SiteAccountValues) => (e: { target: { value: string } }) =>
    onChange(key, e.target.value)

  /** الشبكة المطابقة للاسم الحالي (لإظهارها مختارة في القائمة فقط). */
  const matchedPreset = SITE_PRESETS.some((preset) => preset.label === values.site.trim())
    ? values.site.trim()
    : null
  const applyPreset = (label: string) => {
    const preset = SITE_PRESETS.find((entry) => entry.label === label)
    if (!preset) return
    onChange('site', preset.label)
    onChange('url', preset.url)
  }

  return (
    <div className="field-form">
      <div className="modal-field">
        <label htmlFor="site-name" className="modal-label">{t('modalSiteAccount.siteLabel')}</label>
        <ClearTextInput
          id="site-name"
          type="text"
          className="modal-input"
          value={values.site}
          onChange={set('site')}
          placeholder={t('modalSiteAccount.sitePh')}
          autoComplete="off"
          maxLength={80}
          dir="auto"
        />
      </div>
      <div className="modal-field">
        <label htmlFor="site-username" className="modal-label">{t('modalSiteAccount.usernameLabel')}</label>
        <ClearTextInput
          id="site-username"
          type="text"
          className="modal-input"
          lang="en"
          value={values.username}
          onChange={set('username')}
          placeholder={t('modalSiteAccount.usernamePh')}
          autoComplete="off"
          maxLength={120}
          dir="ltr"
        />
      </div>
      <div className="modal-field">
        <label htmlFor="site-password" className="modal-label">{t('modalSiteAccount.passwordLabel')}</label>
        <ClearTextInput
          id="site-password"
          type="password"
          className="modal-input"
          lang="en"
          value={values.passwordValue}
          onChange={set('passwordValue')}
          placeholder={t('modalSiteAccount.passwordPh')}
          autoComplete="off"
          maxLength={120}
          dir="ltr"
        />
      </div>
      <div className="modal-field">
        <label htmlFor="site-url" className="modal-label">{t('modalSiteAccount.urlLabel')}</label>
        <ClearTextInput
          id="site-url"
          type="url"
          className="modal-input"
          lang="en"
          value={values.url}
          onChange={set('url')}
          placeholder={t('modalSiteAccount.urlPh')}
          autoComplete="off"
          maxLength={500}
          dir="ltr"
        />
      </div>
      <div className="modal-field">
        <span className="modal-label" id="site-presets-label">{t('modalSiteAccount.presetsLabel')}</span>
        <TextSelect
          items={SITE_PRESETS.map((preset) => ({ id: preset.label, content: preset.label }))}
          value={matchedPreset}
          placeholder={t('modalSiteAccount.presetPh')}
          disabled={busy}
          onItemChanged={(item) => applyPreset(String(item.id))}
        />
      </div>
      <AccountExtraInputs defs={extraDefs} values={extraValues} busy={busy} onChange={onExtraChange} />
    </div>
  )
}
