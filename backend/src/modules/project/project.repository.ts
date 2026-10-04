import type { ClientSession } from 'mongoose'
import type { Project } from '#contract/types.js'
import { BaseRepository } from '#core/database/base.repository.js'
import { ProjectModel, type ProjectDoc } from './project.model.js'

class ProjectRepository extends BaseRepository<ProjectDoc, Project> {
  constructor() {
    super(ProjectModel, ['name', 'createdAt', 'updatedAt'], { createdAt: -1 })
  }

  findByKey(key: string): Promise<Project | null> {
    return this.findOne({ key: key.trim().toUpperCase() })
  }

  /** the projects a team may open or whose environment it runs */
  withTeam(teamId: string, session?: ClientSession): Promise<Project[]> {
    return ProjectModel.find({ $or: [{ teamIds: teamId }, { 'environments.teamId': teamId }] })
      .session(session ?? null)
      .then((docs) => this.toApiList(docs))
  }
}

export const projectRepository = new ProjectRepository()
