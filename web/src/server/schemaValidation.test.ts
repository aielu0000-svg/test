import { describe, expect, it } from "vitest";
import type { Database } from "./db.js";
import { SchemaValidationError, validateSchema } from "./schemaValidation.js";

const requiredColumns = [
  ["scenarios", "folder_id"], ["run_case_snapshots", "notes"], ["test_cases", "view_images_json"],
  ["run_case_snapshots", "view_images_json"], ["test_runs", "draft_scenario_ids_json"],
  ["test_runs", "draft_case_ids_json"], ["test_runs", "draft_data_set_ids_json"],
  ["test_runs", "post_completion_updated_at"], ["test_runs", "post_completion_updated_by"],
];

function database(missing = false): Database {
  let call = 0;
  return {
    async query<T>() {
      call += 1;
      const rows = call === 1 ? requiredColumns.slice(missing ? 1 : 0).map(([table_name, column_name]) => ({ table_name, column_name }))
        : call === 2 ? [{ table_name: "test_case_view_images" }]
          : call === 3 ? [{ table_name: "scenarios", index_name: "ix_scenarios_project_folder" }]
            : [{ table_name: "scenarios", constraint_name: "fk_scenarios_folder" }];
      return rows as T[];
    },
    async execute() { return { affectedRows: 0 }; },
    async withTransaction<T>() { throw new Error("not used") as never as T; },
    async ping() { return undefined; },
    async close() { return undefined; },
  };
}

describe("schema validation", () => {
  it("accepts the required MariaDB schema", async () => {
    await expect(validateSchema(database(), "the_test")).resolves.toBeUndefined();
  });

  it("reports missing columns", async () => {
    await expect(validateSchema(database(true), "the_test")).rejects.toBeInstanceOf(SchemaValidationError);
    await expect(validateSchema(database(true), "the_test")).rejects.toThrow("scenarios.folder_id");
  });
});
