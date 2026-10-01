import type { NotificationItem, NotificationType, Option, Tone } from '@/types'
import { respond } from './http'
import { inAccessibleProjects, sessionCan } from './project.service'
import { STORAGE_KEYS, load, update } from './storage.service'

export const NOTIFICATION_TYPES: Option<NotificationType>[] = [
  { value: 'EXPIRING', label: 'ใกล้ครบกำหนด', tone: 'warning', icon: 'tabler:clock-exclamation' },
  { value: 'STATUS_CHANGED', label: 'เปลี่ยนสถานะ', tone: 'info', icon: 'tabler:arrows-exchange' },
  { value: 'MODIFIED', label: 'แก้ไข / เพิ่ม', tone: 'primary', icon: 'tabler:pencil' },
  { value: 'SYSTEM', label: 'ระบบ', tone: 'secondary', icon: 'tabler:info-circle' },
]

export const notificationTypeOf = (type: NotificationType): Option<NotificationType> =>
  NOTIFICATION_TYPES.find((t) => t.value === type) ?? NOTIFICATION_TYPES[3]

/** severity -> theme tone */
export const severityTone = (severity: NotificationItem['severity']): Tone => severity

const SEED_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'notif-1',
    type: 'EXPIRING',
    title: 'Test Case ใกล้หมดอายุ (Due Soon)',
    message: 'TC-103: Concurrency & Idempotency Test จะหมดอายุในวันที่ 2026-10-01 (เหลืออีก 1 วัน)',
    timestamp: '2026-09-30T08:00:00Z',
    read: false,
    projectId: 'proj-1',
    testCaseId: 'TC-103',
    severity: 'error',
  },
  {
    id: 'notif-2',
    type: 'STATUS_CHANGED',
    title: 'สถานะ Test Case มีการเปลี่ยนแปลง',
    message: 'TC-101 เปลี่ยนสถานะเป็น "PASSED" โดย Somchai Prasert',
    timestamp: '2026-09-30T10:15:00Z',
    read: false,
    projectId: 'proj-1',
    testCaseId: 'TC-101',
    severity: 'success',
  },
  {
    id: 'notif-3',
    type: 'MODIFIED',
    title: 'มีการเพิ่ม Sub-Test Case ใหม่',
    message: 'Pitchaya เพิ่ม TC-101-1 เป็น Sub-case ภายใต้ TC-101 ในโปรเจกต์ PAY',
    timestamp: '2026-09-29T14:20:00Z',
    read: true,
    projectId: 'proj-1',
    testCaseId: 'TC-101-1',
    severity: 'info',
  },
  {
    id: 'notif-4',
    type: 'EXPIRING',
    title: 'Test Case ใกล้หมดอายุ',
    message: 'TC-101-1 มีกำหนด Due Date วันที่ 2026-10-02 (เหลืออีก 2 วัน)',
    timestamp: '2026-09-30T07:30:00Z',
    read: false,
    projectId: 'proj-1',
    testCaseId: 'TC-101-1',
    severity: 'warning',
  },
]

// --- API ------------------------------------------------------------------------
const write = (fn: (items: NotificationItem[]) => NotificationItem[] | void) => update(STORAGE_KEYS.notifications, SEED_NOTIFICATIONS, fn)

/** server-side: follow renumbered case ids (old id -> new id) in the project's notifications */
export function renameNotificationCases(projectId: string, renames: Record<string, string>) {
  write((items) =>
    items.forEach((n) => {
      if (n.projectId === projectId && n.testCaseId) n.testCaseId = renames[n.testCaseId] ?? n.testCaseId
    }),
  )
}

/** server-side: alerts about deleted cases lose their link (the id may be reused) */
export function detachNotificationCases(projectId: string, caseIds: string[]) {
  write((items) =>
    items.forEach((n) => {
      if (n.projectId === projectId && n.testCaseId && caseIds.includes(n.testCaseId)) n.testCaseId = undefined
    }),
  )
}

/** GET /notifications */
export const fetchNotifications = () =>
  respond(() => (sessionCan('notification.receive') ? inAccessibleProjects(load(STORAGE_KEYS.notifications, SEED_NOTIFICATIONS)) : []))

/** POST /notifications (on the real backend the server pushes these) */
export const createNotification = (item: NotificationItem) => respond(() => void write((items) => [item, ...items]), 50)

/** PATCH /notifications/:id/read */
export const markNotificationRead = (id: string) => respond(() => void write((items) => items.forEach((n) => n.id === id && (n.read = true))), 100)

/** POST /notifications/read-all */
export const markAllNotificationsRead = () => respond(() => void write((items) => items.forEach((n) => (n.read = true))))

/** DELETE /notifications/:id */
export const deleteNotification = (id: string) => respond(() => void write((items) => items.filter((n) => n.id !== id)), 100)

/** DELETE /notifications */
export const clearNotifications = () => respond(() => void write(() => []))
