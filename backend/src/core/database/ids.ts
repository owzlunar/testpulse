import { randomBytes } from 'node:crypto'

/** server-made id like "proj-m1x2k3abcd" (same shape as the web app's ids; string _id, not ObjectId) */
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${randomBytes(3).toString('hex')}`

/** schema field for a string _id with the given prefix */
export const stringId = (prefix: string) => ({ type: String, default: () => newId(prefix) })
