import { describe, expect, it } from "vitest";
import type { Database } from "./db.js";
import { SchemaValidationError, validateSchema } from "./schemaValidation.js";

const columns = [
  ["scenarios", "folder_id", "char(36)", "YES", null], ["run_case_snapshots", "notes", "longtext", "YES", null],
  ["test_cases", "view_images_json", "longtext", "YES", null], ["run_case_snapshots", "view_images_json", "longtext", "YES", null],
  ["test_runs", "draft_scenario_ids_json", "longtext", "YES", null], ["test_runs", "draft_case_ids_json", "longtext", "YES", null],
  ["test_runs", "draft_data_set_ids_json", "longtext", "YES", null], ["test_runs", "post_completion_updated_at", "datetime(6)", "YES", null],
  ["test_runs", "post_completion_updated_by", "char(36)", "YES", null], ["test_case_view_images", "id", "char(36)", "NO", null],
  ["test_case_view_images", "project_id", "char(36)", "NO", null], ["test_case_view_images", "test_case_id", "char(36)", "YES", null],
  ["test_case_view_images", "stored_path", "varchar(2000)", "NO", null], ["test_case_view_images", "content_type", "varchar(255)", "NO", null],
  ["test_case_view_images", "byte_size", "bigint unsigned", "NO", null], ["test_case_view_images", "sha256", "char(64)", "NO", null],
  ["test_case_view_images", "cleanup_status", "enum('active','pending','failed')", "NO", "active"],
  ["test_case_view_images", "cleanup_attempts", "int(11)", "NO", "0"], ["test_case_view_images", "cleanup_last_error", "longtext", "YES", null],
].map(([table_name, column_name, column_type, is_nullable, column_default]) => ({ table_name, column_name, column_type, is_nullable, column_default }));

function database(corrupt = false): Database {
  let call = 0;
  return {
    async query<T>() {
      call += 1;
      const rows = call === 1 ? columns.map((item) => corrupt && item.table_name === "test_case_view_images" && item.column_name === "byte_size" ? { ...item, column_type: "int(11)" } : item)
        : call === 2 ? [{ table_name: "test_case_view_images" }]
          : call === 3 ? [
            { table_name: "scenarios", index_name: "ix_scenarios_project_folder", seq_in_index: 1, column_name: "project_id" },
            { table_name: "scenarios", index_name: "ix_scenarios_project_folder", seq_in_index: 2, column_name: "folder_id" },
            { table_name: "scenarios", index_name: "ix_scenarios_project_folder", seq_in_index: 3, column_name: "deleted_at" },
            { table_name: "scenarios", index_name: "ix_scenarios_project_folder", seq_in_index: 4, column_name: "updated_at" },
            { table_name: "test_case_view_images", index_name: "idx_view_images_case", seq_in_index: 1, column_name: "project_id" },
            { table_name: "test_case_view_images", index_name: "idx_view_images_case", seq_in_index: 2, column_name: "test_case_id" },
            { table_name: "test_case_view_images", index_name: "idx_view_images_case", seq_in_index: 3, column_name: "created_at" },
            { table_name: "test_case_view_images", index_name: "idx_view_images_cleanup", seq_in_index: 1, column_name: "cleanup_status" },
            { table_name: "test_case_view_images", index_name: "idx_view_images_cleanup", seq_in_index: 2, column_name: "test_case_id" },
            { table_name: "test_case_view_images", index_name: "idx_view_images_cleanup", seq_in_index: 3, column_name: "created_at" },
          ] : [
            { table_name: "scenarios", constraint_name: "fk_scenarios_folder", column_name: "folder_id", referenced_table_name: "folders", referenced_column_name: "id", delete_rule: "RESTRICT" },
            { table_name: "test_case_view_images", constraint_name: "fk_view_images_project", column_name: "project_id", referenced_table_name: "projects", referenced_column_name: "id", delete_rule: "RESTRICT" },
            { table_name: "test_case_view_images", constraint_name: "fk_view_images_case", column_name: "test_case_id", referenced_table_name: "test_cases", referenced_column_name: "id", delete_rule: "RESTRICT" },
            { table_name: "test_case_view_images", constraint_name: "fk_view_images_creator", column_name: "created_by", referenced_table_name: "users", referenced_column_name: "id", delete_rule: "RESTRICT" },
          ];
      return rows as T[];
    },
    async execute() { return { affectedRows: 0 }; },
    async withTransaction<T>() { throw new Error("not used") as never as T; },
    async ping() { return undefined; },
    async close() { return undefined; },
  };
}

describe("schema validation", () => {
  it("accepts the required structural MariaDB schema", async () => {
    await expect(validateSchema(database(), "the_test")).resolves.toBeUndefined();
  });

  it("reports wrong types instead of accepting column names alone", async () => {
    await expect(validateSchema(database(true), "the_test")).rejects.toBeInstanceOf(SchemaValidationError);
    await expect(validateSchema(database(true), "the_test")).rejects.toThrow("test_case_view_images.byte_size");
  });
});