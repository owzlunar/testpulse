import { Router } from 'express'
import Joi from 'joi'
import multer from 'multer'
import { authenticate } from '#core/auth/guards.js'
import { config } from '#core/config/env.js'
import { idParams, validate } from '#core/http/validate.js'
import { fileController } from './file.controller.js'
import { FILE_CATEGORIES } from './file.model.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.storage.maxUploadBytes, files: 1, fields: 5 },
})

export const fileRouter = Router()

fileRouter.post(
  '/files',
  authenticate,
  upload.single('file'),
  validate({
    body: Joi.object({
      category: Joi.string()
        .valid(...FILE_CATEGORIES)
        .required(),
    }),
  }),
  fileController.upload,
)
// public: <img src> can't send a Bearer token; case images are protected by their unguessable id (file.service)
fileRouter.get('/files/:id/content', validate({ params: idParams }), fileController.content)
