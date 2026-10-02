// The real type of an upload comes from its first bytes, never from the name or the browser's
// Content-Type (a renamed HTML/SVG file must not be served back as an image).

interface Signature {
  contentType: string
  extension: string
  matches: (b: Buffer) => boolean
}

const startsWith = (b: Buffer, bytes: number[], offset = 0) => bytes.every((x, i) => b[offset + i] === x)

const IMAGE_SIGNATURES: Signature[] = [
  { contentType: 'image/png', extension: 'png', matches: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { contentType: 'image/jpeg', extension: 'jpg', matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  { contentType: 'image/gif', extension: 'gif', matches: (b) => startsWith(b, [0x47, 0x49, 0x46, 0x38]) },
  // RIFF....WEBP
  {
    contentType: 'image/webp',
    extension: 'webp',
    matches: (b) => startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8),
  },
]

export const detectImage = (buffer: Buffer): Signature | null => IMAGE_SIGNATURES.find((s) => s.matches(buffer)) ?? null
