import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as os from 'os';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// 存储撤销信息
interface UndoInfo {
  timestamp: number;
  operations: Array<{
    type: 'move' | 'rename' | 'delete' | 'mkdir';
    from: string;
    to?: string;
    backupPath?: string;
  }>;
}

// AI 交互日志
interface AILogEntry {
  id: string;
  timestamp: string;
  type: 'request' | 'response' | 'error' | 'fallback' | 'info';
  content: string;
  duration?: number;
}

let undoStack: UndoInfo[] = [];
let mainWindow: BrowserWindow | null = null;
let isOpencodeAvailable = false;
let opencodePath = '';
let aiLogs: AILogEntry[] = [];
const currentUser = os.userInfo().username || 'user';

// ============ AI 日志管理 ============
function addAILog(type: AILogEntry['type'], content: string, duration?: number): void {
  const entry: AILogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    type,
    content,
    duration
  };
  aiLogs.push(entry);
  // 只保留最近200条日志
  if (aiLogs.length > 200) {
    aiLogs = aiLogs.slice(-200);
  }
  // 通知渲染进程
  if (mainWindow) {
    mainWindow.webContents.send('ai-log-update', entry);
  }
}

// ============ 智能分析工具函数 ============

// 检查是否是快捷方式/链接文件
function isShortcutOrLink(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  return ['.lnk', '.desktop', '.url', '.webloc'].includes(ext);
}

// 检查文件名是否需要重命名
function isMessyFileName(fileName: string): boolean {
  const ext = path.extname(fileName);
  const name = path.basename(fileName, ext);
  
  // 太短的名字不算乱码
  if (name.length < 4) return false;
  
  // 需要重命名的模式
  const messyPatterns = [
    // ---- 哈希和随机字符串 ----
    /^[a-f0-9]{8,}$/i,                    // 纯十六进制哈希: a1b2c3d4e5f6
    /^[a-z0-9]{24,}$/i,                   // 长随机字符串 (24+字符)
    /^[a-f0-9-]{32,}$/i,                  // UUID格式
    
    // ---- 相机/手机拍摄 ----
    /^IMG_\d{8}[-_]?\d{6}/i,              // IMG_20231201_123456
    /^DSC_?\d{4,}/i,                      // DSC_0001, DSC0001
    /^DCIM_?\d+/i,                        // DCIM_001
    /^P_?\d{8}[-_]?\d{6}/i,               // P_20231201_123456
    /^VID_\d{8}[-_]?\d{6}/i,              // VID_20231201_123456
    /^PHOTO[-_]?\d+/i,                    // PHOTO_001
    /^VIDEO[-_]?\d+/i,                    // VIDEO_001
    /^PXL_\d{8}[-_]?\d+/i,                // Pixel手机: PXL_20231201_123456
    
    // ---- 截图类 ----
    /^Screenshot_\d+/i,                   // Screenshot_20231201_xxx
    /^Snipaste_\d+/i,                     // Snipaste_2023-12-01_xxx
    /^Screen\s?Shot\s?\d+/i,              // Screen Shot 2023-12-01
    /^屏幕截图\s?\d+/,                     // 屏幕截图 2023-12-01
    /^截屏\d+/,                            // 截屏2023-12-01
    /^企业微信截图[-_]?\d+/,               // 企业微信截图_17680125853209
    /^微信图片[-_]?\d+/,                   // 微信图片_20231201
    /^QQ截图\d+/,                          // QQ截图20231201
    /^钉钉截图[-_]?\d+/,                   // 钉钉截图_20231201
    /^飞书截图[-_]?\d+/,                   // 飞书截图_20231201
    /^腾讯会议截图[-_]?\d+/,               // 腾讯会议截图
    /^Wechat[-_]?\d+/i,                   // WeChat_20231201
    
    // ---- 时间戳类 ----
    /^\d{13,}$/,                          // 纯时间戳: 1701388800000
    /^\d{10}$/,                           // 10位时间戳
    /^\d{8}[-_]?\d{6}$/,                  // 20231201_123456
    
    // ---- 临时/默认名称 ----
    /^tmp[_-]?[a-z0-9]+$/i,               // tmp_xxx
    /^temp[_-]?[a-z0-9]+$/i,              // temp_xxx
    /^download[_-]?\(?\d*\)?$/i,          // download, download_(1)
    /^untitled[-_]?\d*$/i,                // untitled, untitled_1
    /^unnamed[-_]?\d*$/i,                 // unnamed_1
    /^新建[文档文本表格幻灯片]*[-_]?\d*$/,  // 新建文档, 新建文本文档
    /^未命名[-_]?\d*$/,                    // 未命名, 未命名_1
    /^副本[-_]?\d*$/,                      // 副本
    /^文档\d*$/,                           // 文档1, 文档2
    /^Copy\s?(of\s?)?/i,                  // Copy of xxx
    /^复制\s?/,                            // 复制 xxx
    /^\(\d+\)$/,                          // (1), (2)
    
    // ---- 下载类 ----
    /^[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}/i,  // 部分UUID格式的下载文件
  ];
  
  return messyPatterns.some(pattern => pattern.test(name));
}

