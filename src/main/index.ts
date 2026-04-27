import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeImage, shell, type OpenDialogOptions } from "electron";
import path from "node:path";
import fs from "node:fs";
import {
  addScenarioEvidence,
  addScenarioEvidenceBuffer,
  addRunScenario,
  addRunScenarioCaseEvidence,
  addRunScenarioCaseEvidenceBuffer,
  addCaseViewImage,
  addCaseViewImageBuffer,
  backupProject,
  createScenarioFromFolder,
  createProject,
  deleteCaseFolder,
  duplicateCaseFolderTree,
  deleteDataSet,
  getProcedureDocument,
  deleteRun,
  deleteScenario,
  deleteTestCase,
  exportData,
  importData,
  importProcedureDocument,
  createTemplateDataSets,
  getDataSet,
  getDashboardStats,
  getProjectInfo,
  getRun,
  getScenario,
  getScenarioDetails,
  getScenarioEvidencePath,
  getTestCase,
  listCaseViewImages,
  listProcedureDocuments,
  listRunScenarioCaseEvidence,
  listRunScenarioCases,
  previewCaseViewImage,
  previewScenarioEvidence,
  previewRunScenarioCaseEvidence,
  reloadProcedureDocument,
  reorderCaseViewImages,
  reorderRunScenarioCaseEvidence,
  reorderScenarioEvidence,
  restoreCaseViewImageOriginal,
  restoreRunScenarioCaseEvidenceOriginal,
  restoreScenarioEvidenceOriginal,
  updateCaseViewImage,
  updateRunScenarioCaseEvidenceImage,
  updateScenarioEvidenceImage,
  listCaseFolders,
  listDataSets,
  listRuns,
  listStoredEvidenceAssets,
  listScenarioEvidence,
  listScenarios,
  listTestCases,
  openProject,
  previewImportData,
  removeRunScenario,
  removeScenarioCase,
  removeRunScenarioCaseEvidence,
  removeCaseViewImage,
  removeScenarioEvidence,
  resetProject,
  saveCaseFolder,
  saveDataSet,
  saveRun,
  saveScenario,
  saveTestCase,
  updateProcedureExecution,
  updateProcedureSchedule,
  updateProjectName,
  updateRunScenario,
  updateRunScenarioCase
} from "./db";

let mainWindow: BrowserWindow | null = null;

app.disableHardwareAcceleration();

const showOpenDialogForMainWindow = (options: OpenDialogOptions) => {
  return mainWindow ? dialog.showOpenDialog(mainWindow, options) : dialog.showOpenDialog(options);
};

const inferMimeType = (fileName: string) => {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".bmp":
      return "image/bmp";
    case ".svg":
      return "image/svg+xml";
    case ".pdf":
      return "application/pdf";
    case ".txt":
      return "text/plain";
    case ".csv":
      return "text/csv";
    case ".md":
      return "text/markdown";
    case ".json":
      return "application/json";
    default:
      return "application/octet-stream";
  }
};

const processImageBuffer = (
  buffer: Buffer,
  mimeType: string,
  options?: { resizeEnabled?: boolean; resizeMax?: number; resizeMaxWidth?: number; resizeMaxHeight?: number }
) => {
  if (!mimeType.startsWith("image/") || !options?.resizeEnabled) {
    return { buffer, mimeType };
  }
  const image = nativeImage.createFromBuffer(buffer);
  const { width, height } = image.getSize();
  const resizeMaxWidth = Math.max(
    400,
    Math.min(4000, Math.round(options.resizeMaxWidth ?? options.resizeMax ?? 1600))
  );
  const resizeMaxHeight = Math.max(
    400,
    Math.min(4000, Math.round(options.resizeMaxHeight ?? options.resizeMax ?? 1600))
  );
  if (!width || !height || (width <= resizeMaxWidth && height <= resizeMaxHeight)) {
    return { buffer, mimeType };
  }
  const scale = Math.min(resizeMaxWidth / width, resizeMaxHeight / height);
  if (scale >= 1) {
    return { buffer, mimeType };
  }
  const resized = image.resize({
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    quality: "best"
  });
  if (mimeType === "image/jpeg") {
    return { buffer: resized.toJPEG(90), mimeType: "image/jpeg" };
  }
  return { buffer: resized.toPNG(), mimeType: "image/png" };
};

