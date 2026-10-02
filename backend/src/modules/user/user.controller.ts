import type { Request, Response } from 'express'
import { created, send } from '#core/http/response.js'
import { userService, type UserFields } from './user.service.js'

export const userController = {
  /** GET /users */
  list: async (_req: Request, res: Response) => send(res, await userService.list()),
  /** POST /users (Admin): the new user gets an invite by email */
  invite: async (req: Request, res: Response) => created(res, await userService.invite(req.body as UserFields)),
  /** PATCH /users/:id (Admin) */
  update: async (req: Request, res: Response) => send(res, await userService.update(req.params.id as string, req.body as Partial<UserFields>)),
}
