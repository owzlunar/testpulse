/**
 * Read an image file as a data URL, scaled down to `maxSide` px and re-encoded as JPEG.
 * Screenshots shrink from ~1–3 MB to ~100–300 KB, which keeps the mock storage usable.
 * Uploads (POST /files) send the result, so the server stores the smaller image too.
 */
export async function compressImage(file: File, maxSide = 1600, quality = 0.8): Promise<string> {
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
  // SVG / GIF keep their format
  if (!/^image\/(png|jpe?g|webp|bmp)$/.test(file.type)) return source

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = reject
    el.src = source
  })
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
  const out = canvas.toDataURL('image/jpeg', quality)
  return out.length < source.length ? out : source
}

/** Images on the clipboard (Ctrl/Cmd+V of a screenshot) */
/** a data URL (e.g. from compressImage) as a file to upload */
export async function dataUrlToFile(dataUrl: string, name: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob()
  const ext = blob.type.split('/')[1] ?? 'jpg'
  return new File([blob], name.replace(/\.[^.]+$/, '') + `.${ext === 'jpeg' ? 'jpg' : ext}`, { type: blob.type })
}

export const imagesFromClipboard = (e: ClipboardEvent): File[] =>
  [...(e.clipboardData?.items ?? [])]
    .filter((i) => i.type.startsWith('image/'))
    .map((i) => i.getAsFile())
    .filter((f): f is File => !!f)
