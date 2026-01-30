import { contextBridge, ipcRenderer } from 'electron';

// 暴露给渲染进程的 API
contextBridge.exposeInMainWorld('electronAPI', {
  // 窗口控制
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  },

  // 系统信息
  system: {
    getInfo: () => ipcRenderer.invoke('system:getInfo'),
    getUserDirs: () => ipcRenderer.invoke('system:getUserDirs'),
  },

  // 对话框
  dialog: {
    selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
    saveFile: (options: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => 
      ipcRenderer.invoke('dialog:saveFile', options),
  },

  // 文件系统操作
  fs: {
    writeFile: (filePath: string, content: string) => 
      ipcRenderer.invoke('fs:writeFile', filePath, content),
    scanFolder: (folderPath: string) => 
      ipcRenderer.invoke('fs:scanFolder', folderPath),
    detectDuplicates: (files: Array<{ path: string; size: number; name: string }>) =>
      ipcRenderer.invoke('fs:detectDuplicates', files),
    executeOrganize: (plan: {
      folderPath: string;
      categories: string[];
      files: Array<{ path: string; category: string; newName: string }>;
      duplicatesToDelete: string[];
    }) => ipcRenderer.invoke('fs:executeOrganize', plan),
    undoOrganize: () => ipcRenderer.invoke('fs:undoOrganize'),
  },

  // AI 分析和日志
  ai: {
    analyzeFiles: (files: Array<{ name: string; path: string; extension: string; size: number; isDirectory?: boolean; isSymlink?: boolean; modifiedTime?: string }>) =>
      ipcRenderer.invoke('ai:analyzeFiles', files),
    getLogs: () => ipcRenderer.invoke('ai:getLogs'),
    clearLogs: () => ipcRenderer.invoke('ai:clearLogs'),
    exportLogs: () => ipcRenderer.invoke('ai:exportLogs'),
    onLogUpdate: (callback: (log: { id: string; timestamp: string; type: string; content: string; duration?: number }) => void) => {
      const listener = (_: Electron.IpcRendererEvent, log: { id: string; timestamp: string; type: string; content: string; duration?: number }) => callback(log);
      ipcRenderer.on('ai-log-update', listener);
      return () => ipcRenderer.removeListener('ai-log-update', listener);
    },
  },

  // Shell 操作
  shell: {
    showInFolder: (filePath: string) => ipcRenderer.invoke('shell:showInFolder', filePath),
    openPath: (folderPath: string) => ipcRenderer.invoke('shell:openPath', folderPath),
  },
});

// 类型声明
export type ElectronAPI = typeof import('./preload');
