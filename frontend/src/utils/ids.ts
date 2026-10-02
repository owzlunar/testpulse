/** Unique id like the backend would generate ("prefix-<time><random>") */
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
