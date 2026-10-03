import type { FileCategory, UploadedFile } from '@/types'
import { compressImage } from '@/utils/image'
import { newId } from '@/utils/ids'

/** longest side kept, by kind of picture (screenshots stay readable) */
const MAX_SIDE: Record<FileCategory, number> = { 'project-logo': 256, 'document-logo': 256, avatar: 512, 'case-image': 1600 }

/** POST /files (mock: the image stays in the browser as a data URL) */
export async function upload(file: File, category: FileCategory): Promise<UploadedFile> {
  const url = await compressImage(file, MAX_SIDE[category])
  return { id: newId('file'), url, name: file.name, contentType: 'image/jpeg', size: url.length }
}
