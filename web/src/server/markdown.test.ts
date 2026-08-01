import { describe, expect, it } from "vitest";
import { renderSafeMarkdown } from "./markdown.js";

describe("safe markdown", () => {
  it("renders GFM tables and task lists", () => {
    const html = renderSafeMarkdown("- [x] 完了\n\n|A|B|\n|-|-|\n|1|2|");
    expect(html).toContain("checkbox");
    expect(html).toContain("<table>");
  });

  it("removes raw HTML, images, scripts and dangerous URLs", () => {
    const html = renderSafeMarkdown('<script>alert(1)</script><img src="https://example.com/x.png">[x](javascript:alert(1))');
    expect(html).not.toContain("script");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("javascript:");
  });
});
