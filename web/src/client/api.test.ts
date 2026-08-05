import { afterEach, describe, expect, it, vi } from "vitest";
import { api, request } from "./api.js";

function installFetchMock({ status = 200, payload = { ok: true } }: { status?: number; payload?: unknown } = {}) {
  const mock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  }));
  vi.stubGlobal("fetch", mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("request content type", () => {
  it("does not label a bodyless POST as JSON", async () => {
    const fetchMock = installFetchMock();

    await request("/api/imports/excel/preview-id/confirm", { method: "POST" });

    const init = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).has("Content-Type")).toBe(false);
  });

  it("labels JSON string bodies as application/json", async () => {
    const fetchMock = installFetchMock();

    await request("/api/example", { method: "POST", body: JSON.stringify({ value: 1 }) });

    const init = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
  });

  it("lets the browser add the multipart boundary for FormData", async () => {
    const fetchMock = installFetchMock();
    const form = new FormData();
    form.set("projectId", "project-1");

    await request("/api/imports/excel/preview", { method: "POST", body: form });

    const init = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).has("Content-Type")).toBe(false);
  });

  it("disables browser caching for API requests", async () => {
    const fetchMock = installFetchMock();

    await request("/api/projects");

    expect(fetchMock.mock.calls[0]?.[1]?.cache).toBe("no-store");
  });
});

describe("project deletion", () => {
  it("treats a missing project as already deleted", async () => {
    installFetchMock({
      status: 404,
      payload: { error: { code: "NOT_FOUND", message: "対象データが見つかりません。", requestId: "request-1" } },
    });

    await expect(api.deleteProject("project-1", 2, "削除対象", "不要になったため")).resolves.toEqual({ ok: true });
  });

  it("does not hide other deletion errors", async () => {
    installFetchMock({
      status: 409,
      payload: { error: { code: "OPTIMISTIC_LOCK_CONFLICT", message: "最新内容を確認してください。" } },
    });

    await expect(api.deleteProject("project-1", 2, "削除対象", "不要になったため")).rejects.toMatchObject({ status: 409 });
  });
});
