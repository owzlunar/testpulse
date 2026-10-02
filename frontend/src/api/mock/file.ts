import type { FileCategory, UploadedFile } from '@/types'
import { compressImage } from '@/utils/image'
import { newId } from '@/utils/ids'

/** POST /files (mock: the image stays in the browser as a data URL) */
export async function upload(file: File, category: FileCategory): Promise<UploadedFile> {
  const url = await compressImage(file, category === 'project-logo' ? 256 : 512)
  return { id: newId('file'), url, name: file.name, contentType: 'image/jpeg', size: url.length }
}