// 判断是否是文档类文件（需要加用户信息）
function isDocumentFile(ext: string): boolean {
  const docExtensions = [
    '.doc', '.docx', '.pdf', '.txt', '.rtf', '.odt', '.md',
    '.xls', '.xlsx', '.csv',
    '.ppt', '.pptx', '.key'
  ];
  return docExtensions.includes(ext.toLowerCase());
}

// 从文件名/修改时间提取日期
function extractDateFromFile(fileName: string, modifiedTime?: string): string {
  const name = path.basename(fileName, path.extname(fileName));
  
  // 尝试从文件名中提取日期
  const datePatterns = [
    /(\d{4})[-_]?(\d{2})[-_]?(\d{2})/,  // 2023-12-01, 20231201, 2023_12_01
    /(\d{2})[-_](\d{2})[-_](\d{4})/,     // 12-01-2023
  ];
  
  for (const pattern of datePatterns) {
    const match = name.match(pattern);
    if (match) {
      if (match[1].length === 4) {
        return `${match[1]}${match[2]}${match[3]}`;
      } else {
        return `${match[3]}${match[1]}${match[2]}`;
      }
    }
  }
  
  // 使用修改时间
  if (modifiedTime) {
    const d = new Date(modifiedTime);
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }
  
  // 使用当前日期
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}

// 清理文件名，提取有意义的部分
function cleanFileName(fileName: string): string {
  const ext = path.extname(fileName);
  let name = path.basename(fileName, ext);
  
  // 移除常见前缀
  name = name.replace(/^(IMG_|DSC_?|VID_|Screenshot_|Snipaste_|P_|DCIM_)/i, '');
  
  // 移除日期时间戳
  name = name.replace(/^\d{8}[-_]?\d{6}[-_]?/i, '');
  name = name.replace(/^\d{13,}[-_]?/, '');
  
  // 移除特殊字符，保留中英文和数字
  name = name.replace(/[^\u4e00-\u9fa5a-zA-Z0-9\-_]/g, '');
  
  // 截断过长的名字
  if (name.length > 30) {
    name = name.slice(0, 30);
  }
  
  return name.trim();
}

// ============ 文件分类 ============

// 扩展名到分类的映射
const extCategoryMap: Record<string, string> = {
  // 图片
  '.jpg': '图片', '.jpeg': '图片', '.png': '图片', '.gif': '图片',
  '.bmp': '图片', '.webp': '图片', '.svg': '图片', '.ico': '图片',
  '.tiff': '图片', '.raw': '图片', '.heic': '图片', '.heif': '图片',
  // 视频
  '.mp4': '视频', '.avi': '视频', '.mov': '视频', '.wmv': '视频',
  '.flv': '视频', '.mkv': '视频', '.webm': '视频', '.m4v': '视频',
  '.rmvb': '视频', '.rm': '视频', '.3gp': '视频',
  // 音频
  '.mp3': '音频', '.wav': '音频', '.flac': '音频', '.aac': '音频',
  '.ogg': '音频', '.wma': '音频', '.m4a': '音频', '.ape': '音频',
  // 文档
  '.doc': '文档', '.docx': '文档', '.pdf': '文档', '.txt': '文档',
  '.rtf': '文档', '.odt': '文档', '.md': '文档', '.epub': '文档',
  '.xls': '文档', '.xlsx': '文档', '.csv': '文档',
  '.ppt': '文档', '.pptx': '文档', '.key': '文档',
  // 压缩包
  '.zip': '压缩包', '.rar': '压缩包', '.7z': '压缩包',
  '.tar': '压缩包', '.gz': '压缩包', '.bz2': '压缩包', '.xz': '压缩包',
  // 代码
  '.js': '代码', '.jsx': '代码', '.ts': '代码', '.tsx': '代码',
  '.py': '代码', '.java': '代码', '.c': '代码', '.cpp': '代码', 
  '.h': '代码', '.hpp': '代码', '.css': '代码', '.scss': '代码',
  '.less': '代码', '.html': '代码', '.htm': '代码', '.vue': '代码',
  '.json': '代码', '.xml': '代码', '.sql': '代码', '.sh': '代码',
  '.bat': '代码', '.ps1': '代码', '.go': '代码', '.rs': '代码',
  '.rb': '代码', '.php': '代码', '.swift': '代码', '.kt': '代码',
  '.scala': '代码', '.r': '代码', '.m': '代码', '.lua': '代码',
  '.yml': '代码', '.yaml': '代码', '.toml': '代码', '.ini': '代码',
  // 可执行/安装包
  '.exe': '程序', '.msi': '程序', '.dmg': '程序', '.app': '程序',
  '.apk': '程序', '.deb': '程序', '.rpm': '程序', '.pkg': '程序',
  // 快捷方式
  '.lnk': '快捷方式', '.desktop': '快捷方式', '.url': '快捷方式', '.webloc': '快捷方式',
};

