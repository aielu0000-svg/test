export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function badRequest(message: string, details?: unknown): ApiError {
  return new ApiError(400, "BAD_REQUEST", message, details);
}

export function unauthorized(): ApiError {
  return new ApiError(401, "UNAUTHENTICATED", "ログインが必要です。");
}

export function forbidden(): ApiError {
  return new ApiError(403, "FORBIDDEN", "この操作を実行する権限がありません。");
}

export function notFound(): ApiError {
  return new ApiError(404, "NOT_FOUND", "対象データが見つかりません。");
}

export function conflict(message = "他の利用者によって更新されています。最新内容を確認してください。"): ApiError {
  return new ApiError(409, "OPTIMISTIC_LOCK_CONFLICT", message);
}
