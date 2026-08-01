const USERNAME_PATTERN = /^[\p{L}\p{N}\p{M} ._@-]+$/u;

export interface ValidationResult {
  value?: string;
  error?: string;
}

export function normalizeUsername(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

export function validateUsername(input: unknown): ValidationResult {
  if (typeof input !== "string") return { error: "ユーザー名は必須です。" };
  const value = input.trim();
  if (!value) return { error: "ユーザー名は必須です。" };
  if (value.length > 100) return { error: "ユーザー名は100文字以内で入力してください。" };
  if (/[\r\n\t\p{Cc}]/u.test(value) || !USERNAME_PATTERN.test(value)) {
    return { error: "ユーザー名に使用できない文字が含まれています。" };
  }
  return { value };
}

export function validatePassword(input: unknown): ValidationResult {
  if (typeof input !== "string") return { error: "パスワードは必須です。" };
  const value = input.trim();
  if (value.length < 4) return { error: "パスワードは4文字以上で入力してください。" };
  if (value.length > 128) return { error: "パスワードは128文字以内で入力してください。" };
  return { value };
}

export function validateProjectName(input: unknown): ValidationResult {
  if (typeof input !== "string") return { error: "プロジェクト名は必須です。" };
  const value = input.trim();
  if (!value) return { error: "プロジェクト名は必須です。" };
  if (value.length > 200) return { error: "プロジェクト名は200文字以内で入力してください。" };
  return { value };
}

export function validateDisplayName(input: unknown): ValidationResult {
  if (input === null || input === undefined || input === "") return { value: "" };
  if (typeof input !== "string") return { error: "表示名が不正です。" };
  const value = input.trim();
  if (value.length > 100) return { error: "表示名は100文字以内で入力してください。" };
  if (/[\r\n\t\p{Cc}]/u.test(value)) return { error: "表示名に改行や制御文字は使用できません。" };
  return { value };
}
