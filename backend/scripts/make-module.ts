import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// npm run make:module -- <name>   e.g. `npm run make:module -- test-case`
// Creates src/modules/<name>/ with the standard layers, a project-scoped resource guarded by a
// permission, and an HTTP test. Then: fill in the fields, pick the permission keys, add the module
// to src/app-modules.ts, and run `npm run check`.

const name = process.argv[2]
if (!name || !/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) {
  console.error('usage: npm run make:module -- <kebab-case-name>   (e.g. test-case)')
  process.exit(2)
}

const pascal = name.replace(/(^|-)([a-z0-9])/g, (_m, _d, c: string) => c.toUpperCase())
const camel = pascal[0]!.toLowerCase() + pascal.slice(1)
const plural = name.endsWith('s') ? name : `${name}s`
const collection = plural.replace(/-/g, '_')
const prefix = name
  .split('-')
  .map((w) => w[0])
  .join('')
const dir = resolve(import.meta.dirname, '../src/modules', name)
if (existsSync(dir)) {
  console.error(`src/modules/${name} already exists`)
  process.exit(1)
}

const files: Record<string, string> = {
  [`${name}.model.ts`]: `import mongoose, { Schema } from 'mongoose'
import { stringId } from '#core/database/ids.js'
import { auditTrailPlugin } from '#core/database/plugins/audit-trail.js'
import { toJSONPlugin } from '#core/database/plugins/to-json.js'

// TODO: when the contract (frontend/src/types) has the ${pascal} type, derive from it:
//   export interface ${pascal}Doc extends Omit<${pascal}, 'id' | 'createdAt' | 'updatedAt'> { ... }
export interface ${pascal} {
  id: string
  projectId: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface ${pascal}Doc extends Omit<${pascal}, 'id' | 'createdAt' | 'updatedAt'> {
  _id: string
  createdAt: Date
  updatedAt: Date
}

const ${camel}Schema = new Schema<${pascal}Doc>(
  {
    _id: stringId('${prefix}'),
    projectId: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
  },
  { timestamps: true, collection: '${collection}' },
)

// TODO: targetType must be one of the contract's AuditTargetType values (add one there if needed)
${camel}Schema.plugin(auditTrailPlugin, {
  targetType: 'PROJECT',
  title: (d: Record<string, unknown>) => String(d.title),
  projectId: (d: Record<string, unknown>) => String(d.projectId),
})
${camel}Schema.plugin(toJSONPlugin)

export const ${pascal}Model = mongoose.model<${pascal}Doc>('${pascal}', ${camel}Schema)
`,
  [`${name}.repository.ts`]: `import { BaseRepository } from '#core/database/base.repository.js'
import { ${pascal}Model, type ${pascal}, type ${pascal}Doc } from './${name}.model.js'

class ${pascal}Repository extends BaseRepository<${pascal}Doc, ${pascal}> {
  constructor() {
    super(${pascal}Model, ['title', 'createdAt'], { createdAt: -1 })
  }

  inProjects(projectIds: string[]): Promise<${pascal}[]> {
    return this.find({ projectId: { $in: projectIds } })
  }
}

export const ${camel}Repository = new ${pascal}Repository()
`,
  [`${name}.service.ts`]: `import type { Principal } from '#core/auth/principal.js'
import { ApiError } from '#core/http/errors.js'
import { projectAccess } from '#modules/project/index.js'
import type { ${pascal} } from './${name}.model.js'
import { ${camel}Repository } from './${name}.repository.js'

export type ${pascal}Fields = Pick<${pascal}, 'title'>

export const ${camel}Service = {
  /** only what belongs to projects the user may open */
  async list(principal: Principal): Promise<${pascal}[]> {
    return ${camel}Repository.inProjects([...(await projectAccess.accessibleIds(principal))])
  },

  async create(principal: Principal, projectId: string, fields: ${pascal}Fields): Promise<${pascal}> {
    await projectAccess.assert(principal, projectId)
    return ${camel}Repository.create({ ...fields, projectId })
  },

  async update(principal: Principal, id: string, fields: ${pascal}Fields): Promise<${pascal}> {
    const existing = await ${camel}Repository.findById(id)
    if (!existing) throw ApiError.notFound()
    await projectAccess.assert(principal, existing.projectId)
    return (await ${camel}Repository.updateById(id, fields))!
  },

  async remove(principal: Principal, id: string): Promise<void> {
    const existing = await ${camel}Repository.findById(id)
    if (!existing) throw ApiError.notFound()
    await projectAccess.assert(principal, existing.projectId)
    await ${camel}Repository.deleteById(id)
  },
}
`,
  [`${name}.validation.ts`]: `import Joi from 'joi'
import { idParams, idSchema } from '#core/http/validate.js'

const body = Joi.object({
  title: Joi.string().trim().min(1).max(200).required(),
})

export const ${camel}Validation = {
  create: { params: Joi.object({ projectId: idSchema.required() }), body },
  update: { params: idParams, body },
  remove: { params: idParams },
}
`,
  [`${name}.controller.ts`]: `import type { Request, Response } from 'express'
import { principal } from '#core/auth/guards.js'
import { created, done, send } from '#core/http/response.js'
import { ${camel}Service, type ${pascal}Fields } from './${name}.service.js'

export const ${camel}Controller = {
  /** GET /${plural} */
  list: async (_req: Request, res: Response) => send(res, await ${camel}Service.list(principal())),
  /** POST /projects/:projectId/${plural} */
  create: async (req: Request, res: Response) =>
    created(res, await ${camel}Service.create(principal(), req.params.projectId as string, req.body as ${pascal}Fields)),
  /** PUT /${plural}/:id */
  update: async (req: Request, res: Response) => send(res, await ${camel}Service.update(principal(), req.params.id as string, req.body as ${pascal}Fields)),
  /** DELETE /${plural}/:id */
  remove: async (req: Request, res: Response) => {
    await ${camel}Service.remove(principal(), req.params.id as string)
    return done(res)
  },
}
`,
  [`${name}.routes.ts`]: `import { Router } from 'express'
import { authenticate, requirePermission } from '#core/auth/guards.js'
import { validate } from '#core/http/validate.js'
import { ${camel}Controller } from './${name}.controller.js'
import { ${camel}Validation } from './${name}.validation.js'

// TODO: pick the permission keys (contract PermissionKey); every route declares its policy here,
// and the service checks project access.
export const ${camel}Router = Router()

${camel}Router.get('/${plural}', authenticate, requirePermission('case.view'), ${camel}Controller.list)
${camel}Router.post('/projects/:projectId/${plural}', authenticate, requirePermission('case.edit'), validate(${camel}Validation.create), ${camel}Controller.create)
${camel}Router.put('/${plural}/:id', authenticate, requirePermission('case.edit'), validate(${camel}Validation.update), ${camel}Controller.update)
${camel}Router.delete('/${plural}/:id', authenticate, requirePermission('case.edit'), validate(${camel}Validation.remove), ${camel}Controller.remove)
`,
  'index.ts': `import type { AppModule } from '#core/module.js'
import { ${pascal}Model } from './${name}.model.js'
import { ${camel}Router } from './${name}.routes.js'

// TODO: one line on what this module is for; export here only what other modules may use.
export const ${camel}Module: AppModule = {
  name: '${name}',
  router: ${camel}Router,
  models: [${pascal}Model],
}
`,
  [`__tests__/${name}.test.ts`]: `import type { Express } from 'express'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { roleModule } from '#modules/role/index.js'
import { userModule } from '#modules/user/index.js'
import { teamModule } from '#modules/team/index.js'
import { projectModule } from '#modules/project/index.js'
import { useTestDatabase } from '../../../../tests/helpers/database.js'
import { buildApp, client, seedDemo } from '../../../../tests/helpers/app.js'
import { ${camel}Module } from '../index.js'

const modules = [roleModule, userModule, teamModule, projectModule, ${camel}Module]

useTestDatabase()
let app: Express
beforeAll(async () => {
  app = await buildApp(modules)
})
beforeEach(() => seedDemo(modules))

describe('${plural}', () => {
  it('creates in a project the user may open, and lists only those', async () => {
    const qaLead = client(app).as('user-qa-1') // team-payment: proj-1, proj-3
    expect((await qaLead.post('/projects/proj-1/${plural}').send({ title: 'A' })).status).toBe(201)
    expect((await qaLead.post('/projects/proj-2/${plural}').send({ title: 'B' })).status).toBe(403)
    expect((await qaLead.get('/${plural}')).body.data.map((x: { title: string }) => x.title)).toEqual(['A'])
  })

  it('needs the permission', async () => {
    const dev = client(app).as('user-dev-1') // Developer: no case.edit
    expect((await dev.post('/projects/proj-1/${plural}').send({ title: 'A' })).status).toBe(403)
  })
})
`,
}

mkdirSync(resolve(dir, '__tests__'), { recursive: true })
for (const [file, content] of Object.entries(files)) writeFileSync(resolve(dir, file), content)
execFileSync('npx', ['prettier', '--write', dir], { stdio: 'ignore' })

console.log(`created src/modules/${name}/
next:
  1. fields: ${name}.model.ts (types from the contract), ${name}.validation.ts, the service
  2. permissions in ${name}.routes.ts; endpoints as named in frontend/src/services (JSDoc)
  3. add ${camel}Module to src/app-modules.ts (and to tests/integration/access-matrix.test.ts if it has public or Admin-only routes)
  4. npm run check`)
