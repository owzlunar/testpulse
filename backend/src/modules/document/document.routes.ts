import { Router } from 'express'
import { authenticate, requireRole } from '#core/auth/guards.js'
import { searchQuery } from '#core/http/search.js'
import { validate } from '#core/http/validate.js'
import { documentController } from './document.controller.js'
import { documentValidation as v } from './document.validation.js'

// document.view to read; generating, editing a draft, sending for sign-off, deleting and the template
// need document.create, signing document.sign; access to the project is checked in the service.
export const documentRouter = Router()

documentRouter.get('/documents', authenticate, documentController.list)
documentRouter.get('/documents/search', authenticate, validate({ query: searchQuery }), documentController.search)
documentRouter.post('/documents', authenticate, requireRole, validate(v.generate), documentController.generate)
documentRouter.post('/documents/:id/regenerate', authenticate, requireRole, validate({ params: v.idParams }), documentController.regenerate)
documentRouter.patch('/documents/:id', authenticate, requireRole, validate(v.update), documentController.update)
documentRouter.post('/documents/:id/signatures/:index', authenticate, requireRole, validate(v.sign), documentController.sign)
documentRouter.delete('/documents/:id', authenticate, requireRole, validate({ params: v.idParams }), documentController.remove)
documentRouter.get('/organization/document-template', authenticate, requireRole, documentController.template)
documentRouter.put('/organization/document-template', authenticate, requireRole, validate(v.template), documentController.saveTemplate)
