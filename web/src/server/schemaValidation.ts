import type { Database } from "./db.js";

const requiredColumns = [
  ["scenarios", "folder_id"],
  ["run_case_snapshots", "notes"],
  ["test_cases", "view_images_json"],
  ["run_case_snapshots", "view_images_json"],
  ["test_runs", "draft_scenario_ids_json"],
  ["test_runs", "draft_case_ids_json"],
  ["test_runs", "draft_data_set_ids_json"],
  ["test_runs", "post_completion_updated_at"],
  ["test_runs", "post_completion_updated_by"],
] as const;

const requiredTables = ["test_case_view_images"] as const;
const requiredIndexes = [["scenarios", "ix_scenarios_project_folder"]] as const;
const requiredForeignKeys = [["scenarios", "fk_scenarios_folder"]] as const;

export class SchemaValidationError extends Error {
  constructor(
    public readonly missingColumns: string[],
    public readonly missingTables: string[],
    public readonly missingIndexes: string[],
    public readonly missingForeignKeys: string[],
  ) {
    const sections = [
      missingColumns.length ? `Missing columns:\n${missingColumns.map((item) => `- ${item}`).join("\n")}` : "",
      missingTables.length ? `Missing tables:\n${missingTables.map((item) => `- ${item}`).join("\n")}` : "",
      missingIndexes.length ? `Missing indexes:\n${missingIndexes.map((item) => `- ${item}`).join("\n")}` : "",
      missingForeignKeys.length ? `Missing foreign keys:\n${missingForeignKeys.map((item) => `- ${item}`).join("\n")}` : "",
    ].filter(Boolean);
    super(`Schema validation failed.\n${sections.join("\n")}`);
    this.name = "SchemaValidationError";
  }
}

export async function validateSchema(db: Database, database: string): Promise<void> {
  const [columns, tables, indexes, foreignKeys] = await Promise.all([
    db.query<{ table_name: string; column_name: string }>(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = ?",
      [database],
    ),
    db.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = ?",
      [database],
    ),
    db.query<{ table_name: string; index_name: string }>(
      "SELECT table_name, index_name FROM information_schema.statistics WHERE table_schema = ?",
      [database],
    ),
    db.query<{ table_name: string; constraint_name: string }>(
      "SELECT table_name, constraint_name FROM information_schema.referential_constraints WHERE constraint_schema = ?",
      [database],
    ),
  ]);
  const columnSet = new Set(columns.map((item) => `${item.table_name}.${item.column_name}`));
  const tableSet = new Set(tables.map((item) => item.table_name));
  const indexSet = new Set(indexes.map((item) => `${item.table_name}.${item.index_name}`));
  const foreignKeySet = new Set(foreignKeys.map((item) => `${item.table_name}.${item.constraint_name}`));
  const missingColumns = requiredColumns.map(([table, column]) => `${table}.${column}`).filter((item) => !columnSet.has(item));
  const missingTables = requiredTables.filter((table) => !tableSet.has(table));
  const missingIndexes = requiredIndexes.map(([table, index]) => `${table}.${index}`).filter((item) => !indexSet.has(item));
  const missingForeignKeys = requiredForeignKeys.map(([table, foreignKey]) => `${table}.${foreignKey}`).filter((item) => !foreignKeySet.has(item));
  if (missingColumns.length || missingTables.length || missingIndexes.length || missingForeignKeys.length) {
    throw new SchemaValidationError(missingColumns, missingTables, missingIndexes, missingForeignKeys);
  }
}
