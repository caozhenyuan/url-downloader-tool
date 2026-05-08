import express from 'express';
import cors from 'cors';
import { pipeline } from 'node:stream/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from 'undici';
import { extractUrl } from './lib/extractUrl.js';
import { isAllowedMedia } from './lib/isAllowedMedia.js';
import { resolveUrl, validateDownloadUrl } from './lib/resolveUrl.js';
import { isDouyinUrl, isDouyinCdnUrl, getDouyinDownloadHeaders, parseDouyinVideo } from './lib/douyin.js';

// Resolve web directory:
// - pkg bundled: process.pkg is set, look next to executable
// - entry.cjs sets process.env.__WEB_DIR__ to the resolved web path
// - ESM development: use import.meta.url to derive path (not reached in CJS bundle)
const webDir = typeof process.pkg !== 'undefined'
  ? join(dirname(process.execPath), 'web')
  : process.env.__WEB_DIR__ || join(dirname(fileURLToPath(import.meta.url)), '../web');

// Build Content-Disposition header; uses RFC 5987 for non-ASCII filenames
function contentDisposition(fileName) {
  const safe = fileName.replace(/[^\x20-\x7E]/g, '_');
  if (safe === fileName) return `attachment; filename="${fileName}"`;
  return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

const app = express();
const port = process.env.PORT || 10010;

app.use(cors());
app.use(express.json({ limit: '50kb' }));
app.use(express.static(webDir));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/parse', async (req, res) => {
  try {
    const rawUrl = extractUrl(req.body?.input);
    if (!rawUrl) {
      return res.status(400).json({ error: '未找到有效的 http/https 链接。' });
    }

    // Douyin-specific parsing
    if (isDouyinUrl(rawUrl)) {
      const info = await parseDouyinVideo(rawUrl);
      return res.json({
        rawUrl,
        finalUrl: info.playUrl,
        contentType: 'video/mp4',
        fileName: info.fileName,
        downloadable: !!info.playUrl,
        platform: 'douyin',
        videoInfo: {
          title: info.title,
          author: info.author,
          cover: info.cover,
          duration: info.duration,
          isImagePost: info.isImagePost,
          images: info.images,
        },
      });
    }

    const metadata = await resolveUrl(rawUrl);
    const downloadable = metadata.statusCode >= 200
      && metadata.statusCode < 300
      && isAllowedMedia(metadata.contentType);

    return res.json({
      rawUrl,
      finalUrl: metadata.finalUrl,
      contentType: metadata.contentType,
      fileName: metadata.fileName,
      downloadable
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || '解析失败。' });
  }
});

app.get('/api/download', async (req, res) => {
  try {
    const rawUrl = validateDownloadUrl(String(req.query.url || ''));
    const fileName = req.query.fileName ? decodeURIComponent(req.query.fileName) : null;

    // Douyin CDN URLs need Referer header; may 302-redirect to douyinvod.com
    if (isDouyinCdnUrl(rawUrl)) {
      const dlHeaders = getDouyinDownloadHeaders();

      // Step 1: Resolve 302 redirect (snssdk.com → douyinvod.com)
      let downloadUrl = rawUrl;
      const probeResp = await request(rawUrl, {
        method: 'GET',
        headers: dlHeaders,
        headersTimeout: 15000,
        bodyTimeout: 15000,
      });

      if ([301, 302, 303, 307, 308].includes(probeResp.statusCode)) {
        const location = probeResp.headers.location;
        // Drain body safely
        probeResp.body.on('error', () => {});
        probeResp.body.resume();
        if (location) downloadUrl = location;
      } else if (probeResp.statusCode >= 200 && probeResp.statusCode < 300) {
        // Not a redirect — stream directly from this response
        const finalName = fileName || 'douyin_video.mp4';
        res.setHeader('Content-Type', probeResp.headers['content-type'] || 'video/mp4');
        res.setHeader('Content-Disposition', contentDisposition(finalName));
        const cl = probeResp.headers['content-length'];
        if (cl) res.setHeader('Content-Length', cl);
        await pipeline(probeResp.body, res);
        return;
      } else {
        probeResp.body.on('error', () => {});
        probeResp.body.resume();
        return res.status(502).json({ error: `上游返回 ${probeResp.statusCode}` });
      }

      // Step 2: Stream from the resolved CDN URL
      const upstream = await request(downloadUrl, {
        method: 'GET',
        headers: dlHeaders,
        headersTimeout: 15000,
        bodyTimeout: 120000,
      });

      if (upstream.statusCode < 200 || upstream.statusCode >= 300) {
        upstream.body.on('error', () => {});
        upstream.body.resume();
        return res.status(502).json({ error: `CDN 返回 ${upstream.statusCode}` });
      }

      const finalName = fileName || 'douyin_video.mp4';
      res.setHeader('Content-Type', upstream.headers['content-type'] || 'video/mp4');
      res.setHeader('Content-Disposition', contentDisposition(finalName));
      const cl = upstream.headers['content-length'];
      if (cl) res.setHeader('Content-Length', cl);

      await pipeline(upstream.body, res);
      return;
    }

    // Regular URL handling
    const metadata = await resolveUrl(rawUrl);

    if (!isAllowedMedia(metadata.contentType)) {
      return res.status(400).json({ error: '当前链接不是允许下载的公开媒体资源。' });
    }

    const upstream = await request(metadata.finalUrl, {
      method: 'GET',
      headersTimeout: 10000,
      bodyTimeout: 30000
    });

    if (upstream.statusCode < 200 || upstream.statusCode >= 300) {
      upstream.body.destroy();
      return res.status(502).json({ error: '上游资源下载失败。' });
    }

    const contentType = upstream.headers['content-type'] || 'application/octet-stream';
    const contentLength = upstream.headers['content-length'];

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', contentDisposition(metadata.fileName));

    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    await pipeline(upstream.body, res);
  } catch (error) {
    console.error('[download error]', error.message || error);
    if (!res.headersSent) {
      res.status(400).json({ error: error.message || '下载失败。' });
    } else {
      res.destroy(error);
    }
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);

  // Auto-open browser in packaged mode (when running as .exe)
  if (process.pkg) {
    const url = `http://localhost:${port}`;
    console.log(`Opening browser: ${url}`);

    // Windows
    const { exec } = require('node:child_process');
    const platform = process.platform;

    let command;
    if (platform === 'win32') {
      command = `start "" "${url}"`;
    } else if (platform === 'darwin') {
      command = `open "${url}"`;
    } else {
      command = `xdg-open "${url}"`;
    }

    exec(command, (error) => {
      if (error) {
        console.log(`Please open ${url} in your browser manually.`);
      }
    });
  }
});