// 代码项目文件夹特征
const codeProjectFolders = [
  'node_modules', 'src', 'dist', 'build', 'lib', 'bin', 'out', 'target',
  'test', 'tests', '__tests__', 'spec', 'specs', 'coverage',
  '.git', '.svn', '.hg', '.vscode', '.idea',
  'packages', 'vendor', 'venv', 'env', '.env', '__pycache__',
];

// 关键词分类规则
const keywordRules: Array<{ keywords: string[]; category: string }> = [
  { keywords: ['发票', 'invoice', 'receipt', '收据'], category: '发票' },
  { keywords: ['合同', 'contract', '协议', 'agreement'], category: '合同' },
  { keywords: ['截图', 'screenshot', 'snip', 'capture'], category: '截图' },
  { keywords: ['说明书', 'manual', 'guide', '指南', '教程'], category: '说明书' },
  { keywords: ['简历', 'resume', 'cv'], category: '文档' },
  { keywords: ['报告', 'report'], category: '文档' },
];

// 文件夹关键词分类
const folderKeywordRules: Array<{ keywords: string[]; category: string }> = [
  { keywords: ['图片', 'images', 'photos', 'pictures', 'img', 'pic', '照片', '相册'], category: '图片' },
  { keywords: ['视频', 'videos', 'movies', '电影', '影片', 'video'], category: '视频' },
  { keywords: ['音乐', 'music', 'audio', '歌曲', 'songs'], category: '音频' },
  { keywords: ['文档', 'documents', 'docs', '资料'], category: '文档' },
  { keywords: ['代码', 'code', 'source', 'project', 'projects', '项目', '开发'], category: '代码' },
  { keywords: ['下载', 'downloads'], category: '下载' },
  { keywords: ['备份', 'backup', 'backups'], category: '备份' },
  { keywords: ['程序', 'software', 'apps', 'applications', '软件'], category: '程序' },
];

// 分类文件
function classifyFile(fileName: string, isDirectory: boolean, isSymlink: boolean = false): string {
  const ext = path.extname(fileName).toLowerCase();
  const lowerName = path.basename(fileName, ext).toLowerCase();
  
  // 符号链接视为快捷方式
  if (isSymlink) {
    return '快捷方式';
  }
  
  // 文件夹分类
  if (isDirectory) {
    // 检查是否是代码项目文件夹
    if (codeProjectFolders.some(k => lowerName === k)) {
      return '代码';
    }
    // 检查文件夹关键词
    for (const rule of folderKeywordRules) {
      if (rule.keywords.some(k => lowerName.includes(k.toLowerCase()))) {
        return rule.category;
      }
    }
    return '文件夹';
  }
  
  // 快捷方式
  if (isShortcutOrLink(fileName)) {
    return '快捷方式';
  }
  
  // 先检查关键词（优先级高于扩展名）
  for (const rule of keywordRules) {
    if (rule.keywords.some(k => lowerName.includes(k.toLowerCase()))) {
      return rule.category;
    }
  }
  
  // 截图特殊检测（图片类型但文件名包含截图关键词）
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
    if (lowerName.includes('screenshot') || lowerName.includes('截图') || 
        lowerName.includes('screen') || lowerName.startsWith('snip')) {
      return '截图';
    }
  }
  
  // 扩展名分类
  return extCategoryMap[ext] || '其他';
}

