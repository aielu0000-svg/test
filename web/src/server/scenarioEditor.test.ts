import { describe, expect, it } from "vitest";
import { imageValues } from "./routes/scenarioEditor.js";

const png = "data:image/png;base64,AA==";
const uploaded = "/api/test-case-images/123e4567-e89b-12d3-a456-426614174000/content";

describe("scenario editor image validation", () => {
  it("accepts uploaded file URLs, legacy data URLs and an omitted image list", () => {
    expect(imageValues(undefined, "images")).toEqual([]);
    expect(imageValues([uploaded, png], "images")).toEqual([uploaded, png]);
  });

  it("does not impose an application-specific image count limit", () => {
    expect(imageValues(Array.from({ length: 20 }, () => uploaded), "images")).toHaveLength(20);
  });

  it("rejects unsupported or unassociated image references", () => {
    expect(() => imageValues(["data:image/svg+xml;base64,AA=="], "images")).toThrow("アップロード済み画像ではありません");
    expect(() => imageValues(["https://example.test/image.png"], "images")).toThrow("アップロード済み画像ではありません");
  });
});
