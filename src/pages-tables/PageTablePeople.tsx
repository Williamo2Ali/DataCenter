// صفحة جدول الأشخاص — إدارة أشخاص المستودع الحالي فقط (يحافظ على عزل المستودعات).
// (نُقلت من pages/PagePeoples — المصدر الوحيد لجدول peoples).
// Mobile First: قائمة بطاقات + بحث + مودال إضافة/تعديل + حذف بتأكيد مفصّل.
// العدّادات: profiles (الجداول الفيزيائية المملوءة من 4) + حساباته + ملفاته.
// ملفات وجهات المحذوف تصبح مشتركة؛ صفوفه 1-1 تُحذف معه.
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Pencil, Plus, Trash2, UserRound } from 'lucide-react'
import { MOBILE_BTN } from '../components/AppHeaderMobile'
import { Tooltip } from "../components/Tooltip"
import ModalMessages from '../modals/ModalMessages'
import PeopleEditor, { type PeopleDialogState } from './PeopleFiles/PeopleEditor'
import { ClearTextInput } from '../components/ClearTextInput'
import { useLanguage } from '../language/LanguageContext'
import { recordName, recordRelation } from '../lib/records'
import {
  addPeople,
  deletePeople,
  updatePeople,
  type RepoData,
} from '../repos/repoService'

type PageTablePeopleProps = {
  repo: RepoData | null
  repoPassword: string | null
  onRepoUpdated: (data: RepoData) => void
  /** منطقة هيدر الموبايل المخصصة: زر إضافة سريع. */
  onHeaderActionChange: (node: ReactNode) => void
}

