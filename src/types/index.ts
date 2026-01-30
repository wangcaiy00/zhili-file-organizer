export interface FileItem {
  id: string;
  name: string;
  originalName: string;
  newName: string;
  type: string;
  size: number;
  category: CategoryType;
  path: string;
  hash?: string;
  duplicateOf?: string;
  content?: string;
  createdAt: Date;
  modifiedAt: Date;
  selected: boolean;
  keepInDuplicate?: boolean;
  isDirectory?: boolean;
  isSymlink?: boolean;
  isShortcut?: boolean;
  needsRename?: boolean;
  needsMove?: boolean;
}

export type CategoryType = 
  | '合同' 
  | '发票' 
  | '截图' 
  | '说明书' 
  | '图片' 
  | '视频' 
  | '音频'
  | '文档' 
  | '压缩包' 
  | '代码'
  | '程序'
  | '快捷方式'
  | '文件夹'
  | '下载'
  | '备份'
  | '其他';

export interface OrganizePlan {
  files: FileItem[];
  categories: { [key in CategoryType]?: FileItem[] };
  duplicates: DuplicateGroup[];
  stats: PlanStats;
  namingRules: NamingRules;
  categoriesNeedingFolders: string[];
}

export interface DuplicateGroup {
  hash: string;
  files: FileItem[];
  keepIndex: number;
}

export interface PlanStats {
  totalFiles: number;
  totalFolders: number;
  totalSize: number;
  categorizedCount: { [key in CategoryType]?: number };
  duplicateCount: number;
  renamedCount: number;
  movedCount: number;
  shortcutCount: number;
}

export interface ExecutionResult {
  success: boolean;
  movedFiles: number;
  renamedFiles: number;
  deletedDuplicates: number;
  createdFolders: string[];
  errors: string[];
  timestamp: Date;
}

export type AppStep = 'select' | 'scanning' | 'preview' | 'executing' | 'report';

export interface NamingRules {
  addDatePrefix: boolean;
  extractTheme: boolean;
  keepOriginalName: boolean;
  dateFormat: 'YYYYMMDD' | 'YYYY-MM-DD' | 'YYMMDD';
}

export interface AppState {
  step: AppStep;
  selectedFolder: string;
  plan: OrganizePlan | null;
  executionHistory: OrganizePlan[];
}
