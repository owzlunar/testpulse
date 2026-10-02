import type { PermissionKey, RoleDiscipline } from '#contract/types.js'

// Who is signed in, as every guard and service sees it. Core doesn't know where users and roles live:
// the user module registers a resolver at start-up, so a role or permission change applies on the
// very next request (nothing about permissions is baked into the token).

export interface Principal {
  id: string
  name: string
  email: string
  roleId: string | null
  roleName: string | null
  discipline: RoleDiscipline | null
  /** the built-in Admin role: every permission, manages users / roles / teams / projects */
  isAdmin: boolean
  permissions: ReadonlySet<PermissionKey>
}

export type PrincipalResolver = (userId: string) => Promise<Principal | null>

let resolver: PrincipalResolver | null = null

export function setPrincipalResolver(fn: PrincipalResolver): void {
  resolver = fn
}

export async function resolvePrincipal(userId: string): Promise<Principal | null> {
  if (!resolver) throw new Error('No principal resolver registered (is the user module loaded?)')
  return resolver(userId)
}

/** does the principal's role have this permission? (the built-in Admin has every one) */
export const can = (p: Principal, key: PermissionKey) => p.isAdmin || p.permissions.has(key)
