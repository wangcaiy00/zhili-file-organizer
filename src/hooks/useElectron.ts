import { useState, useEffect, useCallback } from 'react';

// Electron API 类型定义
interface ElectronAPI {
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
  };
  system: {
    getInfo: () => Promise<{
      platform: string;
      isOpencodeAvailable: boolean;
      userDirs: UserDirs;
    }>;
    getUserDirs: () => Promise<UserDirs>;
  };
  dialog: {
    selectFolder: () => Promise<string | null>;
    saveFile: (options: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => Promise<string | null>;
  };
  fs: {
    writeFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>;
    scanFolder: (folderPath: string) => Promise<{
      success: boolean;
      error?: string;
      files: ScannedFile[];
    }>;
    detectDuplicates: (files: Array<{ path: string; size: number; name: string }>) => Promise<{
      success: boolean;
      duplicates: DuplicateGroup[];
    }>;
    executeOrganize: (plan: OrganizePlan) => Promise<{
      success: boolean;
      error?: string;
      movedFiles?: number;
      deletedFiles?: number;
    }>;
    undoOrganize: () => Promise<{
      success: boolean;
      error?: string;
      restoredFiles?: number;
    }>;
  };
  ai: {
    analyzeFiles: (files: Array<{ name: string; path: string; extension: string; size: number }>) => Promise<{
      success: boolean;
      results: AnalysisResult[];
      usedAI: boolean;
    }>;
  };
  shell: {
    showInFolder: (filePath: string) => void;
    openPath: (folderPath: string) => void;
  };
}

interface UserDirs {
  home: string;
  downloads: string;
  documents: string;
  pictures: string;
  desktop: string;
  videos: string;
  music: string;
}

export interface ScannedFile {
  name: string;
  path: string;
  size: number;
  modifiedTime: string;
  extension: string;
  isDirectory: boolean;
  isSymlink?: boolean;
}

interface DuplicateGroup {
  hash: string;
  files: Array<{
    path: string;
    name: string;
    size: number;
    isKeep: boolean;
  }>;
}

interface AnalysisResult {
  path: string;
  category: string;
  suggestedName: string;
  needsRename: boolean;
  needsMove: boolean;
  isShortcut: boolean;
  confidence: number;
  aiReason?: string;
}

interface AILogEntry {
  id: string;
  timestamp: string;
  type: 'request' | 'response' | 'error' | 'fallback' | 'info';
  content: string;
  duration?: number;
}

interface OrganizePlan {
  folderPath: string;
  categories: string[];
  files: Array<{ path: string; category: string; newName: string }>;
  duplicatesToDelete: string[];
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

// 检测是否在 Electron 环境中
const isElectron = (): boolean => {
  return typeof window !== 'undefined' && 
         window.electronAPI !== undefined && 
         window.electronAPI !== null;
};

export function useElectron() {
  const [isDesktop, setIsDesktop] = useState(false);
  const [isOpencodeAvailable, setIsOpencodeAvailable] = useState(false);
  const [userDirs, setUserDirs] = useState<UserDirs | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const desktop = isElectron();
      setIsDesktop(desktop);

      if (desktop && window.electronAPI) {
        try {
          const info = await window.electronAPI.system.getInfo();
          setIsOpencodeAvailable(info.isOpencodeAvailable);
          setUserDirs(info.userDirs);
        } catch (e) {
          console.error('Failed to get system info:', e);
        }
      }
      
      setIsLoading(false);
    };

