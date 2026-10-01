// Demo data for notification.service.ts (the mock database is seeded with it on first use)
import type { NotificationItem } from '@/types'

export const SEED_NOTIFICATIONS: NotificationItem[] = [
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
