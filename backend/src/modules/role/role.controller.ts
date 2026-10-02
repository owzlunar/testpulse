import type { Request, Response } from 'express'
import { created, send } from '#core/http/response.js'
import { roleService, type RoleFields } from './role.service.js'

export const roleController = {
  /** GET /roles */
  list: async (_req: Request, res: Response) => send(res, await roleService.list()),
  /** POST /roles */
  create: async (req: Request, res: Response) => created(res, await roleService.create(req.body as RoleFields)),
  /** PUT /roles/:id */
  update: async (req: Request, res: Response) => send(res, await roleService.update(req.params.id as string, req.body as RoleFields)),
  /** DELETE /roles/:id?moveTo=:roleId  -> the users that moved */
  remove: async (req: Request, res: Response) =>
    send(res, await roleService.remove(req.params.id as string, (req.query.moveTo as string | null) ?? null)),
}
