import type { ClientSession } from 'mongoose'
import type { Role } from '#contract/types.js'
import { BaseRepository } from '#core/database/base.repository.js'
import { RoleModel, type RoleDoc } from './role.model.js'

class RoleRepository extends BaseRepository<RoleDoc, Role> {
  constructor() {
    super(RoleModel, ['name', 'createdAt'], { createdAt: 1 })
  }

  findByName(name: string): Promise<Role | null> {
    return this.findOne({ nameKey: name.trim().toLowerCase() })
  }

  /** the name changes nameKey too (findOneAndUpdate skips the validate hook) */
  update(id: string, set: Partial<RoleDoc>, session?: ClientSession): Promise<Role | null> {
    return this.updateById(id, set.name ? { ...set, nameKey: set.name.trim().toLowerCase() } : set, session)
  }
}

export const roleRepository = new RoleRepository()
