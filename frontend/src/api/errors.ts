// Errors every API implementation (real or mock) throws, and the message the UI shows for any error.

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 500,
    /** machine-readable reason, e.g. 'stale' (the data changed since the client loaded it) */
    public code?: string,
  ) {
    super(message)
  }
}

/** Message for any thrown value (shown in the global error toast) */
export const errorMessage = (e: unknown): string =>
  e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'
