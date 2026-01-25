import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import path from "node:path";
import fs from "node:fs";
import {
  addEvidence,
  createProject,
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
  getTestCase,
  getEvidencePath,
  listDataSets,
  listEvidence,
  listRuns,
  listScenarios,
  listTestCases,
  openProject,
  removeEvidence,
  removeRunCase,
  saveDataSet,
  saveRun,
  saveScenario,
  saveTestCase,
  updateProjectName,
  addRunCase,
  updateRunCase
} from "./db";

let mainWindow: BrowserWindow | null = null;

app.disableHardwareAcceleration();

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
  const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
    title: "プロジェクト保存先を選択",
    properties: ["openDirectory", "createDirectory"]
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return createProject(result.filePaths[0], name || "the test");
});

ipcMain.handle("project:open", async () => {
  const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
    title: "プロジェクトフォルダを選択",
    properties: ["openDirectory"]
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

ipcMain.handle("scenarios:list", () => listScenarios());
ipcMain.handle("scenarios:get", (_event, id: string) => getScenario(id));
ipcMain.handle("scenarios:save", (_event, payload) => saveScenario(payload));
ipcMain.handle("scenarios:delete", (_event, id: string) => deleteScenario(id));

ipcMain.handle("dataSets:list", (_event, scope?: string) => listDataSets(scope));
ipcMain.handle("dataSets:get", (_event, id: string) => getDataSet(id));
ipcMain.handle("dataSets:save", (_event, payload) => saveDataSet(payload));
ipcMain.handle("dataSets:delete", (_event, id: string) => deleteDataSet(id));

ipcMain.handle("runs:list", () => listRuns());
ipcMain.handle("runs:get", (_event, id: string) => getRun(id));
ipcMain.handle("runs:save", (_event, payload) => saveRun(payload));
ipcMain.handle("runs:delete", (_event, id: string) => deleteRun(id));
ipcMain.handle("runs:addCase", (_event, runId: string, caseId: string) => addRunCase(runId, caseId));
ipcMain.handle("runs:updateCase", (_event, payload) => updateRunCase(payload));
ipcMain.handle("runs:removeCase", (_event, id: string) => removeRunCase(id));

ipcMain.handle("evidence:list", (_event, runCaseId: string) => listEvidence(runCaseId));
ipcMain.handle("evidence:add", async (_event, runCaseId: string) => {
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
    const mimeType = "";
    created.push(
      addEvidence({
        runCaseId,
        sourcePath: filePath,
        fileName,
        mimeType,
        size: stat.size
      })
    );
  });
  return created;
});

ipcMain.handle("evidence:remove", (_event, id: string) => removeEvidence(id));

ipcMain.handle("evidence:open", (_event, id: string) => {
  const fullPath = getEvidencePath(id);
  if (!fullPath) {
    return false;
  }
  shell.openPath(fullPath);
  return true;
});

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
