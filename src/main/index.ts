import { app, BrowserWindow, clipboard, dialog, ipcMain, shell, type OpenDialogOptions } from "electron";
import path from "node:path";
import fs from "node:fs";
import {
  addScenarioEvidence,
  addScenarioEvidenceBuffer,
  addRunScenario,
  addRunScenarioCaseEvidence,
  addRunScenarioCaseEvidenceBuffer,
  createScenarioFromFolder,
  createProject,
  deleteCaseFolder,
  deleteDataSet,
  deleteRun,
  deleteScenario,
  deleteTestCase,
  exportData,
  importData,
  createTemplateDataSets,
  getDataSet,
  getProjectInfo,
  getRun,
  getScenario,
  getScenarioDetails,
  getScenarioEvidencePath,
  getTestCase,
  listRunScenarioCaseEvidence,
  listRunScenarioCases,
  previewScenarioEvidence,
  previewRunScenarioCaseEvidence,
  listCaseFolders,
  listDataSets,
  listRuns,
  listScenarioEvidence,
  listScenarios,
  listTestCases,
  openProject,
  removeRunScenario,
  removeScenarioCase,
  removeRunScenarioCaseEvidence,
  removeScenarioEvidence,
  saveCaseFolder,
  saveDataSet,
  saveRun,
  saveScenario,
  saveTestCase,
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
    title: "the test",
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
  return createProject(result.filePaths[0], name || "the test");
});

ipcMain.handle("project:open", async () => {
  const result = await showOpenDialogForMainWindow({
    title: "プロジェクトDBを選択",
    properties: ["openFile"],
    filters: [{ name: "SQLite", extensions: ["sqlite"] }]
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

ipcMain.handle("testCases:list", () => listTestCases());
ipcMain.handle("testCases:get", (_event, id: string) => getTestCase(id));
ipcMain.handle("testCases:save", (_event, payload) => saveTestCase(payload));
ipcMain.handle("testCases:delete", (_event, id: string) => deleteTestCase(id));

ipcMain.handle("caseFolders:list", () => listCaseFolders());
ipcMain.handle("caseFolders:save", (_event, payload) => saveCaseFolder(payload));
ipcMain.handle("caseFolders:delete", (_event, id: string) => deleteCaseFolder(id));

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
ipcMain.handle("evidence:add", async (_event, runScenarioId: string) => {
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
    created.push(
      addScenarioEvidence({
        runScenarioId,
        sourcePath: filePath,
        fileName,
        mimeType,
        size: stat.size
      })
    );
  });
  return created;
});

ipcMain.handle("evidence:pasteImage", (_event, runScenarioId: string) => {
  const image = clipboard.readImage();
  if (image.isEmpty()) {
    return null;
  }
  const buffer = image.toPNG();
  return addScenarioEvidenceBuffer({
    runScenarioId,
    fileName: `clipboard_${Date.now()}.png`,
    buffer,
    mimeType: "image/png"
  });
});

ipcMain.handle("evidence:remove", (_event, id: string) => removeScenarioEvidence(id));

ipcMain.handle("evidence:preview", (_event, id: string) => previewScenarioEvidence(id));

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
ipcMain.handle("runCaseEvidence:add", async (_event, runScenarioCaseId: string) => {
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
    created.push(
      addRunScenarioCaseEvidence({
        runScenarioCaseId,
        sourcePath: filePath,
        fileName,
        mimeType: inferMimeType(fileName),
        size: stat.size
      })
    );
  });
  return created;
});
ipcMain.handle("runCaseEvidence:paste", (_event, runScenarioCaseId: string) => {
  const image = clipboard.readImage();
  if (image.isEmpty()) {
    return null;
  }
  const buffer = image.toPNG();
  return addRunScenarioCaseEvidenceBuffer({
    runScenarioCaseId,
    fileName: `clipboard_${Date.now()}.png`,
    buffer,
    mimeType: "image/png"
  });
});
ipcMain.handle("runCaseEvidence:remove", (_event, id: string) => removeRunScenarioCaseEvidence(id));
ipcMain.handle("runCaseEvidence:preview", (_event, id: string) => previewRunScenarioCaseEvidence(id));

ipcMain.handle("export:save", async (_event, payload) => {
  const content = exportData(payload);
  const ext = payload.format;
  const result = await dialog.showSaveDialog({
    title: "エクスポート先を選択",
    defaultPath: `export.${ext}`,
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
  const result = await dialog.showOpenDialog({
    title: "インポートするファイルを選択",
    properties: ["openFile"],
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  const filePath = result.filePaths[0];
  const content = fs.readFileSync(filePath, "utf-8");
  const imported = importData({ ...payload, content });
  return { imported, filePath };
});

ipcMain.handle("dataSets:template", (_event, scope: string) => createTemplateDataSets(scope));
