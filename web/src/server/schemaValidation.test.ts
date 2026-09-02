import { describe, expect, it } from "vitest";
import type { Database } from "./db.js";
import { SchemaValidationError, validateSchema } from "./schemaValidation.js";

const columnRows = [
  ["scenarios", "folder_id", "char(36)", "YES", null],
  ["run_case_snapshots", "notes", "longtext", "YES", null],
  ["test_cases", "view_images_json", "longtext", "YES", null],
  ["run_case_snapshots", "view_images_json", "longtext", "YES", null],
  ["test_runs", "draft_scenario_ids_json", "longtext", "YES", null],
  ["test_runs", "draft_case_ids_json", "longtext", "YES", null],
  ["test_runs", "draft_data_set_ids_json", "longtext", "YES", null],
  ["test_runs", "post_completion_updated_at", "datetime(6)", "YES", null],
  ["test_runs", "post_completion_updated_by", "char(36)", "YES", null],
  ["test_case_view_images", "id", "char(36)", "NO", null],
  ["test_case_view_images", "project_id", "char(36)", "NO", null],
  ["test_case_view_images", "test_case_id", "char(36)", "YES", null],
  ["test_case_view_images", "stored_path", "varchar(2000)", "NO", null],
  ["test_case_view_images", "content_type", "varchar(255)", "NO", null],
  ["test_case_view_images", "byte_size", "bigint unsigned", "NO", null],
  ["test_case_view_images", "sha256", "char(64)", "NO", null],
  ["test_case_view_images", "cleanup_status", "enum('active','pending','failed')", "NO", "active"],
  ["test_case_view_images", "cleanup_attempts", "int(11)", "NO", "0"],
  ["test_case_view_images", "cleanup_last_error", "longtext", "YES", null],
  ["test_case_view_images", "source_image_id", "char(36)", "YES", null],
  ["projects", "active_name", "varchar(200)", "YES", null],
  ["schema_migrations", "checksum", "char(64)", "YES", null],
  ["schema_migrations", "status", "enum('applying','applied','failed')", "NO", "applied"],
  ["file_cleanup_queue", "stored_path", "varchar(2000)", "NO", null],
  ["file_cleanup_queue", "status", "enum('pending','failed')", "NO", "pending"],
  ["system_state", "state_value", "varchar(1000)", "NO", null],
  ["operation_requests", "status", "enum('pending','running','succeeded','failed')", "NO", "pending"],
  ["active_write_requests", "id", "char(36)", "NO", null],
  ["backup_catalog", "backup_id", "varchar(100)", "NO", null],
].map(([table_name, column_name, column_type, is_nullable, column_default]) => ({ table_name, column_name, column_type, is_nullable, column_default }));

const tables = ["test_case_view_images", "file_cleanup_queue", "system_state", "operation_requests", "active_write_requests", "backup_catalog"].map((table_name) => ({ table_name }));

const indexDefinitions: Array<[string, string, string[], number]> = [
  ["scenarios", "ix_scenarios_project_folder", ["project_id", "folder_id", "deleted_at", "updated_at"], 1],
  ["test_case_view_images", "idx_view_images_case", ["project_id", "test_case_id", "created_at"], 1],
  ["test_case_view_images", "idx_view_images_cleanup", ["cleanup_status", "test_case_id", "created_at"], 1],
  ["test_case_view_images", "idx_view_images_source", ["project_id", "source_image_id", "created_at"], 1],
  ["projects", "uq_projects_active_name", ["active_name"], 0],
  ["file_cleanup_queue", "uq_file_cleanup_path", ["stored_path"], 0],
  ["operation_requests", "ix_operation_requests_status", ["status", "requested_at"], 1],
  ["active_write_requests", "ix_active_write_started", ["started_at"], 1],
  ["backup_catalog", "ix_backup_catalog_created", ["created_at"], 1],
];
const indexes = indexDefinitions.flatMap(([table_name, index_name, columns, non_unique]) => columns.map((column_name, index) => ({ table_name, index_name, seq_in_index: index + 1, column_name, non_unique })));

const foreignKeys = [
  ["scenarios", "fk_scenarios_folder", "folder_id", "folders", "id", "RESTRICT"],
  ["test_case_view_images", "fk_view_images_project", "project_id", "projects", "id", "RESTRICT"],
  ["test_case_view_images", "fk_view_images_case", "test_case_id", "test_cases", "id", "RESTRICT"],
  ["test_case_view_images", "fk_view_images_creator", "created_by", "users", "id", "RESTRICT"],
  ["test_case_view_images", "fk_view_images_source", "source_image_id", "test_case_view_images", "id", "SET NULL"],
  ["operation_requests", "fk_operation_requests_user", "requested_by", "users", "id", "RESTRICT"],
].map(([table_name, constraint_name, column_name, referenced_table_name, referenced_column_name, delete_rule]) => ({ table_name, constraint_name, column_name, referenced_table_name, referenced_column_name, delete_rule }));

function database(corrupt = false): Database {
  let call = 0;
  return {
    async query<T>() {
      call += 1;
      const rows = call === 1
        ? columnRows.map((item) => corrupt && item.table_name === "test_case_view_images" && item.column_name === "byte_size" ? { ...item, column_type: "int(11)" } : item)
        : call === 2 ? tables
          : call === 3 ? indexes
            : foreignKeys;
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
