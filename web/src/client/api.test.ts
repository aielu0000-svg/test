import { afterEach, describe, expect, it, vi } from "vitest";
import { request } from "./api.js";

function installFetchMock() {
  const mock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ ok: true }), {
    status: 200,
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
});
