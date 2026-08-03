import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance } from "fastify";
import type { PoolConnection } from "mariadb";
import sharp, { type Metadata } from "sharp";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { writeAudit } from "../audit.js";
import { badRequest, conflict, notFound } from "../errors.js";
import { cleanupDetachedViewImages, cleanupExpiredPendingViewImages } from "../viewImageLifecycle.js";
import {
  authenticatedProject, objectBody, projectIdFrom, routeParam, stringArray,
  stringValue, versionValue,
} from "./routeUtils.js";

type Priority = "high" | "medium" | "low";
type StepInput = { action: string; expected: string };
type EditorCaseInput = {
  clientKey: string;
  id: string | null;
  version: number | null;
  title: string;
  objective: string;
  preconditions: string;
  viewLocation: string;
  images: string[];
  data: string;
  priority: Priority;
  tags: string[];
  folderIds: string[];
  steps: StepInput[];
};
type CommonDataInput = {
  id: string | null;
  version: number | null;
  name: string;
  description: string;
  items: Array<{ label: string; value: string; memo: string }>;
} | null;

const VIEW_IMAGE_URL = /^\/api\/test-case-images\/([0-9a-f-]{36})\/content$/i;
const IMAGE_FORMATS = {
  png: { contentType: "image/png", extension: ".png" },
  jpeg: { contentType: "image/jpeg", extension: ".jpg" },
  webp: { contentType: "image/webp", extension: ".webp" },
  gif: { contentType: "image/gif", extension: ".gif" },
} as const;

async function validatedImage(pathname: string): Promise<{ contentType: string; extension: string }> {
  let metadata: Metadata;
  try {
    metadata = await sharp(pathname, { animated: true, pages: 1 }).metadata();
  } catch {
    throw badRequest("画像をデコードできません。PNG、JPEG、WebP、GIFのいずれかを指定してください。");
  }
  const format = metadata.format as keyof typeof IMAGE_FORMATS | undefined;
  if (!format || !IMAGE_FORMATS[format] || !metadata.width || !metadata.height) {
    throw badRequest("画像形式はPNG、JPEG、WebP、GIFのみです。SVGは利用できません。");
  }
  return IMAGE_FORMATS[format];
}

export function imageValues(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw badRequest(`${field}は配列で指定してください。`);
  return value.map((raw, index) => {
    const legacyDataUrl = typeof raw === "string" && /^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(raw);
    if (typeof raw !== "string" || (!legacyDataUrl && !VIEW_IMAGE_URL.test(raw))) {
      throw badRequest(`${field}[${index}]はアップロード済み画像ではありません。`);
    }
    return raw;
  });
}

function safeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "_").slice(0, 180) || "file";
}

function hashingTransform(hash: ReturnType<typeof createHash>): Transform {
  return new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      callback(null, chunk);
    },
  });
}


function priorityValue(value: unknown, field: string): Priority {
  if (value === "high" || value === "medium" || value === "low") return value;
  throw badRequest(`${field}はhigh、medium、lowのいずれかです。`);
}

function nullableId(value: unknown, field: string): string | null {
  return stringValue(value, field, 100) || null;
}

function editorCases(value: unknown): EditorCaseInput[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    throw badRequest("casesは1〜100件で指定してください。");
  }
  return value.map((raw, caseIndex) => {
    if (!raw || typeof raw !== "object") throw badRequest(`cases[${caseIndex}]が不正です。`);
    const item = raw as Record<string, unknown>;
    if (!Array.isArray(item.steps) || item.steps.length === 0 || item.steps.length > 100) {
      throw badRequest(`cases[${caseIndex}].stepsは1〜100件で指定してください。`);
    }
    const steps = item.steps.map((rawStep, stepIndex) => {
      if (!rawStep || typeof rawStep !== "object") throw badRequest(`cases[${caseIndex}].steps[${stepIndex}]が不正です。`);
      const step = rawStep as Record<string, unknown>;
      return {
        action: stringValue(step.action, `cases[${caseIndex}].steps[${stepIndex}].action`, 100_000, true),
        expected: stringValue(step.expected, `cases[${caseIndex}].steps[${stepIndex}].expected`, 100_000, true),
      };
    });
    const id = nullableId(item.id, `cases[${caseIndex}].id`);
    return {
      clientKey: stringValue(item.clientKey, `cases[${caseIndex}].clientKey`, 200, true),
      id,
      version: id ? versionValue(item.version) : null,
      title: stringValue(item.title, `cases[${caseIndex}].title`, 500, true),
      objective: stringValue(item.objective, `cases[${caseIndex}].objective`, 100_000),
      images: imageValues(item.images, `cases[${caseIndex}].images`),
      preconditions: stringValue(item.preconditions, `cases[${caseIndex}].preconditions`, 100_000),
      viewLocation: stringValue(item.viewLocation, `cases[${caseIndex}].viewLocation`, 100_000),
      data: stringValue(item.data, `cases[${caseIndex}].data`, 100_000),
      priority: priorityValue(item.priority ?? "medium", `cases[${caseIndex}].priority`),
      tags: stringArray(item.tags, `cases[${caseIndex}].tags`, 100),
      folderIds: stringArray(item.folderIds, `cases[${caseIndex}].folderIds`, 100),
      steps,
    };
  });
}