    init();
  }, []);

  // 窗口控制
  const windowControls = {
    minimize: useCallback(() => {
      if (isElectron() && window.electronAPI) {
        window.electronAPI.window.minimize();
      }
    }, []),
    maximize: useCallback(() => {
      if (isElectron() && window.electronAPI) {
        window.electronAPI.window.maximize();
      }
    }, []),
    close: useCallback(() => {
      if (isElectron() && window.electronAPI) {
        window.electronAPI.window.close();
      }
    }, []),
  };

  // 选择文件夹
  const selectFolder = useCallback(async (): Promise<string | null> => {
    if (isElectron() && window.electronAPI) {
      return await window.electronAPI.dialog.selectFolder();
    }
    return null;
  }, []);

  // 保存文件
  const saveFile = useCallback(async (
    options: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }
  ): Promise<string | null> => {
    if (isElectron() && window.electronAPI) {
      return await window.electronAPI.dialog.saveFile(options);
    }
    return null;
  }, []);

  // 写入文件
  const writeFile = useCallback(async (filePath: string, content: string): Promise<boolean> => {
    if (isElectron() && window.electronAPI) {
      const result = await window.electronAPI.fs.writeFile(filePath, content);
      return result.success;
    }
    return false;
  }, []);

  // 扫描文件夹
  const scanFolder = useCallback(async (folderPath: string): Promise<ScannedFile[]> => {
    if (isElectron() && window.electronAPI) {
      const result = await window.electronAPI.fs.scanFolder(folderPath);
      if (result.success) {
        return result.files;
      }
      throw new Error(result.error || '扫描失败');
    }
    throw new Error('非桌面环境');
  }, []);

  // AI 分析文件
  const analyzeFiles = useCallback(async (
    files: Array<{ name: string; path: string; extension: string; size: number }>
  ): Promise<{ results: AnalysisResult[]; usedAI: boolean }> => {
    if (isElectron() && window.electronAPI) {
      const result = await window.electronAPI.ai.analyzeFiles(files);
      if (result.success) {
        return { results: result.results, usedAI: result.usedAI };
      }
      throw new Error('分析失败');
    }
    throw new Error('非桌面环境');
  }, []);

  // 检测重复文件
  const detectDuplicates = useCallback(async (
    files: Array<{ path: string; size: number; name: string }>
  ): Promise<DuplicateGroup[]> => {
    if (isElectron() && window.electronAPI) {
      const result = await window.electronAPI.fs.detectDuplicates(files);
      if (result.success) {
        return result.duplicates;
      }
    }
    return [];
  }, []);

  // 执行整理
  const executeOrganize = useCallback(async (plan: OrganizePlan): Promise<{
    success: boolean;
    movedFiles?: number;
    deletedFiles?: number;
    error?: string;
  }> => {
    if (isElectron() && window.electronAPI) {
      return await window.electronAPI.fs.executeOrganize(plan);
    }
    return { success: false, error: '非桌面环境' };
  }, []);

  // 撤销整理
  const undoOrganize = useCallback(async (): Promise<{
    success: boolean;
    restoredFiles?: number;
    error?: string;
  }> => {
    if (isElectron() && window.electronAPI) {
      return await window.electronAPI.fs.undoOrganize();
    }
    return { success: false, error: '非桌面环境' };
  }, []);

  // 在文件管理器中显示
  const showInFolder = useCallback((filePath: string) => {
    if (isElectron() && window.electronAPI) {
      window.electronAPI.shell.showInFolder(filePath);
    }
  }, []);

  // 打开文件夹
  const openPath = useCallback((folderPath: string) => {
    if (isElectron() && window.electronAPI) {
      window.electronAPI.shell.openPath(folderPath);
    }
  }, []);

  // 获取 AI 日志
  const getAILogs = useCallback(async (): Promise<AILogEntry[]> => {
    if (isElectron() && window.electronAPI) {
      return await (window.electronAPI as ElectronAPI & {
        ai: ElectronAPI['ai'] & {
          getLogs: () => Promise<AILogEntry[]>;
          clearLogs: () => Promise<{ success: boolean }>;
          exportLogs: () => Promise<{ success: boolean; path?: string; error?: string }>;
          onLogUpdate: (callback: (log: AILogEntry) => void) => () => void;
        };
      }).ai.getLogs();
    }
    return [];
  }, []);

  // 清除 AI 日志
  const clearAILogs = useCallback(async (): Promise<void> => {
    if (isElectron() && window.electronAPI) {
      await (window.electronAPI as ElectronAPI & {
        ai: ElectronAPI['ai'] & {
          clearLogs: () => Promise<{ success: boolean }>;
        };
      }).ai.clearLogs();
    }
  }, []);

  // 导出 AI 日志
  const exportAILogs = useCallback(async (): Promise<{ success: boolean; path?: string; error?: string }> => {
    if (isElectron() && window.electronAPI) {
      return await (window.electronAPI as ElectronAPI & {
        ai: ElectronAPI['ai'] & {
          exportLogs: () => Promise<{ success: boolean; path?: string; error?: string }>;
        };
      }).ai.exportLogs();
    }
    return { success: false, error: '非桌面环境' };
  }, []);

  // 监听 AI 日志更新
  const subscribeAILogs = useCallback((callback: (log: AILogEntry) => void): (() => void) => {
    if (isElectron() && window.electronAPI) {
      return (window.electronAPI as ElectronAPI & {
        ai: ElectronAPI['ai'] & {
          onLogUpdate: (callback: (log: AILogEntry) => void) => () => void;
        };
      }).ai.onLogUpdate(callback);
    }
    return () => {};
  }, []);

  // 获取快捷文件夹列表（同步返回已缓存的用户目录）
  const getQuickFolders = useCallback((): Array<{ name: string; path: string; type: string }> => {
    if (userDirs) {
      return [
        { name: '下载', path: userDirs.downloads, type: 'downloads' },
        { name: '桌面', path: userDirs.desktop, type: 'desktop' },
        { name: '文档', path: userDirs.documents, type: 'documents' },
        { name: '图片', path: userDirs.pictures, type: 'pictures' },
      ];
    }
    return [];
  }, [userDirs]);

  return {
    isDesktop,
    isOpencodeAvailable,
    isLoading,
    userDirs,
    windowControls,
    selectFolder,
    saveFile,
    writeFile,
    scanFolder,
    analyzeFiles,
    detectDuplicates,
    executeOrganize,
    undoOrganize,
    showInFolder,
    openPath,
    getQuickFolders,
    // AI 日志相关
    getAILogs,
    clearAILogs,
    exportAILogs,
    subscribeAILogs,
  };
}

export type { UserDirs, DuplicateGroup, AnalysisResult, OrganizePlan, AILogEntry };
