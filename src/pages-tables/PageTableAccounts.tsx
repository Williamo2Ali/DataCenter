// صفحة جدول الحسابات — الايميلات واشتراكات المواقع للفرد النشط.
// مكوّن مستقل: حالته وحواراته وحفظه داخله، والعارض يستدعيه عبر الراوتر فقط.
// (نُقل من PageRepoViewer — المصدر الوحيد لجدول accounts).
import { useImperativeHandle, useState } from 'react'
import type { ReactNode, Ref } from 'react'
import { Check, ChevronDown, ChevronUp, Copy, ExternalLink, Eye, EyeOff, Globe, KeyRound, Mail, Pencil, Save, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { generateId } from '@/utils/helpers'
import { useLanguage } from '../language/LanguageContext'
import { useToast } from 'react-theme-toast'
import { ReadonlyInput } from '../components/ReadonlyInput'
import RepoTabsHeaderControl from '../components/RepoTabsHeaderControl'
import { Tooltip } from '../components/Tooltip'
import { openExternalUrl } from '../lib/openUrl'
import { tabTitle } from '../lib/tabTitle'
import { recordName, recordRelation } from '../lib/records'
import {
  ACCOUNT_FIELD_DEFS, applyBaseLabels, customColumnToDef,
  physicalDisplayValue, physicalLabel, validatePhysicalValue,
  type PhysicalFieldDef,
} from '../lib/physicalTables'
import AccountEditor, { EMPTY_ACCOUNT_VALUES, type AccountValues } from './AccountsFiles/AccountEditor'
import SiteAccountEditor, { EMPTY_SITE_VALUES, normalizeSiteUrl, type SiteAccountValues } from './AccountsFiles/SiteAccountEditor'
import ModalMessages from '../modals/ModalMessages'
import {
  addAccount,
  deleteAccount,
  updateAccount,
  updateAccountExtra,
  type RepoData,
} from '../repos/repoService'

export type FamilyAccount = {
  id: string
  title: string
  email?: string
  accountName?: string
  username?: string
  recoveryEmail?: string
  password: string
  /** نوع الحساب: `site` اشتراك موقع، وغيره ايميل. */
  kind: string
  url?: string
  /** قيم الأعمدة الإضافية (من مدير الأعمدة). */
  extra: Record<string, unknown>
}

/** واجهة الأوامر الخارجية (زر الإضافة السريع في هيدر الموبايل). */
export type AccountsApi = {
  openAddEmail: () => void
}

type PageTableAccountsProps = {
  repo: RepoData
  repoPassword: string | null
  activeMemberId: string
  ref?: Ref<AccountsApi>
  onEditMember: () => void
  onDeleteMember: () => void
  onRepoUpdated: (data: RepoData) => void
  onManageFields: (tabId: string) => void
}

type AccountValue = {
  key: string
  label: string
  value: string
  secret?: boolean
}

export default function PageTableAccounts({
  repo,
  repoPassword,
  activeMemberId,
  ref,
  onEditMember,
  onDeleteMember,
  onRepoUpdated,
  onManageFields,
}: PageTableAccountsProps) {
  const { t, lang } = useLanguage()
  const toast = useToast()
  const [mutError, setMutError] = useState('')
  const [mutBusy, setMutBusy] = useState(false)
  const [accountDialog, setAccountDialog] = useState<{ mode: 'add' | 'edit'; kind: 'email' | 'site'; id?: string } | null>(null)
  /** حذف مؤكد عبر مودال الرسائل (بدل window.confirm). */
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null)
  const [revealedPasswords, setRevealedPasswords] = useState<Set<string>>(() => new Set())
  const [copiedField, setCopiedField] = useState<string | null>(null)
  /** البطاقات الموسّعة — الافتراضي مطوية (الاسم + سهم فقط) كصفوف الإدارة. */
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())

  /** أعمدة الحسابات القابلة للإدارة: الثابتة (بتجاوزات التسميات) + الإضافية —
      المخفي والمحذوف ناعماً مستثنى من العرض والتحرير (يُدار من تبويب الحقول). */
  const accountsEntry = repo.customTables.find((ct) => ct.tabId === 'accounts')
  const baseDefs = applyBaseLabels(ACCOUNT_FIELD_DEFS, accountsEntry?.labels ?? [])
  const hiddenSet = new Set(accountsEntry?.hidden ?? [])
  const deletedSet = new Set(accountsEntry?.deleted ?? [])
  const baseVisible = (key: string) => !hiddenSet.has(key) && !deletedSet.has(key)
  const uiLang = lang === 'en' ? 'en' : 'ar'
  const baseLabel = (key: string, fallback: string) => {
    const def = baseDefs.find((d) => d.key === key)
    return def ? physicalLabel(def, uiLang) : fallback
  }
  const extraDefs: PhysicalFieldDef[] = (accountsEntry?.columns ?? [])
    .map(customColumnToDef)
    .filter((d) => !hiddenSet.has(d.key) && !deletedSet.has(d.key))

  /** قيم الإضافيات في الحوار المفتوح (نصوص — تُحوَّل عند الحفظ). */
  const [extraValues, setExtraValues] = useState<Record<string, string>>({})
  const toStrMap = (extra: unknown): Record<string, string> => {
    if (!extra || typeof extra !== 'object') return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(extra as Record<string, unknown>)) {
      out[k] = typeof v === 'number' && Number.isFinite(v) ? String(v) : typeof v === 'string' ? v : ''
    }
    return out
  }
  /** قيم المحرر المضمن المفتوح (تُملأ عند الفتح — الحفظ يقرأ منها مباشرة). */
  const [emailForm, setEmailForm] = useState<AccountValues>(EMPTY_ACCOUNT_VALUES)
  const [siteForm, setSiteForm] = useState<SiteAccountValues>(EMPTY_SITE_VALUES)
  const openAddDialog = (kind: 'email' | 'site') => {
    setExtraValues({})
    if (kind === 'email') setEmailForm({ ...EMPTY_ACCOUNT_VALUES })
    else setSiteForm({ ...EMPTY_SITE_VALUES })
    setAccountDialog({ mode: 'add', kind })
  }
  const openEditDialog = (accountId: string) => {
    const acc = repo.accounts.find((a) => a.id === accountId)
    setExtraValues(toStrMap(acc?.extra))
    if (acc?.kind === 'site') {
      setSiteForm({
        site: acc?.title ?? '',
        username: acc?.username ?? '',
        passwordValue: acc?.password ?? '',
        url: acc?.url ?? '',
      })
      setAccountDialog({ mode: 'edit', kind: 'site', id: accountId })
    } else {
      setEmailForm({
        title: acc?.title ?? '',
        email: acc?.email ?? '',
        accountName: acc?.accountName ?? '',
        username: acc?.username ?? '',
        recoveryEmail: acc?.recoveryEmail ?? '',
        passwordValue: acc?.password ?? '',
      })
      setAccountDialog({ mode: 'edit', kind: 'email', id: accountId })
    }
  }
  const cancelEditing = () => {
    setAccountDialog(null)
  }
  /** تحقق الإضافيات قبل الحفظ (يطابق الخلفية: تاريخ ISO وسنة 1900–2100). */
  const extraError = (): string | null => {
    for (const def of extraDefs) {
      const bad = validatePhysicalValue(def, extraValues[def.key] ?? '')
      if (bad) return t(`physicalForm.${bad}`, { label: physicalLabel(def, uiLang) })
    }
    return null
  }
  const buildExtraOut = (): Record<string, string | number | null> => {
    const out: Record<string, string | number | null> = {}
    for (const def of extraDefs) {
      const v = (extraValues[def.key] ?? '').trim()
      out[def.key] = def.type === 'number' ? (v === '' ? null : Number(v)) : v
    }
    return out
  }

  useImperativeHandle(ref, () => ({
    openAddEmail: () => openAddDialog('email'),
  }), [])

  const currentMember = (repo?.peoples ?? []).find((member) => member.id === activeMemberId) ?? null
  const activeTab = repo?.tabs.find((tab) => tab.id === 'accounts') ?? null
  const memberAccounts: FamilyAccount[] = (repo?.accounts ?? [])
    .filter((account) => account.recordId === activeMemberId)
    .map((account) => ({
      id: account.id,
      title: account.title,
      email: account.email ?? undefined,
      accountName: account.accountName ?? undefined,
      username: account.username ?? undefined,
      recoveryEmail: account.recoveryEmail ?? undefined,
      password: account.password,
      kind: account.kind,
      url: account.url ?? undefined,
      extra: account.extra ?? {},
    }))

  const runMutation = async (op: () => Promise<RepoData>, done?: () => void) => {
    if (mutBusy) return
    setMutError('')
    setMutBusy(true)
    try {
      const data = await op()
      onRepoUpdated(data)
      done?.()
    } catch (e) {
      setMutError(e instanceof Error ? e.message : t('pageRepoViewer.saveChangeError'))
    } finally {
      setMutBusy(false)
    }
  }

  const submitAccount = () => {
    if (!currentMember) return
    const values: AccountValues = {
      title: emailForm.title.trim(),
      email: emailForm.email.trim(),
      accountName: emailForm.accountName.trim(),
      username: emailForm.username.trim(),
      recoveryEmail: emailForm.recoveryEmail.trim(),
      passwordValue: emailForm.passwordValue,
    }
    if (!values.title) return
    const bad = extraError()
    if (bad) {
      setMutError(bad)
      return
    }
    const extras = buildExtraOut()
    if (accountDialog?.mode === 'edit' && accountDialog.id) {
      const id = accountDialog.id
      void runMutation(
        async () => {
          let data = await updateAccount(repo.meta.id, repoPassword, id, {
            title: values.title,
            email: values.email || null,
            accountName: values.accountName || null,
            username: values.username || null,
            recoveryEmail: values.recoveryEmail || null,
            passwordValue: values.passwordValue,
            kind: 'email',
            url: null,
          })
          if (extraDefs.length > 0) {
            data = await updateAccountExtra(repo.meta.id, repoPassword, id, extras)
          }
          return data
        },
        () => setAccountDialog(null),
      )
    } else {
      const newId = generateId()
      void runMutation(
        async () => {
          let data = await addAccount(repo.meta.id, repoPassword, currentMember.id, {
            title: values.title,
            email: values.email || null,
            accountName: values.accountName || null,
            username: values.username || null,
            recoveryEmail: values.recoveryEmail || null,
            passwordValue: values.passwordValue,
            kind: 'email',
            url: null,
          }, newId)
          if (extraDefs.length > 0) {
            data = await updateAccountExtra(repo.meta.id, repoPassword, newId, extras)
          }
          return data
        },
        () => setAccountDialog(null),
      )
    }
  }

  const submitSiteAccount = () => {
    if (!currentMember) return
    const values: SiteAccountValues = {
      site: siteForm.site.trim(),
      username: siteForm.username.trim(),
      passwordValue: siteForm.passwordValue,
      url: normalizeSiteUrl(siteForm.url),
    }
    if (!values.site) return
    const bad = extraError()
    if (bad) {
      setMutError(bad)
      return
    }
    const extras = buildExtraOut()
    if (accountDialog?.mode === 'edit' && accountDialog.id) {
      const id = accountDialog.id
      void runMutation(
        async () => {
          let data = await updateAccount(repo.meta.id, repoPassword, id, {
            title: values.site,
            email: null,
            accountName: null,
            username: values.username || null,
            recoveryEmail: null,
            passwordValue: values.passwordValue,
            kind: 'site',
            url: values.url || null,
          })
          if (extraDefs.length > 0) {
            data = await updateAccountExtra(repo.meta.id, repoPassword, id, extras)
          }
          return data
        },
        () => setAccountDialog(null),
      )
    } else {
      const newId = generateId()
      void runMutation(
        async () => {
          let data = await addAccount(repo.meta.id, repoPassword, currentMember.id, {
            title: values.site,
            email: null,
            accountName: null,
            username: values.username || null,
            recoveryEmail: null,
            passwordValue: values.passwordValue,
            kind: 'site',
            url: values.url || null,
          }, newId)
          if (extraDefs.length > 0) {
            data = await updateAccountExtra(repo.meta.id, repoPassword, newId, extras)
          }
          return data
        },
        () => setAccountDialog(null),
      )
    }
  }

  const askDeleteAccount = (id: string) => {
    const acc = repo.accounts.find((a) => a.id === id)
    if (!acc) return
    setPendingDelete({ id, title: acc.title })
  }

  const toggleExpanded = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const copyValue = async (value: string, fieldKey: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedField(fieldKey)
      toast.success(t('accountsPanel.valueCopied'))
      window.setTimeout(() => setCopiedField(null), 1800)
    } catch {
      setCopiedField(null)
      toast.error(t('accountsPanel.clipboardError'))
    }
  }

  const openUrlValue = async (value: string) => {
    try {
      await openExternalUrl(value)
    } catch {
      toast.error(t('accountsPanel.openUrlError'))
    }
  }

  const togglePassword = (fieldKey: string) => {
    setRevealedPasswords((current) => {
      const next = new Set(current)
      if (next.has(fieldKey)) next.delete(fieldKey)
      else next.add(fieldKey)
      return next
    })
  }

  const emailAccounts = memberAccounts.filter((account) => account.kind !== 'site')
  const siteAccounts = memberAccounts.filter((account) => account.kind === 'site')
  const showGroupLabels = emailAccounts.length > 0 && siteAccounts.length > 0

  const renderField = (accountId: string, field: AccountValue, dir: 'auto' | 'ltr', extraAction?: ReactNode) => {
    const fieldKey = `${accountId}-${field.key}`
    const isRevealed = revealedPasswords.has(fieldKey)
    const isCopied = copiedField === fieldKey
    return (
      <div className="account-field" key={field.key}>
        <label className="account-field-label" htmlFor={fieldKey}>{field.label}</label>
        <div className="account-field-control">
          <ReadonlyInput
            id={fieldKey}
            className="account-field-value"
            type={field.secret && !isRevealed ? 'password' : 'text'}
            value={field.value}
            dir={dir}
            autoComplete="off"
            spellCheck={false}
            actions={[
              field.secret ? (
                <Tooltip content={isRevealed ? t('accountsPanel.hidePassword') : t('accountsPanel.showPassword')}>
                <button
                  className="account-action"
                  type="button"
                  aria-label={isRevealed ? t('accountsPanel.hidePassword') : t('accountsPanel.showPassword')}
                  onClick={() => togglePassword(fieldKey)}
                >
                  {isRevealed ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
                </Tooltip>
              ) : (extraAction ?? null),
              <Tooltip content={isCopied ? t('accountsPanel.copied') : t('accountsPanel.copyLabel', { label: field.label })}>
              <button
                className={`account-action${isCopied ? ' is-copied' : ''}`}
                type="button"
                aria-label={isCopied ? t('accountsPanel.copiedLabel', { label: field.label }) : t('accountsPanel.copyLabel', { label: field.label })}
                onClick={() => void copyValue(field.value, fieldKey)}
              >
                {isCopied ? <Check size={15} /> : field.secret ? <KeyRound size={14} /> : <Copy size={14} />}
              </button>
              </Tooltip>,
            ]}
          />
        </div>
      </div>
    )
  }

  const renderCardActions = (accountId: string) => (
    <>
      <Tooltip content={t('accountsPanel.editBtn')}>
      <button
        className="account-action"
        type="button"
        aria-label={t('accountsPanel.editBtn')}
        disabled={mutBusy}
        onClick={() => openEditDialog(accountId)}
      >
        <Pencil size={14} />
      </button>
      </Tooltip>
      <Tooltip content={t('accountsPanel.deleteBtn')} tone="danger">
      <button
        className="account-action"
        type="button"
        aria-label={t('accountsPanel.deleteBtn')}
        disabled={mutBusy}
        onClick={() => askDeleteAccount(accountId)}
      >
        <Trash2 size={14} />
      </button>
      </Tooltip>
    </>
  )

  const renderExpandToggle = (accountId: string) => {
    const expanded = expandedIds.has(accountId)
    return (
      <Tooltip content={expanded ? t('accountsPanel.collapseDetails') : t('accountsPanel.expandDetails')}>
      <button
        className="account-action"
        type="button"
        aria-expanded={expanded}
        aria-controls={`account-fields-${accountId}`}
        aria-label={expanded ? t('accountsPanel.collapseDetails') : t('accountsPanel.expandDetails')}
        onClick={() => toggleExpanded(accountId)}
      >
        {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>
      </Tooltip>
    )
  }

  const renderExtras = (account: FamilyAccount) => {
    const row = account.extra ?? {}
    return extraDefs.map((def) => renderField(
      account.id,
      { key: def.key, label: physicalLabel(def, uiLang), value: physicalDisplayValue(row, def, uiLang) },
      'auto',
    ))
  }

  const renderEmailCard = (account: FamilyAccount) => {
    // كل الحقول دائماً (حتى الفارغ) للسماح برؤية النواقص ثم التعديل من المودال.
    // المخفي/المحذوف ناعماً مستثنى (يُدار من تبويب الحقول) — وكلمة المرور ثابتة دائماً.
    const values: AccountValue[] = [
      { key: 'email', label: baseLabel('email', t('accountsPanel.emailLabel')), value: account.email ?? '' },
      { key: 'account_name', label: baseLabel('account_name', t('accountsPanel.accountNameLabel')), value: account.accountName ?? '' },
      { key: 'username', label: baseLabel('username', t('accountsPanel.usernameLabel')), value: account.username ?? '' },
      { key: 'recovery_email', label: baseLabel('recovery_email', t('accountsPanel.recoveryEmailLabel')), value: account.recoveryEmail ?? '' },
      { key: 'password', label: t('accountsPanel.passwordLabel'), value: account.password, secret: true },
    ].filter((field) => field.key === 'password' || baseVisible(field.key))
    return (
      <article className="account-card" key={account.id}>
        <h4 className="account-title">
          <Mail size={19} />
          <span className="min-w-0 flex-1 truncate">{account.title}</span>
          <span className="account-kind">{t('accountsPanel.kindEmailLabel')}</span>
          {renderCardActions(account.id)}
          {renderExpandToggle(account.id)}
        </h4>
        {expandedIds.has(account.id) && (
          <div className="account-fields" id={`account-fields-${account.id}`}>
            {values.map((field) => renderField(account.id, field, 'auto'))}
            {renderExtras(account)}
          </div>
        )}
      </article>
    )
  }

  const renderSiteCard = (account: FamilyAccount) => {
    const usernameField: AccountValue = { key: 'username', label: baseLabel('username', t('accountsPanel.usernameLabel')), value: account.username ?? '' }
    const passwordField: AccountValue = { key: 'password', label: t('accountsPanel.passwordLabel'), value: account.password, secret: true }
    const urlField: AccountValue = { key: 'url', label: baseLabel('url', t('accountsPanel.urlLabel')), value: account.url ?? '' }
    const siteFields = [usernameField, passwordField, urlField]
      .filter((field) => field.key === 'password' || baseVisible(field.key))
    const openAction = account.url ? (
      <Tooltip content={t('accountsPanel.openUrl')}>
      <button
        className="account-action"
        type="button"
        aria-label={t('accountsPanel.openUrl')}
        onClick={() => void openUrlValue(account.url as string)}
      >
        <ExternalLink size={14} />
      </button>
      </Tooltip>
    ) : null
    return (
      <article className="account-card" key={account.id}>
        <h4 className="account-title">
          <Globe size={19} />
          <span className="min-w-0 flex-1 truncate">{account.title}</span>
          <span className="account-kind is-site">{t('accountsPanel.kindSiteLabel')}</span>
          {renderCardActions(account.id)}
          {renderExpandToggle(account.id)}
        </h4>
        {expandedIds.has(account.id) && (
          <div className="account-fields" id={`account-fields-${account.id}`}>
            {siteFields.map((field) => renderField(account.id, field, 'ltr', field.key === 'url' ? openAction : undefined))}
            {renderExtras(account)}
          </div>
        )}
      </article>
    )
  }

  if (!currentMember) {
    return <p className="vault-empty">{t('pageRepoViewer.noRecords')}</p>
  }

  return (
    <>
    <section className="records-section" aria-label={t('pageRepoViewer.accountsSectionAria')}>
      <RepoTabsHeaderControl
        kicker={tabTitle(activeTab ?? { title: '', titleEn: '' }, lang) || t('accountsPanel.title')}
        title={recordName(currentMember, lang)}
        subtitle={recordRelation(currentMember, lang) || '—'}
        fieldCountText={t('pageRepoViewer.fieldCount', { count: String(memberAccounts.length).padStart(2, '0') })}
        editTitle={t('pageRepoViewer.editMemberTitle')}
        editAria={t('pageRepoViewer.editMemberAria', { name: recordName(currentMember, lang) })}
        deleteTitle={t('pageRepoViewer.deleteMemberTitle')}
        deleteAria={t('pageRepoViewer.deleteMemberAria', { name: recordName(currentMember, lang) })}
        editDisabled={mutBusy}
        deleteDisabled={mutBusy}
        onEdit={onEditMember}
        onDelete={onDeleteMember}
      />
      <div className="accounts-section" aria-labelledby="accounts-title">
        <header className="accounts-heading">
          <div>
            <p className="record-kicker">{t('accountsPanel.kicker')}</p>
            <h3 id="accounts-title">{t('accountsPanel.title')}</h3>
          </div>
          <span className="flex items-center gap-2">
            <span className="accounts-count">{memberAccounts.length.toString().padStart(2, '0')}</span>
          </span>
        </header>

        {accountDialog ? (
          <div className="viewer-actions-col">
            <div className="viewer-actions-row viewer-actions-even">
              <button
                type="button"
                className="add-field-btn"
                disabled={mutBusy || (accountDialog.kind === 'email' ? !emailForm.title.trim() : !siteForm.site.trim())}
                onClick={() => { if (accountDialog.kind === 'email') submitAccount(); else submitSiteAccount() }}
              >
                <Save size={15} /> {accountDialog.kind === 'email' ? t('modalAccount.saveBtn') : t('modalSiteAccount.saveBtn')}
              </button>
              <button
                type="button"
                className="add-field-btn"
                disabled={mutBusy}
                onClick={cancelEditing}
              >
                <X size={15} /> {accountDialog.kind === 'email' ? t('modalAccount.cancelBtn') : t('modalSiteAccount.cancelBtn')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="viewer-actions-col">
              <div className="viewer-actions-row">
                <button
                  type="button"
                  className="add-field-btn"
                  disabled={mutBusy}
                  onClick={() => openAddDialog('email')}
                >
                  <Mail size={15} /> {t('accountsPanel.addEmailBtn')}
                </button>
                <button
                  type="button"
                  className="add-field-btn"
                  disabled={mutBusy}
                  onClick={() => openAddDialog('site')}
                >
                  <Globe size={15} /> {t('accountsPanel.addSiteBtn')}
                </button>
              </div>
            </div>

            <div className="viewer-actions-col">
              <Tooltip content={t('pageRepoViewer.manageFieldsBtn')}>
              <button
                type="button"
                className="add-field-btn"
                disabled={mutBusy}
                onClick={() => onManageFields('accounts')}
              >
                <SlidersHorizontal size={15} /> {t('pageRepoViewer.manageFieldsBtn')}
              </button>
              </Tooltip>
            </div>
          </>
        )}

        {accountDialog ? (
          accountDialog.kind === 'email' ? (
            <AccountEditor
              values={emailForm}
              extraDefs={extraDefs}
              extraValues={extraValues}
              busy={mutBusy}
              onChange={(key, value) => setEmailForm((prev) => ({ ...prev, [key]: value }))}
              onExtraChange={(key, value) => setExtraValues((prev) => ({ ...prev, [key]: value }))}
            />
          ) : (
            <SiteAccountEditor
              values={siteForm}
              extraDefs={extraDefs}
              extraValues={extraValues}
              busy={mutBusy}
              onChange={(key, value) => setSiteForm((prev) => ({ ...prev, [key]: value }))}
              onExtraChange={(key, value) => setExtraValues((prev) => ({ ...prev, [key]: value }))}
            />
          )
        ) : (
          memberAccounts.length ? (
          <>
            {emailAccounts.length > 0 && (
              <div className="accounts-grid">
                {showGroupLabels && <p className="record-kicker">{t('accountsPanel.emailGroupLabel')}</p>}
                {emailAccounts.map(renderEmailCard)}
              </div>
            )}
            {siteAccounts.length > 0 && (
              <div className="accounts-grid">
                {showGroupLabels && <p className="record-kicker">{t('accountsPanel.siteGroupLabel')}</p>}
                {siteAccounts.map(renderSiteCard)}
              </div>
            )}
          </>
        ) : <p className="accounts-empty">{t('accountsPanel.emptyAccounts')}</p>
        )}

        <p className="accounts-feedback">
          {t('accountsPanel.passwordHint')}
        </p>
        {mutError && <p className="vault-error" role="alert">{mutError}</p>}
      </div>
    </section>
    {pendingDelete && (
      <ModalMessages
        isOpen
        variant="danger"
        title={t('modalMessages.deleteTitle')}
        message={t('accountsPanel.deleteConfirm', { title: pendingDelete.title })}
        buttons={[
          { id: 'cancel', label: t('modalMessages.cancelBtn'), variant: 'secondary' },
          { id: 'confirm', label: t('modalMessages.deleteBtn'), variant: 'danger' },
        ]}
        onButtonClicked={(info) => {
          if (info.id === 'confirm') void runMutation(() => deleteAccount(repo.meta.id, repoPassword, pendingDelete.id))
        }}
        onClose={() => setPendingDelete(null)}
      />
    )}
    </>
  )
}
