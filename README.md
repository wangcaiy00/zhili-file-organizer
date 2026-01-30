# 智理 - 文件夹整理助手

AI驱动的智能文件夹整理工具，让文件管理变得简单高效。

## ✨ 功能特点

- 📁 **智能分类** - 自动识别11种文件类型（合同/发票/截图/说明书/图片/视频/音频/文档/压缩包/代码/其他）
- 🏷️ **智能重命名** - 日期-分类-主题格式，清晰明了
- 🔍 **重复检测** - 基于文件哈希精确识别重复文件
- 👁️ **预览优先** - 所有操作先预览再执行，安全可控
- ↩️ **一键撤销** - 不满意随时恢复原状
- 📊 **整理报告** - 详细记录所有改动，可导出JSON

## 🚀 运行模式

### Web 演示模式（浏览器）
- 仅用于功能演示
- 使用模拟数据
- 不会真正操作文件系统

### 桌面应用模式（Electron）
- 真实扫描文件夹
- 真实执行整理操作
- 支持 opencode AI 增强或本地规则

## 📦 安装与运行

### 1. 安装依赖
```bash
npm install
```

### 2. Web 演示（开发模式）
```bash
npm run dev
```
访问 http://localhost:5173

### 3. 桌面应用开发
```bash
# 先安装 Electron 依赖
npm install --save-dev electron electron-builder concurrently wait-on

# 开发模式运行桌面应用
npm run dev:electron
```

### 4. 打包桌面应用
```bash
# 构建前端 + Electron 主进程
npm run build:electron

# 打包当前平台
npm run dist

# 指定平台打包
npm run dist:win    # Windows
npm run dist:mac    # macOS
npm run dist:linux  # Linux
```

## 🤖 opencode 集成

### 检测流程
```
应用启动
    ↓
检测 opencode 是否可用
(which/where + 常见路径检查)
    ↓
   可用 → AI增强模式（调用 opencode ask）
   不可用 → 本地规则模式（扩展名+关键词匹配）
```

### AI 增强模式（opencode 可用时）

1. **文件分类** - 通过 opencode 分析文件名和内容
2. **智能命名** - AI 提取主题关键词
3. **内容理解** - 未来支持 PDF/图片 OCR

### 本地规则模式（opencode 不可用时）

1. **扩展名映射** - .jpg→图片, .pdf→文档 等
2. **关键词检测** - 文件名含"发票"→发票分类
3. **智能命名** - 日期-分类-清理后原名

### opencode 调用示例
```bash
opencode ask '分析这个文件名并返回分类和建议的新名称。文件名: "IMG_20240115.jpg"

分类只能是以下之一: 合同, 发票, 截图, 说明书, 图片, 视频, 音频, 文档, 压缩包, 代码, 其他

请只返回JSON格式:
{"category": "分类名", "suggestedName": "建议的新文件名"}'
```

## 📂 项目结构

```
├── src/                    # 前端源码
│   ├── App.tsx             # 主应用组件
│   ├── components/         # UI组件
│   │   ├── SelectFolder.tsx    # 选择文件夹
│   │   ├── Scanning.tsx        # 扫描进度
│   │   ├── PreviewPlan.tsx     # 预览计划
│   │   ├── Executing.tsx       # 执行整理
│   │   ├── Report.tsx          # 完成报告
│   │   └── Icons.tsx           # SVG图标
│   ├── hooks/
│   │   └── useElectron.ts  # Electron API Hook
│   ├── data/
│   │   └── mockData.ts     # Web模式模拟数据
│   └── types/              # TypeScript类型
│
├── electron/               # Electron 主进程
│   ├── main.ts             # 主进程入口
│   ├── preload.ts          # 预加载脚本
│   └── tsconfig.json       # Electron TS配置
│
├── public/                 # 静态资源
│   └── icon.svg            # 应用图标
│
├── package.json            # 项目配置
├── vite.config.ts          # Vite配置
└── electron-builder.json   # 打包配置
```

## 🔧 npm 命令说明

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动 Web 开发服务器 |
| `npm run dev:electron` | 启动 Electron 开发模式 |
| `npm run build` | 构建前端 |
| `npm run build:electron` | 构建前端 + Electron |
| `npm run dist` | 打包当前平台安装包 |
| `npm run dist:win` | 打包 Windows 安装包 |
| `npm run dist:mac` | 打包 macOS 安装包 |
| `npm run dist:linux` | 打包 Linux 安装包 |

## 🛡️ 安全特性

1. **本地处理** - 所有文件操作在本地完成，不上传任何文件
2. **预览优先** - 先展示整理计划，确认后再执行
3. **可撤销** - 记录所有操作，支持一键回滚
4. **隔离沙箱** - Electron contextIsolation 保护

## 📝 数据流向

```
┌─────────────────────────────────────────────────────────────┐
│                      桌面应用 (Electron)                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   用户选择文件夹                                               │
│         ↓                                                   │
│   FileService.scanFolder()  ← 真实文件系统 API                │
│         ↓                                                   │
│   检测 opencode 是否可用                                      │
│         ↓                                                   │
│   ┌─────────────┬─────────────┐                            │
│   │ opencode 可用 │ opencode 不可用 │                        │
│   └──────┬──────┴──────┬──────┘                            │
│          ↓              ↓                                   │
│   调用 opencode ask   本地规则引擎                            │
│          ↓              ↓                                   │
│   └─────────┴─────────┘                                    │
│              ↓                                              │
│   生成整理计划 (分类 + 重命名 + 重复检测)                       │
│              ↓                                              │
│   用户预览并编辑计划                                          │
│              ↓                                              │
│   用户确认执行                                               │
│              ↓                                              │
│   FileService.organize() ← 真实文件移动/重命名                │
│              ↓                                              │
│   记录操作历史 (用于撤销)                                     │
│              ↓                                              │
│   展示整理报告                                               │
│              ↓                                              │
│   可选: 撤销 / 导出报告                                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                      Web 演示模式                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   使用 mockData.ts 中的模拟数据                              │
│   不会真正操作文件系统                                        │
│   仅用于功能演示和界面预览                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 📄 License

MIT
