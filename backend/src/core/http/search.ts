import Joi from 'joi'

// Searches (the universal search): text matched case-insensitively and literally, one page at a time.

/** what the user typed, as a case-insensitive pattern (regex characters match themselves) */
export const searchPattern = (text: string) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')

const page = {
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).max(10000).default(0),
}

/** ?q=&limit=&offset= */
export const searchQuery = Joi.object({ q: Joi.string().allow('').max(200).default(''), ...page })

/** ?search=&limit=&offset= (GET /test-cases) */
export const searchParamQuery = Joi.object({ search: Joi.string().allow('').max(200).default(''), ...page })

export interface SearchRequest {
  q: string
  limit: number
  offset: number
}
