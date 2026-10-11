// صفحة جهات الاتصال — منسّق فقط: هيدر + منطقة أزرار + (محرر مضمّن | عارض القائمة).
// التحرير (إضافة/تعديل) داخل الصفحة: تُخفى القائمة والبحث والأزرار، ويحل محلها
// المحرر مع صف حفظ/إلغاء — ثم تعود الصفحة كما كانت.
import { forwardRef, useImperativeHandle, useState } from 'react'
import type { Ref } from 'react'
import { FileDown, FileUp, Info, Plus, Save, SlidersHorizontal, Smartphone, X } from 'lucide-react'
import { generateId } from '@/utils/helpers'
import { open, save } from '@tauri-apps/plugin-dialog'
import { readFile, writeFile } from '@tauri-apps/plugin-fs'
import { Tooltip } from '../components/Tooltip'
import ModalMessages from '../modals/ModalMessages'
import ModalContactSync, { type ContactSyncMode } from '../modals/ModalContactSync'
import ModalDeviceContacts from '../modals/ModalDeviceContacts'
import { useLanguage } from '../language/LanguageContext'
import { useToast } from 'react-theme-toast'
import { usePlatform, isAndroidPlatform } from '../lib/platform'
import { recordName, recordRelation } from '../lib/records'
import type { FieldLang } from '../lib/appSettings'
import {
  CONTACT_FIELD_DEFS, applyBaseLabels, customColumnToDef,
  physicalLabel, validatePhysicalValue,
  type PhysicalFieldDef,
} from '../lib/physicalTables'
import {
  addDeviceContact, ensureDeviceContactPermission, getDeviceContacts,
  type DeviceContact,
} from '../lib/deviceContacts'
import { tabTitle } from '../lib/tabTitle'
import { buildVCard, parseVCard, phoneKey, type VCardContact } from '../lib/vcard'
import {
  addContact,
  deleteContact,
  updateContact,
  updateContactExtra,
  type ContactInput,
  type RepoData,
} from '../repos/repoService'
import ContactEditor, { EMPTY_CONTACT_FORM, type ContactFormValues } from './ContactFiles/ContactEditor'
import ContactListViewer from './ContactFiles/ContactListViewer'
import type { OwnerMultiState } from '../modals/ModalOwnerSelection'

export type ContactsApi = {
  /** طلب حذف الكل ضمن التحديد الحالي (يفتح تأكيد الصفحة). */
  requestDeleteAll: () => void
}

type PageTableContactsProps = {
  repo: RepoData
  repoPassword: string | null
  fieldLang: FieldLang
  onRepoUpdated: (data: RepoData) => void
  onManageFields: (tabId: string) => void
  /** التحديد المتعدد للملاك — يملكه PageRepoViewer (الكل/متعدد/مفرد، بلا مشتركة). */
  owners: OwnerMultiState
}

type EditingState = { mode: 'add' } | { mode: 'edit'; id: string } | null

const toStrMap = (extra: unknown): Record<string, string> => {
  if (!extra || typeof extra !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(extra as Record<string, unknown>)) {
    out[k] = typeof v === 'number' && Number.isFinite(v) ? String(v) : typeof v === 'string' ? v : ''
  }
  return out
}

