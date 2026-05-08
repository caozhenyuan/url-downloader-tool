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

## 项目结构

```
url-downloader-tool/
├── server/
│   ├── index.js           # Express 服务入口
│   └── lib/
│       ├── extractUrl.js  # URL 提取模块
│       ├── isAllowedMedia.js  # 媒体类型白名单
│       ├── resolveUrl.js  # URL 解析与重定向跟踪
│       └── douyin.js     # 抖音视频解析模块
├── web/
│   ├── index.html         # 前端页面
│   ├── main.js           # 前端交互逻辑
│   └── style.css         # 样式
└── package.json
```

## 技术实现原理

### 1. URL 提取 (`server/lib/extractUrl.js`)

从用户粘贴的任意文本中提取有效的 http/https URL：

- 使用正则表达式 `/https?:\/\/[^\s<>"']+/gi` 匹配候选链接
- 智能去除包裹字符（括号、引号、书名号等）
- 去除末尾标点符号（逗号、句号、感叹号等）
- 验证 URL 合法性后返回第一个有效链接

### 2. URL 解析与重定向跟踪 (`server/lib/resolveUrl.js`)

解析用户输入的 URL，获取最终资源地址和元信息：

- **安全校验**：拒绝内网 IP（10.x、127.x、172.16-31.x、192.168.x）和 localhost
- **重定向跟踪**：最多跟随 5 次 301/302/303/307/308 重定向
- **元信息提取**：从 Content-Type 和 Content-Disposition 头获取文件类型和名称
- **降级策略**：HEAD 请求失败时回退到 GET 请求

### 3. 媒体类型白名单 (`server/lib/isAllowedMedia.js`)

只允许以下媒体类型进入下载流程：

- `video/*`（视频）
- `audio/*`（音频）
- `image/*`（图片）
- `application/octet-stream`（二进制流）

### 4. 抖音视频解析 (`server/lib/douyin.js`)

专门处理抖音分享链接，实现无水印视频下载：

**流程：**

1. **识别抖音链接**：匹配 v.douyin.com、www.douyin.com 等域名
2. **解析分享链接**：跟随重定向提取视频 ID（从 URL 路径或 modal_id 参数）
3. **获取视频数据**：请求 iesdouyin.com 分享页面，解析 `window._ROUTER_DATA` JSON 数据
4. **提取播放地址**：从 `videoInfoRes.item_list[0].video.play_addr` 获取视频 URL
5. **去水印处理**：将 URL 中的 `playwm` 替换为 `play`，获取无水印版本
6. **高清备选**：使用 `aweme.snssdk.com/aweme/v1/play/?video_id=xxx&radio=1080p` 作为高清备选地址

**特殊处理：**

- 抖音 CDN 需要携带 `Referer: https://www.douyin.com/` 头
- 可能存在二次重定向（snssdk.com → douyinvod.com）
- 支持图文类型视频（aweme_type === 68）

### 5. 下载代理 (`server/index.js` `/api/download`)

服务端代理下载，解决跨域和 Referer 验证问题：

- 使用 `undici` 高性能 HTTP 客户端流式传输
- 设置正确的 Content-Type 和 Content-Disposition 响应头
- 支持进度显示（通过 Content-Length 头）
- 普通链接和抖音 CDN 链接分别处理

### 6. 前端交互 (`web/main.js`)

- 使用 Fetch API 调用后端接口
- 使用 Streams API 读取响应体实现进度显示
- 通过 Blob URL 触发浏览器下载

## API 接口

### `POST /api/parse`

解析 URL 并返回元信息。

**请求：**
```json
{
  "input": "用户粘贴的文本内容"
}
```

**响应：**
```json
{
  "rawUrl": "提取的原始链接",
  "finalUrl": "重定向后的最终链接",
  "contentType": "内容类型",
  "fileName": "建议文件名",
  "downloadable": true,
  "platform": "douyin",  // 可选，抖音平台标识
  "videoInfo": {         // 可选，抖音视频信息
    "title": "视频标题",
    "author": "作者昵称",
    "cover": "封面图 URL",
    "duration": 60
  }
}
```

### `GET /api/download`

下载指定 URL 的资源。

**参数：**
- `url`：要下载的 URL（必须）
- `fileName`：建议文件名（可选）

**响应：** 直接返回文件流

### `GET /health`

健康检查接口。

## 技术栈

- **后端**：Node.js + Express + undici（HTTP 客户端）
- **前端**：原生 HTML/CSS/JavaScript（无框架）
- **模块系统**：ES Modules（type: "module"）

## 安全措施

1. **SSRF 防护**：禁止访问内网 IP 和 localhost
2. **协议限制**：只允许 http/https 协议
3. **媒体限制**：只下载媒体类型资源
4. **请求超时**：设置合理的超时时间防止资源耗尽
5. **重定向限制**：最多 5 次重定向防止无限循环
