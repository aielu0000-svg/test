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
  scenarios: {
    list: () => ipcRenderer.invoke("scenarios:list"),
    get: (id: string) => ipcRenderer.invoke("scenarios:get", id),
    save: (payload: unknown) => ipcRenderer.invoke("scenarios:save", payload),
    delete: (id: string) => ipcRenderer.invoke("scenarios:delete", id)
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
    addCase: (runId: string, caseId: string) => ipcRenderer.invoke("runs:addCase", runId, caseId),
    updateCase: (payload: unknown) => ipcRenderer.invoke("runs:updateCase", payload),
    removeCase: (id: string) => ipcRenderer.invoke("runs:removeCase", id)
  },
  evidence: {
    list: (runCaseId: string) => ipcRenderer.invoke("evidence:list", runCaseId),
    add: (runCaseId: string) => ipcRenderer.invoke("evidence:add", runCaseId),
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
