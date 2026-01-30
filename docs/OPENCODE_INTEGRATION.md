# opencode 集成详细设计

## 1. 概述

智理应用支持通过 opencode CLI 工具进行 AI 增强的文件分析。当 opencode 不可用时，自动降级到本地规则引擎。

## 2. opencode 检测机制

### 检测代码 (electron/main.ts)

```typescript
function checkOpencodeAvailable(): boolean {
  try {
    // 尝试 which (Unix) 或 where (Windows)
    execSync('which opencode || where opencode', { stdio: 'ignore' });
    return true;
  } catch {
    // 检查常见安装路径
    const possiblePaths = [
      '/usr/local/bin/opencode',
      '/usr/bin/opencode',
      path.join(process.env.HOME || '', '.local/bin/opencode'),
      path.join(process.env.HOME || '', 'go/bin/opencode'),
    ];
    
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return true;
      }
    }
    return false;
  }
}
```

### 检测时机
- 应用启动时
- 每次扫描文件夹前

## 3. AI 调用流程

### 3.1 调用方式

```typescript
async function callOpencode(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('opencode', ['ask', prompt], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`opencode exited with code ${code}`));
      }
    });

    // 60秒超时
    setTimeout(() => {
      child.kill();
      reject(new Error('opencode timeout'));
    }, 60000);
  });
}
```

### 3.2 Prompt 设计

#### 文件分类 Prompt
```
分析这个文件名并返回分类和建议的新名称。文件名: "{{filename}}"

分类只能是以下之一: 合同, 发票, 截图, 说明书, 图片, 视频, 音频, 文档, 压缩包, 代码, 其他

请只返回JSON格式:
{"category": "分类名", "suggestedName": "建议的新文件名"}
```

#### 批量分析 Prompt（优化版，减少调用次数）
```
分析以下文件列表并返回分类和建议的新名称。

文件列表:
{{fileList}}

对每个文件返回分类和建议名称。分类只能是: 合同, 发票, 截图, 说明书, 图片, 视频, 音频, 文档, 压缩包, 代码, 其他

命名规则: YYYYMMDD-分类-主题.扩展名

请返回JSON数组:
[{"original": "原文件名", "category": "分类", "suggestedName": "新文件名"}, ...]
```

### 3.3 响应解析

```typescript
// 从 opencode 输出中提取 JSON
const response = await callOpencode(prompt);
const match = response.match(/\{[^}]+\}/);  // 单个文件
// 或
const match = response.match(/\[[\s\S]*\]/);  // 批量文件

if (match) {
  const result = JSON.parse(match[0]);
  // 使用结果
}
```

## 4. 降级策略

### 4.1 降级触发条件
1. opencode 命令不存在
2. opencode 调用超时 (60秒)
3. opencode 返回非零退出码
4. 返回结果无法解析为 JSON

### 4.2 本地规则引擎

```typescript
function classifyFileLocally(fileName: string, ext: string): string {
  const lowerName = fileName.toLowerCase();
  const lowerExt = ext.toLowerCase();

  // 1. 扩展名映射
  const extMap: Record<string, string> = {
    // 图片
    '.jpg': '图片', '.jpeg': '图片', '.png': '图片', '.gif': '图片',
    '.bmp': '图片', '.webp': '图片', '.svg': '图片',
    // 视频
    '.mp4': '视频', '.avi': '视频', '.mov': '视频', '.mkv': '视频',
    // 音频
    '.mp3': '音频', '.wav': '音频', '.flac': '音频',
    // 文档
    '.doc': '文档', '.docx': '文档', '.pdf': '文档', '.txt': '文档',
    // 压缩包
    '.zip': '压缩包', '.rar': '压缩包', '.7z': '压缩包',
    // 代码
    '.js': '代码', '.ts': '代码', '.py': '代码', '.java': '代码',
    // ...
  };

  if (extMap[lowerExt]) {
    // 2. 关键词细分
    if (extMap[lowerExt] === '文档') {
      if (lowerName.includes('发票') || lowerName.includes('invoice')) return '发票';
      if (lowerName.includes('合同') || lowerName.includes('contract')) return '合同';
      if (lowerName.includes('说明书') || lowerName.includes('manual')) return '说明书';
    }
    if (extMap[lowerExt] === '图片') {
      if (lowerName.includes('截图') || lowerName.includes('screenshot')) return '截图';
    }
    return extMap[lowerExt];
  }

  return '其他';
}
```

### 4.3 本地命名规则

```typescript
function generateSmartName(originalName: string, category: string): string {
  const ext = path.extname(originalName);
  const baseName = path.basename(originalName, ext);
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
  
  // 清理文件名
  const cleanName = baseName
    .replace(/[_\-]+/g, ' ')  // 下划线/连字符转空格
    .replace(/\s+/g, ' ')      // 多空格合并
    .trim()
    .substring(0, 30);         // 限制长度

  return `${date}-${category}-${cleanName}${ext}`;
}
```

## 5. 性能优化

### 5.1 批量处理
- 将多个文件合并成一个 prompt，减少 API 调用次数
- 每批最多处理 20 个文件

### 5.2 缓存策略
- 相同文件名的分析结果可缓存
- 缓存时间：当前会话内

### 5.3 超时控制
- 单次调用超时：60秒
- 总超时：5分钟（大文件夹场景）

## 6. 错误处理

```typescript
try {
  const response = await callOpencode(prompt);
  const result = parseResponse(response);
  file.category = result.category;
  file.newName = result.suggestedName;
} catch (error) {
  // 降级到本地规则
  console.warn('[AI] 调用失败，使用本地规则:', error.message);
  file.category = classifyFileLocally(file.name, file.extension);
  file.newName = generateSmartName(file.name, file.category);
}
```

## 7. 用户界面

### 7.1 模式指示器
- **AI增强** (紫色标签) - opencode 可用
- **本地规则** (蓝色标签) - opencode 不可用

### 7.2 状态栏显示
- 当前使用的分析模式
- 如果是本地规则，提示可安装 opencode 获得更好效果

## 8. 未来扩展

### 8.1 内容分析（待实现）
- PDF 文本提取 + AI 分析
- 图片 OCR + AI 识别
- 从文件内容提取更精准的主题

### 8.2 批量优化（待实现）
```
分析以下文件并返回分类结果:

1. 合同_租赁协议_20240115.pdf
2. IMG_20240110_截图.png
3. 发票-京东商城.pdf
...

返回格式:
[
  {"index": 1, "category": "合同", "theme": "租赁协议"},
  {"index": 2, "category": "截图", "theme": ""},
  {"index": 3, "category": "发票", "theme": "京东商城"},
  ...
]
```

### 8.3 规则学习（待实现）
- 记录用户的手动修改
- 生成自定义规则
- 导出为 JSON 供社区共享
