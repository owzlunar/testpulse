// Mock database: one LocalStorage key per collection. Only the mock API (src/api/mock) touches it.
import { ApiError } from '@/api/errors'

export const STORAGE_KEYS = {
  projects: 'testpulse_projects',
  testCases: 'testpulse_testcases',
  auditLogs: 'testpulse_audit_logs',
  notifications: 'testpulse_notifications',
  currentUser: 'testpulse_current_user',
  selectedProjectId: 'testpulse_selected_project_id',
  users: 'testpulse_users',
  roles: 'testpulse_roles',
  teams: 'testpulse_teams',
  settings: 'testpulse_settings',
  requirements: 'testpulse_requirements',
  templates: 'testpulse_templates',
  testRuns: 'testpulse_test_runs',
  defects: 'testpulse_defects',
  documents: 'testpulse_documents',
  documentTemplate: 'testpulse_document_template',
  backup: 'testpulse_backup',
  /** names of one-off data migrations already applied */
  migrations: 'testpulse_migrations',
} as const

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]

/** Read a JSON value; writes and returns `seed` when the key is missing or unreadable */
export function load<T>(key: StorageKey, seed: T): T {
  const raw = localStorage.getItem(key)
  if (raw === null) {
    save(key, seed)
    // a copy: callers modify what they load, and must never modify the seed constants
    return JSON.parse(JSON.stringify(seed)) as T
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    return seed
  }
}

export function save<T>(key: StorageKey, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // QuotaExceededError: images are the usual cause
    throw new ApiError('พื้นที่จัดเก็บข้อมูลจำลองเต็ม ลองลบภาพหลักฐานบางรูป หรือรีเซ็ตข้อมูลตัวอย่างในหน้าตั้งค่า', 507)
  }
}

/** Read-modify-write one collection */
export function update<T>(key: StorageKey, seed: T, fn: (value: T) => T | void): T {
  const value = load(key, seed)
  const next = fn(value) ?? value
  save(key, next)
  return next
}

/** Run `fn` once per browser; ids and seed fixes must not be re-applied after users change the data */
export function migrateOnce(name: string, fn: () => void): void {
  const done = load<string[]>(STORAGE_KEYS.migrations, [])
  if (done.includes(name)) return
  fn()
  save(STORAGE_KEYS.migrations, [...done, name])
}

/** Approximate size used by the mock database (bytes) */
export function storageUsage(): number {
  return Object.values(STORAGE_KEYS).reduce((sum, k) => sum + (localStorage.getItem(k)?.length ?? 0) * 2, 0)
}

/** Remove the demo data so the next load re-seeds it */
export function resetDemoData(): void {
  Object.values(STORAGE_KEYS)
    .filter((k) => k !== STORAGE_KEYS.currentUser && k !== STORAGE_KEYS.documentTemplate)
    .forEach((k) => localStorage.removeItem(k))
}
