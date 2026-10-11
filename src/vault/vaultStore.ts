// سجل الحاويات — بيانات وصفية فقط (IndexedDB).
// في الوضع الأصلي (Tauri): الملف المشفر على القرص، والسجل يحمل مساره.
// خارج Tauri (احتياطي): الـ blob داخل السجل نفسه.

import { tr } from '../language/index'

export type StoredVaultMeta = {
  id: string
  name: string
  fileName: string
  /** المسار المطلق لملف .vault — null للسجلات الداخلية القديمة. */
  fullPath: string | null
  size: number
  updatedAt: number
}

export type StoredRecord = StoredVaultMeta & {
  /** موجود فقط للسجلات الداخلية (غير الأصلية). */
  blob?: ArrayBuffer
}

const DB_NAME = 'family-vault-db'
const STORE_NAME = 'vaults'
const DB_VERSION = 2 // v2: مسار + اسم ملف

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      if (!('indexedDB' in window) || !window.indexedDB) {
        reject(new Error(tr('vaultStore.indexedDbUnavailable')))
        return
      }
      const req = window.indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(new Error(tr('vaultStore.dbOpenError')))
    } catch {
      reject(new Error(tr('vaultStore.storageUnavailable')))
    }
  })
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(new Error(tr('vaultStore.operationFailed')))
  })
}

export function newVaultId(): string {
  const rand = Math.floor(Math.random() * 0xffffffff).toString(36)
  return `v_${Date.now().toString(36)}_${rand}`
}

function toMeta(record: StoredRecord): StoredVaultMeta {
  const { id, name, size, updatedAt } = record
  return {
    id,
    name,
    fileName: record.fileName ?? `${name}.vault`,
    fullPath: record.fullPath ?? null,
    size,
    updatedAt,
  }
}

export async function listStoredVaults(): Promise<StoredVaultMeta[]> {
  const db = await openDb()
  try {
    const store = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME)
    const records = await requestToPromise<StoredRecord[]>(store.getAll())
    return records.map(toMeta).sort((a, b) => b.updatedAt - a.updatedAt)
  } finally {
    db.close()
  }
}

export async function getStoredRecord(id: string): Promise<StoredRecord> {
  const db = await openDb()
  try {
    const store = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME)
    const record = await requestToPromise<StoredRecord | undefined>(store.get(id))
    if (!record) throw new Error(tr('vaultStore.notFoundError'))
    return record
  } finally {
    db.close()
  }
}

export async function saveStoredVault(record: StoredRecord): Promise<void> {
  const db = await openDb()
  try {
    const store = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME)
    const clean: StoredRecord = {
      id: record.id,
      name: record.name,
      fileName: record.fileName,
      fullPath: record.fullPath,
      size: record.size,
      updatedAt: Date.now(),
      ...(record.blob ? { blob: record.blob } : {}),
    }
    await requestToPromise(store.put(clean))
  } finally {
    db.close()
  }
}

export async function deleteStoredVault(id: string): Promise<void> {
  const db = await openDb()
  try {
    const store = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME)
    await requestToPromise(store.delete(id))
  } finally {
    db.close()
  }
}
