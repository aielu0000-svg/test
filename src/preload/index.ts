import { contextBridge, ipcRenderer } from "electron";

const api = {
  project: {
    create: (name: string) => ipcRenderer.invoke("project:create", name),
    open: () => ipcRenderer.invoke("project:open"),
    get: () => ipcRenderer.invoke("project:get"),
    rename: (name: string) => ipcRenderer.invoke("project:rename", name)
  },
  testCases: {
    list: () => ipcRenderer.invoke("testCases:list"),
    get: (id: string) => ipcRenderer.invoke("testCases:get", id),
    save: (payload: unknown) => ipcRenderer.invoke("testCases:save", payload),
    delete: (id: string) => ipcRenderer.invoke("testCases:delete", id)
  },
  caseFolders: {
    list: () => ipcRenderer.invoke("caseFolders:list"),
    save: (payload: unknown) => ipcRenderer.invoke("caseFolders:save", payload),
    delete: (id: string) => ipcRenderer.invoke("caseFolders:delete", id)
  },
  scenarios: {
    list: () => ipcRenderer.invoke("scenarios:list"),
    get: (id: string) => ipcRenderer.invoke("scenarios:get", id),
    save: (payload: unknown) => ipcRenderer.invoke("scenarios:save", payload),
    delete: (id: string) => ipcRenderer.invoke("scenarios:delete", id),
    details: (id: string) => ipcRenderer.invoke("scenarios:details", id),
    createFromFolder: (folderId: string, title?: string) =>
      ipcRenderer.invoke("scenarios:createFromFolder", folderId, title)
  },
  dataSets: {
    list: (scope?: string) => ipcRenderer.invoke("dataSets:list", scope),
    get: (id: string) => ipcRenderer.invoke("dataSets:get", id),
    save: (payload: unknown) => ipcRenderer.invoke("dataSets:save", payload),
    delete: (id: string) => ipcRenderer.invoke("dataSets:delete", id),
    template: (scope: string) => ipcRenderer.invoke("dataSets:template", scope)
  },
  runs: {
    list: () => ipcRenderer.invoke("runs:list"),
    get: (id: string) => ipcRenderer.invoke("runs:get", id),
    save: (payload: unknown) => ipcRenderer.invoke("runs:save", payload),
    delete: (id: string) => ipcRenderer.invoke("runs:delete", id),
    addScenario: (runId: string, scenarioId: string, assignee?: string) =>
      ipcRenderer.invoke("runs:addScenario", runId, scenarioId, assignee),
    updateScenario: (payload: unknown) => ipcRenderer.invoke("runs:updateScenario", payload),
    removeScenario: (id: string) => ipcRenderer.invoke("runs:removeScenario", id)
  },
  evidence: {
    list: (runScenarioId: string) => ipcRenderer.invoke("evidence:list", runScenarioId),
    add: (runScenarioId: string) => ipcRenderer.invoke("evidence:add", runScenarioId),
    pasteImage: (runScenarioId: string) => ipcRenderer.invoke("evidence:pasteImage", runScenarioId),
    remove: (id: string) => ipcRenderer.invoke("evidence:remove", id),
    open: (id: string) => ipcRenderer.invoke("evidence:open", id)
  },
  export: {
    save: (payload: unknown) => ipcRenderer.invoke("export:save", payload)
  },
  import: {
    run: (payload: unknown) => ipcRenderer.invoke("import:run", payload)
  }
};

contextBridge.exposeInMainWorld("api", api);

export type ApiBridge = typeof api;
