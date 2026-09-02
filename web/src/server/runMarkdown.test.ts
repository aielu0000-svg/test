import { describe, expect, it } from "vitest";
import { renderRunMarkdown } from "./runMarkdown.js";

describe("renderRunMarkdown", () => {
  it("creates one navigable document and omits test data and evidence metadata", () => {
    const markdown = renderRunMarkdown({
      run: { name: "受入試験", project_name: "顧客管理", status: "completed", assignee_display_name: "山田" },
      scenarios: [
        { id: "s1", title: "正常系", excluded_at: null },
        { id: "s2", title: "異常系", excluded_at: null },
      ],
      cases: [
        { id: "c1", run_scenario_snapshot_id: "s1", scenario_title: "正常系", title: "ログイン成功", status: "pass", priority: "high", actual_result: "表示された", notes: "", data: "secret-value", excluded_at: null },
        { id: "c2", run_scenario_snapshot_id: "s2", scenario_title: "異常系", title: "ロック", status: "fail", priority: "high", actual_result: "ロックされない", notes: "要修正", excluded_at: null },
      ],
      steps: [
        { run_case_snapshot_id: "c1", step_no: 1, action_text: "ログインする", expected_result: "ホームを表示" },
      ],
      evidence: [
        { run_case_snapshot_id: "c1", description: "ログイン後画面", image_data_uri: "data:image/png;base64,AAAA", original_filename: "internal.png", sha256: "secret-hash" },
      ],
      exportedAt: "2026-08-06T00:00:00.000Z",
    });

    expect(markdown).toContain("[合格（1件）](#result-pass)");
    expect(markdown).toContain("[不合格（1件）](#result-fail)");
    expect(markdown).toContain("[正常系](#scenario-001)");
    expect(markdown).toContain("<a id=\"case-001\"></a>");
    expect(markdown).toContain("data:image/png;base64,AAAA");
    expect(markdown).toContain("ログイン後画面");
    expect(markdown).not.toContain("secret-value");
    expect(markdown).not.toContain("internal.png");
    expect(markdown).not.toContain("secret-hash");
  });
});
