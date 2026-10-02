// An error the client may see: status, Thai message (shown in the web app's toast) and an optional
// machine-readable code (e.g. 'stale' for a 409 the client answers by reloading).

export interface FieldError {
  field: string
  message: string
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly errors?: FieldError[],
  ) {
    super(message)
    this.name = 'ApiError'
  }

  static badRequest = (message: string, errors?: FieldError[]) => new ApiError(400, message, 'invalid', errors)
  static unauthorized = (message = 'กรุณาเข้าสู่ระบบ') => new ApiError(401, message, 'unauthorized')
  static forbidden = (message = 'ไม่มีสิทธิ์ทำรายการนี้') => new ApiError(403, message, 'forbidden')
  static notFound = (message = 'ไม่พบข้อมูล') => new ApiError(404, message, 'not_found')
  static conflict = (message: string, code = 'conflict') => new ApiError(409, message, code)
  static unprocessable = (message: string) => new ApiError(422, message, 'unprocessable')
}
