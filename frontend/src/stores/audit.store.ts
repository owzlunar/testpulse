import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { AuditTrailEntry } from '@/types'
import { createAuditLog, fetchAuditLogs } from '@/services/audit.service'
import { newId } from '@/services/http'
import { useAuthStore } from './auth.store'

export type AuditInput = Pick<AuditTrailEntry, 'action' | 'targetType' | 'targetId' | 'projectId' | 'targetDeleted' | 'targetTitle' | 'details' | 'changes'>

export const useAuditStore = defineStore('audit', () => {
  const logs = ref<AuditTrailEntry[]>([])
  const auth = useAuthStore()

  /** newest first */
  const sortedLogs = computed(() => [...logs.value].sort((a, b) => b.timestamp.localeCompare(a.timestamp)))

  async function load() {
    logs.value = await fetchAuditLogs()
  }

  /** shown immediately; written in the background (the real backend records these server-side) */
  function record(input: AuditInput): AuditTrailEntry {
    const user = auth.currentUser
    const entry: AuditTrailEntry = {
      ...input,
      id: newId('aud'),
      timestamp: new Date().toISOString(),
      userId: user.id,
      userName: user.name,
      userRole: user.role,
    }
    logs.value.unshift(entry)
    createAuditLog(entry).catch(() => {})
    return entry
  }

  /** entries of one target; older entries saved without a project still match by id */
  const logsFor = (targetId: string, projectId?: string) =>
    sortedLogs.value.filter((l) => l.targetId === targetId && !l.targetDeleted && (!projectId || !l.projectId || l.projectId === projectId))

  /** a reorder renumbered case ids (the server already re-keyed its copy) */
  function renameCases(projectId: string, renames: Record<string, string>) {
    logs.value.forEach((l) => {
      if (l.targetType === 'TEST_CASE' && l.projectId === projectId && !l.targetDeleted) l.targetId = renames[l.targetId] ?? l.targetId
    })
  }

  /** cases were deleted (the server already detached its copy) */
  function detachCases(projectId: string, caseIds: string[]) {
    logs.value.forEach((l) => {
      if (l.targetType === 'TEST_CASE' && l.projectId === projectId && caseIds.includes(l.targetId)) l.targetDeleted = true
    })
  }

  return { logs, sortedLogs, load, record, logsFor, renameCases, detachCases }
})
