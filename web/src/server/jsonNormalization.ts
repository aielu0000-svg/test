/**
 * MariaDB can return BIGINT columns as bigint. Fastify/JSON.stringify cannot
 * serialize bigint and coercing it blindly to number loses precision. The
 * public API represents byte_size as a decimal string; other safe bigint
 * values remain numbers for backwards-compatible API fields.
 */
export function normalizeDatabaseJson(value: unknown, key?: string): unknown {
  if (typeof value === "bigint") {
    if (key === "byte_size") return value.toString();
    const asNumber = Number(value);
    return Number.isSafeInteger(asNumber) ? asNumber : value.toString();
  }
  if (Array.isArray(value)) return value.map((item) => normalizeDatabaseJson(item));
  if (value && typeof value === "object" && !(value instanceof Date) && !Buffer.isBuffer(value)) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([name, item]) => [name, normalizeDatabaseJson(item, name)]));
  }
  return value;
}

export function normalizeDatabaseRecord<T extends Record<string, unknown>>(record: T): T {
  return normalizeDatabaseJson(record) as T;
}

/** byte_size is always a decimal string in public JSON and formal exports. */
export function byteSizeString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}