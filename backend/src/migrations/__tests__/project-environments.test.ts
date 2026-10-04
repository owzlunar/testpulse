import { beforeEach, describe, expect, it } from 'vitest'
import { useTestDatabase } from '../../../tests/helpers/database.js'
import { buildApp, seedDemo } from '../../../tests/helpers/app.js'
import { DefectModel } from '#modules/defect/defect.model.js'
import { ProjectModel } from '#modules/project/project.model.js'
import { RunModel } from '#modules/run/run.model.js'
import { environmentsFromNames, projectEnvironments } from '../20261005-02-project-environments.js'

useTestDatabase()
beforeEach(async () => {
  await buildApp()
  await seedDemo()
  // proj-1 as it was before environments: free-text run environments, defects without a cause
  await ProjectModel.collection.updateOne({ _id: 'proj-1' as never }, { $unset: { environments: 1 } })
  await RunModel.collection.updateOne({ _id: 'run-1' as never }, { $set: { environment: 'Staging' }, $unset: { environmentId: 1 } })
  await RunModel.collection.updateOne({ _id: 'run-2' as never }, { $set: { environment: '' }, $unset: { environmentId: 1 } })
  await DefectModel.collection.updateMany({ projectId: 'proj-1' }, { $set: { environment: 'staging' }, $unset: { environmentId: 1, cause: 1 } })
})

describe('project environments migration', () => {
  it('TEST first and primary, then one per distinct name', () => {
    expect(environmentsFromNames(['Staging', 'STAGING', '', 'test', 'ทดสอบ'])).toEqual([
      { id: 'env-test', name: 'TEST', primary: true },
      { id: 'env-staging', name: 'STAGING', primary: false },
      { id: 'env-3', name: 'ทดสอบ', primary: false },
    ])
  })

  it('a project gets TEST + its runs’ environments; runs and defects are placed on them', async () => {
    await projectEnvironments.up()
    const project = await ProjectModel.findById('proj-1').lean()
    expect(project?.environments.map((e) => [e.name, e.primary])).toEqual([
      ['TEST', true],
      ['STAGING', false],
    ])
    expect((await RunModel.findById('run-1').lean())?.environmentId).toBe('env-staging')
    // a run without an environment was on the primary one
    expect(await RunModel.findById('run-2').lean()).toMatchObject({ environmentId: 'env-test', environment: 'TEST' })
    const defects = await DefectModel.find({ projectId: 'proj-1' }).lean()
    expect(defects.every((d) => d.cause === 'code' && d.environmentId === 'env-staging')).toBe(true)
  })

  it('leaves projects that already have environments as they are', async () => {
    const before = (await ProjectModel.findById('proj-2').lean())?.environments
    await projectEnvironments.up()
    expect((await ProjectModel.findById('proj-2').lean())?.environments).toEqual(before)
  })
})