function commonDataValue(value: unknown): CommonDataInput {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object") throw badRequest("commonDataが不正です。");
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.items) || input.items.length > 200) throw badRequest("commonData.itemsは200件以下で指定してください。");
  const id = nullableId(input.id, "commonData.id");
  return {
    id,
    version: id ? versionValue(input.version) : null,
    name: stringValue(input.name, "commonData.name", 300, true),
    description: stringValue(input.description, "commonData.description", 100_000),
    items: input.items.map((raw, index) => {
      if (!raw || typeof raw !== "object") throw badRequest(`commonData.items[${index}]が不正です。`);
      const item = raw as Record<string, unknown>;
      return {
        label: stringValue(item.label, `commonData.items[${index}].label`, 300, true),
        value: stringValue(item.value, `commonData.items[${index}].value`, 100_000),
        memo: stringValue(item.memo, `commonData.items[${index}].memo`, 100_000),
      };
    }),
  };
}

async function ensureFolder(connection: PoolConnection, projectId: string, folderId: string | null): Promise<void> {
  if (!folderId) return;
  const rows = await connection.query("SELECT id FROM folders WHERE id = ? AND project_id = ? AND deleted_at IS NULL LIMIT 1", [folderId, projectId]);
  if (!rows[0]) throw badRequest("存在しない、削除済み、または別プロジェクトのフォルダが含まれています。");
}

async function replaceCaseChildren(connection: PoolConnection, projectId: string, caseId: string, item: EditorCaseInput): Promise<void> {
  for (const folderId of item.folderIds) await ensureFolder(connection, projectId, folderId);
  await connection.query("DELETE FROM test_steps WHERE test_case_id = ?", [caseId]);
  await connection.query("DELETE FROM test_case_tags WHERE test_case_id = ?", [caseId]);
  await connection.query("DELETE FROM test_case_folders WHERE test_case_id = ?", [caseId]);
  for (const [index, step] of item.steps.entries()) {
    await connection.query(
      "INSERT INTO test_steps (id, test_case_id, step_no, action_text, expected_result) VALUES (?, ?, ?, ?, ?)",
      [randomUUID(), caseId, index + 1, step.action, step.expected],
    );
  }
  for (const tag of item.tags) await connection.query("INSERT INTO test_case_tags (test_case_id, tag) VALUES (?, ?)", [caseId, tag]);
  for (const folderId of item.folderIds) await connection.query("INSERT INTO test_case_folders (test_case_id, folder_id) VALUES (?, ?)", [caseId, folderId]);
}

