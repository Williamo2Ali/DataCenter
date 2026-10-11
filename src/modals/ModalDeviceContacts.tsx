// مودال اختيار جهات من دفتر الهاتف — بحث + تحديد متعدد + تأكيد.
// (أندرويد فقط — يُفتَح بعد منح إذن القراءة.)
import { useEffect, useMemo, useState } from 'react'
import { Check, Save, Smartphone, X } from 'lucide-react'
import { ClearTextInput } from '../components/ClearTextInput'
import { Tooltip } from '../components/Tooltip'
import { useLanguage } from '../language/LanguageContext'
import type { DeviceContact } from '../lib/deviceContacts'

type ModalDeviceContactsProps = {
  isOpen: boolean
  contacts: DeviceContact[]
  busy?: boolean
  onClose: () => void
  onConfirm: (selected: DeviceContact[]) => void
}

export default function ModalDeviceContacts({ isOpen, contacts, busy, onClose, onConfirm }: ModalDeviceContactsProps) {
  const { t } = useLanguage()
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Set<number>>(() => new Set())

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setPicked(new Set())
    }
  }, [isOpen])

  const filtered = useMemo(() => {
    const q = query.trim()
    const list = contacts.map((c, index) => ({ c, index }))
    if (!q) return list
    return list.filter(({ c }) =>
      [c.name, ...(c.phones ?? []), ...(c.emails ?? [])].some((s) => (s ?? '').includes(q)),
    )
  }, [contacts, query])

  if (!isOpen) return null

  const toggle = (index: number) => {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const toggleAll = () => {
    setPicked((prev) => {
      if (prev.size === filtered.length && filtered.length > 0) return new Set()
      return new Set(filtered.map(({ index }) => index))
    })
  }

  const selected = contacts.filter((_, index) => picked.has(index))

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="device-contacts-title">
      <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2 id="device-contacts-title">{t('modalContact.devicePickerTitle')}</h2>
          <Tooltip content={t('modalContact.closeAria')}>
          <button type="button" className="modal-close" onClick={onClose} disabled={busy} aria-label={t('modalContact.closeAria')}>
            <X size={18} />
          </button>
          </Tooltip>
        </header>
        <div className="modal-body">
          <div className="modal-field">
            <ClearTextInput
              type="search"
              className="modal-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('modalContact.devicePickerSearchPh')}
              aria-label={t('modalContact.devicePickerSearchPh')}
              autoComplete="off"
              dir="auto"
            />
          </div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[0.75rem] text-[#758184]">
              {t('modalContact.devicePickerCount', { picked: picked.size, total: contacts.length })}
            </span>
            <button
              type="button"
              className="vault-secondary vault-small"
              disabled={busy || filtered.length === 0}
              onClick={toggleAll}
            >
              {picked.size === filtered.length && filtered.length > 0
                ? t('modalContact.devicePickerClear')
                : t('modalContact.devicePickerAll')}
            </button>
          </div>
          <div className="flex max-h-[40dvh] flex-col gap-2 overflow-y-auto" role="list">
            {filtered.length === 0 && (
              <p className="vault-empty">{t('modalContact.devicePickerEmpty')}</p>
            )}
            {filtered.map(({ c, index }) => {
              const on = picked.has(index)
              const sub = [...(c.phones ?? []).slice(0, 1), ...(c.emails ?? []).slice(0, 1)].join(' · ')
              return (
                <button
                  key={`${c.name}-${index}`}
                  type="button"
                  role="listitem"
                  aria-pressed={on}
                  disabled={busy}
                  onClick={() => toggle(index)}
                  className={`flex items-center gap-2.5 rounded-lg border p-2.5 text-start ${on ? 'border-[#76a68c] bg-[#edf4ef] dark:border-[#8cc5a4] dark:bg-[#2c3530]' : 'border-[#e8ede9] bg-[#f8faf8] dark:border-[#3b3b41] dark:bg-[#242428]'}`}
                >
                  <span className={`grid size-6 flex-none place-items-center rounded border ${on ? 'border-[#76a68c] bg-[#16715f] text-white' : 'border-[#dfe6e0] bg-white text-transparent dark:border-[#404046] dark:bg-[#29292d]'}`}>
                    <Check size={14} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[0.875rem] font-semibold" dir="auto">
                      {c.name || '—'}
                    </span>
                    {sub !== '' && (
                      <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[0.75rem] text-[#84908c]" dir="auto">{sub}</span>
                    )}
                  </span>
                  <Smartphone size={16} className="flex-none text-[#98a5a1]" aria-hidden="true" />
                </button>
              )
            })}
          </div>
        </div>
        <footer className="modal-footer equal-btns">
          <button type="button" className="modal-btn modal-btn-secondary" onClick={onClose} disabled={busy}>
            <X size={16} /> {t('modalContact.cancelBtn')}
          </button>
          <button
            type="button"
            className="modal-btn modal-btn-primary"
            disabled={busy || selected.length === 0}
            onClick={() => onConfirm(selected)}
          >
            <Save size={16} /> {t('modalContact.devicePickerConfirm', { count: selected.length })}
          </button>
        </footer>
      </div>
    </div>
  )
}
