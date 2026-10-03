import type { Express } from 'express'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { TestCaseTemplate } from '#contract/types.js'
import { useTestDatabase } from '../../../../tests/helpers/database.js'
import { buildApp, client, seedDemo } from '../../../../tests/helpers/app.js'
import { TemplateModel } from '../template.model.js'
import { templateService } from '../template.service.js'

useTestDatabase()
let app: Express
beforeAll(async () => {
  app = await buildApp()
})
beforeEach(() => seedDemo())

const as = (userId: string) => client(app).as(userId)
const template = {
  name: 'ค้นหาสินค้า',
  category: 'Search',
  description: '',
  draft: {
    name: 'ค้นหาด้วยชื่อสินค้า',
    testScenario: '',
    prerequisite: '',
    priority: 'medium',
    steps: [{ action: 'พิมพ์ชื่อ', testData: 'iPhone', expectedResult: 'พบสินค้า' }],
    expectedResults: '',
  },
}

describe('test case templates', () => {
  it('are read by every role and added by whoever writes cases', async () => {
    expect(((await as('user-dev-1').get('/test-case-templates')).body.data as TestCaseTemplate[]).length).toBeGreaterThan(0)
    expect((await as('user-dev-1').post('/test-case-templates').send(template)).status).toBe(403)
    const res = await as('user-qa-2').post('/test-case-templates').send(template)
    expect(res.status).toBe(201)
    expect(res.body.data).toMatchObject({ name: 'ค้นหาสินค้า', usageCount: 0, createdBy: 'พิชญา ศรีสุข (Senior Tester)' })
  })

  it('count their use; built-in ones cannot be deleted', async () => {
    const [builtIn] = ((await as('user-qa-1').get('/test-case-templates')).body.data as TestCaseTemplate[]).filter((t) => t.builtIn)
    await as('user-qa-1').post(`/test-case-templates/${builtIn!.id}/use`)
    expect((await TemplateModel.findById(builtIn!.id).lean())!.usageCount).toBe(builtIn!.usageCount + 1)
    expect((await as('user-qa-1').delete(`/test-case-templates/${builtIn!.id}`)).status).toBe(403)
    const own = (await as('user-qa-1').post('/test-case-templates').send(template)).body.data
    expect((await as('user-qa-1').delete(`/test-case-templates/${own.id}`)).status).toBe(200)
  })

  it('built-in ones come with every database (migration), once', async () => {
    await TemplateModel.deleteMany({})
    expect(await templateService.ensureBuiltIns()).toBe(9)
    expect(await templateService.ensureBuiltIns()).toBe(0)
  })
})