const createWindow = () => {
  const preloadBase = path.join(__dirname, "../preload");
  const preloadCandidates = ["index.cjs", "index.js", "index.mjs"].map((file) =>
    path.join(preloadBase, file)
  );
  const preloadPath = preloadCandidates.find((file) => fs.existsSync(file)) ?? preloadCandidates[0];

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 720,
    title: "ザ・テスト",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
};

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("project:create", async (_event, name: string) => {
  const result = await showOpenDialogForMainWindow({
    title: "プロジェクト保存先を選択",
    properties: ["openDirectory", "createDirectory"]
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return createProject(result.filePaths[0], name || "ザ・テスト");
});

ipcMain.handle("project:open", async () => {
  const result = await showOpenDialogForMainWindow({
    title: "プロジェクトデータベースを選択",
    properties: ["openFile"],
    filters: [{ name: "データベース", extensions: ["sqlite"] }]
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return openProject(result.filePaths[0]);
});

ipcMain.handle("project:get", () => getProjectInfo());

ipcMain.handle("project:rename", (_event, name: string) => {
  updateProjectName(name);
  return getProjectInfo();
});

ipcMain.handle("project:backup", async () => {
  const result = await showOpenDialogForMainWindow({
    title: "バックアップ先フォルダを選択",
    properties: ["openDirectory", "createDirectory"]
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return backupProject(result.filePaths[0]);
});

ipcMain.handle("project:reset", () => resetProject());

ipcMain.handle("dashboard:stats", () => getDashboardStats());

ipcMain.handle("procedures:list", () => listProcedureDocuments());
ipcMain.handle("procedures:get", (_event, id: string) => getProcedureDocument(id));
ipcMain.handle("procedures:import", async () => {
  const result = await showOpenDialogForMainWindow({
    title: "取り込む Markdown 手順書を選択",
    properties: ["openFile"],
    filters: [{ name: "Markdown", extensions: ["md", "markdown"] }]
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return importProcedureDocument(result.filePaths[0]);
});
ipcMain.handle("procedures:reload", (_event, documentId: string) => reloadProcedureDocument(documentId));
ipcMain.handle("procedures:updateSchedule", (_event, payload) => updateProcedureSchedule(payload));
ipcMain.handle("procedures:updateExecution", (_event, payload) => updateProcedureExecution(payload));

ipcMain.handle("testCases:list", () => listTestCases());
ipcMain.handle("testCases:get", (_event, id: string) => getTestCase(id));
ipcMain.handle("testCases:save", (_event, payload) => saveTestCase(payload));
ipcMain.handle("testCases:delete", (_event, id: string) => deleteTestCase(id));

ipcMain.handle("caseFolders:list", () => listCaseFolders());
ipcMain.handle("caseFolders:save", (_event, payload) => saveCaseFolder(payload));
ipcMain.handle("caseFolders:delete", (_event, id: string) => deleteCaseFolder(id));
ipcMain.handle("caseFolders:duplicate", (_event, sourceId: string, targetParentId: string | null) =>
  duplicateCaseFolderTree(sourceId, targetParentId)
);

ipcMain.handle("scenarios:list", () => listScenarios());
ipcMain.handle("scenarios:get", (_event, id: string) => getScenario(id));
ipcMain.handle("scenarios:save", (_event, payload) => saveScenario(payload));
ipcMain.handle("scenarios:delete", (_event, id: string) => deleteScenario(id));
ipcMain.handle("scenarios:details", (_event, id: string) => getScenarioDetails(id));
ipcMain.handle("scenarios:createFromFolder", (_event, folderId: string, title?: string) =>
  createScenarioFromFolder(folderId, title)
);
ipcMain.handle("scenarios:removeCase", (_event, scenarioId: string, caseId: string) =>
  removeScenarioCase(scenarioId, caseId)
);

ipcMain.handle("dataSets:list", (_event, scope?: string) => listDataSets(scope));
ipcMain.handle("dataSets:get", (_event, id: string) => getDataSet(id));
ipcMain.handle("dataSets:save", (_event, payload) => saveDataSet(payload));
ipcMain.handle("dataSets:delete", (_event, id: string) => deleteDataSet(id));

ipcMain.handle("runs:list", () => listRuns());
ipcMain.handle("runs:get", (_event, id: string) => getRun(id));
ipcMain.handle("runs:save", (_event, payload) => saveRun(payload));
ipcMain.handle("runs:delete", (_event, id: string) => deleteRun(id));
ipcMain.handle("runs:addScenario", (_event, runId: string, scenarioId: string, assignee?: string) =>
  addRunScenario(runId, scenarioId, assignee)
);
ipcMain.handle("runs:updateScenario", (_event, payload) => updateRunScenario(payload));
ipcMain.handle("runs:removeScenario", (_event, id: string) => removeRunScenario(id));
ipcMain.handle("runs:cases", (_event, runScenarioId: string) => listRunScenarioCases(runScenarioId));
ipcMain.handle("runs:updateScenarioCase", (_event, payload) => updateRunScenarioCase(payload));

ipcMain.handle("evidence:list", (_event, runScenarioId: string) =>
  listScenarioEvidence(runScenarioId)
);
ipcMain.handle("evidence:add", async (_event, runScenarioId: string, options?: { resizeEnabled?: boolean; resizeMax?: number; resizeMaxWidth?: number; resizeMaxHeight?: number }) => {
  const result = await dialog.showOpenDialog({
    title: "証跡ファイルを追加",
    properties: ["openFile", "multiSelections"]
  });
  if (result.canceled || result.filePaths.length === 0) {
    return [];
  }
  const created: string[] = [];
  result.filePaths.forEach((filePath) => {
    const stat = fs.statSync(filePath);
    const fileName = path.basename(filePath);
    const mimeType = inferMimeType(fileName);
    if (mimeType.startsWith("image/")) {
      const processed = processImageBuffer(fs.readFileSync(filePath), mimeType, options);
      created.push(
        addScenarioEvidenceBuffer({
          runScenarioId,
          fileName,
          buffer: processed.buffer,
          mimeType: processed.mimeType
        })
      );
      return;
    }
    created.push(addScenarioEvidence({ runScenarioId, sourcePath: filePath, fileName, mimeType, size: stat.size }));
  });
  return created;
});

ipcMain.handle("evidence:pasteImage", (_event, runScenarioId: string, options?: { resizeEnabled?: boolean; resizeMax?: number; resizeMaxWidth?: number; resizeMaxHeight?: number }) => {
  const image = clipboard.readImage();
  if (image.isEmpty()) {
    return null;
  }
  const processed = processImageBuffer(image.toPNG(), "image/png", options);
  return addScenarioEvidenceBuffer({
    runScenarioId,
    fileName: `clipboard_${Date.now()}.png`,
    buffer: processed.buffer,
    mimeType: processed.mimeType
  });
});

ipcMain.handle("evidence:reprocessAllImages", (_event, options?: { resizeEnabled?: boolean; resizeMax?: number; resizeMaxWidth?: number; resizeMaxHeight?: number }) => {
  if (!options?.resizeEnabled) {
    return { updated: 0, scanned: 0 };
  }
  const assets = listStoredEvidenceAssets();
  let updated = 0;
  assets.forEach((asset) => {
    const mimeType = asset.mime_type || inferMimeType(asset.file_name);
    if (!mimeType.startsWith("image/") || !fs.existsSync(asset.file_path)) {
      return;
    }
    const processed = processImageBuffer(fs.readFileSync(asset.file_path), mimeType, options);
    if (asset.scope === "scenario") {
      updateScenarioEvidenceImage(asset.id, {
        buffer: processed.buffer,
        mimeType: processed.mimeType
      });
    } else {
      updateRunScenarioCaseEvidenceImage(asset.id, {
        buffer: processed.buffer,
        mimeType: processed.mimeType
      });
    }
    updated += 1;
  });
  return { updated, scanned: assets.length };
});

ipcMain.handle("evidence:remove", (_event, id: string) => removeScenarioEvidence(id));
ipcMain.handle("evidence:reorder", (_event, runScenarioId: string, orderedIds: string[]) => {
  reorderScenarioEvidence(runScenarioId, orderedIds);
  return true;
});

ipcMain.handle("evidence:preview", (_event, id: string) => previewScenarioEvidence(id));
ipcMain.handle("evidence:updateImage", (_event, id: string, payload: { base64: string; mimeType: string }) => {
  updateScenarioEvidenceImage(id, { buffer: Buffer.from(payload.base64, "base64"), mimeType: payload.mimeType });
  return true;
});
ipcMain.handle("evidence:restoreOriginal", (_event, id: string) => restoreScenarioEvidenceOriginal(id));

ipcMain.handle("evidence:open", (_event, id: string) => {
  const fullPath = getScenarioEvidencePath(id);
  if (!fullPath) {
    return false;
  }
  shell.openPath(fullPath);
  return true;
});

ipcMain.handle("runCaseEvidence:list", (_event, runScenarioCaseId: string) =>
  listRunScenarioCaseEvidence(runScenarioCaseId)
);
ipcMain.handle("runCaseEvidence:add", async (_event, runScenarioCaseId: string, options?: { resizeEnabled?: boolean; resizeMax?: number; resizeMaxWidth?: number; resizeMaxHeight?: number }) => {
  const result = await dialog.showOpenDialog({
    title: "証跡ファイルを追加 (ケース)",
    properties: ["openFile", "multiSelections"]
  });
  if (result.canceled || result.filePaths.length === 0) {
    return [];
  }
  const created: string[] = [];
  result.filePaths.forEach((filePath) => {
    const stat = fs.statSync(filePath);
    const fileName = path.basename(filePath);
    const mimeType = inferMimeType(fileName);
    if (mimeType.startsWith("image/")) {
      const processed = processImageBuffer(fs.readFileSync(filePath), mimeType, options);
      created.push(
        addRunScenarioCaseEvidenceBuffer({
          runScenarioCaseId,
          fileName,
          buffer: processed.buffer,
          mimeType: processed.mimeType
        })
      );
      return;
    }
    created.push(addRunScenarioCaseEvidence({ runScenarioCaseId, sourcePath: filePath, fileName, mimeType, size: stat.size }));
  });
  return created;
});
ipcMain.handle("runCaseEvidence:paste", (_event, runScenarioCaseId: string, options?: { resizeEnabled?: boolean; resizeMax?: number; resizeMaxWidth?: number; resizeMaxHeight?: number }) => {
  const image = clipboard.readImage();
  if (image.isEmpty()) {
    return null;
  }
  const processed = processImageBuffer(image.toPNG(), "image/png", options);
  return addRunScenarioCaseEvidenceBuffer({
    runScenarioCaseId,
    fileName: `clipboard_${Date.now()}.png`,
    buffer: processed.buffer,
    mimeType: processed.mimeType
  });
});
ipcMain.handle("runCaseEvidence:remove", (_event, id: string) => removeRunScenarioCaseEvidence(id));
ipcMain.handle("runCaseEvidence:reorder", (_event, runScenarioCaseId: string, orderedIds: string[]) => {
  reorderRunScenarioCaseEvidence(runScenarioCaseId, orderedIds);
  return true;
});
ipcMain.handle("runCaseEvidence:preview", (_event, id: string) => previewRunScenarioCaseEvidence(id));
ipcMain.handle("runCaseEvidence:updateImage", (_event, id: string, payload: { base64: string; mimeType: string }) => {
  updateRunScenarioCaseEvidenceImage(id, { buffer: Buffer.from(payload.base64, "base64"), mimeType: payload.mimeType });
  return true;
});
ipcMain.handle("runCaseEvidence:restoreOriginal", (_event, id: string) => restoreRunScenarioCaseEvidenceOriginal(id));

ipcMain.handle("caseViewImages:list", (_event, caseId: string) => listCaseViewImages(caseId));
ipcMain.handle("caseViewImages:add", async (_event, caseId: string, options?: { resizeEnabled?: boolean; resizeMax?: number; resizeMaxWidth?: number; resizeMaxHeight?: number }) => {
  const result = await dialog.showOpenDialog({
    title: "見る場所の画像を追加",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"] }]
  });
  if (result.canceled || result.filePaths.length === 0) {
    return [];
  }
  const created: string[] = [];
  result.filePaths.forEach((filePath) => {
    const stat = fs.statSync(filePath);
    const fileName = path.basename(filePath);
    const mimeType = inferMimeType(fileName);
    if (mimeType.startsWith("image/")) {
      const processed = processImageBuffer(fs.readFileSync(filePath), mimeType, options);
      created.push(
        addCaseViewImageBuffer({
          caseId,
          fileName,
          buffer: processed.buffer,
          mimeType: processed.mimeType
        })
      );
      return;
    }
    created.push(addCaseViewImage({ caseId, sourcePath: filePath, fileName, mimeType, size: stat.size }));
  });
  return created;
});
ipcMain.handle("caseViewImages:paste", (_event, caseId: string, options?: { resizeEnabled?: boolean; resizeMax?: number; resizeMaxWidth?: number; resizeMaxHeight?: number }) => {
  const image = clipboard.readImage();
  if (image.isEmpty()) {
    return null;
  }
  const processed = processImageBuffer(image.toPNG(), "image/png", options);
  return addCaseViewImageBuffer({
    caseId,
    fileName: `clipboard_${Date.now()}.png`,
    buffer: processed.buffer,
    mimeType: processed.mimeType
  });
});
ipcMain.handle("caseViewImages:remove", (_event, id: string) => removeCaseViewImage(id));
ipcMain.handle("caseViewImages:reorder", (_event, caseId: string, orderedIds: string[]) => {
  reorderCaseViewImages(caseId, orderedIds);
  return true;
});
ipcMain.handle("caseViewImages:preview", (_event, id: string) => previewCaseViewImage(id));
ipcMain.handle("caseViewImages:updateImage", (_event, id: string, payload: { base64: string; mimeType: string }) => {
  updateCaseViewImage(id, { buffer: Buffer.from(payload.base64, "base64"), mimeType: payload.mimeType });
  return true;
});
ipcMain.handle("caseViewImages:restoreOriginal", (_event, id: string) => restoreCaseViewImageOriginal(id));

ipcMain.handle("export:save", async (_event, payload) => {
  const ext = payload.format;
  const caseFolderIds = Array.isArray(payload.caseFolderIds)
    ? payload.caseFolderIds.filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0)
    : [];
  const scenarioIds = Array.isArray(payload.scenarioIds)
    ? payload.scenarioIds.filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0)
    : [];
  const runIds = Array.isArray(payload.runIds)
    ? payload.runIds.filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0)
    : [];

  if (payload.entity === "test_runs" && runIds.length > 1) {
    const folderResult = await showOpenDialogForMainWindow({
      title: "出力先フォルダを選択",
      properties: ["openDirectory", "createDirectory"]
    });
    if (folderResult.canceled || folderResult.filePaths.length === 0) {
      return null;
    }
    const targetDir = folderResult.filePaths[0];
    const runMap = new Map(listRuns().map((run: any) => [run.id, run.name || run.id]));
    runIds.forEach((runId) => {
      const runNameRaw = runMap.get(runId) ?? runId;
      const runName = String(runNameRaw).replace(/[\\/:*?"<>|]/g, "_").trim() || runId;
      const content = exportData({ ...payload, runIds: [runId] });
      fs.writeFileSync(path.join(targetDir, `${runName}.${ext}`), content, "utf-8");
    });
    return `${targetDir} (${runIds.length} files)`;
  }

  const defaultExportName = (() => {
    if (payload.entity === "test_runs" && runIds.length === 1) {
      return listRuns().find((run: any) => run.id === runIds[0])?.name ?? "test_run";
    }
    if (payload.entity === "scenarios" && scenarioIds.length === 1) {
      return listScenarios().find((scenario: any) => scenario.id === scenarioIds[0])?.title ?? "scenario";
    }
    if (payload.entity === "test_cases" && caseFolderIds.length === 1) {
      if (caseFolderIds[0] === "__NONE__") {
        return "未分類";
      }
      return listCaseFolders().find((folder: any) => folder.id === caseFolderIds[0])?.name ?? "test_cases";
    }
    return "export";
  })();
  const safeDefaultName = String(defaultExportName).replace(/[\\/:*?"<>|]/g, "_").trim() || "export";
  const content = exportData(payload);
  const result = await dialog.showSaveDialog({
    title: "エクスポート先を選択",
    defaultPath: `${safeDefaultName}.${ext}`,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
  });
  if (result.canceled || !result.filePath) {
    return null;
  }
  fs.writeFileSync(result.filePath, content, "utf-8");
  return result.filePath;
});

ipcMain.handle("import:run", async (_event, payload) => {
  const ext = payload.format;
  const entity = payload.entity as "test_cases" | "scenarios" | "data_sets" | "test_runs";
  const format = payload.format as "csv" | "json" | "md";
  const scopeOverride = payload.scopeOverride as string | undefined;
  const caseFolderIdOverride = payload.caseFolderIdOverride as string | null | undefined;

  let filePath: string;
  let content: string;
  if (typeof payload.content === "string") {
    content = payload.content;
    filePath = typeof payload.fileName === "string" && payload.fileName.trim()
      ? payload.fileName.trim()
      : `dropped.${ext}`;
  } else {
    const result = await dialog.showOpenDialog({
      title: "インポートするファイルを選択",
      properties: ["openFile"],
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    filePath = result.filePaths[0];
    content = fs.readFileSync(filePath, "utf-8");
  }

  const imported = importData({ entity, format, scopeOverride, caseFolderIdOverride, content });
  return { imported, filePath };
});

ipcMain.handle("import:preview", (_event, payload) => {
  const format = payload.format as "csv" | "json" | "md";
  const records = previewImportData({ format, content: String(payload.content ?? "") });
  const first = records[0] ?? {};
  const columns = Object.keys(first).slice(0, 8);
  const rows = records.slice(0, 10).map((record) =>
    columns.map((col) => {
      const value = (record as Record<string, any>)[col];
      if (value == null) {
        return "";
      }
      const text =
        typeof value === "string"
          ? value
          : typeof value === "number" || typeof value === "boolean"
            ? String(value)
            : JSON.stringify(value);
      return text.length > 200 ? `${text.slice(0, 200)}…` : text;
    })
  );
  return { total: records.length, columns, rows };
});

ipcMain.handle("dataSets:template", (_event, scope: string) => createTemplateDataSets(scope));
