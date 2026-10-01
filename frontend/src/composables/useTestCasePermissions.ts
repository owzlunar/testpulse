import { computed } from 'vue'
import type { TestCaseStatus } from '@/types'
import { STATUSES } from '@/services/test-case.service'
import { useAuthStore } from '@/stores/auth.store'

// What the current role may do with test cases (role permissions, see role.service.ts)
export function useTestCasePermissions() {
  const auth = useAuthStore()

  const canCreate = computed(() => auth.can('case.edit'))
  const canEdit = computed(() => auth.can('case.edit'))
  const canArchive = computed(() => auth.can('case.archive'))
  const canPurge = computed(() => auth.can('case.delete'))
  const canReorder = computed(() => auth.can('case.reorder'))
  const canRestoreVersion = computed(() => auth.can('case.restoreVersion'))
  const canHandOff = computed(() => auth.can('case.handoff'))
  const canExecute = computed(() => auth.can('run.execute'))
  const canExportUat = computed(() => auth.can('document.create'))

  /** Dev hands off (Ready for Test), QA gives verdicts; both may send a case back to Pending */
  function canSetStatus(status: TestCaseStatus): boolean {
    if (status === 'ready_for_test') return canHandOff.value
    if (status === 'pending') return canHandOff.value || canExecute.value
    return canExecute.value
  }

  const allowedStatuses = computed(() => STATUSES.filter((s) => canSetStatus(s.value)))

  return {
    canCreate, canEdit, canArchive, canPurge, canReorder, canRestoreVersion, canHandOff, canExecute, canExportUat,
    canSetStatus, allowedStatuses,
  }
}
