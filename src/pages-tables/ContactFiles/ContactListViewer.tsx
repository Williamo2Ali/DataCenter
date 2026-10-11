// عارض جهات الاتصال — مربع بحث + شبكة بطاقات قابلة للطي (بأسلوب كارد الهاتف).
// البحث والطي والنسخ والاتصال داخلية؛ التعديل والحذف عبر الخاصيات (المودالات في الصفحة).
import { useState } from 'react'
import { Check, ChevronDown, ChevronUp, Copy, Pencil, Phone, Trash2, User } from 'lucide-react'
import TextSearch from '../../components/Custom/TextSearch'
import { ReadonlyInput } from '../../components/ReadonlyInput'
import { Tooltip } from '../../components/Tooltip'
import { useLanguage } from '../../language/LanguageContext'
import { useToast } from 'react-theme-toast'
import type { FieldLang } from '../../lib/appSettings'
import { openExternalUrl } from '../../lib/openUrl'
import {
  physicalDisplayValue, physicalLabel,
  type PhysicalFieldDef,
} from '../../lib/physicalTables'
import type { RepoContact } from '../../repos/repoService'

type ContactListViewerProps = {
  contacts: RepoContact[]
  fieldLang: FieldLang
  busy: boolean
  baseDefs: PhysicalFieldDef[]
  hidden: string[]
  deleted: string[]
  extraDefs: PhysicalFieldDef[]
  onEdit: (id: string) => void
  onDelete: (id: string) => void
}

type FieldItem = {
  key: string
  label: string
  value: string
  dir: 'auto' | 'ltr'
  call?: string
}

