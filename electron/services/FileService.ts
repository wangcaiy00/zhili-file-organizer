/**
 * 文件服务 - 处理文件系统操作
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface ScannedFile {
  id: string;
  name: string;
  path: string;
  relativePath: string;
  size: number;
  createdAt: Date;
  modifiedAt: Date;
  extension: string;
  hash: string;
}

export interface FileOperation {
  type: 'move' | 'rename' | 'delete' | 'create_dir';
  sourcePath: string;
  targetPath?: string;
  originalName?: string;
  newName?: string;
  timestamp: Date;
}

export interface OperationHistory {
  id: string;
  folderPath: string;
  timestamp: Date;
  operations: FileOperation[];
}

class FileService {
  private history: OperationHistory[] = [];
  private maxHistorySize = 10;

  /**
   * 扫描文件夹
   */
  async scanFolder(folderPath: string, options?: {
    recursive?: boolean;
    includeHidden?: boolean;
    maxDepth?: number;
  }): Promise<ScannedFile[]> {
    const files: ScannedFile[] = [];
    const opts = {
      recursive: true,
      includeHidden: false,
      maxDepth: 5,
      ...options,
    };

    await this.scanDirectory(folderPath, '', files, opts, 0);
    return files;
  }

  private async scanDirectory(
    basePath: string,
    relativePath: string,
    files: ScannedFile[],
    options: { recursive: boolean; includeHidden: boolean; maxDepth: number },
    currentDepth: number
  ): Promise<void> {
    if (currentDepth > options.maxDepth) return;

    const currentPath = path.join(basePath, relativePath);
    let entries: fs.Dirent[];

    try {
      entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
    } catch (error) {
      console.warn(`无法读取目录: ${currentPath}`, error);
      return;
    }

    for (const entry of entries) {
      // 跳过隐藏文件
      if (!options.includeHidden && entry.name.startsWith('.')) {
        continue;
      }

      const fullPath = path.join(currentPath, entry.name);
      const relPath = path.join(relativePath, entry.name);

      if (entry.isFile()) {
        try {
          const stats = await fs.promises.stat(fullPath);
          const hash = await this.calculateHash(fullPath);

          files.push({
            id: this.generateId(),
            name: entry.name,
            path: fullPath,
            relativePath: relPath,
            size: stats.size,
            createdAt: stats.birthtime,
            modifiedAt: stats.mtime,
            extension: path.extname(entry.name).toLowerCase(),
            hash,
          });
        } catch (error) {
          console.warn(`无法读取文件: ${fullPath}`, error);
        }
      } else if (entry.isDirectory() && options.recursive) {
        await this.scanDirectory(basePath, relPath, files, options, currentDepth + 1);
      }
    }
  }

  /**
   * 计算文件 hash（用于重复检测）
   */
  async calculateHash(filePath: string, algorithm = 'md5'): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash(algorithm);
      const stream = fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 }); // 1MB 缓冲

      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * 执行文件整理
   */
  async executeOrganize(plan: {
    sourceFolder: string;
    files: Array<{
      path: string;
      newName: string;
      category: string;
      selected: boolean;
    }>;
    duplicates?: Array<{
      files: Array<{ path: string }>;
      keepIndex: number;
    }>;
  }): Promise<{
    success: boolean;
    historyId?: string;
    error?: string;
  }> {
    const operations: FileOperation[] = [];
    const targetRoot = plan.sourceFolder + '_整理后';
    const historyId = this.generateId();

    try {
      // 1. 创建目录结构
      const categories = [...new Set(plan.files.filter(f => f.selected).map(f => f.category))];
      for (const category of categories) {
        const categoryPath = path.join(targetRoot, category);
        await fs.promises.mkdir(categoryPath, { recursive: true });
        operations.push({
          type: 'create_dir',
          sourcePath: categoryPath,
          timestamp: new Date(),
        });
      }

      // 2. 移动文件
      for (const file of plan.files) {
        if (!file.selected) continue;

        const targetDir = path.join(targetRoot, file.category);
        const targetPath = path.join(targetDir, file.newName);

        // 检查目标文件是否已存在
        if (await this.fileExists(targetPath)) {
          const uniqueName = this.makeUniqueName(targetPath);
          await fs.promises.rename(file.path, uniqueName);
          operations.push({
            type: 'move',
            sourcePath: file.path,
            targetPath: uniqueName,
            timestamp: new Date(),
          });
        } else {
          await fs.promises.rename(file.path, targetPath);
          operations.push({
            type: 'move',
            sourcePath: file.path,
            targetPath,
            timestamp: new Date(),
          });
        }
      }

      // 3. 删除重复文件
      if (plan.duplicates) {
        for (const group of plan.duplicates) {
          for (let i = 0; i < group.files.length; i++) {
            if (i !== group.keepIndex) {
              const filePath = group.files[i].path;
              // 移到回收站或备份目录（而不是直接删除）
              const backupPath = path.join(targetRoot, '.duplicates_backup', path.basename(filePath));
              await fs.promises.mkdir(path.dirname(backupPath), { recursive: true });
              await fs.promises.rename(filePath, backupPath);
              operations.push({
                type: 'delete',
                sourcePath: filePath,
                targetPath: backupPath, // 实际是移到备份目录
                timestamp: new Date(),
              });
            }
          }
        }
      }

      // 保存历史记录
      this.history.push({
        id: historyId,
        folderPath: plan.sourceFolder,
        timestamp: new Date(),
        operations,
      });

      // 限制历史记录数量
      if (this.history.length > this.maxHistorySize) {
        this.history.shift();
      }

      return { success: true, historyId };
    } catch (error: any) {
      console.error('执行整理失败:', error);
      
      // 尝试回滚已执行的操作
      await this.rollbackOperations(operations);
      
      return { success: false, error: error.message };
    }
  }

  /**
   * 撤销整理操作
   */
  async undoOrganize(historyId?: string): Promise<{ success: boolean; error?: string }> {
    const history = historyId
      ? this.history.find(h => h.id === historyId)
      : this.history.pop();

    if (!history) {
      return { success: false, error: '没有可撤销的操作' };
    }

    try {
      await this.rollbackOperations(history.operations);
      
      // 从历史中移除（如果是通过 ID 查找的）
      if (historyId) {
        const index = this.history.findIndex(h => h.id === historyId);
        if (index !== -1) {
          this.history.splice(index, 1);
        }
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 回滚操作
   */
  private async rollbackOperations(operations: FileOperation[]): Promise<void> {
    // 逆序执行回滚
    for (const op of [...operations].reverse()) {
      try {
        switch (op.type) {
          case 'move':
          case 'delete':
            if (op.targetPath) {
              await fs.promises.rename(op.targetPath, op.sourcePath);
            }
            break;
          case 'create_dir':
            // 尝试删除空目录
            try {
              await fs.promises.rmdir(op.sourcePath);
            } catch {
              // 目录不为空，跳过
            }
            break;
        }
      } catch (error) {
        console.warn(`回滚操作失败: ${op.type} ${op.sourcePath}`, error);
      }
    }
  }

  /**
   * 检查文件是否存在
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 生成唯一文件名
   */
  private makeUniqueName(filePath: string): string {
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    let counter = 1;
    let newPath = filePath;

    while (fs.existsSync(newPath)) {
      newPath = path.join(dir, `${base}_${counter}${ext}`);
      counter++;
    }

    return newPath;
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 获取操作历史
   */
  getHistory(): OperationHistory[] {
    return [...this.history];
  }

  /**
   * 读取文件内容预览（用于 AI 分析）
   */
  async readFilePreview(filePath: string, maxLength = 1000): Promise<string> {
    const textExtensions = ['.txt', '.md', '.json', '.xml', '.html', '.csv', '.log'];
    const ext = path.extname(filePath).toLowerCase();

    if (!textExtensions.includes(ext)) {
      return '';
    }

    try {
      const content = await fs.promises.readFile(filePath, { encoding: 'utf-8' });
      return content.slice(0, maxLength);
    } catch {
      return '';
    }
  }
}

export const fileService = new FileService();