// ============ opencode 相关 ============

// 检测 opencode 是否可用
async function detectOpencode(): Promise<boolean> {
  const isWin = process.platform === 'win32';
  
  addAILog('info', `开始检测 opencode (平台: ${process.platform})`);
  
  // 方法1: 使用 which/where 命令
  try {
    const cmd = isWin ? 'where opencode' : 'which opencode';
    const { stdout } = await execAsync(cmd);
    if (stdout.trim()) {
      opencodePath = stdout.trim().split('\n')[0];
      addAILog('info', `通过 ${cmd} 找到 opencode: ${opencodePath}`);
      return true;
    }
  } catch (e) {
    // 命令未找到
  }

  // 方法2: 检查常见安装路径
  const homeDir = app.getPath('home');
  const commonPaths = isWin ? [
    path.join(homeDir, 'AppData', 'Local', 'Programs', 'opencode', 'opencode.exe'),
    path.join(homeDir, 'scoop', 'apps', 'opencode', 'current', 'opencode.exe'),
    'C:\\Program Files\\opencode\\opencode.exe',
    'C:\\Program Files (x86)\\opencode\\opencode.exe',
  ] : [
    '/usr/local/bin/opencode',
    '/usr/bin/opencode',
    path.join(homeDir, '.local', 'bin', 'opencode'),
    path.join(homeDir, 'go', 'bin', 'opencode'),
    '/opt/homebrew/bin/opencode',
  ];

  addAILog('info', `检查常见安装路径...`);
  
  for (const p of commonPaths) {
    try {
      await fs.promises.access(p, fs.constants.X_OK);
      opencodePath = p;
      addAILog('info', `在路径找到 opencode: ${opencodePath}`);
      return true;
    } catch (e) {
      // 路径不存在或不可执行
    }
  }

  addAILog('fallback', 'opencode 未找到，将使用本地规则引擎处理文件');
  return false;
}

// 调用 opencode 进行 AI 分析
async function callOpencode(prompt: string): Promise<string | null> {
  if (!isOpencodeAvailable) {
    addAILog('fallback', 'opencode 不可用，使用本地规则处理');
    return null;
  }

  const startTime = Date.now();
  addAILog('request', `发送请求到 opencode:\n\n${prompt}`);

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      addAILog('error', 'opencode 请求超时 (60秒)', Date.now() - startTime);
      resolve(null);
    }, 60000);

    const child = spawn(opencodePath, ['ask', prompt], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let output = '';
    let error = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      error += data.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      const duration = Date.now() - startTime;
      
      if (code === 0 && output) {
        addAILog('response', `opencode 响应 (${duration}ms):\n\n${output}`, duration);
        resolve(output);
      } else {
        addAILog('error', `opencode 错误 (code: ${code}):\n${error || '无错误信息'}`, duration);
        resolve(null);
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      const duration = Date.now() - startTime;
      addAILog('error', `opencode 启动失败: ${err.message}`, duration);
      resolve(null);
    });
  });
}

// 获取正确的用户目录
function getUserDirectories() {
  const homeDir = app.getPath('home');
  const isWin = process.platform === 'win32';
  
  return {
    home: homeDir,
    downloads: app.getPath('downloads'),
    documents: app.getPath('documents'),
    pictures: app.getPath('pictures'),
    desktop: app.getPath('desktop'),
    videos: isWin ? path.join(homeDir, 'Videos') : path.join(homeDir, 'Movies'),
    music: isWin ? path.join(homeDir, 'Music') : path.join(homeDir, 'Music'),
  };
}

// ============ Electron 窗口 ============

function createWindow() {
  // 移除默认菜单
  Menu.setApplicationMenu(null);
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 10, y: 10 },
    backgroundColor: '#f8fafc',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  isOpencodeAvailable = await detectOpencode();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ============ IPC 处理程序 ============

// 窗口控制
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.handle('window:close', () => mainWindow?.close());
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);

// 系统信息
ipcMain.handle('system:getInfo', () => ({
  platform: process.platform,
  isOpencodeAvailable,
  userDirs: getUserDirectories(),
}));

ipcMain.handle('system:getUserDirs', () => getUserDirectories());