export default function ContactListViewer({
  contacts,
  fieldLang,
  busy,
  baseDefs,
  hidden,
  deleted,
  extraDefs,
  onEdit,
  onDelete,
}: ContactListViewerProps) {
  const { t, lang } = useLanguage()
  const toast = useToast()
  const [draft, setDraft] = useState('')
  /** نص البحث المطبَّق فعلياً — الترشيح لا يقرأ الكتابة مباشرة. */
  const [applied, setApplied] = useState('')
  /** الترقيم: أول 100 فقط + زر المزيد — بدل رسم الكل دفعة واحدة. */
  const [limit, setLimit] = useState(100)
  const applySearch = (value: string) => {
    setApplied(value)
    setLimit(100)
  }
  /** البطاقات الموسّعة — الافتراضي مطوية (الاسم + سهم فقط). */
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const uiLang = lang === 'en' ? 'en' : 'ar'
  const hiddenSet = new Set(hidden)
  const deletedSet = new Set(deleted)
  const baseVisible = (key: string) => !hiddenSet.has(key) && !deletedSet.has(key)
  const baseLabel = (key: string, fallback: string) => {
    const def = baseDefs.find((d) => d.key === key)
    return def ? physicalLabel(def, uiLang) : fallback
  }

  const visible = (() => {
    const q = applied.trim()
    if (!q) return contacts
    return contacts.filter((c) =>
      [c.name, c.nameEn, c.phone, c.email].some((s) => (s ?? '').includes(q)),
    )
  })()

  const contactName = (name: string, nameEn: string): string =>
    fieldLang === 'en' ? nameEn.trim() || name : name.trim() || nameEn

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

  const callValue = async (phone: string) => {
    try {
      await openExternalUrl(`tel:${phone.trim()}`)
    } catch {
      toast.error(t('accountsPanel.openUrlError'))
    }
  }

  const renderField = (contactId: string, item: FieldItem) => {
    const fieldKey = `${contactId}-${item.key}`
    const isCopied = copiedField === fieldKey
    return (
      <div className="field-row" key={item.key}>
        <label className="field-label" htmlFor={fieldKey}>{item.label}</label>
        <div className="field-control">
          <ReadonlyInput
            id={fieldKey}
            className="field-value has-actions"
            type="text"
            value={item.value}
            dir={item.dir}
            autoComplete="off"
            spellCheck={false}
            actions={[
              item.call ? (
                <Tooltip content={t('modalContact.callBtn')}>
                <button
                  className="edit-button"
                  type="button"
                  aria-label={t('modalContact.callBtn')}
                  onClick={() => void callValue(item.call as string)}
                >
                  <Phone size={14} />
                </button>
                </Tooltip>
              ) : null,
              <Tooltip content={isCopied ? t('accountsPanel.copied') : t('accountsPanel.copyLabel', { label: item.label })}>
              <button
                className={`copy-button${isCopied ? ' is-copied' : ''}`}
                type="button"
                aria-label={isCopied ? t('accountsPanel.copiedLabel', { label: item.label }) : t('accountsPanel.copyLabel', { label: item.label })}
                onClick={() => void copyValue(item.value, fieldKey)}
              >
                {isCopied ? <Check size={15} /> : <Copy size={14} />}
              </button>
              </Tooltip>,
            ]}
          />
        </div>
      </div>
    )
  }

  const renderCard = (c: RepoContact) => {
    const row = (c.extra ?? {}) as Record<string, unknown>
    const items: FieldItem[] = []
    if (baseVisible('phone')) {
      items.push({
        key: 'phone',
        label: baseLabel('phone', t('modalContact.phoneLabel')),
        value: c.phone ?? '',
        dir: 'ltr',
        call: c.phone.trim() ? c.phone : undefined,
      })
    }
    if (baseVisible('email')) {
      items.push({
        key: 'email',
        label: baseLabel('email', t('modalContact.emailLabel')),
        value: c.email ?? '',
        dir: 'ltr',
      })
    }
    if (baseVisible('address')) {
      items.push({
        key: 'address',
        label: baseLabel('address', t('modalContact.addressLabel')),
        value: c.address.trim() || c.addressEn,
        dir: 'auto',
      })
    }
    for (const def of extraDefs.filter((d) => !hiddenSet.has(d.key) && !deletedSet.has(d.key))) {
      items.push({
        key: def.key,
        label: physicalLabel(def, uiLang),
        value: physicalDisplayValue(row, def, uiLang),
        dir: 'auto',
      })
    }
    const expanded = expandedIds.has(c.id)
    return (
      <article className="account-card" key={c.id}>
        <h4 className="account-title">
          <span className="grid size-12 flex-none place-items-center overflow-hidden rounded-full bg-[#e7f1ea] text-green dark:bg-[#2c3530] dark:text-[#a5d4b9]" aria-hidden="true">
            <User size={38} strokeWidth={1.4} />
          </span>
          <span className="min-w-0 flex-1 truncate" dir="auto">{contactName(c.name, c.nameEn) || '—'}</span>
          <Tooltip content={t('modalContact.editBtn')}>
          <button
            className="edit-button"
            type="button"
            aria-label={t('modalContact.editBtn')}
            disabled={busy}
            onClick={() => onEdit(c.id)}
          >
            <Pencil size={14} />
          </button>
          </Tooltip>
          <Tooltip content={t('modalContact.deleteBtn')} tone="danger">
          <button
            className="edit-button"
            type="button"
            aria-label={t('modalContact.deleteBtn')}
            disabled={busy}
            onClick={() => onDelete(c.id)}
          >
            <Trash2 size={14} />
          </button>
          </Tooltip>
          <Tooltip content={expanded ? t('accountsPanel.collapseDetails') : t('accountsPanel.expandDetails')}>
          <button
            className="edit-button"
            type="button"
            aria-expanded={expanded}
            aria-controls={`contact-fields-${c.id}`}
            aria-label={expanded ? t('accountsPanel.collapseDetails') : t('accountsPanel.expandDetails')}
            onClick={() => toggleExpanded(c.id)}
          >
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          </Tooltip>
        </h4>
        {expanded && (
          <div className="account-fields" id={`contact-fields-${c.id}`}>
            {items.map((item) => renderField(c.id, item))}
          </div>
        )}
      </article>
    )
  }

  return (
    <>
      <div className="viewer-actions-col">
        <TextSearch
          value={draft}
          onChange={setDraft}
          onSearch={() => applySearch(draft)}
          onClear={() => { setDraft(''); applySearch('') }}
          searching={applied !== ''}
          placeholder={t('modalContact.searchPh')}
        />
      </div>
      {visible.length === 0 ? (
        <div className="tabs-empty-state" role="status">
          <p>{t('pageRepoViewer.noContacts')}</p>
        </div>
      ) : (
        <div className="mx-auto w-[92%]">
          <div className="accounts-grid">
            {visible.slice(0, limit).map(renderCard)}
          </div>
          {visible.length > limit && (
            <button
              type="button"
              className="add-field-btn mt-2.5 w-full"
              onClick={() => setLimit((prev) => prev + 100)}
            >
              {t('modalContact.showMoreBtn', { left: visible.length - limit })}
            </button>
          )}
        </div>
      )}
    </>
  )
}
