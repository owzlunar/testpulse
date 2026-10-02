import type { ClientSession } from 'mongoose'
import type { Project, Team, TeamInput } from '#contract/types.js'
import { transaction } from '#core/database/transaction.js'
import { emit } from '#core/events/event-bus.js'
import { ApiError } from '#core/http/errors.js'
import { accounts } from '#modules/user/index.js'
import { teamRepository } from './team.repository.js'

declare module '#core/events/event-bus.js' {
  interface DomainEvents {
    /** a team is being deleted (same transaction); handlers return the projects they changed */
    'team.deleted': { teamId: string; session: ClientSession }
  }
}

export type TeamFields = Omit<TeamInput, 'id'>

async function clean(fields: TeamFields, exceptId?: string): Promise<TeamFields> {
  const name = fields.name.trim()
  const other = await teamRepository.findByName(name)
  if (other && other.id !== exceptId) throw ApiError.conflict(`มีทีมชื่อ "${name}" อยู่แล้ว`, 'duplicate')
  // members must be real users; duplicates are dropped
  const memberIds = await accounts.existingIds([...new Set(fields.memberIds)])
  return { ...fields, name, memberIds: fields.memberIds.filter((id, i, all) => memberIds.includes(id) && all.indexOf(id) === i) }
}

export const teamService = {
  list: (): Promise<Team[]> => teamRepository.find(),

  /** ids of the teams the user is a member of */
  idsOfMember: (userId: string) => teamRepository.idsWithMember(userId),

  async create(fields: TeamFields): Promise<Team> {
    return teamRepository.create(await clean(fields))
  },

  async update(id: string, fields: TeamFields): Promise<Team> {
    if (!(await teamRepository.exists({ _id: id }))) throw ApiError.notFound('ไม่พบทีม')
    return (await teamRepository.update(id, await clean(fields, id)))!
  },

  /** also removed from projects; returns the projects that changed */
  async remove(id: string): Promise<Project[]> {
    if (!(await teamRepository.exists({ _id: id }))) throw ApiError.notFound('ไม่พบทีม')
    return transaction(async (session) => {
      const changed = (await emit('team.deleted', { teamId: id, session })).flat() as Project[]
      await teamRepository.deleteById(id, session)
      return changed
    })
  },
}
