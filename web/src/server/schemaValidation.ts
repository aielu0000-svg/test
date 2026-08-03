import type { Database } from "./db.js";

type ColumnRule = readonly [table: string, column: string, type: string, nullable: "YES" | "NO", defaultValue?: string | null];

const requiredColumns: readonly ColumnRule[] = [
  ["scenarios", "folder_id", "char(36)", "YES"],
  ["run_case_snapshots", "notes", "longtext", "YES"],
  ["test_cases", "view_images_json", "longtext", "YES"],
  ["run_case_snapshots", "view_images_json", "longtext", "YES"],
  ["test_runs", "draft_scenario_ids_json", "longtext", "YES"],
  ["test_runs", "draft_case_ids_json", "longtext", "YES"],
  ["test_runs", "draft_data_set_ids_json", "longtext", "YES"],
  ["test_runs", "post_completion_updated_at", "datetime(6)", "YES"],
  ["test_runs", "post_completion_updated_by", "char(36)", "YES"],
  ["test_case_view_images", "id", "char(36)", "NO"],
  ["test_case_view_images", "project_id", "char(36)", "NO"],
  ["test_case_view_images", "test_case_id", "char(36)", "YES"],
  ["test_case_view_images", "stored_path", "varchar(2000)", "NO"],
  ["test_case_view_images", "content_type", "varchar(255)", "NO"],
  ["test_case_view_images", "byte_size", "bigint unsigned", "NO"],
  ["test_case_view_images", "sha256", "char(64)", "NO"],
  ["test_case_view_images", "cleanup_status", "enum('active','pending','failed')", "NO", "active"],
  ["test_case_view_images", "cleanup_attempts", "int", "NO", "0"],
  ["test_case_view_images", "cleanup_last_error", "longtext", "YES"],
];

const requiredTables = ["test_case_view_images"] as const;
const requiredIndexes = [
  ["scenarios", "ix_scenarios_project_folder", ["project_id", "folder_id", "deleted_at", "updated_at"]],
  ["test_case_view_images", "idx_view_images_case", ["project_id", "test_case_id", "created_at"]],
  ["test_case_view_images", "idx_view_images_cleanup", ["cleanup_status", "test_case_id", "created_at"]],
] as const;
const requiredForeignKeys = [
  ["scenarios", "fk_scenarios_folder", "folder_id", "folders", "id", "RESTRICT"],
  ["test_case_view_images", "fk_view_images_project", "project_id", "projects", "id", "RESTRICT"],
  ["test_case_view_images", "fk_view_images_case", "test_case_id", "test_cases", "id", "RESTRICT"],
  ["test_case_view_images", "fk_view_images_creator", "created_by", "users", "id", "RESTRICT"],
] as const;

export class SchemaValidationError extends Error {
  constructor(
    public readonly columnProblems: string[],
    public readonly missingTables: string[],
    public readonly indexProblems: string[],
    public readonly foreignKeyProblems: string[],
  ) {
    const sections = [
      columnProblems.length ? "Column definitions:\n" + columnProblems.map((item) => "- " + item).join("\n") : "",
      missingTables.length ? "Missing tables:\n" + missingTables.map((item) => "- " + item).join("\n") : "",
      indexProblems.length ? "Indexes:\n" + indexProblems.map((item) => "- " + item).join("\n") : "",
      foreignKeyProblems.length ? "Foreign keys:\n" + foreignKeyProblems.map((item) => "- " + item).join("\n") : "",
    ].filter(Boolean);
    super("Schema validation failed.\n" + sections.join("\n"));
    this.name = "SchemaValidationError";
  }
}

export async function validateSchema(db: Database, database: string): Promise<void> {
  const [columns, tables, indexes, foreignKeys] = await Promise.all([
    db.query<{ table_name: string; column_name: string; column_type: string; is_nullable: "YES" | "NO"; column_default: string | null }>(
      "SELECT table_name, column_name, column_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = ?",
      [database],
    ),
    db.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = ?",
      [database],
    ),
    db.query<{ table_name: string; index_name: string; seq_in_index: number; column_name: string }>(
      "SELECT table_name, index_name, seq_in_index, column_name FROM information_schema.statistics WHERE table_schema = ? ORDER BY table_name, index_name, seq_in_index",
      [database],
    ),
    db.query<{ table_name: string; constraint_name: string; column_name: string; referenced_table_name: string; referenced_column_name: string; delete_rule: string }>(
      "SELECT rc.table_name, rc.constraint_name, kcu.column_name, kcu.referenced_table_name, kcu.referenced_column_name, rc.delete_rule FROM information_schema.referential_constraints rc JOIN information_schema.key_column_usage kcu ON kcu.constraint_schema = rc.constraint_schema AND kcu.constraint_name = rc.constraint_name AND kcu.table_name = rc.table_name WHERE rc.constraint_schema = ?",
      [database],
    ),
  ]);
  const columnsByName = new Map(columns.map((item) => [item.table_name + "." + item.column_name, item]));
  const tablesSet = new Set(tables.map((item) => item.table_name));
  const indexesByName = new Map<string, string[]>();
  for (const item of indexes) {
    const key = item.table_name + "." + item.index_name;
    indexesByName.set(key, [...(indexesByName.get(key) ?? []), item.column_name]);
  }
  const foreignKeysByName = new Map(foreignKeys.map((item) => [item.table_name + "." + item.constraint_name, item]));

  const columnProblems = requiredColumns.flatMap(([table, column, type, nullable, defaultValue]) => {
    const found = columnsByName.get(table + "." + column);
    if (!found) return [table + "." + column + " is missing"];
    const actualType = found.column_type.toLowerCase().replace(/^(tinyint|smallint|mediumint|int|bigint)\(\d+\)/, "$1");
    const actualDefault = found.column_default === null ? null : String(found.column_default).replace(/^'|'$/g, "");
    if (actualType !== type || found.is_nullable !== nullable || (defaultValue !== undefined && actualDefault !== defaultValue)) {
      return [table + "." + column + " expected " + type + " nullable=" + nullable + " default=" + (defaultValue ?? "<any>") + ", found " + found.column_type + " nullable=" + found.is_nullable + " default=" + (actualDefault ?? "NULL")];
    }
    return [];
  });
  const missingTables = requiredTables.filter((table) => !tablesSet.has(table));
  const indexProblems = requiredIndexes.flatMap(([table, name, expectedColumns]) => {
    const actual = indexesByName.get(table + "." + name);
    return actual?.join(",") === expectedColumns.join(",") ? [] : [table + "." + name + " expected (" + expectedColumns.join(",") + "), found (" + (actual?.join(",") ?? "missing") + ")"];
  });
  const foreignKeyProblems = requiredForeignKeys.flatMap(([table, name, column, referencedTable, referencedColumn, deleteRule]) => {
    const actual = foreignKeysByName.get(table + "." + name);
    return actual && actual.column_name === column && actual.referenced_table_name === referencedTable && actual.referenced_column_name === referencedColumn && actual.delete_rule.toUpperCase() === deleteRule
      ? [] : [table + "." + name + " expected " + column + " -> " + referencedTable + "." + referencedColumn + " ON DELETE " + deleteRule];
  });
  if (columnProblems.length || missingTables.length || indexProblems.length || foreignKeyProblems.length) {
    throw new SchemaValidationError(columnProblems, missingTables, indexProblems, foreignKeyProblems);
  }
}