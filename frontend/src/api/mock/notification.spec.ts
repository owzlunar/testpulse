import { describe, expect, it } from 'vitest'
import { createNotification, deleteNotification, fetchNotifications, markNotificationRead } from './notification'
import { saveRole, fetchRoles } from './role'
import type { NotificationItem } from '@/types'
import { USERS, signIn } from '../../../tests/helpers'

// Notifications have an audience; read / removed is per person

const base = (id: string, extra: Partial<NotificationItem> = {}): NotificationItem => ({
  id,
  type: 'MODIFIED',
  title: id,
  message: '',
  timestamp: new Date().toISOString(),
  read: false,
  projectId: 'proj-1', // team Payment: Admin, QA Lead (somchai), both developers
  severity: 'info',
  ...extra,
})
const titles = async () => (await fetchNotifications()).map((n) => n.title).filter((t) => t.startsWith('n-'))

describe('audience', () => {
  it('a broadcast reaches everyone who can open the project, except the sender', async () => {
    await signIn(USERS.admin)
    await createNotification(base('n-broadcast', { fromUserId: USERS.qaLead }))
    expect(await titles()).toEqual(['n-broadcast'])
    await signIn(USERS.qaLead)
    expect(await titles()).toEqual([])
    await signIn(USERS.tester) // not in team Payment
    expect(await titles()).toEqual([])
  })

  it('named people only (the sender too, as a confirmation)', async () => {
    await signIn(USERS.admin)
    await createNotification(base('n-to-dev', { to: { userIds: [USERS.dev] }, fromUserId: USERS.qaLead }))
    await createNotification(base('n-confirm', { to: { userIds: [USERS.qaLead] }, fromUserId: USERS.qaLead }))
    expect(await titles()).toEqual([])
    await signIn(USERS.dev)
    expect(await titles()).toEqual(['n-to-dev'])
    await signIn(USERS.qaLead)
    expect(await titles()).toEqual(['n-confirm'])
  })

  it('a discipline: every QA, no developer', async () => {
    await signIn(USERS.admin)
    await createNotification(base('n-qa', { to: { disciplines: ['qa'] } }))
    await signIn(USERS.qaLead)
    expect(await titles()).toEqual(['n-qa'])
    await signIn(USERS.dev)
    expect(await titles()).toEqual([])
  })

  it('a role without notification.receive gets none', async () => {
    await signIn(USERS.admin)
    const dev = (await fetchRoles()).find((r) => r.id === 'role-dev')!
    await saveRole({ ...dev, permissions: dev.permissions.filter((p) => p !== 'notification.receive') })
    await createNotification(base('n-all'))
    await signIn(USERS.dev)
    expect(await titles()).toEqual([])
  })
})

describe('per person state', () => {
  it('reading or removing one leaves it unread / listed for the others', async () => {
    await signIn(USERS.admin)
    await createNotification(base('n-shared'))
    await signIn(USERS.dev)
    await markNotificationRead((await fetchNotifications()).find((n) => n.title === 'n-shared')!.id)
    expect((await fetchNotifications()).find((n) => n.title === 'n-shared')!.read).toBe(true)
    await signIn(USERS.devBoth)
    const mine = (await fetchNotifications()).find((n) => n.title === 'n-shared')!
    expect(mine.read).toBe(false)
    await deleteNotification(mine.id)
    expect(await titles()).toEqual([])
    await signIn(USERS.dev)
    expect(await titles()).toEqual(['n-shared'])
  })
})
