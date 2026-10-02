import type { FileApi } from '@/api/contract'
import type { UploadedFile } from '@/types'
import { request } from './http'

export const fileApi: FileApi = {
  upload(file, category) {
    const form = new FormData()
    form.append('category', category)
    form.append('file', file)
    return request<UploadedFile>('POST', '/files', { body: form })
  },
}
