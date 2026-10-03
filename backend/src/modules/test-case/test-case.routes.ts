import { Router } from 'express'
import { authenticate, requireRole } from '#core/auth/guards.js'
import { validate } from '#core/http/validate.js'
import { testCaseController } from './test-case.controller.js'
import { testCaseValidation as v } from './test-case.validation.js'

// Cases of a project: case.view to read; each change needs its own permission (edit, hand-off,
// verdict, archive, delete, reorder, restore a version) and access to the project, checked in the
// service. Changes carry the {uid, rev} of the copy they were based on (409 'stale' otherwise).
export const testCaseRouter = Router()

const base = '/projects/:projectId/test-cases'
testCaseRouter.get('/test-cases', authenticate, validate(v.search), testCaseController.search)
testCaseRouter.get(base, authenticate, requireRole, validate(v.list), testCaseController.list)
testCaseRouter.post(base, authenticate, requireRole, validate(v.create), testCaseController.create)
testCaseRouter.put(`${base}/order`, authenticate, requireRole, validate(v.reorder), testCaseController.reorder)
testCaseRouter.patch(`${base}/:id`, authenticate, requireRole, validate(v.update), testCaseController.update)
testCaseRouter.delete(`${base}/:id`, authenticate, requireRole, validate(v.remove), testCaseController.remove)
testCaseRouter.post(`${base}/:id/versions/:version/restore`, authenticate, requireRole, validate(v.restoreVersion), testCaseController.restoreVersion)
testCaseRouter.post(`${base}/:id/review`, authenticate, requireRole, validate(v.caseAction), testCaseController.markReviewed)
testCaseRouter.patch(`${base}/:id/due-date`, authenticate, requireRole, validate(v.extendDueDate), testCaseController.extendDueDate)
testCaseRouter.post(`${base}/:id/archive`, authenticate, requireRole, validate(v.caseAction), testCaseController.archive)
testCaseRouter.post(`${base}/:id/restore`, authenticate, requireRole, validate(v.caseAction), testCaseController.restore)
testCaseRouter.get(`${base}/:id/impact`, authenticate, requireRole, validate(v.impact), testCaseController.impact)