async function saveCase(connection: PoolConnection, projectId: string, actorId: string, item: EditorCaseInput): Promise<{ id: string; detachedImageIds: string[] }> {
  const id = item.id ?? randomUUID();
  const oldImageRows = await connection.query<Array<{ view_images_json: string | null }>>(
    "SELECT view_images_json FROM test_cases WHERE id = ? AND project_id = ? LIMIT 1",
    [id, projectId],
  );
  const detachedImageIds = oldImageRows.flatMap((row) => {
    try {
      const images = JSON.parse(row.view_images_json ?? "[]");
      return Array.isArray(images) ? images.flatMap((image) => typeof image === "string" ? image.match(VIEW_IMAGE_URL)?.[1] ?? [] : []) : [];
    } catch { return []; }
  });
  if (item.id) {
    const result = await connection.query(
      `UPDATE test_cases SET title = ?, objective = ?, preconditions = ?, view_location = ?, view_images_json = ?, priority = ?,
         version = version + 1, updated_at = UTC_TIMESTAMP(6)
       WHERE id = ? AND project_id = ? AND version = ? AND deleted_at IS NULL`,
      [item.title, item.objective || null, item.preconditions || null, item.viewLocation || null, JSON.stringify(item.images), item.priority, id, projectId, item.version],
    );
    if (Number(result.affectedRows) !== 1) throw conflict(`確認項目「${item.title}」が他の利用者によって更新されています。`);
  } else {
    await connection.query(
      `INSERT INTO test_cases (id, project_id, title, objective, preconditions, view_location, view_images_json, priority, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, projectId, item.title, item.objective || null, item.preconditions || null, item.viewLocation || null, JSON.stringify(item.images), item.priority, actorId],
    );
  }
  await replaceCaseChildren(connection, projectId, id, item);
  const imageIds = item.images.flatMap((image) => {
    const match = image.match(VIEW_IMAGE_URL);
    return match ? [match[1]] : [];
  });
  await connection.query("UPDATE test_case_view_images SET test_case_id = NULL WHERE project_id = ? AND test_case_id = ?", [projectId, id]);
  if (imageIds.length) {
    const rows = await connection.query<Array<{ id: string }>>(
      "SELECT id FROM test_case_view_images WHERE project_id = ? AND id IN (?) AND cleanup_status = 'active' AND (test_case_id IS NULL OR test_case_id = ?)",
      [projectId, imageIds, id],
    );
    if (rows.length !== new Set(imageIds).size) throw badRequest("別プロジェクトまたは別ケースに関連付け済みの画像が含まれています。");
    await connection.query("UPDATE test_case_view_images SET test_case_id = ? WHERE project_id = ? AND id IN (?)", [id, projectId, imageIds]);
  }
  return { id, detachedImageIds };
}
async function saveCommonData(
  connection: PoolConnection, projectId: string, actorId: string, scenarioId: string,
  input: CommonDataInput, cases: Array<{ id: string; title: string; data: string }>, defaultName: string,
): Promise<void> {
  const caseItems = cases.filter((item) => item.data.trim());
  if (!input && !caseItems.length) {
    await connection.query("DELETE FROM data_links WHERE entity_type = 'scenario' AND entity_id = ?", [scenarioId]);
    return;
  }
  const effective = input ?? { id: null, version: null, name: `${defaultName}のテストデータ`, description: "", items: [] };
  const id = effective.id ?? randomUUID();
  if (effective.id) {
    const result = await connection.query(
      `UPDATE data_sets SET name = ?, description = ?, scope = 'scenario', version = version + 1, updated_at = UTC_TIMESTAMP(6)
       WHERE id = ? AND project_id = ? AND version = ? AND deleted_at IS NULL`,
      [effective.name, effective.description || null, id, projectId, effective.version],
    );
    if (Number(result.affectedRows) !== 1) throw conflict("共通テストデータが他の利用者によって更新されています。");
  } else {
    await connection.query(
      "INSERT INTO data_sets (id, project_id, name, scope, description, created_by) VALUES (?, ?, ?, 'scenario', ?, ?)",
      [id, projectId, effective.name, effective.description || null, actorId],
    );
  }
  await connection.query("DELETE FROM data_items WHERE data_set_id = ?", [id]);
  for (const [index, item] of effective.items.entries()) {
    await connection.query(
      "INSERT INTO data_items (id, data_set_id, sort_order, label, item_value, memo) VALUES (?, ?, ?, ?, ?, ?)",
      [randomUUID(), id, index + 1, item.label, item.value || null, item.memo || null],
    );
  }
  for (const [offset, item] of caseItems.entries()) {
    await connection.query(
      "INSERT INTO data_items (id, data_set_id, sort_order, label, item_value, memo) VALUES (?, ?, ?, ?, ?, ?)",
      [randomUUID(), id, effective.items.length + offset + 1, item.title, item.data, `__case__:${item.id}`],
    );
  }
  await connection.query("DELETE FROM data_links WHERE entity_type = 'scenario' AND entity_id = ? AND data_set_id <> ?", [scenarioId, id]);
  await connection.query(
    "INSERT INTO data_links (data_set_id, entity_type, entity_id, apply_reason) VALUES (?, 'scenario', ?, ?) ON DUPLICATE KEY UPDATE apply_reason = VALUES(apply_reason)",
    [id, scenarioId, "テスト設計画面の共通テストデータ"],
  );
}

async function loadEditor(db: Database, projectId: string, scenarioId: string) {
  const scenarios = await db.query<Record<string, unknown>>(
    "SELECT id, folder_id, title, objective, preconditions, version, updated_at FROM scenarios WHERE id = ? AND project_id = ? AND deleted_at IS NULL LIMIT 1",
    [scenarioId, projectId],
  );
  const scenario = scenarios[0];
  if (!scenario) throw notFound();
  const caseRows = await db.query<Record<string, unknown>>(
    `SELECT c.id, c.title, c.objective, c.preconditions, c.view_location, c.view_images_json, c.priority, c.version
       FROM scenario_cases sc JOIN test_cases c ON c.id = sc.test_case_id
      WHERE sc.scenario_id = ? AND c.deleted_at IS NULL ORDER BY sc.sort_order`,
    [scenarioId],
  );
  const cases = await Promise.all(caseRows.map(async (item) => {
    const [steps, tags, folders] = await Promise.all([
      db.query<Record<string, unknown>>("SELECT action_text, expected_result FROM test_steps WHERE test_case_id = ? AND deleted_at IS NULL ORDER BY step_no", [item.id]),
      db.query<Record<string, unknown>>("SELECT tag FROM test_case_tags WHERE test_case_id = ? ORDER BY tag", [item.id]),
      db.query<Record<string, unknown>>("SELECT folder_id FROM test_case_folders WHERE test_case_id = ? ORDER BY folder_id", [item.id]),
    ]);
    return {
      id: item.id, version: Number(item.version), title: item.title, objective: item.objective ?? "",
      preconditions: item.preconditions ?? "", viewLocation: item.view_location ?? "",
      images: (() => {
        try {
          const value = JSON.parse(String(item.view_images_json ?? "[]"));
          return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
        } catch { return []; }
      })(),
      priority: item.priority,
      tags: tags.map((row) => row.tag), folderIds: folders.map((row) => row.folder_id),
      steps: steps.map((row) => ({ action: row.action_text, expected: row.expected_result })),
    };
  }));
  const dataRows = await db.query<Record<string, unknown>>(
    `SELECT d.id, d.name, d.description, d.version
       FROM data_links l JOIN data_sets d ON d.id = l.data_set_id
      WHERE l.entity_type = 'scenario' AND l.entity_id = ? AND d.project_id = ? AND d.deleted_at IS NULL
      ORDER BY d.updated_at DESC LIMIT 1`,
    [scenarioId, projectId],
  );
  const data = dataRows[0];
  const items = data ? await db.query<Record<string, unknown>>(
    "SELECT label, item_value, memo FROM data_items WHERE data_set_id = ? ORDER BY sort_order", [data.id],
  ) : [];
  const dataByCaseId = new Map(items.filter((item) => String(item.memo ?? "").startsWith("__case__:"))
    .map((item) => [String(item.memo).slice("__case__:".length), String(item.item_value ?? "")]));
  const commonItems = items.filter((item) => !String(item.memo ?? "").startsWith("__case__:"));
  return {
    scenario: {
      id: scenario.id, folderId: scenario.folder_id ?? null, title: scenario.title, objective: scenario.objective ?? "",
      preconditions: scenario.preconditions ?? "", version: Number(scenario.version), updatedAt: scenario.updated_at,
    },
    cases: cases.map((item) => ({ ...item, data: dataByCaseId.get(String(item.id)) ?? "" })),
    commonData: data ? {
      id: data.id, version: Number(data.version), name: data.name, description: data.description ?? "",
      items: commonItems.map((item) => ({ label: item.label, value: item.item_value ?? "", memo: item.memo ?? "" })),
    } : null,
  };
}

export async function registerScenarioEditorRoutes(app: FastifyInstance, db: Database, config: AppConfig): Promise<void> {
  app.post("/api/test-case-images", async (request) => {
    const projectId = projectIdFrom(request);
    const actor = await authenticatedProject(request, db, config, projectId, true);
    const id = randomUUID();
    const directory = path.join(config.evidenceStoragePath, "view-images", safeSegment(projectId), safeSegment(id));
    const temporaryPath = path.join(directory, "uploading");
    await mkdir(directory, { recursive: true });
    try {
      let received = false;
      let filename = "view-image";
      const hash = createHash("sha256");
      for await (const part of request.parts()) {
        if (part.type !== "file") continue;
        if (received) throw badRequest("1回の登録につきファイルは1件です。");
        received = true;
        filename = path.basename(part.filename || filename);
        await pipeline(part.file, hashingTransform(hash), createWriteStream(temporaryPath, { flags: "wx" }));
      }
      if (!received) throw badRequest("画像ファイルがありません。");
      const digest = hash.digest("hex");
      const verified = await validatedImage(temporaryPath);
      const storedPath = path.join(directory, `original-${digest}${verified.extension}`);
      await rename(temporaryPath, storedPath);
      const info = await stat(storedPath);
      await db.execute(
        "INSERT INTO test_case_view_images (id, project_id, original_filename, stored_path, content_type, byte_size, sha256, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [id, projectId, filename, storedPath, verified.contentType, info.size, digest, actor.id],
      );
      await writeAudit(db, request, actor, { action: "test_case_view_image_uploaded", entityType: "test_case_view_image", entityId: id, projectId, after: { filename, byteSize: info.size, sha256: digest } });
      return { id, url: `/api/test-case-images/${id}/content`, byteSize: info.size, sha256: digest };
    } catch (error) {
      await rm(directory, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  });

  app.get("/api/test-case-images/:id/content", async (request, reply) => {
    const rows = await db.query<{ project_id: string; stored_path: string; content_type: string; byte_size: number }>(
      "SELECT project_id, stored_path, content_type, byte_size FROM test_case_view_images WHERE id = ? LIMIT 1",
      [routeParam(request)],
    );
    const image = rows[0];
    if (!image) throw notFound();
    await authenticatedProject(request, db, config, image.project_id, false);
    return reply.header("Content-Type", image.content_type).header("Content-Length", String(image.byte_size))
      .header("Content-Security-Policy", "sandbox; default-src 'none'")
      .header("X-Content-Type-Options", "nosniff").send(createReadStream(image.stored_path));
  });

  app.get("/api/scenario-editor/:id", async (request) => {
    const projectId = projectIdFrom(request);
    await authenticatedProject(request, db, config, projectId, false);
    return loadEditor(db, projectId, routeParam(request));
  });

  app.post("/api/scenario-editor/save", async (request) => {
    const input = objectBody(request);
    const projectId = projectIdFrom(request, input);
    const actor = await authenticatedProject(request, db, config, projectId, true);
    await cleanupExpiredPendingViewImages(db, config);
    if (!input.scenario || typeof input.scenario !== "object") throw badRequest("scenarioが不正です。");
    const scenarioInput = input.scenario as Record<string, unknown>;
    const suppliedScenarioId = nullableId(scenarioInput.id, "scenario.id");
    const scenarioId = suppliedScenarioId ?? randomUUID();
    const existing = Boolean(suppliedScenarioId);
    const scenarioVersion = existing ? versionValue(scenarioInput.version) : null;
    const title = stringValue(scenarioInput.title, "scenario.title", 500, true);
    const objective = stringValue(scenarioInput.objective, "scenario.objective", 100_000);
    const preconditions = stringValue(scenarioInput.preconditions, "scenario.preconditions", 100_000);
    const folderId = nullableId(scenarioInput.folderId, "scenario.folderId");
    const cases = editorCases(input.cases);
    const commonData = commonDataValue(input.commonData);

    const detachedImageIds = await db.withTransaction(async (connection) => {
      await ensureFolder(connection, projectId, folderId);
      if (existing) {
        const result = await connection.query(
          `UPDATE scenarios SET folder_id = ?, title = ?, objective = ?, preconditions = ?, version = version + 1, updated_at = UTC_TIMESTAMP(6)
           WHERE id = ? AND project_id = ? AND version = ? AND deleted_at IS NULL`,
          [folderId, title, objective || null, preconditions || null, scenarioId, projectId, scenarioVersion],
        );
        if (Number(result.affectedRows) !== 1) throw conflict("テストが他の利用者によって更新されています。");
      } else {
        await connection.query(
          "INSERT INTO scenarios (id, project_id, folder_id, title, objective, preconditions, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [scenarioId, projectId, folderId, title, objective || null, preconditions || null, actor.id],
        );
      }
      const savedCases: Array<{ id: string; detachedImageIds: string[] }> = [];
      for (const item of cases) savedCases.push(await saveCase(connection, projectId, actor.id, item));
      const caseIds = savedCases.map((item) => item.id);
      await connection.query("DELETE FROM scenario_cases WHERE scenario_id = ?", [scenarioId]);
      for (const [index, caseId] of caseIds.entries()) {
        await connection.query("INSERT INTO scenario_cases (scenario_id, test_case_id, sort_order) VALUES (?, ?, ?)", [scenarioId, caseId, index + 1]);
      }
      await saveCommonData(
        connection, projectId, actor.id, scenarioId, commonData,
        cases.map((item, index) => ({ id: caseIds[index], title: item.title, data: item.data })), title,
      );
      return savedCases.flatMap((item) => item.detachedImageIds);
    });
    await cleanupDetachedViewImages(db, detachedImageIds);
    await writeAudit(db, request, actor, {
      action: existing ? "scenario_editor_updated" : "scenario_editor_created",
      entityType: "scenario", entityId: scenarioId, projectId,
      after: { title, caseCount: cases.length, hasCommonData: Boolean(commonData), folderId },
    });
    const editor = await loadEditor(db, projectId, scenarioId);
    return {
      ok: true,
      ...editor,
      cases: editor.cases.map((item, index) => ({ ...item, clientKey: cases[index]?.clientKey })),
    };
  });
}

