import { ENVIRONMENT_NAME_MAX, defaultEnvironments } from '#contract/rules/project.js'
import type { ProjectEnvironment } from '#contract/types.js'
import { logger } from '#core/config/logger.js'
import type { Migration } from '#core/database/migrations.js'
import { defects } from '#modules/defect/index.js'
import { projectData } from '#modules/project/index.js'
import { runs } from '#modules/run/index.js'

// Projects now list the environments they are tested on; runs pick one and defects say where they were
// found. Every project gets TEST as its primary environment (its results stay the cases' status, so no
// status changes); the free-text environments of its runs ("Staging", "UAT" …) become its other
// environments, and runs without one go on TEST. Defects become code problems, on the environment whose
// name matches their text.

const keyOf = (name: string) => name.trim().toUpperCase().slice(0, ENVIRONMENT_NAME_MAX)

/** TEST, then one environment per distinct name (ids from the name, or numbered for names without letters a-z) */
export function environmentsFromNames(names: string[]): ProjectEnvironment[] {
  const list = defaultEnvironments()
  for (const name of names.map(keyOf).filter(Boolean)) {
    if (list.some((e) => e.name === name)) continue
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    const id = slug && !list.some((e) => e.id === `env-${slug}`) ? `env-${slug}` : `env-${list.length + 1}`
    list.push({ id, name, primary: false })
  }
  return list
}

export const projectEnvironments: Migration = {
  id: '20261005-02-project-environments',
  description: "projects get environments (TEST primary + their runs' environments); runs and defects are placed on them",
  async up() {
    for (const project of await projectData.all()) {
      let environments = project.environments ?? []
      if (!environments.length) {
        environments = environmentsFromNames(await runs.unplacedEnvironmentNames(project.id))
        await projectData.setEnvironments(project.id, environments)
        logger.info(`[migrate] ${project.key}: environments ${environments.map((e) => e.name).join(', ')}`)
      }
      const byName = (name: string) => environments.find((e) => e.name === keyOf(name))
      const primary = environments.find((e) => e.primary) ?? environments[0]!
      const placedRuns = await runs.place(project.id, (name) => byName(name) ?? primary)
      const placedDefects = await defects.place(project.id, byName)
      if (placedRuns || placedDefects) logger.info(`[migrate] ${project.key}: ${placedRuns} runs and ${placedDefects} defects placed on environments`)
    }
  },
}
