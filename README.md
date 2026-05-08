# URL Downloader Tool

一个通用的公开链接粘贴、解析、下载小工具，支持抖音视频无水印下载。

## 功能

- 从整段文本中提取 http/https 链接
- 跟随重定向解析最终地址
- 识别响应内容类型与建议文件名
- 对公开媒体资源提供下载转发
- 在页面中显示下载进度
- **抖音视频无水印下载**：粘贴抖音分享链接即可下载无水印版本

## 使用方式

### 开发模式

```bash
npm install
npm start
```

启动后访问：`http://localhost:10010`

### 打包为可执行文件

```bash
# 安装依赖（包含打包工具）
npm install

# 打包为 Windows .exe（输出到 dist/url-downloader.exe）
npm run build

# 打包 Windows + macOS + Linux 三平台（输出到 dist/ 目录）
npm run build:all
```

打包后的 `dist/url-downloader.exe` 可以直接分发给其他人使用，无需安装 Node.js。

**分发方式：**

将 `dist/` 目录下的以下文件打包发送：
- `url-downloader.exe`（或对应平台的可执行文件）
- `web/` 文件夹（前端页面）

用户只需将这两个放在同一目录下，双击运行 `.exe` 即可自动打开浏览器。

## 限制

- 只支持公开可访问的 `http/https` 链接
- 不支持内网、本机回环地址
- 只允许媒体类资源进入下载流程（video/\*、audio/\*、image/\*、application/octet-stream）
- 请仅下载你有权访问和保存的内容

## 技术栈

- **后端**：Node.js + Express + undici（HTTP 客户端）
- **前端**：原生 HTML/CSS/JavaScript（无框架）
- **模块系统**：ES Modules（type: "module"）

## 免责声明

本项目仅供学习交流使用，请勿用于任何商业或非法用途。

- 本工具仅支持下载公开可访问的资源，用户需确保有权访问和保存相关内容
- 使用本工具下载的内容版权归原作者或发布者所有，请勿侵犯他人知识产权
- 使用本工具所产生的一切后果由用户自行承担，与本项目开发者无关
- 请遵守当地法律法规，在合法合规的前提下使用本工具

**请勿将本工具用于：**
- 下载受版权保护但未授权的内容
- 侵犯他人隐私或知识产权
- 任何违法违规活动