function PageTableContactsInner({
  repo,
  repoPassword,
  fieldLang,
  onRepoUpdated,
  onManageFields,
  owners,
}: PageTableContactsProps, ref: Ref<ContactsApi>) {
  const { t, lang } = useLanguage()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  /** التحرير المضمّن — null = وضع العرض (القائمة + البحث + الأزرار). */
  const [editing, setEditing] = useState<EditingState>(null)
  const [form, setForm] = useState<ContactFormValues>(EMPTY_CONTACT_FORM)
  /** قيم الإضافيات في المحرر المفتوح (نصوص — تُحوَّل عند الحفظ). */
  const [extraValues, setExtraValues] = useState<Record<string, string>>({})
  /** حذف مؤكد عبر مودال الرسائل (بدل window.confirm). */
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null)
  /** استيراد vCard بانتظار التأكيد (جديدة + مكررة تُتخطى). */
  const [pendingImport, setPendingImport] = useState<{ items: VCardContact[]; skipped: number } | null>(null)
  /** قائمة دفتر الهاتف بانتظار الاختيار + فتح المنتقي والقائمة. */
  const [deviceList, setDeviceList] = useState<DeviceContact[]>([])
  const [devicePickerOpen, setDevicePickerOpen] = useState(false)
  const [deviceMenuOpen, setDeviceMenuOpen] = useState(false)
  /** تصدير للهاتف بانتظار التأكيد. */
  const [pendingDeviceExport, setPendingDeviceExport] = useState(false)
  /** حذف الكل ضمن التحديد بانتظار التأكيد — لقطة معرفات لحظة الطلب. */
  const [pendingDeleteAll, setPendingDeleteAll] = useState<{ ids: string[] } | null>(null)
  const isAndroid = isAndroidPlatform(usePlatform())

  const contacts = repo?.contacts ?? []
  const activeTab = repo?.tabs.find((tab) => tab.id === 'contacts') ?? null
  /** المالك الافتراضي للجهات الجديدة — الفرد الأول في المستودع. */
  const firstPersonId = [...(repo?.peoples ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)[0]?.id ?? ''

  /** أعمدة جهات الاتصال القابلة للإدارة: الثابتة (بتجاوزات التسميات) + الإضافية. */
  const contactsEntry = repo.customTables.find((ct) => ct.tabId === 'contacts')
  const baseDefs = applyBaseLabels(CONTACT_FIELD_DEFS, contactsEntry?.labels ?? [])
  const hiddenList: string[] = contactsEntry?.hidden ?? []
  const deletedList: string[] = contactsEntry?.deleted ?? []
  const extraDefs: PhysicalFieldDef[] = (contactsEntry?.columns ?? [])
    .map(customColumnToDef)
    .filter((d) => !hiddenList.includes(d.key) && !deletedList.includes(d.key))

  const uiLang = lang === 'en' ? 'en' : 'ar'
  /** ترشيح الملاك (متعدد بلا مشتركة): الكل يتجاوز، وإلا جهات المحددين —
  فاقد المالك (قديم) يظهر تحت «الكل» فقط. */
  const memberContacts = contacts.filter((c) => {
    if (owners.showAll) return true
    if (!c.recordId) return false
    return owners.selectedIds.has(c.recordId)
  }).sort((a, b) => a.sortOrder - b.sortOrder)
  /** عنوان الهيدر حسب التحديد — بنفس منطق الملفات: الكل / متعدد / المالك. */
  const selCount = owners.selectedIds.size
  const isMultiOwners = !owners.showAll && selCount > 1
  const singleOwner = !owners.showAll && selCount === 1
    ? repo.peoples.find((m) => owners.selectedIds.has(m.id)) ?? null
    : null
  const headerTitle = owners.showAll
    ? t('documentManager.kind_all')
    : isMultiOwners
      ? t('documentManager.multiLabel')
      : singleOwner
        ? recordName(singleOwner, lang)
        : t('modalContact.title')
  /** معاينة تحت «متعدد»: أول 5 أسماء بخط صغير + نقاط للباقي. */
  const contactMultiNames = repo.peoples
    .filter((m) => owners.selectedIds.has(m.id))
    .map((m) => recordName(m, lang))
  const contactMultiPreview = contactMultiNames.slice(0, 5).join('، ')
    + (contactMultiNames.length > 5 ? ' …' : '')
  const headerSub = owners.showAll
    ? t('modalContact.allContactsLabel')
    : isMultiOwners
      ? contactMultiPreview
      : singleOwner
        ? recordRelation(singleOwner, lang) || '—'
        : t('modalContact.headerCount', { count: memberContacts.length })
  /** الضغط على أيقونة i يعرض أسماء المحددين في توست. */
  const showMultiNames = () => {
    toast.info(t('documentManager.multiLabel'), contactMultiNames.join('، '))
  }

  /** طلب حذف الكل من الهيدر — يفتح التأكيد على القائمة المرئية حالياً. */
  const requestDeleteAll = () => {
    if (busy || editing) return
    if (memberContacts.length === 0) {
      toast.info(t('modalContact.deleteAllEmpty'))
      return
    }
    setPendingDeleteAll({ ids: memberContacts.map((c) => c.id) })
  }

  useImperativeHandle(ref, () => ({ requestDeleteAll }), [busy, editing, memberContacts, repo, repoPassword, t, toast])

  const confirmDeleteAll = () => {
    if (!pendingDeleteAll) return
    const ids = pendingDeleteAll.ids
    setPendingDeleteAll(null)
    void runMutation(
      async () => {
        let data: RepoData = repo
        for (const id of ids) {
          data = await deleteContact(data.meta.id, repoPassword, id)
        }
        return data
      },
      () => toast.success(t('modalContact.deletedAllNotice', { count: ids.length })),
    )
  }

  const runMutation = async (op: () => Promise<RepoData>, done?: () => void) => {
    if (busy) return
    setBusy(true)
    try {
      const data = await op()
      onRepoUpdated(data)
      done?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('pageRepoViewer.saveChangeError'))
    } finally {
      setBusy(false)
    }
  }

  const cancelEditing = () => {
    setEditing(null)
    setForm({ ...EMPTY_CONTACT_FORM })
    setExtraValues({})
  }

  /** تحقق الإضافيات قبل الحفظ (يطابق الخلفية: تاريخ ISO وسنة 1900–2100). */
  const extraError = (values: Record<string, string>): string | null => {
    for (const def of extraDefs) {
      const bad = validatePhysicalValue(def, values[def.key] ?? '')
      if (bad) return t(`physicalForm.${bad}`, { label: physicalLabel(def, uiLang) })
    }
    return null
  }

  const buildExtraOut = (values: Record<string, string>): Record<string, string | number | null> => {
    const out: Record<string, string | number | null> = {}
    for (const def of extraDefs) {
      const v = (values[def.key] ?? '').trim()
      out[def.key] = def.type === 'number' ? (v === '' ? null : Number(v)) : v
    }
    return out
  }

  const submitEditor = () => {
    if (!form.name.trim()) {
      toast.error(t('modalContact.nameRequiredError'))
      return
    }
    if (!form.ownerId) {
      toast.error(t('modalContact.ownerRequiredError'))
      return
    }
    const bad = extraError(extraValues)
    if (bad) {
      toast.error(bad)
      return
    }
    const extras = buildExtraOut(extraValues)
    const input: ContactInput = {
      name: form.name.trim(),
      nameEn: form.nameEn.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      address: form.address.trim(),
      addressEn: form.addressEn.trim(),
      relation: '',
      relationEn: '',
      recordId: form.ownerId,
    }
    if (editing?.mode === 'edit') {
      const id = editing.id
      void runMutation(
        async () => {
          let data = await updateContact(repo.meta.id, repoPassword, id, input)
          if (extraDefs.length > 0) {
            data = await updateContactExtra(repo.meta.id, repoPassword, id, extras)
          }
          return data
        },
        () => cancelEditing(),
      )
    } else {
      const newId = generateId()
      void runMutation(
        async () => {
          let data = await addContact(repo.meta.id, repoPassword, input, newId)
          if (extraDefs.length > 0) {
            data = await updateContactExtra(repo.meta.id, repoPassword, newId, extras)
          }
          return data
        },
        () => cancelEditing(),
      )
    }
  }

  const askDeleteContact = (id: string) => {
    const c = contacts.find((x) => x.id === id)
    if (!c) return
    setPendingDelete({ id, name: c.name.trim() || c.nameEn.trim() })
  }

  /** تصدير كل الجهات لملف vCard 3.0 (حوار حفظ + كتابة — ديسكتوب وأندرويد). */
  const doExportVcf = async () => {
    if (busy || editing || memberContacts.length === 0) return
    setBusy(true)
    try {
      const dest = await save({
        defaultPath: 'contacts.vcf',
        filters: [{ name: 'vCard', extensions: ['vcf'] }],
      })
      if (!dest) return
      const text = buildVCard(memberContacts.map((c) => ({
        name: c.name.trim() || c.nameEn.trim(),
        phone: c.phone ?? '',
        email: c.email ?? '',
        address: c.address ?? '',
      })))
      await writeFile(dest, new TextEncoder().encode(text))
      toast.success(t('modalContact.exportedNotice', { count: memberContacts.length }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('modalContact.exportError'))
    } finally {
      setBusy(false)
    }
  }

  /** استيراد ملف vCard: تحليل + كشف مكرر الرقم + تأكيد قبل الإدخال. */
  const doImportVcf = async () => {
    if (busy || editing) return
    if (isMultiOwners) {
      toast.info(t('documentManager.addBlockedMulti'))
      return
    }
    setBusy(true)
    try {
      const picked = await open({
        multiple: false,
        directory: false,
        filters: [{ name: 'vCard', extensions: ['vcf'] }],
      })
      const src = Array.isArray(picked) ? picked[0] : picked
      if (!src) return
      const bytes = await readFile(src)
      let items: VCardContact[]
      try {
        items = parseVCard(new TextDecoder().decode(bytes))
      } catch {
        toast.error(t('modalContact.parseError'))
        return
      }
      if (items.length === 0) {
        toast.error(t('modalContact.parseError'))
        return
      }
      const known = new Set(contacts.map((c) => phoneKey(c.phone ?? '')).filter((k) => k !== ''))
      const fresh: VCardContact[] = []
      let skipped = 0
      for (const item of items) {
        const key = phoneKey(item.phone)
        if (key !== '' && known.has(key)) {
          skipped += 1
          continue
        }
        if (key !== '') known.add(key)
        fresh.push(item)
      }
      if (fresh.length === 0) {
        toast.info(t('modalContact.importConfirm', { fresh: 0, skipped }))
        return
      }
      setPendingImport({ items: fresh, skipped })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('modalContact.parseError'))
    } finally {
      setBusy(false)
    }
  }

  /** مالك الجهات المستوردة — المفرد المحدد حالياً، وإلا بلا مالك (تظهر تحت الكل). */
  const importOwnerId = !owners.showAll && owners.selectedIds.size === 1
    ? [...owners.selectedIds][0] ?? null
    : null

  const confirmImport = () => {
    if (!pendingImport) return
    const items = pendingImport.items
    setPendingImport(null)
    void runMutation(
      async () => {
        let data: RepoData = repo
        for (const item of items) {
          data = await addContact(repo.meta.id, repoPassword, {
            name: item.name,
            nameEn: '',
            phone: item.phone,
            email: item.email,
            address: item.address,
            addressEn: '',
            relation: '',
            relationEn: '',
            recordId: importOwnerId,
          })
        }
        return data
      },
      () => toast.success(t('modalContact.importedNotice', { count: items.length })),
    )
  }

  /** استيراد من دفتر الهاتف: إذن → قائمة → منتقي → إدخال المختار (المكرر يُتخطى). */
  const doDeviceImport = async () => {
    if (busy || editing) return
    if (isMultiOwners) {
      toast.info(t('documentManager.addBlockedMulti'))
      return
    }
    setBusy(true)
    try {
      const ok = await ensureDeviceContactPermission('readContacts')
      if (!ok) {
        toast.error(t('modalContact.permissionDenied'))
        return
      }
      const res = await getDeviceContacts()
      if (res.contacts.length === 0) {
        toast.info(t('modalContact.devicePickerEmpty'))
        return
      }
      setDeviceList(res.contacts)
      setDevicePickerOpen(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('modalContact.parseError'))
    } finally {
      setBusy(false)
    }
  }

  const confirmDeviceImport = (selected: DeviceContact[]) => {
    setDevicePickerOpen(false)
    if (selected.length === 0) return
    const known = new Set(contacts.map((c) => phoneKey(c.phone ?? '')).filter((k) => k !== ''))
    const fresh = selected.filter((d) => {
      const first = d.phones[0] ?? ''
      const key = phoneKey(first)
      if (key !== '' && known.has(key)) return false
      if (key !== '') known.add(key)
      return true
    })
    if (fresh.length === 0) {
      toast.info(t('modalContact.importConfirm', { fresh: 0, skipped: selected.length }))
      return
    }
    void runMutation(
      async () => {
        let data: RepoData = repo
        for (const d of fresh) {
          data = await addContact(repo.meta.id, repoPassword, {
            name: d.name,
            nameEn: '',
            phone: d.phones[0] ?? '',
            email: d.emails[0] ?? '',
            address: '',
            addressEn: '',
            relation: '',
            relationEn: '',
            recordId: importOwnerId,
          })
        }
        return data
      },
      () => toast.success(t('modalContact.importedNotice', { count: fresh.length })),
    )
  }

  /** تصدير للهاتف: إذن كتابة → تأكيد بالعدد → كتابة الكل في الدفتر. */
  const doDeviceExport = async () => {
    if (busy || editing || memberContacts.length === 0) return
    setBusy(true)
    try {
      const ok = await ensureDeviceContactPermission('writeContacts')
      if (!ok) {
        toast.error(t('modalContact.permissionDenied'))
        return
      }
      setPendingDeviceExport(true)
    } finally {
      setBusy(false)
    }
  }

  const confirmDeviceExport = () => {
    setPendingDeviceExport(false)
    void runMutation(
      async () => {
        let failed = 0
        for (const c of memberContacts) {
          try {
            await addDeviceContact(
              c.name.trim() || c.nameEn.trim(),
              c.phone ?? '',
              c.email ?? '',
            )
          } catch {
            failed += 1
          }
        }
        if (failed > 0) toast.error(t('modalContact.deviceExportPartial', { failed }))
        return repo
      },
      () => toast.success(t('modalContact.deviceExportedNotice', { count: memberContacts.length })),
    )
  }

  const onSyncMode = (syncMode: ContactSyncMode) => {
    setDeviceMenuOpen(false)
    if (syncMode === 'import') void doDeviceImport()
    else void doDeviceExport()
  }

  return (
    <>
    <section className="records-section" aria-label={t('pageRepoViewer.contactsSectionAria')}>
      {/* هيدر بصري كالبقية — العنوان يتبع تحديد المالك (الكل/متعدد/المالك). */}
      <div className="rtc">
        <div className="rtc-texts">
          <p className="rtc-kicker">{tabTitle(activeTab ?? { title: '', titleEn: '' }, lang) || t('modalContact.title')}</p>
          <div className="flex min-w-0 items-center gap-1">
            <h2 className="rtc-title min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{headerTitle}</h2>
            {isMultiOwners && (
              <Tooltip content={t('documentManager.multiLabel')}>
              <button
                type="button"
                className="rtc-info-btn"
                aria-label={t('documentManager.multiLabel')}
                onClick={showMultiNames}
              >
                <Info size={16} />
              </button>
              </Tooltip>
            )}
          </div>
          <p className="rtc-sub">{headerSub}</p>
        </div>
        <div className="rtc-side">
          <div className="rtc-count">
            <span>{t('modalContact.headerCount', { count: memberContacts.length })}</span>
          </div>
          <Tooltip content={t('modalContact.exportVcfBtn')}>
          <button
            type="button"
            className="rtc-btn"
            disabled={busy || editing !== null || memberContacts.length === 0}
            aria-label={t('modalContact.exportVcfBtn')}
            onClick={() => void doExportVcf()}
          >
            <FileUp size={15} />
          </button>
          </Tooltip>
          <Tooltip content={t('modalContact.importVcfBtn')}>
          <button
            type="button"
            className="rtc-btn"
            disabled={busy || editing !== null}
            aria-label={t('modalContact.importVcfBtn')}
            onClick={() => void doImportVcf()}
          >
            <FileDown size={15} />
          </button>
          </Tooltip>
        </div>
      </div>

      {editing ? (
        <div className="viewer-actions-col">
          <div className="viewer-actions-row viewer-actions-even">
            <button
              type="button"
              className="add-field-btn"
              disabled={busy}
              onClick={submitEditor}
            >
              <Save size={15} /> {t('modalContact.saveBtn')}
            </button>
            <button
              type="button"
              className="add-field-btn"
              disabled={busy}
              onClick={cancelEditing}
            >
              <X size={15} /> {t('modalContact.cancelBtn')}
            </button>
          </div>
        </div>
      ) : (
        <div className="viewer-actions-col">
          <div className="viewer-actions-row contact-actions-row">
            <Tooltip content={t('pageRepoViewer.manageFieldsBtn')} className="contact-actions-manage">
            <button
              type="button"
              className="add-field-btn"
              disabled={busy}
              onClick={() => onManageFields('contacts')}
            >
              <SlidersHorizontal size={15} /> {t('pageRepoViewer.manageFieldsBtn')}
            </button>
            </Tooltip>
            {isAndroid && (
              <Tooltip content={t('modalContact.devicePickerTitle')} className="contact-actions-menu">
              <button
                type="button"
                className="add-field-btn"
                disabled={busy}
                onClick={() => setDeviceMenuOpen(true)}
              >
                <Smartphone size={15} /> {t('modalContact.deviceMenuBtn')}
              </button>
              </Tooltip>
            )}
          </div>
          <button
            type="button"
            className="add-field-btn"
            disabled={busy}
            onClick={() => {
              if (isMultiOwners) {
                toast.info(t('documentManager.addBlockedMulti'))
                return
              }
              setForm({ ...EMPTY_CONTACT_FORM, ownerId: firstPersonId })
              setExtraValues({})
              setEditing({ mode: 'add' })
            }}
          >
            <Plus size={15} /> {t('modalContact.addBtn')}
          </button>
        </div>
      )}

      {editing ? (
        <ContactEditor
          key={editing.mode === 'edit' ? editing.id : 'new'}
          values={form}
          members={repo.peoples}
          extraDefs={extraDefs}
          extraValues={extraValues}
          busy={busy}
          onChange={(key, value) => setForm((prev) => ({ ...prev, [key]: value }))}
          onExtraChange={(key, value) => setExtraValues((prev) => ({ ...prev, [key]: value }))}
        />
      ) : (
        <ContactListViewer
          contacts={memberContacts}
          fieldLang={fieldLang}
          busy={busy}
          baseDefs={baseDefs}
          hidden={hiddenList}
          deleted={deletedList}
          extraDefs={extraDefs}
          onEdit={(id) => {
            const c = contacts.find((x) => x.id === id)
            if (!c) return
            setForm({
              name: c.name ?? '',
              nameEn: c.nameEn ?? '',
              ownerId: c.recordId ?? firstPersonId,
              phone: c.phone ?? '',
              email: c.email ?? '',
              address: c.address ?? '',
              addressEn: c.addressEn ?? '',
            })
            setExtraValues(toStrMap(c.extra))
            setEditing({ mode: 'edit', id })
          }}
          onDelete={askDeleteContact}
        />
      )}
    </section>
    {deviceMenuOpen && (
      <ModalContactSync
        isOpen
        busy={busy}
        onClose={() => setDeviceMenuOpen(false)}
        onSubmit={onSyncMode}
      />
    )}
    {devicePickerOpen && (
      <ModalDeviceContacts
        isOpen
        contacts={deviceList}
        busy={busy}
        onClose={() => setDevicePickerOpen(false)}
        onConfirm={confirmDeviceImport}
      />
    )}
    {pendingImport && (
      <ModalMessages
        isOpen
        variant="question"
        title={t('modalContact.importVcfBtn')}
        message={t('modalContact.importConfirm', { fresh: pendingImport.items.length, skipped: pendingImport.skipped })}
        buttons={[
          { id: 'cancel', label: t('modalMessages.cancelBtn'), variant: 'secondary' },
          { id: 'confirm', label: t('modalContact.importVcfBtn'), variant: 'primary' },
        ]}
        onButtonClicked={(info) => {
          if (info.id === 'confirm') confirmImport()
        }}
        onClose={() => setPendingImport(null)}
      />
    )}
    {pendingDeviceExport && (
      <ModalMessages
        isOpen
        variant="question"
        title={t('modalContact.deviceExportBtn')}
        message={t('modalContact.deviceExportConfirm', { count: memberContacts.length })}
        buttons={[
          { id: 'cancel', label: t('modalMessages.cancelBtn'), variant: 'secondary' },
          { id: 'confirm', label: t('modalContact.deviceExportBtn'), variant: 'primary' },
        ]}
        onButtonClicked={(info) => {
          if (info.id === 'confirm') confirmDeviceExport()
        }}
        onClose={() => setPendingDeviceExport(false)}
      />
    )}
    {pendingDelete && (
      <ModalMessages
        isOpen
        variant="danger"
        title={t('modalMessages.deleteTitle')}
        message={t('modalContact.deleteConfirm', { name: pendingDelete.name })}
        buttons={[
          { id: 'cancel', label: t('modalMessages.cancelBtn'), variant: 'secondary' },
          { id: 'confirm', label: t('modalMessages.deleteBtn'), variant: 'danger' },
        ]}
        onButtonClicked={(info) => {
          if (info.id === 'confirm') void runMutation(() => deleteContact(repo.meta.id, repoPassword, pendingDelete.id))
        }}
        onClose={() => setPendingDelete(null)}
      />
    )}
    {pendingDeleteAll && (
      <ModalMessages
        isOpen
        variant="danger"
        title={t('modalMessages.deleteTitle')}
        message={t('modalContact.deleteAllConfirm', { count: pendingDeleteAll.ids.length })}
        buttons={[
          { id: 'cancel', label: t('modalMessages.cancelBtn'), variant: 'secondary' },
          { id: 'confirm', label: t('modalContact.deleteAllBtn'), variant: 'danger' },
        ]}
        onButtonClicked={(info) => {
          if (info.id === 'confirm') confirmDeleteAll()
        }}
        onClose={() => setPendingDeleteAll(null)}
      />
    )}
    </>
  )
}

const PageTableContacts = forwardRef<ContactsApi, PageTableContactsProps>(PageTableContactsInner)

export default PageTableContacts
