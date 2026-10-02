import type { Request, Response } from 'express'
import { principal } from '#core/auth/guards.js'
import { ApiError } from '#core/http/errors.js'
import { created } from '#core/http/response.js'
import { fileService, type FileCategory } from './file.service.js'

export const fileController = {
  /** POST /files (multipart: file, category) -> UploadedFile */
  upload: async (req: Request, res: Response) => {
    if (!req.file) throw ApiError.badRequest('ไม่พบไฟล์ที่อัปโหลด')
    const uploaded = await fileService.upload(principal(), req.body.category as FileCategory, {
      buffer: req.file.buffer,
      originalName: req.file.originalname,
    })
    return created(res, uploaded)
  },

  /** GET /files/:id/content: the bytes, served so a browser can't run them as a page */
  content: async (req: Request, res: Response) => {
    const { stream, contentType, size } = await fileService.open(req.params.id as string)
    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Length', String(size))
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
    // images never change under an id: cache them (overrides the API-wide no-store)
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    // the web app shows these from its own origin
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    stream.on('error', () => res.destroy())
    stream.pipe(res)
  },
}
