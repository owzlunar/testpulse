import type { ClientSession } from 'mongoose'
import type { Team } from '#contract/types.js'
import { BaseRepository } from '#core/database/base.repository.js'
import { TeamModel, type TeamDoc } from './team.model.js'

class TeamRepository extends BaseRepository<TeamDoc, Team> {
  constructor() {
    super(TeamModel, ['name', 'createdAt'], { createdAt: 1 })
  }

  findByName(name: string): Promise<Team | null> {
    return this.findOne({ nameKey: name.trim().toLowerCase() })
  }

  update(id: string, set: Partial<TeamDoc>, session?: ClientSession): Promise<Team | null> {
    return this.updateById(id, set.name ? { ...set, nameKey: set.name.trim().toLowerCase() } : set, session)
  }

  async idsWithMember(userId: string): Promise<string[]> {
    return (await TeamModel.find({ memberIds: userId }, { _id: 1 }).lean()).map((t) => t._id)
  }
}

export const teamRepository = new TeamRepository()
