import type { Project, Team, TeamInput } from '@/types'
import { ApiError, newId, respond } from './http'
import { STORAGE_KEYS, load, save } from './storage.service'

// Teams (Admin only). A project lists the teams that may open it; a user can be in several teams.

const at = '2026-09-01T09:00:00Z'

export const SEED_TEAMS: Team[] = [
  {
    id: 'team-payment',
    name: 'ทีม Payment',
    description: 'ระบบชำระเงิน PromptPay และ Payment Gateway',
    tone: 'primary',
    memberIds: ['user-qa-1', 'user-dev-1', 'user-dev-2'],
    createdAt: at,
    updatedAt: at,
  },
  {
    id: 'team-ecommerce',
    name: 'ทีม E-Commerce',
    description: 'SuperApp ซื้อสินค้าออนไลน์ และ Flash Sale',
    tone: 'success',
    memberIds: ['user-qa-2', 'user-dev-2'],
    createdAt: at,
    updatedAt: at,
  },
]

// --- API ------------------------------------------------------------------------
export const teams = () => load(STORAGE_KEYS.teams, SEED_TEAMS)

/** GET /teams */
export const fetchTeams = () => respond(teams)

/** POST /teams · PUT /teams/:id (Admin only); names are unique */
export const saveTeam = (input: TeamInput) =>
  respond(() => {
    const list = teams()
    const name = input.name.trim()
    if (!name) throw new ApiError('ต้องระบุชื่อทีม', 422)
    if (list.some((t) => t.id !== input.id && t.name.toLowerCase() === name.toLowerCase())) throw new ApiError(`มีทีมชื่อ "${name}" อยู่แล้ว`, 409)
    const now = new Date().toISOString()
    const memberIds = [...new Set(input.memberIds)]
    if (input.id) {
      const team = list.find((t) => t.id === input.id)
      if (!team) throw new ApiError('ไม่พบทีม', 404)
      Object.assign(team, { ...input, name, memberIds, updatedAt: now })
      save(STORAGE_KEYS.teams, list)
      return team
    }
    const created: Team = { ...input, id: newId('team'), name, memberIds, createdAt: now, updatedAt: now }
    save(STORAGE_KEYS.teams, [...list, created])
    return created
  })

/**
 * DELETE /teams/:id (Admin only). The team is also removed from projects; a project left with
 * no team becomes open to everyone with a role. Returns the projects that changed.
 */
export const deleteTeam = (id: string) =>
  respond(() => {
    const list = teams()
    if (!list.some((t) => t.id === id)) throw new ApiError('ไม่พบทีม', 404)
    save(STORAGE_KEYS.teams, list.filter((t) => t.id !== id))
    const projects = load<Project[]>(STORAGE_KEYS.projects, [])
    const changed = projects.filter((p) => p.teamIds?.includes(id))
    changed.forEach((p) => (p.teamIds = p.teamIds!.filter((t) => t !== id)))
    if (changed.length) save(STORAGE_KEYS.projects, projects)
    return changed
  })
