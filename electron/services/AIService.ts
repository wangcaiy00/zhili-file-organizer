/**
 * AI 服务 - 与 opencode 交互
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

interface FileInfo {
  name: string;
  extension: string;
  size: number;
  modifiedTime: string;
  contentPreview?: string;
}

interface AnalysisResult {
  name: string;
  category: string;
  suggestedName: string;
  contentHint?: string;
  confidence?: number;
}

interface AIServiceOptions {
  opencodePath?: string;
  timeout?: number;
  maxContentLength?: number;
  fallbackEnabled?: boolean;
}

const defaultOptions: AIServiceOptions = {
  timeout: 30000,
  maxContentLength: 1000,
  fallbackEnabled: true,
};

// 分类到扩展名的映射（用于规则引擎）
const EXTENSION_CATEGORY_MAP: Record<string, string> = {
  // 图片
  '.jpg': '图片', '.jpeg': '图片', '.png': '图片', '.gif': '图片',
  '.bmp': '图片', '.webp': '图片', '.svg': '图片', '.ico': '图片',
  '.heic': '图片', '.raw': '图片',
  // 视频
  '.mp4': '视频', '.avi': '视频', '.mov': '视频', '.mkv': '视频',
  '.wmv': '视频', '.flv': '视频', '.webm': '视频', '.m4v': '视频',
  // 音频
  '.mp3': '音频', '.wav': '音频', '.flac': '音频', '.aac': '音频',
  '.ogg': '音频', '.wma': '音频', '.m4a': '音频',
  // 文档
  '.doc': '文档', '.docx': '文档', '.txt': '文档', '.rtf': '文档',
  '.odt': '文档', '.md': '文档', '.pdf': '文档',
  '.xls': '文档', '.xlsx': '文档', '.ppt': '文档', '.pptx': '文档',
  // 压缩包
  '.zip': '压缩包', '.rar': '压缩包', '.7z': '压缩包', '.tar': '压缩包',
  '.gz': '压缩包', '.bz2': '压缩包', '.xz': '压缩包',
  // 代码
  '.js': '代码', '.ts': '代码', '.py': '代码', '.java': '代码',
  '.c': '代码', '.cpp': '代码', '.h': '代码', '.css': '代码',
  '.html': '代码', '.json': '代码', '.xml': '代码', '.sql': '代码',
  '.go': '代码', '.rs': '代码', '.rb': '代码', '.php': '代码',
};

// 文件名关键词到分类的映射
const KEYWORD_CATEGORY_MAP: Array<{ keywords: string[]; category: string }> = [
  { keywords: ['合同', 'contract', '协议', 'agreement'], category: '合同' },
  { keywords: ['发票', 'invoice', 'receipt', '收据'], category: '发票' },
  { keywords: ['截图', 'screenshot', 'screen', 'snip'], category: '截图' },
  { keywords: ['说明书', 'manual', 'guide', '手册', '教程'], category: '说明书' },
];

export class AIService extends EventEmitter {
  private options: AIServiceOptions;
  private opencodeAvailable: boolean = false;

  constructor(options: Partial<AIServiceOptions> = {}) {
    super();
    this.options = { ...defaultOptions, ...options };
  }

  /**
   * 初始化服务，检查 opencode 是否可用
   * 
   * 检测逻辑：
   * 1. 尝试执行 'opencode --version' 命令
   * 2. 如果命令存在且返回成功，标记 opencode 可用
   * 3. 如果命令不存在、执行失败或超时，标记为不可用
   * 
   * 不可用时会自动使用规则引擎，无需用户干预
   */
  async initialize(): Promise<boolean> {
    return new Promise((resolve) => {
      console.log('[AIService] 初始化中，检测 opencode...');
      
      try {
        const process = spawn('opencode', ['--version'], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        let versionInfo = '';

        process.stdout.on('data', (data) => {
          versionInfo += data.toString();
        });

        process.on('error', (err) => {
          // 命令不存在或无法执行
          console.log('[AIService] opencode 检测失败:', err.message);
          console.log('[AIService] 将使用本地规则引擎进行文件分析');
          this.opencodeAvailable = false;
          resolve(false);
        });

        process.on('close', (code) => {
          this.opencodeAvailable = code === 0;
          if (this.opencodeAvailable) {
            console.log('[AIService] opencode 可用，版本:', versionInfo.trim());
          } else {
            console.log('[AIService] opencode 退出码非0，将使用规则引擎');
          }
          resolve(this.opencodeAvailable);
        });

        // 5秒超时保护
        setTimeout(() => {
          if (!process.killed) {
            process.kill();
            console.log('[AIService] opencode 检测超时，将使用规则引擎');
            this.opencodeAvailable = false;
            resolve(false);
          }
        }, 5000);
      } catch (err) {
        console.log('[AIService] opencode 检测异常:', err);
        this.opencodeAvailable = false;
        resolve(false);
      }
    });
  }

  /**
   * 分析文件列表
   */
  async analyzeFiles(files: FileInfo[]): Promise<AnalysisResult[]> {
    if (this.opencodeAvailable) {
      try {
        return await this.analyzeWithOpencode(files);
      } catch (error) {
        console.warn('[AIService] opencode 分析失败，使用规则引擎', error);
        if (this.options.fallbackEnabled) {
          return this.analyzeWithRules(files);
        }
        throw error;
      }
    }

    return this.analyzeWithRules(files);
  }

  /**
   * 使用 opencode 进行 AI 分析
   */
  private async analyzeWithOpencode(files: FileInfo[]): Promise<AnalysisResult[]> {
    const prompt = this.buildAnalysisPrompt(files);
    const response = await this.queryOpencode(prompt);
    return this.parseAnalysisResponse(response, files);
  }

  /**
   * 构建分析提示词
   */
  private buildAnalysisPrompt(files: FileInfo[]): string {
    const fileList = files.map((f) => ({
      name: f.name,
      ext: f.extension,
      size: f.size,
    }));

    return `你是一个专业的文件整理专家。请分析以下文件列表，为每个文件：
1. 确定分类（必须是以下之一：合同、发票、截图、说明书、图片、视频、音频、文档、压缩包、代码、其他）
2. 建议一个规范的新文件名（格式：日期-分类-主题.扩展名）

文件列表：
${JSON.stringify(fileList, null, 2)}

请严格按以下 JSON 格式返回：
{
  "files": [
    {
      "name": "原文件名",
      "category": "分类",
      "suggestedName": "建议的新文件名",
      "contentHint": "内容推断（如有）"
    }
  ]
}

只返回 JSON，不要包含其他文字。`;
  }

  /**
   * 调用 opencode
   */
  private queryOpencode(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = ['--prompt', prompt];
      const process = spawn(this.options.opencodePath || 'opencode', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let output = '';
      let error = '';

      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      process.stderr.on('data', (data) => {
        error += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(error || `opencode 退出码: ${code}`));
        }
      });

      process.on('error', reject);

      // 超时处理
      setTimeout(() => {
        process.kill();
        reject(new Error('opencode 请求超时'));
      }, this.options.timeout);
    });
  }

  /**
   * 解析 AI 响应
   */
  private parseAnalysisResponse(response: string, originalFiles: FileInfo[]): AnalysisResult[] {
    try {
      // 尝试提取 JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('无法提取 JSON');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.files || [];
    } catch (error) {
      console.warn('[AIService] 解析 AI 响应失败', error);
      // 降级到规则引擎
      return this.analyzeWithRules(originalFiles);
    }
  }

  /**
   * 使用规则引擎分析（降级方案）
   */
  analyzeWithRules(files: FileInfo[]): AnalysisResult[] {
    return files.map((file) => {
      const category = this.categorizeByRules(file);
      const suggestedName = this.generateNameByRules(file, category);

      return {
        name: file.name,
        category,
        suggestedName,
        confidence: 0.7, // 规则引擎的置信度较低
      };
    });
  }

  /**
   * 基于规则的分类
   */
  private categorizeByRules(file: FileInfo): string {
    const nameLower = file.name.toLowerCase();

    // 1. 先检查关键词
    for (const mapping of KEYWORD_CATEGORY_MAP) {
      if (mapping.keywords.some((kw) => nameLower.includes(kw.toLowerCase()))) {
        return mapping.category;
      }
    }

    // 2. 再检查扩展名
    return EXTENSION_CATEGORY_MAP[file.extension.toLowerCase()] || '其他';
  }

  /**
   * 基于规则生成文件名
   */
  private generateNameByRules(file: FileInfo, category: string): string {
    const date = new Date(file.modifiedTime);
    const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');

    // 从原文件名提取有意义的部分
    const baseName = file.name.replace(file.extension, '');
    const cleanName = baseName
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 30);

    return `${dateStr}-${category}-${cleanName || 'file'}${file.extension}`;
  }

  /**
   * 检查 opencode 是否可用
   */
  isOpenCodeAvailable(): boolean {
    return this.opencodeAvailable;
  }
}

// 单例导出
export const aiService = new AIService();
