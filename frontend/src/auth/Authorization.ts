import type { RouteMeta } from 'vue-router'
import type { PermissionKey, Role } from '@/types'

/** a route as the guard and the sidebar see it: every matched record (parents first) */
export interface GuardedRoute {
  matched: readonly { meta: RouteMeta }[]
}

/**
 * What the signed-in user may do, built from their roles. Roles and their permissions live in the
 * database (the backend sends them); nothing here knows which role has which permission, so a new
 * role needs no change to the router or the pages.
 *
 * - role: a hard restriction (`meta.roles`), e.g. pages only the built-in Admin opens
 * - permission: what a page or an action needs (`meta.permissions`, `v-can`, `auth.can`)
 *
 * The UI only hides what the server would refuse: the backend checks every request again.
 */
export class Authorization {
  /** role ids, plus the built-in code ('admin') of a built-in role */
  private readonly roles = new Set<string>()
  private readonly permissions = new Set<PermissionKey>()
  /** the built-in Admin role has every permission */
  private readonly admin: boolean

  constructor(roles: readonly Role[]) {
    for (const role of roles) {
      this.roles.add(role.id)
      if (role.builtIn) this.roles.add(role.builtIn)
      for (const key of role.permissions) this.permissions.add(key)
    }
    this.admin = this.roles.has('admin')
  }

  /** `role`: a role id or a built-in code ('admin') */
  hasRole(role: string): boolean {
    return this.roles.has(role)
  }

  hasAnyRole(roles: readonly string[]): boolean {
    return roles.some((role) => this.hasRole(role))
  }

  hasPermission(permission: PermissionKey): boolean {
    return this.admin || this.permissions.has(permission)
  }

  hasAnyPermission(permissions: readonly PermissionKey[]): boolean {
    return permissions.some((permission) => this.hasPermission(permission))
  }

  hasAllPermissions(permissions: readonly PermissionKey[]): boolean {
    return permissions.every((permission) => this.hasPermission(permission))
  }

  /** every matched record allows it: one of its `roles` (if any) and all of its `permissions` */
  canOpen(route: GuardedRoute): boolean {
    return route.matched.every(({ meta }) => (!meta.roles?.length || this.hasAnyRole(meta.roles)) && this.hasAllPermissions(meta.permissions ?? []))
  }
}
