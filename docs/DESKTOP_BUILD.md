# 智理 - 桌面应用构建指南

## 项目结构

```
zhili-file-organizer/
├── electron/                    # Electron 主进程代码
│   ├── main.ts                  # 主进程入口
│   ├── preload.ts               # 预加载脚本
│   └── tsconfig.json            # Electron TypeScript 配置
├── src/                         # React 前端代码
│   ├── App.tsx                  # 主应用组件
│   ├── components/              # UI 组件
│   ├── hooks/                   # React Hooks
│   │   └── useElectron.ts       # Electron API Hook
│   ├── types/                   # 类型定义
│   │   ├── index.ts             # 业务类型
│   │   └── electron.d.ts        # Electron API 类型
│   └── data/                    # 模拟数据
├── assets/                      # 应用资源
│   ├── icon.png                 # 应用图标 (512x512)
│   ├── icon.ico                 # Windows 图标
│   └── icon.icns                # macOS 图标
├── docs/                        # 文档
│   ├── OPENCODE_INTEGRATION.md  # opencode 交互设计
│   └── DESKTOP_BUILD.md         # 构建指南（本文件）
├── electron-builder.json        # electron-builder 配置
└── package.json                 # 项目配置
```

## 环境要求

- Node.js 18+
- npm 或 pnpm
- opencode（可选，用于 AI 增强功能）

## 安装依赖

```bash
# 安装项目依赖
npm install

# 安装 Electron 相关依赖
npm install -D electron electron-builder concurrently wait-on

# 安装 Electron 类型
npm install -D @types/electron
```

## 开发模式

```bash
# 启动开发服务器（同时启动 Vite 和 Electron）
npm run electron:dev
```

这将：
1. 启动 Vite 开发服务器（端口 5173）
2. 编译 Electron 主进程代码
3. 启动 Electron 应用

## 构建生产版本

### Windows

```bash
# 构建 Windows 安装包
npm run electron:build:win
```

输出：
- `release/智理-x.x.x-win-x64.exe` - NSIS 安装程序
- `release/智理-x.x.x-win-x64-portable.exe` - 便携版

### macOS

```bash
# 构建 macOS 安装包
npm run electron:build:mac
```

输出：
- `release/智理-x.x.x-mac-x64.dmg` - Intel Mac
- `release/智理-x.x.x-mac-arm64.dmg` - Apple Silicon

### Linux

```bash
# 构建 Linux 安装包
npm run electron:build:linux
```

输出：
- `release/智理-x.x.x-linux-x64.AppImage`
- `release/智理-x.x.x-linux-x64.deb`

### 全平台构建

```bash
npm run electron:build
```

## package.json 脚本配置

将以下脚本添加到 `package.json`：

```json
{
  "main": "dist-electron/main.js",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "electron:dev": "concurrently \"npm run dev\" \"npm run electron:watch\"",
    "electron:watch": "wait-on http://localhost:5173 && tsc -p electron && electron .",
    "electron:build": "npm run build && tsc -p electron && electron-builder",
    "electron:build:win": "npm run build && tsc -p electron && electron-builder --win",
    "electron:build:mac": "npm run build && tsc -p electron && electron-builder --mac",
    "electron:build:linux": "npm run build && tsc -p electron && electron-builder --linux"
  }
}
```

## 代码签名（发布前必须）

### Windows

1. 获取代码签名证书（推荐 DigiCert, Sectigo）
2. 设置环境变量：
   ```
   CSC_LINK=path/to/certificate.pfx
   CSC_KEY_PASSWORD=your_password
   ```

### macOS

1. 注册 Apple Developer Program
2. 创建 Developer ID Application 证书
3. 设置环境变量：
   ```
   CSC_NAME="Developer ID Application: Your Name (TEAM_ID)"
   ```

## 自动更新

使用 electron-updater 实现自动更新：

```typescript
// electron/main.ts 添加
import { autoUpdater } from 'electron-updater';

app.whenReady().then(() => {
  // 检查更新
  autoUpdater.checkForUpdatesAndNotify();
});
```

配置 GitHub Releases 或自建更新服务器。

## 故障排除

### 问题：Electron 窗口空白

检查 Vite 开发服务器是否正常运行，确保端口 5173 可访问。

### 问题：打包后应用无法启动

1. 检查 `dist` 目录是否包含完整的前端构建产物
2. 检查 `dist-electron` 目录是否包含编译后的主进程代码
3. 查看控制台日志获取详细错误信息

### 问题：opencode 不可用

应用会自动降级到规则引擎模式，不影响基本功能。

## 性能优化

1. **启动优化**：延迟加载非关键模块
2. **内存优化**：大文件扫描使用流式处理
3. **打包优化**：使用 ASAR 压缩，排除不必要文件

## 安全注意事项

1. 启用 `contextIsolation: true`
2. 禁用 `nodeIntegration`
3. 使用 preload 脚本安全暴露 API
4. 验证所有 IPC 输入
5. 不在渲染进程中处理敏感操作
