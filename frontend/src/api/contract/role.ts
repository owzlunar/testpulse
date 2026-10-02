import type { Role, RoleInput, User } from '@/types'

export interface RoleApi {
  /** GET /roles */
  fetchRoles(): Promise<Role[]>

  /**
   * POST /roles · PUT /roles/:id (Admin only)
   * The Admin role keeps every permission; names are unique; unknown permission keys are dropped.
   */
  saveRole(input: RoleInput): Promise<Role>

  /**
   * DELETE /roles/:id?moveTo=:roleId (Admin only)
   * Its users move to `moveTo` (or have no role). The Admin role can't be deleted.
   * Returns the users that moved.
   */
  deleteRole(id: string, moveTo: string | null): Promise<User[]>
}
