import { describe, expect, it } from "vitest";
import type { PoolConnection } from "mariadb";
import { importFormalPayload } from "./formalImport.js";

describe("formal import", () => {
  it("restores definitions, procedures and normalized run snapshots in one connection", async () => {
    const statements: string[] = [];
    const connection = {
      async query(sql: string) {
        statements.push(sql.replace(/\s+/g, " ").trim());
        return { affectedRows: 1 };
      },
    } as unknown as PoolConnection;
    const payload = {
      folders: [{ id: "f1", name: "Folder", sort_order: 0 }],
      test_cases: [{ id: "c1", title: "Case", priority: "medium" }],
      test_steps: [{ test_case_id: "c1", step_no: 1, action_text: "Do", expected_result: "Done" }],
      test_case_tags: [{ test_case_id: "c1", tag: "smoke" }],
      test_case_folders: [{ test_case_id: "c1", folder_id: "f1" }],
      scenarios: [{ id: "s1", title: "Scenario" }],
      scenario_cases: [{ scenario_id: "s1", test_case_id: "c1", position: 0 }],
      data_sets: [{ id: "d1", name: "Data", scope: "common" }],
      data_items: [{ data_set_id: "d1", item_no: 1, label: "URL", value_text: "https://example.test" }],
      data_links: [{ data_set_id: "d1", entity_type: "case", entity_id: "c1" }],
      procedures: [{ id: "p1", title: "Procedure", current_version: 1 }],
      procedure_versions: [{ procedure_document_id: "p1", version_no: 1, markdown_source: "# Step", sha256: "a".repeat(64) }],
      test_runs: [{ id: "r1", name: "Run", status: "completed", current_revision: 1 }],
      run_revisions: [{ test_run_id: "r1", revision_no: 1, change_reason: "Start" }],
      run_scenarios: [{ id: "rs1", test_run_id: "r1", source_scenario_id: "s1", title: "Scenario", status: "pass" }],
      run_cases: [{ id: "rc1", test_run_id: "r1", run_scenario_snapshot_id: "rs1", source_test_case_id: "c1", title: "Case", priority: "medium", status: "pass" }],
      run_steps: [{ run_case_snapshot_id: "rc1", step_no: 1, action_text: "Do", expected_result: "Done" }],
      run_data_sets: [{ id: "rd1", test_run_id: "r1", source_data_set_id: "d1", name: "Data", scope: "common" }],
      run_data_items: [{ run_data_set_snapshot_id: "rd1", item_no: 1, label: "URL", value_text: "https://example.test" }],
      evidence_manifest: [{ evidence_id: "e1", original_filename: "proof.png" }],
    };

    const result = await importFormalPayload(connection, "project", "actor", payload);

    for (const table of [
      "folders", "test_cases", "test_steps", "test_case_tags", "test_case_folders",
      "scenarios", "scenario_cases", "data_sets", "data_items", "data_links",
      "procedure_documents", "procedure_versions", "test_runs", "run_revisions",
      "run_scenario_snapshots", "run_case_snapshots", "run_step_snapshots",
      "run_data_set_snapshots", "run_data_item_snapshots",
    ]) expect(statements.some((sql) => sql.includes(table)), table).toBe(true);
    expect(result.skippedEvidence).toBe(1);
    expect(result.imported).toBe(9);
  });
});
