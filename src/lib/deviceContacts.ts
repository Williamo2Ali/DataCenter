// واجهة ملحق دفتر هاتف أندرويد (tauri-plugin-device-contacts) — أندرويد فقط.
// الأذونات readContacts/writeContacts تُفحَص وتُطلَب قبل أي قراءة/كتابة.
import { invoke } from '@tauri-apps/api/core'

export type DeviceContact = {
  name: string
  phones: string[]
  emails: string[]
}

export type DeviceContactsResult = {
  contacts: DeviceContact[]
}

export type DeviceContactPermissions = {
  readContacts: string
  writeContacts: string
}

const PLUGIN = 'plugin:device-contacts'

export async function checkDeviceContactPermissions(): Promise<DeviceContactPermissions> {
  return invoke<DeviceContactPermissions>(`${PLUGIN}|check_device_permissions`)
}

export async function requestDeviceContactPermissions(
  permissions: Array<'readContacts' | 'writeContacts'>,
): Promise<DeviceContactPermissions> {
  return invoke<DeviceContactPermissions>(`${PLUGIN}|request_device_permissions`, { permissions })
}

export async function getDeviceContacts(): Promise<DeviceContactsResult> {
  return invoke<DeviceContactsResult>(`${PLUGIN}|get_device_contacts`)
}

export async function addDeviceContact(name: string, phone?: string, email?: string): Promise<void> {
  await invoke(`${PLUGIN}|add_device_contact`, { name, phone: phone ?? '', email: email ?? '' })
}

/** ضمان إذن — يعيد true إن ممنوح (بعد طلب عند الحاجة)، وfalse عند الرفض. */
export async function ensureDeviceContactPermission(
  alias: 'readContacts' | 'writeContacts',
): Promise<boolean> {
  const states = await checkDeviceContactPermissions()
  const current = alias === 'readContacts' ? states.readContacts : states.writeContacts
  if (current === 'granted') return true
  if (current === 'denied') return false
  const next = await requestDeviceContactPermissions([alias])
  const after = alias === 'readContacts' ? next.readContacts : next.writeContacts
  return after === 'granted'
}
