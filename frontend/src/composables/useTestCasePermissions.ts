import { computed } from 'vue'
import type { TestCaseStatus } from '@/types'
import { STATUSES } from '@/services/test-case.service'
import { useAuthStore } from '@/stores/auth.store'

// What the current role may do with test cases (PRD §4 RBAC matrix)
export function useTestCasePermissions() {
  const auth = useAuthStore()

  const canCreate = computed(() => auth.can('canCreateCase'))
  const canEdit = computed(() => auth.can('canEditCase'))
  const canDelete = computed(() => auth.can('canDeleteCase'))
  const canHandOff = computed(() => auth.can('canMarkReadyForTest'))
  const canExecute = computed(() => auth.can('canExecuteTest'))
  const canExportUat = computed(() => auth.can('canExportUat'))

  /** Dev hands off (Ready for Test), QA gives verdicts; both may send a case back to Pending */
  function canSetStatus(status: TestCaseStatus): boolean {
    if (status === 'ready_for_test') return canHandOff.value
    if (status === 'pending') return canHandOff.value || canExecute.value
    return canExecute.value
  }

  const allowedStatuses = computed(() => STATUSES.filter((s) => canSetStatus(s.value)))

  return { canCreate, canEdit, canDelete, canHandOff, canExecute, canExportUat, canSetStatus, allowedStatuses }
}