// 对话框
ipcMain.handle('dialog:selectFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
    title: '选择要整理的文件夹',
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:saveFile', async (_, options: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: '保存文件',
    defaultPath: options.defaultPath,
    filters: options.filters || [{ name: 'JSON', extensions: ['json'] }],
  });
  return result.canceled ? null : result.filePath;
});

// 文件操作
ipcMain.handle('fs:writeFile', async (_, filePath: string, content: string) => {
  try {
    await fs.promises.writeFile(filePath, content, 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

// 扫描文件夹
ipcMain.handle('fs:scanFolder', async (_, folderPath: string) => {
  try {
    const files: Array<{
      name: string;
      path: string;
      size: number;
      modifiedTime: string;
      extension: string;
      isDirectory: boolean;
      isSymlink: boolean;
    }> = [];

    const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(folderPath, entry.name);
      
      // 跳过隐藏文件和系统文件
      if (entry.name.startsWith('.') || entry.name.startsWith('$')) continue;
      
      try {
        const stats = await fs.promises.lstat(fullPath); // 使用 lstat 以检测符号链接
        
        files.push({
          name: entry.name,
          path: fullPath,
          size: stats.size,
          modifiedTime: stats.mtime.toISOString(),
          extension: path.extname(entry.name).toLowerCase(),
          isDirectory: entry.isDirectory(),
          isSymlink: stats.isSymbolicLink(),
        });
      } catch (e) {
        // 跳过无法访问的文件
      }
    }

    return { success: true, files };
  } catch (error) {
    return { success: false, error: (error as Error).message, files: [] };
  }
});

// AI 分析文件
ipcMain.handle('ai:analyzeFiles', async (_, files: Array<{ 
  name: string; 
  path: string; 
  extension: string; 
  size: number; 
  isDirectory?: boolean;
  isSymlink?: boolean;
  modifiedTime?: string;
}>) => {
  const results: Array<{
    path: string;
    category: string;
    suggestedName: string;
    needsRename: boolean;
    needsMove: boolean;
    isShortcut: boolean;
    confidence: number;
    aiReason?: string;
  }> = [];

  // 统计各类别文件数量，用于决定是否创建目录
  const categoryCount: Record<string, number> = {};
  
  // 第一遍：分类并统计
  const classifiedFiles: Array<{
    file: typeof files[0];
    category: string;
  }> = [];
  
  for (const file of files) {
    const isDir = file.isDirectory === true;
    const isSymlink = file.isSymlink === true;
    const category = classifyFile(file.name, isDir, isSymlink);
    
    classifiedFiles.push({ file, category });
    
    if (!isDir) {
      categoryCount[category] = (categoryCount[category] || 0) + 1;
    }
  }

  // 确定哪些类别需要创建目录（>=3 个文件）
  const categoriesNeedingFolders = new Set<string>();
  for (const [cat, count] of Object.entries(categoryCount)) {
    if (count >= 3 && cat !== '快捷方式' && cat !== '其他') {
      categoriesNeedingFolders.add(cat);
    }
  }

  // 第二遍：生成整理建议
  for (const { file, category } of classifiedFiles) {
    const isDir = file.isDirectory === true;
    const isSymlink = file.isSymlink === true;
    const isShortcut = isShortcutOrLink(file.name) || isSymlink;
    
    // 判断是否需要移动
    // - 快捷方式默认不移动
    // - 文件夹不移动到子目录
    // - 只有当类别需要创建目录时才移动文件
    const needsMove = !isShortcut && !isDir && categoriesNeedingFolders.has(category);
    
    // 判断是否需要重命名
    // - 文件夹不重命名
    // - 快捷方式不重命名
    // - 只有乱码文件名才重命名
    const needsRename = !isDir && !isShortcut && isMessyFileName(file.name);
    
    // 生成建议名称
    let suggestedName = file.name;
    if (needsRename) {
      const dateStr = extractDateFromFile(file.name, file.modifiedTime);
      const cleanName = cleanFileName(file.name);
      const ext = file.extension;
      
      // 文档类文件添加用户信息
      if (isDocumentFile(ext)) {
        if (cleanName) {
          suggestedName = `${dateStr}_${currentUser}_${cleanName}${ext}`;
        } else {
          suggestedName = `${dateStr}_${currentUser}_文档${ext}`;
        }
      } else if (category === '截图') {
        // 截图类简化命名
        suggestedName = `${dateStr}_截图${ext}`;
      } else if (cleanName) {
        suggestedName = `${dateStr}_${cleanName}${ext}`;
      } else {
        // 无法提取有意义名称，使用日期+分类格式
        const categoryLabel = category !== '其他' ? category : '文件';
        suggestedName = `${dateStr}_${categoryLabel}${ext}`;
      }
    }

    results.push({
      path: file.path,
      category,
      suggestedName,
      needsRename,
      needsMove,
      isShortcut,
      confidence: 0.8,
    });
  }

  // 尝试使用 opencode 增强分析（仅对需要分析的文件）
  const filesToAnalyze = classifiedFiles.filter(({ file, category }) => 
    !file.isDirectory && category === '其他'
  );
  
  if (isOpencodeAvailable && filesToAnalyze.length > 0 && filesToAnalyze.length <= 30) {
    const fileList = filesToAnalyze.map(f => `- ${f.file.name}`).join('\n');
    const prompt = `请分析以下文件，判断它们的类型。只返回JSON格式，不要其他文字：

文件列表：
${fileList}

请返回格式：
{
  "files": [
    {"name": "文件名", "category": "分类", "reason": "理由"}
  ]
}

分类选项：合同、发票、截图、说明书、图片、视频、音频、文档、压缩包、代码、程序、其他`;

    const aiResponse = await callOpencode(prompt);
    if (aiResponse) {
      try {
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.files && Array.isArray(parsed.files)) {
            for (const aiResult of parsed.files) {
              const resultIndex = results.findIndex(r => 
                path.basename(r.path) === aiResult.name && r.category === '其他'
              );
              if (resultIndex >= 0 && aiResult.category !== '其他') {
                results[resultIndex].category = aiResult.category;
                results[resultIndex].confidence = 0.9;
                results[resultIndex].aiReason = aiResult.reason;
                
                // 更新是否需要移动
                if (categoryCount[aiResult.category]) {
                  categoryCount[aiResult.category]++;
                } else {
                  categoryCount[aiResult.category] = 1;
                }
              }
            }
          }
        }
      } catch (e) {
        console.log('Failed to parse AI response:', e);
      }
    }
  }

  return { 
    success: true, 
    results, 
    usedAI: isOpencodeAvailable,
    categoriesNeedingFolders: Array.from(categoriesNeedingFolders),
  };
});

// 计算文件哈希
async function calculateFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// 检测重复文件
ipcMain.handle('fs:detectDuplicates', async (_, files: Array<{ path: string; size: number; name: string }>) => {
  const hashMap = new Map<string, Array<{ path: string; name: string; size: number }>>();
  const duplicates: Array<{
    hash: string;
    files: Array<{ path: string; name: string; size: number; isKeep: boolean }>;
  }> = [];

  // 按大小分组
  const sizeGroups = new Map<number, Array<{ path: string; name: string; size: number }>>();
  for (const file of files) {
    if (file.size === 0) continue; // 跳过空文件
    const group = sizeGroups.get(file.size) || [];
    group.push(file);
    sizeGroups.set(file.size, group);
  }

  // 只对大小相同的文件计算哈希
  for (const [, group] of sizeGroups) {
    if (group.length > 1) {
      for (const file of group) {
        try {
          const hash = await calculateFileHash(file.path);
          const existing = hashMap.get(hash) || [];
          existing.push(file);
          hashMap.set(hash, existing);
        } catch (e) {
          // 跳过无法读取的文件
        }
      }
    }
  }

  // 提取重复组
  for (const [hash, group] of hashMap) {
    if (group.length > 1) {
      duplicates.push({
        hash,
        files: group.map((f, i) => ({
          ...f,
          isKeep: i === 0,
        })),
      });
    }
  }

  return { success: true, duplicates };
});

// 执行整理
ipcMain.handle('fs:executeOrganize', async (_, plan: {
  folderPath: string;
  categories: string[];
  files: Array<{ path: string; category: string; newName: string; needsMove: boolean; needsRename: boolean }>;
  duplicatesToDelete: string[];
}) => {
  const operations: UndoInfo['operations'] = [];
  const backupDir = path.join(app.getPath('temp'), `zhili-backup-${Date.now()}`);
  
  try {
    await fs.promises.mkdir(backupDir, { recursive: true });

    // 1. 创建需要的分类目录
    const createdDirs = new Set<string>();
    for (const category of plan.categories) {
      const categoryPath = path.join(plan.folderPath, category);
      if (!fs.existsSync(categoryPath)) {
        await fs.promises.mkdir(categoryPath, { recursive: true });
        createdDirs.add(categoryPath);
        operations.push({ type: 'mkdir', from: categoryPath });
      }
    }

    // 2. 处理文件
    for (const file of plan.files) {
      const currentPath = file.path;
      let targetPath = currentPath;
      
      // 确定目标路径
      if (file.needsMove) {
        const targetDir = path.join(plan.folderPath, file.category);
        targetPath = path.join(targetDir, file.needsRename ? file.newName : path.basename(currentPath));
      } else if (file.needsRename) {
        targetPath = path.join(path.dirname(currentPath), file.newName);
      }
      
      // 如果路径有变化，执行移动/重命名
      if (targetPath !== currentPath) {
        // 处理文件名冲突
        let finalPath = targetPath;
        let counter = 1;
        while (fs.existsSync(finalPath)) {
          const ext = path.extname(targetPath);
          const base = path.basename(targetPath, ext);
          finalPath = path.join(path.dirname(targetPath), `${base}_${counter}${ext}`);
          counter++;
        }

        try {
          await fs.promises.rename(currentPath, finalPath);
          operations.push({
            type: file.needsMove ? 'move' : 'rename',
            from: currentPath,
            to: finalPath,
          });
        } catch (e) {
          console.error('Failed to process file:', currentPath, e);
        }
      }
    }

    // 3. 处理重复文件
    for (const duplicatePath of plan.duplicatesToDelete) {
      const backupPath = path.join(backupDir, path.basename(duplicatePath) + '_' + Date.now());
      try {
        await fs.promises.copyFile(duplicatePath, backupPath);
        await fs.promises.unlink(duplicatePath);
        operations.push({
          type: 'delete',
          from: duplicatePath,
          backupPath,
        });
      } catch (e) {
        console.error('Failed to delete duplicate:', duplicatePath, e);
      }
    }

    // 保存撤销信息
    undoStack.push({ timestamp: Date.now(), operations });

    return { 
      success: true, 
      movedFiles: operations.filter(o => o.type === 'move').length,
      renamedFiles: operations.filter(o => o.type === 'rename').length,
      deletedFiles: operations.filter(o => o.type === 'delete').length,
      createdDirs: createdDirs.size,
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

// 撤销整理
ipcMain.handle('fs:undoOrganize', async () => {
  const lastUndo = undoStack.pop();
  if (!lastUndo) {
    return { success: false, error: '没有可撤销的操作' };
  }

  let restored = 0;
  
  // 逆序执行撤销
  for (const op of lastUndo.operations.reverse()) {
    try {
      if (op.type === 'move' && op.to) {
        await fs.promises.rename(op.to, op.from);
        restored++;
      } else if (op.type === 'rename' && op.to) {
        await fs.promises.rename(op.to, op.from);
        restored++;
      } else if (op.type === 'delete' && op.backupPath) {
        await fs.promises.copyFile(op.backupPath, op.from);
        await fs.promises.unlink(op.backupPath);
        restored++;
      } else if (op.type === 'mkdir') {
        // 尝试删除创建的空目录
        try {
          await fs.promises.rmdir(op.from);
        } catch (e) {
          // 目录非空则跳过
        }
      }
    } catch (e) {
      console.error('Failed to undo operation:', op, e);
    }
  }

  return { success: true, restoredFiles: restored };
});

// Shell 操作
ipcMain.handle('shell:showInFolder', (_, filePath: string) => {
  shell.showItemInFolder(filePath);
});

ipcMain.handle('shell:openPath', (_, folderPath: string) => {
  shell.openPath(folderPath);
});

// AI 日志相关
ipcMain.handle('ai:getLogs', () => {
  return aiLogs;
});

ipcMain.handle('ai:clearLogs', () => {
  aiLogs = [];
  return { success: true };
});

ipcMain.handle('ai:exportLogs', async () => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: '导出 AI 交互日志',
    defaultPath: `ai-logs-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  
  if (!result.canceled && result.filePath) {
    try {
      await fs.promises.writeFile(result.filePath, JSON.stringify(aiLogs, null, 2), 'utf-8');
      return { success: true, path: result.filePath };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }
  return { success: false, error: '用户取消' };
});