export default function PageTablePeople({ repo, repoPassword, onRepoUpdated, onHeaderActionChange }: PageTablePeopleProps) {
  const { t, lang } = useLanguage()
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dialog, setDialog] = useState<PeopleDialogState | null>(null)
  /** حذف مؤكد عبر مودال الرسائل (بدل window.confirm). */
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string; profiles: number; accounts: number; files: number } | null>(null)

  // زر الإضافة السريع في هيدر الموبايل — يظهر مع مستودع مفتوح فقط.
  useEffect(() => {
    if (!repo) {
      onHeaderActionChange(null)
      return
    }
    onHeaderActionChange(
      <Tooltip content={t('peoples.addTitle')}>
      <button
        type="button"
        className={MOBILE_BTN}
        aria-label={t('peoples.addTitle')}
        onClick={() => {
          setError('')
          setDialog({ mode: 'add', name: '', nameEn: '', relation: '', relationEn: '' })
        }}
      >
        <Plus size={19} strokeWidth={1.7} />
      </button>
      </Tooltip>,
    )
    return () => onHeaderActionChange(null)
  }, [repo, t, onHeaderActionChange])

  const records = useMemo(
    () => [...(repo?.peoples ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [repo],
  )

  const counts = useMemo(() => {
    const map = new Map<string, { profiles: number; accounts: number; files: number }>()
    if (!repo) return map
    const hiddenOf = (tabId: string): Set<string> => {
      const ct = repo?.customTables.find((ct) => ct.tabId === tabId)
      return new Set([...(ct?.hidden ?? []), ...(ct?.deleted ?? [])])
    }
    const filled = (row: object | undefined, hidden: Set<string>): boolean =>
      !!row && Object.entries(row).some(([k, v]) =>
        !hidden.has(k) &&
        !['id', 'recordId', 'sortOrder', 'createdAt', 'updatedAt', 'graduationYear'].includes(k) &&
        typeof v === 'string' && v.trim() !== '')
    for (const rec of repo.peoples) {
      map.set(rec.id, { profiles: 0, accounts: 0, files: 0 })
    }
    for (const rec of repo.peoples) {
      const c = map.get(rec.id)!
      const pairs: [object | undefined, string][] = [
        [repo.passports.find((r) => r.recordId === rec.id), 'passports'],
        [repo.studies.find((r) => r.recordId === rec.id), 'study'],
        [repo.nationalIds.find((r) => r.recordId === rec.id), 'national_ids'],
        [repo.civils.find((r) => r.recordId === rec.id), 'civil'],
      ]
      for (const [row, tabId] of pairs) {
        if (filled(row, hiddenOf(tabId))) c.profiles += 1
      }
    }
    for (const a of repo.accounts) {
      if (map.has(a.recordId)) map.get(a.recordId)!.accounts += 1
    }
    for (const d of repo.documents) {
      if (d.ownerRecordId && map.has(d.ownerRecordId)) map.get(d.ownerRecordId)!.files += 1
    }
    return map
  }, [repo])

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase()
    if (!q) return records
    return records.filter((r) => `${r.name} ${r.nameEn} ${r.relation} ${r.relationEn}`.toLocaleLowerCase().includes(q))
  }, [records, query])

  if (!repo) {
    return (
      <section className="dashboard" aria-label={t('peoples.pageAria')}>
        <p className="vault-empty">{t('peoples.openRepoFirstHint')}</p>
      </section>
    )
  }

  const runOp = async (op: () => Promise<RepoData>, done?: () => void) => {
    if (busy) return
    setError('')
    setBusy(true)
    try {
      const data = await op()
      onRepoUpdated(data)
      done?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('peoples.saveError'))
    } finally {
      setBusy(false)
    }
  }

  const submitDialog = () => {
    if (!dialog || !dialog.name.trim() || !dialog.nameEn.trim()) return
    const name = dialog.name.trim()
    const nameEn = dialog.nameEn.trim()
    const relation = dialog.relation.trim()
    const relationEn = dialog.relationEn.trim()
    if (dialog.mode === 'add') {
      void runOp(() => addPeople(repo.meta.id, repoPassword, name, nameEn, relation, relationEn), () => setDialog(null))
    } else if (dialog.id) {
      void runOp(() => updatePeople(repo.meta.id, repoPassword, dialog.id!, name, nameEn, relation, relationEn), () => setDialog(null))
    }
  }

  const askDelete = (id: string, name: string) => {
    const c = counts.get(id) ?? { profiles: 0, accounts: 0, files: 0 }
    setPendingDelete({ id, name, profiles: c.profiles, accounts: c.accounts, files: c.files })
  }

  return (
    <section className="dashboard" aria-label={t('peoples.pageAria')}>
      <header className="dashboard-header">
        <div className="dashboard-title-group">
          <p className="dashboard-kicker">{t('peoples.kicker')} — {repo.meta.name}</p>
          <h1 className="dashboard-title">{t('peoples.title')}</h1>
          <p className="dashboard-subtitle">{t('peoples.subtitle')}</p>
        </div>
        <button
          type="button"
          className="vault-primary vault-small"
          disabled={busy}
          onClick={() => {
            setError('')
            setDialog({ mode: 'add', name: '', nameEn: '', relation: '', relationEn: '' })
          }}
        >
          <Plus size={15} /> {t('peoples.addBtn')}
        </button>
      </header>

      {error && <p className="vault-error" role="alert">{error}</p>}

      <div className="mb-3">
        <ClearTextInput
          type="search"
          className="modal-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('peoples.searchPh')}
          aria-label={t('peoples.searchAria')}
          autoComplete="off"
          dir="auto"
        />
      </div>

      {visible.length === 0 ? (
        <p className="vault-empty">{records.length === 0 ? t('peoples.noPeoples') : t('peoples.noMatch')}</p>
      ) : (
        <ul className="m-0 flex flex-col gap-2 p-0" style={{ listStyle: 'none' }} aria-label={t('peoples.pageAria')}>
          {visible.map((rec) => {
            const c = counts.get(rec.id) ?? { profiles: 0, accounts: 0, files: 0 }
            const displayName = recordName(rec, lang)
            const displayRelation = recordRelation(rec, lang)
            return (
              <li
                key={rec.id}
                className="flex items-center gap-2.5 rounded-xl border border-[#e8ede9] bg-white px-3 py-2.5 dark:border-[#3b3b41] dark:bg-[#242428]"
              >
                <span className="grid size-10 flex-none place-items-center rounded-full bg-[#e7f1ea] text-green dark:bg-[#2c3530] dark:text-[#a5d4b9]">
                  <UserRound size={18} strokeWidth={1.7} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.875rem] font-semibold" dir="auto">{displayName}</span>
                  <span className="block truncate text-[0.75rem] text-[#63716d] dark:text-[#b0b0b6]" dir="auto">
                    {displayRelation || '—'}
                  </span>
                  <span className="mt-0.5 block text-[0.6875rem] text-[#63716d] dark:text-[#b0b0b6]" dir="auto">
                    {c.profiles} {t('peoples.profilesLabel')} · {c.accounts} {t('peoples.accountsLabel')} · {c.files} {t('peoples.filesLabel')}
                  </span>
                </span>
                <span className="flex flex-none gap-1.5">
                  <Tooltip content={t('peoples.editAria', { name: displayName })}>
                  <button
                    type="button"
                    className="vault-secondary vault-small"
                    aria-label={t('peoples.editAria', { name: displayName })}
                    disabled={busy}
                    onClick={() => {
                      setError('')
                      setDialog({ mode: 'edit', id: rec.id, name: rec.name, nameEn: rec.nameEn, relation: rec.relation, relationEn: rec.relationEn })
                    }}
                  >
                    <Pencil size={15} />
                  </button>
                  </Tooltip>
                  <Tooltip content={t('peoples.deleteTitle')} tone="danger">
                  <button
                    type="button"
                    className="vault-secondary vault-small"
                    aria-label={t('peoples.deleteAria', { name: displayName })}
                    disabled={busy}
                    onClick={() => askDelete(rec.id, displayName)}
                  >
                    <Trash2 size={15} />
                  </button>
                  </Tooltip>
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {dialog && (
        <PeopleEditor
          dialog={dialog}
          busy={busy}
          onClose={() => setDialog(null)}
          onChange={(patch) => setDialog({ ...dialog, ...patch })}
          onSubmit={submitDialog}
        />
      )}
      {pendingDelete && (
        <ModalMessages
          isOpen
          variant="danger"
          title={t('modalMessages.deleteTitle')}
          message={t('peoples.deleteConfirm', {
            name: pendingDelete.name,
            profiles: pendingDelete.profiles,
            accounts: pendingDelete.accounts,
            files: pendingDelete.files,
          })}
          buttons={[
            { id: 'cancel', label: t('modalMessages.cancelBtn'), variant: 'secondary' },
            { id: 'confirm', label: t('modalMessages.deleteBtn'), variant: 'danger' },
          ]}
          onButtonClicked={(info) => {
            if (info.id === 'confirm') void runOp(() => deletePeople(repo.meta.id, repoPassword, pendingDelete.id))
          }}
          onClose={() => setPendingDelete(null)}
        />
      )}
      <div className="h-5" aria-hidden="true" />
    </section>
  )
}
