import type { FileCategory, UploadedFile } from '@/types'

export interface FileApi {
  /** POST /files (multipart: file, category): an image; `url` goes into Project.logo / User.avatar */
  upload(file: File, category: FileCategory): Promise<UploadedFile>
}
